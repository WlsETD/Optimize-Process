/* =====================================================================
   資料與模型層
   來源等級：
     real  = 資料1_近十二個月概況.xlsx 原檔（已開啟核對）
     model = 產線模擬器月度模型（model.js 同公式）
     calc  = 由上述數字直接推算，未加新假設
     guess = 我猜的（假設，須確認）
   ===================================================================== */
const SRC = {
  real:  { k: 'real',  label: '實際',   note: '資料1 原檔' },
  model: { k: 'model', label: '模擬',   note: '月度模型，效果強度為假設' },
  calc:  { k: 'calc',  label: '推算',   note: '由實際值與模型差額推算' },
  guess: { k: 'guess', label: '我猜的', note: '假設，須確認' }
};

/* ---- 資料1：產銷概況（2025/10 – 2026/09，原檔逐列） ---- */
const MONTHS = ['2025/10','2025/11','2025/12','2026/01','2026/02','2026/03',
                '2026/04','2026/05','2026/06','2026/07','2026/08','2026/09'];
/* [接單千片, 追加單與換零件次, 出貨千片, 準時交貨率, 加班小時, 重測比率, 客訴合計, 客訴交期, 客訴品質] */
const SALES = [
  [115, 2, 114, 0.94, 1700, 0.03,  2,  1, 1],
  [116, 2, 115, 0.94, 1750, 0.03,  3,  1, 2],
  [120, 3, 118, 0.93, 1900, 0.03,  3,  1, 2],
  [112, 2, 111, 0.94, 1650, 0.03,  2,  0, 2],
  [ 98, 2,  97, 0.95, 1400, 0.03,  2,  1, 1],
  [116, 3, 115, 0.93, 1750, 0.03,  3,  1, 2],
  [118, 3, 116, 0.93, 1800, 0.03,  3,  1, 2],
  [121, 4, 118, 0.92, 2100, 0.03,  4,  2, 2],
  [124, 6, 119, 0.90, 2500, 0.04,  5,  3, 2],
  [126, 8, 117, 0.85, 3000, 0.05,  8,  5, 3],
  [128,10, 116, 0.81, 3400, 0.06, 11,  8, 3],
  [127,12, 114, 0.78, 3700, 0.07, 14, 10, 4]
];
/* ---- 資料1：現場概況 ---- */
/* [人工效率, SMT開機h, SMT正常運轉h, SMT稼動率, 換線次, 換線停機h, 等料停機h, 拋料故障h] */
const FLOOR = [
  [0.94, 854, 760, 0.89,  58,  42, 28, 24],
  [0.95, 865, 767, 0.89,  60,  44, 29, 25],
  [0.95, 893, 787, 0.88,  64,  48, 32, 26],
  [0.95, 831, 740, 0.89,  56,  41, 27, 23],
  [0.95, 726, 647, 0.89,  48,  35, 23, 21],
  [0.95, 869, 767, 0.88,  62,  46, 31, 25],
  [0.95, 881, 773, 0.88,  64,  48, 33, 27],
  [0.96, 914, 787, 0.86,  76,  59, 39, 29],
  [0.96, 945, 793, 0.84,  92,  74, 46, 32],
  [0.96, 965, 780, 0.81, 112,  95, 53, 37],
  [0.96, 987, 773, 0.78, 130, 114, 58, 42],
  [0.96,1003, 760, 0.76, 148, 133, 62, 48]
];
/* ---- 匯入月份（模擬器「資料月份」按鈕）：有匯入時，把那個月接在九月後面，當成新的基準月 ----
   資料存在這台電腦的瀏覽器（localStorage）。沒有匯入時一切照舊，基準月＝九月（個案資料）。 */
const N_CASE = 12;                                    // 個案的十二個月（擬合只用這 12 個月）
const CUR = (() => { let raw = null;
  try { raw = localStorage.getItem('sl_month_v1'); } catch (e) { /* file:// 或嵌入頁面可能不允許 */ }
  if (!raw) { try { const n = String(window.name || ''); if (n.startsWith('slm:')) raw = n.slice(4); } catch (e) { /* 略過 */ } }
  try { const o = JSON.parse(raw || 'null');
  return o && o.v === 1 && Array.isArray(o.days) && o.days.length > 5 && o.sales && o.floor ? o : null; } catch (e) { return null; } })();
