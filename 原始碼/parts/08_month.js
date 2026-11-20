/* =====================================================================
   單月回放：九月 26 個工作日逐日重播（導入前＝資料3 逐日實際；導入後＝逐日推算）
   推算方式（【我猜的】）：月度模型算出四類停機的月比例，套在每天的實際停機上，
   所以插單多的日子，省下的停機也多；月合計一定等於月度面板的「導入後」。
   出貨＝每天實際出貨 × 當天正常運轉的增減比例，再壓到模型的月出貨（人工站上限）。
   這個畫面是日級，不是分鐘級；分鐘級重播在「單日重播」，可切到 12 個有插單／換零件的日子。
   ===================================================================== */
const MDAYS = [{"d": 1, "w": "二", "ship": 5000, "ot": 105, "co": 5, "ret": 280, "note": "正常", "open": 39.8, "run": 33.3, "coH": 4, "mwH": 1, "flH": 1.5, "rush": null}, {"d": 2, "w": "三", "ship": 4850, "ot": 120, "co": 7, "ret": 340, "note": "甲的先做", "open": 41.8, "run": 32.3, "coH": 6, "mwH": 2, "flH": 1.5, "rush": {"what": "追加 400 片（A1）", "cust": "甲", "how": "LINE", "notice": "09:20", "known": "11:40", "result": "乙的 W0903 晚 1 天出貨"}}, {"d": 3, "w": "四", "ship": 4750, "ot": 125, "co": 7, "ret": 340, "note": "2 線一天換線 4 次", "open": 41.7, "run": 31.7, "coH": 6, "mwH": 2, "flH": 2, "rush": null}, {"d": 4, "w": "五", "ship": 5050, "ot": 110, "co": 7, "ret": 340, "note": "舊料退庫", "open": 43.2, "run": 33.7, "coH": 6, "mwH": 2, "flH": 1.5, "rush": {"what": "換零件（C2）", "cust": "丙", "how": "正式單", "notice": "14:00", "known": "14:30", "result": null}}, {"d": 5, "w": "六", "ship": 2325, "ot": 245, "co": 2, "ret": 160, "note": "加班趕乙的", "open": 19, "run": 15.5, "coH": 2, "mwH": 0.5, "flH": 1, "rush": null}, {"d": 7, "w": "一", "ship": 5000, "ot": 105, "co": 5, "ret": 280, "note": null, "open": 40.8, "run": 33.3, "coH": 4.5, "mwH": 1, "flH": 2, "rush": null}, {"d": 8, "w": "二", "ship": 4750, "ot": 125, "co": 7, "ret": 340, "note": "老闆說先做", "open": 41.7, "run": 31.7, "coH": 6, "mwH": 2.5, "flH": 1.5, "rush": {"what": "追加 300 片（A2）", "cust": "甲", "how": "口頭", "notice": "沒記錄", "known": "10:15", "result": "丙的 W0906 晚 2 天"}}, {"d": 9, "w": "三", "ship": 4900, "ot": 115, "co": 5, "ret": 280, "note": "夾具不夠", "open": 40.2, "run": 32.7, "coH": 4.5, "mwH": 1, "flH": 2, "rush": null}, {"d": 10, "w": "四", "ship": 4450, "ot": 130, "co": 6, "ret": 310, "note": "等料", "open": 40.7, "run": 29.7, "coH": 5.5, "mwH": 4, "flH": 1.5, "rush": {"what": "追加 200 片（C1）", "cust": "丙", "how": "LINE", "notice": "16:05", "known": "隔天 08:00", "result": null}}, {"d": 11, "w": "五", "ship": 4200, "ot": 135, "co": 5, "ret": 280, "note": "C1 等料，停線 3 小時", "open": 40.5, "run": 28, "coH": 4.5, "mwH": 6, "flH": 2, "rush": null}, {"d": 12, "w": "六", "ship": 2225, "ot": 255, "co": 2, "ret": 160, "note": "加班補 C1", "open": 18.8, "run": 14.8, "coH": 2, "mwH": 1, "flH": 1, "rush": null}, {"d": 14, "w": "一", "ship": 4650, "ot": 120, "co": 8, "ret": 370, "note": "舊料已貼 120 片", "open": 43, "run": 31, "coH": 7, "mwH": 3, "flH": 2, "rush": {"what": "換零件（C2）", "cust": "丙", "how": "LINE", "notice": "10:30", "known": "15:00", "result": "120 片拆掉重做"}}, {"d": 15, "w": "二", "ship": 4900, "ot": 115, "co": 5, "ret": 280, "note": "換線後首件不良，重測", "open": 41.2, "run": 32.7, "coH": 4.5, "mwH": 1.5, "flH": 2.5, "rush": null}, {"d": 16, "w": "三", "ship": 4700, "ot": 125, "co": 7, "ret": 340, "note": "夾具借走了", "open": 41.8, "run": 31.3, "coH": 6, "mwH": 2.5, "flH": 2, "rush": {"what": "追加 500 片（A1）", "cust": "甲", "how": "電話", "notice": "13:10", "known": "15:50", "result": "乙的 W0914 晚 1 天"}}, {"d": 17, "w": "四", "ship": 4100, "ot": 135, "co": 9, "ret": 640, "note": "客戶甲的先做。SMT 3 線：等料，丙的 W0915（C2）停 4 小時。測試：機台怪怪的，重測", "open": 47.3, "run": 27.3, "coH": 8.5, "mwH": 9, "flH": 2.5, "rush": {"what": "追加 800 片（A1）", "cust": "甲", "how": "LINE", "notice": "09:10", "known": "10:20", "result": null}}, {"d": 18, "w": "五", "ship": 4850, "ot": 120, "co": 6, "ret": 310, "note": "（隔天補寫）1 線拋料停機", "open": 45.3, "run": 32.3, "coH": 5.5, "mwH": 1.5, "flH": 6, "rush": null}, {"d": 19, "w": "六", "ship": 2175, "ot": 265, "co": 3, "ret": 190, "note": "加班", "open": 19, "run": 14.5, "coH": 2.5, "mwH": 1, "flH": 1, "rush": null}, {"d": 21, "w": "一", "ship": 4800, "ot": 115, "co": 8, "ret": 370, "note": "換線", "open": 43.5, "run": 32, "coH": 7, "mwH": 3, "flH": 1.5, "rush": {"what": "換零件（C2）", "cust": "丙", "how": "正式單", "notice": "11:00", "known": "11:20", "result": "換線 1.5 小時"}}, {"d": 22, "w": "二", "ship": 5050, "ot": 110, "co": 5, "ret": 280, "note": "照排", "open": 40.2, "run": 33.7, "coH": 4, "mwH": 1, "flH": 1.5, "rush": {"what": "追加 300 片（B2）", "cust": "乙", "how": "正式單", "notice": "09:00", "known": "09:30", "result": "準時"}}, {"d": 23, "w": "三", "ship": 4900, "ot": 120, "co": 5, "ret": 290, "note": "乙退回 10 片重測", "open": 40.7, "run": 32.7, "coH": 4.5, "mwH": 1.5, "flH": 2, "rush": null}, {"d": 24, "w": "四", "ship": 4650, "ot": 130, "co": 8, "ret": 370, "note": "SMT 排滿，乙的往後", "open": 43.5, "run": 31, "coH": 7, "mwH": 3.5, "flH": 2, "rush": {"what": "追加 600 片（A2）", "cust": "甲", "how": "口頭", "notice": "沒記錄", "known": "13:40", "result": "乙的 W0920 晚 2 天"}}, {"d": 25, "w": "五", "ship": 4950, "ot": 125, "co": 5, "ret": 280, "note": null, "open": 41, "run": 33, "coH": 4.5, "mwH": 1.5, "flH": 2, "rush": null}, {"d": 26, "w": "六", "ship": 2275, "ot": 275, "co": 2, "ret": 160, "note": "加班趕乙的", "open": 18.7, "run": 15.2, "coH": 2, "mwH": 0.5, "flH": 1, "rush": null}, {"d": 28, "w": "一", "ship": 4800, "ot": 120, "co": 7, "ret": 340, "note": null, "open": 43, "run": 32, "coH": 6.5, "mwH": 3, "flH": 1.5, "rush": {"what": "換零件（C1）", "cust": "丙", "how": "LINE", "notice": "15:30", "known": "隔天 08:30", "result": null}}, {"d": 29, "w": "二", "ship": 4750, "ot": 125, "co": 5, "ret": 280, "note": "舊料 200 片拆掉", "open": 41.2, "run": 31.7, "coH": 4.5, "mwH": 3, "flH": 2, "rush": null}, {"d": 30, "w": "三", "ship": 4950, "ot": 130, "co": 7, "ret": 340, "note": "換線等飛達", "open": 45.5, "run": 33, "coH": 8, "mwH": 3.5, "flH": 1, "rush": {"what": "追加 400 片（A1）", "cust": "甲", "how": "LINE", "notice": "10:00", "known": "14:20", "result": null}}];
/* 匯入月份：MDAYS 換成那個月的逐日資料；九月原始逐日另存 MDAYS_SEP（單日重播 9/17 等仍用它）。
   單日重播的日子代號：九月＝日（17）；匯入月份＝1000＋日，避免和 9/17 撞號。 */
