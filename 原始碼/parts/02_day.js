/* =====================================================================
   9/17（週四）一整天：從接單到出貨
   來源：資料3_九月每日紀錄.xlsx（已開啟原檔核對）
     9/17：開機 47.3 h、正常運轉 27.3 h、稼動率 58%、換線 9 次 8.5 h、
           等料 9.0 h、拋料與故障 2.5 h、出貨 4,100 片、重測 640 片、加班 135 h。
           客戶甲 LINE 09:10 追加 800 片 A1，現場 10:20 才知道。
           課長備註：客戶甲的先做。SMT 3 線：等料，丙的 W0915（C2）停 4 小時。測試：機台怪怪的，重測。
     平日＝九月沒有追加單、換零件的 10 個平日（9/1、3、7、9、11、15、18、23、25、29）：
           停機平均 9.1 h（換線 4.7、等料 2.0、故障 2.4），出貨平均 4,820 片，重測平均 290 片。
     多停＝9/17 − 平日＝換線 +3.8、等料 +7.0、故障 +0.1，共 10.9 h。
     （專案文件以九月日平均 243÷26＝9.35 h 為基準，得 10.7 h；兩者差在基準是否含週六。）
   導入後：同一天、同一張單，多停的三項各乘以所勾選功能的係數（與月度模型同一組係數）。
     這是把月度模型的「每件係數」套在單日實際值上，屬【我猜的】的推算方式。
   ===================================================================== */
const DAY = {
  H0: 8, OPEN: 47.3, RUN: 27.3,
  get H1() { return this.H0 + this.OPEN / LINES; },      // 19.825 → 19:50
  SHIP: 4100, RETEST: 640, OT: 135,
  WEEKDAY: { stops: 9.1, co: 4.7, mw: 2.0, flt: 2.4, ship: 4820, retest: 290, open: 41.24, run: 32.14 },
  EXTRA:   { co: 3.8, mw: 7.0, flt: 0.1 },                 // 9/17 − 平日
  MONTH_AVG_STOPS: 243 / 26,                               // 9.35 h（專案文件的基準）
  RUSH: { cust:'甲', node:'ja', model:'A1', qty:800, kind:'追加', how:'LINE', msgAt: 9 + 10/60, floorAt: 10 + 20/60, late:false, msgGuess:false, known:'10:20', result:'' },
  DATE: 17, DOW:'四', LABEL:'9/17', MWW:[1/7,1/7,4/7,1/7], WO:{ 3:'W0915' }, NOTE:''
};
/* 工作人員休息（示意，【我猜的】）：午休 12:00–13:00、晚餐 17:30–18:00。
   只影響畫面提示與辦公室人員的顯示；不改變機台運轉與任何數字（資料裡沒有休息時段的紀錄）。 */
const BREAKS = [ { a:12, b:13, name:'午休' }, { a:17.5, b:18, name:'晚餐' } ];
function breakAt(t) { for (const k of BREAKS) if (t >= k.a && t < k.b) return k; return null; }
const LINE_BASE = { 1:['B2','乙'], 2:['C1','丙'], 3:['C2','丙'], 4:['B2','乙'] };   // 3 線 C2 依資料3，其餘示意
/* 平日本來就有的停機（灰色），四線合計 9.1 h；各線停在幾點是示意 */
const ROUTINE = {
  1: [[8.0,8.7],[13.5,14.2],[19.0,19.7]],
  2: [[8.0,8.6],[12.9,13.6],[17.5,18.2]],
  3: [[8.0,8.8],[16.5,17.3],[18.9,19.8]],
  4: [[8.0,8.6],[12.5,13.4],[18.3,19.3]]
};
/* 導入前的多停（總時數依資料3；各線位置示意；3 線等料 4 h 依課長備註） */
const T1020 = 10 + 20/60;
const BEFORE_EXTRA = {
  1: [['co',T1020,0.9,'插單換線→A1'], ['mw',12.0,1.0,'B2 共用料被 A1 領走']],
  2: [['co',T1020,1.0,'插單換線→A1'], ['mw',14.2,1.0,'換回 C1 缺料']],
  3: [['co',T1020,0.9,'排程被打亂'],   ['mw',T1020+0.9,4.0,'丙 W0915（C2）缺料 4 h']],
  4: [['co',T1020,1.0,'插單換線→A1'], ['mw',13.4,1.0,'B2 等料'], ['flt',15.0,0.1,'拋料']]
};

/* 功能係數：與月度模型 simMonth 同一組（on 取上限 1，onx 不取上限） */
function dayFactors(ids, s) {
  const has = id => ids.indexOf(id) >= 0;
  const on = id => has(id) ? Math.min(1, s) : 0, onx = id => has(id) ? s : 0;
  const coPer = lerp(9.33, 3.0, on('gate')), fPer = lerp(2.38, 1.5, on('gate'));
  return {
    gate: has('gate'), intake: has('intake'), kit: has('kit'), kitsel: has('kitsel'), eta: has('eta') && has('gate'),
    co:  coPer / 9.33,
    mw:  (1 - 0.30 * on('intake')) * (1 - 0.50 * Math.max(on('kit'), on('kitsel'))) * (1 - ETA_FRAC * LABOR.etaShare * (has('gate') ? on('eta') : 0)),
    flt: fPer / 2.38,
    coEach: 0.899
  };
}