const CN_M = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const CM = CUR
  ? { ym: CUR.ym, m: CUR.month, name: CN_M[CUR.month] + '月', ai: CUR.src === 'ai', tag: CUR.src === 'ai' ? 'AI模擬' : '匯入', file: CUR.file || '' }
  : { ym: '2026/09', m: 9, name: '九月', ai: false, tag: '資料3', file: '' };
if (CUR) { MONTHS.push(CUR.ym); SALES.push(CUR.sales.slice()); FLOOR.push(CUR.floor.slice()); }
if (CUR) { SRC.real.label = CM.tag; SRC.real.note = CM.ai ? 'AI 模擬產生的月份資料，不是企業資料' : '匯入的月份資料'; }
const nf = (x, d) => Number(x).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
const LAST = SALES.length - 1;                 // 基準月：九月，或匯入的月份
const SEP  = { s: SALES[LAST], f: FLOOR[LAST] };   // 名稱沿用 SEP：代表「基準月」
const LINES = 4, WORKDAYS = CUR ? CUR.days.length : 26;   // 〔資料3〕四條線、26 工作日（匯入月份用該月工作天數）
const PRICE = 1200;                            // 〔個案單〕元／片（個案平均）
const PENALTY_SEP = CUR ? CUR.money.pen : 590000;     // 〔個案單〕九月罰款 乙42萬＋丙17萬（匯入月份用該月數字）
const MARGIN = 0.15;                            // 〔個案單〕毛利約 15%
const CLAIM_SEP = CUR ? CUR.money.claim : 250000;     // 〔個案單〕九月客訴處理與退貨 25 萬
const OTCOST_SEP = CUR ? CUR.money.otcost : 510000;                      // 〔個案單〕比四月多出來的加班費 51 萬（1,900 h × 約 268 元）
const SYS_MONTHLY = 6000, SYS_ONEOFF = 150000;  // 系統月費 0.6 萬、一次性 15 萬（系統 12 萬＋換線試算 3 萬）— 我猜的，要向廠商報價
const OT_CAP = 3700;                           // 〔個案單〕加班上限 h／月
const TARGET = { ship: CUR ? Math.round(SEP.s[2] * 11) / 10 : 125.4, otd: 0.90, otdA: 0.87 };   // 匯入月份：目標＝該月出貨 × 1.1（個案的 +10% 口徑）

/* ---------------------------------------------------------------------
   月度模型：與 model.js 完全相同的公式，插單次數 ev 與接單 orders 改為參數
   效果強度 s：1.0 ＝ 我們假設的完整效果，不是實測
   ------------------------------------------------------------------- */
const BASE = { coInt:36, coPer:9.33, hBase:0.72, hSlope:0.0179, mwInt:17.3, mwPer:3.72,
  fInt:19.4, fPer:2.38, retBase:2785, retPerCO:34.9, backlog:44, open0:1003,
  stdSec:{ins:50,test:46,asm:32,pack:16}, actSec:{ins:45,test:40,asm:30,pack:15}, eff:0.96 };
if (CUR) { BASE.open0 = SEP.f[1]; BASE.eff = SEP.f[0]; }   // 匯入月份：開機時數、人工效率用該月
const lerp = (a,b,t) => a + (b-a)*t;
/* 料到日確認：九月等料 62 h 中，9/10、9/11、9/17 三天共 19 h 是丙換零件／追加的供應商類等料（資料3 備註與停機紀錄）。
   把這 19 h 當成每張插單的固定比例（19 ÷ 九月每張插單等料 3.72×12），再乘「能避免的比例」LABOR.etaShare【我猜的】。 */
const ETA_SUP = { h:19, ev:12 };
const ETA_FRAC = ETA_SUP.h / (BASE.mwPer * ETA_SUP.ev);

/* 人工站可用站時＝九月記錄工時（含九月已用滿的加班）。LABOR.stationExtraH＝「額外可用時數」（產線省下人時轉調、或把現有加班改派過來，
   折成人工站有效人時／月；預設 0，我猜的）。依四站原可用時數比例平均分配（保守：實際可以只補最忙的站，效果會更好）。 */
