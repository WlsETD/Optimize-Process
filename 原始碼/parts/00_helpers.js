/* 共用小工具 */
const $ = s => document.querySelector(s);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const ink = css;
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ST = { run:{hex:'#2e9e62',label:'運轉'}, co:{hex:'#2a78d6',label:'換線'}, wait:{hex:'#eb6834',label:'等料'}, fault:{hex:'#d55181',label:'拋料／故障'} };
function fitCanvas(cv) {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(r.width*dpr) || cv.height !== Math.round(r.height*dpr)) { cv.width = Math.round(r.width*dpr); cv.height = Math.round(r.height*dpr); }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); return { ctx, w:r.width, h:r.height };
}
function roundRect(ctx,x,y,w,h,r) { r = Math.min(r, Math.abs(w)/2, Math.abs(h)/2); ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath(); }

/* 版面因換行而變大變小時，用 0.3 秒補間，不要一下跳過去 */
const SMOOTH_MS = 300, SMOOTH_EASE = 'cubic-bezier(.2,.8,.2,1)';
function smoothResize(el, dims) {
  if (!el || !window.ResizeObserver || REDUCED || !el.animate) return;
  let last = null, busy = false;
  new ResizeObserver(() => {
    if (busy) return;
    const r = el.getBoundingClientRect(), now = { w:r.width, h:r.height };
    const moved = last && last.w > 0 && last.h > 0 && now.w > 0 && now.h > 0
      && ((dims.indexOf('w') >= 0 && Math.abs(now.w - last.w) > 1) || (dims.indexOf('h') >= 0 && Math.abs(now.h - last.h) > 1));
    if (moved) {
      busy = true; const a0 = { boxSizing:'border-box' }, a1 = { boxSizing:'border-box' };
      if (dims.indexOf('w') >= 0) { a0.width = last.w + 'px'; a1.width = now.w + 'px'; }
      if (dims.indexOf('h') >= 0) { a0.height = last.h + 'px'; a1.height = now.h + 'px'; }
      const ov = el.style.overflow; el.style.overflow = 'hidden';
      const an = el.animate([a0, a1], { duration:SMOOTH_MS, easing:SMOOTH_EASE });
      const done = () => { el.style.overflow = ov; const q = el.getBoundingClientRect(); last = { w:q.width, h:q.height }; busy = false; };
      an.onfinish = done; an.oncancel = done;
    }
    last = now;
  }).observe(el);
}
/* 換文字時淡入，避免內容一下跳掉 */
function smoothHTML(el, html) {
  if (!el || el.innerHTML === html) return;
  el.innerHTML = html;
  if (!REDUCED && el.animate) el.animate([{ opacity:0.25 }, { opacity:1 }], { duration:SMOOTH_MS, easing:'ease-out' });
}

/* 罰款加權排序：狀態與試算資料（見 13_fair.js；需先於首次繪製定義） */
const BOSS = { ok:false, at:'', state:'none', auto:false, via:'', log:[] };   /* state: none｜pending｜ok｜rejected */                       /* 老闆確認紀錄（示範：只存在這次開啟的頁面裡） */
const FAIR = { w:0.0125, maxDelay:1, price:1200 };      /* 甲的虛擬權重、最多延後 1 天：【我猜的】；單價：個案平均 */
const FAIR_ORDERS = [                                   /* 示意：同一時段三張要排的單（非企業資料） */
  { k:'乙', pcs:600, due:1, late:2, note:'個案合約：每晚一天罰 2%' },
  { k:'甲', pcs:800, due:2, late:2, note:'個案沒有罰則；虛擬權重【我猜的】' },
  { k:'丙', pcs:600, due:3, late:2, note:'個案合約：每晚一天罰 1%' }
];

/* 人力時間假設（人時／月）：全部是【我猜的】，可在畫面「可調的假設」改。
   個案與資料1～3 沒有人員編制、薪資、各站人數；只有每片實測秒數（資料2）與試點工時（方案文件）。 */