/* 把一段停機放進某線：從 start 起找空檔，放不下就切開往後放；超出收工就截掉並記錄 */
function placeSeg(occ, k, start, dur, tag, H1) {
  const out = []; let t = start, left = dur;
  const busy = () => occ.slice().sort((a,b)=>a[0]-b[0]);
  let guard = 0;
  while (left > 1e-6 && t < H1 - 1e-6 && guard++ < 50) {
    const hit = busy().find(o => t >= o[0] - 1e-9 && t < o[1] - 1e-9);
    if (hit) { t = hit[1]; continue; }
    const next = busy().filter(o => o[0] > t + 1e-9).sort((a,b)=>a[0]-b[0])[0];
    const end = Math.min(H1, next ? next[0] : H1, t + left);
    if (end - t > 1e-6) { out.push({ k, a:t, b:end, tag }); occ.push([t, end]); left -= (end - t); }
    t = end;
  }
  /* 收工前放不下：往前找最晚的空檔補上，確保總時數與資料一致，不默默丟掉 */
  guard = 0; t = start;
  while (left > 1e-6 && guard++ < 50) {
    const before = occ.filter(o => o[1] <= t + 1e-9).sort((a,b)=>b[1]-a[1]);
    const prevEnd = before.length ? before[0][1] : DAY.H0;
    const insideBusy = occ.find(o => t > o[0] + 1e-9 && t <= o[1] + 1e-9);
    if (insideBusy) { t = insideBusy[0]; continue; }
    const a = Math.max(prevEnd, t - left);
    if (t - a > 1e-6) { out.push({ k, a, b:t, tag }); occ.push([a, t]); left -= (t - a); }
    if (a <= DAY.H0 + 1e-6) break;
    t = a;
  }
  return { segs: out, overflow: Math.max(0, left) };
}

function dayPlan(ids, s) {
  const H0 = DAY.H0, H1 = DAY.H1;
  const f = dayFactors(ids, s);
  const isBefore = ids.length === 0;
  const lines = {};
  for (let l = 1; l <= LINES; l++) lines[l] = { segs: ROUTINE[l].map(r => ({ k:'rt', a:r[0], b:r[1], tag:'平日本來就有的停機' })), occ: ROUTINE[l].map(r => r.slice()) };
  let overflow = 0;
  const put = (l, k, a, d, tag) => { const r = placeSeg(lines[l].occ, k, a, d, tag, H1); lines[l].segs.push(...r.segs); overflow += r.overflow; };

  let insertAt, a1Lines, floorKnows, replyAt = null, calcAt = null, adoptAt = null, verbal = false;
  if (!f.gate) {
    /* 沒有閘門：收到就插。有入口時訊息較快到現場（時間示意） */
    const useIn = f.intake && DAY.RUSH.how !== '正式單';
    floorKnows = useIn ? DAY.RUSH.msgAt + 10/60 : DAY.RUSH.floorAt;
    if (DAY.RUSH.late) floorKnows = useIn ? DAY.RUSH.msgAt + 10/60 : H1;
    insertAt = floorKnows; a1Lines = [1,2,4]; verbal = true;
    const shift = DAY.RUSH.late ? 0 : insertAt - DAY.RUSH.floorAt;
    for (let l = 1; l <= LINES; l++) BEFORE_EXTRA[l].forEach(([k,a,d,tag]) => {
      const fac = k === 'co' ? f.co : k === 'mw' ? f.mw : f.flt;
      put(l, k, a + shift, d * fac, tag);
    });
  } else {
    /* 閘門：試算後排進 15:00 插單時段，只動 2 線；多停三項依係數縮小 */
    insertAt = DAY.RUSH.late ? 10.0 : 15.0; a1Lines = [2];
    calcAt = DAY.RUSH.msgAt + (DAY.RUSH.how === '正式單' ? 10/60 : (f.intake ? 4/60 : 30/60));
    adoptAt = calcAt + 6/60; replyAt = adoptAt + 5/60;
    floorKnows = adoptAt;                                  // 生管採用後，現場看板即可看到（時段 15:00）
    const coT = DAY.EXTRA.co * f.co, mwT = DAY.EXTRA.mw * f.mw, flT = DAY.EXTRA.flt * f.flt;
    put(2, 'co', insertAt, coT, DAY.RUSH.late ? '當天的換線（與這張單無關）' : '插單換線→' + DAY.RUSH.model + '（15:00 時段）');
    /* 等料比例沿用導入前各線分布（1:1:4:1），時間移到 15:00 A1 上線後 */
    const W = DAY.MWW, tg = DAY.DATE === 17;
    put(2, 'mw', insertAt, mwT * W[1], tg ? 'A1 上線後等料' : DAY.RUSH.model + ' 上線後等料');
    put(3, 'mw', insertAt, mwT * W[2], tg ? '丙 W0915（C2）等料' : '共用料等料');
    put(1, 'mw', insertAt + 1.3, mwT * W[0], '共用料等料');            /* 各線錯開，位置示意 */
    put(4, 'mw', insertAt + 2.6, mwT * W[3], '共用料等料');
    put(4, 'flt', insertAt + 2.0, flT, '拋料');
  }
  for (let l = 1; l <= LINES; l++) lines[l].segs.sort((a,b)=>a.a-b.a);

  /* A1 由哪幾線、何時做：插單換線結束後開始跑 A1，累計到 800 片為止 */
  const a1 = { done:0, doneAt:null, win:{}, curve:[[DAY.H0,0]] };
  const stateAt = (l, t) => { for (const g of lines[l].segs) if (t >= g.a && t < g.b) return g; return null; };
  const firstCoEnd = l => { const g = lines[l].segs.find(x => x.k === 'co' && x.a >= insertAt - 0.02); return g ? g.b : null; };
  const starts = {}; a1Lines.forEach(l => { const e = firstCoEnd(l); starts[l] = e != null ? e : insertAt; });
  const qty = (DAY.RUSH.late || !DAY.RUSH.qty) ? 0 : DAY.RUSH.qty;
  const dt = 1/120;
  for (let t = H0; t < H1 && a1.done < qty - 1e-6; t += dt) {
    for (const l of a1Lines) {
      if (starts[l] == null || t < starts[l]) continue;
      if (stateAt(l, t)) continue;
      const add = Math.min(RATE * dt, qty - a1.done);
      if (add <= 0) break;
      a1.done += add;
      (a1.win[l] = a1.win[l] || []).push(t);
      if (a1.done >= qty - 1e-6 && a1.doneAt == null) a1.doneAt = t + dt;
    }
    a1.curve.push([t + dt, a1.done]);
  }
  Object.keys(a1.win).forEach(l => { const ts = a1.win[l]; a1.win[l] = [ts[0], ts[ts.length-1] + dt]; });

  /* 當天總數 */
  const sum = k => Object.values(lines).reduce((a,L)=>a + L.segs.filter(g=>g.k===k).reduce((x,g)=>x+(g.b-g.a),0), 0);
  const extra = { co: sum('co'), mw: sum('mw'), flt: sum('flt') };
  const extraH = extra.co + extra.mw + extra.flt;
  const rtH = sum('rt');
  const run = DAY.OPEN - rtH - extraH;

  /* A1 今天沒做完：隔天 2 線 08:00 起（扣掉 2 線早上例行停機）續做；後段約半天【我猜的】 */
  a1.none = qty === 0;
  if (a1.doneAt == null && !a1.none) {
    const left = qty - a1.done, hrs = left / (RATE * a1Lines.length);
    const firstRt = ROUTINE[a1Lines[0]][0];
    a1.nextDayDoneAt = firstRt[1] + hrs;                  // 隔天的時刻
  }
  a1.shipDay = a1.none ? 1 : (a1.doneAt != null ? (a1.doneAt + 4 <= 20 ? 1 : 2) : 2);   // 隔天或後天 12:00 前
  return { ids: ids.slice(), s, f, isBefore, lines, a1, insertAt, a1Lines, floorKnows, calcAt, adoptAt, replyAt, verbal,
           extra, extraH, rtH, run, ship: run * RATE, util: run / DAY.OPEN, overflow };
}