const MDAYS_SEP = MDAYS.slice();
if (CUR) MDAYS.splice(0, MDAYS.length, ...CUR.days.map(d => Object.assign({}, d)));
const DOFF = CUR ? 1000 : 0;
function mdayOf(n) { return n >= 1000 ? MDAYS.find(x => x.d === n - 1000) : MDAYS_SEP.find(x => x.d === n); }
function dLabel(n) { return n >= 1000 ? CM.m + '/' + (n - 1000) : '9/' + n; }
function dateOf(n) { return n >= 1000 ? CM.ym.replace('/', '-') + '-' + String(n - 1000).padStart(2, '0') : '2026-09-' + String(n).padStart(2, '0'); }
const MM = { i:0, playing:false, speed:1, acc:0, plan:null, lastTs:0 };
const MM_DOW = { '一':'週一','二':'週二','三':'週三','四':'週四','五':'週五','六':'週六' };
const mmSum = (arr, k, to) => { let s = 0; for (let i = 0; i <= to; i++) s += arr[i][k]; return s; };

function mmBuild() {
  const sc = scenario(S.ids, S.strength), g = k => sc.rows.find(r => r.k === k);
  const sB = k => MDAYS.reduce((a, d) => a + d[k], 0);
  const rCo = g('co').after / g('co').before, rCoH = g('coH').after / g('coH').before,
        rMw = g('waitH').after / g('waitH').before, rFl = g('faultH').after / g('faultH').before;
  const A = MDAYS.map(d => {
    const coH = d.coH * rCoH, mwH = d.mwH * rMw, flH = d.flH * rFl;
    const run = Math.max(0, d.open - coH - mwH - flH);
    return { co:d.co * rCo, coH, mwH, flH, run, ship: d.ship * run / d.run };
  });
  const shipTarget = g('ship').after * 1000, raw = A.reduce((a, x) => a + x.ship, 0), fac = shipTarget / raw;
  const retB = g('retest').before * SEP.s[2] * 1000, retA = g('retest').after * shipTarget, rRet = retA / retB;
  A.forEach((x, i) => { x.ship *= fac; x.ret = MDAYS[i].ret * rRet; x.ot = MDAYS[i].ot; });
  const B = MDAYS.map(d => ({ co:d.co, coH:d.coH, mwH:d.mwH, flH:d.flH, run:d.run, ship:d.ship, ret:d.ret, ot:d.ot }));
  MM.plan = { sc, A, B, same: !S.ids.length,
    chk: { ship: A.reduce((a, x) => a + x.ship, 0) / 1000 - g('ship').after, coH: A.reduce((a, x) => a + x.coH, 0) - g('coH').after } };
}
function mmRefresh() { if (!$('#mm')) return; mmBuild(); mmDraw(); }

