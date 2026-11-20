/* =====================================================================
   罰款加權排序（工具 Demo）
   規則（團隊提案，11/17）：會遲的單，依「晚一天的損失」由大到小排序。
   晚一天損失 ＝ 片數 × 平均單價 × 每日罰款率。
   限制：計算方法須老闆確認才能導入。流程：生管「發送確認申請」→ 老闆 LINE 跳出確認訊息 → 同意／退回；
   老闆也可在 LINE 開「自動確認」，之後申請直接視為已確認（仍寫稽核紀錄）。
   狀態與資料常數見 00_helpers.js（需先於首次繪製定義）。
   ===================================================================== */
const fairRate = o => o.k === '乙' ? 0.02 : o.k === '丙' ? 0.01 : FAIR.w;
function bossLabel() { return BOSS.state === 'pending' ? '已送出，待老闆回覆' : BOSS.state === 'rejected' ? '老闆已退回' : '待老闆確認'; }
const hm = () => new Date().toLocaleTimeString('zh-TW', { hour12:false });
function bossLog(t) { BOSS.log.push(hm() + '　' + t); }
function fairRows() {
  return FAIR_ORDERS.map(o => {
    const rate = fairRate(o), day = o.pcs * FAIR.price * rate;
    return Object.assign({}, o, { rate, day, over: o.k === '甲' && o.late > FAIR.maxDelay });
  }).sort((a, b) => b.day - a.day || a.due - b.due);
}
const pct = r => (Math.round(r * 10000) / 100).toString() + '%';
const REQ_TEXT = '【確認申請】罰款加權排序\n會遲的單，依「晚一天的損失」排序：\n損失 ＝ 片數 × 單價 × 每日罰款率\n乙 2%／天、丙 1%／天（合約）；甲無罰則，權重 ' + pct(FAIR.w) + '、最多延後 ' + FAIR.maxDelay + ' 天（我們猜的）。\n只改先後，不改總出貨與準時率。';
function phoneHTML() {
  const st = BOSS.state;
  let m = '<div class="ln-sys">今天</div>';
  if (st !== 'none') {
    m += '<div class="ln-b bot"><b>昇嶺排程助手</b><pre>' + REQ_TEXT + '</pre>'
      + (st === 'pending' ? '<div class="ln-btns"><button type="button" data-fa="approve">同意</button><button type="button" data-fa="reject" class="no">退回</button></div>' : '') + '</div>';
    if (st === 'ok') m += '<div class="ln-b me">' + (BOSS.via.indexOf('自動') >= 0 ? '（自動確認已回覆：同意）' : '同意') + '</div>';
    if (st === 'rejected') m += '<div class="ln-b me">退回</div>';
  } else m += '<div class="ln-empty">尚無訊息。生管按「發送確認申請」後，這裡會自動跳出確認訊息。</div>';
  return '<div class="phone"><div class="ln-hd">老闆的 LINE（示範畫面）</div><div class="ln-msgs">' + m + '</div>'
    + '<label class="ln-auto"><button type="button" class="ft-sw' + (BOSS.auto ? ' on' : '') + '" role="switch" aria-checked="' + BOSS.auto + '" data-fa="auto"><i></i></button><span><b>自動確認</b><small>開啟後，這類申請直接視為同意</small></span></label></div>';
}
function fairHTML() {
  const rows = fairRows(), ok = BOSS.ok, adopted = S.ids.indexOf('fair') >= 0, st = BOSS.state;
  let ban;
  if (ok) ban = '<div class="fair-ban ok"><b>老闆已確認</b><span class="note">' + BOSS.via + '・' + BOSS.at + '</span><span style="flex:1"></span><button type="button" class="btn sm" data-fa="revoke">撤銷確認</button></div>';
  else if (st === 'pending') ban = '<div class="fair-ban wait"><b>已送出，待老闆回覆</b><span class="note">老闆的 LINE 已跳出確認訊息；回覆前不能導入。</span></div>';
  else ban = '<div class="fair-ban wait"><b>' + (st === 'rejected' ? '老闆已退回' : '待老闆確認') + '</b><span class="note">這個計算方法尚未核准：確認前不能導入。</span><span style="flex:1"></span><button type="button" class="btn sm pri" data-fa="req">發送確認申請</button></div>';
  let t = '<table><thead><tr><th>建議順序</th><th>客戶</th><th>片數</th><th>每日罰款率</th><th>晚一天損失</th><th>預估晚幾天</th><th>備註／旗標</th></tr></thead><tbody>';
  rows.forEach((r, i) => { t += '<tr><td>' + (i + 1) + '</td><td>' + r.k + '</td><td>' + f0(r.pcs) + '</td><td>' + pct(r.rate) + '</td><td>' + (r.day / 10000).toFixed(2) + ' 萬</td><td>' + r.late + ' 天</td><td class="flag">' + (r.over ? '超過「最多延後 1 天」【我猜的】，交老闆決定；' : '') + r.note + '</td></tr>'; });
  t += '</tbody></table>';
  const btn = ok
    ? '<button type="button" class="btn ' + (adopted ? '' : 'pri') + '" data-fa="adopt">' + (adopted ? '取消導入' : '導入此排序規則') + '</button><span class="note">導入只改先後順序；月度總出貨與準時率不變（模型未建模，效益為 0）。</span>'
    : '<button type="button" class="btn" disabled>導入此排序規則（需老闆確認）</button>';
  const log = BOSS.log.length ? '<h3 style="font-size:13px;margin:14px 0 4px">稽核紀錄</h3><ul class="fair-log">' + BOSS.log.map(x => '<li>' + x + '</li>').join('') + '</ul>' : '';
  return '<div class="fair-main">' + ban
    + '<h3 style="font-size:13px;margin:4px 0 6px">排序規則（團隊提案，待老闆確認的參數）</h3>'
    + '<p class="note" style="margin:0 0 8px">晚一天損失 ＝ 片數 × 平均單價 ' + f0(FAIR.price) + ' 元 × 每日罰款率；乙 2%、丙 1% 取自個案合約；甲無罰則，權重 ' + pct(FAIR.w) + '／天、最多延後 ' + FAIR.maxDelay + ' 天，皆為【我猜的】，待老闆決定。</p>'
    + t + '<div class="fair-act">' + btn + '</div>' + log
    + '<p class="note" style="margin-top:12px">示意數字（非企業資料）：片數、預估晚幾天為示意；系統只給建議，最後由生管決定。正式版：確認申請由機器人推播到老闆 LINE，回覆寫入稽核紀錄（推播計則數）。</p></div>' + phoneHTML();
}
function refreshFair() { $('#fairBody').innerHTML = fairHTML(); renderFeats(); renderStrat(); }
function openFair() { $('#fairBody').innerHTML = fairHTML(); $('#fairOvl').classList.add('on'); }
function closeFair() { $('#fairOvl').classList.remove('on'); }
function bossApprove(via) {
  BOSS.state = 'ok'; BOSS.ok = true; BOSS.via = via; BOSS.at = hm(); bossLog('老闆確認：' + via);
  if (S.ids.indexOf('fair') < 0) { setIds(S.ids.concat(['fair'])); bossLog('自動導入罰款加權排序'); }   /* 老闆同意後自動導入 */
}
$('#fairBody').addEventListener('click', e => {
  const b = e.target.closest('[data-fa]'); if (!b || b.disabled) return;
  const a = b.dataset.fa;
  if (a === 'req') {
    bossLog('生管發送確認申請');
    if (BOSS.auto) { bossApprove('自動確認（老闆已開啟）'); toast('老闆已開啟自動確認：已同意並自動導入此排序規則'); }
    else { BOSS.state = 'pending'; toast('已推播到老闆的 LINE，等待回覆'); }
    /* 留在原工具：右側老闆 LINE 自動跳出確認訊息 */
  }
  else if (a === 'approve') { bossApprove('老闆在 LINE 按「同意」'); toast('老闆已同意：已自動導入此排序規則'); }
  else if (a === 'reject') { BOSS.state = 'rejected'; bossLog('老闆在 LINE 按「退回」'); toast('老闆已退回，不能導入'); }
  else if (a === 'auto') {
    BOSS.auto = !BOSS.auto; bossLog('老闆' + (BOSS.auto ? '開啟' : '關閉') + '自動確認');
    if (BOSS.auto && BOSS.state === 'pending') { bossApprove('自動確認（老闆已開啟）'); toast('自動確認：待回覆的申請已同意並自動導入'); }
  }
  else if (a === 'revoke') {
    BOSS.ok = false; BOSS.state = 'none'; BOSS.at = ''; BOSS.via = ''; bossLog('撤銷確認，導入一併取消');
    if (S.ids.indexOf('fair') >= 0) setIds(S.ids.filter(x => x !== 'fair'));
    toast('已撤銷確認，導入已取消');
  }
  else if (a === 'adopt') { if (!BOSS.ok) return; setIds(S.ids.indexOf('fair') >= 0 ? S.ids.filter(x => x !== 'fair') : S.ids.concat(['fair'])); }
  refreshFair();
});
$('#fairX').addEventListener('click', closeFair);
$('#fairOvl').addEventListener('click', e => { if (e.target === $('#fairOvl')) closeFair(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#fairOvl').classList.contains('on')) closeFair(); });

/* 與部門交互插單 Demo（iframe）溝通：載入完成後送出確認申請；老闆在那邊按同意／退回，這邊同步狀態 */
let DEPT_REQ = null;
window.addEventListener('message', e => {
  const f = $('#ovlF'); if (!f || e.source !== f.contentWindow) return;
  const d = e.data || {};
  if (d.type === 'dept-ready' && DEPT_REQ) { f.contentWindow.postMessage(DEPT_REQ, '*'); DEPT_REQ = null; }
  else if (d.type === 'fair-reply' && BOSS.state === 'pending') {
    if (d.ans === 'approve') { bossApprove('老闆在 LINE 按「同意」'); toast('老闆已同意：已自動導入此排序規則'); }
    else { BOSS.state = 'rejected'; bossLog('老闆在 LINE 按「退回」'); toast('老闆已退回：不能導入'); }
    refreshFair();
  }
});