/* 任一時刻的線狀態、運轉中的機種 */
function lineState(plan, l, t) {
  for (const g of plan.lines[l].segs) if (t >= g.a && t < g.b) return g;
  return { k:'run' };
}
function lineModel(plan, l, t) {
  const w = plan.a1.win[l];
  if (w && t >= w[0] && t < w[1]) return [DAY.RUSH.model, DAY.RUSH.cust, true];
  return LINE_BASE[l];
}
/* 到 t 為止的累計 */
function dayMetrics(plan, t) {
  let ex = 0, rt = 0;
  for (let l = 1; l <= LINES; l++) for (const g of plan.lines[l].segs) {
    const d = Math.max(0, Math.min(t, g.b) - g.a);
    if (g.k === 'rt') rt += d; else ex += d;
  }
  const open = LINES * (t - DAY.H0);
  const run = Math.max(0, open - ex - rt);
  const c = plan.a1.curve; let a1 = 0;
  for (let i = 0; i < c.length && c[i][0] <= t + 1e-9; i++) a1 = c[i][1];
  return { extra: ex, rt, open, run, prod: run * RATE, util: open > 0.05 ? run / open : null, a1 };
}

/* =====================================================================
   部門事件腳本：誰在什麼時候把什麼交給誰
   kind：LINE｜口頭｜系統｜卡片｜工單｜料｜板
   src ：資料3｜個案｜決議｜demo｜推算｜示意｜我猜的
   ===================================================================== */
const NODE_NAME = { ja:'客戶甲', jb:'客戶乙', jc:'客戶丙', boss:'老闆', ai:'AI 收件', sales:'業務', plan:'生管',
  wh:'倉庫', smt:'SMT 課長＋技術員', qa:'品保／測試', man:'人工站', ship:'出貨' };
