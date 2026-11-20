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
  $('#h-mode').textContent = S.mode === 'before' ? '導入前：' + DAY.LABEL + ' 實際' : '導入後：' + afterLabel();
  $('#h-mode').className = 'm ' + S.mode;
  buildLower();
  if (document.body.dataset.dv === 'calc' && typeof renderCalc === 'function') renderCalc();
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
  h += '<div></div><div class="axis">' + [8,10,12,14,16,18].filter(x => x < DAY.H1 - 0.6).map(x => '<span style="left:' + ((x-DAY.H0)/sp*100) + '%">' + String(x).padStart(2,'0') + '</span>').join('')
    + '<span style="left:100%;transform:translateX(-100%)">' + hhmm(DAY.H1) + '</span></div>';
  h += '<div class="lab">回放<small>點時間條也能跳</small></div><div class="rpc">'
    + '<button type="button" class="btn" id="rpRestart" title="回到 ' + hhmm(DAY.H0) + '">⟲</button>'
    + '<button type="button" class="btn" id="rpPrev" title="上一個事件（,）">◀ 上一事件</button>'
    + '<button type="button" class="btn pri" id="rpPlay" title="播放／暫停（空白鍵）">❚❚ 暫停</button>'
    + '<button type="button" class="btn" id="rpNext" title="下一個事件（.）">下一事件 ▶</button>'
    + '<span class="rpt"><b id="rpt">' + hhmm(S.t) + '</b> / ' + hhmm(DAY.H1) + '</span></div>';
  h += '<div class="note" style="align-self:center">時間</div><div class="scw"><input class="scrub" id="scrub" type="range" min="' + DAY.H0 + '" max="' + DAY.H1 + '" step="0.01" value="' + S.t + '" aria-label="拖曳時間">'
    + S.events.map(e => '<i class="tk ' + (e.cls || '') + '" style="left:' + ((e.t - DAY.H0) / sp * 100) + '%" title="' + hhmm(e.t) + ' ' + String(e.cap).replace(/"/g, '').slice(0, 40) + '"></i>').join('') + '</div>';
  $('#tl').innerHTML = h;
  $('#scrub').addEventListener('input', e => { S.t = +e.target.value; S.playing = false; playBtn(); render(0); });
  const jumpEv = dir => { const E = S.events; const e = dir < 0 ? E.slice().reverse().find(x => x.t < S.t - 0.015) : E.find(x => x.t > S.t + 0.015);
    S.t = e ? e.t + 0.001 : (dir < 0 ? DAY.H0 : DAY.H1); S.playing = false; playBtn(); render(0); };
  $('#rpPrev').addEventListener('click', () => jumpEv(-1)); $('#rpNext').addEventListener('click', () => jumpEv(1));
  $('#rpPlay').addEventListener('click', () => $('#play').click()); $('#rpRestart').addEventListener('click', () => $('#restart').click());
  window.stepEvent = jumpEv;
  document.querySelectorAll('#tl .track').forEach(tr => {   /* 點或拖時間條跳到那個時刻 */
    const seek = ev => { const r = tr.getBoundingClientRect(); S.t = DAY.H0 + Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * SPAN(); S.playing = false; playBtn(); render(0); };
    tr.style.cursor = 'pointer';
    tr.addEventListener('pointerdown', ev => { tr.setPointerCapture(ev.pointerId); tr._d = true; seek(ev); });
    tr.addEventListener('pointermove', ev => { if (tr._d) seek(ev); });
    ['pointerup', 'pointercancel'].forEach(n => tr.addEventListener(n, () => { tr._d = false; }));
  });
  $('#feed').innerHTML = S.events.map(e => '<li class="' + (e.cls || '') + '" data-t="' + e.t + '"><span class="t">' + hhmm(e.t) + '</span><span class="x">'
    + e.cap + (e.src ? '<span class="tag ' + e.src + '">' + e.src + '</span>' : '') + '</span></li>').join('');
  const O = S.other, oName = S.mode === 'before' ? '導入後' : '導入前', cls = S.mode === 'before' ? 'bad' : 'good';
  const oReply = O.isBefore ? '老闆口頭「沒問題」' : (O.replyAt ? hhmm(O.replyAt) + ' 有日期' : '「會盡快」');
  const R = DAY.RUSH, oFloor = O.isBefore ? (R.late ? '隔天' : hhmm(R.floorAt)) : (R.late ? '隔天' : hhmm(O.floorKnows));
  $('#kpis').innerHTML =
    '<div class="kpi ' + cls + '"><div class="l">比平日多停的 SMT 時數</div><div class="v" id="k-h">0.0<small>h</small></div><div class="o">' + oName + '全天：' + f1(O.extraH) + ' h（平日 9.1 h）</div></div>' +
    '<div class="kpi ' + cls + '"><div class="l">吃掉的產能（多停 × 150）</div><div class="v" id="k-p">0<small>片</small></div><div class="o">' + oName + '全天：' + f0(O.extraH*RATE) + ' 片</div></div>' +
    '<div class="kpi ' + cls + '"><div class="l">當天 SMT 稼動率</div><div class="v" id="k-u">–</div><div class="o">' + oName + '全天：' + Math.round(O.util*100) + '%（九月平均 76%）</div></div>' +
    '<div class="kpi ' + cls + '"><div class="l">今天 SMT 產出</div><div class="v" id="k-o">0<small>片</small></div><div class="o">' + oName + '全天：' + f0(O.ship) + ' 片（平日 4,820）</div></div>' +
    '<div class="kpi"><div class="l">客戶' + R.cust + '拿到交期</div><div class="v t" id="k-r">–</div><div class="o">' + oName + '：' + oReply + '</div></div>' +
    '<div class="kpi"><div class="l">現場知道插單</div><div class="v t" id="k-f">–</div><div class="o">' + oName + '：' + oFloor + '</div></div>' +
    '<div class="kpi"><div class="l">被插單打斷換線的線</div><div class="v" id="k-l">–</div><div class="o">' + oName + '：' + changedLines(O) + ' 條</div></div>' +
    '<div class="kpi"><div class="l">' + R.model + (R.qty ? ' ' + f0(R.qty) + ' 片進度' : ' 換零件進度') + '</div><div class="v" id="k-a">0<small>片</small></div><div class="o" id="k-ao"></div></div>';
  $('#daynote').innerHTML = DAY.DATE === 17 ? ('導入前依資料3 的 9/17：開機 47.3 h、正常運轉 27.3 h、稼動率 58%、換線 9 次 8.5 h、等料 9.0 h、拋料與故障 2.5 h、出貨 4,100 片、重測 640 片；09:10 客戶甲 LINE、10:20 現場才知道；3 線 W0915 等料 4 小時。'
    + '「平日」＝九月沒有追加單、換零件的 10 個平日（停機平均 9.1 h、出貨平均 4,820 片），所以 9/17 多停 10.9 h（換線 +3.8、等料 +7.0、故障 +0.1）；若用九月日平均 9.35 h（含週六）當基準是 10.7 h，專案文件採用這個數。'
    + '各線停在幾點、誰傳給誰的中間時間是<span class="tag 示意">示意</span>。導入後把 9/17 多停的三項乘以所勾選功能的係數（與月度模型同一組），是<span class="tag 我猜的">我猜的</span>推算方式；15:00 插單時段、時段前 1.5 小時齊料也是【我猜的】。人工站「人在等板」只是示意：兩條以上 SMT 線同時停時亮起，沒有另外建模。') : dayNoteOther();
}

function renderLower(t) {
  const P = S.plan, sp = SPAN(), x = (t - DAY.H0) / sp * 100;
  document.querySelectorAll('#tl .track').forEach(tr => { tr.querySelector('.fut').style.left = x + '%'; tr.querySelector('.ph').style.left = 'calc(' + x + '% - 1px)'; });
  const sc = $('#scrub'); if (sc && document.activeElement !== sc) sc.value = t;
  for (let l = 1; l <= LINES; l++) { const m = lineModel(P, l, t); $('#tlm' + l).textContent = m.slice(0, 2).join(' ') + (DAY.WO[l] && !m[2] ? ' ' + DAY.WO[l] : ''); }
  const m = dayMetrics(P, t);
  $('#k-h').innerHTML = f1(m.extra) + '<small>h</small>';
  $('#k-p').innerHTML = f0(m.extra * RATE) + '<small>片</small>';
  $('#k-u').textContent = m.util == null ? '–' : Math.round(m.util * 100) + '%';
  $('#k-o').innerHTML = f0(m.prod) + '<small>片</small>';
  $('#k-a').innerHTML = DAY.RUSH.qty ? f0(m.a1) + '<small>／' + f0(DAY.RUSH.qty) + ' 片</small>' : '<small>沒有追加片數</small>';
  $('#k-ao').textContent = P.a1.doneAt != null ? hhmm(P.a1.doneAt) + ' 做完（' + P.a1Lines.join('、') + ' 線分攤）'
    : !isFinite(P.a1.nextDayDoneAt) ? (DAY.RUSH.qty ? '今天沒動工，' + dayLabel(1) + ' 排進插單時段' : '只換零件，沒有追加片數')
    : '今天做 ' + f0(P.a1.done) + ' 片，' + dayLabel(1) + ' 約 ' + hhmm(P.a1.nextDayDoneAt) + ' 做完';
  const Rr = DAY.RUSH, formalDay = Rr.how === '正式單';
  $('#k-r').textContent = t < Rr.msgAt ? '還沒收到單' : P.isBefore || P.verbal
    ? (t >= Rr.msgAt + 0.05 ? (formalDay ? '生管照流程回覆' : P.isBefore || !P.f.intake ? '老闆口頭「沒問題」，沒有日期' : '「會盡快」，沒有日期') : '…')
    : (t >= P.replyAt ? hhmm(P.replyAt) + ' 回覆 ' + dayLabel(P.a1.shipDay) + '12:00 前' : '試算中…');
  $('#k-f').textContent = Rr.late && P.isBefore ? (t >= DAY.H1 - 0.01 ? '隔天才知道' : '還不知道') : t < P.floorKnows ? '還不知道'
    : P.f.gate && !P.isBefore ? hhmm(P.floorKnows) + ' 看板（' + hhmm(P.insertAt) + ' 換線）'
    : hhmm(P.floorKnows) + (P.isBefore ? '（晚 ' + Math.round((Rr.floorAt - Rr.msgAt) * 60) + ' 分）' : '');
  $('#k-l').innerHTML = (t < P.insertAt ? 0 : changedLines(P)) + '<small>條</small>';
  const lis = document.querySelectorAll('#feed li'); let cur = -1;
  lis.forEach((li, k) => { const fut = t < +li.dataset.t - 1e-6; li.classList.toggle('fut', fut); if (!fut) cur = k; });
  lis.forEach((li, k) => li.classList.toggle('cur', k === cur));
  const rt = $('#rpt'); if (rt) rt.textContent = hhmm(t);
  if (cur !== _feedIdx && lis[cur]) { _feedIdx = cur; const fd = $('#feed'); fd.scrollTop = Math.max(0, lis[cur].offsetTop - fd.clientHeight * 0.55); }
  const c = curEvent(S.events, t), cap = $('#h-cap');
  cap.className = 'hud hud-cap ' + (c.cls || '');
  $('#h-capt').textContent = hhmm(c.t); $('#h-capx').textContent = c.cap;
  $('#h-capt2').textContent = hhmm(c.t); $('#h-capx2').textContent = c.cap; $('#cap2').className = 'cap2 ' + (c.cls || '');
  const st = $('#h-capsrc'); st.textContent = c.src || ''; st.className = 'tag ' + (c.src || ''); st.hidden = !c.src;
  let b = cap.querySelector('.btn');
  if (t >= DAY.H1 - 1e-6) {
    const want = S.mode === 'before' ? '換成導入後，看同一天 →' : '← 回到導入前';
    if (!b || b.textContent !== want) { if (b) b.remove(); b = el('button', 'btn sm' + (S.mode === 'before' ? ' pri' : ''), want); b.type = 'button';
      b.addEventListener('click', () => setMode(S.mode === 'before' ? 'after' : 'before')); cap.appendChild(b); }
  } else if (b) b.remove();
  $('#clock').textContent = $('#h-clock').textContent = hhmm(t);
  $('#h-slow').hidden = !(S.playing && isSlow(t));
  const bk = breakAt(t), hb = $('#h-brk');
  hb.hidden = !bk; hb.textContent = bk ? bk.name + '（示意，人員休息）' : '';
}

/* ---------------- 時鐘 ---------------- */
let last = 0, themeTick = 0;
let _feedIdx = -1;
function render(dt) { const dv = document.body.dataset.dv || '3d'; renderLower(S.t); if (dv === '2d') render2D(S.t, dt); if (dv === '3d') render3D(S.t, dt); }
function loop(ts) {
  const dt = last ? Math.min(0.25, (ts - last) / 1000) : 0; last = ts;
  if (S.playing) { S.t = Math.min(DAY.H1, S.t + dt * 0.25 * S.speed * (isSlow(S.t) ? 0.12 : 1)); if (S.t >= DAY.H1) { S.playing = false; playBtn(); } }
  if (S.scope === 'month') { mmStep(dt); requestAnimationFrame(loop); return; }
  render(dt); if (++themeTick % 60 === 0) applyTheme3D();
  requestAnimationFrame(loop);
}
function playBtn() { const tx = S.playing ? '❚❚ 暫停' : (S.t >= DAY.H1 ? '▶ 再播一次' : '▶ 播放'); $('#play').textContent = tx; const r = $('#rpPlay'); if (r) r.textContent = tx; }

/* ---------------- 月度：指標、功能、圖表、表格 ---------------- */
const fmtRow = (r, v) => { if (v == null) return '—'; if (r.pct) return (v*100).toFixed(r.dec) + '%'; if (Math.abs(v) >= 10000) return f0(v); return v.toFixed(r.dec); };
const fmtDelta = (r, d) => { if (d == null) return '—'; const s = d > 0 ? '+' : (d < 0 ? '−' : '±'), a = Math.abs(d);
  if (r.pct) return s + (a*100).toFixed(r.dec) + ' pt'; if (a >= 10000) return s + f0(a); return s + a.toFixed(r.dec); };
const SRC_TAG = { real:CUR ? CM.tag : '資料3', calc:'推算', model:'推算', guess:'我猜的' };
function kRow(r, box) {
  const d = (r.after == null || r.before == null) ? null : r.after - r.before;
  const good = r.lowerBetter ? d < 0 : d > 0, cls = (d == null || Math.abs(d) < 1e-9) ? 'fl' : (good ? 'up' : 'dn');
  const vd = r.chip ? '<span class="verdict ' + (r.chip.ok ? 'ok' : 'no') + '">' + r.chip.t + '</span>'
    : r.target != null && r.after != null ? '<span class="verdict ' + (r.after >= r.target ? 'ok' : 'no') + '">' + (r.after >= r.target ? '模擬達標（未實測）' : '模擬未達') + '</span>' : '';
  const row = el('div', 'krow' + (r.total ? ' ktot' : ''));
  row.innerHTML = '<div class="kn">' + r.name + ' <em>' + r.unit + '</em>' + vd + '</div><div class="kv b">' + fmtRow(r, r.before) + '</div>'
    + '<div class="kv a">' + (r.blocked ? '不給數字' : fmtRow(r, r.after)) + '</div><div class="kd ' + cls + '">' + (r.blocked ? '' : fmtDelta(r, d)) + '</div>'
    + '<div class="khow"><span class="tag ' + SRC_TAG[r.src] + '">' + SRC[r.src].label + '</span> ' + r.how + '</div>';
  row.onclick = () => row.classList.toggle('open'); box.appendChild(row);
}
const gapOf = (w, t) => ['ins', 'test', 'asm', 'pack'].reduce((a, k) => a + Math.max(0, w.B[k].need / t - w.B[k].avail), 0);
function renderKPI() {
  const box = $('#kpi'); box.innerHTML = '';
  S.sc.rows.forEach(r => { if (r.k === 'penalty') box.appendChild(el('div', 'kgrp', '月效益（萬元；'+(CUR ? '單價、毛利來自個案單，'+CM.name+'損失是'+CM.tag+'資料' : '單價、毛利、九月損失來自個案單')+'，比例假設是【我猜的】）')); kRow(r, box); });
  /* 人力與人工站：不加人的限制要看得到代價。增加的人時、稼動率變高都是紅色（有害），省下的才是綠色 */
  const ev = S.sc && S.sc.ev, s = S.strength, lab = laborCalc(S.ids, s, ev), w0 = noExtra(() => workerSim([], 0, ev)), w1 = workerSim(S.ids, s, ev), wh0 = whStats([], 0, ev), wh1 = whStats(S.ids, s, ev);
  const g = el('div', 'kgrp', '人力與人工站（單位工時是【我猜的】；個案不加人、加班不增加）'); box.appendChild(g);
  [
    { name:'策略本身的人時增減', unit:'人時／月', before:0, after:S.ids.length ? lab.net : 0, src:'guess', dec:1, lowerBetter:true,
      how:'新增的確認、核對、備料（單位工時是【我猜的】）減掉停機少了而省下的時間。省下的是理論上可回收，不代表可以減人。' },
    { name:'增產帶動的人工站時間', unit:'人時／月', before:0, after:S.ids.length ? lab.volume : 0, src:'calc', dec:1, lowerBetter:true,
      how:'多出貨 × 每片 130 秒（資料2 抽測）。這是增產本身要花的時間，要在正常班內做完；不加人、加班不增加，所以是風險，不是效益。' },
    { name:'人工站最忙站稼動率', unit:'%', before:w0.bu, after:w1.bu, src:'calc', pct:true, dec:0, lowerBetter:true,
      chip:{ ok:w1.bu <= WORKER.warn, t:w1.bu > WORKER.max + 1e-6 ? '排不下' : w1.bu > WORKER.warn ? '無餘裕（>' + f0(WORKER.warn * 100) + '%）' : w1.bu > WORKER.ref ? '偏緊（90～' + f0(WORKER.warn * 100) + '%）' : '有餘裕' },
      how:'需要站時 ÷ 九月日報實際生產時間（由人工效率反推；含不含加班不明）。最忙站：' + wkN(w1.worst) + '。超過 ' + f0(WORKER.warn * 100) + '% 先不加量（團隊定的門檻【我猜的】；九月組裝站、包裝站已是 90%），100% 表示不能再多一片。' },
    { name:'要把最忙站壓到 ' + f0(WORKER.warn * 100) + '% 還缺', unit:'人時／月', before:gapOf(w0, WORKER.warn), after:gapOf(w1, WORKER.warn), src:'calc', dec:1, lowerBetter:true,
      how:'各站「需要站時 ÷ ' + f0(WORKER.warn * 100) + '% − 可用站時」，只算超過的站。約等於 ' + f1(gapOf(w1, WORKER.warn) / (WORKDAYS * 8)) + ' 人天天做 8 小時；壓到 90%（九月水準）還缺 ' + f1(gapOf(w1, WORKER.ref)) + ' 人時，不切實際。目前人工站額外可用 ' + f0(LABOR.stationExtraH) + ' 人時；產線省下的 ' + f0(Math.max(0, -(lab.byCat['產線'] || 0))) + ' 人時是理論上可回收，轉得過去才算數。額外時數若讓 SMT 多出貨，站時需求也跟著增加，稼動率不一定降。' },
    ...(() => { let ot = null; try { ot = typeof otEstAll === 'function' ? otEstAll() : null; } catch (e) { ot = null; }
      if (!ot) return [];
      const OTB = SEP.s[4], pc = v => f1(v / OTB * 100) + '%', note = '班表算出「月底還做不完」的小時（四站加總）：正常可用站時內做不完、只能靠加班補的量。只算人工站，不含 SMT、倉庫。若九月 4,750 h 已含加班（資料證明不了），這就是新增加班；否則可能被正常班吸收。個案上限是全廠 3,700 h／月不增加。';
      return [
        { name:'估計需補加班（人員到齊）', unit:'h／月', before:ot.before.full, after:ot.after.full, src:'guess', dec:1, lowerBetter:true,
          how:note + '導入後約為' + CM.name + '加班 ' + f0(OTB) + ' h 的 ' + pc(ot.after.full) + '。' },
        { name:'估計需補加班（平均缺勤 ' + f0(LABOR.absentPct) + '%）', unit:'h／月', before:ot.before.abs, after:ot.after.abs, src:'guess', dec:1, lowerBetter:true,
          how:'同上，但各站可用站時扣平均缺勤 ' + f0(LABOR.absentPct) + '%【我猜的】，可在「可調的假設」改）。導入後約為 ' + f0(OTB) + ' h 的 ' + pc(ot.after.abs) + '。' }]; })(),
    { name:'倉庫人時（會被策略改變的工作）', unit:'人時／月', before:wh0.tot, after:wh1.tot, src:'guess', dec:1, lowerBetter:true,
      how:'等料時找料補料、備料、到料日回報、換零件退料。倉庫人數與日常占用沒有資料，排不排得下要問倉庫主管。' }
  ].forEach(r => kRow(r, box));
  { const c = el('div', 'kcap');
    c.innerHTML = '人工站緩衝【我猜的】：額外可用 <b>' + f0(LABOR.stationExtraH) + '</b> 人時／月。<button type="button" class="kbtn" data-ex="' + EXTRA_PRESET + '">套用建議情境（' + EXTRA_PRESET + ' 人時：產線省下人時一半約 85＋加班改派約 125）</button> <button type="button" class="kbtn" data-ex="0">清除</button>';
    c.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { LABOR.stationExtraH = +b.dataset.ex; syncLabParams(); S.sc = scenario(S.ids, S.strength); renderMonthly(); });
    box.appendChild(c); }
  if (S.ids.length) {
    const at = st => { const sc = scenario(S.ids, st, ev), x = k => sc.rows.find(r => r.k === k).after; return f1(x('ship')) + ' 千片、' + (x('otd') * 100).toFixed(1) + '%'; };
    box.appendChild(el('div', 'kcap', '這些是效果強度 ' + s.toFixed(2) + ' 的模擬輸出（1.00＝我們假設的完整效果，不是實測）。同一組合效果只打到 0.82：' + at(0.82) + '；打到 0.65：' + at(0.65) + '；打到 0.50：' + at(0.5) + '。'));
  }
}
function renderFeats() {
  /* 功能方塊（Badlion 式）：點方塊開 Demo；點下方開關才是導入／取消。有 Demo 的方塊上色，沒有的白色。
     第一次建立方塊；之後只改狀態（不重建），開關與顏色才有 0.3 秒的過場 */
  const box = $('#feats');
  if (box.children.length !== FEATURES.length) {
    box.innerHTML = '';
    featView().forEach(f => {
      const has = !!(f.demo || f.page);
      const t = el('div', 'ftile ' + (has ? 'demo' : 'nodemo')); t.dataset.id = f.id;
      t.tabIndex = 0; t.setAttribute('role', 'button'); t.setAttribute('aria-describedby', 'fh-' + f.id);
      t.setAttribute('aria-label', f.name + (has ? '：開啟 Demo' : '：尚無 Demo'));
      t.innerHTML = '<div class="ft-top"><span class="ft-ph">' + (f.phase === 1 ? '第一階段' : '第二階段') + '</span><span class="ft-lv" title="價值等級，T0 最高">T' + FEAT_LV[f.id] + '</span>' + (f.warn ? '<span class="ft-w" aria-hidden="true">⚠</span>' : '') + '</div>'
        + '<b class="ft-n">' + f.name + '</b>'
        + '<svg class="ft-i" viewBox="0 0 24 24" aria-hidden="true"><path d="' + f.icon + '"/></svg>'
        + '<button type="button" class="ft-sw" role="switch"><i></i></button>'
        + '<span class="ft-st"></span>'
        + '<span class="fh" id="fh-' + f.id + '" role="tooltip"><div>' + f.desc + '</div><div class="note">' + f.effect + '</div><div class="note">價值等級 T' + FEAT_LV[f.id] + '：' + FEAT_WHY[f.id] + '</div>' + (f.warn ? '<div class="note fwarn" data-w>⚠ ' + f.warn + '</div>' : '') + '<div class="note flab" data-lab></div></span>';
      t.querySelector('.ft-sw').onclick = e => { e.stopPropagation(); if (f.id === 'fair' && !BOSS.ok) { openFair(); return; } const on = S.ids.indexOf(f.id) >= 0; setIds(on ? S.ids.filter(x => x !== f.id) : S.ids.concat([f.id])); };
      t.onclick = () => openDemo(f);
      t.onkeydown = e => { if (e.target === t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDemo(f); } };
      box.appendChild(t);
    });
  }
  FEATURES.forEach(f => {
    const t = box.querySelector('[data-id="' + f.id + '"]'), on = S.ids.indexOf(f.id) >= 0, has = !!(f.demo || f.page), sw = t.querySelector('.ft-sw');
    t.classList.toggle('on', on);
    sw.setAttribute('aria-checked', on ? 'true' : 'false'); sw.setAttribute('aria-label', (on ? '取消導入 ' : '導入 ') + f.name);
    t.querySelector('.ft-st').textContent = (on ? '已導入' : (f.id === 'fair' && !BOSS.ok ? bossLabel() : '未導入')) + (has ? '' : '・尚無 Demo，不能導入');
    const lb = t.querySelector('[data-lab]');
    if (lb) { const r = laborRowFor(f.id).row; lb.textContent = r ? '人力時間（' + (on ? '目前組合' : '若導入') + '）：增加 +' + f1(r.inc) + '、減少 −' + f1(r.dec) + '、淨 ' + hh(r.net) + ' 人時／月【我猜的】' : ''; }
    if (f.id === 'fair') {
      const w = t.querySelector('[data-w]'), ic = t.querySelector('.ft-w');
      if (ic) ic.style.visibility = BOSS.ok ? 'hidden' : '';
      if (w) { w.textContent = BOSS.ok ? '✓ 老闆已確認（' + BOSS.via + '）' : '⚠ ' + bossLabel() + '：確認前不能導入'; w.style.color = BOSS.ok ? '#7be0a6' : ''; }
    }
  });
  smoothHTML($('#fcount'), S.ids.length ? '已導入 ' + S.ids.length + ' 項' : '目前全部未導入（＝' + CM.name + '現況）');
}
function renderDock() {
  const d = $('#dock'); d.innerHTML = '';
  const on = FEATURES.filter(f => S.ids.indexOf(f.id) >= 0);
  if (!on.length) return;
  /* 入口與閘門共用同一個 Demo，只顯示一個圖標 */
  const PLAN = ['intake','gate'];
  const items = on.filter(f => PLAN.indexOf(f.id) < 0 && !f.kitdemo);
  if (on.some(f => f.kitdemo)) {                       /* 完整齊套、A、B 共用一個子 Demo，只顯示一個圖標 */
    const k = on.find(f => f.kitdemo);
    items.push(Object.assign({}, k, { name:'齊套上限與配套措施（子 Demo）', demo:true, kitdemo:true }));
  }
  if (on.some(f => PLAN.indexOf(f.id) >= 0)) {
    const base = FEATURES.find(f => f.id === 'intake');
    items.unshift(Object.assign({}, base, { name:'單一插單入口＋交期試算閘門', demo:true }));
  }
  const wrap = el('div', 'dock-items');
  items.forEach(f => { const b = el('button', 'fab ' + (f.demo || f.page ? 'demo' : 'nodemo')); b.type = 'button'; b.setAttribute('aria-label', f.name);
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + f.icon + '"/></svg><span class="lb">' + f.name + '<small>' + (f.page ? '點選前往模擬器的「排程試算」頁' : f.demo ? '點選開啟系統模擬 Demo' : '尚無 Demo') + '</small></span>';
    b.onclick = () => openDemo(f); wrap.appendChild(b); });
  /* 預設收起，只留一顆展開鈕，避免擋住月度指標；展開狀態在重繪時保留 */
  const ICON_PLUS = 'M12 6v12M6 12h12', ICON_X = 'M7 7l10 10M17 7L7 17';
  const tg = el('button', 'fab fab-tg'); tg.type = 'button';
  const paint = () => { tg.setAttribute('aria-expanded', String(DOCK_OPEN)); tg.setAttribute('aria-label', DOCK_OPEN ? '收起系統圖標' : '展開系統圖標');
    tg.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + (DOCK_OPEN ? ICON_X : ICON_PLUS) + '"/></svg>'; };
  tg.onclick = () => { DOCK_OPEN = !DOCK_OPEN; d.classList.toggle('open', DOCK_OPEN); paint(); };
  d.classList.toggle('open', DOCK_OPEN); paint();
  d.appendChild(wrap); d.appendChild(tg);   /* column-reverse：展開鈕在最下面，圖標往上展開 */
}
let DOCK_OPEN = false;
function markDockClose() { DOCK_OPEN = false; renderDock(); }
let _demoURL = null, _demoURL2 = null;
function b64URL(b64) {
  if (!b64) return 'about:blank';
  const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([u8], { type:'text/html' }));
}
function demoURL() { return _demoURL || (_demoURL = b64URL(window.DEMO_B64)); }
function demoURL2() { return _demoURL2 || (_demoURL2 = b64URL(window.DEMO2_B64)); }
/* 部門交互插單 Demo（v2）：從「罰款加權排序」發送確認申請後跳轉；關閉後回到原工具 */
let OVL_CUR = 1;
function openDept() {
  OVL_CUR = 2; $('#ovlT').textContent = '部門交互插單 — 系統模擬 Demo（v2）'; $('#ovlS').textContent = '老闆 LINE → 業務 → 生管 → 回覆；關閉後回到罰款加權排序';
  $('#ovlLink').hidden = true; $('#ovlF').src = demoURL2(); $('#ovl').classList.add('on');
}
function openDemo(f) {
  if (f.id === 'fair') { openFair(); return; }
  if (f.kitdemo) { openKit(); return; }
  if (f.page) { showPage(f.page); markDockClose(); return; }
  if (!f.demo) { toast(f.name + '：這一項還沒有系統 Demo。'); return; }
  $('#ovlT').textContent = f.name + ' — 系統模擬 Demo'; $('#ovlS').textContent = '四個端：老闆、業務、生管、後台';
  OVL_CUR = 1; $('#ovlLink').hidden = false; $('#ovlF').src = demoURL(); $('#ovl').classList.add('on');
  /* 線上預覽的沙盒可能擋住內嵌視窗：同時提供線上版連結 */
}
function renderChips() {
  const c = $('#chips'); c.innerHTML = '';
  METRICS.forEach(m => { const b = el('button', 'mchip' + (S.metric === m.k ? ' on' : ''), m.name); b.type = 'button';
    b.onclick = () => { S.metric = m.k; renderChips(); renderCharts(); }; c.appendChild(b); });
}
function renderCharts() {
  const has = S.ids.length > 0;
  drawTrend($('#trend'), $('#ttip'), S.metric, S.ids, S.strength, S.hoverX); drawStops($('#stops'), S.sc, has); try { drawOtCmp($('#otcmp')); } catch (e) {}
  document.querySelectorAll('.k-adopt').forEach(e => { e.hidden = !has; });
  renderStrat();
}
/* 十二個月圖表旁：目前導入的策略＋快捷切換 */
function setIds(ids) {
  { const nd = ids.filter(x => S.ids.indexOf(x) < 0 && !HAS_DEMO(FEATURES.find(f => f.id === x) || {})); if (nd.length) { toast(nd.map(x => FEATURES.find(f => f.id === x).name).join('、') + '：還沒有系統 Demo，不能導入模擬'); ids = ids.filter(x => nd.indexOf(x) < 0); } }
  if (!BOSS.ok && ids.indexOf('fair') >= 0 && S.ids.indexOf('fair') < 0) { toast('罰款加權排序：需先由老闆確認計算方法，才能導入'); ids = ids.filter(x => x !== 'fair'); }
  /* 二選一與依附：新勾的功能若與已勾的互斥就取代它；新勾的功能若依附別的功能就一併帶入；被依附的功能取消時，依附它的也取消 */
  const added = ids.filter(x => S.ids.indexOf(x) < 0);
  added.forEach(id => { if (ids.indexOf(id) < 0) return; const f = FEATURES.find(x => x.id === id) || {};
    (f.excl || []).forEach(x => { if (ids.indexOf(x) >= 0) { ids = ids.filter(y => y !== x); toast(f.name + ' 取代 ' + FEATURES.find(g => g.id === x).name + '（二選一）'); } });
    (f.needs || []).forEach(x => { if (ids.indexOf(x) < 0) { ids = ids.concat([x]); toast(f.name + ' 依附 ' + FEATURES.find(g => g.id === x).name + '，已一併導入'); } }); });
  FEATURES.forEach(f => { (f.needs || []).forEach(x => { if (ids.indexOf(f.id) >= 0 && ids.indexOf(x) < 0 && S.ids.indexOf(f.id) >= 0) { ids = ids.filter(y => y !== f.id); toast(f.name + ' 依附 ' + FEATURES.find(g => g.id === x).name + '，已一併取消'); } }); });
  S.ids = FEATURES.map(f => f.id).filter(id => ids.indexOf(id) >= 0); onFeatures();
}
function renderStrat() {
  const box = $('#strat'); if (!box) return;
  const on = FEATURES.filter(f => S.ids.indexOf(f.id) >= 0);
  $('#stratNow').innerHTML = on.length ? on.map(f => '<li>' + f.name + '</li>').join('') : '<li class="none">沒有導入任何策略（＝' + CM.name + '現況）</li>';
  box.innerHTML = '';
  featView().forEach(f => { const b = el('button', 'stb' + (S.ids.indexOf(f.id) >= 0 ? ' on' : '')); b.type = 'button';
    b.setAttribute('aria-pressed', S.ids.indexOf(f.id) >= 0 ? 'true' : 'false');
    b.innerHTML = '<span class="ck2"></span><span class="lvb">T' + FEAT_LV[f.id] + '</span>' + f.name + ' <span class="tag ' + (f.phase === 1 ? '決議' : '示意') + '">' + (f.phase === 1 ? '第一階段' : '第二階段') + '</span>';
    b.onclick = () => { if (f.id === 'fair' && !BOSS.ok) { openFair(); return; } setIds(S.ids.indexOf(f.id) >= 0 ? S.ids.filter(x => x !== f.id) : S.ids.concat([f.id])); };
    box.appendChild(b); });
}

