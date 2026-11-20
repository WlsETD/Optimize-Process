/* 生管看板（電腦網頁）：待決定清單（等最久在上）→ 一行結論 → 採用或調整、訂客戶期限；匯入每日佇列。
   看板只顯示單與機台，不顯示個人。畫面沿用 Demo v2。 */
(function (root) {
  'use strict';
  const E = root.Engine, U = E.util;
  const A = root.App, st = A.st, ui = A.ui;
  const { $, esc, tag, statusChip, minTxt, toast, rawBlock, rawMeta, prog, timeline, candTable, aiPanel, showVal, busy } = A;

  let me = null, list = [], queue = null, params = null, showImport = false, impText = '', impErrs = [];

  function taipeiNow() {
    const t = new Date(Date.now() + 8 * 3600000);
    return { date: t.toISOString().slice(0, 10), hour: t.getUTCHours() + t.getUTCMinutes() / 60 };
  }
  function curSchedule() {
    const P = params.P, now = taipeiNow();
    const cal = E.makeCal(now.date, P);
    const sun = U.dow(now.date) === 0;
    const p0 = cal.pos(sun ? U.nextWork(now.date) : now.date, sun ? P.guess.dayStart : now.hour);
    return { cal, rows: E.runSeq(queue.items, p0, P, cal) };
  }
  const waitOf = it => Math.max(0, Math.round((Date.now() - new Date(it.waitingSince).getTime()) / 60000));

  function view() {
    const pend = list.filter(o => o.status === 'queued');
    const done = list.filter(o => o.status !== 'queued');
    const head = '<div class="ph"><h1>生管看板</h1>' + tag('human', '生管') + '<span class="sub">佇列 q' + queue.ver + '，參數 p' + params.ver + '</span>' +
      '<button type="button" class="btn sm" data-act="imp-toggle" style="margin-left:auto">' + (showImport ? '收起匯入' : '匯入今日佇列') + '</button></div>' +
      '<p class="lede">左邊是待決定的單，等最久的排最上面。每張單先看一行結論，要看依據再展開。看板只顯示單與機台，不顯示個人。</p>' +
      (showImport ? importPanel() : '');
    let sel = ui.sel ? A.ord(ui.sel) : null;
    const item = it => {
      const w = it.status === 'queued' ? '<span class="wait l0">等 ' + minTxt(waitOf(it)) + '</span>' : '';
      return '<button type="button" class="pl-item" data-act="sel" data-id="' + it.id + '"' + (ui.sel === it.id ? ' aria-current="true"' : '') + '><span class="l1"><b>' + it.id + '</b>' + statusChip(it) + w + '</span>' +
        (it.summary ? '<span class="sum">' + esc(it.summary.text) + '</span>' : it.decision ? '<span class="sub">' + esc(it.decision.by) + ' ' + (it.decision.type === 'adopt' ? '採用' : '調整') + '，客戶期限 ' + U.mdw(it.decision.promise) + '</span>' : '') + '</button>';
    };
    const nav = '<nav class="panel pl-list" aria-label="單據清單"><div class="grp">待決定（' + pend.length + '）・依等待時間</div>' +
      (pend.length ? pend.map(item).join('') : '<div class="pb sub">沒有待決定的單。</div>') +
      '<div class="grp">已決定（' + done.length + '）</div>' + (done.length ? done.map(item).join('') : '<div class="pb sub">還沒有。</div>') + '</nav>';
    const detail = sel ? ticket(sel) : '<section class="panel"><div class="pb"><div class="empty">' + (list.length ? '從左邊選一張單。' : '還沒有送來的單。<br>老闆在 LINE 轉傳、業務在 LINE 確認送出之後，單會出現在這裡。') + '</div></div></section>';
    let tl;
    if (sel && sel.status === 'queued' && st.latestCalc(sel)) {
      const calc = st.latestCalc(sel), r = calc.result; const adj = ui.adj[sel.id] || {};
      const k = adj.open && adj.k != null ? adj.k : r.cands[r.best].k; const c = r.cands.find(z => z.k === k);
      tl = '<div class="ptitle">排程預覽<small>' + sel.id + ' 排在 ' + c.afterId + ' 之後' + (adj.open && adj.k != null ? '（調整中）' : '（AI 建議）') + '</small></div>' + timeline(c.rows, r.cal, sel.id);
    } else {
      const cs = curSchedule();
      tl = '<div class="ptitle">現行排程<small>佇列 q' + queue.ver + '（' + esc(queue.source || '') + '）</small></div>' + timeline(cs.rows, cs.cal, sel ? sel.id : '');
    }
    const side = '<aside class="pl-side stack"><div class="panel">' + tl + '</div>' +
      '<p class="sub">每天可排小時由九月 (760＋133)÷26 推算，4 線合計。<b>插件站是瓶頸，試算目前未納入</b>（站數與班次資料未提供）。</p></aside>';
    return head + '<div class="pl">' + nav + '<div class="pl-detail-wrap">' + detail + '</div>' + side + '</div>';
  }

  function importPanel() {
    return '<section class="panel imp"><div class="ptitle">匯入今日佇列<small>Excel 另存成「CSV UTF-8」後貼上或選檔；整批檢查，有錯就不收</small></div><div class="pb stack">' +
      '<p class="sub">表頭：編號、客戶、機種、數量、交期、生產中（生產中的單填「是」，放最前面）。匯入後，待決定的單會用新佇列重算。</p>' +
      '<div class="row"><input type="file" id="impFile" accept=".csv,text/csv"></div>' +
      '<textarea id="impText" data-act-input="imp" placeholder="編號,客戶,機種,數量,交期,生產中&#10;Q-01,乙,B2,3300,2026-11-17,是">' + esc(impText) + '</textarea>' +
      (impErrs.length ? '<ul class="errs">' + impErrs.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') +
      '<div class="dec-act"><button type="button" class="btn primary" data-act="imp-save" id="impSave"' + (impText.trim() ? '' : ' disabled') + '>匯入</button><span class="why">會成為新的佇列版本並寫進稽核</span></div></div></section>';
  }

  function ticket(o) {
    const calc = st.latestCalc(o);
    if (!calc) return '<section class="panel"><div class="pb"><div class="empty">' + o.id + ' 還沒有試算。</div></div></section>';
    const r = calc.result; const sm = st.summary(o);
    const f = o.draft.fields;
    const chg = k => o.confirm && o.confirm.changes.some(c => c.field === k) ? '<span class="chg">業務改過</span>' : '';
    const fl = E.FIELD_ORDER.map(k => '<tr><th scope="row">' + E.FIELD_LABEL[k] + '</th><td>' + esc(showVal(k, f[k].value)) + chg(k) + '</td></tr>').join('');
    const adj = ui.adj[o.id] || {}; const open = !!adj.open;
    const selK = adj.k != null ? adj.k : r.cands[r.best].k;
    const rsn = ui.reason[o.id] || '';
    const broken = o.calcs.some(c => c.broken);
    let act;
    if (broken) act = '<div class="err-box">試算無法重現（指紋不符），不能決定。請通知管理者。</div>';
    else if (o.status === 'queued') {
      const cSel = r.cands.find(z => z.k === (open ? selK : r.cands[r.best].k)) || r.cands[r.best];
      const minD = cSel.endAt.date;
      let pr = ui.promise[o.id] || minD; if (pr < minD) { pr = minD; ui.promise[o.id] = minD; }
      const changed = pr !== minD;
      const needR = open || changed; const okR = rsn.trim().length >= 4;
      const promiseRow = '<div><label class="lb" for="pr-' + o.id + '">回給客戶的期限 ' + tag('human', '生管決定') + '</label><div class="row"><input id="pr-' + o.id + '" type="date" min="' + minD + '" value="' + pr + '" data-act-change="promise" data-id="' + o.id + '" style="width:auto">' +
        '<span class="sub">試算完成 ' + esc(cSel.endAt.label) + '。可以訂晚一點留出貨緩衝，不能更早' + (changed ? '；比完成日晚 ' + U.workdaysBetween(minD, pr) + ' 個工作天' : '') + '</span></div></div>';
      const reasonBox = needR ? '<div><label class="lb" for="rsn-' + o.id + '">' + (open ? '調整原因' : '改期限的原因') + '（必填，至少 4 個字）</label><textarea id="rsn-' + o.id + '" rows="2" data-act-input="reason" data-id="' + o.id + '" placeholder="' + (open ? '例：該線明天有治具檢修，先排後面' : '例：出貨前要多一天檢驗') + '">' + esc(rsn) + '</textarea></div>' : '';
      const why = '<span class="why' + (needR && !okR ? ' warn' : '') + '" id="why-' + o.id + '">' + (needR && !okR ? '沒填原因不能儲存' : '寫進稽核，期限推到業務與老闆的 LINE') + '</span>';
      if (!open) {
        act = '<section class="stack">' + promiseRow + reasonBox + '<div class="dec-act"><button type="button" class="btn primary" id="save-' + o.id + '" data-act="adopt" data-id="' + o.id + '"' + (needR && !okR ? ' disabled' : '') + '>採用建議</button><button type="button" class="btn" data-act="adjust-open" data-id="' + o.id + '">調整位置</button>' + why + '</div>' +
          '<p class="sub">AI 只給建議，由你決定。</p></section>';
      } else {
        act = '<section class="human-block stack" style="padding:12px 14px"><h4>調整：選別的位置，並寫原因 ' + tag('human', '生管決定') + '</h4>' + candTable(o, calc, selK, true) + promiseRow + reasonBox +
          '<div class="dec-act"><button type="button" class="btn primary" id="save-' + o.id + '" data-act="adjust-save" data-id="' + o.id + '"' + (!okR ? ' disabled' : '') + '>儲存調整</button><button type="button" class="btn link" data-act="adjust-open" data-id="' + o.id + '">取消，回到建議</button>' + why + '</div></section>';
      }
    } else {
      const d = o.decision;
      const stale = d && d.calc !== st.calcRef(calc);
      act = d ? '<section class="human-block" style="padding:12px 14px"><div class="row">' + tag('human', '生管決定') + '<b>' + (d.type === 'adopt' ? '採用 AI 建議' : '調整') + '</b><span class="sub">' + esc(d.by) + '，' + esc(d.at) + '，依據 ' + esc(d.calc) + '</span></div>' +
        '<div style="margin-top:4px">實際插入：排在 ' + esc(d.afterId) + ' 之後，' + esc(d.actualSlot) + '</div>' + (d.reason ? '<div>原因：' + esc(d.reason) + '</div>' : '') +
        '<div>回給客戶的期限：<b>' + U.mdw(d.promise) + '</b>（試算完成 ' + esc(d.est.endLabel) + '）</div>' +
        '<div class="sub" style="margin-top:4px">期限已推到業務與老闆的 LINE。' + (o.reply ? '業務已於 ' + esc(o.reply.at) + ' 回覆客戶。' : '業務尚未回覆客戶。') + '</div>' +
        (stale ? '<div class="why warn">之後排程或參數有變動，最新試算是 ' + esc(st.calcRef(calc)) + '，這個決定依據舊版。</div>' : '') + '</section>' : '';
    }
    return '<article class="panel pl-detail"><div class="t-head"><b>' + o.id + '</b>' + statusChip(o) + '<span class="sub">試算 ' + esc(st.calcRef(calc)) + (calc.rev > 1 ? '（' + esc(calc.reason) + '）' : '') + '</span></div><div class="pb">' +
      prog(o) +
      (o.status === 'queued' && sm ? '<div class="concl">' + tag('ai', 'AI 結論') + ' ' + esc(sm.text) + '<span class="sub">準時風險 ' + sm.risk.label + '（' + esc(sm.risk.why.join('；')) + '）；罰款等級 ' + sm.loss.label + '</span></div>' : '') +
      act +
      '<details class="more"' + (open ? ' open' : '') + '><summary>看原單與試算依據</summary><div class="t-grid">' +
      '<section class="t-orig"><h4>原單原樣 ' + tag('raw', '原文') + '<small class="sub">不可修改</small></h4>' + rawBlock(o, []) + rawMeta(o) +
      '<h4 style="margin-top:14px">確認後的欄位 ' + tag('human', '業務確認') + '</h4><table class="mini"><tbody>' + fl + '<tr><th scope="row">確認</th><td>' + esc(o.confirm ? o.confirm.by + '　' + o.confirm.at : '') + '</td></tr></tbody></table></section>' +
      '<section class="t-ai"><h4>AI 分析 ' + tag('ai', 'AI') + '<small>只給建議，由生管決定</small></h4>' + aiPanel(o, calc) + '</section></div></details>' +
      '</div></article>';
  }

  function render() { $('#view').innerHTML = view(); }

  async function load(selId) {
    const [l, q, p] = await Promise.all([A.api('GET', '/api/orders'), A.api('GET', '/api/queue'), A.api('GET', '/api/params')]);
    if (!l.ok) { if (l.status === 401) return toLogin(); toast(l.msg); return; }
    list = l.orders; queue = q.queue; params = p.params;
    const want = selId || ui.sel || (list.find(o => o.status === 'queued') || list[0] || {}).id;
    ui.sel = want || null;
    if (want) { const r = await A.api('GET', '/api/orders/' + encodeURIComponent(want)); if (r.ok) st.put(r.order); }
    render();
  }
  function toLogin() { location.href = '/auth/login?next=' + encodeURIComponent('/planner/'); }

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const id = b.dataset.id; const o = id ? A.ord(id) : null;
    switch (b.dataset.act) {
      case 'refresh': return load();
      case 'logout': await A.api('POST', '/auth/logout'); location.href = '/planner/'; return;
      case 'sel': return load(id);
      case 'imp-toggle': showImport = !showImport; impErrs = []; return render();
      case 'imp-save': {
        busy(true);
        const r = await fetch('/api/queue/import', { method: 'POST', headers: { 'Content-Type': 'text/csv; charset=utf-8' }, credentials: 'same-origin', body: impText });
        const j = await r.json().catch(() => ({ ok: false, errors: ['伺服器回應看不懂'] })); busy(false);
        if (!j.ok) { impErrs = j.errors || [j.msg || '匯入失敗']; return render(); }
        impText = ''; impErrs = []; showImport = false; toast('已匯入佇列 q' + j.ver + '（' + j.count + ' 張），重算 ' + j.recalced + ' 張待決定的單');
        return load();
      }
      case 'adopt': case 'adjust-save': {
        const calc = st.latestCalc(o); const x = ui.adj[id] || {};
        const body = { type: b.dataset.act === 'adopt' ? 'adopt' : 'adjust', k: x.k, promise: ui.promise[id], reason: ui.reason[id], calcId: calc.id };
        busy(true); const r = await A.api('POST', '/api/orders/' + id + '/decide', body); busy(false);
        if (!r.ok) { toast(r.msg); if (r.code === 'stale') { delete ui.adj[id]; await load(id); } return; }
        delete ui.adj[id]; delete ui.reason[id]; delete ui.promise[id];
        toast(id + (body.type === 'adopt' ? ' 已採用建議' : ' 已調整') + '；客戶期限 ' + U.mdw(r.promise) + ' 已推到業務與老闆的 LINE');
        return load(id);
      }
      case 'adjust-open': { const x = ui.adj[id] || {}; x.open = !x.open; if (!x.open) delete x.k; ui.adj[id] = x; return render(); }
    }
  });
  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.id === 'impFile' && t.files[0]) { impText = await t.files[0].text(); impErrs = []; return render(); }
    const a = t.dataset.actChange; if (!a) return;
    if (a === 'cand') { const x = ui.adj[t.dataset.id] || {}; x.k = parseInt(t.value, 10); ui.adj[t.dataset.id] = x; delete ui.promise[t.dataset.id]; return render(); }
    if (a === 'promise') { if (t.value) ui.promise[t.dataset.id] = t.value; return render(); }
  });
  document.addEventListener('input', e => {
    const t = e.target; const a = t.dataset.actInput; if (!a) return;
    if (a === 'reason') {
      ui.reason[t.dataset.id] = t.value;
      const ok = t.value.trim().length >= 4; const sv = $('#save-' + t.dataset.id), w = $('#why-' + t.dataset.id);
      if (sv) sv.disabled = !ok;
      if (w) { w.textContent = ok ? '儲存後寫進稽核' : '沒填原因不能儲存'; w.classList.toggle('warn', !ok); }
    }
    if (a === 'imp') { impText = t.value; const s = $('#impSave'); if (s) s.disabled = !t.value.trim(); }
  });

  (async function boot() {
    const r = await A.api('GET', '/api/me');
    if (!r.ok) {
      const cfg = await A.api('GET', '/api/config');
      if (cfg.devLogin && !cfg.lineLogin) { location.href = '/auth/dev?next=' + encodeURIComponent('/planner/'); return; }
      return toLogin();
    }
    me = r;
    if (!['planner', 'lead', 'admin'].includes(me.role)) { $('#view').innerHTML = '<div class="err-box">' + esc(me.roleLabel) + '請在 LINE 裡操作。</div>'; return; }
    $('#who').textContent = me.name + '（' + me.roleLabel + '）';
    load();
  })();
  window.__planner = { get list() { return list; }, st };
})(window);
