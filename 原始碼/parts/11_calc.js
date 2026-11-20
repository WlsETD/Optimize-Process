/* =====================================================================
   計算過程：生管自行計算（導入前） vs 固定程式試算（導入後）
   右邊是 demo-v2 的 engine.js 原樣（10_engine.js）實際跑出來的每一步，不是另寫的示意。
   佇列 Q-01～Q-07 是示意（demo 內建，依當天日期平移）；公式、參數與選位規則是 engine.js 的。
   ===================================================================== */
const CALC_PRICE = 1200;           // 個案平均單價，各機種未提供
function calcRun() {
  const E = Engine, U = E.util, R = DAY.RUSH, P = E.defaults();
  ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'C3'].forEach(m => { P.prices[m] = CALC_PRICE; });
  const date = dateOf(DAY.DATE), d0 = U.nextWork(date);
  const P1 = dayPlan(P1_IDS, 1), asOfH = P1.calcAt != null ? P1.calcAt : R.msgAt + 4 / 60;
  P.guess.slots = [hhmm(P1.insertAt)];           // 與重播一致：模擬器的閘門把插單排進這個時段【我猜的】
  const off = [0, 1, 1, 2, 2, 3, 3];
  const queue = E.seedQueue().map((q, i) => Object.assign({}, q, { due: U.addWork(d0, off[i]) }));
  const X = { id: 'X', customer: R.cust, model: R.model, qty: R.qty, due: U.addWork(d0, 1), partChange: !R.qty };
  const res = E.calc(queue, X, P, { date: d0, hour: asOfH });
  const best = res.cands[res.best];
  return { E, U, P, res, best, queue, X, asOfH, risk: E.risk(best, res.cal, P) };
}
const cpWho = (cls, t) => '<span class="cpw ' + cls + '">' + t + '</span>';
const cpStep = (n, who, title, body) => '<li class="cps"><div class="cpn">' + n + '</div><div class="cpb"><div class="cph">' + who + '<b>' + title + '</b></div>' + body + '</div></li>';