function renderTable() {
  let h = '<table><thead><tr><th>指標</th><th>單位</th><th>導入前（' + CM.name + (CUR ? CM.tag : '實際') + '）</th><th>導入後（模擬）</th><th>差額</th><th>來源</th></tr></thead><tbody>';
  S.sc.rows.forEach(r => { const d = (r.after == null || r.before == null) ? null : r.after - r.before;
    h += '<tr><td>' + r.name + '</td><td>' + r.unit + '</td><td>' + fmtRow(r, r.before) + '</td><td>' + (r.blocked ? '不給數字' : fmtRow(r, r.after)) + '</td><td>' + (r.blocked ? '—' : fmtDelta(r, d)) + '</td><td>' + SRC[r.src].label + '</td></tr>'; });
  h += '</tbody></table><table style="margin-top:14px"><thead><tr><th>月份</th><th>接單</th><th>追加單</th><th>出貨</th><th>準時率</th><th>加班</th><th>重測</th><th>客訴</th><th>交期</th><th>品質</th><th>換線次</th><th>換線h</th><th>等料h</th><th>故障h</th><th>運轉h</th><th>稼動率</th></tr></thead><tbody>';
  MONTHS.forEach((m,i) => { const s = SALES[i], f = FLOOR[i];
    h += '<tr><td>' + m + '</td><td>' + s[0] + '</td><td>' + s[1] + '</td><td>' + s[2] + '</td><td>' + (s[3]*100).toFixed(0) + '%</td><td>' + f0(s[4]) + '</td><td>' + (s[5]*100).toFixed(0) + '%</td><td>' + s[6] + '</td><td>' + s[7] + '</td><td>' + s[8] + '</td><td>' + f[4] + '</td><td>' + f[5] + '</td><td>' + f[6] + '</td><td>' + f[7] + '</td><td>' + f[2] + '</td><td>' + (f[3]*100).toFixed(0) + '%</td></tr>'; });
  $('#tbl').innerHTML = h + '</tbody></table><p class="note" style="margin-top:6px">下表為資料1_近十二個月概況.xlsx 原檔' + (CUR ? '；最後一列 ' + CM.ym + ' 是' + (CM.ai ? '【AI模擬】資料，不是企業資料' : '匯入的資料') : '') + '。</p>';
}
function renderNotes() {
  const m = S.sc.model.now, b = S.sc.model.base;
  const items = [
    ['資料3', '這一天的重播', DAY_NOTE_TXT()],
    ['推算', '計算過程畫面', '右側「系統試算」是 demo-v2 的 engine.js 原樣執行（固定程式、不用 AI），公式與參數都是它的：罰款率乙 2%、丙 1%／天與單價 1,200 元來自個案單，甲的虛擬權重、損失低／中門檻是【我猜的】；排程佇列 Q-01～Q-07 與要求交期是示意，單價用個案平均 1,200 元／片。左側「生管自行計算」依個案寫的標準工時、換線每線每天抓 0.5 小時、口頭答覆重建，是示意；個案沒有寫生管實際怎麼算。'],
    ['示意', '部門之間的中間步驟', '老闆回客戶「沒問題」、轉傳業務、業務口頭問生管、生管通知課長的時刻，資料沒有記錄，依個案流程排出。客戶先找老闆、老闆轉業務，依個案與 11/17 決議的流程描述。'],
    ['我猜的', '導入後的這一天', DAY.LABEL + ' 多停的換線、等料、故障，各乘以所勾選功能的係數（與月度模型同一組，係數是【我猜的】）。入口＋閘門時多停約 ' + f1(dayPlan(P1_IDS,1).extraH) + ' h；有 Demo 的功能全上約 ' + f1(dayPlan(FULL_IDS,1).extraH) + ' h。'],
    ['我猜的', '閘門的代價', '插單排進 ' + hhmm(dayPlan(P1_IDS,1).insertAt) + ' 時段，' + DAY.RUSH.model + ' 不一定當天做完，客戶' + DAY.RUSH.cust + '的交期可能比現在晚約 1 天；換來的是其他三條線不被打斷、交期有日期。最多延後 1 天是【我猜的】，需老闆確認。'],
    ['資料3', '月度十二個月歷史', '接單、出貨、準時率、加班、重測、客訴、換線、停機時數取自資料1 原檔。九月：出貨 114 千片、準時 78%、加班 3,700 h（上限）、換線 148 次。'],
    ...(CUR ? [['我猜的', '目前的基準月：' + CM.ym + (CM.ai ? '【AI模擬】' : '（匯入）'), (CM.ai ? '這個月的資料是 AI 隨機產生的練習資料，不是企業資料' : '這個月的資料是匯入的檔案') + (CM.file ? '（' + CM.file + '）' : '') + '。「導入前」與月效益改用這個月；模型公式仍由個案十二個月擬合，不因匯入而改變。9/17 單日重播仍是個案原始資料。' + (CUR.events && CUR.events.length ? '這個月抽到的狀況：' + CUR.events.join('；') + '。' : '')]] : []),
    ['推算', '月度模型', '與 model.js 同一組公式，重現' + CM.name + '：出貨 ' + b.ship.toFixed(1) + ' 千片、準時 ' + (b.otd*100).toFixed(1) + '%、重測 ' + (b.retest*100).toFixed(2) + '%、換線 ' + b.co.toFixed(0) + ' 次。導入後＝實際值＋模型差額。'],
    ['我猜的', '效果強度與人工站', '強度 1.0 是假設的完整效果【我猜的】，不是實測；各功能的改善係數（例如閘門把每張插單換線 9.33→3.0 次）也是【我猜的】。' + (CUR ? '目標出貨＝' + CM.name + ' × 1.1 ＝ ' + f1(TARGET.ship) + ' 千片（沿用個案 +10% 的口徑）。' : '出貨過 125.4 千片約需 0.82～0.83。') + '目前情境出貨受限於：' + m.limiter + '（人工站上限 ' + m.manCap.toFixed(1) + ' 千片，未驗證，待插件實測）。'],
    ['我猜的', '加班、客訴、罰款', '加班一律顯示維持' + CM.name + ' ' + f0(SEP.s[4]) + ' h，不宣稱會降。客訴由十二個月歷史回歸推算（交期 R²=' + FIT_LATE.r2.toFixed(2) + '）。罰款與客訴處理費以' + CM.name + '（' + f1(PENALTY_SEP / 1e4) + ' 萬、' + f1(CLAIM_SEP / 1e4) + ' 萬）按延遲率、客訴件數等比例推算。'],
['我猜的', '資料證明不了的事', '①人工站每月約 4,750 h 含不含加班：不明。反推的人工站時數在加班 1,700→3,700 h 之間幾乎持平，沒有跟著加班變動，所以模型把它當固定值、不預測加班。②班表上的「約 X 人」是「人當量」（時數 ÷ 每人每日 8 h），不是真實人數。③個案只給全廠約 100 人，沒給各站人數，無法推算每站實際幾個人；要改派 125 人時，須先請老闆確認。'],
        ['推算', '月效益', '多出貨毛利＝多出的片數 × 1,200 元 × 毛利 15%（個案單）；加上少付的罰款與少花的客訴處理，減系統月費 0.6 萬【我猜的】；一次性導入 15 萬【我猜的】。加班費維持不省。']
  ];
  $('#srcnotes').innerHTML = items.map(x => '<div><span class="tag ' + x[0] + '">' + x[0] + '</span><div style="font-size:13px;font-weight:700;margin:5px 0 3px">' + x[1] + '</div><div class="note" style="color:var(--ink-2);line-height:1.55">' + x[2] + '</div></div>').join('');
  const r = k => S.sc.rows.find(x => x.k === k), ship = r('ship'), otd = r('otd');
  smoothHTML($('#banner'), S.ids.length
    ? '月度效益（' + afterLabel() + '，效果強度 ' + S.strength.toFixed(2) + '）：月出貨 ' + fmtRow(ship, ship.before) + ' → <b>' + fmtRow(ship, ship.after) + '</b> 千片，準時率 ' + fmtRow(otd, otd.before) + ' → <b>' + fmtRow(otd, otd.after) + '</b>。這是<b>模擬值</b>，不是實測；狀態為「進入試點驗證」。'
    : '月度現況：' + (CUR ? CM.ym + (CM.ai ? '【AI模擬】' : '（匯入）') + '出貨 ' + f1(SEP.s[2]) + ' 千片、準時率 ' + f0(SEP.s[3] * 100) + '%、加班 ' + f0(SEP.s[4]) + ' h、客訴 ' + SEP.s[6] + ' 件。' : '九月出貨 114 千片、準時率 78%、加班已到上限 3,700 h、客訴 14 件。') + '在下面勾選要導入的功能，月度數字和上方「導入後」的重播會一起改變。');
}
/* 會因換行改變大小的區塊：大小變化用 0.3 秒補間 */
smoothResize($('#banner'), 'h'); smoothResize(document.querySelector('.bar'), 'wh');
function renderMonthly() { renderKPI(); renderLabor(); renderWorkers(); renderFeats(); renderDock(); renderCharts(); renderTable(); renderNotes(); if (document.body.dataset.page === 'roster' && typeof rosterRender === 'function') rosterRender(); }
function onFeatures() {
  S.sc = scenario(S.ids, S.strength); renderMonthly();
  if (S.mode === 'after' && !S.ids.length) toast('沒有勾選任何功能：導入後等於導入前');
  rebuildDay(true); render(0); mmRefresh();
}