function stAvail(k) {
  const b = k2 => SEP.s[2] * 1000 * BASE.stdSec[k2] / 3600 / BASE.eff, X = LABOR.stationExtraH || 0;
  return X ? b(k) * (1 + X / (b('ins') + b('test') + b('asm') + b('pack'))) : b(k);
}
const noExtra = f => { const x = LABOR.stationExtraH; LABOR.stationExtraH = 0; try { return f(); } finally { LABOR.stationExtraH = x; } };   /* 九月基準列不含額外時數 */
function simMonth(ids, s, ev, orders) {
  ev = (ev == null) ? SEP.s[1] : ev;
  orders = (orders == null) ? SEP.s[0] : orders;
  const ON = new Set(ids), on = id => ON.has(id) ? Math.min(1,s) : 0, onx = id => ON.has(id) ? s : 0;
  const p = {};
  p.coPer = lerp(BASE.coPer, 3.0, on('gate'));
  p.fPer  = lerp(BASE.fPer,  1.5, on('gate'));
  const hNow = BASE.hBase + BASE.hSlope * Math.max(0, ev - 2);
  p.hco = Math.max(0.3, hNow);                       // 換線時間不變：換線外部化已移出（不買機台、不加人）
  p.fInt = BASE.fInt;
  p.retPerCO = BASE.retPerCO;
  p.mwInt = lerp(BASE.mwInt, 10, on('kit'));
  const kitA = Math.max(on('kit'), on('kitsel'));              // 完整齊套與選擇性齊套二選一；每張插單的等料都 ×0.50【我猜的】
  const etaOn = ON.has('gate') ? on('eta') : 0;                 // 料到日確認依附在交期試算閘門：沒有閘門就沒有效果
  p.mwPer = BASE.mwPer * (1 - 0.30*on('intake')) * (1 - 0.50*kitA) * (1 - ETA_FRAC*LABOR.etaShare*etaOn);
  p.disrupt = Math.max(0.1, 1 - 0.35*onx('gate') - 0.30*onx('intake') - 0.20*onx('realsched'));
  p.retBase = lerp(BASE.retBase, 1700, on('test'));
  p.pool = 0.6 * on('cross');

  const co  = BASE.coInt + p.coPer*ev;
  const coH = co * p.hco;
  const mwH = p.mwInt + p.mwPer*ev;
  const flH = p.fInt + p.fPer*ev;
  const stops = coH + mwH + flH;
  const run = Math.max(0, BASE.open0 - stops);
  const smtCap = run * 150 / 1000;

  const logged = {};
  for (const k of ['ins','test','asm','pack']) logged[k] = stAvail(k);
  const retestFor = x => p.retBase*(x/114) + p.retPerCO*co;
  const capOf = (k,x) => k === 'test'
    ? (logged.test*3600/BASE.actSec.test - retestFor(x))/1000
    : logged[k]*3600/BASE.actSec[k]/1000;
  const totH = Object.values(logged).reduce((a,b)=>a+b,0)*3600;
  const per = BASE.actSec.ins + BASE.actSec.test + BASE.actSec.asm + BASE.actSec.pack;
  let guess = smtCap, manCap = 0;
  for (let i=0;i<5;i++) {
    const caps = ['ins','test','asm','pack'].map(k => capOf(k,guess));
    const sep = Math.min.apply(null, caps);
    const pooled = (totH - retestFor(guess)*BASE.actSec.test)/per/1000;
    manCap = sep + p.pool*Math.max(0, pooled - sep);
    guess = Math.min(smtCap, manCap);
  }
  const ship = Math.min(smtCap, manCap, orders + BASE.backlog/3);
  const otd  = Math.min(0.975, Math.max(0.4, 1.819 - 0.854*(orders/ship) - 0.0067*ev*p.disrupt));
  const retest = retestFor(ship)/(ship*1000);
  const limiter = ship === smtCap ? 'SMT（換線與停機）' : (ship === manCap ? '人工站（插件）' : '接單量');
  return { ship, otd, retest, co, rush: p.coPer*ev, coH, mwH, flH, stops, run, open: BASE.open0,
           util: run/BASE.open0, smtCap, manCap, disrupt: p.disrupt, limiter, ev, orders,
           perLine: { run: run/(LINES*WORKDAYS), co: coH/(LINES*WORKDAYS),
                      wait: mwH/(LINES*WORKDAYS), fault: flH/(LINES*WORKDAYS) } };
}

