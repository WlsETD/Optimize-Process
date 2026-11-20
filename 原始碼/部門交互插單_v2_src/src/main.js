/* 昇嶺電子 單一插單入口 Demo v2 — 主程式：入口切換、繪製、事件
   同一份記憶體資料驅動四個端；切換入口＝切換身分，每個端只看得到自己那一段。 */
(function (root) {
  'use strict';
  const E = root.Engine, U = E.util, Store = root.Store;
  const A = root.App;
  const { $, esc, tag, simTag, ord, toast } = A;

  const ROLES = [
    { k: 'boss', t: '老闆', r: 'LINE（模擬）', line: true },
    { k: 'sales', t: '業務', r: 'LINE＋小網頁（模擬）', line: true },
    { k: 'planner', t: '生管', r: '電腦網頁', line: false },
    { k: 'admin', t: '後台', r: '電腦網頁・管理者', line: false }
  ];

  let st;
  function boot() {
    st = A.st = Store.create({ onChange: () => render() });
    A.ui.liff = null;
  }

  /* ---------- 頂列、入口、導覽 ---------- */
  function badges() {
    const S = st.S, os = S.orders;
    const sp = st.person(A.ui.salesId);
    return {
      boss: '',
      sales: sp && sp.status === 'bound' ? String(os.filter(o => (o.status === 'received' && o.parse) || o.status === 'decided' || o.status === 'replied').length || '') : '',
      planner: String(os.filter(o => o.status === 'queued').length || ''),
      admin: S.notes.some(n => n.status === 'failed') || S.sim.lineDown ? '!' : ''
    };
  }
  function guide() {
    const os = st.S.orders.filter(o => o.status !== 'returned');
    const n = s => os.filter(o => o.status === s).length;
    const steps = [];
    if (!os.length) steps.push('從<b>老闆</b>開始：在模擬面板轉傳一則客戶訊息給官方帳號。');
    if (os.some(o => o.status === 'received' && !o.parse)) steps.push('解析中…');
    if (os.some(o => o.status === 'received' && o.parse)) steps.push('<b>業務</b>有 ' + os.filter(o => o.status === 'received' && o.parse).length + ' 張待確認：在 LINE 通知點「開啟確認頁」。');
    if (n('queued')) steps.push('<b>生管</b>有 ' + n('queued') + ' 張待決定：採用建議或調整。');
    if (n('decided')) steps.push('<b>業務</b>收到可交日：開啟回覆草稿，複製回覆。');
    if (n('replied')) steps.push('<b>老闆</b>已收到可交日卡片；<b>業務</b>出貨後回填實際結果。');
    if (os.length && !steps.length) steps.push('這輪都走完了。可到<b>後台</b>看稽核與指標，或改【我猜的】參數再試一張。');
    return '<div class="guide" aria-live="polite">' + simTag('示範導覽') + steps.join('　') + '</div>';
  }
  function renderChrome() {
    const now = st.stamp();
    $('#clock').textContent = '示意時間 ' + U.md(now.date) + '（週' + U.WD[U.dow(now.date)] + '）' + now.hm;
    const b = badges();
    $('#roles').innerHTML = ROLES.map(r => '<button type="button" class="role' + (r.line ? ' r-line' : '') + '" data-act="role" data-k="' + r.k + '"' + (A.ui.role === r.k ? ' aria-current="page"' : '') + '>' +
      '<span class="ico" aria-hidden="true"></span><span><span class="t">' + r.t + '</span><span class="r">' + r.r + '</span></span><span class="cnt"' + (b[r.k] ? ' aria-label="' + b[r.k] + ' 件待處理"' : '') + '>' + b[r.k] + '</span></button>').join('');
    $('#guide').innerHTML = guide();
  }

  /* ---------- 主繪製 ---------- */
  let lastRole = null;
  function render() {
    const y = window.scrollY; const same = lastRole === A.ui.role;
    const chats = {}; document.querySelectorAll('[data-chat]').forEach(el => { chats[el.dataset.chat] = { top: el.scrollTop, max: el.scrollHeight - el.clientHeight }; });
    const liffScroll = $('.liff-b') ? $('.liff-b').scrollTop : 0;
    const focusId = document.activeElement && document.activeElement.id;
    renderChrome();
    const fn = { boss: A.viewBoss, sales: A.viewSales, planner: A.viewPlanner, admin: A.viewAdmin }[A.ui.role];
    $('#view').innerHTML = fn();
    document.querySelectorAll('[data-chat]').forEach(el => {
      const prev = chats[el.dataset.chat];
      el.scrollTop = (!prev || prev.top >= prev.max - 30) ? el.scrollHeight : prev.top;
    });
    const lb = $('.liff-b'); if (lb && A.ui.keepLiffScroll) lb.scrollTop = liffScroll;
    A.ui.keepLiffScroll = true;
    if (focusId) { const el = document.getElementById(focusId); if (el && el.focus) el.focus({ preventScroll: true }); }
    if (same) window.scrollTo(0, y);
    lastRole = A.ui.role;
  }
  function go(role) {
    if (!ROLES.some(r => r.k === role)) role = 'boss';
    A.ui.role = role;
    try { if (location.hash !== '#' + role) history.replaceState(null, '', '#' + role); } catch (e) { /* 預覽環境可能不允許 */ }
    render(); window.scrollTo(0, 0);
  }
  function openLiff(page, id) { A.ui.liff = { page, id: id || null }; A.ui.keepLiffScroll = false; render(); }
  function resetDemo() {
    A.ui.confirmReset = false; boot();
    Object.assign(A.ui, { salesId: 'P-02', liff: null, sel: null, adj: {}, reason: {}, edit: {}, promise: {}, fu: {}, bindCode: '', web: { text: '', source: '電話' }, auditFilter: 'all', adminTab: 'people' });
    render();
  }

  /* ---------- 剪貼簿 ---------- */
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) { /* 改用選取 */ }
    try {
      const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e) { return false; }
  }

  /* ---------- 事件 ---------- */
  const me = () => A.ui.salesId;
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const a = b.dataset.act, id = b.dataset.id; const o = id ? ord(id) : null;
    switch (a) {
      case 'role': return go(b.dataset.k);
      case 'clock': st.advance(Number(b.dataset.min)); return toast('模擬時鐘前進 ' + b.dataset.min + ' 分鐘');
      case 'reset':
        if (!A.ui.confirmReset) { A.ui.confirmReset = true; toast('再按一次「重設 Demo」會清掉所有單與紀錄'); setTimeout(() => { A.ui.confirmReset = false; }, 4000); return; }
        resetDemo(); return toast('已重設 Demo');

      /* 老闆 */
      case 'fwd': {
        const s = Store.SAMPLES.find(x => x.key === b.dataset.k);
        const boss = st.S.people.find(p => p.role === 'boss');
        const r = await st.forward(boss.id, s.text, s.key);
        if (r && r.down) return toast('轉傳失敗：LINE 斷線（模擬）');
        if (r && r.order) toast('已收單 ' + r.order.id + '：解析完成後通知業務');
        return;
      }

      /* 業務：LINE 與 LIFF */
      case 'liff': return openLiff(b.dataset.page, id);
      case 'liff-close': A.ui.liff = null; return render();
      case 'unbound-say': {
        await st.forward(me(), '乙要追加 B2 300片，11/21 要', null);
        return toast('官方帳號回覆：帳號尚未綁定（訊息不處理）');
      }
      case 'bind': {
        const r = st.bind(me(), A.ui.bindCode);
        if (!r.ok) return toast(r.msg);
        A.ui.bindCode = ''; A.ui.liff = null; render(); return toast('綁定完成');
      }
      case 'edit': A.ui.edit[id + b.dataset.f] = true; return render();
      case 'pick': if (o) { st.setField(o, b.dataset.f, b.dataset.v); delete A.ui.edit[id + b.dataset.f]; } return;
      case 'keep': if (o) st.keepField(o, b.dataset.f); return;
      case 'fu-set': {
        const v = A.ui.fu[id + b.dataset.f];
        if (!v) return toast('先填答案');
        st.setField(o, b.dataset.f, v); delete A.ui.fu[id + b.dataset.f]; return;
      }
      case 'submit': {
        const r = st.submit(o, me());
        if (!r.ok) return toast(r.msg);
        return toast(o.id + ' 已送出，試算 ' + st.calcRef(r.calc) + ' 完成，交給生管');
      }
      case 'return': st.returnOrder(o, me()); A.ui.liff = null; render(); return toast(o.id + ' 已退回，原文保留');
      case 'copy': {
        const d = st.replyInfo(o);
        if (!d.calc || d.noDecision) return;
        // 自動示範時不動使用者的剪貼簿
        const ok = A.tour && A.tour.active ? true : await copyText(d.draft);
        const r = st.copyReply(o, me(), d.draft);
        if (!r.ok) return toast(r.msg);
        return toast(ok ? '已複製回覆，貼給客戶即可。已通知老闆。' : '瀏覽器不讓程式複製，請手動選取草稿。回覆紀錄已留下。');
      }
      case 'actual-save': {
        const ship = $('#a_ship').value, c = parseInt($('#a_c').value, 10), h = parseFloat($('#a_h').value);
        if (!ship || isNaN(c) || isNaN(h)) return toast('實際出貨日、換線次數、換線小時都要填');
        st.saveActual(o, me(), { shipDate: ship, changeovers: c, hours: h }); return toast('已回填，後台指標的試算誤差會更新');
      }
      case 'actual-sample': st.saveActual(o, me(), st.sampleActual(o)); return toast('已帶入示意數字並回填');
      case 'web-intake': {
        const t = A.ui.web.text.trim(); if (!t) return;
        const src = A.ui.web.source === 'LINE' ? 'WEB' : A.ui.web.source;
        A.ui.web.text = '';
        const no = await st.webIntake(me(), t, src);
        toast(no.id + ' 已登錄，解析完成');
        return openLiff('confirm', no.id);
      }

      /* 生管 */
      case 'sel': A.ui.sel = id; return render();
      case 'adopt': {
        const r = st.decide(o, 'adopt', A.ui.plannerId, { promise: A.ui.promise[id], reason: A.ui.reason[id] });
        if (!r.ok) return toast(r.msg);
        delete A.ui.promise[id]; delete A.ui.reason[id]; render();
        return toast(o.id + ' 已採用建議；客戶期限已推到業務與老闆的 LINE（模擬）');
      }
      case 'adjust-open': { const x = A.ui.adj[id] || {}; x.open = !x.open; if (!x.open) delete x.k; A.ui.adj[id] = x; return render(); }
      case 'adjust-save': {
        const x = A.ui.adj[id] || {};
        const r = st.decide(o, 'adjust', A.ui.plannerId, { k: x.k, reason: A.ui.reason[id], promise: A.ui.promise[id] });
        if (!r.ok) return toast(r.msg);
        delete A.ui.adj[id]; delete A.ui.reason[id]; delete A.ui.promise[id]; render();
        return toast(o.id + ' 已調整並寫進稽核；可交日已推到 LINE（模擬）');
      }

      /* 後台 */
      case 'atab': A.ui.adminTab = b.dataset.k; render(); return;
      case 'unbind': st.unbind(b.dataset.pid, '管理者'); return toast('已解除綁定，產生新的綁定碼');
      case 'regen': st.regenCode(b.dataset.pid, '管理者'); return toast('已重新產生綁定碼，舊碼失效');
      case 'apply-params': {
        const r = st.applyParams(A.readParams(), '管理者');
        return toast(r.ok ? '已套用 ' + r.n + ' 項，參數版本 p' + r.v + (r.recalc ? '；待決定的 ' + r.recalc + ' 張單已重新試算' : '') : '沒有套用：' + r.msg);
      }
      case 'reset-params': { const r = st.resetParams('管理者'); return toast(r.ok ? '已還原預設值（p' + r.v + '）' : r.msg); }
      case 'apply-prices': {
        const prices = {}; E.TABLES.models.forEach(m => { prices[m] = Number($('#pr_' + m).value); });
        const r = st.applyParams({ prices }, '管理者');
        return toast(r.ok ? '單價已更新（p' + r.v + '）' + (r.recalc ? '；' + r.recalc + ' 張單重新試算' : '') : r.msg);
      }
      case 'line-toggle': st.setLineDown(!st.S.sim.lineDown, '管理者'); return toast(st.S.sim.lineDown ? 'LINE 已模擬斷線' : 'LINE 已恢復；失敗的推播已補送');
      case 'redeliver': await st.redeliver(b.dataset.ev); return toast('LINE 重送同一事件：已用事件 ID 去重，沒有重複建單');
      case 'bad-sig': await st.webhook({ eventId: 'ev-forged', userId: 'U-不明', text: '（偽造請求）', badSig: true }); return toast('簽章不符，已拒絕');
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.field) {
      const o = A.ui.liff && ord(A.ui.liff.id);
      if (o) { delete A.ui.edit[o.id + t.dataset.field]; st.setField(o, t.dataset.field, t.value); }
      return;
    }
    const a = t.dataset.actChange; if (!a) return;
    if (a === 'salesId') { A.ui.salesId = t.value; A.ui.liff = null; return render(); }
    if (a === 'webSrc') { A.ui.web.source = t.value; return; }
    if (a === 'cand') { const x = A.ui.adj[t.dataset.id] || {}; x.k = parseInt(t.value, 10); A.ui.adj[t.dataset.id] = x; delete A.ui.promise[t.dataset.id]; return render(); }
    if (a === 'promise') { if (t.value) A.ui.promise[t.dataset.id] = t.value; return render(); }
    if (a === 'afilter') { A.ui.auditFilter = t.value; return render(); }
  });

  document.addEventListener('input', e => {
    const t = e.target; const a = t.dataset.actInput; if (!a) return;
    if (a === 'reason') {
      A.ui.reason[t.dataset.id] = t.value;
      const ok = t.value.trim().length >= 4; const sv = $('#save-' + t.dataset.id), w = $('#why-' + t.dataset.id);
      if (sv) sv.disabled = !ok;
      if (w) { w.textContent = ok ? '儲存後寫進稽核' : '沒填原因不能儲存'; w.classList.toggle('warn', !ok); }
    }
    if (a === 'fu') A.ui.fu[t.dataset.id + t.dataset.f] = t.value;
    if (a === 'webText') {
      A.ui.web.text = t.value;
      const bound = st.person(me()).status === 'bound';
      const bt = $('#btnWeb'); if (bt) bt.disabled = !t.value.trim() || !bound;
      const w = $('#webWhy'); if (w) w.textContent = !bound ? '未綁定的人員不能登錄' : t.value.trim() ? '登錄後到「我的待辦」確認' : '先貼上原文';
    }
    if (a === 'bindCode') {
      A.ui.bindCode = t.value;
      const bt = $('#btnBind'); if (bt) bt.disabled = !t.value.trim();
      const w = $('#bindWhy'); if (w) w.textContent = t.value.trim() ? '綁定後，新單通知會傳到這個 LINE' : '先輸入綁定碼';
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.actInput === 'fu') { const b = e.target.parentNode.querySelector('[data-act="fu-set"]'); if (b) b.click(); }
    if (e.key === 'Escape' && A.ui.liff) { A.ui.liff = null; render(); }
  });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== A.ui.role) go(h); });

  boot();
  A.ui.role = ROLES.some(r => r.k === location.hash.slice(1)) ? location.hash.slice(1) : 'boss';
  Object.assign(A, { go, reset: resetDemo });
  window.__demo = { get st() { return st; }, get ui() { return A.ui; } };
  render();
})(window);