/* ---------------- 事件 ---------------- */
$('#play').addEventListener('click', () => { if (S.playing) S.playing = false; else { if (S.t >= DAY.H1) S.t = DAY.H0; S.playing = true; } playBtn(); });
$('#feed').addEventListener('click', e => { const li = e.target.closest('li'); if (!li) return; S.t = +li.dataset.t + 0.001; S.playing = false; playBtn(); render(0); });
$('#restart').addEventListener('click', () => { S.t = DAY.H0; S.playing = true; playBtn(); });
$('#speed').addEventListener('change', e => { S.speed = +e.target.value; });
document.querySelectorAll('.mode button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));
document.querySelectorAll('.views button').forEach(b => b.addEventListener('click', () => { const v = b.dataset.v; S.view = v;
  if (v === 'auto') { S.auto = true; F3.goal = null; } else { S.auto = false; F3.goal = F3.ok ? shot(v) : null; } markView(v); }));
/* 功能區的兩顆預設配置：在可導入的功能組合與強度 0.50～1.00 之間搜尋（只改導入的功能、強度；建議配置另設人工站額外時數）
   建議最佳配置：最忙站 ≤ 警戒線、準時 ≥ 90% 下，出貨最多（相對安全，不一定達 +10%）
   達標配置：出貨 ≥ 目標、準時 ≥ 90% 下，最忙站最低（能過標準時的最安全組合） */
const PRESET_OTD = 0.90;
function presetCombos() {
  const out = [];
  [0,1].forEach(a => [0,1].forEach(g => [0,1].forEach(r => ['none','kit','kitsel'].forEach(k => [0,1].forEach(e => {
    if (e && !g) return;
    const ids = []; if (a) ids.push('intake'); if (g) ids.push('gate'); if (r) ids.push('realsched'); if (k !== 'none') ids.push(k); if (e) ids.push('eta');
    if (ids.length) out.push(ids);
  })))));
  return out;
}
function presetEval(ids, s, extra) {
  const x0 = LABOR.stationExtraH; LABOR.stationExtraH = extra;
  try {
    const sc = scenario(ids, s, SEP.s[1]), g = n => sc.rows.find(r => r.k === n).after;
    return { ids, s, ship: g('ship'), otd: g('otd'), bu: workerSim(ids, s, SEP.s[1]).bu, n: ids.length };
  } finally { LABOR.stationExtraH = x0; }
}
function presetSearch(mode, extra) {
  const grid = []; for (let v = 50; v <= 100; v += 5) grid.push(v / 100);
  let best = null;
  presetCombos().forEach(c => grid.forEach(s => {
    const r = presetEval(c, s, extra);
    if (mode === 'best') {
      if (r.bu > WORKER.warn + 1e-9 || r.otd < PRESET_OTD) return;
      if (!best || r.ship > best.ship + 1e-6 || (Math.abs(r.ship - best.ship) < 1e-6 && (r.n < best.n || (r.n === best.n && r.otd > best.otd)))) best = r;
    } else {
      if (r.ship < TARGET.ship - 1e-9 || r.otd < PRESET_OTD) return;
      if (!best || r.bu < best.bu - 1e-9 || (Math.abs(r.bu - best.bu) < 1e-9 && (r.n < best.n || (r.n === best.n && r.s < best.s)))) best = r;
    }
  }));
  return best;
}
function applyPreset(mode) {
  const extra = mode === 'best' ? EXTRA_PRESET : LABOR.stationExtraH;
  const r = presetSearch(mode, extra), note = $('#pNote');
  if (!r) { note.textContent = mode === 'best' ? '找不到同時符合「最忙站 ≤ ' + f0(WORKER.warn * 100) + '%、準時 ≥ 90%」的組合（強度 0.50～1.00）。' : '找不到同時符合「出貨 ≥ ' + TARGET.ship + ' 千片、準時 ≥ 90%」的組合（強度 0.50～1.00）。可以調高人工站額外時數再試。'; return; }
  if (mode === 'best') LABOR.stationExtraH = EXTRA_PRESET;
  S.strength = r.s; $('#str').value = Math.round(r.s * 100); $('#strv').textContent = r.s.toFixed(2);
  setIds(r.ids.concat(S.ids.filter(x => x === 'fair')));
  syncLabParams();
  const names = S.ids.map(id => (FEATURES.find(f => f.id === id) || {}).short || id).join('、');
  note.innerHTML = (mode === 'best' ? '<b>建議配置（需全員到班）</b>' : '<b>達標配置</b>') + '：導入 ' + S.ids.length + ' 項（' + names + '），強度 ' + r.s.toFixed(2) + '，人工站額外時數 ' + f0(LABOR.stationExtraH) + ' 人時／月。模擬：出貨 ' + f1(r.ship) + ' 千片、準時 ' + f1(r.otd * 100) + '%、最忙站 ' + f0(r.bu * 100) + '%' + (mode === 'best' ? '（標準：最忙站 ≤ ' + f0(WORKER.warn * 100) + '%）' : '（標準：出貨 ≥ ' + TARGET.ship + ' 千片）') + '。';
}
{ const mirror = () => { const m = $('#rsPNote'); if (m) m.innerHTML = $('#pNote').innerHTML; };
  const run = mode => { applyPreset(mode); mirror(); };
  $('#pBest').addEventListener('click', () => run('best'));
  $('#pStd').addEventListener('click', () => run('std'));
  if ($('#rsBest')) { $('#rsBest').addEventListener('click', () => run('best')); $('#rsStd').addEventListener('click', () => run('std')); } }
$('#str').addEventListener('input', e => { S.strength = +e.target.value / 100; $('#strv').textContent = S.strength.toFixed(2); onFeatures(); });
$('#tblbtn').addEventListener('click', () => { const c = $('#tblcard'); c.hidden = !c.hidden; $('#tblbtn').classList.toggle('pri', !c.hidden); if (!c.hidden) c.scrollIntoView({ behavior:'smooth', block:'start' }); });
$('#theme').addEventListener('click', () => { const dark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'light' : 'dark'; $('#theme').textContent = dark ? '深色' : '淺色'; renderCharts(); applyTheme3D(); });
$('#ovlX').addEventListener('click', () => { $('#ovl').classList.remove('on'); $('#ovlF').src = 'about:blank'; });
$('#ovlNew').addEventListener('click', () => { try { window.open(OVL_CUR === 2 ? demoURL2() : demoURL(), '_blank'); } catch (e) { toast('瀏覽器擋住了新視窗，請用這個視窗看。'); } });
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

function DAY_NOTE_TXT() {
  if (DAY.DATE === 17) return '9/17 的開機、運轉、停機、出貨、重測、09:10 LINE、10:20 現場知道、3 線 W0915 等料 4 小時，都取自資料3 原檔。導入前重播的運轉 27.3 h、稼動 58%、產出 4,095 片，與資料3 一致。';
  const R = DAY.RUSH;
  return DAY.LABEL + ' 的開機 ' + DAY.OPEN + ' h、運轉 ' + DAY.RUN + ' h、停機、出貨、重測、' + (R.msgGuess ? '通知時間（資料沒記錄，示意）' : '通知時間 ' + hhmm(R.msgAt)) + '、現場知道的時間，取自' + (DAY.DATE >= 1000 ? CM.ym + ' ' + CM.tag + '資料' : '資料3 原檔') + '。導入前重播的運轉與' + (DAY.DATE >= 1000 ? '該月資料' : '資料3') + ' 一致。';
}
function dayNoteOther() {
  const d = mdayOf(DAY.DATE), R = DAY.RUSH, E = DAY.EXTRA;
  return '導入前依' + (DAY.DATE >= 1000 ? CM.ym + '【' + CM.tag + '】' : '資料3 ') + '的 ' + DAY.LABEL + '（週' + DAY.DOW + '）：開機 ' + DAY.OPEN + ' h、正常運轉 ' + DAY.RUN + ' h、稼動率 ' + Math.round(DAY.RUN / DAY.OPEN * 100) + '%、換線 ' + d.co + ' 次 ' + d.coH + ' h、等料 ' + d.mwH + ' h、拋料與故障 ' + d.flH + ' h、出貨 ' + f0(DAY.SHIP) + ' 片、重測 ' + f0(DAY.RETEST) + ' 片；'
    + '客戶' + R.cust + (R.msgGuess ? '口頭通知（資料沒有記錄時間，這個時刻是示意）' : ' ' + R.how + ' 通知 ' + hhmm(R.msgAt)) + '，現場知道是「' + R.known + '」。'
    + '「平日」＝九月沒有追加單、換零件的平日（停機平均 9.1 h、出貨平均 4,820 片），所以 ' + DAY.LABEL + ' 比平日多停 ' + f1(E.co + E.mw + E.flt) + ' h（換線 +' + f1(E.co) + '、等料 +' + f1(E.mw) + '、故障 +' + f1(E.flt) + '）。'
    + '各線停在幾點、誰傳給誰的中間時間是<span class="tag 示意">示意</span>。導入後把多停的三項乘以所勾選功能的係數（與月度模型同一組），是<span class="tag 我猜的">我猜的</span>推算方式。';
}