/* ---------- 圖表 ---------- */
const MM_COL = () => ({ b: css('--series-2'), a: css('--series-3'), ink: css('--ink-2'), grid: css('--line'), now: css('--accent-soft'), warn: css('--warn'), accent: css('--accent') });
function mmIdx(cv, e, padL, padR, n) {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, w = r.width - padL - padR;
  return Math.max(0, Math.min(n - 1, Math.round((x - padL) / w * (n - 1))));
}
function mmCum(cv) {
  const { ctx, w:W, h:H } = fitCanvas(cv), C = MM_COL(), P = MM.plan, n = MDAYS.length;
  const L = 50, R = 96, T = 16, Bt = 28, pw = W - L - R, ph = H - T - Bt, YM = 130000;
  const X = i => L + pw * i / (n - 1), Y = v => T + ph * (1 - v / YM);
  ctx.clearRect(0, 0, W, H); ctx.font = '12px "Noto Sans TC",sans-serif'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = C.grid; ctx.fillStyle = C.ink; ctx.lineWidth = 1; ctx.textAlign = 'right';
  for (let v = 0; v <= 120000; v += 40000) { ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(W - R, Y(v)); ctx.stroke(); ctx.fillText(String(v / 1000), L - 6, Y(v)); }
  ctx.textAlign = 'left'; ctx.fillText('千片', 4, T - 4);
  ctx.setLineDash([5, 4]); ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.moveTo(L, Y(TARGET.ship * 1000)); ctx.lineTo(W - R, Y(TARGET.ship * 1000)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.fillText('目標 ' + TARGET.ship.toFixed(1), L + 6, Y(TARGET.ship * 1000) - 9);
  ctx.textAlign = 'center'; ctx.fillStyle = C.ink;
  MDAYS.forEach((d, i) => { if (i % 5 === 0 || i === MM.i || i === n - 1) ctx.fillText(d.d, X(i), H - Bt + 14); });
  const cum = arr => { let s = 0; return arr.map(x => (s += x.ship)); };
  const cb = cum(P.B), ca = cum(P.A);
  const line = (arr, col, lab) => {
    ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.globalAlpha = .25; ctx.beginPath(); arr.forEach((v, i) => i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))); ctx.stroke();
    ctx.globalAlpha = 1; ctx.beginPath(); for (let i = 0; i <= MM.i; i++) i ? ctx.lineTo(X(i), Y(arr[i])) : ctx.moveTo(X(i), Y(arr[i])); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(MM.i), Y(arr[MM.i]), 4.5, 0, 7); ctx.fill(); ctx.strokeStyle = css('--panel'); ctx.lineWidth = 2; ctx.stroke();
  };
  line(cb, C.b); line(ca, C.a);
  ctx.textAlign = 'left'; ctx.font = '700 12px "Noto Sans TC",sans-serif';
  let yb = Y(cb[n - 1]), ya = Y(ca[n - 1]); if (Math.abs(ya - yb) < 15) { if (ya <= yb) ya = yb - 15; else yb = ya - 15; }
  ctx.fillStyle = C.b; ctx.fillText('導入前 ' + (cb[n - 1] / 1000).toFixed(1), W - R + 6, yb);
  ctx.fillStyle = C.a; ctx.fillText('導入後 ' + (ca[n - 1] / 1000).toFixed(1), W - R + 6, ya);
  MM.hit1 = { L, R, n };
}
function mmStops(cv) {
  const { ctx, w:W, h:H } = fitCanvas(cv), C = MM_COL(), P = MM.plan, n = MDAYS.length;
  const L = 36, R = 8, T = 16, Bt = 28, pw = W - L - R, ph = H - T - Bt, YM = 22, gw = pw / n, bw = Math.max(4, Math.min(14, gw / 2 - 2));
  const Y = v => T + ph * (1 - v / YM);
  ctx.clearRect(0, 0, W, H); ctx.font = '12px "Noto Sans TC",sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillStyle = C.now; ctx.fillRect(L + gw * MM.i, T, gw, ph);
  ctx.strokeStyle = C.grid; ctx.fillStyle = C.ink; ctx.lineWidth = 1; ctx.textAlign = 'right';
  for (let v = 0; v <= 20; v += 5) { ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(W - R, Y(v)); ctx.stroke(); ctx.fillText(String(v), L - 6, Y(v)); }
  ctx.textAlign = 'left'; ctx.fillText('h', 6, T - 4);
  const seg = (x, arr) => { let y0 = 0; [['coH', ST.co.hex], ['mwH', ST.wait.hex], ['flH', ST.fault.hex]].forEach(([k, col]) => { const v = arr[k]; if (v <= 0) return; ctx.fillStyle = col; ctx.fillRect(x, Y(y0 + v), bw, Math.max(1, Y(y0) - Y(y0 + v) - 1)); y0 += v; }); };
  ctx.textAlign = 'center';
  MDAYS.forEach((d, i) => {
    const cx = L + gw * (i + .5);
    seg(cx - bw - 1, P.B[i]); seg(cx + 1, P.A[i]);
    if (d.rush) { ctx.fillStyle = C.warn; ctx.fillText('▲', cx, T + 6); }
    ctx.fillStyle = C.ink; if (n <= 26 && (gw > 22 || i % 2 === 0 || i === MM.i)) ctx.fillText(d.d, cx, H - Bt + 14);
  });
  MM.hit2 = { L, R, n };
}

