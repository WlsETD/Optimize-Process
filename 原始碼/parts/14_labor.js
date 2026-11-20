/* =====================================================================
   人力時間：每個策略「減少」或「增加」多少人時／月
   - 減少：由月度模型的停機時數差額推出（換線／等料／拋料故障停機時，被占住的人 × 小時）；重測少了，處理時間也少
   - 增加：新工作（確認、核對、備料、協調…），次數隨插單件數 ev 或換線次數，單位工時是【我猜的】
   - 依功能表順序累計分攤，所以各列加起來等於合計
   - 「省下」是理論上可回收的人時，不等於可以減人（個案要求不加人也不減人，只是把時間還給正常班內的工作）
   ===================================================================== */

function laborOcc(ids, s, ev) {
  const m = simMonth(ids, s, ev), tOn = ids.indexOf('test') >= 0 ? Math.min(1, s) : 0;
  const retests = lerp(BASE.retBase, 1700, tOn) + BASE.retPerCO * m.co;         /* 固定在九月產量 114 千片下比，產量變動另計 */
  return { m, co: m.coH * LABOR.crewCO, wait: m.mwH * LABOR.crewWaitLine, waitWh: m.mwH * LABOR.crewWaitWh, fault: m.flH * LABOR.crewFault, retest: retests * LABOR.retestSec / 3600, retests };
}
function laborCalc(ids, s, ev) {
  ev = ev == null ? SEP.s[1] : ev;
  const sel = FEATURES.filter(f => ids.indexOf(f.id) >= 0).map(f => f.id);
  const ref = laborOcc([], 0, ev), rows = []; let prev = ref, acc = [];
  sel.forEach(id => {
    acc = acc.concat([id]);
    const cur = laborOcc(acc, s, ev), ss = Math.min(1, s), parts = [], f = FEATURES.find(x => x.id === id);
    const save = (k, label, cat) => { const d = prev[k] - cur[k]; if (Math.abs(d) > 0.05) parts.push({ cat:cat || '產線', h:-d, what:label, src:'推算' }); };
    const add  = (cat, h, what) => { if (Math.abs(h) > 0.005) parts.push({ cat, h, what, src:'我猜的' }); };
    if (id === 'intake') {
      add('辦公室', ev * LABOR.intakeAddMin / 60, '業務確認欄位＋生管檢視：' + ev + ' 張 × ' + LABOR.intakeAddMin + ' 分');
      add('辦公室', -ev * LABOR.intakeSaveMin / 60 * ss, '省下來回澄清：' + ev + ' 張 × ' + LABOR.intakeSaveMin + ' 分');
    }
    if (id === 'gate')      add('辦公室', ev * LABOR.gateAddMin / 60, '生管核對試算：' + ev + ' 張 × ' + LABOR.gateAddMin + ' 分');
    if (id === 'kit')       add('物料倉儲', cur.m.co * LABOR.kitPrepMin * LABOR.kitPeople / 60 * ss, '換線前備料點料：' + f0(cur.m.co) + ' 次 × ' + LABOR.kitPrepMin + ' 分 × ' + LABOR.kitPeople + ' 人');
    if (id === 'kitsel' && acc.indexOf('kit') < 0) add('物料倉儲', cur.m.rush * LABOR.kitPrepMin * LABOR.kitPeople / 60 * ss, '插單／換零件換線前備料點料：' + f0(cur.m.rush) + ' 次 × ' + LABOR.kitPrepMin + ' 分 × ' + LABOR.kitPeople + ' 人（一般換線不備）');
    if (id === 'eta' && acc.indexOf('gate') >= 0) add('物料倉儲', ev * LABOR.etaAddMin / 60 * ss, '倉庫回報新料到料日：' + ev + ' 張 × ' + LABOR.etaAddMin + ' 分');
    if (id === 'realsched') add('辦公室', LABOR.realschedAddH, '生管每月核對滾動平均');
    if (id === 'test')      add('工程品管', LABOR.testEngH, '工程／品管找重測原因');
    if (id === 'cross')     add('產線', LABOR.crossMinDay * WORKDAYS / 60, '課長每天協調 ' + LABOR.crossMinDay + ' 分 × ' + WORKDAYS + ' 天');
    if (id === 'fair')      add('辦公室', LABOR.fairAddH, '例外單交老闆決定的處理');
    save('co',    '換線停機少了（' + LABOR.crewCO + ' 人／台）');
    save('wait',  '等料停機少了，作業員少等（' + LABOR.crewWaitLine + ' 人／台）');
    save('waitWh','等料停機少了，倉庫少找料補料（' + LABOR.crewWaitWh + ' 人／台）', '物料倉儲');
    save('fault', '拋料故障停機少了（' + LABOR.crewFault + ' 人／台）');
    save('retest','重測少了（每片 ' + LABOR.retestSec + ' 秒）');
    const inc = parts.filter(p => p.h > 0).reduce((a, p) => a + p.h, 0), dec = -parts.filter(p => p.h < 0).reduce((a, p) => a + p.h, 0);
    rows.push({ id, name:f.name, parts, inc, dec, net:inc - dec });
    prev = cur;
  });
  const byCat = {}; LAB_CATS.forEach(c => byCat[c] = 0);
  rows.forEach(r => r.parts.forEach(p => byCat[p.cat] += p.h));
  const oneOff = (sel.indexOf('intake') >= 0 || sel.indexOf('gate') >= 0) ? LABOR.pilotH : 0;
  const nowM = prev.m, refM = ref.m, dShip = nowM.ship - refM.ship;
  const volume = dShip * 1000 * LABOR.perPieceSec / 3600;                         /* 多出貨帶動的人工站時間，另計，不算策略本身的增減 */
  const inc = rows.reduce((a, r) => a + r.inc, 0), dec = rows.reduce((a, r) => a + r.dec, 0);
  return { rows, byCat, inc, dec, net:inc - dec, oneOff, dShip, volume, ev };
}
function laborRowFor(id) {                                  /* 方塊提示用：已導入＝目前組合中的這列；未導入＝加在目前組合上會多出什麼 */
  const on = S.ids.indexOf(id) >= 0, c = laborCalc(on ? S.ids : S.ids.concat([id]), S.strength, S.sc && S.sc.ev);
  return { on, row:c.rows.find(r => r.id === id) };
}
function renderLabor() {
  const c = S.lab = laborCalc(S.ids, S.strength, S.sc && S.sc.ev), box = $('#lab');
  S.whs0 = whStats([], 0, S.sc && S.sc.ev); S.whs = whStats(S.ids, S.strength, S.sc && S.sc.ev);
  if (!box) return;
  if (!S.ids.length) { smoothHTML(box, '<p class="note">目前全部未導入（＝' + CM.name + '現況），沒有增減。勾選功能後，這裡列出每個策略新增與省下的人時。</p>'); renderLaborParams(); return; }
  let h = '<div class="labsum"><div><span>新增的工作</span><b class="up2">+' + f1(c.inc) + '</b><em>人時／月</em></div>'
    + '<div><span>省下的工作</span><b class="dn2">−' + f1(c.dec) + '</b><em>人時／月</em></div>'
    + '<div><span>淨變化</span><b class="' + (c.net < -0.05 ? 'dn2' : c.net > 0.05 ? 'up2' : '') + '">' + hh(c.net) + '</b><em>人時／月</em></div></div>';
  h += '<table class="labt"><thead><tr><th style="text-align:left">策略</th><th>增加</th><th>減少</th><th>淨變化</th></tr></thead><tbody>';
  c.rows.forEach(r => {
    h += '<tr class="lr" data-id="' + r.id + '"><td style="text-align:left"><b>' + r.name + '</b></td><td>' + (r.inc ? '<span class="up2">+' + f1(r.inc) + '</span>' : '—') + '</td><td>' + (r.dec ? '<span class="dn2">−' + f1(r.dec) + '</span>' : '—') + '</td><td><b class="' + (r.net < -0.05 ? 'dn2' : r.net > 0.05 ? 'up2' : '') + '">' + hh(r.net) + '</b></td></tr>';
    h += '<tr class="ld"><td colspan="4" style="text-align:left;white-space:normal">' + (r.parts.length ? r.parts.map(p => '<div><span class="tag ' + p.src + '">' + p.src + '</span> ' + p.cat + ' ' + hh(p.h) + ' h　' + p.what + '</div>').join('') : '<div class="note">沒有可量化的人時變化</div>') + '</td></tr>';
  });
  h += '</tbody></table>';
  h += '<table class="labt" style="margin-top:10px"><thead><tr><th style="text-align:left">依誰的時間</th><th>淨變化</th></tr></thead><tbody>'
    + LAB_CATS.map(k => '<tr><td style="text-align:left">' + k + ' <span class="note">' + LAB_CAT_NOTE[k] + '</span></td><td>' + (Math.abs(c.byCat[k]) < 0.05 ? '—' : hh(c.byCat[k])) + '</td></tr>').join('') + '</tbody></table>';
  h += '<p class="note" style="margin-top:8px">另計（不是策略本身的增減）：</p><ul class="note labx">'
    + (c.oneOff ? '<li>試點一次性 <b>+' + f1(c.oneOff) + '</b> 人時（第一個月：第 1 週 12，第 2–4 週每週 3），來自方案文件，由生管與業務暫停一件既有工作騰出，不加班。</li>' : '')
    + '<li>多出貨帶動的人工站時間 <b>' + hh(c.volume) + '</b> 人時／月（出貨 ' + hh(c.dShip) + ' 千片 × ' + LABOR.perPieceSec + ' 秒／片，資料2 抽測；<span class="tag 推算">推算</span>）。這是增產本身要花的時間，要在正常班內做完；插件站數與班次資料沒給，無法確認排得下。</li></ul>';
  h += '<p class="note" style="margin-top:6px">省下的人時是「理論上可回收」：作業員原本在等料、等換線，時間還給正常班，不代表可以減人；加班維持 3,700 h 不動。</p>';
  smoothHTML(box, h);
  renderLaborParams();
}
function renderLaborParams() {
  const p = $('#labParams'); if (!p || p.dataset.b) return; p.dataset.b = '1';
  p.innerHTML = '<div class="labp">' + LAB_FIELDS.map(f => '<label>' + f[1] + '<span><input type="number" min="0" step="any" data-k="' + f[0] + '" value="' + LABOR[f[0]] + '"> ' + f[2] + '</span></label>').join('') + '</div>'
    + '<p class="note" style="margin-top:6px">這些單位工時、人數與比例全部是【我猜的】，個案與資料1～3 沒有；請生管、課長確認後改成真數字。改了會立刻重算。</p>';
  p.addEventListener('input', e => { const k = e.target.dataset.k; if (!k) return; const v = parseFloat(e.target.value); if (isFinite(v) && v >= 0) { LABOR[k] = v; S.sc = scenario(S.ids, S.strength); renderMonthly(); } });
}

