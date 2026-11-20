/* =====================================================================
   介面：一個時鐘同時驅動 3D、2D、時間軸；功能勾選同時改變月度指標與「導入後」重播
   ===================================================================== */
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const f0 = v => Math.round(v).toLocaleString('en-US');
const f1 = v => (Math.round(v*10)/10).toFixed(1);
const OFFICE = new Set(['ja','jb','jc','boss','ai','sales','plan']);
const S = { mode:'before', t:DAY.H0, playing:!REDUCED, speed:1, auto:true, view:'auto',
  ids:[], strength:1, plan:null, events:[], other:null, metric:'ship', hoverX:null, sc:null };
const SPAN = () => DAY.H1 - DAY.H0;

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600); }
function afterLabel() {
  if (!S.ids.length) return '先勾選功能';
  const n = FEATURES.filter(f => S.ids.indexOf(f.id) >= 0).map(f => f.short);
  return n.length <= 3 ? n.join('＋') : n.slice(0,2).join('＋') + ' 等 ' + n.length + ' 項';
}

/* ---------------- 一天的重播 ---------------- */
function rebuildDay(keepT) {
  const ids = S.mode === 'before' ? [] : S.ids;
  S.plan = dayPlan(ids, S.strength);
  S.events = buildEvents(S.plan);
  S.other = S.mode === 'before' ? dayPlan(S.ids.length ? S.ids : P1_IDS, S.strength) : dayPlan([], 1);
  S.slow = S.events.filter(e => e.from && e.to && e.from !== e.to && OFFICE.has(e.from) && OFFICE.has(e.to)).map(e => [e.t - 0.02, e.t + e.dur + 0.05]);
  if (!keepT) S.t = DAY.H0;
  $('#m-after').textContent = afterLabel();
  $('#h-mode').textContent = S.mode === 'before' ? '導入前：9/17 實際' : '導入後：' + afterLabel();
  $('#h-mode').className = 'm ' + S.mode;
  buildLower();
}
function setMode(m) {
  if (m === 'after' && !S.ids.length) { S.ids = P1_IDS.slice(); onFeatures(); toast('已勾選第一階段：單一插單入口＋交期試算閘門'); }
  S.mode = m; S.playing = !REDUCED; S.auto = S.view === 'auto' || S.auto;
  document.querySelectorAll('.mode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  rebuildDay(false); playBtn();
}
function isSlow(t) { return S.slow.some(w => t >= w[0] && t < w[1]); }
function changedLines(P) { let n = 0; for (let l = 1; l <= LINES; l++) if (P.lines[l].segs.some(g => g.k === 'co')) n++; return n; }

function buildLower() {
  const P = S.plan, sp = SPAN();
  let h = '';
  for (let l = 1; l <= LINES; l++) {
    const segs = P.lines[l].segs, w = P.a1.win[l];
    h += '<div class="lab">' + l + ' 線<small id="tlm' + l + '">' + LINE_BASE[l].join(' ') + '</small></div><div class="track">'
      + segs.map(s => '<div class="sg ' + s.k + '" title="' + (s.tag || '') + ' ' + hhmm(s.a) + '–' + hhmm(s.b) + '" style="left:' + ((s.a-DAY.H0)/sp*100) + '%;width:' + ((s.b-s.a)/sp*100) + '%"></div>').join('')
      + (w ? '<div class="a1w" title="A1 插單" style="left:' + ((w[0]-DAY.H0)/sp*100) + '%;width:' + ((w[1]-w[0])/sp*100) + '%"></div>' : '')
      + '<div class="fut"></div><div class="ph"></div></div>';
  }
  h += '<div></div><div class="axis">' + [8,10,12,14,16,18].map(x => '<span style="left:' + ((x-DAY.H0)/sp*100) + '%">' + String(x).padStart(2,'0') + '</span>').join('')
    + '<span style="left:100%;transform:translateX(-100%)">' + hhmm(DAY.H1) + '</span></div>';
  h += '<div class="note" style="align-self:center">拖曳跳到</div><input class="scrub" id="scrub" type="range" min="' + DAY.H0 + '" max="' + DAY.H1 + '" step="0.01" value="' + S.t + '" aria-label="拖曳時間">';
  $('#tl').innerHTML = h;
  $('#scrub').addEventListener('input', e => { S.t = +e.target.value; render(0); });
  $('#feed').innerHTML = S.events.map(e => '<li class="' + (e.cls || '') + '" data-t="' + e.t + '"><span class="t">' + hhmm(e.t) + '</span><span class="x">'
    + e.cap + (e.src ? '<span class="tag ' + e.src + '">' + e.src + '</span>' : '') + '</span></li>').join('');
  const O = S.other, oName = S.mode === 'before' ? '導入後' : '導入前', cls = S.mode === 'before' ? 'bad' : 'good';
  const oReply = O.isBefore ? '老闆口頭「沒問題」' : (O.replyAt ? hhmm(O.replyAt) + ' 有日期' : '「會盡快」');
  const oFloor = O.isBefore ? '10:20' : hhmm(O.floorKnows);
  $('#kpis').innerHTML =
    '<div class="kpi ' + cls + '"><div class="l">比平日多停的 SMT 時數</div><div class="v" id="k-h">0.0<small>h</small></div><div class="o">' + oName + '全天：' + f1(O.extraH) + ' h（平日 9.1 h）</div></div>' +
    '<div class="kpi ' + cls + '"><div class="l">吃掉的產能（多停 × 150）</div><div class="v" id="k-p">0<small>片</small></div><div class="o">' + oName + '全天：' + f0(O.extraH*RATE) + ' 片</div></div>' +
    '<div class="kpi ' + cls + '"><div class="l">當天 SMT 稼動率</div><div class="v" id="k-u">–</div><div class="o">' + oName + '全天：' + Math.round(O.util*100) + '%（九月平均 76%）</div></div>' +
    '<div class="kpi ' + cls + '"><div class="l">今天 SMT 產出</div><div class="v" id="k-o">0<small>片</small></div><div class="o">' + oName + '全天：' + f0(O.ship) + ' 片（平日 4,820）</div></div>' +
    '<div class="kpi"><div class="l">客戶甲拿到交期</div><div class="v t" id="k-r">–</div><div class="o">' + oName + '：' + oReply + '</div></div>' +
    '<div class="kpi"><div class="l">現場知道插單</div><div class="v t" id="k-f">–</div><div class="o">' + oName + '：' + oFloor + '</div></div>' +
    '<div class="kpi"><div class="l">被插單打斷換線的線</div><div class="v" id="k-l">–</div><div class="o">' + oName + '：' + changedLines(O) + ' 條</div></div>' +
    '<div class="kpi"><div class="l">A1 800 片進度</div><div class="v" id="k-a">0<small>片</small></div><div class="o" id="k-ao"></div></div>';
  $('#daynote').innerHTML = '導入前依資料3 的 9/17：開機 47.3 h、正常運轉 27.3 h、稼動率 58%、換線 9 次 8.5 h、等料 9.0 h、拋料與故障 2.5 h、出貨 4,100 片、重測 640 片；09:10 客戶甲 LINE、10:20 現場才知道；3 線 W0915 等料 4 小時。'
    + '「平日」＝九月沒有追加單、換零件的 10 個平日（停機平均 9.1 h、出貨平均 4,820 片），所以 9/17 多停 10.9 h（換線 +3.8、等料 +7.0、故障 +0.1）；若用九月日平均 9.35 h（含週六）當基準是 10.7 h，專案文件採用這個數。'
    + '各線停在幾點、誰傳給誰的中間時間是<span class="tag 示意">示意</span>。導入後把 9/17 多停的三項乘以所勾選功能的係數（與月度模型同一組），是<span class="tag 我猜的">我猜的</span>推算方式；15:00 插單時段、時段前 1.5 小時齊料也是我們的假設。人工站「人在等板」只是示意：兩條以上 SMT 線同時停時亮起，沒有另外建模。';
}

function renderLower(t) {
  const P = S.plan, sp = SPAN(), x = (t - DAY.H0) / sp * 100;
  document.querySelectorAll('#tl .track').forEach(tr => { tr.querySelector('.fut').style.left = x + '%'; tr.querySelector('.ph').style.left = 'calc(' + x + '% - 1px)'; });
  const sc = $('#scrub'); if (sc && document.activeElement !== sc) sc.value = t;
  for (let l = 1; l <= LINES; l++) { const m = lineModel(P, l, t); $('#tlm' + l).textContent = m.join(' ') + (l === 3 && m[0] === 'C2' ? ' W0915' : ''); }
  const m = dayMetrics(P, t);
  $('#k-h').innerHTML = f1(m.extra) + '<small>h</small>';
  $('#k-p').innerHTML = f0(m.extra * RATE) + '<small>片</small>';
  $('#k-u').textContent = m.util == null ? '–' : Math.round(m.util * 100) + '%';
  $('#k-o').innerHTML = f0(m.prod) + '<small>片</small>';
  $('#k-a').innerHTML = f0(m.a1) + '<small>／800 片</small>';
  $('#k-ao').textContent = P.a1.doneAt != null ? hhmm(P.a1.doneAt) + ' 做完（' + P.a1Lines.join('、') + ' 線分攤）'
    : '今天做 ' + f0(P.a1.done) + ' 片，' + dayLabel(1) + ' 約 ' + hhmm(P.a1.nextDayDoneAt) + ' 做完';
  $('#k-r').textContent = t < DAY.RUSH.msgAt ? '還沒收到單' : P.isBefore || P.verbal
    ? (t >= DAY.RUSH.msgAt + 0.05 ? (P.isBefore || !P.f.intake ? '老闆口頭「沒問題」，沒有日期' : '「會盡快」，沒有日期') : '…')
    : (t >= P.replyAt ? hhmm(P.replyAt) + ' 回覆 ' + dayLabel(P.a1.shipDay) + '12:00 前' : '試算中…');
  $('#k-f').textContent = t < P.floorKnows ? '還不知道' : P.f.gate && !P.isBefore ? hhmm(P.floorKnows) + ' 看板（15:00 換線）' : hhmm(P.floorKnows) + (P.isBefore ? '（晚 70 分）' : '');
  $('#k-l').innerHTML = (t < P.insertAt ? 0 : changedLines(P)) + '<small>條</small>';
  document.querySelectorAll('#feed li').forEach(li => li.classList.toggle('fut', t < +li.dataset.t - 1e-6));
  const c = curEvent(S.events, t), cap = $('#h-cap');
  cap.className = 'hud hud-cap ' + (c.cls || '');
  $('#h-capt').textContent = hhmm(c.t); $('#h-capx').textContent = c.cap;
  const st = $('#h-capsrc'); st.textContent = c.src || ''; st.className = 'tag ' + (c.src || ''); st.hidden = !c.src;
  let b = cap.querySelector('.btn');
  if (t >= DAY.H1 - 1e-6) {
    const want = S.mode === 'before' ? '換成導入後，看同一天 →' : '← 回到導入前';
    if (!b || b.textContent !== want) { if (b) b.remove(); b = el('button', 'btn sm' + (S.mode === 'before' ? ' pri' : ''), want); b.type = 'button';
      b.addEventListener('click', () => setMode(S.mode === 'before' ? 'after' : 'before')); cap.appendChild(b); }
  } else if (b) b.remove();
  $('#clock').textContent = $('#h-clock').textContent = hhmm(t);
  $('#h-slow').hidden = !(S.playing && isSlow(t));
}

/* ---------------- 時鐘 ---------------- */
let last = 0, themeTick = 0;
function render(dt) { renderLower(S.t); render2D(S.t, dt); render3D(S.t, dt); }
function loop(ts) {
  const dt = last ? Math.min(0.25, (ts - last) / 1000) : 0; last = ts;
  if (S.playing) { S.t = Math.min(DAY.H1, S.t + dt * 0.25 * S.speed * (isSlow(S.t) ? 0.12 : 1)); if (S.t >= DAY.H1) { S.playing = false; playBtn(); } }
  render(dt); if (++themeTick % 60 === 0) applyTheme3D();
  requestAnimationFrame(loop);
}
function playBtn() { $('#play').textContent = S.playing ? '❚❚ 暫停' : (S.t >= DAY.H1 ? '▶ 再播一次' : '▶ 播放'); }

/* ---------------- 月度：指標、功能、圖表、表格 ---------------- */
const fmtRow = (r, v) => { if (v == null) return '—'; if (r.pct) return (v*100).toFixed(r.dec) + '%'; if (Math.abs(v) >= 10000) return f0(v); return v.toFixed(r.dec); };
const fmtDelta = (r, d) => { if (d == null) return '—'; const s = d > 0 ? '+' : (d < 0 ? '−' : '±'), a = Math.abs(d);
  if (r.pct) return s + (a*100).toFixed(r.dec) + ' pt'; if (a >= 10000) return s + f0(a); return s + a.toFixed(r.dec); };
const SRC_TAG = { real:'資料3', calc:'推算', model:'推算', guess:'我猜的' };
function renderKPI() {
  const box = $('#kpi'); box.innerHTML = '';
  S.sc.rows.forEach(r => {
    const d = (r.after == null || r.before == null) ? null : r.after - r.before;
    const good = r.lowerBetter ? d < 0 : d > 0, cls = (d == null || Math.abs(d) < 1e-9) ? 'fl' : (good ? 'up' : 'dn');
    const vd = r.target != null && r.after != null ? '<span class="verdict ' + (r.after >= r.target ? 'ok' : 'no') + '">' + (r.after >= r.target ? '模擬達標（未實測）' : '模擬未達') + '</span>' : '';
    const row = el('div', 'krow');
    row.innerHTML = '<div class="kn">' + r.name + ' <em>' + r.unit + '</em>' + vd + '</div><div class="kv b">' + fmtRow(r, r.before) + '</div>'
      + '<div class="kv a">' + (r.blocked ? '不給數字' : fmtRow(r, r.after)) + '</div><div class="kd ' + cls + '">' + (r.blocked ? '' : fmtDelta(r, d)) + '</div>'
      + '<div class="khow"><span class="tag ' + SRC_TAG[r.src] + '">' + SRC[r.src].label + '</span> ' + r.how + '</div>';
    row.onclick = () => row.classList.toggle('open'); box.appendChild(row);
  });
}
function renderFeats() {
  const box = $('#feats'); box.innerHTML = '';
  FEATURES.forEach(f => {
    const on = S.ids.indexOf(f.id) >= 0, lab = el('label', 'ck');
    lab.innerHTML = '<input type="checkbox"' + (on ? ' checked' : '') + '><span><b style="font-size:13px">' + f.name + '</b> <span class="tag ' + (f.phase === 1 ? '決議' : '示意') + '">' + (f.phase === 1 ? '第一階段' : '第二階段') + '</span>'
      + '<div class="note" style="color:var(--ink-2)">' + f.desc + '</div><div class="note">' + f.effect + '</div>' + (f.warn ? '<div class="note" style="color:var(--warn)">⚠ ' + f.warn + '</div>' : '') + '</span>';
    lab.querySelector('input').onchange = e => { S.ids = e.target.checked ? S.ids.concat([f.id]) : S.ids.filter(x => x !== f.id); onFeatures(); };
    box.appendChild(lab);
  });
  $('#fcount').textContent = S.ids.length ? '已導入 ' + S.ids.length + ' 項' : '目前全部未導入（＝九月現況）';
}
function renderDock() {
  const d = $('#dock'); d.innerHTML = '';
  const on = FEATURES.filter(f => S.ids.indexOf(f.id) >= 0);
  if (!on.length) { d.appendChild(el('div', 'hint', '勾選功能後，這裡會出現系統圖標')); return; }
  on.forEach(f => { const b = el('button', 'fab'); b.type = 'button'; b.setAttribute('aria-label', f.name);
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + f.icon + '"/></svg><span class="lb">' + f.name + '<small>' + (f.demo ? '點選開啟系統模擬 Demo' : '尚無 Demo') + '</small></span>';
    b.onclick = () => openDemo(f); d.appendChild(b); });
}
let _demoURL = null;
function demoURL() {
  if (_demoURL) return _demoURL; const b64 = window.DEMO_B64 || ''; if (!b64) return 'about:blank';
  const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return (_demoURL = URL.createObjectURL(new Blob([u8], { type:'text/html' })));
}
function openDemo(f) {
  if (!f.demo) { toast(f.name + '：這一項還沒有系統 Demo。'); return; }
  $('#ovlT').textContent = f.name + ' — 系統模擬 Demo'; $('#ovlS').textContent = '四個端：老闆、業務、生管、後台';
  $('#ovlF').src = demoURL(); $('#ovl').classList.add('on');
  /* 線上預覽的沙盒可能擋住內嵌視窗：同時提供線上版連結 */
}
function renderChips() {
  const c = $('#chips'); c.innerHTML = '';
  METRICS.forEach(m => { const b = el('button', 'mchip' + (S.metric === m.k ? ' on' : ''), m.name); b.type = 'button';
    b.onclick = () => { S.metric = m.k; renderChips(); renderCharts(); }; c.appendChild(b); });
}
function renderCharts() { drawTrend($('#trend'), $('#ttip'), S.metric, S.ids, S.strength, S.hoverX); drawStops($('#stops'), S.sc); }
function renderTable() {
  let h = '<table><thead><tr><th>指標</th><th>單位</th><th>導入前（九月實際）</th><th>導入後（模擬）</th><th>差額</th><th>來源</th></tr></thead><tbody>';
  S.sc.rows.forEach(r => { const d = (r.after == null || r.before == null) ? null : r.after - r.before;
    h += '<tr><td>' + r.name + '</td><td>' + r.unit + '</td><td>' + fmtRow(r, r.before) + '</td><td>' + (r.blocked ? '不給數字' : fmtRow(r, r.after)) + '</td><td>' + (r.blocked ? '—' : fmtDelta(r, d)) + '</td><td>' + SRC[r.src].label + '</td></tr>'; });
  h += '</tbody></table><table style="margin-top:14px"><thead><tr><th>月份</th><th>接單</th><th>追加單</th><th>出貨</th><th>準時率</th><th>加班</th><th>重測</th><th>客訴</th><th>交期</th><th>品質</th><th>換線次</th><th>換線h</th><th>等料h</th><th>故障h</th><th>運轉h</th><th>稼動率</th></tr></thead><tbody>';
  MONTHS.forEach((m,i) => { const s = SALES[i], f = FLOOR[i];
    h += '<tr><td>' + m + '</td><td>' + s[0] + '</td><td>' + s[1] + '</td><td>' + s[2] + '</td><td>' + (s[3]*100).toFixed(0) + '%</td><td>' + f0(s[4]) + '</td><td>' + (s[5]*100).toFixed(0) + '%</td><td>' + s[6] + '</td><td>' + s[7] + '</td><td>' + s[8] + '</td><td>' + f[4] + '</td><td>' + f[5] + '</td><td>' + f[6] + '</td><td>' + f[7] + '</td><td>' + f[2] + '</td><td>' + (f[3]*100).toFixed(0) + '%</td></tr>'; });
  $('#tbl').innerHTML = h + '</tbody></table><p class="note" style="margin-top:6px">下表為資料1_近十二個月概況.xlsx 原檔。</p>';
}
function renderNotes() {
  const m = S.sc.model.now, b = S.sc.model.base;
  const items = [
    ['資料3', '這一天的重播', '9/17 的開機、運轉、停機、出貨、重測、09:10 LINE、10:20 現場知道、3 線 W0915 等料 4 小時，都取自資料3 原檔。導入前重播的運轉 27.3 h、稼動 58%、產出 4,095 片，與資料3 一致。'],
    ['示意', '部門之間的中間步驟', '老闆回客戶「沒問題」、轉傳業務、業務口頭問生管、生管通知課長的時刻，資料沒有記錄，依個案流程排出。客戶先找老闆、老闆轉業務，依個案與 11/17 決議的流程描述。'],
    ['推算', '導入後的這一天', '9/17 多停的換線、等料、故障，各乘以所勾選功能的係數（與月度模型同一組）。入口＋閘門時多停約 ' + f1(dayPlan(P1_IDS,1).extraH) + ' h；八項全上約 ' + f1(dayPlan(FEATURES.map(f=>f.id),1).extraH) + ' h。'],
    ['我猜的', '閘門的代價', '插單排進 15:00 時段，A1 當天做不完，隔天上午才做完，客戶甲的交期比現在晚約 1 天；換來的是其他三條線不被打斷、交期有日期。甲最多延後 1 天是我們的假設，需老闆確認。'],
    ['資料3', '月度十二個月歷史', '接單、出貨、準時率、加班、重測、客訴、換線、停機時數取自資料1 原檔。九月：出貨 114 千片、準時 78%、加班 3,700 h（上限）、換線 148 次。'],
    ['推算', '月度模型', '與 model.js 同一組公式，重現九月：出貨 ' + b.ship.toFixed(1) + ' 千片、準時 ' + (b.otd*100).toFixed(1) + '%、重測 ' + (b.retest*100).toFixed(2) + '%、換線 ' + b.co.toFixed(0) + ' 次。導入後＝實際值＋模型差額。'],
    ['我猜的', '效果強度與人工站', '強度 1.0 是假設的完整效果，不是實測。出貨過 125.4 千片約需 0.82～0.83。目前情境出貨受限於：' + m.limiter + '（人工站上限 ' + m.manCap.toFixed(1) + ' 千片，未驗證，待插件實測）。'],
    ['我猜的', '加班、客訴、罰款', '加班一律顯示維持 3,700 h，不宣稱會降。客訴由十二個月歷史回歸推算（交期 R²=' + FIT_LATE.r2.toFixed(2) + '）。罰款不給導入後數字：模擬器罰款公式與個案費率不符。']
  ];
  $('#srcnotes').innerHTML = items.map(x => '<div><span class="tag ' + x[0] + '">' + x[0] + '</span><div style="font-size:13px;font-weight:700;margin:5px 0 3px">' + x[1] + '</div><div class="note" style="color:var(--ink-2);line-height:1.55">' + x[2] + '</div></div>').join('');
  const r = k => S.sc.rows.find(x => x.k === k), ship = r('ship'), otd = r('otd');
  $('#banner').innerHTML = S.ids.length
    ? '月度效益（' + afterLabel() + '，效果強度 ' + S.strength.toFixed(2) + '）：月出貨 ' + fmtRow(ship, ship.before) + ' → <b>' + fmtRow(ship, ship.after) + '</b> 千片，準時率 ' + fmtRow(otd, otd.before) + ' → <b>' + fmtRow(otd, otd.after) + '</b>。這是<b>模擬值</b>，不是實測；狀態為「進入試點驗證」。'
    : '月度現況：九月出貨 114 千片、準時率 78%、加班已到上限 3,700 h、客訴 14 件。在下面勾選要導入的功能，月度數字和上方「導入後」的重播會一起改變。';
}
function renderMonthly() { renderKPI(); renderFeats(); renderDock(); renderCharts(); renderTable(); renderNotes(); }
function onFeatures() {
  S.sc = scenario(S.ids, S.strength); renderMonthly();
  if (S.mode === 'after' && !S.ids.length) toast('沒有勾選任何功能：導入後等於導入前');
  rebuildDay(true); render(0);
}

/* ---------------- 事件 ---------------- */
$('#play').addEventListener('click', () => { if (S.playing) S.playing = false; else { if (S.t >= DAY.H1) S.t = DAY.H0; S.playing = true; } playBtn(); });
$('#restart').addEventListener('click', () => { S.t = DAY.H0; S.playing = true; playBtn(); });
$('#speed').addEventListener('change', e => { S.speed = +e.target.value; });
document.querySelectorAll('.mode button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));
document.querySelectorAll('.views button').forEach(b => b.addEventListener('click', () => { const v = b.dataset.v; S.view = v;
  if (v === 'auto') { S.auto = true; F3.goal = null; } else { S.auto = false; F3.goal = F3.ok ? shot(v) : null; } markView(v); }));
$('#str').addEventListener('input', e => { S.strength = +e.target.value / 100; $('#strv').textContent = S.strength.toFixed(2); onFeatures(); });
$('#tblbtn').addEventListener('click', () => { const c = $('#tblcard'); c.hidden = !c.hidden; $('#tblbtn').classList.toggle('pri', !c.hidden); if (!c.hidden) c.scrollIntoView({ behavior:'smooth', block:'start' }); });
$('#theme').addEventListener('click', () => { const dark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'light' : 'dark'; $('#theme').textContent = dark ? '深色' : '淺色'; renderCharts(); applyTheme3D(); });
$('#ovlX').addEventListener('click', () => { $('#ovl').classList.remove('on'); $('#ovlF').src = 'about:blank'; });
$('#ovlNew').addEventListener('click', () => { try { window.open(demoURL(), '_blank'); } catch (e) { toast('瀏覽器擋住了新視窗，請用這個視窗看。'); } });
$('#ovl').addEventListener('click', e => { if (e.target === $('#ovl')) $('#ovlX').click(); });
const tcv = $('#trend');
tcv.addEventListener('mousemove', e => { S.hoverX = e.clientX - tcv.getBoundingClientRect().left; renderCharts(); });
tcv.addEventListener('mouseleave', () => { S.hoverX = null; renderCharts(); });
window.addEventListener('resize', renderCharts);

/* ---------------- 啟動 ---------------- */
build2D(); renderChips();
S.sc = scenario(S.ids, S.strength); renderMonthly();
rebuildDay(false); playBtn(); render(0);
const fontsReady = document.fonts && document.fonts.load
  ? Promise.race([Promise.all([document.fonts.load('700 60px "Noto Sans TC"'), document.fonts.ready]), new Promise(r => setTimeout(r, 1500))]) : Promise.resolve();
fontsReady.catch(() => {}).then(() => { try { init3D(); } catch (e) { console.error(e); f3Fail('3D 畫面載入失敗。'); } requestAnimationFrame(loop); });