/* ---------------------------------------------------------------------
   單筆插單模型（rushCalc，與 model.js 相同公式）
   ------------------------------------------------------------------- */
const H_PER_LINE_DAY = 7.3, RATE = 150;
function rushCalc(o) {
  const prod = o.qty/RATE, h = 0.90;
  const A = { co: 9.33 };
  A.coh = A.co*h;
  A.mw  = 3.72 * (o.chan === 'formal' ? 0.7 : 1) * (o.type === 'eco' ? 1.3 : 1);
  A.flt = 2.38;
  A.lost = A.coh + A.mw + A.flt;
  A.total = prod + A.lost;
  A.delayDays = Math.max(0.5, Math.round(A.total/H_PER_LINE_DAY*2)/2);
  const B = { co: o.same ? 1 : 3 };
  B.coh = B.co*0.60;
  B.mw  = 3.72*0.35*(o.type === 'eco' ? 1.3 : 1);
  B.flt = 1.5;
  B.lost = B.coh + B.mw + B.flt;
  B.total = prod + B.lost;
  B.delayDays = Math.max(0.5, Math.round(B.lost/H_PER_LINE_DAY*2)/2);
  /* 只含 P1（閘門＋入口）：換線時間維持 0.90 h，人工等待只吃入口的 0.7 */
  const P1 = { co: 3 };
  P1.coh = P1.co*0.90;
  P1.mw  = 3.72*0.7*(o.type === 'eco' ? 1.3 : 1);
  P1.flt = 1.5;
  P1.lost = P1.coh + P1.mw + P1.flt;
  P1.total = prod + P1.lost;
  P1.delayDays = Math.max(0.5, Math.round(P1.lost/H_PER_LINE_DAY*2)/2);
  for (const X of [A,B,P1]) { X.boards = X.lost*RATE; X.prod = prod; }
  return { A, B, P1 };
}

/* ---------------------------------------------------------------------
   回歸：由十二個月歷史推算模型沒有輸出的指標
   客訴（交期）← 延遲率；客訴（品質）← 重測比率
   ------------------------------------------------------------------- */
function fit(xs, ys) {
  const n = xs.length;
  const sx = xs.reduce((a,b)=>a+b,0), sy = ys.reduce((a,b)=>a+b,0);
  const sxy = xs.reduce((a,x,i)=>a+x*ys[i],0), sxx = xs.reduce((a,x)=>a+x*x,0);
  const b = (n*sxy - sx*sy)/(n*sxx - sx*sx), a = (sy - b*sx)/n;
  const ym = sy/n;
  const ss = ys.reduce((t,y)=>t+(y-ym)*(y-ym),0);
  const rs = ys.reduce((t,y,i)=>t+Math.pow(y-(a+b*xs[i]),2),0);
  return { a, b, r2: 1 - rs/ss };
}
const FIT_LATE = fit(SALES.slice(0, N_CASE).map(r=>1-r[3]), SALES.slice(0, N_CASE).map(r=>r[7]));
const FIT_QUAL = fit(SALES.slice(0, N_CASE).map(r=>r[5]),   SALES.slice(0, N_CASE).map(r=>r[8]));
const lateOf = otd => Math.max(0, FIT_LATE.a + FIT_LATE.b*(1-otd));
const qualOf = ret => Math.max(0, FIT_QUAL.a + FIT_QUAL.b*ret);

/* ---------------------------------------------------------------------
   功能註冊表：新增一項功能只要加一筆，勾選框、圖標與模型都會自動帶入
   model 欄位對應月度模型的開關 id
   ------------------------------------------------------------------- */