const LABOR = {
  crewCO:2, crewWaitLine:1, crewWaitWh:1, crewFault:1,  /* 換線 2 人；等料 1 位作業員等＋1 位倉庫人員找料補料；拋料故障 1 人（人／台停機）— 我猜的 */
  absentPct:5, satWeight:0.5,            /* 模擬班表：人工站平均缺勤率 5%（特休、病假、臨時請假）／週六可用工時＝平日的一半（資料3：週六出貨約平日一半）— 都是我猜的；只用在模擬班表，不影響月度指標 */
  whRoutine:85,                           /* 倉庫日常工作（依工單備料、收發料等）占正常班 85% — 我猜的；資料沒有，要問倉庫主管 */
  whPeople:3, whDayH:8,                   /* 倉庫人數與每人每天正常班小時 — 我猜的（個案只說全廠約 100 人） */
  whSwapN:4, whSwapMin:60,                /* 換零件退料：九月 4 次（資料3：丙 9/4、9/14、9/21、9/28）；每次舊料退庫與點收 60 分 — 我猜的 */
  retestSec:100,                          /* 一片重測的處理秒數：測試 40 s（資料2 抽測）＋ 判讀與搬運約 60 s — 後者我猜的 */
  intakeAddMin:5, intakeSaveMin:15,       /* 入口：每張插單業務確認＋生管檢視 5 分／省下來回澄清 15 分 — 我猜的 */
  gateAddMin:5,                           /* 閘門：每張插單生管核對試算 5 分 — 我猜的 */
  kitPrepMin:20, kitPeople:1,             /* 齊套（完整／選擇性）：每次換線前備料點料 20 分 × 1 人 — 我猜的 */
  etaShare:0.5, etaAddMin:3,              /* 料到日確認：供應商類等料能避免的比例 5 成（我猜 5～10 成取下限）；倉庫每張插單回報新料到料日 3 分 — 我猜的 */
  realschedAddH:1,                        /* 實際換線時間排程：生管每月核對滾動平均 1 h — 我猜的 */
  testEngH:8,                             /* 重測減量：工程／品管每月找原因 8 h — 我猜的 */
  crossMinDay:10,                         /* 人力交叉支援：課長每天協調 10 分 — 我猜的 */
  fairAddH:1,                             /* 罰款加權排序：例外單（延後超過 1 天）交老闆決定的處理 1 h／月 — 我猜的 */
  pilotH:21,                              /* 試點一次性：第 1 週 12 ＋ 第 2–4 週每週 3 × 3＝21 人時（方案文件） */
  stationExtraH:0,                        /* 人工站額外可用時數（人時／月）：產線省下人時轉調，或現有加班改派；預設 0 — 我猜的，要問老闆加班用在哪、產線人員能不能支援 */
  perPieceSec:130                         /* 多出貨的片數要多花的人工站時間：插件 45＋測試 40＋組裝 30＋包裝 15 秒（資料2 抽測） */
};

const LAB_CATS = ['辦公室', '物料倉儲', '工程品管', '產線'];
const LAB_CAT_NOTE = { '辦公室':'業務、生管、老闆', '物料倉儲':'備料點料', '工程品管':'工程師、品管', '產線':'作業員、課長' };
const hh = v => (v >= 0 ? '+' : '−') + f1(Math.abs(v));
const LAB_FIELDS = [['crewCO','換線時被占住的人數','人／台'],['crewWaitLine','等料時等待的作業員','人／台'],['crewWaitWh','等料時找料補料的倉庫人員','人／台'],['crewFault','拋料故障時被占住的人數','人／台'],['retestSec','一片重測的處理秒數','秒'],
  ['intakeAddMin','入口：每張確認與檢視','分'],['intakeSaveMin','入口：每張省下的來回澄清','分'],['gateAddMin','閘門：每張核對試算','分'],['kitPrepMin','齊套（完整／選擇性）：每次備料','分'],['kitPeople','齊套：備料人數','人'],
  ['realschedAddH','實排：每月核對','h'],['testEngH','重測減量：每月工程／品管','h'],['crossMinDay','交叉支援：課長每天協調','分'],['fairAddH','排序：每月例外處理','h'],['pilotH','試點一次性','人時'],['whPeople','倉庫人數','人'],['whDayH','倉庫每人每天正常班','h'],['whSwapMin','換零件退料每次','分'],['whRoutine','倉庫日常工作占正常班','%'],['stationExtraH','人工站額外可用時數（轉調／加班改派）','人時／月'],['absentPct','模擬班表：人工站平均缺勤率（只用在班表）','%'],['satWeight','模擬班表：週六可用工時（平日＝1）','倍'],['etaShare','料到日：供應商類等料能避免的比例','0～1'],['etaAddMin','料到日：倉庫每張回報','分']];

/* 工人A／工人B 的判定門檻：人工站稼動超過 95% 就先不加量（11/19 團隊定：九月組裝站、包裝站本來就是 90%，多出貨一成後壓到 90% 要額外約 480 人時，不切實際；
   90% 只當參考線）；超過 100% 不可行 */
const WORKER = { warn:0.95, ref:0.90, max:1.00 };
const EXTRA_PRESET = 210;                         /* 建議情境：產線省下人時的一半（約 85）＋現有加班改派約 125 人時 — 我猜的，待老闆確認 */
const WK_NAMES = { ins:'插件', test:'測試', asm:'組裝', pack:'包裝', pool:'人力池（交叉支援）' };
const wkN = k => k === 'pool' ? WK_NAMES.pool : WK_NAMES[k] + '站';
