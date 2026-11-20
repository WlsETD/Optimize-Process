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
const LAST = SALES.length - 1;                 // 九月＝基準月
const SEP  = { s: SALES[LAST], f: FLOOR[LAST] };
const LINES = 4, WORKDAYS = 26;                // 〔資料3〕四條線、26 工作日
const PRICE = 1200;                            // 〔個案單〕元／片（個案平均）
const PENALTY_SEP = 590000;                    // 〔資料3〕九月罰款 乙42萬＋丙17萬
const OT_CAP = 3700;                           // 〔個案單〕加班上限 h／月
const TARGET = { ship: 125.4, otd: 0.90, otdA: 0.87 };

/* ---------------------------------------------------------------------
   月度模型：與 model.js 完全相同的公式，插單次數 ev 與接單 orders 改為參數
   效果強度 s：1.0 ＝ 我們假設的完整效果，不是實測
   ------------------------------------------------------------------- */
const BASE = { coInt:36, coPer:9.33, hBase:0.72, hSlope:0.0179, mwInt:17.3, mwPer:3.72,
  fInt:19.4, fPer:2.38, retBase:2785, retPerCO:34.9, backlog:44, open0:1003,
  stdSec:{ins:50,test:46,asm:32,pack:16}, actSec:{ins:45,test:40,asm:30,pack:15}, eff:0.96 };
const lerp = (a,b,t) => a + (b-a)*t;