const FEATURES = [
  { id:'intake', model:'intake', name:'單一插單入口', short:'入口', phase:1, demo:true,
    desc:'業務貼上 LINE 原文，AI 一次拆齊欄位、缺項追問，減少來回澄清',
    effect:'人工站等料 ×0.70；插單擾動 −0.30【我猜的】',
    icon:'M3 5h18v11H8l-5 4V5z M7 9h10 M7 12h7' },
  { id:'gate', model:'gate', name:'交期試算閘門', short:'閘門', phase:1, demo:true,
    desc:'無試算紀錄不放行回覆；插單排進預留時段，只有損失工時推擠其他單',
    effect:'每張插單換線 9.33→3.0 次；故障拋料 2.38→1.5 h；擾動 −0.35【我猜的】（9.33、2.38 由資料1 回歸推算，改善後的數字是假設）',
    icon:'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z M9 12l2 2 4-4' },
  { id:'kit', model:'kit', name:'齊套上線', short:'齊套', phase:2, demo:true, kitdemo:true, excl:['kitsel'],
    desc:'倉庫在換線前把料、鋼板、飛達、夾具點齊，料齊才換線上線；SMT 少等料，倉庫多備料（倉庫排不排得下沒有資料）',
    effect:'SMT 等料停機：固定值 17.3→10 h、每張插單 ×0.50【我猜的】',
    icon:'M3 8l9-5 9 5v8l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v8' },
  { id:'kitsel', model:'kitsel', name:'選擇性齊套', short:'選齊', phase:2, demo:true, kitdemo:true, opt:true, excl:['kit'],
    desc:'只對「插單、換零件」的換線做齊套（料、鋼板、飛達、夾具點齊才換線），一般換線照舊依工單備料；和完整齊套二選一',
    effect:'只動每張插單的等料 ×0.50【我猜的】，固定的 17.3 h 不變；備料只算插單換線次數',
    icon:'M3 8l9-5 9 5v8l-9 5-9-5V8z M8 12l3 3 5-5' },
  { id:'eta', model:'eta', name:'料到日確認', short:'料到日', phase:2, demo:true, kitdemo:true, opt:true, needs:['gate'],
    desc:'交期試算前，倉庫先回報插單機種新料的到料日；閘門不把插單排在料到之前，機台先做料齊的單（需要有替代單可排；依附交期試算閘門）',
    effect:'供應商類等料（九月 19 h，資料3）依比例減少，能避免的比例 5 成【我猜的】；倉庫每張插單多回報 3 分【我猜的】',
    icon:'M5 4h14v16H5z M5 9h14 M9 3v3 M15 3v3 M9 14l2 2 4-4' },
  { id:'realsched', model:'realsched', name:'排程用實際換線時間', short:'實排', phase:2, demo:true, page:'sched',
    desc:'排程不再用固定 0.5 h／線／天，改用近 26 個工作日滾動平均',
    effect:'插單擾動 −0.20【我猜的】',
    icon:'M4 5h16v15H4z M4 9h16 M8 3v4 M16 3v4 M9 13l2 2 4-4' },
  { id:'test', model:'test', name:'測試站重測減量', short:'重測', phase:2, demo:false,
    desc:'降低重測基數',
    effect:'重測基數 2785→1700【我猜的】（2785 由資料1 回歸推算）',
    icon:'M6 3h12 M9 3v6l-4 9a2 2 0 002 2h10a2 2 0 002-2l-4-9V3' },
  { id:'cross', model:'cross', name:'人力交叉支援', short:'交叉', phase:2, demo:false,
    desc:'人工站互相支援，吃掉單站瓶頸',
    effect:'人力池係數 0.6【我猜的】',
    icon:'M9 7a3 3 0 106 0 3 3 0 10-6 0 M4 20c0-3 3.6-5 8-5s8 2 8 5 M2 11h4 M18 11h4' },
  { id:'fair', model:'fair', name:'罰款加權排序', short:'排序', phase:2, demo:true,
    desc:'會遲的單依「晚一天的損失」排序（團隊提案 11/17；導入前須老闆確認）',
    effect:'月度模型未建模，效益為 0；屬排序公平性，不是產能',
    icon:'M12 3v18 M5 8h14 M7 8l-3 6h6l-3-6 M17 8l-3 6h6l-3-6', warn:'待老闆確認' }
];
const P1_IDS = FEATURES.filter(f=>f.phase===1).map(f=>f.id);
/* Lv 分級（團隊 11/19 定）：依套用後的價值排序，T0 最高。價值＝對「出貨 +10%、準時率 ≥ 90%」的貢獻，再看有沒有踩「不加人、不買機台、加班不增加」。
   test、cross 團隊沒有指定，暫放 T2，待確認。 */
