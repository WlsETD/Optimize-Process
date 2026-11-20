/* 生管每天早上匯入排程佇列（Excel 另存 CSV UTF-8）或手動維護。B1 不接 ERP。
   欄位（中英文表頭皆可）：編號 id、客戶 customer、機種 model、數量 qty、交期 due、生產中 running */
import type { Deps } from '../deps.ts';
import { E, type QueueItem } from '../engine/index.ts';
import { audit } from './audit.ts';
import { asActor, type Person } from './people.ts';
import { lockSchedule, recalcQueued } from './calc.ts';

const HEAD: Record<string, keyof QueueItem> = {
  '編號': 'id', 'id': 'id', '單號': 'id', '客戶': 'customer', 'customer': 'customer', '機種': 'model', 'model': 'model',
  '數量': 'qty', 'qty': 'qty', '交期': 'due', 'due': 'due', '生產中': 'running', 'running': 'running',
};

function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function normDate(s: string): string | null {
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (!m) return null;
  const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return isNaN(Date.parse(d)) ? null : d;
}

export function parseQueueCsv(text: string): { ok: true; items: QueueItem[] } | { ok: false; errors: string[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { ok: false, errors: ['至少要有表頭和一列資料'] };
  const head = splitCsvLine(lines[0]).map(h => HEAD[h.toLowerCase()] || HEAD[h]);
  const need: (keyof QueueItem)[] = ['id', 'customer', 'model', 'qty', 'due'];
  const miss = need.filter(k => !head.includes(k));
  if (miss.length) return { ok: false, errors: ['表頭缺少：' + miss.join('、') + '（可用：編號、客戶、機種、數量、交期、生產中）'] };
  const errors: string[] = []; const items: QueueItem[] = []; const seen = new Set<string>();
  lines.slice(1).forEach((l, i) => {
    const row = i + 2; const cells = splitCsvLine(l); const r: Record<string, string> = {};
    head.forEach((k, j) => { if (k) r[k as string] = cells[j] ?? ''; });
    const e: string[] = [];
    const id = r.id; if (!id) e.push('編號空白'); else if (seen.has(id)) e.push('編號重複 ' + id); else seen.add(id);
    if (!E.TABLES.customers[r.customer]) e.push('客戶「' + r.customer + '」不在客戶表');
    const model = String(r.model || '').toUpperCase(); if (!E.TABLES.models.includes(model)) e.push('機種「' + r.model + '」不在機種表');
    const qty = Number(String(r.qty).replace(/,/g, '')); if (!Number.isInteger(qty) || qty <= 0) e.push('數量要是正整數');
    const due = normDate(r.due || ''); if (!due) e.push('交期「' + r.due + '」看不懂（用 2026-11-20）');
    const running = /^(1|y|yes|true|是|v|✓)$/i.test(String(r.running || ''));
    if (e.length) errors.push(`第 ${row} 列：` + e.join('；'));
    else items.push({ id, customer: r.customer, model, qty, due: due!, ...(running ? { running: true } : {}) });
  });
  const firstIdle = items.findIndex(x => !x.running);
  if (firstIdle >= 0 && items.slice(firstIdle).some(x => x.running)) errors.push('「生產中」的單要排在最前面');
  return errors.length ? { ok: false, errors } : { ok: true, items };
}

export async function importQueue(d: Deps, p: Person, csv: string) {
  const r = parseQueueCsv(csv);
  if (!r.ok) return r;
  return d.db.tx(async q => {
    await lockSchedule(q);
    const { rows: [nv] } = await q.query('SELECT max(ver)+1 AS v FROM queue_versions');
    await q.query('INSERT INTO queue_versions(ver, items, source, created_by) VALUES ($1,$2,$3,$4)', [nv.v, JSON.stringify(r.items), 'CSV 匯入', p.name]);
    await audit(q, asActor(p), '匯入佇列', 'q' + nv.v, `${r.items.length} 張單`);
    const n = await recalcQueued(d, q, `佇列已匯入 q${nv.v}`);
    return { ok: true as const, ver: nv.v as number, count: r.items.length, recalced: n };
  });
}