function renderCalc() {
  const host = $('#calcbody'); if (!host) return;
  const R = DAY.RUSH, Rt = 150, d = mdayOf(DAY.DATE) || {};
  const C = calcRun(), U = C.U, P = C.P, res = C.res, best = C.best;
  const lab = p => res.cal.at(p).label, labE = p => res.cal.atEnd(p).label;
  const e0 = buildEvents(dayPlan([], 1)).find(e => /排得進去|問生管/.test(e.cap)), e1 = buildEvents(dayPlan(P1_IDS, 1)).find(e => /系統試算|試算（固定程式/.test(e.cap));
  const formal = R.how === '正式單', isPart = !R.qty;
  const what = isPart ? '客戶' + R.cust + ' 換零件（' + R.model + '，沒有新增片數）' : '客戶' + R.cust + ' 追加 ' + f0(R.qty) + ' 片 ' + R.model;
  const mode = S.mode;

  /* ---------- 生管自行計算 ---------- */
  const run = R.qty / Rt, man = run + 0.5, act = run + P.data.changeoverH;
  const man3 = R.qty / 3 / Rt + 0.5, act3 = R.qty / 3 / Rt + P.data.changeoverH;
  const L = [];
  L.push(cpStep(1, cpWho('人', '人'), formal ? '正式單進系統' : '業務問：「排得進去嗎？」',
    formal ? '<p>正式單走系統直接到生管，本來就有紀錄；這一類不經過單一入口。</p>'
           : '<p>' + (e0 ? hhmm(e0.t) + ' ' : '') + '業務走去問生管，<b>口頭問、口頭答，沒有紀錄</b>（個案）。</p>'));
  L.push(cpStep(2, cpWho('人', '工程部標準'), '拿什麼數字算',
    '<ul><li>速度：SMT 24 秒／片 ＝ <b>150 片／小時</b>（資料2、資料1）</li><li>換線：排程<b>每線每天固定抓 0.5 小時</b>（個案）</li></ul>'));
  L.push(cpStep(3, cpWho('人', '心算'), '算式（依個案重建，【示意】）',
    isPart ? '<p>換零件不增加片數，只多一次換線：排程以 0.5 h 看待 → 「排得進去」。</p>'
      : '<div class="cpf">' + f0(R.qty) + ' ÷ 150 ＝ <b>' + f1(run) + ' h</b> 運轉<br>＋ 換線 0.5 h ＝ <b>' + f1(man) + ' h</b>（一條線）<br>分給 3 條線：' + f0(R.qty / 3) + ' ÷ 150 ＋ 0.5 ＝ <b>' + f1(man3) + ' h</b></div><p>看起來半天內做得完 → 「排得進去」。</p>'));
  L.push(cpStep(4, cpWho('漏', '沒算到的'), '同一張單，用機台紀錄的真實數字',
    '<div class="cptw"><table class="mdtbl"><thead><tr><th></th><th>生管腦中</th><th>機台紀錄</th></tr></thead><tbody>'
    + '<tr><td>每次換線</td><td>0.5 h</td><td>' + f2(P.data.changeoverH) + ' h</td></tr>'
    + (isPart ? '' : '<tr><td>' + f0(R.qty) + ' 片（一條線）</td><td>' + f1(man) + ' h</td><td>' + f1(act) + ' h</td></tr><tr><td>分 3 條線</td><td>' + f1(man3) + ' h</td><td>' + f1(act3) + ' h</td></tr>')
    + '<tr><td>' + DAY.LABEL + ' 換線停機（4 線合計）</td><td>0.5×4 ＝ 2.0 h</td><td>' + f1(d.coH || 0) + ' h</td></tr>'
    + '<tr><td>' + DAY.LABEL + ' 等料停機</td><td>算不到</td><td>' + f1(d.mwH || 0) + ' h</td></tr>'
    + '<tr><td>' + DAY.LABEL + ' 拋料與故障</td><td>算不到</td><td>' + f1(d.flH || 0) + ' h</td></tr></tbody></table></div>'
    + '<p class="note">整個九月：排程抓 0.5×4 線×26 天 ＝ 52 h，機台實際 133 h，差 81 h（約 1.2 萬片）。</p>'));
  L.push(cpStep(5, cpWho('結', '結果'), '怎麼回覆客戶',
    '<p>' + (formal ? '生管照常排，沒有試算閘門。' : '老闆口頭回「沒問題」：<b>沒有日期、沒有試算、沒有紀錄</b>。') + '現場 ' + (R.late ? '隔天' : hhmm(R.floorAt)) + ' 才知道。</p>'
    + (R.result ? '<p class="bad">後來：' + R.result + '（' + (DAY.DATE >= 1000 ? CM.tag : '資料3') + '）</p>' : '')));

  /* ---------- 固定程式試算（engine.js） ---------- */
  const rows = res.base.map(r => '<tr><td>' + r.job.id + ' ' + r.job.customer + r.job.model + (r.job.running ? '＊' : '') + '</td><td>' + f0(r.job.qty) + '</td><td>' + (r.c ? r.c + '×0.9' : '–') + '</td><td>' + lab(r.start) + '</td><td>' + labE(r.end) + '</td><td class="' + (r.late ? 'bad' : '') + '">' + U.md(r.job.due) + (r.late ? ' 晚' + r.late + '天' : ' 準時') + '</td></tr>').join('');
  const cand = res.cands.map((c, i) => '<tr class="' + (i === res.best ? 'bst' : '') + '"><td>' + (i === res.best ? '★ ' : '') + '插在 ' + c.afterId + ' 後</td><td>' + c.startAt.label + ' → ' + c.endAt.label + '</td><td class="' + (c.lateX ? 'bad' : '') + '">' + (c.lateX ? '晚 ' + c.lateX + ' 天' : '準時') + '</td><td>' + c.extraC + ' 次</td><td>' + f0(c.totalLoss) + '</td><td>' + (c.newLate.length ? c.newLate.length + ' 張' : '–') + '</td></tr>').join('');
  const xr = best.x, why = [];
  why.push('總罰款損失最小（' + f0(best.totalLoss) + ' 元）');
  const ties = res.cands.filter(c => Math.abs(c.totalLoss - best.totalLoss) <= 1e-6);
  if (ties.length > 1) why.push('同分時取多換線次數少、再取開工早的');
  const draft = C.E.replyDraft({ fields: { qty: { value: R.qty || 0 }, model: { value: R.model } } }, best.endAt.date, C.X.due);
  const S2 = [];
  S2.push(cpStep(1, cpWho('ai', 'AI'), '把原文整理成需求單',
    '<p>客戶 <b>' + R.cust + '</b>、機種 <b>' + R.model + '</b>、數量 <b>' + (R.qty ? f0(R.qty) : '無（換零件）') + '</b>、' + (isPart ? '<b>換零件</b>' : '追加單') + '、要求交期：原文' + (R.known ? '沒有日期' : '') + '，<span class="tag 示意">示意</span>以 ' + U.mdw(C.X.due) + ' 計。</p><p class="note">AI 只做這一步，且每個值要對得到原文；業務確認後才往下。數字都不由 AI 算。</p>'));
  S2.push(cpStep(2, cpWho('pg', '固定程式'), '時間尺度與參數',
    '<ul><li>每天可排：(760＋133)÷26 ＝ <b>' + f2(P.data.poolHoursPerDay) + ' h</b>（4 線合計，每線 ' + f2(res.cal.L) + ' h）</li><li>速度 <b>150 片／h</b>；換線 <b>0.90 h／次</b>（機台紀錄，不是 0.5）</li><li>同機種連做不換線；換零件多 ' + P.guess.partExtra + ' 次【我猜的】</li></ul>'));
  S2.push(cpStep(3, cpWho('pg', '固定程式'), '現行排程逐張往下推（佇列為示意）',
    '<div class="cptw"><table class="mdtbl"><thead><tr><th>單</th><th>片數</th><th>換線(h)</th><th>開始</th><th>結束</th><th>交期／結果</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '<p class="note">＊進行中的單。每張：結束 ＝ 開始 ＋ 片數÷150 ＋ 換線次數×0.90；晚幾天 ＝ 進位（結束 − 交期當天結束）。</p>'));
  S2.push(cpStep(4, cpWho('pg', '固定程式'), '進入時段與凍結',
    '<ul><li>收到時間 ' + res.asOf.label + ' → 最近的固定插單時段 <b>' + res.entry.label + '</b>（本模擬的假設：' + P.guess.slots.join('、') + '【我猜的】；demo 預設 10:00、15:00 兩個）</li><li>' + P.guess.freezeH + ' 小時內要開工的單先凍結，不重排（' + (res.frozenIds.length ? res.frozenIds.join('、') : '無') + '）</li></ul>'));
  S2.push(cpStep(5, cpWho('pg', '固定程式'), '比較 ' + res.cands.length + ' 個插入位置',
    '<div class="cptw"><table class="mdtbl"><thead><tr><th>位置</th><th>本單 開工 → 完成</th><th>本單</th><th>多換線</th><th>罰款(元)</th><th>連帶</th></tr></thead><tbody>' + cand + '</tbody></table></div>'
    + '<p class="note">罰款 ＝ 片數 × ' + f0(CALC_PRICE) + ' × 每日罰款率（乙 2%、丙 1%、甲 1.25%【我猜的】）× 晚幾天。' + (best.resorted ? '會遲的單依「晚一天損失」重排。' : '') + '</p>'));
  S2.push(cpStep(6, cpWho('pg', '固定程式'), '選位與結果',
    '<p>選 <b>插在 ' + best.afterId + ' 後</b>：' + why.join('；') + '。</p>'
    + '<p>本單 <b>' + best.startAt.label + ' 開工、' + best.endAt.label + ' 完成</b>' + (best.lateX ? '，晚 ' + best.lateX + ' 天' : '，趕得上 ' + U.mdw(C.X.due)) + '；風險 <b>' + C.risk.label + '</b>（' + C.risk.why.join('、') + '）。</p>'
    + '<div class="cpf">' + draft + '</div><p class="note">回覆草稿是固定範本；<b>沒有這份試算就不能回覆客戶</b>。指紋 ' + res.fingerprint + '：同樣輸入必得同樣結果。</p>'));
  S2.push(cpStep(7, cpWho('人', '生管'), '生管決定',
    '<p>生管看到最佳時機、數量、罰款等細節，<b>採用或調整</b>（調整要填原因，寫進稽核）。最後決定仍是生管。</p>'));

  const cmp = [['誰算', '生管心算', '固定程式（AI 只整理文字）'], ['換線時間', '每線每天 0.5 h', '機台紀錄 0.90 h／次'], ['比較幾種排法', '1 種（憑感覺）', res.cands.length + ' 個插入位置，選罰款最小'],
    ['會不會連帶影響別的單', '看不到', '逐張算，列出連帶變遲的單'], ['回覆客戶', '口頭、沒日期', '有日期，附試算編號與指紋'], ['留不留紀錄', '沒有', '輸入、參數、結果、決定都留'], ['誰最後決定', '老闆口頭', '生管（可調整，要填原因）']];
  host.innerHTML = '<div class="cphead"><b>' + DAY.LABEL + '（週' + DAY.DOW + '）' + what + '</b><span class="note">右邊的每個數字都是 engine.js 實際算出來的；佇列 Q-01～Q-07 是示意，所以日期請以重播為準，這裡看的是「怎麼算」。</span></div>'
    + '<div class="cpcmp"><table class="mdtbl"><thead><tr><th></th><th>導入前：生管自行計算</th><th>導入後：系統試算</th></tr></thead><tbody>' + cmp.map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>').join('') + '</tbody></table></div>'
    + '<div class="cpg"><section class="cpc ' + (mode === 'before' ? 'on' : '') + '"><h3>導入前：生管自行計算 <span class="tag 示意">重建</span></h3><ol class="cpl">' + L.join('') + '</ol></section>'
    + '<section class="cpc ' + (mode === 'after' ? 'on' : '') + '"><h3>導入後：固定程式試算 <span class="tag 推算">engine.js</span></h3><ol class="cpl">' + S2.join('') + '</ol></section></div>';
}
const f2 = v => (Math.round(v * 100) / 100).toFixed(2);