const hhmm = h => { const m = Math.round(h*60); return String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0'); };
const DOW = ['日','一','二','三','四','五','六'];
const DAY_NOTE17 = '客戶甲的先做。SMT 3 線：等料，丙的 W0915（C2）停 4 小時。測試：機台怪怪的，重測';
const dayLabel = off => { const d = DAY.DATE >= 1000 ? new Date(CUR.year, CUR.month - 1, DAY.DATE - 1000 + off) : new Date(2026, 8, DAY.DATE + off); return (d.getMonth()+1) + '/' + d.getDate() + '（' + DOW[d.getDay()] + '）'; };

function buildEvents(plan) {
  const E = [], f = plan.f, R = DAY.RUSH, is17 = DAY.DATE === 17;
  const imp = DAY.DATE >= 1000;   /* 匯入月份的日子：來源標籤「資料3」改成該月的標籤 */
  const fix = o => { if (!imp) return o; if (o.src === '資料3') o.src = CM.tag; ['cap', 'fly'].forEach(k => { if (typeof o[k] === 'string') o[k] = o[k].replace(/資料3/g, CM.tag); }); return o; };
  const ev = (t, o) => E.push(Object.assign({ t, dur: 0.06 }, fix(o)));
  const C = R.cust, ND = R.node, M = R.model, Q = R.qty, formal = R.how === '正式單';
  const L = Math.max(0.2, R.late ? 70/60 : R.floorAt - R.msgAt), T = k => R.msgAt + L * k;
  const lbl = Q ? M + ' 再加 ' + Q : M + ' 換零件', lbl2 = Q ? M + ' 加 ' + Q : M + ' 換零件';
  const how = formal ? '正式單' : R.how, kind = formal ? '系統' : (R.how === 'LINE' ? 'LINE' : '口頭');
  const ref = R.late ? 10.0 : R.floorAt, rel = x => Math.min(DAY.H1 - 0.12, ref + x);
  const sumEx = DAY.EXTRA.co + DAY.EXTRA.mw + DAY.EXTRA.flt;
  const lag = Math.round((R.floorAt - R.msgAt) * 60);
  /* ---- 早上：一般訂單的正常流程 ---- */
  ev(8.0,  { from:'plan', to:'smt', kind:'工單', fly:'今日工單', done:'四線開工', cam:'overview', src:'示意',
    cap:'上班。生管照前一天排程發工單：1 線 B2 乙、2 線 C1 丙、3 線 C2 丙' + (DAY.WO[3] ? '（' + DAY.WO[3] + '）' : '') + '、4 線 B2 乙。',
    say:{ plan:'照排程發工單', smt:'四線開工' } });
  const kitOn = !plan.isBefore && f.kit, selOn = !plan.isBefore && f.kitsel && !f.kit, etaOn = !plan.isBefore && f.eta, kitAny = kitOn || selOn;
  if (kitOn) ev(8.05, { from:'plan', to:'wh', kind:'工單', fly:'齊套單', done:'點齊才放行', cam:'wh', src:'我猜的', cls:'good',
    cap:'齊套：倉庫依工單把料、鋼板、飛達、夾具點齊放到齊套區，料齊才推上線。（個案只說零件跨機種共用、換零件時舊料退回倉庫；點料流程與每次 ' + LABOR.kitPrepMin + ' 分是【我猜的】）', say:{ wh:'齊套點料' } });
  else ev(8.05, { from:'plan', to:'wh', kind:'工單', fly:'備料單', done:'依工單備料', cam:'wh', src:'示意',
    cap:'倉庫依工單備料，把料車推到四條線。' + (selOn ? '選擇性齊套：一般換線照舊備料，只有插單、換零件的換線才點齊。' : ''), say:{ wh:'依工單備料' } });
  ev(8.2,  { from:'wh', to:'smt', kind:'料', fly:'料車', done:'料到線邊', dur:0.15, src:'示意',
    cap:'料車送到線邊。這是平常每天都有的流程。', say:{ wh:'料已送線' } });
  /* ---- 客戶的插單／換零件 ---- */
  const guessTxt = R.msgGuess ? '（通知時間資料沒有記錄，這個時刻是示意）' : '';
  if (formal) {
    ev(R.msgAt, { from:ND, to:'sales', kind:'系統', fly:'正式單：' + lbl, done:'業務收到', cam:'office', src:'資料3',
      cap:hhmm(R.msgAt) + ' 客戶' + C + '下正式單（' + lbl + '）。正式單直接進系統給業務，不走老闆；11/17 決議正式單照舊。（時間依資料3）',
      say:{ [ND]:'正式單：' + lbl, sales:'收到正式單' } });
  } else {
    ev(R.msgAt, { from:ND, to:'boss', kind, fly:how + '：' + lbl, done:'老闆收到', cam:'office', src:R.msgGuess ? '示意' : '資料3',
      cap:hhmm(R.msgAt) + ' 客戶' + C + (how === 'LINE' ? '在 LINE ' : '用' + how) + '傳來：「' + lbl + '」。（' + (R.msgGuess ? '內容依資料3' : '時間與內容依資料3') + '；先傳給老闆依個案流程）' + guessTxt,
      say:{ [ND]:how + '：' + lbl, boss:'收到客戶' + C + '的' + (how === 'LINE' ? ' LINE' : how) }, cls:'' });
  }

  if (formal) {
    ev(T(0.3), { from:'sales', to:'plan', kind:'系統', fly:'確認：' + lbl, done:'生管收到', src:'示意', cap:'業務確認後，正式單轉給生管。', say:{ sales:'確認正式單', plan:'收到' } });
    ev(T(0.7), { from:'plan', to:'smt', kind:'工單', fly:'新工單：' + M, done:'改排程', src:'示意', cap:'生管發新工單給 SMT 課長。', say:{ plan:'發新工單' } });
  }
  if (!formal && (plan.isBefore || (!f.intake && !f.gate))) {
    ev(T(3/70), { from:'boss', to:ND, kind:'LINE', fly:'沒問題', done:'客戶以為有交期', src:'示意', cls:'bad',
      cap:'老闆回客戶「沒問題」。這是口頭承諾：沒有試算，也沒有日期。（11/17 已決議停止這種做法）',
      say:{ boss:'口頭答應「沒問題」' } });
    ev(T(6/70), { from:'boss', to:'sales', kind:'LINE', fly:'轉傳：' + lbl2, done:'業務收到', src:'示意',
      cap:'老闆把訊息轉到業務的 LINE 群組。', say:{ sales:'收到老闆轉傳' } });
    ev(T(15/70), { from:'sales', to:'plan', kind:'口頭', fly:'排得進去嗎？', done:'生管：可以', src:'示意', cls:'warn',
      cap:'業務走去問生管「排得進去嗎？」生管說可以。沒有試算，也沒有紀錄。',
      say:{ sales:'口頭問生管', plan:'說可以，沒試算' } });
    ev(T(65/70), { from:'plan', to:'smt', kind:'口頭', fly:C + '的先做', done:'改排程', src:is17 ? '資料3' : '示意', cls:'bad',
      cap:'生管口頭通知 SMT 課長：「客戶' + C + '的先做」。' + (is17 ? '（課長備註原文）' : '（口頭，沒有紀錄；時刻示意）'), say:{ plan:'口頭改排程' } });
  }
  if (plan.isBefore || (!f.intake && !f.gate) || formal) {
    if (R.late) {
      ev(DAY.H1 - 0.03, { from:null, to:'smt', kind:'現場', src:'資料3', cls:'bad', dur:0,
        cap:'這張單是 ' + hhmm(R.msgAt) + ' 才來，現場要到「' + R.known + '」才知道（資料3）。當天的多停是其他原因（課長備註：' + (DAY.NOTE || '沒寫') + '）。', say:{ smt:'隔天才知道' } });
    } else if (formal) {
      ev(R.floorAt, { from:null, to:'smt', kind:'現場', cam:'smt', src:'資料3', cls:'', dur:0,
        cap:hhmm(R.floorAt) + ' 現場看到工單，比通知晚 ' + lag + ' 分鐘（正式單走系統，很快；資料3）。', say:{ smt:'收到新工單' } });
    } else {
      ev(R.floorAt, { from:null, to:'smt', kind:'現場', cam:'smt', src:'資料3', cls:'bad', dur:0,
        cap:hhmm(R.floorAt) + ' 現場才知道，比 ' + how + ' 晚 ' + lag + ' 分鐘。1、2、4 線停線換 ' + M + '，3 線排程被打亂。',
        say:{ smt:'1、2、4 線停線換 ' + M } });
    }
    if (!formal) {
      if (kitAny) ev(rel(0.0667), { from:'smt', to:'wh', kind:'口頭', fly:M + ' 齊套檢查', done:'點齊才換線', src:'我猜的', cls:'good', cam:'wh',
        cap:(selOn ? '選擇性齊套（插單、換零件才做）：' : '齊套：') + '換線前倉庫先點齊 ' + M + ' 的料、鋼板、飛達、夾具，點齊才換線；共用零件先點出來，不再臨時被領走。倉庫多了點料的工作，倉庫人數沒有資料。',
        say:{ wh:'齊套點料：' + M } });
      else ev(rel(0.0667), { from:'smt', to:'wh', kind:'口頭', fly:'缺 ' + M + ' 的料', done:'臨時調料', src:'示意', cls:'warn',
        cap:'SMT 跟倉庫要 ' + M + ' 的料。倉庫臨時調料，共用零件被先領走。（零件跨機種共用：個案）',
        say:{ wh:'臨時調 ' + M + ' 的料' } });
      ev(rel(0.2167), { from:'wh', to:'smt', kind:'料', fly:M + ' 料車', done:M + ' 料到線', dur:0.15, src:'示意', cap:M + ' 的料推到 1、2、4 線。' });
    }
    if (is17) {
      ev(T1020 + 0.9, { from:null, to:'smt', kind:'現場', cam:'line3', src:'資料3', cls:'bad', dur:0,
        cap:'3 線換完線，丙的 W0915（C2）缺料，停線等料 4 小時。（課長備註原文）' + (kitAny ? '齊套管不到這段：新料要等供應商（個案）。齊套只能讓 3 線改做料齊的單，模型把等料減半是【我猜的】。' : '') + (etaOn ? '料到日確認：交期試算前倉庫先回報丙這批新料哪天到，閘門不把丙排在料到之前，3 線可先做料齊的單；要有替代單才有用，能避免多少是【我猜的】。' : ''), say:{ smt:'3 線等料 4 小時' } });
    } else if (DAY.EXTRA.mw >= 1) {
      ev(rel(0.9), { from:null, to:'smt', kind:'現場', cam:'line3', src:'示意', cls:'bad', dur:0,
        cap:'換線後有線缺料，停線等料。當天等料合計 ' + R.mwH.toFixed(1) + ' h（平日 2.0 h；資料3）；是哪幾條線、幾點，是示意。', say:{ smt:'有線缺料等料' } });
    }
    if (is17) {
      ev(rel(1.6667), { from:null, to:'smt', kind:'現場', src:'示意', cls:'bad', dur:0,
        cap:'1 線 B2 的共用料被 ' + M + ' 領走，缺料停線。', say:{ smt:'1 線也缺料' } });
      ev(rel(2.6667), { from:'plan', to:'sales', kind:'口頭', fly:'W0915 會晚', done:'業務知道', src:'示意', cls:'warn',
        cap:'生管告訴業務：丙的 W0915 會晚。', say:{ plan:'W0915 會晚' } });
      ev(rel(2.8167), { from:'sales', to:'jc', kind:'LINE', fly:'交期延後', done:'丙不滿', cam:'office', src:'示意', cls:'bad',
        cap:'業務通知客戶丙延後。丙的合約罰款每天 1%（個案）。', say:{ sales:'通知丙延後', jc:'交期被延後' } });
    } else if (R.result) {
      ev(rel(2.6667), { from:'plan', to:'sales', kind:'口頭', fly:'有單會晚', done:'業務知道', src:'資料3', cls:'warn',
        cap:'後來的結果（資料3）：' + R.result + '。（這個時刻是示意）', say:{ plan:'有單會晚' } });
    }
  } else if (f.intake && !formal) {
    ev(R.msgAt + 1/60, { from:'boss', to:'ai', kind:'LINE', fly:'轉傳原文', done:'已收單', src:'決議', cls:'good',
      cap:'老闆不回客戶，只把訊息轉傳給「昇嶺插單」官方帳號，收到「已收單」。（11/17 老闆決議）',
      say:{ boss:'轉傳官方帳號', ai:'收到原文，原封保留' } });
    ev(R.msgAt + 2/60, { from:'ai', to:'sales', kind:'系統', fly:'欄位草稿＋追問', done:'業務看到', src:'demo', cls:'',
      cap:'AI 只做一件事：把原文拆成欄位。客戶' + C + '、' + M + '、' + (Q ? Q + ' 片、' : '') + R.kind + '；交期沒寫，請業務追問。',
      say:{ ai:C + '／' + M + '／' + (Q ? Q : '—') + '／' + R.kind, sales:'看欄位、補交期' } });
    ev(R.msgAt + 4/60, { from:'sales', to:'plan', kind:'系統', fly:'已確認需求單', done:'進入試算', src:'demo', cls:'good',
      cap:'業務在 LINE 小網頁確認送出。作業員不用多打任何字。', say:{ sales:'確認送出' } });
  } else if (!formal) {
    ev(R.msgAt + 6/60, { from:'boss', to:'sales', kind:'LINE', fly:'轉傳：' + lbl2, done:'業務收到', src:'示意',
      cap:'沒有 AI 入口：老闆照舊轉傳給業務。', say:{ sales:'收到老闆轉傳' } });
    ev(plan.calcAt - 0.01, { from:'sales', to:'plan', kind:'系統', fly:'手動建需求單', done:'進入試算', src:'我猜的',
      cap:'業務在系統手動輸入需求單（時間【我猜的】）。', say:{ sales:'手動建單' } });
  }

  if (f.gate && !plan.isBefore) {
    if (etaOn) ev(plan.calcAt - 0.02, { from:'plan', to:'wh', kind:'口頭', fly:M + ' 新料哪天到？', done:'倉庫回報到料日', cam:'wh', src:'我猜的', cls:'good',
      cap:'料到日確認：交期試算前，生管先問倉庫 ' + M + ' 的料哪天到；倉庫回報後才試算。每張約 ' + LABOR.etaAddMin + ' 分【我猜的】。閘門不會把插單排在料到之前，機台先做料齊的單；要有替代單可排。', say:{ plan:'問新料到料日', wh:'回報 ' + M + ' 到料日' } });
    ev(plan.calcAt, { from:'plan', to:'plan', kind:'系統', cam:'office', src:'demo', cls:'good', dur:0,
      cap:'系統試算（固定程式，不用 AI）：建議排進 15:00 插單時段、只動 2 線；1、3、4 線不動，乙丙的單不被打斷。（15:00 時段是【我猜的】）',
      say:{ plan:'看試算：15:00、2 線' } });
    ev(plan.adoptAt, { from:'plan', to:'sales', kind:'卡片', fly:'可交日', done:'收到可交日', src:'demo', cls:'good',
      cap:'生管採用建議，可交日卡片推到業務的 LINE。', say:{ plan:'採用建議', sales:'收到可交日' } });
    ev(plan.adoptAt + 0.01, { from:'plan', to:'boss', kind:'卡片', fly:'可交日卡片', done:'老闆看到結果', src:'demo', cls:'good',
      cap:'老闆同時收到可交日卡片，不用再自己答應客戶。', say:{ boss:'看到可交日卡片' } });
    const shipTxt = dayLabel(plan.a1.shipDay) + '12:00 前';
    if (plan.a1.none) {
      ev(plan.replyAt, { from:'sales', to:ND, kind:'LINE', fly:'依試算回覆', done:'客戶' + C + '有日期', src:'推算', cls:'good',
        cap:'業務依試算回覆客戶' + C + '：' + M + ' ' + (R.late ? '排進' + dayLabel(1) + '的插單時段' : '換零件（沒有新增片數），排進 15:00 時段') + '。有日期、做得到。',
        say:{ sales:'依試算回覆', [ND]:'收到交期' } });
    } else {
      ev(plan.replyAt, { from:'sales', to:ND, kind:'LINE', fly:M + ' ' + Q + ' 片 ' + shipTxt + '出貨', done:'客戶' + C + '有日期', src:'推算', cls:'good',
        cap:'業務依試算回覆客戶' + C + '：' + M + ' ' + Q + ' 片 ' + shipTxt + '出貨。' + (is17 ? '比現在晚約 1 天，但有日期、做得到。（甲最多延後 1 天是【我猜的】）' : '有日期、做得到；回覆時間來自試算。'),
        say:{ sales:'依試算回覆', [ND]:'收到交期 ' + shipTxt } });
    }
    if (!R.late) {
      ev(plan.insertAt - 1.5, { from:'plan', to:'wh', kind:'工單', fly:(kitAny ? '齊套單' : '備料單') + '（15:00）', done:kitAny ? '點齊才放行' : '依試算備料', cam:'wh', src:'我猜的',
        cap:'倉庫依試算提前 1.5 小時' + (kitAny ? '把 ' + M + ' 的料、鋼板、飛達、夾具點齊（' + (selOn ? '選擇性齊套' : '齊套') + '）。' : '備 ' + M + ' 的料（沒有齊套：不保證點齊）。') + '（時段前 1.5 小時是【我猜的】）', say:{ wh:(kitAny ? '齊套：' : '備料：') + M + ' 15:00' } });
      ev(plan.insertAt - 1.3, { from:'wh', to:'smt', kind:'料', fly:M + ' 料車', done:'料在 2 線旁待命', dur:0.15, src:'我猜的', cap:M + ' 料車推到 2 線旁待命。' });
      ev(plan.insertAt, { from:null, to:'smt', kind:'現場', cam:'line2', src:'推算', cls:'good', dur:0,
        cap:'15:00 時段：只有 2 線換 ' + M + '，換線 ' + plan.extra.co.toFixed(1) + ' h（導入前四線合計 ' + DAY.EXTRA.co.toFixed(1) + ' h）。1、3、4 線照原排程。',
        say:{ smt:'只有 2 線換 ' + M } });
    } else {
      ev(plan.insertAt, { from:null, to:'smt', kind:'現場', cam:'line2', src:'推算', cls:'', dur:0,
        cap:'這張單是下午才來，現場隔天才用得到。當天的換線 ' + plan.extra.co.toFixed(1) + ' h 與這張單無關（導入前 ' + DAY.EXTRA.co.toFixed(1) + ' h；資料3）。', say:{ smt:'當天換線與此單無關' } });
    }
    ev(plan.insertAt + 0.05, { from:null, to:'smt', kind:'現場', cam:'line3', src:'推算', cls:'warn', dur:0,
      cap:(R.late ? '當天' : M + ' 上線後各線仍有') + '等料，合計 ' + plan.extra.mw.toFixed(1) + ' h（導入前 ' + DAY.EXTRA.mw.toFixed(1) + ' h）。' + (f.intake ? '入口讓等料少 3 成' : '閘門本身不減等料') + (kitAny ? '，齊套再減一半。' : '；齊套屬第二階段。') + (etaOn ? '料到日確認再減供應商類等料（比例是【我猜的】）。' : ''),
      say:{ smt:'等料 ' + plan.extra.mw.toFixed(1) + ' h' } });
  } else if (!plan.isBefore && f.intake && !formal) {
    ev(R.msgAt + 6/60, { from:'plan', to:'smt', kind:'口頭', fly:C + '的先做', done:'改排程', src:'示意', cls:'bad',
      cap:'沒有閘門：生管照舊口頭插單，沒有試算。只是現場早一點知道。', say:{ plan:'口頭插單，沒試算' } });
    ev(plan.insertAt, { from:null, to:'smt', kind:'現場', cam:'smt', src:'示意', cls:'bad', dur:0,
      cap:hhmm(plan.insertAt) + ' 現場就知道，比原本早約 ' + (R.floorAt - plan.insertAt >= 1 ? Math.round((R.floorAt - plan.insertAt) * 10) / 10 + ' 小時' : Math.round((R.floorAt - plan.insertAt) * 60) + ' 分鐘') + '，但一樣當場停線換線。', say:{ smt:'1、2、4 線停線換 ' + M } });
    ev(R.msgAt + 8/60, { from:'sales', to:ND, kind:'LINE', fly:'會盡快', done:'沒有日期', src:'示意', cls:'warn',
      cap:'沒有試算，業務只能回「會盡快」，給不出日期。', say:{ sales:'回「會盡快」' } });
  }

  /* ---- 下午：品保、插單機種完成、裝箱出貨 ---- */
  const wkRet = 290;
  if (plan.isBefore && (is17 || DAY.RETEST >= wkRet * 1.25)) ev(14.0, { from:'qa', to:'qa', kind:'現場', cam:'down', src:'資料3', cls:'bad', dur:0,
      cap:is17 ? '測試：機台怪怪的，重測。當天重測 640 片（平日約 290）。（課長備註原文）' : '當天重測 ' + DAY.RETEST + ' 片（平日約 290；資料3）。', say:{ qa:'重測 ' + DAY.RETEST + ' 片' } });
  if (plan.a1.doneAt != null) ev(plan.a1.doneAt, { from:'smt', to:'man', kind:'板', fly:M + ' ' + Q + ' 片', done:M + ' 進後段', dur:0.15, src:'推算',
      cap:hhmm(plan.a1.doneAt) + ' ' + M + ' ' + Q + ' 片做完，送到後段。做 ' + M + ' 的線換回原機種。', say:{ smt:M + ' 做完' } });
  ev(17.5, { from:'man', to:'ship', kind:'板', fly:'成品裝箱', done:'送出貨區', dur:0.2, cam:'down', src:'示意',
    cap:'後段裝箱，今天的成品送到出貨區。', say:{ man:'裝箱', ship:'成品進出貨區' } });
  const extraTxt = plan.extraH.toFixed(1), utilB = Math.round(DAY.RUN / DAY.OPEN * 100);
  ev(DAY.H1, { from:null, to:'ship', kind:'現場', cam:'overview', dur:0,
    src: plan.isBefore ? '資料3' : '推算', cls: plan.isBefore ? 'bad' : 'good',
    cap: plan.isBefore
      ? '收工。開機 ' + DAY.OPEN + ' h、正常運轉 ' + DAY.RUN + ' h、稼動率 ' + utilB + '%' + (is17 ? '（九月最低）' : '') + '，出貨 ' + DAY.SHIP.toLocaleString('en-US') + ' 片（平日 4,820），重測 ' + DAY.RETEST + ' 片。比平日多停 ' + sumEx.toFixed(1) + ' h。'
      : '收工。多停 ' + extraTxt + ' h（導入前 ' + sumEx.toFixed(1) + ' h），稼動率 ' + Math.round(plan.util*100) + '%（導入前 ' + utilB + '%），SMT 產出約 ' + Math.round(plan.ship).toLocaleString('en-US') + ' 片（推算）。'
        + (plan.a1.doneAt != null || plan.a1.none ? '' : M + ' 今天做了 ' + Math.round(plan.a1.done) + ' 片，其餘 ' + dayLabel(1) + ' 約 ' + hhmm(plan.a1.nextDayDoneAt) + ' 做完。'),
    say:{ ship:'收工' } });
  E.sort((a,b) => a.t - b.t);
  return E;
}

/* 某時刻各節點的狀態與說明（2D 用）：取該節點最後一次被事件點到的狀態 */
function nodeStateAt(E, t) {
  const st = {}, say = {};
  for (const e of E) {
    if (e.t > t + 1e-9) break;
    const cls = e.cls === 'bad' ? 'bad' : e.cls === 'good' ? 'good' : e.cls === 'warn' ? 'warn' : 'on';
    if (e.from && e.from !== e.to) st[e.from] = st[e.from] === 'bad' ? 'bad' : 'on';
    if (e.to) st[e.to] = cls;
    if (e.say) Object.assign(say, e.say);
  }
  return { st, say };
}
function curEvent(E, t) { let c = E[0]; for (const e of E) if (t >= e.t - 1e-9) c = e; return c; }

/* =====================================================================
   切換重播的日子：九月有插單／換零件的 12 個工作日（資料3）
   9/17 用手工細排（原樣保留）；其他日子用同一套模型，依當天資料3 的停機時數推出：
   「比平日多停」＝當天各類停機超過平日基準的部分；平日基準＝本來就有的停機。
   各線停在幾點、誰傳給誰的中間時刻都是【示意】。
   ===================================================================== */
const clone = o => JSON.parse(JSON.stringify(o));
const DAY17 = { base: { OPEN:DAY.OPEN, RUN:DAY.RUN, SHIP:DAY.SHIP, RETEST:DAY.RETEST, OT:DAY.OT, EXTRA:clone(DAY.EXTRA), DATE:17, DOW:'四', LABEL:'9/17', MWW:DAY.MWW.slice(), WO:clone(DAY.WO), NOTE:DAY_NOTE17 },
  rush: clone(DAY.RUSH), routine: clone(ROUTINE), before: clone(BEFORE_EXTRA) };
const hmOf = s => { const x = /(\d\d):(\d\d)/.exec(s || ''); return x ? +x[1] + +x[2] / 60 : null; };
function setDayProfile(n) {
  if (n === 17) {
    Object.assign(DAY, clone(DAY17.base)); DAY.RUSH = clone(DAY17.rush);
    for (let l = 1; l <= LINES; l++) { ROUTINE[l] = clone(DAY17.routine[l]); BEFORE_EXTRA[l] = clone(DAY17.before[l]); }
    return true;
  }
  const d = (typeof mdayOf === 'function') && mdayOf(n); if (!d || !d.rush) return false;
  const r = d.rush, W = DAY.WEEKDAY;
  const ex = { co:Math.max(0, d.coH - W.co), mw:Math.max(0, d.mwH - W.mw), flt:Math.max(0, d.flH - W.flt) };
  const total = d.coH + d.mwH + d.flH, rt = Math.max(0, total - ex.co - ex.mw - ex.flt);
  Object.assign(DAY, { OPEN:d.open, RUN:d.run, SHIP:d.ship, RETEST:d.ret, OT:d.ot, EXTRA:ex, DATE:n, DOW:d.w, LABEL:dLabel(n), MWW:[.25,.25,.25,.25], WO:{}, NOTE:d.note || '' });
  const H1 = DAY.H1, late = /隔天/.test(r.known || ''), guess = r.notice === '沒記錄';
  const m = /（([A-Z]\d)）/.exec(r.what), q = /(\d+) 片/.exec(r.what);
  const floorAt = late ? H1 : hmOf(r.known), msgAt = guess ? floorAt - 1.0 : hmOf(r.notice);
  DAY.RUSH = { cust:r.cust, node:{ '甲':'ja', '乙':'jb', '丙':'jc' }[r.cust], model:m ? m[1] : 'A1', qty:q ? +q[1] : 0, kind:q ? '追加' : '換零件',
    how:r.how, msgAt, floorAt, late, msgGuess:guess, known:r.known, result:r.result || '', mwH:d.mwH };
  /* 本來就有的停機：把 9/17 的位置依當天長度壓縮，總時數＝當天總停機 − 多停 */
  const k = (H1 - DAY.H0) / (DAY17.base.OPEN / LINES), tot = DAY17.routine[1].concat(DAY17.routine[2], DAY17.routine[3], DAY17.routine[4]).reduce((a, x) => a + x[1] - x[0], 0);
  for (let l = 1; l <= LINES; l++) ROUTINE[l] = DAY17.routine[l].map(([a, b]) => { const a2 = DAY.H0 + (a - DAY.H0) * k; return [a2, Math.min(H1 - 0.05, a2 + (b - a) * rt / tot)]; });
  /* 導入前的多停：從現場知道的時刻起，各線均分；等料各線錯開 */
  const ref = late ? 10.0 : floorAt, coEach = ex.co / 4, M = DAY.RUSH.model;
  const mwEach = ex.mw / 4, lastStart = H1 - 0.15 - mwEach;
  const mwAt = [ref + coEach + 1.6, ref + coEach + 3.8, ref + coEach + 0.2, ref + coEach + 3.1].map(t => Math.min(t, lastStart));
  for (let l = 1; l <= LINES; l++) {
    BEFORE_EXTRA[l] = [];
    if (coEach > 0.01) BEFORE_EXTRA[l].push(['co', ref, coEach, l === 3 ? '排程被打亂' : '插單換線→' + M]);
    if (ex.mw > 0.01) BEFORE_EXTRA[l].push(['mw', mwAt[l - 1], ex.mw / 4, '等料（共用料被領走）']);
  }
  if (ex.flt > 0.01) BEFORE_EXTRA[4].push(['flt', ref + 4.7, ex.flt, '拋料']);
  return true;
}