/* =====================================================================
   工人A／工人B 模擬（代表人物，不是真人）
   工人A＝SMT 線作業員：整月跟著一條線，換線、等料、拋料故障停機時，他就是被占住的那個人。
          每月被占住的小時 ＝ 該類停機時數 ÷ 4 條線（與每線幾個人無關，人數只影響「人時」，不影響每個人的時數）。
   工人B＝人工站作業員（插件、測試、組裝、包裝四站）：可用站時＝九月記錄工時（模型反推，已含九月加班），
          需要站時＝出貨 × 實測秒數（資料2 抽測）；測試站再加重測的處理。
   人力交叉支援開啟時，四站的忙閒依模型的人力池係數 0.6 互相補。
   ===================================================================== */
function workerSim(ids, s, ev, shipOv) {
  const m = simMonth(ids, s, ev), ship = shipOv == null ? null : shipOv, on = ids.indexOf('cross') >= 0 ? 0.6 * Math.min(1, s) : 0;
  const A = { co:m.coH / LINES, wait:m.mwH / LINES, fault:m.flH / LINES, run:m.run / LINES };
  A.idle = A.co + A.wait + A.fault;
  const co = m.co, tOn = ids.indexOf('test') >= 0 ? Math.min(1, s) : 0;
  const sh = ship == null ? m.ship : ship, retests = lerp(BASE.retBase, 1700, tOn) * (sh / 114) + BASE.retPerCO * co;
  const st = {}; let needT = 0, availT = 0;
  ['ins', 'test', 'asm', 'pack'].forEach(k => {
    const avail = stAvail(k);
    const need = (sh * 1000 + (k === 'test' ? retests : 0)) * BASE.actSec[k] / 3600;
    st[k] = { avail, need, util:need / avail }; needT += need; availT += avail;
  });
  const avg = needT / availT;
  let worst = null; Object.keys(st).forEach(k => { if (!worst || st[k].util > st[worst].util) worst = k; });
  /* 交叉支援：四站互補，模型用人力池算上限；判定改看「出貨 ÷ 人工站上限（含支援）」 */
  const bu = on > 0 ? (shipOv == null ? m.ship : shipOv) / m.manCap : st[worst].util;
  return { m, A, B:st, worst: on > 0 ? 'pool' : worst, bu, wh:whStats(ids, s, ev).tot };
}
function workerVerdict(without, withf) {                /* 只看「這個策略自己」讓 A、B 變好或變壞多少；B 已被別的策略推高的部分不算在它頭上 */
  const u = withf.bu, dB = withf.bu - without.bu, dA = withf.A.idle - without.A.idle, pt = f0(Math.abs(dB) * 100);
  const sta = wkN(withf.worst) + ' ' + f0(u * 100) + '%';
  if (u > WORKER.max + 1e-6) return { cls:'no', t:'不可加入', why:'工人B 的' + sta + '，排不下（不加人、不加班）' };
  if (dB > 0.005 && u > WORKER.warn) return { cls:'cond', t:'有條件', why:'把工人B 的' + wkN(withf.worst) + '推高 ' + pt + ' 個百分點到 ' + f0(u * 100) + '%，超過 ' + f0(WORKER.warn * 100) + '%，試點要量站別稼動與加班' };
  if (dA > 0.05) return { cls:'cond', t:'有條件', why:'工人A 被占住的時間反而多 ' + f1(dA) + ' h' };
  if (withf.wh != null && without.wh != null && withf.wh - without.wh > 0.05) return { cls:'cond', t:'有條件', why:'倉庫多 ' + f1(withf.wh - without.wh) + ' 人時；倉庫人數沒有資料，排不下就踩到「不加人」' };
  if (u > WORKER.warn) return { cls:'ok', t:'可加入', why:'不增加工人B 負擔（B 的' + sta + '是其他策略造成的，已超過 ' + f0(WORKER.warn * 100) + '%）' };
  return { cls:'ok', t:'可加入', why:'工人B 最忙站 ' + f0(u * 100) + '%，工人A 不增加' };
}
function renderWorkers() {
  const box = $('#labW'); if (!box) return;
  const ev = S.sc && S.sc.ev, s = S.strength, w0 = noExtra(() => workerSim([], 0, ev)), w1 = workerSim(S.ids, s, ev);
  const d = (a, b) => { const x = b - a; return Math.abs(x) < 0.05 ? '±0' : hh(x); };
  let h = '<h3 style="margin:14px 0 4px">工人A、工人B、倉庫人員模擬：目前組合</h3><p class="note">代表人物，不是真人。A＝SMT 線作業員；B＝人工站作業員；倉庫人員＝備料、找料補料、退料（個案：零件跨機種共用，換零件時舊料退回倉庫，新料要等供應商；倉庫幾人、怎麼運作個案沒寫）。每月小時數，導入前＝九月現況（模型）。</p>';
  /* 判讀重點：人工站上限、達標時的最忙站稼動、齊套備料打平點（都隨目前勾選與效果強度即時重算） */
  const wT = workerSim(S.ids, s, ev, TARGET.ship), kitIds = S.ids.indexOf('kit') >= 0 ? S.ids : S.ids.concat(['kit']);
  const kr = laborCalc(kitIds, s, ev).rows.find(r => r.id === 'kit'), kb = kr && kr.inc > 0 ? LABOR.kitPrepMin * kr.dec / kr.inc : null;
  h += '<div class="keyn"><div><span>人工站最多能出貨</span><b>' + f1(w1.m.manCap) + '</b><em>千片（SMT 上限 ' + f1(w1.m.smtCap) + '）</em></div>'
    + '<div><span>出貨剛好 ' + TARGET.ship + ' 千片時，最忙站</span><b class="' + (wT.bu > WORKER.max ? 'bad' : wT.bu > WORKER.warn ? 'warnu' : '') + '">' + f0(wT.bu * 100) + '%</b><em>' + wkN(wT.worst) + '（門檻 95%【我猜的】）</em></div>'
    + '<div><span>齊套備料打平點' + (S.ids.indexOf('kit') >= 0 ? '' : '（若加入）') + '</span><b>' + (kb == null ? '—' : f1(kb)) + '</b><em>分／次換線（預設 ' + LABOR.kitPrepMin + ' 分【我猜的】，超過就變增加負擔）</em></div></div>';
  h += '<div class="wk"><div class="wkc"><b>工人A（SMT 線）</b><span class="note">被停機占住的時間，每月</span><table class="labt"><tbody>'
    + [['換線停機', 'co'], ['等料停機', 'wait'], ['拋料故障', 'fault']].map(r => '<tr><td style="text-align:left">' + r[0] + '</td><td>' + f1(w0.A[r[1]]) + '</td><td>→ <b>' + f1(w1.A[r[1]]) + '</b></td><td>' + d(w0.A[r[1]], w1.A[r[1]]) + '</td></tr>').join('')
    + '<tr><td style="text-align:left"><b>合計被占住</b></td><td>' + f1(w0.A.idle) + '</td><td>→ <b>' + f1(w1.A.idle) + '</b></td><td><b>' + d(w0.A.idle, w1.A.idle) + '</b></td></tr></tbody></table>'
    + '<span class="note">約每天 ' + (Math.abs(w1.A.idle - w0.A.idle) / WORKDAYS * 60 < 1 ? '沒有變化' : (w1.A.idle < w0.A.idle ? '少被占住' : '多被占住') + ' ' + f0(Math.abs(w1.A.idle - w0.A.idle) / WORKDAYS * 60) + ' 分鐘') + '</span></div>';
  h += '<div class="wkc"><b>工人B（人工站）</b><span class="note">各站稼動率＝需要站時 ÷ ' + CM.name + '記錄工時</span><table class="labt"><tbody>'
    + ['ins', 'test', 'asm', 'pack'].map(k => { const a = w0.B[k].util, b = w1.B[k].util;
      return '<tr><td style="text-align:left">' + wkN(k) + '</td><td>' + f0(a * 100) + '%</td><td>→ <b class="' + (b > WORKER.max ? 'bad' : b > WORKER.warn ? 'warnu' : '') + '">' + f0(b * 100) + '%</b></td><td>' + d(a * 100, b * 100) + ' pt</td></tr>'; }).join('')
    + '</tbody></table><span class="note">最忙：' + wkN(w1.worst) + '。超過 ' + f0(WORKER.warn * 100) + '% 先不加量（團隊定的門檻【我猜的】；九月組裝站、包裝站已是 90%），超過 100% 排不下。</span></div>'
    + (() => { const a = S.whs0, b = S.whs, n = whNote(a, b), r = (t, x, y) => '<tr><td style="text-align:left">' + t + '</td><td>' + f1(x) + '</td><td>→ <b>' + f1(y) + '</b></td><td>' + d(x, y) + '</td></tr>';
      return '<div class="wkc"><b>倉庫人員（物料倉儲）</b><span class="note">會被策略改變的工作，人時／月</span><table class="labt"><tbody>'
        + r('等料時找料補料', a.find, b.find) + r((b.ksel ? '選擇性齊套備料（' : '齊套備料（') + f0(b.prepN) + ' 次換線）', a.prep, b.prep) + (b.eta ? r('料到日回報（' + f0(b.repN) + ' 張）', a.rep, b.rep) : '') + r('換零件退料（' + LABOR.whSwapN + ' 次，資料3）', a.swap, b.swap)
        + '<tr><td style="text-align:left"><b>合計</b></td><td>' + f1(a.tot) + '</td><td>→ <b>' + f1(b.tot) + '</b></td><td><b>' + d(a.tot, b.tot) + '</b></td></tr></tbody></table>'
        + '<div class="whsum"><span class="up2">增加 +' + f1(n.inc) + '</span><span class="dn2">減少 −' + f1(n.dec) + '</span><span>淨 <b class="' + (n.net < -0.05 ? 'dn2' : n.net > 0.05 ? 'up2' : '') + '">' + hh(n.net) + '</b></span></div>'
        + '<span class="note">占倉庫正常班 ' + f0(a.share * 100) + '% → <b>' + f0(b.share * 100) + '%</b>（' + LABOR.whPeople + ' 人 × ' + LABOR.whDayH + ' h × ' + WORKDAYS + ' 天＝' + f0(b.cap) + ' 人時；人數是【我猜的】）。日常依工單備料沒有資料，不在內。</span></div>'; })()
    + '</div>'
    + ((S.whs.prep + S.whs.rep) > 0 ? '<div class="whwarn"><b>⚠ 備註：可能踩到「不加人」的限制。</b>' + whNote(S.whs0, S.whs).txt + '增加的備料（或到料日回報）是倉庫的新工作；減少的找料補料原本是倉庫被等料打斷的零碎時間，兩者都在倉庫，但能不能互抵要看排班。個案與資料沒有倉庫人數、班表與現有負荷，所以<b>倉庫排不排得下沒有證據</b>。若排不下，只能加人或加班，就違反個案「不加人、加班不增加」。導入前要先問倉庫主管：目前每天備料、退料、找料各花多少時間，和還有多少空檔；試點以倉庫加班 0 小時為停止條件。</div>' : '');
  /* 倉庫減負方案比較：加在「目前組合（不含這三個方案）」上，各方案單獨比；方案之間重疊，不能相加 */
  (function () {
    const base = S.ids.filter(x => ['kit', 'kitsel', 'eta'].indexOf(x) < 0), w0b = whStats(base, s, ev), l0 = laborCalc(base, s, ev);
    const opts = [['kit', '完整齊套（每次換線都備料）', ['kit']], ['kitsel', 'A 選擇性齊套（只備插單、換零件）', ['kitsel']], ['eta', 'B 料到日確認（交期試算前回報新料到料日）', base.indexOf('gate') >= 0 ? ['eta'] : ['gate', 'eta']], ['both', 'A ＋ B', base.indexOf('gate') >= 0 ? ['kitsel', 'eta'] : ['gate', 'kitsel', 'eta']]];
    h += '<h3 style="margin:14px 0 4px">倉庫減負方案比較</h3><p class="note">加在目前組合（' + (base.length ? base.map(x => FEATURES.find(f => f.id === x).short).join('＋') : '九月現況') + '）上，各方案單獨比；方案處理的是同一批等料，數字不能相加。倉庫人時／月，增加與減少分開列。</p>'
      + '<table class="labt"><thead><tr><th style="text-align:left">方案</th><th>倉庫增加</th><th>倉庫減少</th><th>倉庫淨</th><th>全廠淨人時</th><th style="text-align:left">備註</th></tr></thead><tbody>';
    opts.forEach(o => { const ids = base.concat(o[2]), w = whStats(ids, s, ev), l = laborCalc(ids, s, ev), inc = (w.prep + w.rep) - (w0b.prep + w0b.rep), dec = w0b.find - w.find, net = w.tot - w0b.tot, pre = o[2].indexOf('gate') >= 0 && base.indexOf('gate') < 0;
      const be = (o[0] === 'kit' || o[0] === 'kitsel') && inc > 0 ? '備料超過約 ' + f1(LABOR.kitPrepMin * dec / inc) + ' 分／次就變增加' : o[0] === 'eta' || o[0] === 'both' ? '需有替代單可排；能避免的比例是【我猜的】（' + f0(LABOR.etaShare * 100) + '%）' : '';
      h += '<tr><td style="text-align:left"><b>' + o[1] + '</b>' + (pre ? ' <span class="note">（含閘門）</span>' : '') + '</td><td>+' + f1(inc) + '</td><td>−' + f1(dec) + '</td><td><b>' + hh(net) + '</b></td><td>' + hh(l.net - l0.net) + '</td><td style="text-align:left;white-space:normal" class="note">' + be + '</td></tr>'; });
    h += '</tbody></table><p class="note" style="margin-top:6px">B 的上限＝九月 19 h 供應商類等料全部避免（比例 100%）；實際比例沒有資料，要在試點量。倉庫現有人力排不排得下沒有資料，仍要問倉庫主管。<span class="tag 我猜的">我猜的</span></p>';
  })();
  /* 每個策略能不能加進來：已導入＝目前組合；未導入＝加在目前組合上 */
  h += '<h3 style="margin:14px 0 4px">能不能加入這個策略？</h3>' + (S.ids.length ? '<p style="margin:4px 0;font-size:13px"><b>' + (w1.bu > WORKER.max + 1e-6 ? '目前組合：工人B 的' + wkN(w1.worst) + '排不下。' : w1.bu > WORKER.warn ? '目前組合：工人B 的' + wkN(w1.worst) + '已到 ' + f0(w1.bu * 100) + '%，超過 ' + f0(WORKER.warn * 100) + '% 警戒，沒有餘裕。' : '目前組合：工人B 最忙站 ' + f0(w1.bu * 100) + '%，還有餘裕。') + '</b></p>' : '') + '<p class="note">已導入的看目前組合；未導入的看「加在目前組合上」。條件：不加人、不加班、工人B 最忙站 ≤ 95%（團隊 11/19 定的管理門檻【我猜的】；90% 只當參考線）。</p>'
    + '<table class="labt vt"><thead><tr><th style="text-align:left">策略</th><th>工人A 被占住</th><th>工人B 最忙站</th><th>倉庫人時</th><th style="text-align:left">判定</th></tr></thead><tbody>';
  FEATURES.forEach(f => {
    const on = S.ids.indexOf(f.id) >= 0, base = on ? S.ids.filter(x => x !== f.id) : S.ids.filter(x => (f.excl || []).indexOf(x) < 0), need = (f.needs || []).filter(x => base.indexOf(x) < 0),
      ids = base.concat(on ? [f.id] : need.concat([f.id])), a = workerSim(ids, s, ev), prev = workerSim(base, s, ev), v = workerVerdict(prev, a);
    h += '<tr><td style="text-align:left"><b>' + f.name + '</b> <span class="note">' + (on ? '已導入' : '若加入') + (!on && (f.excl || []).some(x => S.ids.indexOf(x) >= 0) ? '，取代' + FEATURES.find(x => x.id === (f.excl || []).find(y => S.ids.indexOf(y) >= 0)).name : '') + (!on && need.length ? '，連同閘門' : '') + '</span></td><td>' + d(prev.A.idle, a.A.idle) + ' h</td><td>' + WK_NAMES[a.worst] + ' ' + f0(a.bu * 100) + '%</td><td>' + d(whStats(base, s, ev).tot, whStats(ids, s, ev).tot) + ' h</td><td style="text-align:left;white-space:normal"><span class="vd ' + v.cls + '">' + v.t + '</span> <span class="note">' + v.why + '</span></td></tr>';
  });
  h += '</tbody></table><p class="note" style="margin-top:6px">工人B 的可用站時是用九月記錄工時反推（含九月已用滿的加班），不是真實班表；插件站數與班次資料沒給，所以這裡只能判斷方向，試點仍要量真實稼動。<span class="tag 我猜的">門檻 95%（參考線 90%）是團隊定的管理標準【我猜的】，個案沒有</span></p>';
  smoothHTML(box, h);
}