const FEAT_LV = { intake:0, gate:0, realsched:1, kit:1, eta:2, kitsel:2, fair:2, test:2, cross:2 };
const FEAT_ORD = ['intake','gate','realsched','kit','eta','kitsel','fair','test','cross'];
const FEAT_WHY = {
  intake:'把插單收成一個入口，閘門才有資料可算；單獨約 +2 千片、準時率 +4 個百分點',
  gate:'最大的單項：單獨就能到約 125.8 千片、準時率 90.5%（換線次數 148→72）',
  realsched:'準時率約 +1.6 個百分點，不增加出貨；排程不再低估換線，試算才準；成本只有每月 1 h',
  kit:'效果沒有打滿時補出貨（強度 0.65 約 +2.5 千片），但倉庫工作變多，可能踩到「不加人」',
  eta:'有九月資料支撐（19 h 供應商類等料），倉庫淨減；出貨貢獻比選擇性齊套小',
  kitsel:'比完整齊套省倉庫工；出貨貢獻略大於料到日確認；倉庫仍有新工作',
  fair:'只改先後、不改產能，模擬沒量化；導入前須老闆確認',
  test:'模擬裡不增加出貨與準時率；省重測人時（團隊尚未指定 Lv，暫放 T2）',
  cross:'唯一能把人工站上限再往上推的項目，但靠「人力池 0.6」的猜測（團隊尚未指定 Lv，暫放 T2）'
};
const featView = () => FEATURES.slice().sort((a, b) => FEAT_LV[a.id] - FEAT_LV[b.id] || FEAT_ORD.indexOf(a.id) - FEAT_ORD.indexOf(b.id));
const HAS_DEMO = f => !!(f.demo || f.page);                 /* 有 Demo 才能導入：沒有 Demo 的功能（重測減量、人力交叉支援）只留方塊與說明，不進模擬 */
const FULL_IDS = FEATURES.filter(f=>!f.opt && HAS_DEMO(f)).map(f=>f.id);   /* 有 Demo 的原有功能；選擇性齊套與料到日確認是倉庫減負的選項，不算在「全套」裡 */

/* ---------------------------------------------------------------------
   情境計算：導入後 ＝ 九月實際值 ＋ 模型差額（老闆已確認的口徑）
   ------------------------------------------------------------------- */
/* 導入後 ＝ 九月實際值 ＋（情境模型 − 九月基準模型）。
   基準固定為九月（ev=12、無任何功能），所以插單次數變多時「不導入」那條也會跟著惡化。
   回歸推算的客訴同樣錨定在九月實際值，避免在「沒有任何改變」時出現假改善。 */
