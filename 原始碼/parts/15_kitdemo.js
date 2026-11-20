/* =====================================================================
   子 Demo：齊套上限與配套措施（完整齊套、A 選擇性齊套、B 料到日確認共用一個）
   回答三件事：1. 倉庫排不排得下（上限）；2. 各方案備料每次最多幾分鐘；3. 配套措施與試點停止條件。
   全部數字沿用模擬器的月度模型與「可調的假設」（whStats / laborCalc），這裡改的假設會同步回主畫面。
   倉庫幾個人、日常占多少班，個案與資料1～3 都沒有：預設值是【我猜的】，要問倉庫主管。
   ===================================================================== */
const KIT_IDS3 = ['kit', 'kitsel', 'eta'];
const KIT_CTL = [
  ['whPeople', '倉庫人數', 1, 8, 1, '人', 1, '個案只說全廠約 100 人；倉庫人數沒寫'],
  ['whDayH', '每人每天正常班', 4, 10, 0.5, 'h', 1, ''],
  ['whRoutine', '倉庫日常工作占正常班', 50, 100, 1, '%', 1, '日常依工單備料、收發料等，資料沒有；問倉庫主管後改這個'],
  ['kitPrepMin', '每次備料點料', 5, 60, 1, '分', 1, '完整與選擇性齊套共用'],
  ['etaShare', '料到日：供應商類等料能避免的比例', 0, 100, 5, '%', 0.01, '九月 19 h 供應商類等料中，有多少真的能避免'],
  ['etaAddMin', '料到日：倉庫每張回報', 0, 10, 0.5, '分', 1, '']
];
function kitBase() { const b = S.ids.filter(x => KIT_IDS3.indexOf(x) < 0); return b.length ? { ids:b, fb:false } : { ids:P1_IDS.slice(), fb:true }; }
function kitOptions(base) {
  const hasG = base.indexOf('gate') >= 0, g = hasG ? [] : ['gate'];
  return [
    { k:'sep',    name:'九月現況（沒導入任何策略）', ids:[] },
    { k:'base',   name:'目前組合（不含下面三個方案）', ids:base },
    { k:'kit',    name:'完整齊套（每次換線都備料）', ids:base.concat(['kit']), add:['kit'] },
    { k:'kitsel', name:'A 選擇性齊套（只備插單、換零件）', ids:base.concat(['kitsel']), add:['kitsel'] },
    { k:'eta',    name:'B 料到日確認', ids:base.concat(g, ['eta']), add:g.concat(['eta']), gate:!hasG },
    { k:'both',   name:'A ＋ B', ids:base.concat(g, ['kitsel', 'eta']), add:g.concat(['kitsel', 'eta']), gate:!hasG }
  ];
}
const KIT_COL = { find:'#5b7c99', prep:'#d98a00', rep:'#1f9d8a', swap:'#9aa5b1' };
function kitOut() {
  const s = S.strength, ev = S.sc && S.sc.ev, ss = Math.min(1, s), B = kitBase(), opts = kitOptions(B.ids), W = {};
  opts.forEach(o => { W[o.k] = whStats(o.ids, s, ev); });
  const b = W.base, cap = b.cap, room = cap * (1 - LABOR.whRoutine / 100), top = Math.max(room, ...opts.map(o => W[o.k].tot)) * 1.12;
  const pc = x => (x / top * 100).toFixed(2) + '%';
  let h = '<h3 style="margin:0 0 4px">一、倉庫排不排得下（上限）</h3>'
    + '<p class="note">倉庫正常班 ' + LABOR.whPeople + ' 人 × ' + LABOR.whDayH + ' h × ' + WORKDAYS + ' 天 ＝ <b>' + f0(cap) + '</b> 人時／月；日常工作占 ' + LABOR.whRoutine + '%，留給「會被策略改變的工作」的空檔 ＝ <b>' + f1(room) + '</b> 人時（圖上黑線）。底：' + (B.fb ? '目前沒勾任何策略，這裡用第一階段（入口＋閘門）當底' : '目前組合') + '。<span class="tag 我猜的">人數與日常占用是我猜的</span></p>'
    + '<div class="kleg">' + [['find', '等料時找料補料'], ['prep', '備料點料'], ['rep', '到料日回報'], ['swap', '換零件退料']].map(x => '<span><i style="background:' + KIT_COL[x[0]] + '"></i>' + x[1] + '</span>').join('') + '</div>'
    + '<table class="labt kt"><thead><tr><th style="text-align:left">方案</th><th style="width:32%">倉庫每月人時</th><th>合計</th><th>空檔剩餘</th><th>日常占用上限</th><th style="text-align:left">判定</th><th></th></tr></thead><tbody>';
  opts.forEach(o => { const w = W[o.k], rem = room - w.tot, ok = rem >= 0, lim = (1 - w.tot / cap) * 100, on = o.add && o.add.every(x => S.ids.indexOf(x) >= 0);
    const seg = (v, c) => v > 0.005 ? '<i style="width:' + pc(v) + ';background:' + c + '" title="' + f1(v) + ' 人時"></i>' : '';
    h += '<tr><td style="text-align:left"><b>' + o.name + '</b>' + (o.gate ? ' <span class="note">（含閘門）</span>' : '') + '</td>'
      + '<td><div class="kbar">' + seg(w.find, KIT_COL.find) + seg(w.prep, KIT_COL.prep) + seg(w.rep, KIT_COL.rep) + seg(w.swap, KIT_COL.swap) + '<u style="left:' + pc(room) + '"></u></div></td>'
      + '<td><b>' + f1(w.tot) + '</b></td><td>' + (ok ? '+' : '−') + f1(Math.abs(rem)) + '</td><td>' + f0(lim) + '%</td>'
      + '<td style="text-align:left"><span class="vd ' + (ok ? 'ok' : 'no') + '">' + (ok ? '排得下' : '排不下') + '</span></td>'
      + '<td>' + (o.add ? '<button type="button" class="btn sm' + (on ? ' pri' : '') + '" data-kapply="' + o.k + '">' + (on ? '已導入' : '導入看看') + '</button>' : '') + '</td></tr>'; });
  h += '</tbody></table><p class="note" style="margin-top:6px">「日常占用上限」＝倉庫日常工作占正常班超過這個百分比，這個方案就排不下（只能加人或加班，違反個案）。不用猜日常占用：問倉庫主管實際占多少，比對這一欄即可。</p>';

  /* 二、備料每次最多幾分鐘 */
  h += '<h3 style="margin:16px 0 4px">二、備料的上限</h3><table class="labt"><thead><tr><th style="text-align:left">方案</th><th>備料次數／月</th><th>每個工作日</th><th>每次預設</th><th>打平點（不比現在更忙）</th><th>排得下的上限</th></tr></thead><tbody>';
  [['kit', '完整齊套'], ['kitsel', 'A 選擇性齊套']].forEach(r => { const w = W[r[0]], inc = w.prep, dec = b.find - w.find;
    const be = inc > 0 ? LABOR.kitPrepMin * dec / inc : null, allowed = room - (w.tot - w.prep), mx = allowed > 0 ? allowed * 60 / (w.prepN * LABOR.kitPeople * ss) : 0;
    h += '<tr><td style="text-align:left"><b>' + r[1] + '</b></td><td>' + f0(w.prepN) + ' 次</td><td>' + f1(w.prepN / WORKDAYS) + ' 次，約 ' + f0(w.prep * 60 / WORKDAYS) + ' 分</td><td>' + LABOR.kitPrepMin + ' 分</td><td><b>' + (be == null ? '—' : f1(be) + ' 分') + '</b></td><td><b>' + f1(mx) + ' 分</b>' + (allowed <= 0 ? '<span class="note">（不備料也排不下）</span>' : '') + '</td></tr>'; });
  h += '</tbody></table><p class="note" style="margin-top:6px">打平點＝每次備料超過這個分鐘數，這個方案的倉庫工作量比「底」還多（備料增加 ＞ 少找料補料）。排得下的上限＝在你輸入的日常占用下，每次備料最多幾分鐘。A 的備料次數只有完整齊套的一半，上限比較寬。完整齊套的「等料減半」沒有資料，是我猜的。</p>';

  /* 三、配套措施 */
  const wA = W.kitsel, wB = W.eta, bDec = b.find - wB.find;
  h += '<h3 style="margin:16px 0 4px">三、配套措施：怎麼把倉庫的新工作壓在正常班內</h3><table class="labt"><thead><tr><th style="text-align:left">措施</th><th style="text-align:left">做法</th><th style="text-align:left">數字</th><th>來源</th></tr></thead><tbody>'
    + [
      ['只備會出事的換線', '備料只對插單、換零件的換線做；一般換線照舊依工單備料（A）', '備料 ' + f0(W.kit.prepN) + ' 次 → ' + f0(wA.prepN) + ' 次；每天 ' + f1(W.kit.prepN / WORKDAYS) + ' → ' + f1(wA.prepN / WORKDAYS) + ' 次', '推算'],
      ['先問料到日再排', '交期試算前倉庫回報新料哪天到，閘門不排在料到之前，機台先做料齊的單（B）；要有替代單可排', '回報 ' + f0(wB.repN) + ' 張 × ' + LABOR.etaAddMin + ' 分 ＝ ' + f1(wB.rep) + ' h；少找料補料 ' + f1(bDec) + ' h', '我猜的'],
      ['固定備料時段', '插單排進預留時段（15:00），倉庫在時段前 1.5 小時備齊並放到線邊待命', '單日重播有示範；1.5 小時是我們的假設', '我猜的'],
      ['共用料先預留', '被插單機種先領走的共用零件，在系統標預留，換線時不再臨時被領走（方案 C）', '效果沒有資料，只能試點量', '我猜的'],
      ['先試丙換零件', '九月換零件 4 次（9/4、9/14、9/21、9/28）都在丙；先在這幾次做齊套並記錄實際備料分鐘', '4 次 × 每次實量', '資料3'],
      ['退料維持原狀', '換零件的舊料退庫不動，不併入新做法', LABOR.whSwapN + ' 次 × ' + LABOR.whSwapMin + ' 分 ＝ ' + f1(b.swap) + ' h', '資料3＋我猜的']
    ].map(r => '<tr><td style="text-align:left"><b>' + r[0] + '</b></td><td style="text-align:left;white-space:normal">' + r[1] + '</td><td style="text-align:left;white-space:normal">' + r[2] + '</td><td><span class="tag ' + r[3].split('＋')[0] + '">' + r[3] + '</span></td></tr>').join('') + '</tbody></table>';

  /* 四、試點量測與停止條件 */
  const aBE = wA.prep > 0 ? LABOR.kitPrepMin * (b.find - wA.find) / wA.prep : null, lim = (1 - wA.tot / cap) * 100;
  h += '<h3 style="margin:16px 0 4px">四、試點要量什麼、什麼時候停</h3><table class="labt"><thead><tr><th style="text-align:left">指標</th><th style="text-align:left">怎麼量</th><th style="text-align:left">停止或通過的門檻</th><th>來源</th></tr></thead><tbody>'
    + [
      ['倉庫加班時數', '倉庫工時紀錄', '0 小時；出現加班就停（個案：加班不增加）', '個案'],
      ['每次備料實際分鐘', '倉庫登記備料起訖', '超過 ' + (aBE == null ? '—' : f1(aBE)) + ' 分（A 的打平點）就停', '推算'],
      ['倉庫日常占用', '倉庫主管提供', '超過 ' + f0(lim) + '%（A 的日常占用上限）就排不下', '推算'],
      ['丙換零件的等料時數', '資料3 停機紀錄與課長備註', '比九月（9/10、9/11、9/17 共 19 h）少；B 預期供應商類等料少約 ' + f1(bDec) + ' h（能避免 ' + f0(LABOR.etaShare * 100) + '%）', '推算＋我猜的'],
      ['換線後是否仍等料', '課長備註「等料」「缺料」', '齊套過的換線仍等料的比例，要比沒齊套的低', '我猜的']
    ].map(r => '<tr><td style="text-align:left"><b>' + r[0] + '</b></td><td style="text-align:left;white-space:normal">' + r[1] + '</td><td style="text-align:left;white-space:normal">' + r[2] + '</td><td><span class="tag ' + r[3].split('＋')[0] + '">' + r[3] + '</span></td></tr>').join('') + '</tbody></table>'
    + '<p class="note" style="margin-top:8px"><b>限制：</b>倉庫人數、日常占用、備料與回報分鐘、料到日能避免的比例、完整齊套的「等料減半」，全是【我猜的】；19 h 與三個日期來自資料3，「全是供應商類」是我們從備註的判讀。省下的是理論上可回收的時間，不代表可以減人。</p>';
  return h;
}
function kitHTML() {
  const ctl = KIT_CTL.map(c => { const v = LABOR[c[0]] / c[6];
    return '<label class="kctl"><span>' + c[1] + '</span><div class="rsrow"><input type="range" min="' + c[2] + '" max="' + c[3] + '" step="' + c[4] + '" value="' + v + '" data-kk="' + c[0] + '" data-sc="' + c[6] + '"><span class="rsval" data-kv="' + c[0] + '">' + v + ' ' + c[5] + '</span></div>' + (c[7] ? '<span class="note">' + c[7] + '</span>' : '') + '</label>'; }).join('');
  return '<aside class="kit-ctl"><b>可調的假設</b><p class="note" style="margin:2px 0 8px">全部是【我猜的】；改了會同步到主畫面的「可調的假設」並立刻重算。</p>' + ctl + '</aside><div class="kit-main" id="kitOut">' + kitOut() + '</div>';
}
function syncLabParams() { document.querySelectorAll('#labParams input[data-k]').forEach(i => { const v = LABOR[i.dataset.k]; if (v != null) i.value = v; }); }
function refreshKit() { const o = $('#kitOut'); if (o) o.innerHTML = kitOut(); }
function openKit() { $('#kitBody').innerHTML = kitHTML(); $('#kitOvl').classList.add('on'); }
function closeKit() { $('#kitOvl').classList.remove('on'); }
$('#kitBody').addEventListener('input', e => {
  const k = e.target.dataset.kk; if (!k) return;
  const v = parseFloat(e.target.value), sc = parseFloat(e.target.dataset.sc); if (!isFinite(v)) return;
  LABOR[k] = +(v * sc).toFixed(4); const lab = document.querySelector('[data-kv="' + k + '"]'), c = KIT_CTL.find(x => x[0] === k); if (lab) lab.textContent = v + ' ' + c[5];
  syncLabParams(); S.sc = scenario(S.ids, S.strength); renderMonthly(); refreshKit();
});
$('#kitBody').addEventListener('click', e => {
  const b = e.target.closest('[data-kapply]'); if (!b) return;
  const o = kitOptions(kitBase().ids).find(x => x.k === b.dataset.kapply); if (!o || !o.add) return;
  const base = kitBase().ids, on = o.add.every(x => S.ids.indexOf(x) >= 0);
  setIds(on ? S.ids.filter(x => KIT_IDS3.indexOf(x) < 0) : base.concat(o.add));
  refreshKit();
});
$('#kitX').addEventListener('click', closeKit);
$('#kitOvl').addEventListener('click', e => { if (e.target === $('#kitOvl')) closeKit(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#kitOvl').classList.contains('on')) closeKit(); });