/* ---------- 文字區 ---------- */
const mmRow = (name, b, a, dec, lower, unit) => { const d = a - b, good = lower ? d < 0 : d > 0, cls = Math.abs(d) < 0.05 * Math.pow(10, -dec) * 10 ? '' : (good ? 'good' : 'bad');
  const f = v => dec === 0 ? f0(v) : v.toFixed(dec);
  return '<tr><td>' + name + '</td><td>' + f(b) + '</td><td>' + f(a) + '</td><td class="d ' + cls + '">' + (Math.abs(d) < 0.5 * Math.pow(10, -dec) ? '±0' : (d > 0 ? '+' : '−') + f(Math.abs(d))) + (unit || '') + '</td></tr>'; };
function mmLag() {
  const m = s => { const x = /^(\d\d):(\d\d)$/.exec(s || ''); return x ? (+x[1]) + (+x[2]) / 60 : null; };
  const rows = [];
  MDAYS.forEach(d => { const r = d.rush; if (!r || (r.how !== 'LINE' && r.how !== '電話')) return; const a = m(r.notice); let b = m(r.known);
    if (a == null) return; if (b == null && /隔天/.test(r.known || '')) { const x = /(\d\d):(\d\d)/.exec(r.known); b = 24 + (+x[1]) + (+x[2]) / 60; }
    if (b != null) rows.push(b - a); });
  return { n: rows.length, avg: rows.reduce((a, b) => a + b, 0) / (rows.length || 1) };
}
function mmNote17(n) {
  const keep = DAY.DATE; setDayProfile(n);
  const P = dayPlan(S.ids, S.strength), prod = Math.round(dayMetrics(P, DAY.H1).prod); setDayProfile(keep);
  return '<li class="note">注意：分鐘級重播用另一種推算（' + dLabel(n) + ' 多停的三項乘係數）：多停 ' + f1(P.extraH) + ' h、SMT 當天產出約 ' + f0(prod) + ' 片；本畫面用月比例，數字不同。兩種都是【我猜的】推算，不是實測。</li></ul>';
}
function mmDay() {
  const i = MM.i, d = MDAYS[i], P = MM.plan, b = P.B[i], a = P.A[i];
  let h = '<h3 style="margin:0 0 2px">' + CM.m + '/' + d.d + '（' + (MM_DOW[d.w] || d.w) + '）</h3>';
  h += '<p class="note" style="margin:0 0 8px">課長備註：' + (d.note ? d.note : '（當天沒有寫）') + '</p>';
  if (d.rush) { const r = d.rush; h += '<div class="mdcard" style="margin-bottom:8px"><h4>當天的插單：' + r.cust + '　' + r.what + '</h4><ul>'
      + '<li>導入前：' + r.how + '通知（' + r.notice + '），現場知道是 ' + r.known + (r.result ? '；後來：' + r.result : '') + '</li>'
      + '<li>導入後：老闆轉入口、業務確認、試算後才回覆；通知到業務約 15 分鐘（示意，【我猜的】）；有試算的交期日</li>'
      + '<li class="note">逐單遲交與否模型沒有預測，只有月準時率（見下方月度指標）</li>' 
      + mmNote17(DOFF + d.d) + '<button type="button" class="btn sm pri" id="mmTo17" data-d="' + (DOFF + d.d) + '" style="margin-top:8px">看 ' + CM.m + '/' + d.d + ' 的分鐘級重播</button>' + '</div>'; }
  h += '<div style="overflow:auto"><table class="mdtbl"><thead><tr><th>這一天</th><th>導入前（' + CM.tag + '）</th><th>導入後（推算）</th><th>差異</th></tr></thead><tbody>'
    + mmRow('出貨（片）', b.ship, a.ship, 0, false) + mmRow('SMT 開機（h）', d.open, d.open, 1, false) + mmRow('正常運轉（h）', b.run, a.run, 1, false)
    + mmRow('換線停機（h）', b.coH, a.coH, 1, true) + mmRow('等料停機（h）', b.mwH, a.mwH, 1, true) + mmRow('拋料與故障（h）', b.flH, a.flH, 1, true)
    + mmRow('換線次數', b.co, a.co, 1, true) + mmRow('重測（片）', b.ret, a.ret, 0, true) + '</tbody></table></div>';
  return h;
}
function mmDraw() {
  if (!MM.plan) return;
  const P = MM.plan, i = MM.i, n = MDAYS.length;
  mmCum($('#mmC1')); mmStops($('#mmC2'));
  const cs = (arr, k) => mmSum(arr, k, i);
  const ob = cs(P.B, 'run') / cs(MDAYS, 'open'), oa = cs(P.A, 'run') / cs(MDAYS, 'open');
  $('#mmCum').innerHTML = '<div style="overflow:auto"><table class="mdtbl"><thead><tr><th>累計到 ' + CM.m + '/' + MDAYS[i].d + '（第 ' + (i + 1) + '／' + n + ' 個工作日）</th><th>導入前</th><th>導入後</th><th>差異</th></tr></thead><tbody>'
    + mmRow('出貨（片）', cs(P.B, 'ship'), cs(P.A, 'ship'), 0, false) + mmRow('SMT 稼動率（%）', ob * 100, oa * 100, 1, false)
    + mmRow('換線次數', cs(P.B, 'co'), cs(P.A, 'co'), 0, true) + mmRow('換線停機（h）', cs(P.B, 'coH'), cs(P.A, 'coH'), 1, true)
    + mmRow('等料停機（h）', cs(P.B, 'mwH'), cs(P.A, 'mwH'), 1, true) + mmRow('拋料與故障（h）', cs(P.B, 'flH'), cs(P.A, 'flH'), 1, true) + '</tbody></table></div>';
  $('#mmDay').innerHTML = mmDay();
  const b17 = $('#mmTo17'); if (b17) b17.onclick = () => { switchDay(+b17.dataset.d); setScope('day'); };
  const sc = $('#mmScrub'); if (sc && document.activeElement !== sc) sc.value = i;
  $('#mmDate').textContent = CM.m + '/' + MDAYS[i].d + '（' + (MM_DOW[MDAYS[i].w] || MDAYS[i].w) + '）';
  const lag = mmLag();
  $('#mmNote').innerHTML = '導入前＝' + (CUR ? CM.ym + (CM.ai ? '【AI模擬】' : '（匯入）') + '逐日資料（共 ' + n + ' 個工作日）' : '資料3 逐日實際（週日休，共 26 個工作日）') + '。導入後＝<b>推算</b>：把月度模型的四類停機比例套在每天的實際停機上【我猜的】，月合計與下方月度面板一致（核對：出貨差 ' + P.chk.ship.toFixed(2) + ' 千片、換線停機差 ' + P.chk.coH.toFixed(2) + ' h）。'
    + (P.same ? '<b>目前沒有勾選任何功能，導入後＝導入前。</b>' : '')
    + '非正式通知（LINE、電話）從通知到現場知道，導入前平均晚約 ' + lag.avg.toFixed(1) + ' h（' + lag.n + ' 筆，' + CM.tag + '）。出貨受人工站（插件）上限約 ' + P.sc.model.now.manCap.toFixed(1) + ' 千片，上限沒有實測。這是日級畫面，分鐘級重播在「單日重播」。';
  $('#mmPlay').textContent = MM.playing ? '❚❚ 暫停' : (MM.i >= n - 1 ? '▶ 再播一次' : '▶ 播放');
}
function mmStep(dt) {
  if (!MM.playing) return;
  MM.acc += dt * MM.speed * 1.4;
  while (MM.acc >= 1) { MM.acc -= 1; if (MM.i < MDAYS.length - 1) MM.i++; else { MM.playing = false; break; } }
  mmDraw();
}

