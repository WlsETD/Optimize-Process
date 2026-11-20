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
  RUSH: { cust:'甲', model:'A1', qty:800, msgAt: 9 + 10/60, floorAt: 10 + 20/60 }
};
const LINE_BASE = { 1:['B2','乙'], 2:['C1','丙'], 3:['C2','丙'], 4:['B2','乙'] };   // 3 線 C2 依資料3，其餘示意
const LINE_WO   = { 3:'W0915' };
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
    gate: has('gate'), intake: has('intake'), smed: has('smed'), kit: has('kit'),
    co:  (coPer / 9.33) * (1 - 0.33 * onx('smed')),
    mw:  (1 - 0.30 * on('intake')) * (1 - 0.50 * on('kit')),
    flt: fPer / 2.38,
    coEach: 0.899 * (1 - 0.33 * onx('smed'))
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
    floorKnows = f.intake ? 9 + 20/60 : DAY.RUSH.floorAt;
    insertAt = floorKnows; a1Lines = [1,2,4]; verbal = true;
    const shift = insertAt - DAY.RUSH.floorAt;
    for (let l = 1; l <= LINES; l++) BEFORE_EXTRA[l].forEach(([k,a,d,tag]) => {
      const fac = k === 'co' ? f.co : k === 'mw' ? f.mw : f.flt;
      put(l, k, a + shift, d * fac, tag);
    });
  } else {
    /* 閘門：試算後排進 15:00 插單時段，只動 2 線；多停三項依係數縮小 */
    insertAt = 15.0; a1Lines = [2];
    calcAt = f.intake ? 9 + 14/60 : 9 + 40/60;
    adoptAt = calcAt + 6/60; replyAt = adoptAt + 5/60;
    floorKnows = adoptAt;                                  // 生管採用後，現場看板即可看到（時段 15:00）
    const coT = DAY.EXTRA.co * f.co, mwT = DAY.EXTRA.mw * f.mw, flT = DAY.EXTRA.flt * f.flt;
    put(2, 'co', 15.0, coT, '插單換線→A1（15:00 時段）');
    /* 等料比例沿用導入前各線分布（1:1:4:1），時間移到 15:00 A1 上線後 */
    put(2, 'mw', 15.0, mwT * 1/7, 'A1 上線後等料');
    put(3, 'mw', 15.0, mwT * 4/7, '丙 W0915（C2）等料');
    put(1, 'mw', 16.3, mwT * 1/7, '共用料等料');            /* 各線錯開，位置示意 */
    put(4, 'mw', 17.6, mwT * 1/7, '共用料等料');
    put(4, 'flt', 17.0, flT, '拋料');
  }
  for (let l = 1; l <= LINES; l++) lines[l].segs.sort((a,b)=>a.a-b.a);

  /* A1 由哪幾線、何時做：插單換線結束後開始跑 A1，累計到 800 片為止 */
  const a1 = { done:0, doneAt:null, win:{}, curve:[[DAY.H0,0]] };
  const stateAt = (l, t) => { for (const g of lines[l].segs) if (t >= g.a && t < g.b) return g; return null; };
  const firstCoEnd = l => { const g = lines[l].segs.find(x => x.k === 'co' && x.a >= insertAt - 0.02); return g ? g.b : null; };
  const starts = {}; a1Lines.forEach(l => starts[l] = firstCoEnd(l));
  const dt = 1/120;
  for (let t = H0; t < H1 && a1.done < DAY.RUSH.qty - 1e-6; t += dt) {
    for (const l of a1Lines) {
      if (starts[l] == null || t < starts[l]) continue;
      if (stateAt(l, t)) continue;
      const add = Math.min(RATE * dt, DAY.RUSH.qty - a1.done);
      if (add <= 0) break;
      a1.done += add;
      (a1.win[l] = a1.win[l] || []).push(t);
      if (a1.done >= DAY.RUSH.qty - 1e-6 && a1.doneAt == null) a1.doneAt = t + dt;
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
  if (a1.doneAt == null) {
    const left = DAY.RUSH.qty - a1.done, hrs = left / (RATE * a1Lines.length);
    const firstRt = ROUTINE[a1Lines[0]][0];
    a1.nextDayDoneAt = firstRt[1] + hrs;                  // 隔天的時刻
  }
  a1.shipDay = a1.doneAt != null ? (a1.doneAt + 4 <= 20 ? 1 : 2) : 2;   // 隔天或後天 12:00 前
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
  if (w && t >= w[0] && t < w[1]) return ['A1','甲'];
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
const dayLabel = off => { const d = new Date(2026, 8, 17 + off); return (d.getMonth()+1) + '/' + d.getDate() + '（' + DOW[d.getDay()] + '）'; };

function buildEvents(plan) {
  const E = [], f = plan.f;
  const ev = (t, o) => E.push(Object.assign({ t, dur: 0.06 }, o));
  /* ---- 早上：一般訂單的正常流程 ---- */
  ev(8.0,  { from:'plan', to:'smt', kind:'工單', fly:'今日工單', done:'四線開工', cam:'overview', src:'示意',
    cap:'上班。生管照前一天排程發工單：1 線 B2 乙、2 線 C1 丙、3 線 C2 丙（W0915）、4 線 B2 乙。',
    say:{ plan:'照排程發工單', smt:'四線開工' } });
  ev(8.05, { from:'plan', to:'wh', kind:'工單', fly:'備料單', done:'依工單備料', cam:'wh', src:'示意',
    cap:'倉庫依工單備料，把料車推到四條線。', say:{ wh:'依工單備料' } });
  ev(8.2,  { from:'wh', to:'smt', kind:'料', fly:'料車', done:'料到線邊', dur:0.15, src:'示意',
    cap:'料車送到線邊。這是平常每天都有的流程。', say:{ wh:'料已送線' } });
  /* ---- 09:10 客戶甲的追加單 ---- */
  ev(DAY.RUSH.msgAt, { from:'ja', to:'boss', kind:'LINE', fly:'LINE：A1 再加 800', done:'老闆收到', cam:'office', src:'資料3',
    cap:'09:10 客戶甲在 LINE 傳來：「A1 再加 800」。（時間與內容依資料3；先傳給老闆依個案流程）',
    say:{ ja:'LINE：A1 再加 800', boss:'收到客戶甲的 LINE' }, cls:'' });

  if (plan.isBefore || (!f.intake && !f.gate)) {
    ev(9.2167, { from:'boss', to:'ja', kind:'LINE', fly:'沒問題', done:'客戶以為有交期', src:'示意', cls:'bad',
      cap:'老闆回客戶「沒問題」。這是口頭承諾：沒有試算，也沒有日期。（11/17 已決議停止這種做法）',
      say:{ boss:'口頭答應「沒問題」' } });
    ev(9.2667, { from:'boss', to:'sales', kind:'LINE', fly:'轉傳：A1 加 800', done:'業務收到', src:'示意',
      cap:'老闆把訊息轉到業務的 LINE 群組。', say:{ sales:'收到老闆轉傳' } });
    ev(9.4167, { from:'sales', to:'plan', kind:'口頭', fly:'排得進去嗎？', done:'生管：可以', src:'示意', cls:'warn',
      cap:'業務走去問生管「排得進去嗎？」生管說可以。沒有試算，也沒有紀錄。',
      say:{ sales:'口頭問生管', plan:'說可以，沒試算' } });
    ev(10.25, { from:'plan', to:'smt', kind:'口頭', fly:'甲的先做', done:'改排程', src:'資料3', cls:'bad',
      cap:'生管口頭通知 SMT 課長：「客戶甲的先做」。（課長備註原文）', say:{ plan:'口頭改排程' } });
    ev(T1020, { from:null, to:'smt', kind:'現場', cam:'smt', src:'資料3', cls:'bad', dur:0,
      cap:'10:20 現場才知道，比 LINE 晚 70 分鐘。1、2、4 線停線換 A1，3 線排程被打亂。',
      say:{ smt:'1、2、4 線停線換 A1' } });
    ev(10.4, { from:'smt', to:'wh', kind:'口頭', fly:'缺 A1 的料', done:'臨時調料', src:'示意', cls:'warn',
      cap:'SMT 跟倉庫要 A1 的料。倉庫臨時調料，共用零件被先領走。（零件跨機種共用：個案）',
      say:{ wh:'臨時調 A1 的料' } });
    ev(10.55, { from:'wh', to:'smt', kind:'料', fly:'A1 料車', done:'A1 料到線', dur:0.15, src:'示意', cap:'A1 的料推到 1、2、4 線。' });
    ev(T1020 + 0.9, { from:null, to:'smt', kind:'現場', cam:'line3', src:'資料3', cls:'bad', dur:0,
      cap:'3 線換完線，丙的 W0915（C2）缺料，停線等料 4 小時。（課長備註原文）', say:{ smt:'3 線等料 4 小時' } });
    ev(12.0, { from:null, to:'smt', kind:'現場', src:'示意', cls:'bad', dur:0,
      cap:'1 線 B2 的共用料被 A1 領走，缺料停線。', say:{ smt:'1 線也缺料' } });
    ev(13.0, { from:'plan', to:'sales', kind:'口頭', fly:'W0915 會晚', done:'業務知道', src:'示意', cls:'warn',
      cap:'生管告訴業務：丙的 W0915 會晚。', say:{ plan:'W0915 會晚' } });
    ev(13.15, { from:'sales', to:'jc', kind:'LINE', fly:'交期延後', done:'丙不滿', cam:'office', src:'示意', cls:'bad',
      cap:'業務通知客戶丙延後。丙的合約罰款每天 1%（個案）。', say:{ sales:'通知丙延後', jc:'交期被延後' } });
  } else if (f.intake) {
    ev(9.1833, { from:'boss', to:'ai', kind:'LINE', fly:'轉傳原文', done:'已收單', src:'決議', cls:'good',
      cap:'老闆不回客戶，只把訊息轉傳給「昇嶺插單」官方帳號，收到「已收單」。（11/17 老闆決議）',
      say:{ boss:'轉傳官方帳號', ai:'收到原文，原封保留' } });
    ev(9.2, { from:'ai', to:'sales', kind:'系統', fly:'欄位草稿＋追問', done:'業務看到', src:'demo', cls:'',
      cap:'AI 只做一件事：把原文拆成欄位。客戶甲、A1、800 片、追加；交期沒寫，請業務追問。',
      say:{ ai:'甲／A1／800／追加', sales:'看欄位、補交期' } });
    ev(9.2333, { from:'sales', to:'plan', kind:'系統', fly:'已確認需求單', done:'進入試算', src:'demo', cls:'good',
      cap:'業務在 LINE 小網頁確認送出。作業員不用多打任何字。', say:{ sales:'確認送出' } });
  } else {
    ev(9.2667, { from:'boss', to:'sales', kind:'LINE', fly:'轉傳：A1 加 800', done:'業務收到', src:'示意',
      cap:'沒有 AI 入口：老闆照舊轉傳給業務。', say:{ sales:'收到老闆轉傳' } });
    ev(plan.calcAt - 0.01, { from:'sales', to:'plan', kind:'系統', fly:'手動建需求單', done:'進入試算', src:'我猜的',
      cap:'業務在系統手動輸入需求單（時間是我們的假設）。', say:{ sales:'手動建單' } });
  }

  if (f.gate) {
    ev(plan.calcAt, { from:'plan', to:'plan', kind:'系統', cam:'office', src:'demo', cls:'good', dur:0,
      cap:'系統試算（固定程式，不用 AI）：建議排進 15:00 插單時段、只動 2 線；1、3、4 線不動，乙丙的單不被打斷。（15:00 時段是我們的假設）',
      say:{ plan:'看試算：15:00、2 線' } });
    ev(plan.adoptAt, { from:'plan', to:'sales', kind:'卡片', fly:'可交日', done:'收到可交日', src:'demo', cls:'good',
      cap:'生管採用建議，可交日卡片推到業務的 LINE。', say:{ plan:'採用建議', sales:'收到可交日' } });
    ev(plan.adoptAt + 0.01, { from:'plan', to:'boss', kind:'卡片', fly:'可交日卡片', done:'老闆看到結果', src:'demo', cls:'good',
      cap:'老闆同時收到可交日卡片，不用再自己答應客戶。', say:{ boss:'看到可交日卡片' } });
    const shipTxt = dayLabel(plan.a1.shipDay) + '12:00 前';
    ev(plan.replyAt, { from:'sales', to:'ja', kind:'LINE', fly:'A1 800 片 ' + shipTxt + '出貨', done:'客戶甲有日期', src:'推算', cls:'good',
      cap:'業務依試算回覆客戶甲：A1 800 片 ' + shipTxt + '出貨。比現在晚約 1 天，但有日期、做得到。（甲最多延後 1 天是我們的假設）',
      say:{ sales:'依試算回覆', ja:'收到交期 ' + shipTxt } });
    ev(13.5, { from:'plan', to:'wh', kind:'工單', fly:'齊料單（15:00）', done:'依試算齊料', cam:'wh', src:'我猜的',
      cap:'倉庫依試算提前 1.5 小時把 A1 的料備齊。（時段前 1.5 小時齊料是我們的假設）', say:{ wh:'齊料：A1 15:00' } });
    ev(13.7, { from:'wh', to:'smt', kind:'料', fly:'A1 料車', done:'料在 2 線旁待命', dur:0.15, src:'我猜的', cap:'A1 料車推到 2 線旁待命。' });
    if (f.smed) ev(14.2, { from:null, to:'smt', kind:'現場', src:'我猜的', dur:0, cap:'技術員在線外先把 A1 的飛達裝好（換線外部化，第二階段）。', say:{ smt:'線外預裝飛達' } });
    ev(15.0, { from:null, to:'smt', kind:'現場', cam:'line2', src:'推算', cls:'good', dur:0,
      cap:'15:00 時段：只有 2 線換 A1，換線 ' + plan.extra.co.toFixed(1) + ' h（導入前四線合計 3.8 h）。1、3、4 線照原排程。',
      say:{ smt:'只有 2 線換 A1' } });
    ev(15.05, { from:null, to:'smt', kind:'現場', cam:'line3', src:'推算', cls:'warn', dur:0,
      cap:'A1 上線後各線仍有等料，合計 ' + plan.extra.mw.toFixed(1) + ' h（導入前 7.0 h）。' + (f.intake ? '入口讓等料少 3 成' : '閘門本身不減等料') + (f.kit ? '，齊套再減一半。' : '；齊套屬第二階段。'),
      say:{ smt:'等料 ' + plan.extra.mw.toFixed(1) + ' h' } });
  } else if (!plan.isBefore && f.intake) {
    ev(9.2667, { from:'plan', to:'smt', kind:'口頭', fly:'甲的先做', done:'改排程', src:'示意', cls:'bad',
      cap:'沒有閘門：生管照舊口頭插單，沒有試算。只是現場早一點知道。', say:{ plan:'口頭插單，沒試算' } });
    ev(plan.insertAt, { from:null, to:'smt', kind:'現場', cam:'smt', src:'示意', cls:'bad', dur:0,
      cap:hhmm(plan.insertAt) + ' 現場就知道，比原本早約 1 小時，但一樣當場停線換線。', say:{ smt:'1、2、4 線停線換 A1' } });
    ev(9.3, { from:'sales', to:'ja', kind:'LINE', fly:'會盡快', done:'沒有日期', src:'示意', cls:'warn',
      cap:'沒有試算，業務只能回「會盡快」，給不出日期。', say:{ sales:'回「會盡快」' } });
  }

  /* ---- 下午：品保、A1 完成、裝箱出貨 ---- */
  if (plan.isBefore) ev(14.0, { from:'qa', to:'qa', kind:'現場', cam:'down', src:'資料3', cls:'bad', dur:0,
      cap:'測試：機台怪怪的，重測。當天重測 640 片（平日約 290）。（課長備註原文）', say:{ qa:'重測 640 片' } });
  if (plan.a1.doneAt != null) ev(plan.a1.doneAt, { from:'smt', to:'man', kind:'板', fly:'A1 800 片', done:'A1 進後段', dur:0.15, src:'推算',
      cap:hhmm(plan.a1.doneAt) + ' A1 800 片做完，送到後段。做 A1 的線換回原機種。', say:{ smt:'A1 做完' } });
  ev(17.5, { from:'man', to:'ship', kind:'板', fly:'成品裝箱', done:'送出貨區', dur:0.2, cam:'down', src:'示意',
    cap:'後段裝箱，今天的成品送到出貨區。', say:{ man:'裝箱', ship:'成品進出貨區' } });
  const extraTxt = plan.extraH.toFixed(1);
  ev(DAY.H1, { from:null, to:'ship', kind:'現場', cam:'overview', dur:0,
    src: plan.isBefore ? '資料3' : '推算', cls: plan.isBefore ? 'bad' : 'good',
    cap: plan.isBefore
      ? '收工。開機 47.3 h、正常運轉 27.3 h、稼動率 58%（九月最低），出貨 4,100 片（平日 4,820），重測 640 片。比平日多停 10.9 h。'
      : '收工。多停 ' + extraTxt + ' h（導入前 10.9 h），稼動率 ' + Math.round(plan.util*100) + '%（導入前 58%），SMT 產出約 ' + Math.round(plan.ship).toLocaleString('en-US') + ' 片（推算）。'
        + (plan.a1.doneAt != null ? '' : 'A1 今天做了 ' + Math.round(plan.a1.done) + ' 片，其餘 ' + dayLabel(1) + ' 約 ' + hhmm(plan.a1.nextDayDoneAt) + ' 做完。'),
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