function simMonth(ids, s, ev, orders) {
  ev = (ev == null) ? SEP.s[1] : ev;
  orders = (orders == null) ? SEP.s[0] : orders;
  const ON = new Set(ids), on = id => ON.has(id) ? Math.min(1,s) : 0, onx = id => ON.has(id) ? s : 0;
  const p = {};
  p.coPer = lerp(BASE.coPer, 3.0, on('gate'));
  p.fPer  = lerp(BASE.fPer,  1.5, on('gate'));
  const hNow = BASE.hBase + BASE.hSlope * Math.max(0, ev - 2);
  p.hco = Math.max(0.3, hNow * (1 - 0.33*onx('smed')));
  p.fInt = lerp(BASE.fInt, 16, on('smed'));
  p.retPerCO = BASE.retPerCO * (1 - 0.30*on('smed'));
  p.mwInt = lerp(BASE.mwInt, 10, on('kit'));
  p.mwPer = BASE.mwPer * (1 - 0.30*on('intake')) * (1 - 0.50*on('kit'));
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
  for (const k of ['ins','test','asm','pack']) logged[k] = 114000 * BASE.stdSec[k] / 3600 / BASE.eff;
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
  return { ship, otd, retest, co, coH, mwH, flH, stops, run, open: BASE.open0,
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
  /* 只含 P1（閘門＋入口）：換線不外部化（0.90 h），人工等待只吃入口的 0.7 */
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
const FIT_LATE = fit(SALES.map(r=>1-r[3]), SALES.map(r=>r[7]));
const FIT_QUAL = fit(SALES.map(r=>r[5]),   SALES.map(r=>r[8]));
const lateOf = otd => Math.max(0, FIT_LATE.a + FIT_LATE.b*(1-otd));
const qualOf = ret => Math.max(0, FIT_QUAL.a + FIT_QUAL.b*ret);

/* ---------------------------------------------------------------------
   功能註冊表：新增一項功能只要加一筆，勾選框、圖標與模型都會自動帶入
   model 欄位對應月度模型的開關 id
   ------------------------------------------------------------------- */
const FEATURES = [
  { id:'intake', model:'intake', name:'單一插單入口', short:'入口', phase:1, demo:true,
    desc:'業務貼上 LINE 原文，AI 一次拆齊欄位、缺項追問，減少來回澄清',
    effect:'人工站等料 ×0.70；插單擾動 −0.30',
    icon:'M3 5h18v11H8l-5 4V5z M7 9h10 M7 12h7' },
  { id:'gate', model:'gate', name:'交期試算閘門', short:'閘門', phase:1, demo:true,
    desc:'無試算紀錄不放行回覆；插單排進預留時段，只有損失工時推擠其他單',
    effect:'每張插單換線 9.33→3.0 次；故障拋料 2.38→1.5 h；擾動 −0.35',
    icon:'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z M9 12l2 2 4-4' },
  { id:'smed', model:'smed', name:'換線外部化（SMED）', short:'SMED', phase:2, demo:false,
    desc:'治具與料站預先準備，換線動作移到停機前後',
    effect:'每次換線時間 ×0.67；退料 ×0.70',
    icon:'M4 7h16 M4 12h10 M4 17h16 M17 10l3 2-3 2z' },
  { id:'kit', model:'kit', name:'齊套上線', short:'齊套', phase:2, demo:false,
    desc:'料齊才上線，人工站不再等料',
    effect:'人工站等料固定值 17.3→10；每張 ×0.50',
    icon:'M3 8l9-5 9 5v8l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v8' },
  { id:'realsched', model:'realsched', name:'排程用實際換線時間', short:'實排', phase:2, demo:false,
    desc:'排程不再用固定 0.5 h／線／天，改用近 26 個工作日滾動平均',
    effect:'插單擾動 −0.20',
    icon:'M4 5h16v15H4z M4 9h16 M8 3v4 M16 3v4 M9 13l2 2 4-4' },
  { id:'test', model:'test', name:'測試站重測減量', short:'重測', phase:2, demo:false,
    desc:'降低重測基數',
    effect:'重測基數 2785→1700',
    icon:'M6 3h12 M9 3v6l-4 9a2 2 0 002 2h10a2 2 0 002-2l-4-9V3' },
  { id:'cross', model:'cross', name:'人力交叉支援', short:'交叉', phase:2, demo:false,
    desc:'人工站互相支援，吃掉單站瓶頸',
    effect:'人力池係數 0.6',
    icon:'M9 7a3 3 0 106 0 3 3 0 10-6 0 M4 20c0-3 3.6-5 8-5s8 2 8 5 M2 11h4 M18 11h4' },
  { id:'fair', model:'fair', name:'罰款加權排序', short:'排序', phase:2, demo:false,
    desc:'會遲的單依金額 × 每日罰款率排序（老闆 11/17 決議）',
    effect:'月度模型未建模，效益為 0；屬排序公平性，不是產能',
    icon:'M12 3v18 M5 8h14 M7 8l-3 6h6l-3-6 M17 8l-3 6h6l-3-6', warn:'月度模型未建模，勾選不會改變數字' }
];
const P1_IDS = FEATURES.filter(f=>f.phase===1).map(f=>f.id);

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

  return {
    ids, strength, ev, model: { base, now },
    rows: [
      { k:'ship',   name:'出貨',             unit:'千片',  before:aSep[2], after:shipAfter,
        src:'calc', target:TARGET.ship, dec:1,
        how:'九月實際 114 ＋ 模型差額（'+base.ship.toFixed(1)+'→'+now.ship.toFixed(1)+'）' },
      { k:'otd',    name:'準時交貨率',       unit:'%',    before:aSep[3], after:otdAfter,
        src:'calc', target:TARGET.otd, pct:true, dec:1,
        how:'九月實際 78% ＋ 模型差額（'+(base.otd*100).toFixed(1)+'%→'+(now.otd*100).toFixed(1)+'%）' },
      { k:'orders', name:'接單',             unit:'千片',  before:aSep[0], after:aSep[0],
        src:'real', dec:0, how:'需求不因導入而改變，維持九月 127 千片' },
      { k:'rush',   name:'追加單與換零件',   unit:'次',    before:ev, after:ev,
        src:ev===SEP.s[1]?'real':'guess', dec:0, how:'插單件數不因導入而改變；系統改變的是處理方式' },
      { k:'co',     name:'換線次數',         unit:'次',    before:fSep[4], after:coAfter,
        src:'calc', dec:0, how:'九月實際 148 ＋ 模型差額（'+base.co.toFixed(0)+'→'+now.co.toFixed(0)+'）' },
      { k:'coH',    name:'換線停機',         unit:'h',    before:fSep[5], after:Math.max(0,fSep[5]+d('coH')),
        src:'calc', dec:1, how:'九月實際 133 ＋ 模型差額' },
      { k:'waitH',  name:'等料停機',         unit:'h',    before:fSep[6], after:Math.max(0,fSep[6]+d('mwH')),
        src:'calc', dec:1, how:'九月實際 62 ＋ 模型差額' },
      { k:'faultH', name:'拋料與故障停機',   unit:'h',    before:fSep[7], after:Math.max(0,fSep[7]+d('flH')),
        src:'calc', dec:1, how:'九月實際 48 ＋ 模型差額' },
      { k:'run',    name:'SMT 正常運轉',     unit:'h',    before:fSep[2], after:runAfter,
        src:'calc', dec:0, how:'九月實際 760 ＋ 模型差額（'+base.run.toFixed(0)+'→'+now.run.toFixed(0)+'）' },
      { k:'util',   name:'SMT 稼動率',       unit:'%',    before:utilBefore, after:utilAfter,
        src:'calc', pct:true, dec:1,
        how:'正常運轉 ÷ 開機 1,003 h（開機時數不變）；九月 760÷1,003＝75.8%，原檔記 76%' },
      { k:'retest', name:'重測比率',         unit:'%',    before:aSep[5], after:retestAfter,
        src:'calc', pct:true, dec:2, lowerBetter:true,
        how:'九月實際 7% ＋ 模型差額（'+(base.retest*100).toFixed(2)+'%→'+(now.retest*100).toFixed(2)+'%）' },
      { k:'ot',     name:'加班',             unit:'h',    before:aSep[4], after:aSep[4],
        src:'guess', dec:0, lowerBetter:true, cap:OT_CAP,
        how:'【我猜的】假設維持不增加（上限 3,700 h）。模型沒有加班輸出，不宣稱會下降' },
      { k:'cLate',  name:'客訴：交期',       unit:'件',    before:lateBefore, after:lateAfter,
        src:'guess', dec:1, lowerBetter:true,
        how:'九月實際 10 件 ＋ 回歸差額。回歸自十二個月歷史：件數 = '+FIT_LATE.a.toFixed(2)+' + '+FIT_LATE.b.toFixed(1)+' × 延遲率（R²='+FIT_LATE.r2.toFixed(2)+'）【我猜的】' },
      { k:'cQual',  name:'客訴：品質',       unit:'件',    before:qualBefore, after:qualAfter,
        src:'guess', dec:1, lowerBetter:true,
        how:'九月實際 4 件 ＋ 回歸差額。回歸自十二個月歷史：件數 = '+FIT_QUAL.a.toFixed(2)+' + '+FIT_QUAL.b.toFixed(1)+' × 重測比率（R²='+FIT_QUAL.r2.toFixed(2)+'）【我猜的】' },
      { k:'cAll',   name:'客訴合計',         unit:'件',    before:lateBefore+qualBefore, after:lateAfter+qualAfter,
        src:'guess', dec:1, lowerBetter:true, how:'交期＋品質（原檔十二個月皆為兩者相加）' },
      { k:'penalty',name:'延遲罰款',         unit:'元',    before:PENALTY_SEP, after:null,
        src:'guess', dec:0, lowerBetter:true, blocked:true,
        how:'九月實際 59 萬〔資料3〕。導入後不給數字：模擬器罰款公式的乙丙費率相同、與個案單（乙 2%／日、丙 1%／日）不符，甲被計罰款而個案單甲無罰則。待核對合約' }
    ]
  };
}