/* ---------- 範圍切換：單日 / 單月 ---------- */
function setScope(s) {
  S.scope = s; document.body.dataset.scope = s; PAGE = s; navSync();
  document.querySelectorAll('.scope button').forEach(b => b.classList.toggle('on', b.dataset.s === s));
  if (s === 'month') { S.playing = false; playBtn(); mmBuild(); MM.i = Math.min(MM.i, MDAYS.length - 1); MM.playing = !REDUCED && MM.i === 0; MM.acc = 0; mmDraw(); }
  else { MM.playing = false; if (F3.ok) resize3D(); render(0); }
}
function mmBind() {
  document.querySelectorAll('.scope button').forEach(b => b.addEventListener('click', () => setScope(b.dataset.s)));
  $('#mmPlay').addEventListener('click', () => { if (MM.playing) MM.playing = false; else { if (MM.i >= MDAYS.length - 1) MM.i = 0; MM.playing = true; } mmDraw(); });
  $('#mmRestart').addEventListener('click', () => { MM.i = 0; MM.acc = 0; MM.playing = true; mmDraw(); });
  $('#mmSpeed').addEventListener('change', e => { MM.speed = +e.target.value; });
  $('#mmScrub').addEventListener('input', e => { MM.i = +e.target.value; MM.playing = false; mmDraw(); });
  [['#mmC1', 'hit1'], ['#mmC2', 'hit2']].forEach(([sel, key]) => {
    const cv = $(sel), pick = e => { const h = MM[key]; if (!h) return; MM.i = mmIdx(cv, e, h.L, h.R, h.n); if (key === 'hit2') { const r = cv.getBoundingClientRect(), gw = (r.width - h.L - h.R) / h.n; MM.i = Math.max(0, Math.min(h.n - 1, Math.floor((e.clientX - r.left - h.L) / gw))); } MM.playing = false; mmDraw(); };
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pick(e); });
    cv.addEventListener('pointermove', e => { if (e.buttons) pick(e); });
  });
  window.addEventListener('resize', () => { if (S.scope === 'month') mmDraw(); });
}
/* ---------- 單日重播：切換日子 ---------- */
function applyDayLabels() {
  $('#scopeDay .tl').textContent = '單日重播：' + DAY.LABEL;
  $('#m-before').textContent = '導入前：' + DAY.LABEL + ' 實際';
  const sel = $('#daysel'); if (sel) sel.value = DAY.DATE;
}
function switchDay(n) {
  if (n === DAY.DATE && S.plan) return;
  if (!setDayProfile(n)) return;
  applyDayLabels(); rebuildDay(false); S.playing = !REDUCED; playBtn(); render(0);
  if (S.scope === 'month') { MM.i = Math.max(0, MDAYS.findIndex(x => x.d === n - DOFF)); mmDraw(); }
}
function daySelInit() {
  const sel = $('#daysel');
  const opt = (v, lab, x) => '<option value="' + v + '">' + lab + '（' + (MM_DOW[x.w] || x.w) + '）' + x.rush.cust + '：' + x.rush.what.replace(/（[A-Z]\d）/, '') + '</option>';
  sel.innerHTML = CUR
    ? opt(17, '9/17', MDAYS_SEP.find(x => x.d === 17)).replace('</option>', '（個案資料）</option>') + MDAYS.filter(x => x.rush).map(x => opt(DOFF + x.d, CM.m + '/' + x.d, x)).join('')
    : MDAYS.filter(x => x.rush).map(x => opt(x.d, '9/' + x.d, x)).join('');
  sel.value = DAY.DATE;
  sel.addEventListener('change', () => switchDay(+sel.value));
}
daySelInit();
mmBind();
