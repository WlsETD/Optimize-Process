/* =====================================================================
   模擬班表（第 7 頁）：九月 26 個工作日 × 人工站四站，每天的稼動率
   - 每天需要站時＝當天出貨 × 抽測秒數（資料2）；測試站另加重測 × 40 秒
     導入前＝資料3 逐日出貨；導入後＝單月回放的逐日推算（mmBuild，月合計＝月度模型）
   - 每天可用站時＝各站月可用站時（九月記錄工時，含加班與人工站額外時數）依「工作日權重」分配：平日 1、週六＝LABOR.satWeight（0.5，【我猜的】）
     人是照班表排的，不會因為當天出貨少就少一個人（11/19 改；原本按九月當天出貨比例分，9/17 出貨最低會被誤算成人最少）。人數＝當天可用站時 ÷ 8 h（推算）
   - 平均缺勤：可選，全站可用站時 × (1－LABOR.absentPct%)【我猜的】；請假情境：指定站再扣 8 h（一人一天）
   - 做不完的工可以延到隔天（在製品等一天）；月底還做不完的，就是要加班補的時數
   ===================================================================== */
const RS7 = { view:'after', leave:'none', st:'pack', abs:false, show:'pct' };
const RS7_ST = ['ins', 'test', 'asm', 'pack'];
function rosterCalc() { mmBuild(); return rosterCalcWith(RS7); }
/* 純計算：o = {view, abs, leave, st}；呼叫前要先 mmBuild() */
function rosterCalcWith(o) {
  const P = MM.plan, days = o.view === 'after' ? P.A : P.B, wt = d => d.w === '六' ? LABOR.satWeight : 1, totW = MDAYS.reduce((a, d) => a + wt(d), 0), keep = o.abs ? 1 - LABOR.absentPct / 100 : 1;
  const out = {};
  RS7_ST.forEach(k => {
    const avail = stAvail(k); let back = 0, maxBack = 0;
    out[k] = MDAYS.map((d, i) => {
      let cap = avail * wt(d) / totW;
      const people = cap / 8;
      cap *= keep;
      const isRush = !!d.rush;
      if (o.st === k && (o.leave === 'all' || (o.leave === 'rush' && isRush))) cap = Math.max(0, cap - 8);
      const need = (days[i].ship * BASE.actSec[k] + (k === 'test' ? days[i].ret * BASE.actSec.test : 0)) / 3600;
      back = Math.max(0, back + need - cap); maxBack = Math.max(maxBack, back);
      return { d, need, cap, people, u: cap > 0 ? need / cap : 9, back };
    });
    out[k].endBack = back; out[k].maxBack = maxBack;
  });
  return out;
}
const sgn = v => (v >= 0.05 ? '+' : v <= -0.05 ? '−' : '') + f1(Math.abs(v));
function rosterRender() {
  const box = $('#rsBody'); if (!box) return;
  const notesOpen = box.querySelector('.rs7-notes')?.open;
  const R = rosterCalc(), cls = u => u > 1 + 1e-9 ? 'r4' : u > WORKER.warn + 1e-9 ? 'r3' : u > WORKER.ref + 1e-9 ? 'r2' : 'r1';
  let over = 0, warn = 0, peak = { h:0 }, endB = 0;
  RS7_ST.forEach(k => R[k].forEach(x => { if (x.u > 1 + 1e-9) over++; else if (x.u > WORKER.warn + 1e-9) warn++; const g = x.need - x.cap; if (g > peak.h) peak = { h:g, k, d:x.d }; }));
  RS7_ST.forEach(k => endB += R[k].endBack);
  const busiest = RS7_ST.reduce((a, k) => R[k].reduce((s, x) => s + x.need, 0) / R[k].reduce((s, x) => s + x.cap, 0) > R[a].reduce((s, x) => s + x.need, 0) / R[a].reduce((s, x) => s + x.cap, 0) ? k : a, 'ins');
  let tileIndex = 0;
  const tile = (t, v, n, bad) => {
    const id = 'rs7-tip-' + (++tileIndex);
    return '<div class="rs7t' + (bad ? ' bad' : '') + '" tabindex="0" aria-describedby="' + id + '"><span>' + t + '</span><b>' + v + '</b><em id="' + id + '" role="tooltip">' + n + '</em></div>';
  };
  let h = '<div class="rs7tiles">'
    + tile('超過 100% 的站日', over, '共 ' + (4 * MDAYS.length) + ' 個站日（4 站 × ' + MDAYS.length + ' 天）', over > 0)
    + tile('95～100% 的站日', warn, '沒有容錯，缺人就超過', false)
    + tile('單日最多缺', f1(peak.h) + ' h', peak.k ? wkN(peak.k) + ' ' + CM.m + '/' + peak.d.d + '（週' + peak.d.w + '）' : '沒有超過的日子', peak.h > 0)
    + tile('月底還做不完', f1(endB) + ' h', endB > 0.05 ? '做不完的工可延隔天；這些只能加班補' : '延到隔天就消化得掉', endB > 0.05)
    + '</div>';
  h += '<div class="rs7grid" role="table" aria-label="每天各站稼動率" style="--rsn:' + MDAYS.length + '"><div class="rs7c rs7h" role="columnheader">站＼日</div>'
    + MDAYS.map(d => '<div class="rs7c rs7h' + (d.w === '六' ? ' sat' : '') + '" role="columnheader">' + d.d + '<small>' + d.w + (d.rush ? '<i title="有插單或換零件">●</i>' : '') + '</small></div>').join('');
  RS7_ST.forEach(k => {
    h += '<div class="rs7c rs7l" role="rowheader">' + WK_NAMES[k] + '<small>平日約 ' + f1(R[k][0].people) + ' 人當量</small></div>';
    R[k].forEach(x => { h += '<div class="rs7c ' + cls(x.u) + '" role="cell" title="' + CM.m + '/' + x.d.d + '（週' + x.d.w + '）' + WK_NAMES[k] + '站：需要 ' + f1(x.need) + ' h／可用 ' + f1(x.cap) + ' h（約 ' + f1(x.cap / 8) + ' 人當量）' + (x.back > 0.05 ? '；累積未做完 ' + f1(x.back) + ' h' : '') + '">' + (RS7.show === 'h' ? sgn(x.cap - x.need) : (x.u >= 9 ? '—' : f0(x.u * 100))) + '</div>'; });
  });
  h += '</div><div class="rs7leg"><span class="r1"></span>≤ 90% 有容錯<span class="r2"></span>90～95% 偏緊<span class="r3"></span>95～100% 無容錯<span class="r4"></span>&gt; 100% 做不完<span class="rs7dot">●</span>有插單或換零件</div>'
    + '<details class="rs7-notes"' + (notesOpen ? ' open' : '') + '><summary>班表資料說明</summary>'
    + '<p class="note">' + (RS7.show === 'h' ? '格內數字＝這天這站剩幾小時（＋有空檔；−缺的小時，只能延到隔天或加班）；1 人 1 天＝8 h。' : '格內數字＝稼動率（需要站時 ÷ 可用站時，%）。') + '最忙：' + wkN(busiest) + '。' + (RS7.view === 'after' ? '導入後＝目前勾選的功能（' + (S.ids.length ? S.ids.length + ' 項' : '未勾選，等於' + CM.name) + '）、效果強度 ' + S.strength.toFixed(2) + '、人工站額外時數 ' + f0(LABOR.stationExtraH) + ' 人時／月。' : '導入前＝九月實際。')
    + '每天可用站時＝月可用站時依工作日分配：平日 1、週六 ' + LABOR.satWeight + '（資料3：週六出貨約平日一半，工時同比【我猜的】）；人是照班表排的，不隨當天出貨增減。'
    + (RS7.abs ? '已套用平均缺勤 ' + f0(LABOR.absentPct) + '%【我猜的】。' : '未套用平均缺勤。')
    + '人數＝可用站時 ÷ 8 h（推算，人當量）。' + CM.name + '全廠加班 ' + f0(SEP.s[4]) + ' h（' + (CUR ? CM.tag : '資料1、資料3') + '）；人工站的可用站時含不含加班，資料看不出來【我猜的：當作已含在內】。'
    + (RS7.view === 'before' ? '導入前各天的差異來自' + CM.name + '當天實際出貨高低。' : '')
    + '</p>'
    + '<div class="rs7unk"><b>資料證明不了的事</b><ul>'
    + '<li>「約 X 人當量」＝可用站時 ÷ 8 h，是時數換算，<b>不是真實人數</b>。個案只給全廠約 100 人，沒給各站人數，無法推算每站實際幾個人。</li>'
    + '<li>人工站每月約 4,750 h 含不含加班：<b>不明</b>。十二個月反推的人工站時數在加班 1,700→3,700 h 之間幾乎持平（見「十二個月圖表」），所以模型把它當固定值、不預測加班。</li>'
    + '<li>「月底還做不完」是班表算出的缺口，只是加班需求的粗估（不含 SMT、倉庫）；改派人時前，須先請老闆確認。</li></ul></div></details>';
  box.innerHTML = h;
}
{
  const c = $('#rsCtl');
  if (c) c.addEventListener('change', e => { const t = e.target; if (t.id === 'rsLeave') RS7.leave = t.value; if (t.id === 'rsSt') RS7.st = t.value; if (t.id === 'rsAbs') RS7.abs = t.checked; if (t.name === 'rss') RS7.show = t.value; rosterRender(); });
}

/* 估計需補加班（h／月）：班表算出「月底還做不完」的小時，四站加總。
   意思是正常可用站時內做不完、只能靠加班補的量；只算人工站，不含 SMT、倉庫。
   回傳 {before:{full,abs}, after:{full,abs}}；full＝人員到齊，abs＝套用平均缺勤。 */
function otEstAll() {
  mmBuild();
  const tot = o => RS7_ST.reduce((a, k) => a + rosterCalcWith(o)[k].endBack, 0), f = (view, abs) => tot({ view, abs, leave:'none', st:'pack' });
  return { before:{ full:f('before', false), abs:f('before', true) }, after:{ full:f('after', false), abs:f('after', true) } };
}