const BASE0 = simMonth([], 0, SEP.s[1]);
function scenario(ids, strength, ev) {
  if (ev == null) ev = SEP.s[1];
  const base = BASE0;
  const now  = simMonth(ids.map(id => (FEATURES.find(f=>f.id===id)||{}).model).filter(Boolean), strength, ev);
  const aSep = SEP.s, fSep = SEP.f;
  const d = m => now[m] - base[m];
  const clamp01 = x => Math.max(0, Math.min(1, x));

  const otdAfter    = Math.min(0.975, clamp01(aSep[3] + d('otd')));
  const retestAfter = Math.max(0, aSep[5] + d('retest'));
  const shipAfter   = aSep[2] + d('ship');
  const coAfter     = Math.max(0, fSep[4] + d('co'));
  const runAfter    = fSep[2] + d('run');
  const utilBefore  = fSep[2]/fSep[1], utilAfter = runAfter/fSep[1];
  const lateBefore  = aSep[7];
  const lateAfter   = Math.max(0, lateBefore + (lateOf(otdAfter) - lateOf(aSep[3])));
  const qualBefore  = aSep[8];
  const qualAfter   = Math.max(0, qualBefore + (qualOf(retestAfter) - qualOf(aSep[5])));
  /* 月效益（萬元）：個案單的單價、毛利與九月損失 × 模擬出的變化；比例假設是【我猜的】 */
  const penAfter    = PENALTY_SEP * (1 - otdAfter) / (1 - aSep[3]);
  const claimAfter  = CLAIM_SEP * (lateAfter + qualAfter) / (lateBefore + qualBefore);
  const gmAfter     = Math.max(0, shipAfter - aSep[2]) * 1000 * PRICE * MARGIN;
  const anyOn       = ids.length > 0;
  const valueAfter  = anyOn ? gmAfter + (PENALTY_SEP - penAfter) + (CLAIM_SEP - claimAfter) - SYS_MONTHLY : 0;

  return {
    ids, strength, ev, model: { base, now },
    rows: [
      { k:'ship',   name:'出貨',             unit:'千片',  before:aSep[2], after:shipAfter,
        src:'calc', target:TARGET.ship, dec:1,
        how:CM.name+'實際 '+nf(aSep[2],CUR?1:0)+' ＋ 模型差額（'+base.ship.toFixed(1)+'→'+now.ship.toFixed(1)+'）' },
      { k:'otd',    name:'準時交貨率',       unit:'%',    before:aSep[3], after:otdAfter,
        src:'calc', target:TARGET.otd, pct:true, dec:1,
        how:CM.name+'實際 '+nf(aSep[3]*100)+'% ＋ 模型差額（'+(base.otd*100).toFixed(1)+'%→'+(now.otd*100).toFixed(1)+'%）' },
      { k:'orders', name:'接單',             unit:'千片',  before:aSep[0], after:aSep[0],
        src:'real', dec:0, how:'需求不因導入而改變，維持'+CM.name+' '+nf(aSep[0])+' 千片' },
      { k:'rush',   name:'追加單與換零件',   unit:'次',    before:ev, after:ev,
        src:ev===SEP.s[1]?'real':'guess', dec:0, how:'插單件數不因導入而改變；系統改變的是處理方式' },
      { k:'co',     name:'換線次數',         unit:'次',    before:fSep[4], after:coAfter,
        src:'calc', lowerBetter:true, dec:0, how:CM.name+'實際 '+nf(fSep[4])+' ＋ 模型差額（'+base.co.toFixed(0)+'→'+now.co.toFixed(0)+'）' },
      { k:'coH',    name:'換線停機',         unit:'h',    before:fSep[5], after:Math.max(0,fSep[5]+d('coH')),
        src:'calc', lowerBetter:true, dec:1, how:CM.name+'實際 '+nf(fSep[5],CUR?1:0)+' ＋ 模型差額' },
      { k:'waitH',  name:'等料停機',         unit:'h',    before:fSep[6], after:Math.max(0,fSep[6]+d('mwH')),
        src:'calc', lowerBetter:true, dec:1, how:CM.name+'實際 '+nf(fSep[6],CUR?1:0)+' ＋ 模型差額' },
      { k:'faultH', name:'拋料與故障停機',   unit:'h',    before:fSep[7], after:Math.max(0,fSep[7]+d('flH')),
        src:'calc', lowerBetter:true, dec:1, how:CM.name+'實際 '+nf(fSep[7],CUR?1:0)+' ＋ 模型差額' },
      { k:'run',    name:'SMT 正常運轉',     unit:'h',    before:fSep[2], after:runAfter,
        src:'calc', dec:0, how:CM.name+'實際 '+nf(fSep[2])+' ＋ 模型差額（'+base.run.toFixed(0)+'→'+now.run.toFixed(0)+'）' },
      { k:'util',   name:'SMT 稼動率',       unit:'%',    before:utilBefore, after:utilAfter,
        src:'calc', pct:true, dec:1,
        how:CUR ? '正常運轉 ÷ 開機 '+nf(fSep[1],1)+' h（開機時數不變）' : '正常運轉 ÷ 開機 1,003 h（開機時數不變）；九月 760÷1,003＝75.8%，原檔記 76%' },
      { k:'retest', name:'重測比率',         unit:'%',    before:aSep[5], after:retestAfter,
        src:'calc', pct:true, dec:2, lowerBetter:true,
        how:CM.name+'實際 '+nf(aSep[5]*100,CUR?1:0)+'% ＋ 模型差額（'+(base.retest*100).toFixed(2)+'%→'+(now.retest*100).toFixed(2)+'%）' },
      { k:'ot',     name:'加班',             unit:'h',    before:aSep[4], after:aSep[4],
        src:'guess', dec:0, lowerBetter:true, cap:OT_CAP,
        how:'【我猜的】假設維持'+(CUR ? CM.name+' '+nf(aSep[4])+' h' : '不增加')+'（上限 3,700 h）。模型沒有加班輸出，不宣稱會下降' },
      { k:'cLate',  name:'客訴：交期',       unit:'件',    before:lateBefore, after:lateAfter,
        src:'guess', dec:1, lowerBetter:true,
        how:CM.name+'實際 '+lateBefore+' 件 ＋ 回歸差額。回歸自十二個月歷史：件數 = '+FIT_LATE.a.toFixed(2)+' + '+FIT_LATE.b.toFixed(1)+' × 延遲率（R²='+FIT_LATE.r2.toFixed(2)+'）【我猜的】' },
      { k:'cQual',  name:'客訴：品質',       unit:'件',    before:qualBefore, after:qualAfter,
        src:'guess', dec:1, lowerBetter:true,
        how:CM.name+'實際 '+qualBefore+' 件 ＋ 回歸差額。回歸自十二個月歷史：件數 = '+FIT_QUAL.a.toFixed(2)+' + '+FIT_QUAL.b.toFixed(1)+' × 重測比率（R²='+FIT_QUAL.r2.toFixed(2)+'）【我猜的】' },
      { k:'cAll',   name:'客訴合計',         unit:'件',    before:lateBefore+qualBefore, after:lateAfter+qualAfter,
        src:'guess', dec:1, lowerBetter:true, how:'交期＋品質（原檔十二個月皆為兩者相加）' },
      { k:'penalty',name:'延遲罰款',         unit:'萬元',  before:PENALTY_SEP/1e4, after:penAfter/1e4,
        src:'guess', dec:1, lowerBetter:true, money:true,
        how:(CUR ? CM.name+'罰款 '+nf(PENALTY_SEP/1e4,1)+' 萬〔'+CM.tag+'〕×（導入後延遲率 ÷ '+CM.name+'延遲率 '+nf((1-aSep[3])*100)+'%）。' : '九月實際 59 萬〔個案單：乙 42＋丙 17〕×（導入後延遲率 ÷ 九月延遲率 22%）。')+'【我猜的】假設罰款與整體延遲率成正比；乙、丙費率不同（2%／1% 每天），實際要看乙丙各自的準時率' },
      { k:'claimC', name:'客訴處理與退貨',   unit:'萬元',  before:CLAIM_SEP/1e4, after:claimAfter/1e4,
        src:'guess', dec:1, lowerBetter:true, money:true,
        how:(CUR ? CM.name+' '+nf(CLAIM_SEP/1e4,1)+' 萬〔'+CM.tag+'〕×（導入後客訴件數 ÷ '+CM.name+' '+(lateBefore+qualBefore)+' 件）。' : '九月實際 25 萬〔個案單〕×（導入後客訴件數 ÷ 九月 14 件）。')+'【我猜的】假設處理成本與客訴件數成正比' },
      { k:'otCost', name:'比四月多出的加班費', unit:'萬元', before:OTCOST_SEP/1e4, after:OTCOST_SEP/1e4,
        src:'guess', dec:1, lowerBetter:true, money:true,
        how:(CUR ? CM.name+' '+nf(OTCOST_SEP/1e4,1)+' 萬〔'+CM.tag+'：（加班 '+nf(aSep[4])+' − 1,800 h）× 268 元〕。加班維持 '+nf(aSep[4])+' h，所以不省' : '九月 51 萬〔個案單：多加班 1,900 h × 約 268 元〕。加班維持 3,700 h，所以不省；個案只要求不再增加') },
      { k:'gm',     name:'多出貨帶來的毛利', unit:'萬元',  before:0, after:gmAfter/1e4,
        src:'calc', dec:1, money:true,
        how:'（導入後出貨 − '+CM.name+' '+nf(aSep[2],CUR?1:0)+' 千片）× 1,200 元 × 毛利 15%〔個案單〕。用平均毛利是保守算法：固定成本不隨產量增加，實際多賺的可能更多' },
      { k:'value',  name:'每月效益合計',     unit:'萬元',  before:0, after:valueAfter/1e4,
        src:'guess', dec:1, money:true, total:true,
        how:'多出貨毛利 ＋ 少付的罰款 ＋ 少花的客訴處理 − 系統月費 0.6 萬【我猜的】。另有一次性約 15 萬【我猜的】，'+(valueAfter > 0 ? '約 '+(SYS_ONEOFF/valueAfter*30).toFixed(1)+' 天回本' : '目前沒有效益，不會回本')+'。模擬值，不是承諾' }
    ]
  };
}