/* =====================================================================
   倉庫（物料倉儲）：個案只寫「零件跨機種共用；換零件時舊料退回倉庫，新料要等供應商」與資料3 的「倉庫紀錄」，
   沒寫倉庫幾個人、怎麼運作。這裡只算會被策略改變的三項工作；日常依工單備料的基本量沒有資料，不列入：
   1. 等料時找料補料：等料停機 × 倉庫人員（人／台）
   2. 齊套備料：換線次數 × 每次備料分鐘 × 人數（只有導入齊套才有）
   3. 換零件退料：九月 4 次（資料3）× 每次分鐘（策略不改變）
   ===================================================================== */
function whStats(ids, s, ev) {
  const m = simMonth(ids, s, ev), kit = ids.indexOf('kit') >= 0, ksel = !kit && ids.indexOf('kitsel') >= 0, eta = ids.indexOf('eta') >= 0 && ids.indexOf('gate') >= 0, ss = Math.min(1, s);
  const find = m.mwH * LABOR.crewWaitWh, prepN = kit ? m.co : ksel ? m.rush : 0, prep = prepN * LABOR.kitPrepMin * LABOR.kitPeople / 60 * ss;
  const repN = eta ? m.ev : 0, rep = repN * LABOR.etaAddMin / 60 * ss;       /* 料到日回報：每張插單一次 */
  const swap = LABOR.whSwapN * LABOR.whSwapMin / 60, cap = LABOR.whPeople * LABOR.whDayH * WORKDAYS, tot = find + prep + rep + swap;
  return { m, kit, ksel, eta, find, prep, prepN, rep, repN, swap, tot, cap, room: cap * (1 - LABOR.whRoutine / 100), share: tot / cap, co: m.co, mwH: m.mwH };
}
function whNote(a, b) {                                     /* 倉庫增減與「不加人」限制的備註 */
  const inc = Math.max(0, (b.prep + b.rep) - (a.prep + a.rep)), dec = Math.max(0, a.find - b.find), net = b.tot - a.tot;
  let own = '';
  if (S.ids && b === S.whs) {                                /* 各備料／確認方案本身：和「同組合但不含它」比 */
    const NM = { kit:'齊套', kitsel:'選擇性齊套', eta:'料到日確認' };
    ['kit', 'kitsel', 'eta'].forEach(id => { if (S.ids.indexOf(id) < 0) return;
      const c = whStats(S.ids.filter(x => x !== id), S.strength, S.sc && S.sc.ev), oi = (b.prep + b.rep) - (c.prep + c.rep), od = c.find - b.find;
      own += NM[id] + '本身：增加 +' + f1(oi) + '、減少 −' + f1(od) + '、淨 ' + hh(oi - od) + ' 人時。'; });
    if (own) own = '其中' + own + '其餘減少來自其他策略讓等料變少。';
  }
  return { inc, dec, net, txt: '倉庫（' + CM.name + '→目前組合）增加 +' + f1(inc) + ' 人時（備料、到料日回報），減少 −' + f1(dec) + ' 人時（少找料補料），淨 ' + hh(net) + ' 人時／月。' + own };
}
