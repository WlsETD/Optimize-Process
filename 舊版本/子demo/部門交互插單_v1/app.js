/* 昇嶺電子 單一插單入口 Demo — 畫面與流程。引擎在 engine.js。 */
(function () {
  'use strict';
  const E = window.Engine, U = E.util;

  /* ===== AI 解析設定（換模型改這裡，或到「設定」改） =====
     mode: cloud = 先問雲端模型，失敗或逾時退回規則；rule = 只用規則；sim-fail / sim-timeout = 示範退回用 */
  const AI_CONFIG_DEFAULT = { mode: 'cloud', modelTier: 'quick', model: '', timeoutMs: 8000 };

  const SAMPLES = [
    { key: 'full', label: '完整', text: '甲客戶追加 A1 800片，11/20 要出貨，零件有換。', boss: '09:10', hint: '五個欄位原文都有' },
    { key: 'noqty', label: '缺數量', text: '乙那邊要插一張 B2，11/20 要，零件不變', boss: '09:42', hint: '沒寫數量，要追問；補 2,400 片可看到連帶變遲的例子' },
    { key: 'vague', label: '交期模糊', text: '丙的 C3 加 600片，週四要，零件不變', boss: '10:05', hint: '「週四」是這週還是下週？可兩種都選來比較' }
  ];
  const PAGES = [
    { k: 'intake', t: '收單', r: '業務' },
    { k: 'confirm', t: '確認', r: '業務' },
    { k: 'board', t: '生管看板', r: '生管' },
    { k: 'reply', t: '交期回覆', r: '業務' },
    { k: 'metrics', t: '指標', r: '老闆，唯讀' }
  ];
  const STATUS = { draft: '待業務確認', queued: '待生管決定', decided: '生管已決定', replied: '已回覆客戶', done: '已回填結果', returned: '已退回' };
  const SRC = { LINE: 'LINE 轉傳', '電話': '電話', '口頭': '口頭', '正式單': '正式單' };
  const REQ = ['customer', 'model', 'qty', 'due', 'partChange'];

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtN = n => Number(n).toLocaleString('en-US');
  const yen = n => 'NT$ ' + fmtN(Math.round(n));
  const pad4 = n => String(n).padStart(4, '0');
  const clone = o => JSON.parse(JSON.stringify(o));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function fresh() {
    return {
      page: 'intake', P: E.defaults(), queue: E.seedQueue(), orders: [], audit: [],
      oseq: 0, tseq: 0, tick: 0, busy: false,
      ai: Object.assign({}, AI_CONFIG_DEFAULT),
      pending: { entry: 'demo', erp: 'undecided', stations: '', shifts: '' },
      intake: { text: '', source: 'LINE', boss: '', sample: null },
      ui: { confirmId: null, replyId: null, focus: null, follow: {}, adj: {}, reason: {}, replyText: {}, drawer: false, lastEngine: null, auditFilter: 'all', rewording: false }
    };
  }
  let S = fresh();
  let lastPage = null;

  /* ===== 時間與稽核 ===== */
  function nowStamp() {
    const base = U.hourOf(S.P.clock.time) * 60 + S.tick;
    const day = Math.floor(base / 1440), m = base % 1440;
    const date = U.addDays(S.P.clock.date, day), hour = m / 60;
    return { date, hour, label: U.md(date) + ' ' + U.hhmm(hour), hm: U.hhmm(hour) };
  }
  function log(who, action, oid, detail) {
    S.tick++;
    const st = nowStamp();
    S.audit.unshift({ t: st.label, who, action, order: oid || '', detail: detail || '' });
    return st;
  }

  /* ===== 顯示用 ===== */
  function showVal(k, v) {
    if (v == null || v === '') return '—';
    if (k === 'qty') return fmtN(v) + ' 片';
    if (k === 'due') return U.mdw(v);
    if (k === 'partChange') return v ? '要換' : '不換';
    if (k === 'isAdd') return v ? '追加單' : '一般單';
    return String(v);
  }
  function rawHTML(text, spans) {
    const list = (spans || []).filter(s => s && s.span).map(s => ({ s: s.span[0], e: s.span[1], low: s.low })).sort((a, b) => a.s - b.s);
    let out = '', pos = 0;
    for (const sp of list) {
      if (sp.s < pos || sp.e > text.length) continue;
      out += esc(text.slice(pos, sp.s)) + '<mark' + (sp.low ? ' class="low"' : '') + '>' + esc(text.slice(sp.s, sp.e)) + '</mark>';
      pos = sp.e;
    }
    return out + esc(text.slice(pos));
  }
  function rawBlock(o, spans) {
    return '<pre class="raw" aria-label="原文">' + rawHTML(o.raw.text, spans) + '</pre>';
  }
  function rawMeta(o) {
    return '<dl class="kv"><dt>來源管道</dt><dd>' + srcTag(o.raw.source) + '</dd>' +
      '<dt>老闆通知時間</dt><dd>' + (o.raw.bossLabel ? esc(o.raw.bossLabel) : '<span class="sub">未填</span>') + '</dd>' +
      '<dt>業務收到時間</dt><dd>' + esc(o.raw.receivedAt) + '</dd></dl>';
  }
  const srcTag = k => '<span class="src' + (k === 'LINE' ? ' src-line' : '') + '">' + esc(SRC[k]) + '</span>';
  const tag = (c, t) => '<span class="tag ' + c + '">' + t + '</span>';
  const demoTag = o => o.sample ? ' ' + tag('demo', '示意') : '';
  const guessTag = () => tag('guess', '【我猜的】');
  const statusChip = o => '<span class="chip s-' + o.status + '">' + STATUS[o.status] + '</span>';
  const latestCalc = o => o.calcs[o.calcs.length - 1] || null;
  const calcRef = c => c ? c.id + ' r' + c.rev : '';
  const dueOf = o => o.draft.fields.due.value;
  const fval = (o, k) => o.draft.fields[k].value;

  /* ===== 試算 ===== */
  function xOf(o) {
    const f = o.draft.fields;
    return { id: o.id, customer: f.customer.value, model: f.model.value, qty: f.qty.value, due: f.due.value, partChange: !!f.partChange.value };
  }
  function pHash() {
    return U.fnv(JSON.stringify([S.P.guess, S.P.data, S.P.prices, S.P.clock]));
  }
  function runCalc(o, reason) {
    const st = nowStamp();
    const X = xOf(o);
    const result = E.calc(S.queue, X, S.P, { date: st.date, hour: st.hour });
    if (!o.calcId) o.calcId = 'T-' + pad4(++S.tseq);
    const rev = o.calcs.length + 1;
    const c = { id: o.calcId, rev, reason, at: st.label, result, X, P: clone(S.P), phash: pHash(), queueIds: S.queue.map(q => q.id) };
    o.calcs.push(c);
    return c;
  }
  function recalcPending(reason) {
    S.orders.filter(o => o.status === 'queued').forEach(o => {
      const c = runCalc(o, reason);
      const b = c.result.cands[c.result.best];
      log('系統', '重新試算', o.id, calcRef(c) + '（' + reason + '）；建議排在 ' + b.afterId + ' 之後');
      delete S.ui.adj[o.id];
    });
  }
  function curSchedule() {
    const st = nowStamp();
    const cal = E.makeCal(st.date, S.P);
    const nd = U.dow(st.date) === 0 ? U.nextWork(st.date) : st.date;
    const p0 = cal.pos(nd, U.dow(st.date) === 0 ? S.P.guess.dayStart : st.hour);
    return { cal, rows: E.runSeq(S.queue, p0, S.P, cal), p0, st };
  }

  /* ===== AI 解析（模型為主，失敗退回規則） ===== */
  function buildPrompt(text) {
    const st = nowStamp();
    return '你是工廠插單文字的欄位抽取器。只做抽取，不要猜，不要補資料。\n' +
      '今天是 ' + st.date + '（週' + U.WD[U.dow(st.date)] + '）。客戶只有 甲、乙、丙。\n' +
      '原文（三個角括號之間）：\n<<<' + text + '>>>\n\n' +
      '只回傳一個 JSON，不要說明、不要程式碼框。格式：\n' +
      '{"customer":{"value":"甲|乙|丙|null","evidence":"原文片段","confidence":0到1},' +
      '"model":{"value":"機種代碼，如A1","evidence":"","confidence":0},' +
      '"qty":{"value":整數片數或null,"evidence":"","confidence":0},' +
      '"due":{"value":"YYYY-MM-DD或null","evidence":"","confidence":0,"alternatives":["YYYY-MM-DD"]},' +
      '"partChange":{"value":true|false|null,"evidence":"","confidence":0},' +
      '"isAdd":{"value":true|false|null,"evidence":"","confidence":0}}\n' +
      '規則：evidence 必須是原文裡一字不差的片段；原文沒寫就把 value 設 null，不可推測；' +
      '只說星期幾而沒說哪一週時，confidence 不可高於 0.6，並把另一週的日期放進 alternatives。';
  }
  function extractJSON(t) {
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('回傳不是 JSON');
    return JSON.parse(t.slice(a, b + 1));
  }
  async function askModel(prompt, signalMs) {
    const sample = (window.claude && window.claude.use) ? await window.claude.use('sample') : null;
    if (!sample) throw new Error('此環境沒有雲端模型');
    const ac = new AbortController();
    const opts = { signal: ac.signal, cache: false, modelTier: S.ai.modelTier || 'quick' };
    if (S.ai.model) opts.model = S.ai.model;
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => { ac.abort(); rej(new Error('逾時')); }, signalMs); });
    try { return await Promise.race([sample(prompt, opts), timeout]); } finally { clearTimeout(timer); }
  }
  async function parseEngine(text) {
    const ctx = { P: S.P, today: nowStamp().date };
    const rule = E.ruleParse(text, ctx);
    const cfg = S.ai, ms = cfg.timeoutMs || 8000;
    const fallback = why => ({ fields: rule, engine: 'rule', fallback: true, status: '規則解析（雲端模型' + why + '，已退回規則）' });
    if (cfg.mode === 'rule') return { fields: rule, engine: 'rule', fallback: false, status: '規則解析（設定為固定使用規則）' };
    const t0 = performance.now();
    try {
      if (cfg.mode === 'sim-fail') { await sleep(400); throw new Error('模擬呼叫失敗'); }
      if (cfg.mode === 'sim-timeout') { await sleep(ms); throw new Error('逾時'); }
      const res = await askModel(buildPrompt(text), ms);
      const v = E.validateModelOutput(text, extractJSON(res.text || ''), ctx);
      if (!v.fields) throw new Error('格式不符');
      const merged = E.mergeParse(rule, v.fields);
      const sec = ((performance.now() - t0) / 1000).toFixed(1);
      return { fields: merged, engine: 'cloud', fallback: false, issues: v.issues, status: '雲端模型（' + (cfg.model || cfg.modelTier) + '）解析，' + sec + ' 秒，已與規則比對' + (v.issues.length ? '；丟棄 ' + v.issues.length + ' 個沒有出處的值' : '') };
    } catch (e) {
      const m = String(e && (e.message || e.code) || e);
      let why = '呼叫失敗（' + m.slice(0, 24) + '）';
      if (/逾時/.test(m)) why = '超過 ' + (ms / 1000) + ' 秒';
      else if (/沒有雲端模型|not_granted/.test(m)) why = '未啟用';
      else if (/模擬/.test(m)) why = '模擬失敗';
      return fallback(why);
    }
  }

  /* ===== 追問 ===== */
  function lowOf(o, k) {
    const f = o.draft.fields[k];
    if (f.value == null || f.value === '') return 'missing';
    if (f.confirmed) return null;
    if (k === 'model' && !E.TABLES.models.includes(f.value)) return 'low';
    return f.conf < S.P.conf.threshold ? 'low' : null;
  }
  function pendingFields(o) {
    return [...REQ, 'isAdd'].map(k => ({ k, why: lowOf(o, k) })).filter(x => x.why);
  }
  function followups(o) {
    return pendingFields(o).map(({ k, why }) => {
      const f = o.draft.fields[k]; let text = '', chips = [];
      if (k === 'customer') { text = why === 'missing' ? '客戶是哪一家？' : '客戶是「' + f.value + '」嗎？'; chips = Object.keys(E.TABLES.customers).map(c => ({ v: c, l: c })); }
      if (k === 'model') { text = why === 'missing' ? '機種代碼是什麼？' : '機種「' + f.value + '」不在對照表，是哪一個？'; chips = E.TABLES.models.map(c => ({ v: c, l: c })); }
      if (k === 'qty') { text = '數量缺：這張要幾片？請直接填在右邊的數量欄。'; }
      if (k === 'due') {
        if (why === 'missing') text = '客戶要幾號出貨？請在要求交期欄選日期。';
        else { text = '「' + (f.span ? o.raw.text.slice(f.span[0], f.span[1]) : '交期') + '」是哪一天？'; chips = (f.alts || [{ value: f.value, label: U.mdw(f.value) }]).map(a => ({ v: a.value, l: a.label })); }
      }
      if (k === 'partChange') { text = '這張要換零件嗎？原文沒有講。'; chips = [{ v: 'true', l: '要換' }, { v: 'false', l: '不換' }]; }
      if (k === 'isAdd') { text = '這是追加單還是一般單？'; chips = [{ v: 'true', l: '追加單' }, { v: 'false', l: '一般單' }]; }
      return { k, why, text, chips };
    });
  }
  function coerce(k, v) {
    if (v === '' || v == null) return null;
    if (k === 'qty') { const n = parseInt(String(v).replace(/,/g, ''), 10); return n > 0 ? n : null; }
    if (k === 'partChange' || k === 'isAdd') return v === true || v === 'true';
    return v;
  }
  function setField(o, k, raw) {
    const f = o.draft.fields[k]; const v = coerce(k, raw);
    f.value = v; f.confirmed = v != null;
  }
  function changesOf(o) {
    const out = [];
    for (const k of E.FIELD_ORDER) {
      const a = o.parse.fields[k].value, b = o.draft.fields[k].value;
      if (String(a) !== String(b)) out.push({ field: k, from: a, to: b });
    }
    return out;
  }

  /* ===== 動作 ===== */
  function go(p) { S.page = p; render(); window.scrollTo(0, 0); }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 3200);
  }

  async function doParse() {
    const it = S.intake; const text = it.text;
    if (!text.trim() || S.busy) return;
    S.busy = true; render();
    const res = await parseEngine(text);
    S.busy = false;
    const id = 'A-' + pad4(++S.oseq);
    const st = log('業務', '貼上原文', id, '來源 ' + SRC[it.source] + '，' + text.length + ' 字');
    const sample = it.sample && SAMPLES.find(s => s.key === it.sample && s.text === text);
    const o = {
      id, status: 'draft', sample: sample ? sample.label : null,
      raw: Object.freeze({ text, source: it.source, bossLabel: it.boss ? U.md(S.P.clock.date) + ' ' + it.boss : '', bossHM: it.boss || '', receivedAt: st.label }),
      parse: { engine: res.engine, fallback: res.fallback, status: res.status, fields: clone(res.fields) },
      draft: { fields: clone(res.fields) }, calcs: [], decision: null, reply: null, actual: null
    };
    for (const k of E.FIELD_ORDER) o.draft.fields[k].confirmed = false;
    S.orders.unshift(o);
    S.ui.lastEngine = res.status; S.ui.confirmId = id; delete S.ui.follow[id];
    log('AI', '解析欄位', id, res.status);
    S.intake = { text: '', source: it.source, boss: '', sample: null };
    S.page = 'confirm'; render(); window.scrollTo(0, 0);
  }

  function doSubmit(o) {
    if (pendingFields(o).length) return;
    const chg = changesOf(o);
    const st = log('業務', '確認並送出', o.id, chg.length ? '修改欄位：' + chg.map(c => E.FIELD_LABEL[c.field] + ' ' + showVal(c.field, c.from) + ' → ' + showVal(c.field, c.to)).join('；') : '沒有修改欄位');
    o.confirm = { by: '業務', at: st.label, changes: chg };
    o.status = 'queued';
    const c = runCalc(o, '首次試算');
    const b = c.result.cands[c.result.best];
    log('系統', '試算完成', o.id, calcRef(c) + '；建議排在 ' + b.afterId + ' 之後，額外換線 ' + b.extraC + ' 次');
    S.ui.focus = o.id; S.ui.replyId = o.id;
    toast(o.id + ' 已送出，試算 ' + calcRef(c) + ' 完成');
    go('board');
  }

  function doReturn(o) {
    o.status = 'returned';
    log('業務', '退回', o.id, '原文保留，欄位草稿作廢');
    S.page = 'intake'; render(); window.scrollTo(0, 0);
  }

  function decide(o, type) {
    const calc = latestCalc(o), r = calc.result;
    let c;
    if (type === 'adopt') c = r.cands[r.best];
    else {
      const adj = S.ui.adj[o.id] || {};
      c = r.cands.find(x => x.k === adj.k) || r.cands[r.best];
      const reason = (S.ui.reason[o.id] || '').trim();
      if (reason.length < 4) return;
    }
    const reason = type === 'adjust' ? (S.ui.reason[o.id] || '').trim() : '';
    const rk = E.risk(c, r.cal, calc.P);
    const st = log('生管', type === 'adopt' ? '採用 AI 建議' : '調整', o.id,
      '依據 ' + calcRef(calc) + '；排在 ' + c.afterId + ' 之後，' + c.startAt.label + ' 開工' + (type === 'adjust' ? '；原因：' + reason : ''));
    o.decision = {
      type, k: c.k, afterId: c.afterId, reason, by: '生管', at: st.label, calc: calcRef(calc),
      actualSlot: c.startAt.label + ' 開工（' + r.entry.label + ' 排入）',
      est: { extraC: c.extraC, extraH: c.extraH, endDate: c.endAt.date, endLabel: c.endAt.label, lateX: c.lateX, risk: rk.label, startLabel: c.startAt.label }
    };
    o.status = 'decided';
    S.queue = c.seqJobs.map(j => { const n = Object.assign({}, j); delete n.notBefore; delete n.inserted; if (j.id === o.id) n.fromOrder = true; return n; });
    delete S.ui.adj[o.id];
    recalcPending('佇列已變動：' + o.id + ' 已插入');
    S.ui.replyId = o.id; S.ui.focus = o.id;
    toast(o.id + ' 生管已' + (type === 'adopt' ? '採用' : '調整') + '，已寫進稽核紀錄');
    render();
  }

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e) { return false; }
  }
  async function doCopy(o) {
    const calc = latestCalc(o);
    if (!calc) return;
    const d = replyInfo(o);
    const text = S.ui.replyText[o.id] != null ? S.ui.replyText[o.id] : d.draft;
    const ok = await copyText(text);
    const st = log('業務', '複製回覆', o.id, '交期 ' + U.mdw(d.dueDate) + '，對應試算 ' + calcRef(calc) + (ok ? '' : '（瀏覽器擋住複製，需手動選取）'));
    o.reply = { dueDate: d.dueDate, at: st.label, atHM: st.hm, calc: calcRef(calc), text };
    if (o.status === 'queued' || o.status === 'decided') o.status = 'replied';
    toast(ok ? '已複製。回覆紀錄：' + U.mdw(d.dueDate) + '，試算 ' + calcRef(calc) : '瀏覽器不讓程式複製，請在草稿框手動選取複製。回覆紀錄已留下。');
    render();
  }

  function sampleActual(o) {
    const idx = S.orders.filter(x => x.status !== 'returned').indexOf(o);
    const f = [1.17, 0.88, 1.31][((idx % 3) + 3) % 3];
    const est = o.decision ? o.decision.est : { extraH: 0, extraC: 0 };
    const hours = Math.round(est.extraH * f * 100) / 100;
    return { shipDate: o.reply ? o.reply.dueDate : dueOf(o), changeovers: Math.round(hours / S.P.data.changeoverH), hours };
  }
  function saveActual(o, a, isSample) {
    const st = log('業務', '回填實際結果', o.id, '實際出貨 ' + U.mdw(a.shipDate) + '；額外換線 ' + a.changeovers + ' 次 / ' + a.hours + ' h' + (isSample ? '（示意數字）' : ''));
    o.actual = Object.assign({ at: st.label, sample: !!isSample }, a);
    o.status = 'done';
    toast('已回填，指標頁的試算誤差會更新');
    render();
  }

  /* ===== 設定 ===== */
  const GUESS_FIELDS = [
    ['guess.wA', '甲的虛擬權重（%／天）', '範圍 1–1.5，需老闆確認', 'number', { step: 0.05, min: 0, max: 10 }],
    ['guess.maxDelayA', '甲最多延後（天）', '超過就交老闆決定', 'number', { step: 1, min: 0, max: 10 }],
    ['guess.slot1', '固定插單時段 1', '新單只在固定時段排入', 'time'],
    ['guess.slot2', '固定插單時段 2', '留空表示只用一個時段', 'time'],
    ['guess.merge', '同機種合併', '相鄰同機種免一次換線', 'check'],
    ['guess.freezeH', '凍結（小時）', '這段時間內已排好的單不重排', 'number', { step: 1, min: 0, max: 240 }],
    ['guess.partExtra', '換零件額外換線（次）', '', 'number', { step: 1, min: 0, max: 3 }],
    ['guess.nCand', '比較幾個插入位置', '', 'number', { step: 1, min: 2, max: 8 }],
    ['guess.dayStart', '工作日開始（點）', '一天長度由九月資料推算', 'number', { step: 0.5, min: 5, max: 11 }],
    ['guess.lossLow', '罰款「低」上限（NT$）', '示意門檻', 'number', { step: 500, min: 0 }],
    ['guess.lossMid', '罰款「中」上限（NT$）', '示意門檻', 'number', { step: 500, min: 0 }]
  ];
  function getByPath(path) {
    if (path === 'guess.slot1') return S.P.guess.slots[0] || '';
    if (path === 'guess.slot2') return S.P.guess.slots[1] || '';
    const [a, b] = path.split('.'); return S.P[a][b];
  }
  function readDrawer() {
    const val = id => { const el = $('#' + id); return el; };
    const out = { guess: {}, prices: {}, clock: {}, ai: {}, pending: {} };
    GUESS_FIELDS.forEach(f => {
      const el = val('s_' + f[0].replace('.', '_')); if (!el) return;
      const key = f[0].split('.')[1];
      out.guess[key] = f[3] === 'check' ? el.checked : (f[3] === 'number' ? Number(el.value) : el.value);
    });
    E.TABLES.models.forEach(m => { const el = val('s_price_' + m); if (el) out.prices[m] = Number(el.value); });
    out.clock.date = val('s_clock_date').value; out.clock.time = val('s_clock_time').value;
    out.ai.mode = val('s_ai_mode').value; out.ai.modelTier = val('s_ai_tier').value; out.ai.model = val('s_ai_model').value.trim();
    out.pending.entry = val('s_p_entry').value; out.pending.erp = val('s_p_erp').value;
    out.pending.stations = val('s_p_stations').value.trim(); out.pending.shifts = val('s_p_shifts').value.trim();
    return out;
  }
  function applySettings() {
    const n = readDrawer(); const G = S.P.guess; const before = clone(S.P); const beforeAi = clone(S.ai); const beforePend = clone(S.pending);
    const bad = [];
    const slots = [n.guess.slot1, n.guess.slot2].filter(x => /^\d{1,2}:\d{2}$/.test(x || ''));
    if (!slots.length) bad.push('固定插單時段至少要有一個');
    if (!(n.guess.wA >= 0)) bad.push('甲的虛擬權重要是數字');
    if (!(n.guess.lossLow <= n.guess.lossMid)) bad.push('罰款「低」上限不能大於「中」上限');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.clock.date) || !n.clock.time) bad.push('示意時間要填日期和時間');
    if (bad.length) { toast('沒有套用：' + bad.join('；')); return; }
    const changes = [];
    const cmp = (label, a, b, unit) => { if (String(a) !== String(b)) changes.push(label + ' ' + a + ' → ' + b + (unit || '')); };
    cmp('甲虛擬權重', G.wA, n.guess.wA, '%／天'); cmp('甲最多延後', G.maxDelayA, n.guess.maxDelayA, ' 天');
    cmp('固定插單時段', G.slots.join('、'), slots.join('、')); cmp('同機種合併', G.merge ? '開' : '關', n.guess.merge ? '開' : '關');
    cmp('凍結', G.freezeH, n.guess.freezeH, ' 小時'); cmp('換零件額外換線', G.partExtra, n.guess.partExtra, ' 次');
    cmp('比較位置數', G.nCand, n.guess.nCand); cmp('工作日開始', G.dayStart, n.guess.dayStart, ' 點');
    cmp('罰款低上限', G.lossLow, n.guess.lossLow); cmp('罰款中上限', G.lossMid, n.guess.lossMid);
    E.TABLES.models.forEach(m => cmp('單價 ' + m + '（示意）', S.P.prices[m], n.prices[m], ' 元／片'));
    cmp('示意時間', S.P.clock.date + ' ' + S.P.clock.time, n.clock.date + ' ' + n.clock.time);
    cmp('AI 解析模式', S.ai.mode, n.ai.mode); cmp('模型等級', S.ai.modelTier, n.ai.modelTier); cmp('模型名稱', S.ai.model || '（預設）', n.ai.model || '（預設）');
    cmp('入口形式', S.pending.entry, n.pending.entry); cmp('是否接 ERP', S.pending.erp, n.pending.erp);
    cmp('插件站數', S.pending.stations || '（空）', n.pending.stations || '（空）'); cmp('班次', S.pending.shifts || '（空）', n.pending.shifts || '（空）');
    if (!changes.length) { toast('沒有任何變更'); return; }
    Object.assign(G, n.guess, { slots }); delete G.slot1; delete G.slot2;
    Object.assign(S.P.prices, n.prices); S.P.clock = n.clock;
    Object.assign(S.ai, n.ai); Object.assign(S.pending, n.pending);
    changes.forEach(c => log('系統', '設定變更', '', c + '（操作：業務／生管，Demo 不分帳號）'));
    const affects = changes.some(c => !/^(AI|模型|入口|是否接 ERP|插件|班次)/.test(c));
    if (affects) recalcPending('設定變更');
    S.ui.drawer = false;
    toast('已套用 ' + changes.length + ' 項變更並寫入稽核紀錄' + (affects ? '，待決定的單已重新試算' : ''));
    render();
  }
  function resetSettings() {
    const d = E.defaults();
    S.P.guess = d.guess; S.P.prices = d.prices; S.P.clock = d.clock;
    S.ai = Object.assign({}, AI_CONFIG_DEFAULT);
    log('系統', '設定變更', '', '全部【我猜的】參數還原為預設值');
    recalcPending('設定還原');
    S.ui.drawer = false; toast('已還原預設值'); render();
  }

  /* ===== 回覆資訊 ===== */
  function replyInfo(o) {
    const calc = latestCalc(o);
    if (!calc) return { calc: null };
    let est, startLabel;
    if (o.decision) { est = o.decision.est; startLabel = o.decision.est.startLabel; }
    else { const b = calc.result.cands[calc.result.best]; est = { endDate: b.endAt.date, endLabel: b.endAt.label, lateX: b.lateX, extraC: b.extraC, extraH: b.extraH }; startLabel = b.startAt.label; }
    const req = dueOf(o);
    const draft = E.replyDraft(o.draft ? o.draft : o, est.endDate, req);
    return { calc, est, dueDate: est.endDate, req, draft, startLabel, onTime: est.endDate <= req };
  }

  /* ===== 畫面：框架 ===== */
  function counts() {
    const os = S.orders;
    return {
      intake: os.length,
      confirm: os.filter(o => o.status === 'draft').length,
      board: os.filter(o => o.status === 'queued').length,
      reply: os.filter(o => o.status === 'queued' || o.status === 'decided').length,
      metrics: S.audit.length
    };
  }
  function renderChrome() {
    const st = nowStamp(); const c = counts();
    $('#clock').textContent = '示意時間 ' + U.md(st.date) + '（週' + U.WD[U.dow(st.date)] + '）' + st.hm;
    $('#steps').innerHTML = PAGES.map((p, i) =>
      '<button class="step" type="button" data-act="go" data-p="' + p.k + '"' + (S.page === p.k ? ' aria-current="page"' : '') + '>' +
      '<span class="n">' + (i + 1) + '</span><span><span class="t">' + p.t + '</span><span class="r">' + p.r + '</span></span>' +
      '<span class="cnt" aria-label="' + c[p.k] + ' 筆">' + c[p.k] + '</span></button>').join('');
  }

  /* ===== 畫面：收單 ===== */
  function pageIntake() {
    const it = S.intake; const ai = S.ai;
    const eng = ai.mode === 'cloud' ? '雲端模型（小型，' + (ai.model || ai.modelTier) + '）。失敗或超過 ' + (ai.timeoutMs / 1000) + ' 秒，自動退回規則解析，解析後會標示用了哪一種。'
      : ai.mode === 'rule' ? '固定使用規則解析（設定裡可改）。' : ai.mode === 'sim-fail' ? '模擬雲端失敗：用來示範退回規則解析。' : '模擬雲端逾時：會等 ' + (ai.timeoutMs / 1000) + ' 秒後退回規則解析。';
    const entryTxt = { demo: 'Demo 用貼上原文模擬', bot: 'LINE 官方帳號（bot）', manual: '業務個人 LINE，手動貼上' }[S.pending.entry];
    return '<div class="ph"><h1>收單</h1>' + tag('human', '業務') + '</div>' +
      '<p class="lede">老闆用 LINE 轉來的訊息，整段貼在這裡，一行字就夠，不用填表。電話或口頭收到的，照原話打一行。</p>' +
      '<div class="cols c-2-1"><div class="stack">' +
      '<section class="panel"><div class="ptitle">示範原文 ' + tag('demo', '示意') + '<small>三筆都是編的，不是真實客戶。點一筆帶入。</small></div><div class="pb samples">' +
      SAMPLES.map(s => '<button type="button" class="sample" data-act="sample" data-k="' + s.key + '" aria-pressed="' + (it.sample === s.key) + '"><b>' + s.label + '</b><span class="tx">' + esc(s.text) + '</span><span class="h">' + esc(s.hint) + '</span></button>').join('') +
      '</div></section>' +
      '<section class="panel"><div class="ptitle">貼上原文 ' + tag('raw', '原文') + '<small>解析後原文不能再改，會原樣送到生管</small></div><div class="pb stack">' +
      '<div><span class="lb" id="srcLb">來源</span><div class="seg" role="radiogroup" aria-labelledby="srcLb">' +
      Object.keys(SRC).map(k => '<label><input type="radio" name="src" value="' + k + '" data-act-change="src"' + (it.source === k ? ' checked' : '') + '><span>' + SRC[k] + '</span></label>').join('') +
      '</div><p class="hint">' + (it.source === '電話' || it.source === '口頭' ? '只記你打的那一行字，不錄音（錄音是第二階段）。' : it.source === '正式單' ? '正式單 API 是第二階段，Demo 一樣貼上原文。' : '老闆轉傳的訊息，複製貼上就好。') + '</p></div>' +
      '<div class="fgrid"><div><label class="lb" for="bossTime">老闆通知時間（選填）</label><input id="bossTime" type="time" value="' + esc(it.boss) + '"><p class="hint">看 LINE 訊息旁的時間，不確定就留空。</p></div>' +
      '<div><span class="lb">業務收到時間</span><p style="min-height:36px;padding:6px 0">按「解析」時自動記錄</p></div></div>' +
      '<div><label class="lb" for="rawText">原文</label><textarea id="rawText" rows="5" placeholder="把老闆轉傳的那一行貼在這裡">' + esc(it.text) + '</textarea></div>' +
      '<div class="row"><button type="button" class="btn primary" id="btnParse" data-act="parse"' + (!it.text.trim() || S.busy ? ' disabled' : '') + '>' + (S.busy ? '<span class="busy"></span>解析中' : '解析') + '</button>' +
      '<span class="why" id="parseWhy">' + (S.busy ? '等候解析結果，最久 ' + (ai.timeoutMs / 1000) + ' 秒' : (it.text.trim() ? '解析後進入確認頁，欄位由你確認' : '先貼上原文')) + '</span></div>' +
      '<div class="engine">' + tag('ai', 'AI') + ' 解析引擎：' + esc(eng) + (S.ui.lastEngine ? '<br><span class="sub">上一次：' + esc(S.ui.lastEngine) + '</span>' : '') + '</div>' +
      '<p class="sub">入口形式：' + entryTxt + ' ' + tag('guess', '【未定】') + ' 正式版怎麼收，可在「設定」切換預留選項。Demo 沒有連 LINE，也沒有連 ERP。</p>' +
      '</div></section></div>' +
      '<aside class="panel"><div class="ptitle">收單清單<small>' + S.orders.length + ' 筆</small></div>' +
      (S.orders.length ? '<ul class="list">' + S.orders.map(o => '<li><button type="button" class="item" data-act="open" data-id="' + o.id + '"><span class="l1"><b>' + o.id + '</b>' + statusChip(o) + srcTag(o.raw.source) + demoTag(o) + '</span><span class="l2">' + esc(o.raw.text) + '</span></button></li>').join('') + '</ul>'
        : '<div class="pb"><div class="empty">還沒有單。點左邊的示範原文，按「解析」。</div></div>') +
      '</aside></div>';
  }

  /* ===== 畫面：確認 ===== */
  function fieldInput(o, k) {
    const f = o.draft.fields[k]; const v = f.value; const id = 'f_' + k;
    const lab = ' aria-label="' + E.FIELD_LABEL[k] + '"';
    if (k === 'customer') return '<select id="' + id + '" data-field="' + k + '"' + lab + '><option value="">（空白）</option>' + Object.keys(E.TABLES.customers).map(c => '<option' + (v === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select>';
    if (k === 'model') {
      const opts = E.TABLES.models.slice(); if (v && !opts.includes(v)) opts.push(v);
      return '<select id="' + id + '" data-field="' + k + '"' + lab + '><option value="">（空白）</option>' + opts.map(c => '<option value="' + esc(c) + '"' + (v === c ? ' selected' : '') + '>' + esc(c) + (E.TABLES.models.includes(c) ? '' : '（不在對照表）') + '</option>').join('') + '</select>';
    }
    if (k === 'qty') return '<input id="' + id + '" type="number" min="1" step="1" inputmode="numeric" data-field="' + k + '" value="' + (v == null ? '' : v) + '" placeholder="片數"' + lab + '>';
    if (k === 'due') return '<input id="' + id + '" type="date" data-field="' + k + '" value="' + (v || '') + '"' + lab + '>';
    return '<select id="' + id + '" data-field="' + k + '"' + lab + '><option value="">（空白）</option><option value="true"' + (v === true ? ' selected' : '') + '>' + (k === 'partChange' ? '要換' : '追加單') + '</option><option value="false"' + (v === false ? ' selected' : '') + '>' + (k === 'partChange' ? '不換' : '一般單') + '</option></select>';
  }
  function pageConfirm() {
    let o = S.orders.find(x => x.id === S.ui.confirmId) || S.orders.find(x => x.status === 'draft') || S.orders[0];
    const head = '<div class="ph"><h1>確認</h1>' + tag('human', '業務') + '</div>';
    if (!o) return head + '<p class="lede">左邊看原文，右邊看 AI 拆出來的欄位。低信心的欄位會標紅。</p><div class="empty">還沒有解析的單。到「收單」貼上原文，按「解析」。<br><br><button class="btn" data-act="go" data-p="intake">到收單</button></div>';
    S.ui.confirmId = o.id;
    const draft = o.status === 'draft';
    const spans = E.FIELD_ORDER.map(k => ({ span: o.parse.fields[k].span, low: draft && lowOf(o, k) != null }));
    const pend = pendingFields(o);
    const th = S.P.conf.threshold;
    const rows = E.FIELD_ORDER.map(k => {
      const f = o.draft.fields[k]; const why = draft ? lowOf(o, k) : null;
      const cls = !draft ? 'ok' : why ? 'low' : f.confirmed ? 'done' : 'ok';
      let conf;
      if (!draft) conf = f.confirmed ? tag('human', '業務確認') : '<span class="conf">信心 ' + Math.round(f.conf * 100) + '%</span>';
      else if (f.confirmed) conf = tag('human', '業務已確認');
      else if (f.value == null || f.value === '') conf = '<span class="lowtxt">缺</span>';
      else conf = '<span class="conf"><i><b style="width:' + Math.round(f.conf * 100) + '%"></b></i>信心 ' + Math.round(f.conf * 100) + '%</span>' + (why ? ' <span class="lowtxt">請確認</span>' : '');
      const ev = f.span ? '原文「' + esc(o.raw.text.slice(f.span[0], f.span[1])) + '」' : '';
      const note = (ev ? ev + '；' : '') + esc(f.note || '');
      const val = draft ? fieldInput(o, k) : '<b>' + esc(showVal(k, f.value)) + '</b>';
      const act = draft && why && f.value != null && f.value !== '' ? ' <button type="button" class="btn sm" data-act="keep" data-f="' + k + '">沿用此值</button>' : '';
      return '<tr class="frow ' + cls + '"><th scope="row"><label for="f_' + k + '">' + E.FIELD_LABEL[k] + '</label></th><td class="fval">' + val + act + '</td><td>' + conf + '</td><td class="fnote">' + note + '</td></tr>';
    }).join('');
    const fu = followups(o); const showFu = S.ui.follow[o.id];
    const why = pend.length ? '還有 ' + pend.length + ' 欄要處理：' + pend.map(p => E.FIELD_LABEL[p.k] + (p.why === 'missing' ? '（缺）' : '（信心低或不在對照表）')).join('、') : '';
    return head +
      '<p class="lede">左邊是原文，右邊是 AI 拆出來的欄位草稿。低信心的欄位標紅，要你確認或補齊才能送出。</p>' +
      '<div class="row" style="margin-bottom:14px"><b>' + o.id + '</b>' + statusChip(o) + demoTag(o) + '<span class="sp"></span>' +
      (S.orders.filter(x => x.status === 'draft').length > 1 ? '<label class="sub" for="pickConfirm">切換：</label><select id="pickConfirm" data-act-change="pickConfirm" style="width:auto">' + S.orders.filter(x => x.status !== 'returned').map(x => '<option value="' + x.id + '"' + (x.id === o.id ? ' selected' : '') + '>' + x.id + '　' + STATUS[x.status] + '</option>').join('') + '</select>' : '') + '</div>' +
      '<div class="engine' + (o.parse.fallback ? ' fallback' : '') + '" style="margin-bottom:16px">' + tag('ai', 'AI') + ' 這張的解析：<b>' + esc(o.parse.engine === 'cloud' ? '雲端模型' : '規則解析') + '</b>。' + esc(o.parse.status) + '</div>' +
      '<div class="cols c-1-1">' +
      '<section class="panel"><div class="ptitle">原文（唯讀） ' + tag('raw', '原文') + '<small>下方底線是 AI 取值的位置</small></div><div class="pb">' + rawBlock(o, spans) + rawMeta(o) + '</div></section>' +
      '<div class="stack"><section class="panel"><div class="ptitle">欄位草稿 ' + tag('ai', 'AI') + (draft ? '<small>信心低於 ' + Math.round(th * 100) + '% 標紅</small>' : '<small>已送出，唯讀</small>') + '</div>' +
      '<div class="pb" style="padding:4px 8px"><table class="fields"><tbody>' + rows + '</tbody></table></div></section>' +
      (draft && showFu ? '<section class="ai-block"><div class="ptitle">追問 ' + tag('ai', 'AI') + '<small>點選答案會直接填進欄位並標為已確認</small></div><div class="pb">' +
        (fu.length ? '<ol class="fu">' + fu.map(q => '<li>' + esc(q.text) + (q.chips.length ? '<div class="chips">' + q.chips.map(c => '<button type="button" class="chip-btn" data-act="pick" data-f="' + q.k + '" data-v="' + esc(c.v) + '">' + esc(c.l) + '</button>').join('') + '</div>' : '') + '</li>').join('') + '</ol>' : '沒有要追問的欄位。') +
        '</div></section>' : '') +
      (draft ? '<div class="row"><button type="button" class="btn" data-act="ask">追問</button><button type="button" class="btn primary" data-act="submit"' + (pend.length ? ' disabled' : '') + '>送出</button><button type="button" class="btn link" data-act="return">退回</button></div>' +
        '<p class="why' + (pend.length ? ' warn' : '') + '">' + (pend.length ? esc(why) : '欄位都確認了。送出後系統會試算並送到生管看板。') + '</p>'
        : '<div class="human-block" style="padding:10px 14px">' + tag('human', '業務確認') + ' ' + esc(o.confirm ? o.confirm.at : '') + '　' + (o.confirm && o.confirm.changes.length ? '修改欄位：' + o.confirm.changes.map(c => E.FIELD_LABEL[c.field]).join('、') : '沒有修改欄位') + '<br><button type="button" class="btn sm" style="margin-top:8px" data-act="go" data-p="board">到生管看板</button></div>') +
      '</div></div>';
  }

  /* ===== 畫面：時間軸 ===== */
  function timeline(rows, cal, hlId, title) {
    const Hd = cal.Hday; const maxEnd = Math.max(...rows.map(r => r.end), Hd);
    const nd = Math.min(7, Math.max(2, Math.ceil(maxEnd / Hd - 1e-9)));
    const L = cal.L, ds = cal.ds; const slots = cal.slotHours();
    const pct = h => ((h - ds) / L * 100);
    let html = '<div class="tl"><div class="scale"><span></span><div>' + [ds, ds + 2, ds + 4, ds + 6, ds + 8].filter(h => h <= ds + L + 0.01).map(h => '<span style="left:' + pct(h) + '%">' + U.hhmm(h) + '</span>').join('') + '</div></div>';
    for (let d = 0; d < nd; d++) {
      const date = U.addWork(cal.base, d);
      let blocks = '';
      rows.forEach(r => {
        const a = Math.max(r.start, d * Hd), b = Math.min(r.end, (d + 1) * Hd);
        if (b - a < 1e-6) return;
        const left = (a - d * Hd) / Hd * 100, w = (b - a) / Hd * 100;
        const j = r.job; const lab = j.customer + j.model + ' ' + fmtN(j.qty);
        const cls = 'blk' + (j.id === hlId ? ' x' : '') + (r.late > 0 ? ' late' : '') + (j.running ? ' run' : '');
        blocks += '<div class="' + cls + '" style="left:' + left.toFixed(2) + '%;width:' + w.toFixed(2) + '%" title="' + esc(j.id + ' ' + lab + '；' + cal.at(r.start).label + ' → ' + cal.atEnd(r.end).label + (r.late ? '；預計晚 ' + r.late + ' 天' : '')) + '">' + (w > 7 ? esc(lab) : '') + '</div>';
      });
      const ticks = slots.map(h => '<div class="tick" style="left:' + pct(h) + '%"></div>').join('');
      html += '<div class="day"><div class="dl">' + U.md(date) + '<br>週' + U.WD[U.dow(date)] + '</div><div class="track">' + ticks + blocks + '</div></div>';
    }
    html += '<div class="tl-leg"><span><i></i>已排的單</span><span><i class="x"></i>這張單</span><span><i class="late"></i>預計晚交</span><span>虛線：固定插單時段 ' + slots.map(U.hhmm).join('、') + '</span></div></div>';
    return html;
  }

  /* ===== 畫面：生管看板 ===== */
  function paramLines(P) {
    const G = P.guess;
    return '<ul class="params"><li>SMT 產能 ' + P.data.rate + ' 片／小時 ' + tag('data', '個案資料') + '</li>' +
      '<li>換線 ' + P.data.changeoverH.toFixed(2) + ' 小時／次（機台紀錄） ' + tag('data', '個案資料') + '；現行排程固定抓 ' + P.data.sched05 + ' 小時／線／天，實際約 ' + P.data.actualPerLineDay + '，所以這裡不用 ' + P.data.sched05 + '</li>' +
      '<li>罰款：乙 2%／天、丙 1%／天（個案合約）；甲沒有合約罰款，用虛擬權重 ' + G.wA + '%／天 ' + guessTag() + '</li>' +
      '<li>甲最多延後 ' + G.maxDelayA + ' 天 ' + guessTag() + '；固定插單時段 ' + G.slots.join('、') + ' ' + guessTag() + '；凍結 ' + G.freezeH + ' 小時 ' + guessTag() + '；同機種合併 ' + (G.merge ? '開' : '關') + ' ' + guessTag() + '</li>' +
      '<li>單價為示意（' + E.TABLES.models.map(m => m + ' ' + P.prices[m] + ' 元／片').join('、') + '），金額只用來排序，不是報價</li>' +
      '<li>沒有計入插件站數與班次（資料沒有，目前插件站是瓶頸）</li></ul>';
  }
  function candTable(o, calc, selK, selectable) {
    const r = calc.result;
    return '<div class="scroll-x"><table class="cmp"><thead><tr>' + (selectable ? '<th></th>' : '') + '<th>排在這張之後</th><th>預計開工</th><th>預計完成</th><th>額外換線</th><th>本單延誤</th><th>罰款增加</th><th>風險</th></tr></thead><tbody>' +
      r.cands.map((c, i) => { const rk = E.risk(c, r.cal, calc.P);
        return '<tr class="' + (i === r.best ? 'best ' : '') + (selectable && selK === c.k ? 'sel' : '') + '">' +
          (selectable ? '<td><input type="radio" name="cand-' + o.id + '" value="' + c.k + '" data-act-change="cand" data-id="' + o.id + '"' + (selK === c.k ? ' checked' : '') + ' aria-label="排在 ' + c.afterId + ' 之後"></td>' : '') +
          '<td>' + esc(c.afterId + ' ' + c.after.customer + c.after.model) + (i === r.best ? ' ' + tag('ai', '建議') : '') + '</td><td>' + c.startAt.label + '</td><td>' + c.endAt.label + '</td><td>' + c.extraC + ' 次</td><td>' + (c.lateX ? c.lateX + ' 天' : '0') + '</td><td>' + yen(c.deltaLoss) + '</td><td>' + rk.label + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }
  function aiPanel(o, calc) {
    const r = calc.result, c = r.cands[r.best], P = calc.P; const rk = E.risk(c, r.cal, P); const ll = E.lossLevel(c.deltaLoss, P);
    const x = c.x; const runH = o.draft.fields.qty.value / P.data.rate;
    const merge = (() => {
      const m = r.cands.filter(z => z.sameModelAdj);
      if (c.sameModelAdj) return '建議位置與同機種相鄰，已併單。';
      if (m.length) { const z = m.sort((a, b) => a.totalLoss - b.totalLoss)[0]; return '併單位置：排在 ' + z.afterId + ' 之後，可少換線，但罰款增加 ' + yen(z.deltaLoss) + '，建議位置是 ' + yen(c.deltaLoss) + '。'; }
      return '候選位置裡沒有同機種相鄰的位置，沒有併單可做。';
    })();
    const flags = [];
    if (c.resorted) flags.push('後段沒凍結的單裡，會遲的單已依「金額 × 每日罰款率」由高到低重排。');
    if (c.aLate.length) flags.push('甲的單預計晚過 ' + P.guess.maxDelayA + ' 天（上限，【我猜的】），建議交老闆決定。');
    if (c.newLate.length) flags.push('連帶變遲：' + c.newLate.map(n => n.id + ' ' + n.customer + n.model + ' 晚 ' + n.late + ' 天').join('、') + '。');
    const extra = c.cX + (c.cNextNew - c.cNextOld);
    return '<dl style="margin:0">' +
      '<div class="arow"><dt>插入時機</dt><dd><b>排在 ' + esc(c.afterId + ' ' + c.after.customer + c.after.model + ' ' + fmtN(c.after.qty)) + ' 之後</b>，預計 ' + c.startAt.label + ' 開工、' + c.endAt.label + ' 完成。<span class="fm">' + esc(r.entry.label) + ' 的固定時段排入；不拆單，前一張做完才換</span></dd></div>' +
      '<div class="arow"><dt>單量與工時</dt><dd>' + fmtN(x.job.qty) + ' 片，約 ' + (runH + c.cX * P.data.changeoverH).toFixed(2) + ' 小時<span class="fm">' + fmtN(x.job.qty) + ' ÷ ' + P.data.rate + ' = ' + runH.toFixed(2) + ' h；本單換線 ' + c.cX + ' 次 × ' + P.data.changeoverH.toFixed(2) + ' = ' + (c.cX * P.data.changeoverH).toFixed(2) + ' h</span></dd></div>' +
      '<div class="arow"><dt>換線</dt><dd>這次插單多出 <b>' + c.extraC + ' 次</b>（' + c.extraH.toFixed(2) + ' 小時）<span class="fm">本單 ' + c.cX + ' 次；下一張 ' + c.cNextOld + ' → ' + c.cNextNew + ' 次（' + (c.cNextNew - c.cNextOld >= 0 ? '+' : '−') + Math.abs(c.cNextNew - c.cNextOld) + '）；合計 ' + c.cX + (c.cNextNew - c.cNextOld >= 0 ? ' + ' : ' − ') + Math.abs(c.cNextNew - c.cNextOld) + ' = ' + extra + ' 次</span></dd></div>' +
      '<div class="arow"><dt>罰款損失</dt><dd><span class="pill l' + ll.level + '">' + ll.label + '</span> ' + yen(c.deltaLoss) + '（本單 ' + yen(c.lossX) + '，連帶 ' + yen(c.deltaLoss - c.lossX) + '）<span class="fm">每張 = 金額 × 日罰款率 × 晚的天數；' + esc(x.job.customer) + ' 的日罰款率 ' + (x.rate * 100).toFixed(2).replace(/\.?0+$/, '') + '%' + (x.job.customer === '甲' ? '（虛擬，非合約罰款）' : '') + '，本單金額 ' + yen(x.amount) + '（示意單價）</span></dd></div>' +
      '<div class="arow"><dt>準時風險</dt><dd><span class="pill l' + rk.level + '">' + rk.label + '</span> ' + esc(rk.why.join('；')) + '；要求 ' + U.mdw(x.job.due) + '</dd></div>' +
      '<div class="arow"><dt>併單建議</dt><dd>' + esc(merge) + '</dd></div>' +
      (flags.length ? '<div class="arow"><dt>注意</dt><dd>' + flags.map(esc).join('<br>') + '</dd></div>' : '') +
      '</dl>' +
      '<details class="basis"><summary>試算依據：候選位置比較與參數</summary>' + candTable(o, calc, null, false) +
      '<p class="sub fp">輸入指紋 ' + r.fingerprint + '：同樣的排程、參數、單、時間，一定算出同樣結果。試算時間 ' + r.asOf.label + '。</p>' + paramLines(P) + '</details>';
  }
  function ticket(o) {
    const calc = latestCalc(o); const r = calc.result; const focus = S.ui.focus === o.id;
    const spans = [];
    const f = o.draft.fields;
    const chg = k => o.confirm && o.confirm.changes.some(c => c.field === k) ? '<span class="chg">業務改過</span>' : '';
    const fl = E.FIELD_ORDER.map(k => '<tr><th scope="row">' + E.FIELD_LABEL[k] + '</th><td>' + esc(showVal(k, f[k].value)) + chg(k) + '</td></tr>').join('');
    const stale = o.status !== 'queued' && o.decision && o.decision.calc !== calcRef(calc);
    const adj = S.ui.adj[o.id] || {}; const open = !!adj.open;
    const selK = adj.k != null ? adj.k : r.cands[r.best].k;
    const rsn = S.ui.reason[o.id] || '';
    let act;
    if (o.status === 'queued') {
      act = '<div class="t-act"><button type="button" class="btn primary" data-act="adopt" data-id="' + o.id + '">採用</button><button type="button" class="btn" data-act="adjust-open" data-id="' + o.id + '" aria-expanded="' + open + '">調整</button><span class="why">AI 只給建議。採用或調整都會寫進稽核紀錄。</span></div>' +
        (open ? '<div class="adjust"><h4>調整：選別的位置，並寫原因 ' + tag('human', '生管決定') + '</h4>' + candTable(o, calc, selK, true) +
          '<label class="lb" for="rsn-' + o.id + '" style="margin-top:12px">調整原因（必填，至少 4 個字）</label><textarea id="rsn-' + o.id + '" rows="2" data-act-input="reason" data-id="' + o.id + '" placeholder="例：該線明天有治具檢修，先排後面">' + esc(rsn) + '</textarea>' +
          '<div class="row" style="margin-top:10px"><button type="button" class="btn primary" id="save-' + o.id + '" data-act="adjust-save" data-id="' + o.id + '"' + (rsn.trim().length < 4 ? ' disabled' : '') + '>儲存調整</button><button type="button" class="btn link" data-act="adjust-open" data-id="' + o.id + '">取消</button><span class="why" id="why-' + o.id + '">' + (rsn.trim().length < 4 ? '沒填原因不能儲存' : '') + '</span></div></div>' : '');
    } else {
      const d = o.decision;
      act = '<div class="t-act human-block" style="display:block"><div class="row">' + tag('human', '生管決定') + '<b>' + (d.type === 'adopt' ? '採用 AI 建議' : '調整') + '</b><span class="sub">' + esc(d.at) + '，依據 ' + esc(d.calc) + '</span></div>' +
        '<div style="margin-top:4px">實際插入：排在 ' + esc(d.afterId) + ' 之後，' + esc(d.actualSlot) + '</div>' +
        (d.type === 'adjust' ? '<div>調整原因：' + esc(d.reason) + '</div>' : '') +
        (stale ? '<div class="why warn">設定或排程之後有變動，新的試算是 ' + esc(calcRef(calc)) + '，這個決定依據舊版。</div>' : '') +
        '<div style="margin-top:8px"><button type="button" class="btn sm" data-act="goreply" data-id="' + o.id + '">到交期回覆</button></div></div>';
    }
    return '<article class="ticket' + (focus ? ' focus' : '') + '" id="tk-' + o.id + '"><div class="t-head"><b>' + o.id + '</b>' + statusChip(o) + demoTag(o) + '<span class="sub">試算 ' + esc(calcRef(calc)) + (calc.rev > 1 ? '（' + esc(calc.reason) + '）' : '') + '</span><span class="sp"></span><button type="button" class="btn sm" data-act="focus" data-id="' + o.id + '"' + (focus ? ' disabled' : '') + '>' + (focus ? '預覽中' : '看排程預覽') + '</button></div>' +
      '<div class="t-grid"><section class="t-orig"><h4>原單原樣 ' + tag('raw', '原文') + '</h4>' + rawBlock(o, []) + rawMeta(o) +
      '<h4 style="margin-top:14px">確認後的欄位 ' + tag('human', '業務確認') + '</h4><table class="mini"><tbody>' + fl + '<tr><th scope="row">確認</th><td>' + esc(o.confirm.by) + '　' + esc(o.confirm.at) + '</td></tr></tbody></table></section>' +
      '<section class="t-ai"><h4>AI 建議 ' + tag('ai', 'AI') + '<small>只給建議，由生管決定</small></h4>' + aiPanel(o, calc) + '</section></div>' + act + '</article>';
  }
  function pageBoard() {
    const os = S.orders.filter(o => o.calcs.length && o.status !== 'returned');
    const head = '<div class="ph"><h1>生管看板</h1>' + tag('human', '生管') + '</div><p class="lede">每張單的細節原封不動，旁邊附 AI 的數據分析。你採用或調整，調整要寫原因。看板只顯示單與機台，不顯示個人。</p>';
    let fo = S.orders.find(o => o.id === S.ui.focus && o.calcs.length) || os.find(o => o.status === 'queued') || os[0];
    if (fo) S.ui.focus = fo.id;
    let tl;
    if (fo && fo.status === 'queued') {
      const calc = latestCalc(fo), r = calc.result; const adj = S.ui.adj[fo.id] || {};
      const k = adj.k != null ? adj.k : r.cands[r.best].k; const c = r.cands.find(z => z.k === k);
      tl = '<div class="ptitle">排程預覽<small>' + fo.id + ' 排在 ' + c.afterId + ' 之後</small></div>' + timeline(c.rows, r.cal, fo.id, '');
    } else {
      const cs = curSchedule();
      tl = '<div class="ptitle">現行排程 ' + tag('demo', '示意') + '<small>' + (fo ? fo.id + ' 已插入' : '尚無新單') + '</small></div>' + timeline(cs.rows, cs.cal, fo ? fo.id : '', '');
    }
    return head + (os.length ? '<div class="cols c-board"><div>' + os.map(ticket).join('') + '</div><aside class="sticky"><div class="panel">' + tl + '</div><p class="sub" style="margin-top:8px">排程是示意資料，7 張單，用九月的運轉與換線小時換算成每天可排小時。</p></aside></div>'
      : '<div class="empty">還沒有送來的單。業務在「確認」頁按「送出」後，單會出現在這裡。<br><br><button class="btn" data-act="go" data-p="confirm">到確認頁</button></div>' +
        '<div class="panel" style="margin-top:16px">' + tl + '</div>');
  }

  /* ===== 畫面：交期回覆 ===== */
  function pageReply() {
    const head = '<div class="ph"><h1>交期回覆</h1>' + tag('human', '業務') + '</div><p class="lede">依試算結果回覆客戶。沒有試算紀錄，系統不放行「複製回覆」。</p>';
    const os = S.orders.filter(o => o.status !== 'returned');
    if (!os.length) return head + '<div class="empty">還沒有單。先到「收單」貼上原文。</div>';
    let o = os.find(x => x.id === S.ui.replyId) || os[0]; S.ui.replyId = o.id;
    const d = replyInfo(o); const calc = d.calc;
    const list = '<aside class="panel"><div class="ptitle">單據</div><ul class="list">' + os.map(x => '<li><button type="button" class="item" data-act="reply-pick" data-id="' + x.id + '"' + (x.id === o.id ? ' aria-current="true"' : '') + '><span class="l1"><b>' + x.id + '</b>' + statusChip(x) + srcTag(x.raw.source) + '</span><span class="l2">' + esc(x.raw.text) + '</span></button></li>').join('') + '</ul></aside>';
    const stCalc = calc ? '<span class="v good">已完成 ' + esc(calcRef(calc)) + '</span>' : '<span class="v bad">沒有試算</span>';
    const stPl = !o.decision ? '<span class="v mid">待決定</span>' : '<span class="v good">' + (o.decision.type === 'adopt' ? '已採用' : '已調整') + '</span>';
    const stRp = o.reply ? '<span class="v good">已複製 ' + esc(o.reply.at) + '</span>' : '<span class="v">未回覆</span>';
    let body = '';
    if (!calc) {
      body = '<div class="noreply">這張還沒有試算（業務還沒確認送出）。<br>沒有試算，系統不放行，也不產生交期草稿。<br><br><button class="btn" data-act="open" data-id="' + o.id + '">回確認頁</button></div>' +
        '<div class="stack"><button type="button" class="btn" disabled>複製回覆</button><p class="why">沒有試算紀錄，按鈕不能按。</p></div>';
    } else {
      const txt = S.ui.replyText[o.id] != null ? S.ui.replyText[o.id] : d.draft;
      const stale = o.decision && o.decision.calc !== calcRef(calc);
      body = '<div class="cmpdue"><div><div class="a">客戶要求交期</div><div class="b">' + U.mdw(d.req) + '</div></div><div class="ar">→</div><div><div class="a">試算交期（' + (o.decision ? '生管決定' : 'AI 建議') + '）</div><div class="b ' + (d.onTime ? '' : 'lowtxt') + '">' + U.mdw(d.dueDate) + '</div></div></div>' +
        '<p class="sub">' + (d.onTime ? '趕得上。' : '趕不上，晚 ' + U.workdaysBetween(d.req, d.dueDate) + ' 個工作天。') + '預計 ' + d.est.endLabel + ' 完成。不要口頭先答應，以下面草稿為準。</p>' +
        (stale ? '<p class="why warn">生管決定依據 ' + esc(o.decision.calc) + '，現在最新試算是 ' + esc(calcRef(calc)) + '。</p>' : '') +
        (!o.decision ? '<p class="why warn">生管還沒決定。現在的交期是 AI 試算草稿，生管調整後交期可能改變。</p>' : '') +
        '<section class="ai-block"><div class="ptitle">交期草稿 ' + tag('ai', 'AI') + '<small>日期來自試算；AI 只能改措辭</small></div><div class="pb"><label class="sr" for="replyTxt">回覆草稿</label><textarea id="replyTxt" rows="4" data-act-input="replyText" data-id="' + o.id + '">' + esc(txt) + '</textarea>' +
        '<div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-act="reword" data-id="' + o.id + '"' + (S.ui.rewording ? ' disabled' : '') + '>' + (S.ui.rewording ? '<span class="busy"></span>改寫中' : 'AI 改寫措辭') + '</button><button type="button" class="btn link" data-act="reply-reset" data-id="' + o.id + '">還原範本</button><span class="why">改寫後會檢查日期、數量、機種沒被動過</span></div></div></section>' +
        '<div class="row"><button type="button" class="btn primary" data-act="copy" data-id="' + o.id + '">複製回覆</button>' +
        (o.reply ? '<span class="why">回覆紀錄：' + U.mdw(o.reply.dueDate) + '，' + esc(o.reply.at) + '，試算 ' + esc(o.reply.calc) + '</span>' : '<span class="why">按下去會留下回覆紀錄：交期、時間、對應試算編號。</span>') + '</div>';
      if (o.reply) {
        const a = o.actual;
        body += '<section class="panel"><div class="ptitle">回填實際結果<small>事後填，用來算試算誤差</small>' + (a && a.sample ? tag('demo', '示意數字') : '') + '</div><div class="pb stack">' +
          '<div class="fgrid" style="grid-template-columns:repeat(3,1fr)"><div><label class="lb" for="a_ship">實際出貨日</label><input id="a_ship" type="date" value="' + (a ? a.shipDate : d.dueDate) + '"></div>' +
          '<div><label class="lb" for="a_c">額外換線（次）</label><input id="a_c" type="number" min="0" step="1" value="' + (a ? a.changeovers : '') + '"></div>' +
          '<div><label class="lb" for="a_h">額外換線（小時）</label><input id="a_h" type="number" min="0" step="0.01" value="' + (a ? a.hours : '') + '"></div></div>' +
          '<div class="row"><button type="button" class="btn" data-act="actual-save" data-id="' + o.id + '">儲存回填</button><button type="button" class="btn" data-act="actual-sample" data-id="' + o.id + '">帶入示意數字</button>' +
          '<span class="why">預估：額外換線 ' + d.est.extraC + ' 次 / ' + d.est.extraH.toFixed(2) + ' h</span></div></div></section>';
      }
    }
    return head + '<div class="cols c-reply">' + list + '<div class="stack"><div class="status3"><div><div class="k">試算</div>' + stCalc + '</div><div><div class="k">生管</div>' + stPl + '</div><div><div class="k">回覆客戶</div>' + stRp + '</div></div>' +
      '<section class="panel"><div class="ptitle">原文（唯讀） ' + tag('raw', '原文') + demoTag(o) + '</div><div class="pb">' + rawBlock(o, []) + rawMeta(o) + '</div></section>' + body + '</div></div>';
  }

  async function reword(o) {
    const d = replyInfo(o); const cur = S.ui.replyText[o.id] != null ? S.ui.replyText[o.id] : d.draft;
    S.ui.rewording = true; render();
    let msg = '';
    try {
      const prompt = '把下面這段給客戶的交期回覆改寫得自然、有禮貌，繁體中文，兩句以內。日期、數量、機種代碼一個字都不能改，也不能加新的日期或承諾。只回傳改寫後的文字。\n\n' + cur;
      const res = await askModel(prompt, S.ai.timeoutMs || 8000);
      const out = String(res.text || '').trim();
      const need = [U.md(d.dueDate), U.md(d.req), fmtN(o.draft.fields.qty.value), o.draft.fields.model.value];
      const dates = (out.match(/\d{1,2}\/\d{1,2}/g) || []);
      const okDates = dates.every(x => x === U.md(d.dueDate) || x === U.md(d.req));
      if (!out || !need.every(n => out.includes(n)) || !okDates) throw new Error('日期、數量或機種被改動');
      S.ui.replyText[o.id] = out; msg = 'AI 已改寫措辭，日期與數量檢查通過';
    } catch (e) {
      const m = String(e && e.message || e);
      msg = /沒有雲端模型|not_granted/.test(m) ? '這個環境沒有雲端模型，保留範本措辭' : /被改動/.test(m) ? '改寫動到了日期或數量，已捨棄，保留原措辭' : '改寫失敗或超過 ' + ((S.ai.timeoutMs || 8000) / 1000) + ' 秒，保留原措辭';
    }
    S.ui.rewording = false; toast(msg); render();
  }

  /* ===== 畫面：指標 ===== */
  function computeMetrics() {
    const os = S.orders.filter(o => o.status !== 'returned');
    const decided = os.filter(o => o.decision), filled = os.filter(o => o.actual), replied = os.filter(o => o.reply);
    const estC = decided.reduce((a, o) => a + o.decision.est.extraC, 0);
    const actC = filled.reduce((a, o) => a + o.actual.changeovers, 0);
    const errs = filled.map(o => { const e = o.decision ? o.decision.est.extraH : 0; return e > 0 ? Math.abs(o.actual.hours - e) / e : null; }).filter(x => x != null);
    const onTime = filled.filter(o => o.actual.shipDate <= dueOf(o)).length;
    const lat = replied.map(o => o.raw.bossHM ? (U.hourOf(o.reply.atHM) - U.hourOf(o.raw.bossHM)) : null).filter(x => x != null);
    return {
      n: os.length, decided: decided.length, adopt: decided.filter(o => o.decision.type === 'adopt').length, adjust: decided.filter(o => o.decision.type === 'adjust').length,
      replied: replied.length, covered: replied.filter(o => o.reply.calc).length, filled: filled.length,
      qty: filled.reduce((a, o) => a + o.draft.fields.qty.value, 0), onTime, estC, actC,
      err: errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : null, lat: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : null
    };
  }
  function pageMetrics() {
    const m = computeMetrics(); const D = S.P.data;
    const kpi = (t, big, small, rows) => '<div class="kpi"><h3>' + t + '</h3><div class="big">' + big + '<small>' + small + '</small></div><dl>' + rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('') + '</dl></div>';
    const none = '—';
    const f = S.ui.auditFilter;
    const au = S.audit.filter(a => f === 'all' || (f === 'decide' && /採用|調整|退回/.test(a.action) && a.who === '生管') || (f === 'setting' && a.action === '設定變更') || (f === 'reply' && /回覆|回填/.test(a.action)) || (f === 'ai' && (a.who === 'AI' || a.who === '系統') && a.action !== '設定變更'));
    return '<div class="ph"><h1>指標</h1>' + tag('raw', '老闆，唯讀') + '</div><p class="lede">這頁只看，不能改。數字來自這次 Demo 內操作過的單，基準與目標來自企業資料與方案文件，試點還沒開始，沒有實測月數字。</p>' +
      '<div class="kpis">' +
      kpi('出貨量', m.filled ? fmtN(m.qty) : none, m.filled ? ' 片（已回填 ' + m.filled + ' 張）' : '回填後出現', [['基準', '114 千片／月（九月）'], ['目標', '≥ 125.4 千片／月'], ['說明', 'Demo 只有幾張單，不能和月值比']]) +
      kpi('準時率', m.filled ? m.onTime + ' / ' + m.filled : none, m.filled ? ' 張準時' : '回填後出現', [['基準', '78%（九月）'], ['目標', '≥ 90%；甲 ≥ 87%'], ['算法', '實際出貨日 ≤ 要求交期']]) +
      kpi('換線次數', m.decided ? '+' + m.estC : none, m.decided ? ' 次（預估，插單多出）' : '生管決定後出現', [['實際回填', m.filled ? '+' + m.actC + ' 次' : none], ['基準', '148 次／月（九月）'], ['目標', '≤ 64 次／月，推斷，需試點驗證']]) +
      kpi('試算誤差', m.err != null ? Math.round(m.err * 100) + '%' : none, m.err != null ? ' 平均，換線時數' : '回填後出現', [['目標', '±20% 內，超過要檢討'], ['現行排程', '抓 ' + D.sched05 + ' h／線／天，實際約 ' + D.actualPerLineDay + '，低估約 ' + Math.round((1 - D.sched05 / D.actualPerLineDay) * 100) + '%'], ['試算用', D.changeoverH.toFixed(2) + ' h × 預估次數']]) +
      '</div>' +
      '<div class="row" style="margin:12px 0 22px;gap:18px"><span class="sub">試算覆蓋率 <b>' + (m.replied ? Math.round(m.covered / m.replied * 100) + '%' : none) + '</b>（回覆過的 ' + m.replied + ' 張，沒有試算不放行）</span><span class="sub">生管採用 <b>' + m.adopt + '</b>、調整 <b>' + m.adjust + '</b></span><span class="sub">老闆通知到回覆 <b>' + (m.lat != null ? m.lat.toFixed(1) + ' 小時' : none) + '</b>（九月非正式通知平均晚約 7 小時才到現場）</span></div>' +
      '<section class="panel"><div class="ptitle">稽核紀錄<small>誰在何時決定了什麼，最新在上</small><span class="sp"></span><label class="sr" for="afilter">篩選</label><select id="afilter" data-act-change="afilter" style="width:auto"><option value="all"' + (f === 'all' ? ' selected' : '') + '>全部</option><option value="decide"' + (f === 'decide' ? ' selected' : '') + '>生管決定</option><option value="reply"' + (f === 'reply' ? ' selected' : '') + '>回覆與回填</option><option value="setting"' + (f === 'setting' ? ' selected' : '') + '>設定變更</option><option value="ai"' + (f === 'ai' ? ' selected' : '') + '>AI／系統</option></select></div>' +
      '<div class="scroll-x" style="max-height:420px;overflow:auto"><table class="audit"><thead><tr><th>時間</th><th>誰</th><th>動作</th><th>單號</th><th>內容</th></tr></thead><tbody>' +
      au.map(a => '<tr><td class="t">' + esc(a.t) + '</td><td class="who">' + (a.who === 'AI' ? tag('ai', 'AI') : a.who === '系統' ? tag('data', '系統') : tag('human', esc(a.who))) + '</td><td>' + esc(a.action) + '</td><td>' + esc(a.order) + '</td><td>' + esc(a.detail) + '</td></tr>').join('') +
      '</tbody></table></div></section>' +
      '<section class="panel" style="margin-top:20px"><div class="ptitle">各單原文（唯讀） ' + tag('raw', '原文') + '<small>原文從收單到這裡都不改</small></div><div class="pb stack">' +
      (S.orders.length ? S.orders.map(o => '<div><div class="row" style="margin-bottom:4px"><b>' + o.id + '</b>' + statusChip(o) + demoTag(o) + srcTag(o.raw.source) + '<span class="sub">收到 ' + esc(o.raw.receivedAt) + '</span></div>' + rawBlock(o, []) + '</div>').join('') : '<div class="empty">還沒有單。</div>') + '</div></section>' +
      '<p class="footnote">本頁和看板只顯示單與機台，不顯示個人績效。</p>';
  }

  /* ===== 畫面：設定 ===== */
  function drawer() {
    const G = S.P.guess;
    const row = f => {
      const [path, nm, sub, type, attr] = f; const id = 's_' + path.replace('.', '_'); const v = getByPath(path);
      const inp = type === 'check' ? '<input id="' + id + '" type="checkbox"' + (v ? ' checked' : '') + '>' : '<input id="' + id + '" type="' + type + '" value="' + esc(v) + '"' + (attr ? Object.entries(attr).map(([k, x]) => ' ' + k + '="' + x + '"').join('') : '') + '>';
      return '<div class="srow guess"><label class="nm" for="' + id + '">' + nm + ' ' + guessTag() + (sub ? '<small>' + sub + '</small>' : '') + '</label>' + inp + '</div>';
    };
    return '<div class="scrim" data-act="close-settings"></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dTitle"><header><h2 id="dTitle">設定</h2><span class="sub">改了會重新試算，並寫進稽核紀錄</span><span class="sp"></span><button type="button" class="btn sm" data-act="close-settings">關閉</button></header><div class="body">' +
      '<div class="sg"><h3>推算用的假設 ' + guessTag() + '</h3><p class="sub">黃底虛線的都是我們猜的，要老闆或試點確認。改了，待生管決定的單會重新試算。</p>' + GUESS_FIELDS.map(row).join('') + '</div>' +
      '<div class="sg"><h3>示意單價 ' + tag('demo', '示意') + '</h3><p class="sub">資料裡沒有單價。金額只用來比較「晚一天損失」，請換成報價。</p><div class="srow"><span class="nm">元／片</span><span></span></div>' +
      E.TABLES.models.map(m => '<div class="srow"><label class="nm" for="s_price_' + m + '">' + m + '</label><input id="s_price_' + m + '" type="number" min="0" step="1" value="' + S.P.prices[m] + '"></div>').join('') + '</div>' +
      '<div class="sg"><h3>示意時間 ' + tag('demo', '示意') + '</h3><p class="sub">試算從這個時間算起。想看「14:30 與 15:30 進來差在哪」，改這裡。每個動作會自動加 1 分鐘。</p><div class="two"><input id="s_clock_date" type="date" value="' + S.P.clock.date + '" aria-label="日期"><input id="s_clock_time" type="time" value="' + S.P.clock.time + '" aria-label="時間"></div></div>' +
      '<div class="sg"><h3>個案資料 ' + tag('data', '資料') + '</h3><p class="sub">來自個案資料，這裡只看不改。</p>' +
      [['SMT 產能', S.P.data.rate + ' 片／小時（12 個月 149.9–150.1）'], ['換線', S.P.data.changeoverH.toFixed(2) + ' 小時／次（機台紀錄）'], ['現行排程抓的換線', S.P.data.sched05 + ' 小時／線／天（實際約 ' + S.P.data.actualPerLineDay + '）'], ['罰款', '乙 2%／天、丙 1%／天、甲無'], ['每天可排小時', S.P.data.poolHoursPerDay.toFixed(2) + ' 小時（九月 (760+133)÷26，4 線合計）']].map(r => '<div class="srow locked"><span class="nm">' + r[0] + '</span><span style="grid-column:1/-1;font-size:13px">' + r[1] + '</span></div>').join('') + '</div>' +
      '<div class="sg"><h3>AI 解析 ' + tag('ai', 'AI') + '</h3><p class="sub">模型走設定檔，可換小型或大型，不微調。失敗或超過 8 秒退回規則解析。</p>' +
      '<div class="srow"><label class="nm" for="s_ai_mode">模式</label><select id="s_ai_mode"><option value="cloud"' + (S.ai.mode === 'cloud' ? ' selected' : '') + '>雲端模型，失敗退回規則</option><option value="rule"' + (S.ai.mode === 'rule' ? ' selected' : '') + '>只用規則</option><option value="sim-fail"' + (S.ai.mode === 'sim-fail' ? ' selected' : '') + '>模擬失敗（示範退回）</option><option value="sim-timeout"' + (S.ai.mode === 'sim-timeout' ? ' selected' : '') + '>模擬逾時（等 8 秒）</option></select></div>' +
      '<div class="srow"><label class="nm" for="s_ai_tier">模型等級</label><select id="s_ai_tier"><option value="quick"' + (S.ai.modelTier === 'quick' ? ' selected' : '') + '>小型（quick）</option><option value="default"' + (S.ai.modelTier === 'default' ? ' selected' : '') + '>一般</option><option value="complex"' + (S.ai.modelTier === 'complex' ? ' selected' : '') + '>大型</option></select></div>' +
      '<div class="srow"><label class="nm" for="s_ai_model">指定模型名稱<small>留空用等級預設</small></label><input id="s_ai_model" type="text" value="' + esc(S.ai.model) + '"></div></div>' +
      '<div class="sg"><h3>還沒定的事 ' + tag('guess', '【未定】') + '</h3><p class="sub">先留位置，不影響這版試算。</p>' +
      '<div class="srow"><label class="nm" for="s_p_entry">入口形式</label><select id="s_p_entry"><option value="demo"' + (S.pending.entry === 'demo' ? ' selected' : '') + '>Demo：貼上原文</option><option value="bot"' + (S.pending.entry === 'bot' ? ' selected' : '') + '>LINE 官方帳號（bot）</option><option value="manual"' + (S.pending.entry === 'manual' ? ' selected' : '') + '>業務個人 LINE，手動貼上</option></select></div>' +
      '<div class="srow"><label class="nm" for="s_p_erp">是否接 ERP</label><select id="s_p_erp"><option value="undecided"' + (S.pending.erp === 'undecided' ? ' selected' : '') + '>未定</option><option value="yes"' + (S.pending.erp === 'yes' ? ' selected' : '') + '>接</option><option value="no"' + (S.pending.erp === 'no' ? ' selected' : '') + '>不接</option></select></div>' +
      '<div class="srow"><label class="nm" for="s_p_stations">插件站數<small>資料沒有，目前插件站是瓶頸，未納入試算</small></label><input id="s_p_stations" type="text" value="' + esc(S.pending.stations) + '" placeholder="待提供"></div>' +
      '<div class="srow"><label class="nm" for="s_p_shifts">班次<small>未納入試算</small></label><input id="s_p_shifts" type="text" value="' + esc(S.pending.shifts) + '" placeholder="待提供"></div></div>' +
      '</div><footer><button type="button" class="btn primary" data-act="apply-settings">套用並記錄</button><button type="button" class="btn" data-act="reset-settings">還原預設值</button><span class="why">改動會逐項寫進稽核紀錄</span></footer></aside>';
  }

  /* ===== 主繪製 ===== */
  function render() {
    const y = window.scrollY; const same = lastPage === S.page;
    renderChrome();
    const fn = { intake: pageIntake, confirm: pageConfirm, board: pageBoard, reply: pageReply, metrics: pageMetrics }[S.page];
    $('#view').innerHTML = fn();
    $('#drawerHost').innerHTML = S.ui.drawer ? drawer() : '';
    lastPage = S.page;
    if (same) window.scrollTo(0, y);
    if (S.ui.drawer) { const d = $('.drawer'); if (d && !d.contains(document.activeElement)) { const b = $('.drawer .btn'); b && b.focus(); } }
  }

  /* ===== 事件 ===== */
  const curOrder = id => S.orders.find(o => o.id === id);
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const a = b.dataset.act, id = b.dataset.id; const o = id ? curOrder(id) : null;
    if (a === 'go') return go(b.dataset.p);
    if (a === 'sample') {
      const s = SAMPLES.find(x => x.key === b.dataset.k);
      S.intake.text = s.text; S.intake.boss = s.boss; S.intake.sample = s.key; S.intake.source = 'LINE'; return render();
    }
    if (a === 'parse') return doParse();
    if (a === 'open') {
      if (!o) return;
      S.ui.confirmId = o.id; S.ui.focus = o.id; S.ui.replyId = o.id;
      return go(o.status === 'draft' ? 'confirm' : o.status === 'queued' || o.status === 'decided' ? 'board' : o.status === 'returned' ? 'confirm' : 'reply');
    }
    const co = curOrder(S.ui.confirmId);
    if (a === 'ask') { if (co) { S.ui.follow[co.id] = true; render(); } return; }
    if (a === 'keep') { if (co) { co.draft.fields[b.dataset.f].confirmed = true; render(); } return; }
    if (a === 'pick') { if (co) { setField(co, b.dataset.f, b.dataset.v); render(); } return; }
    if (a === 'submit') return co && doSubmit(co);
    if (a === 'return') return co && doReturn(co);
    if (a === 'focus') { S.ui.focus = id; return render(); }
    if (a === 'adopt') return o && decide(o, 'adopt');
    if (a === 'adjust-open') { const x = S.ui.adj[id] || {}; S.ui.adj[id] = Object.assign(x, { open: !x.open }); S.ui.focus = id; return render(); }
    if (a === 'adjust-save') return o && decide(o, 'adjust');
    if (a === 'goreply') { S.ui.replyId = id; return go('reply'); }
    if (a === 'reply-pick') { S.ui.replyId = id; return render(); }
    if (a === 'reply-reset') { delete S.ui.replyText[id]; return render(); }
    if (a === 'reword') return o && reword(o);
    if (a === 'copy') return o && doCopy(o);
    if (a === 'actual-save') {
      const ship = $('#a_ship').value, c = parseInt($('#a_c').value, 10), h = parseFloat($('#a_h').value);
      if (!ship || isNaN(c) || isNaN(h)) return toast('實際出貨日、換線次數、換線小時都要填');
      return saveActual(o, { shipDate: ship, changeovers: c, hours: h }, false);
    }
    if (a === 'actual-sample') return saveActual(o, sampleActual(o), true);
    if (a === 'open-settings') { S.ui.drawer = true; return render(); }
    if (a === 'close-settings') { S.ui.drawer = false; render(); const bt = $('[data-act="open-settings"]'); bt && bt.focus(); return; }
    if (a === 'apply-settings') return applySettings();
    if (a === 'reset-settings') return resetSettings();
    if (a === 'reset') { if (!S.confirmReset) { S.confirmReset = true; toast('再按一次「重設 Demo」會清掉所有單與紀錄'); setTimeout(() => { S.confirmReset = false; }, 4000); return; } S = fresh(); lastPage = null; render(); toast('已重設'); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.field) { const o = curOrder(S.ui.confirmId); if (o) { setField(o, t.dataset.field, t.value); render(); } return; }
    const a = t.dataset.actChange; if (!a) return;
    if (a === 'src') { S.intake.source = t.value; return render(); }
    if (a === 'pickConfirm') { S.ui.confirmId = t.value; return render(); }
    if (a === 'cand') { const x = S.ui.adj[t.dataset.id] || {}; x.k = parseInt(t.value, 10); S.ui.adj[t.dataset.id] = x; return render(); }
    if (a === 'afilter') { S.ui.auditFilter = t.value; return render(); }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'rawText') {
      S.intake.text = t.value;
      const smp = SAMPLES.find(s => s.key === S.intake.sample); if (smp && smp.text !== t.value) S.intake.sample = null;
      const bt = $('#btnParse'); if (bt) bt.disabled = !t.value.trim() || S.busy;
      const w = $('#parseWhy'); if (w) w.textContent = t.value.trim() ? '解析後進入確認頁，欄位由你確認' : '先貼上原文';
      return;
    }
    if (t.id === 'bossTime') { S.intake.boss = t.value; return; }
    const a = t.dataset.actInput;
    if (a === 'reason') {
      S.ui.reason[t.dataset.id] = t.value;
      const ok = t.value.trim().length >= 4; const sv = $('#save-' + t.dataset.id), w = $('#why-' + t.dataset.id);
      if (sv) sv.disabled = !ok; if (w) w.textContent = ok ? '' : '沒填原因不能儲存';
    }
    if (a === 'replyText') S.ui.replyText[t.dataset.id] = t.value;
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.ui.drawer) { S.ui.drawer = false; render(); } });

  window.__demo = { get S() { return S; } };
  render();
})();

