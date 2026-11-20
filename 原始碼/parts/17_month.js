/* =====================================================================
   資料月份：匯入一個新月份（Excel，格式同資料1＋資料3），模擬器改用它當「導入前」基準
   - 需要的工作表：每日紀錄、SMT開機與停機、產銷概況；現場概況、損失與客戶可省略（省略時用推算）
   - 存在這台電腦的瀏覽器（localStorage；不能用時改存在這個分頁 window.name），重新載入後生效
   - 01_data.js 讀 CUR；沒有匯入時一切照舊（九月個案資料）
   ===================================================================== */
const MKEY = 'sl_month_v1';
function monthSave(o) {
  const s = JSON.stringify(o);
  try { localStorage.setItem(MKEY, s); return true; } catch (e) { /* file:// 或嵌入頁面可能不允許 */ }
  try { window.name = 'slm:' + s; return true; } catch (e) { return false; }
}
function monthClear() {
  try { localStorage.removeItem(MKEY); } catch (e) { /* 略過 */ }
  try { if (String(window.name).startsWith('slm:')) window.name = ''; } catch (e) { /* 略過 */ }
}

/* ---- 讀 Excel ---- */
const WDS = '日一二三四五六';
function xNum(v) { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,%\s]/g, '')); return isFinite(n) ? n : null; }
function xPct(v) { const n = xNum(v); if (n == null) return null; return (typeof v === 'string' && /%/.test(v)) || n > 1.5 ? n / 100 : n; }
function xStr(v) { if (v == null) return null; const s = String(v).trim(); return s ? s : null; }
function xDate(v) {
  if (v instanceof Date && !isNaN(v)) return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate() };
  if (typeof v === 'number' && v > 30000 && v < 80000) { const t = new Date(Math.round((v - 25569) * 864e5)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
  const x = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/.exec(String(v || '').trim());
  return x ? { y: +x[1], m: +x[2], d: +x[3] } : null;
}
function xHm(v) {   /* 時間欄：Excel 可能存成小數（0.42＝10:05）或 Date，也可能是文字 */
  if (v == null) return null;
  if (typeof v === 'number' && v < 1) { const m = Math.round(v * 1440); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  if (v instanceof Date) return String(v.getHours()).padStart(2, '0') + ':' + String(v.getMinutes()).padStart(2, '0');
  return xStr(v);
}
function sheetRows(wb, name) {
  const key = wb.SheetNames.find(n => n.replace(/\s/g, '') === name.replace(/\s/g, ''));
  return key ? XLSX.utils.sheet_to_json(wb.Sheets[key], { header: 1, raw: true, defval: null }) : null;
}
function colIdx(head, ...names) {
  const h = head.map(x => String(x == null ? '' : x).replace(/\s/g, ''));
  for (const n of names) { const i = h.findIndex(x => x.startsWith(n.replace(/\s/g, ''))); if (i >= 0) return i; }
  return -1;
}
function parseMonthBook(wb, fileName) {
  const errs = [], warns = [];
  const R1 = sheetRows(wb, '每日紀錄'), R2 = sheetRows(wb, 'SMT開機與停機'), R3 = sheetRows(wb, '產銷概況');
  if (!R1) errs.push('找不到工作表「每日紀錄」');
  if (!R2) errs.push('找不到工作表「SMT開機與停機」');
  if (!R3) errs.push('找不到工作表「產銷概況」（要有接單與準時交貨率，逐日資料推不出來）');
  if (errs.length) return { errs, warns };

  /* 每日紀錄 */
  const h1 = R1[0], c = {
    date: colIdx(h1, '日期'), w: colIdx(h1, '星期'), ship: colIdx(h1, '出貨'), ot: colIdx(h1, '加班'), co: colIdx(h1, 'SMT換線', '換線'),
    ret: colIdx(h1, '重測'), note: colIdx(h1, '課長備註'), what: colIdx(h1, '追加單或換零件', '追加單'), cust: colIdx(h1, '客戶'),
    how: colIdx(h1, '怎麼通知'), notice: colIdx(h1, '通知時間'), known: colIdx(h1, '現場知道'), res: colIdx(h1, '後來怎樣') };
  ['date', 'ship', 'ot', 'ret'].forEach(k => { if (c[k] < 0) errs.push('「每日紀錄」缺欄位：' + { date: '日期', ship: '出貨（片）', ot: '加班（小時）', ret: '重測（片）' }[k]); });
  const h2 = R2[0], c2 = { date: colIdx(h2, '日期'), open: colIdx(h2, '開機'), run: colIdx(h2, '正常運轉'), co: colIdx(h2, '換線（次', '換線(次'),
    coH: colIdx(h2, '換線停機'), mwH: colIdx(h2, '等料停機'), flH: colIdx(h2, '拋料與故障', '拋料') };
  Object.entries(c2).forEach(([k, i]) => { if (i < 0) errs.push('「SMT開機與停機」缺欄位：' + { date: '日期', open: '開機（小時）', run: '正常運轉（小時）', co: '換線（次）', coH: '換線停機（小時）', mwH: '等料停機（小時）', flH: '拋料與故障停機（小時）' }[k]); });
  const h3 = R3[0], c3 = { ym: colIdx(h3, '月份'), orders: colIdx(h3, '接單'), ev: colIdx(h3, '追加單與換零件', '追加單'), ship: colIdx(h3, '出貨'), otd: colIdx(h3, '準時交貨率', '準時'),
    ot: colIdx(h3, '加班'), rr: colIdx(h3, '重測比率'), cAll: colIdx(h3, '客訴合計'), late: colIdx(h3, '客訴：交期', '客訴:交期', '交期'), qual: colIdx(h3, '客訴：品質', '客訴:品質', '品質') };
  ['orders', 'otd'].forEach(k => { if (c3[k] < 0) errs.push('「產銷概況」缺欄位：' + { orders: '接單（千片）', otd: '準時交貨率' }[k]); });
  if (errs.length) return { errs, warns };

  const smt = {};
  R2.slice(1).forEach(r => { const t = xDate(r[c2.date]); if (!t) return;
    smt[t.y + '-' + t.m + '-' + t.d] = { t, open: xNum(r[c2.open]), run: xNum(r[c2.run]), co: xNum(r[c2.co]), coH: xNum(r[c2.coH]), mwH: xNum(r[c2.mwH]), flH: xNum(r[c2.flH]) }; });
  const days = []; let ym = null;
  R1.slice(1).forEach((r, i) => {
    const t = xDate(r[c.date]); if (!t) return;
    const ship = xNum(r[c.ship]); if (ship == null || ship <= 0) return;      // 休假日
    ym = ym || t;
    if (t.y !== ym.y || t.m !== ym.m) { errs.push('「每日紀錄」第 ' + (i + 2) + ' 列不是同一個月（' + t.y + '/' + t.m + '/' + t.d + '）'); return; }
    const s = smt[t.y + '-' + t.m + '-' + t.d];
    if (!s) { errs.push(t.m + '/' + t.d + ' 在「SMT開機與停機」找不到'); return; }
    if ([s.open, s.run, s.coH, s.mwH, s.flH].some(v => v == null)) { errs.push(t.m + '/' + t.d + ' 的 SMT 停機欄位有空格'); return; }
    const w = xStr(r[c.w]) || WDS[new Date(t.y, t.m - 1, t.d).getDay()];
    const what = c.what >= 0 ? xStr(r[c.what]) : null;
    const d = { d: t.d, w: w.replace(/^週|^星期/, ''), ship, ot: xNum(r[c.ot]) || 0, co: s.co != null ? s.co : (xNum(r[c.co]) || 0), ret: xNum(r[c.ret]) || 0,
      note: c.note >= 0 ? xStr(r[c.note]) : null, open: s.open, run: s.run, coH: s.coH, mwH: s.mwH, flH: s.flH, rush: null };
    if (what) d.rush = { what, cust: xStr(r[c.cust]) || '甲', how: xStr(r[c.how]) || 'LINE', notice: xHm(r[c.notice]) || '沒記錄', known: xHm(r[c.known]) || '沒記錄', result: c.res >= 0 ? xStr(r[c.res]) : null };
    const gap = Math.abs(s.open - (s.run + s.coH + s.mwH + s.flH));
    if (gap > 0.6) warns.push(t.m + '/' + t.d + '：開機 ≠ 運轉＋三種停機（差 ' + gap.toFixed(1) + ' h）');
    days.push(d);
  });
  if (errs.length) return { errs, warns };
  if (days.length < 15) { errs.push('工作日只有 ' + days.length + ' 天，至少要 15 天'); return { errs, warns }; }

  /* 產銷概況：找月份那一列（沒有月份欄就拿第一列資料） */
  const target = ym.y + '/' + String(ym.m).padStart(2, '0');
  const rowM = R3.slice(1).find(r => { const v = xStr(r[c3.ym]); return v && v.replace(/-/g, '/').replace(/\/(\d)$/, '/0$1') === target; })
            || R3.slice(1).find(r => xNum(r[c3.orders]) != null);
  if (!rowM) { errs.push('「產銷概況」沒有 ' + target + ' 的資料列'); return { errs, warns }; }
  const sum = k => days.reduce((a, d) => a + (d[k] || 0), 0);
  const shipT = sum('ship') / 1000, otT = sum('ot'), retT = sum('ret');
  const orders = xNum(rowM[c3.orders]), otd = xPct(rowM[c3.otd]);
  if (orders == null || otd == null) { errs.push('「產銷概況」的接單或準時交貨率是空的'); return { errs, warns }; }
  const evN = days.filter(d => d.rush).length;
  const ev = c3.ev >= 0 && xNum(rowM[c3.ev]) != null ? xNum(rowM[c3.ev]) : evN;
  const late = c3.late >= 0 ? xNum(rowM[c3.late]) : null, qual = c3.qual >= 0 ? xNum(rowM[c3.qual]) : null;
  const rr = c3.rr >= 0 && xNum(rowM[c3.rr]) != null ? xPct(rowM[c3.rr]) : retT / (shipT * 1000);
  if (late == null || qual == null) warns.push('客訴件數沒有填，用十二個月回歸推算');
  const L = late != null ? late : Math.max(0, Math.round(FIT_LATE.a + FIT_LATE.b * (1 - otd)));
  const Q = qual != null ? qual : Math.max(0, Math.round(FIT_QUAL.a + FIT_QUAL.b * rr));
  const shipM = c3.ship >= 0 && xNum(rowM[c3.ship]) != null ? xNum(rowM[c3.ship]) : shipT;
  if (Math.abs(shipM - shipT) > 0.6) warns.push('產銷概況的出貨 ' + shipM + ' 千片和每日加總 ' + shipT.toFixed(1) + ' 千片不一致，用每日加總');
  const sales = [orders, ev, Math.round(shipT * 10) / 10, otd, otT, Math.round(rr * 1000) / 1000, L + Q, L, Q];

  /* 現場概況（可省略） */
  const R4 = sheetRows(wb, '現場概況');
  let eff = null;
  if (R4) { const h4 = R4[0], ie = colIdx(h4, '人工效率'); const r4 = R4.slice(1).find(r => xNum(r[ie]) != null); if (r4) eff = xPct(r4[ie]); }
  if (eff == null) { eff = 0.96; warns.push('沒有人工效率，用九月的 96%'); }
  const open = sum('open'), run = sum('run');
  const floor = [eff, Math.round(open * 10) / 10, Math.round(run * 10) / 10, Math.round(run / open * 100) / 100, sum('co'),
    Math.round(sum('coH') * 10) / 10, Math.round(sum('mwH') * 10) / 10, Math.round(sum('flH') * 10) / 10];

  /* 損失與客戶（可省略；省略時照九月個案單金額按比例推，【我猜的】） */
  const R5 = sheetRows(wb, '損失與客戶');
  const look = lab => { if (!R5) return null; const r = R5.find(x => String(x[0] || '').replace(/\s/g, '').startsWith(lab)); return r ? xNum(r[1]) : null; };
  let pen = null, claim = look('客訴處理'), otcost = look('比四月多出的加班費');
  const pb = look('延遲罰款：乙'), pc = look('延遲罰款：丙');
  if (pb != null || pc != null) pen = (pb || 0) + (pc || 0); else pen = look('延遲罰款');
  const moneyGuess = [];
  if (pen == null) { pen = Math.round(590000 * (1 - otd) / 0.22); moneyGuess.push('罰款'); }
  if (claim == null) { claim = Math.round(250000 * (L + Q) / 14); moneyGuess.push('客訴處理'); }
  if (otcost == null) { otcost = Math.max(0, otT - 1800) * 268; moneyGuess.push('加班費'); }
  if (moneyGuess.length) warns.push(moneyGuess.join('、') + '沒有填，用九月個案單金額按比例推算【我猜的】');

  /* 說明頁：是否為 AI 模擬、抽到的狀況、種子 */
  const R0 = sheetRows(wb, '說明') || [];
  const txt = R0.map(r => (r || []).filter(x => x != null).join(' ')).join('\n');
  const src = /AI模擬|AI 模擬/.test(txt) ? 'ai' : 'import';
  const events = []; let on = false;
  R0.forEach(r => { const s = xStr(r && r[0]); if (!s) { if (on) on = false; return; } if (s === '這個月抽到的狀況') { on = true; return; } if (on && s.startsWith('・')) events.push(s.slice(1)); else if (on) on = false; });
  const seed = (/種子[:：]\s*(\d+)/.exec(txt) || [])[1] || null;
  if (target <= '2026/09') warns.push('這個月份不在九月之後；仍會接在九月後面當基準月');

  return { errs, warns, data: { v: 1, ym: target, year: ym.y, month: ym.m, src, file: fileName, seed, events, sales, floor,
    money: { pen, claim, otcost }, days, at: new Date().toISOString() } };
}

/* ---- 畫面 ---- */
function monthUI() {
  const nav = $('#nav .navr'); if (!nav) return;
  const b = el('button', 'btn sm', CUR ? CM.ym.slice(5) + '月*' : '資料月份');
  b.type = 'button'; b.id = 'monthBtn'; b.title = '換成另一個月的資料（例如 AI 模擬的月份）'; b.setAttribute('aria-haspopup', 'dialog');
  nav.insertBefore(b, nav.firstChild);
  const ov = el('div', 'ovl ovl-c'); ov.id = 'monthOvl'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'monthTtl');
  ov.innerHTML = '<div class="box" style="max-width:560px"><div class="hd"><b id="monthTtl" style="font-size:14px">資料月份</b><span style="flex:1"></span><button type="button" class="btn sm" id="monthX">關閉</button></div>'
    + '<div class="mbody" id="monthBody"></div></div>';
  document.body.appendChild(ov);
  const body = $('#monthBody');
  const now = CUR
    ? '<p>目前的基準月：<b>' + CM.ym + '</b>' + (CM.ai ? '<span class="tag AI模擬" style="margin-left:6px">AI模擬</span>' : '<span class="tag 匯入" style="margin-left:6px">匯入</span>') + '</p>'
      + '<p class="note">檔案：' + (CM.file || '（未記錄）') + (CUR.seed ? '　種子 ' + CUR.seed : '') + '。工作日 ' + CUR.days.length + ' 天、出貨 ' + f1(SEP.s[2]) + ' 千片、準時率 ' + f0(SEP.s[3] * 100) + '%、加班 ' + f0(SEP.s[4]) + ' h、插單 ' + SEP.s[1] + ' 件。</p>'
      + (CUR.events && CUR.events.length ? '<ul class="note mev">' + CUR.events.map(e => '<li>' + e + '</li>').join('') + '</ul>' : '')
    : '<p>目前的基準月：<b>2026/09（個案資料）</b><span class="tag 資料3" style="margin-left:6px">資料3</span></p>';
  body.innerHTML = now
    + '<p class="note">匯入一個月的 Excel 後，「導入前」、月度指標、月效益、單月回放、模擬班表都改用那個月；模型公式仍由個案十二個月擬合。單日重播的 9/17 仍是個案原始資料，下拉選單會多出新月份有插單的日子。</p>'
    + '<p class="note">檔案格式同資料1＋資料3：要有「每日紀錄」「SMT開機與停機」「產銷概況」三張工作表（欄位名稱相同）；「現場概況」「損失與客戶」可省略。AI 模擬月份可用 <code>gen_month.py</code> 產生（放在 原始碼\\月份產生器）。</p>'
    + '<div class="mrow"><label class="btn pri" for="monthFile">選擇 Excel 檔…</label><input type="file" id="monthFile" accept=".xlsx,.xls" hidden>'
    + (CUR ? '<button type="button" class="btn" id="monthReset">回到九月（個案資料）</button>' : '') + '</div>'
    + '<div id="monthMsg" class="mmsg" aria-live="polite"></div>';
  const msg = $('#monthMsg');
  const show = (cls, h) => { msg.className = 'mmsg ' + cls; msg.innerHTML = h; };
  $('#monthFile').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (typeof XLSX === 'undefined') { show('bad', '這個版本沒有內嵌 Excel 讀取元件，無法匯入。'); return; }
    show('', '讀取中…');
    const rd = new FileReader();
    rd.onload = () => {
      let res;
      try { res = parseMonthBook(XLSX.read(new Uint8Array(rd.result), { type: 'array', cellDates: true }), f.name); }
      catch (err) { show('bad', '讀不到這個檔案：' + (err && err.message ? err.message : err)); return; }
      if (res.errs.length) { show('bad', '<b>不能匯入：</b><ul>' + res.errs.slice(0, 8).map(x => '<li>' + x + '</li>').join('') + '</ul>'); return; }
      const D = res.data;
      const summ = D.ym + '：工作日 ' + D.days.length + ' 天、出貨 ' + f1(D.sales[2]) + ' 千片、準時率 ' + f0(D.sales[3] * 100) + '%、加班 ' + f0(D.sales[4]) + ' h、插單 ' + D.sales[1] + ' 件';
      show('ok', '<b>可以匯入</b>：' + summ + '。' + (res.warns.length ? '<ul>' + res.warns.slice(0, 6).map(x => '<li>' + x + '</li>').join('') + '</ul>' : '')
        + '<div class="mrow"><button type="button" class="btn pri" id="monthGo">用這個月重新載入</button></div>');
      $('#monthGo').addEventListener('click', () => {
        if (!monthSave(D)) { show('bad', '這個瀏覽器不允許儲存，無法套用。'); return; }
        location.reload();
      });
    };
    rd.onerror = () => show('bad', '讀不到這個檔案。');
    rd.readAsArrayBuffer(f);
    e.target.value = '';
  });
  const rs = $('#monthReset'); if (rs) rs.addEventListener('click', () => { monthClear(); location.reload(); });
  const close = () => { ov.classList.remove('on'); b.focus(); };
  b.addEventListener('click', () => { ov.classList.add('on'); $('#monthX').focus(); });
  $('#monthX').addEventListener('click', close);
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('on')) close(); });

  if (!CUR) return;
  /* 有匯入時：頁籤名稱與提示條 */
  const tab = q => document.querySelector('#nav .tabs button[data-p="' + q + '"] .tl');
  if (tab('month')) tab('month').textContent = '單月回放：' + CM.name;
  if (tab('history')) tab('history').textContent = '十三個月圖表';
  const bar = el('div', 'mbanner');
  bar.innerHTML = '<span class="tag ' + CM.tag + '">' + CM.tag + '</span> 目前的基準月是 <b>' + CM.ym + '</b>' + (CM.ai ? '（AI 隨機產生，不是企業資料）' : '（匯入的資料）')
    + '：導入前、月效益、單月回放、班表都用這個月；9/17 單日重播仍是個案資料。'
    + '<button type="button" class="btn sm" id="mbOpen">換一個月</button><button type="button" class="btn sm" id="mbReset">回到九月</button>';
  const wrap = document.querySelector('.wrap'); wrap.insertBefore(bar, wrap.firstChild);
  $('#mbOpen').addEventListener('click', () => b.click());
  $('#mbReset').addEventListener('click', () => { monthClear(); location.reload(); });
  b.classList.add('mcur');
  const setT = (id, t) => { const x = document.getElementById(id); if (x) x.textContent = t; };
  setT('mmTtl', '單月回放：' + CUR.year + ' 年 ' + CUR.month + ' 月（' + CUR.days.length + ' 個工作日，' + CM.tag + '）');
  setT('rsTtl', '模擬班表：' + CM.name + '每天各站稼動率（' + CM.tag + '）');
  setT('mmRestart', '⟲ 從 ' + CM.m + '/' + MDAYS[0].d);
  setT('fcNote', '往後三個月假設追加單與換零件每月再多 2 次（' + FC_EV.join('→') + '）【我猜的】；接單維持' + CM.name + '。最後一個實際點是 ' + CM.ym + '（' + CM.tag + '）。');
  setT('stNote', '開機 ' + nf(SEP.f[1], 1) + ' h（' + CM.ym + ' ' + CM.tag + '）假設不變【我猜的：不加班次、不買機台】；停機減少，正常運轉才增加。');
  setT('histKey', '歷史實際（資料1）＋' + CM.ym + '（' + CM.tag + '）');
  document.querySelectorAll('p.note').forEach(p => { if (p.textContent.startsWith('導入前＝2026/09 實際值（資料1）')) p.textContent = p.textContent.replace('導入前＝2026/09 實際值（資料1）', '導入前＝' + CM.ym + ' ' + (CM.ai ? '【AI模擬】資料，不是企業資料' : '匯入的資料')); });
  document.querySelectorAll('h2').forEach(h => { if (/^十二個月歷史/.test(h.textContent)) h.textContent = h.textContent.replace('十二個月歷史', '十二個月歷史＋' + CM.ym + '（' + CM.tag + '）'); });
}
monthUI();
