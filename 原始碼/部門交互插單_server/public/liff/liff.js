/* 業務端 LIFF 小頁：我的待辦、確認新單（含追問）、交期回覆（複製）、回填實際結果、綁定、網頁備援收單。
   畫面沿用 Demo v2；資料全部來自後端，日期一律由後端試算與生管決定。 */
(function (root) {
  'use strict';
  const E = root.Engine, U = E.util, Store = root.Store;
  const A = root.App, st = A.st, ui = A.ui;
  const { $, esc, tag, statusChip, demoTag, minTxt, toast, rawBlock, rawMeta, prog, showVal, busy } = A;

  let me = null, cfg = {}, page = 'list', orderId = null, list = [], pollN = 0;

  function liffShell(title, body, act) {
    const nav = page !== 'list' && me ? '<button type="button" class="btn sm" data-act="go" data-page="list">我的待辦</button>' : '';
    return '<section class="liff page" aria-label="' + esc(title) + '"><div class="liff-h"><b>' + esc(title) + '</b>' + nav +
      '<span class="who">' + (me ? esc(me.name) + '（' + esc(me.roleLabel) + '）' : '') + '</span></div><div class="liff-b">' + body + '</div>' + (act ? '<div class="liff-act">' + act + '</div>' : '') + '</section>';
  }

  function fieldEditor(o, k) {
    const f = o.draft.fields[k]; const v = f.value; const id = 'ed_' + k;
    const lab = ' aria-label="' + E.FIELD_LABEL[k] + '"';
    if (k === 'customer') return '<select id="' + id + '" data-field="' + k + '"' + lab + '><option value="">（空白）</option>' + Object.keys(E.TABLES.customers).map(c => '<option' + (v === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select>';
    if (k === 'model') return '<select id="' + id + '" data-field="' + k + '"' + lab + '><option value="">（空白）</option>' + E.TABLES.models.map(c => '<option' + (v === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select>';
    if (k === 'qty') return '<input id="' + id + '" type="number" min="1" step="1" inputmode="numeric" data-field="' + k + '" value="' + (v == null ? '' : v) + '"' + lab + '>';
    if (k === 'due') return '<input id="' + id + '" type="date" data-field="' + k + '" value="' + (v || '') + '"' + lab + '>';
    return '<select id="' + id + '" data-field="' + k + '"' + lab + '><option value="true"' + (v === true ? ' selected' : '') + '>' + (k === 'partChange' ? '要換' : '追加單') + '</option><option value="false"' + (v === false ? ' selected' : '') + '>' + (k === 'partChange' ? '不換' : '一般單') + '</option></select>';
  }

  const brokenCalc = o => o.calcs.some(c => c.broken) ? '<div class="err-box">試算無法重現（指紋不符），請勿依此回覆，並通知管理者。</div>' : '';

  function viewConfirm(o) {
    if (!o) return liffShell('確認新單', '<div class="empty">找不到這張單。</div>');
    const head = '<div class="row"><b>' + o.id + '</b>' + statusChip(o) + '</div>' + prog(o);
    if (!o.parse) {
      return liffShell('確認新單', head + '<div class="banner info"><span class="busy"></span>解析中…最久 8 秒，超過就改用規則解析。</div>' + rawBlock(o, []));
    }
    const draft = o.status === 'received';
    const spans = E.FIELD_ORDER.map(k => ({ span: o.parse.fields[k].span, low: draft && st.lowOf(o, k) != null }));
    const eng = '<div class="engine' + (o.parse.fallback ? ' fallback' : '') + '">' + tag('ai', 'AI') + ' ' + esc(o.parse.status) + '</div>';
    const failed = o.parse.failed ? '<div class="banner err"><b>解析失敗：</b>原文沒有拆出任何欄位。原文已保存不會遺失；請直接回答下面的追問。</div>' : '';
    const rows = E.FIELD_ORDER.map(k => {
      const f = o.draft.fields[k]; const why = draft ? st.lowOf(o, k) : null;
      const cls = why ? 'low' : f.confirmed ? 'done' : 'ok';
      const editing = draft && ui.edit[o.id + k];
      let conf;
      if (f.confirmed) conf = tag('human', '已確認');
      else if (f.value == null || f.value === '') conf = '<span class="lowtxt">缺</span>';
      else conf = '<span class="conf">信心 ' + Math.round(f.conf * 100) + '%</span>';
      const ev = f.span ? '原文「' + esc(o.raw.text.slice(f.span[0], f.span[1])) + '」；' : '';
      const val = editing ? fieldEditor(o, k) : '<span class="val">' + esc(showVal(k, f.value)) + '</span>';
      const edit = draft && !editing && !why ? ' <button type="button" class="btn link" data-act="edit" data-f="' + k + '">改</button>' : '';
      return '<div class="lf-row ' + cls + '"><span class="lf-k">' + E.FIELD_LABEL[k] + '</span><span class="lf-v">' + val + edit + '</span><span>' + conf + '</span><span class="lf-n">' + ev + esc(f.note || '') + '</span></div>';
    }).join('');
    const fu = draft ? st.followups(o) : [];
    const fuHTML = fu.length ? '<section class="fuq" aria-label="追問"><h4>追問 ' + tag('ai', 'AI') + '<span class="sub">直接回答，答案會填進欄位</span></h4><ol>' + fu.map(q => {
      const f = o.draft.fields[q.k];
      let ctl = '';
      if (q.chips.length) ctl = '<div class="chips">' + q.chips.map(c => '<button type="button" class="chip-btn" data-act="pick" data-f="' + q.k + '" data-v="' + esc(c.v) + '">' + esc(c.l) + '</button>').join('') + '</div>';
      if (q.input) ctl = '<div class="in"><label class="sr" for="fu_' + q.k + '">' + esc(q.text) + '</label><input id="fu_' + q.k + '" type="' + q.input + '"' + (q.input === 'number' ? ' min="1" step="1" inputmode="numeric" placeholder="片數"' : '') + ' value="' + esc(ui.fu[o.id + q.k] || '') + '" data-act-input="fu" data-f="' + q.k + '"><button type="button" class="btn sm" data-act="fu-set" data-f="' + q.k + '">填入</button></div>';
      const keep = q.why === 'low' && f.value != null && !q.chips.some(c => String(c.v) === String(f.value)) ? '<div class="chips"><button type="button" class="chip-btn" data-act="keep" data-f="' + q.k + '">沿用「' + esc(showVal(q.k, f.value)) + '」</button></div>' : '';
      return '<li>' + esc(q.text) + (q.why === 'low' ? ' <span class="tag low">低信心</span>' : '') + ctl + keep + '</li>';
    }).join('') + '</ol></section>' : '';
    const body = head + eng + failed +
      '<section><h4 class="sub" style="margin-bottom:4px">原文（唯讀）' + tag('raw', '原文') + '　底線＝AI 取值位置</h4>' + rawBlock(o, spans) + rawMeta(o) + '</section>' +
      '<section><h4 class="sub" style="margin-bottom:4px">欄位草稿 ' + tag('ai', 'AI') + (draft ? '　信心低於 ' + Math.round(st.S.P.conf.threshold * 100) + '% 標紅' : '　已送出，唯讀') + '</h4><div class="lf">' + rows + '</div></section>' +
      fuHTML +
      (draft ? '<button type="button" class="btn link" data-act="return" style="align-self:flex-start">這不是插單，退回</button>' : '');
    let act;
    if (draft) {
      const pend = st.pendingFields(o);
      const why = pend.length ? '還有 ' + pend.length + ' 欄要處理：' + pend.map(p => E.FIELD_LABEL[p.k] + (p.why === 'missing' ? '（缺）' : '（低信心）')).join('、') : '送出後系統會試算，交給生管決定。';
      act = '<button type="button" class="btn primary" data-act="submit"' + (pend.length ? ' disabled' : '') + '>確認送出</button><p class="why' + (pend.length ? ' warn' : '') + '">' + esc(why) + '</p>';
    } else {
      const c = st.latestCalc(o);
      act = '<p class="why">' + (o.confirm ? esc(o.confirm.by) + ' 已於 ' + esc(o.confirm.at) + ' 確認' : '') + (c ? '；試算 ' + st.calcRef(c) + ' 完成' : '') + '。' +
        (o.status === 'queued' ? '等生管決定，可交日會傳到 LINE。' : o.status === 'returned' ? '已退回。' : '') + '</p>' +
        (o.status === 'decided' || o.status === 'replied' ? '<button type="button" class="btn" data-act="go" data-page="reply" data-id="' + o.id + '">到交期回覆</button>' : '');
    }
    return liffShell('確認新單', body, act);
  }

  function viewReply(o) {
    if (!o) return liffShell('交期回覆', '<div class="empty">找不到這張單。</div>');
    const head = '<div class="row"><b>' + o.id + '</b>' + statusChip(o) + '</div>' + prog(o);
    const d = st.replyInfo(o);
    if (!d.calc || d.noDecision) {
      const why = !d.calc ? '這張還沒有試算紀錄。沒有試算，系統不產生交期草稿。' : '生管還沒決定。決定後可交日會傳到 LINE。';
      return liffShell('交期回覆', head + '<div class="noreply">' + why + '</div>' + rawBlock(o, []),
        '<button type="button" class="btn primary" disabled>複製回覆</button><p class="why">' + (!d.calc ? '沒有試算紀錄，不能複製' : '生管還沒決定，不能複製') + '</p>');
    }
    const dec = o.decision;
    let body = head + brokenCalc(o) +
      '<div class="cmpdue"><div><div class="a">客戶要求</div><div class="b">' + U.mdw(d.req) + '</div></div><div class="ar" aria-hidden="true">→</div><div><div class="a">可交日（生管決定）</div><div class="b ' + (d.onTime ? '' : 'lowtxt') + '">' + U.mdw(d.dueDate) + '</div></div></div>' +
      '<p class="sub">' + (d.onTime ? '趕得上。' : '趕不上，晚 ' + U.workdaysBetween(d.req, d.dueDate) + ' 個工作天。') + '試算預計 ' + esc(d.est.endLabel) + ' 完成' + (dec.promiseChanged ? '，生管留了緩衝' : '') + '。</p>' +
      '<div class="human-block" style="padding:8px 12px;font-size:13px">' + tag('human', '生管決定') + ' ' + esc(dec.by) + '　' + (dec.type === 'adopt' ? '採用 AI 建議' : '調整') + '　' + esc(dec.at) + '<br>依據試算 ' + esc(dec.calc) + (dec.reason ? '<br>原因：' + esc(dec.reason) : '') + '</div>' +
      '<section class="ai-block"><div class="ptitle">回覆草稿 ' + tag('ai', '固定範本') + '<small>日期來自生管決定，不能改</small></div><div class="pb"><p id="replyTxt" style="white-space:pre-wrap">' + esc(d.draft) + '</p></div></section>' +
      rawBlock(o, []);
    let act;
    if (!o.reply) {
      act = '<button type="button" class="btn primary" data-act="copy"' + (o.calcs.some(c => c.broken) ? ' disabled' : '') + '>複製回覆</button><p class="why">複製後貼給客戶；系統會記錄交期、時間與試算編號，並通知老闆。</p>';
    } else {
      const a = o.actual;
      body += '<div class="banner info">已回覆：' + esc(o.reply.by) + ' ' + esc(o.reply.at) + '，交期 ' + U.mdw(o.reply.dueDate) + '，試算 ' + esc(o.reply.calc) + '。<button type="button" class="btn link" data-act="recopy">再複製一次</button></div>' +
        '<section class="panel"><div class="ptitle">回填實際結果<small>出貨後填，用來算試算誤差</small></div><div class="pb stack">' +
        '<div class="fgrid"><div><label class="lb" for="a_ship">實際出貨日</label><input id="a_ship" type="date" value="' + (a ? a.shipDate : d.dueDate) + '"' + (a ? ' disabled' : '') + '></div>' +
        '<div><label class="lb" for="a_c">額外換線（次）</label><input id="a_c" type="number" min="0" step="1" value="' + (a ? a.changeovers : '') + '"' + (a ? ' disabled' : '') + '></div>' +
        '<div><label class="lb" for="a_h">額外換線（小時）</label><input id="a_h" type="number" min="0" step="0.01" value="' + (a ? a.hours : '') + '"' + (a ? ' disabled' : '') + '></div></div>' +
        '<p class="sub">預估：額外換線 ' + d.est.extraC + ' 次 / ' + Number(d.est.extraH).toFixed(2) + ' h' + (a ? '；誤差 ' + (d.est.extraH > 0 ? Math.round(Math.abs(a.hours - d.est.extraH) / d.est.extraH * 100) + '%（目標 ±20%）' : '—（預估為 0）') : '') + '</p></div></section>';
      act = a ? '<p class="why">已回填（' + esc(a.at) + '）。這張單完成。</p>'
        : '<button type="button" class="btn primary" data-act="actual-save">儲存回填</button><p class="why">三欄都要填；換線次數與小時問生管或看機台紀錄</p>';
    }
    return liffShell('交期回覆', body, act);
  }

  function viewList() {
    const wait = o => { const w = Math.max(0, Math.round((Date.now() - new Date(o.waitingSince).getTime()) / 60000)); return '<span class="wait l0">等 ' + minTxt(w) + '</span>'; };
    const grp = (t, items, pg) => '<section><h4 class="sub" style="margin-bottom:4px">' + t + '（' + items.length + '）</h4>' + (items.length ? '<ul class="list lf">' + items.map(o =>
      '<li><button type="button" class="item" data-act="go" data-page="' + pg + '" data-id="' + o.id + '"><span class="l1"><b>' + o.id + '</b>' + statusChip(o) + (o.status === 'received' ? wait(o) : '') + (o.status === 'received' && !o.parsed ? '<span class="sub">解析中</span>' : '') + '</span><span class="l2">' + esc(o.text) + '</span></button></li>').join('') + '</ul>' : '<p class="sub">沒有。</p>') + '</section>';
    return liffShell('我的待辦', grp('待確認', list.filter(o => o.status === 'received'), 'confirm') + grp('待回覆客戶', list.filter(o => o.status === 'decided'), 'reply') +
      grp('待回填實際結果', list.filter(o => o.status === 'replied'), 'reply') + grp('等生管決定', list.filter(o => o.status === 'queued'), 'confirm') +
      '<p class="sub">清單依單排列，只看單的狀態。</p>',
      '<button type="button" class="btn" data-act="go" data-page="intake">電話或口頭的單：網頁登錄</button>');
  }

  function viewIntake() {
    return liffShell('網頁登錄（備援）',
      '<p>客戶用電話或口頭下單、或 LINE 轉傳不方便時，把內容照原樣打在這裡。送出後和 LINE 轉傳一樣：原文凍結、解析、等你確認。</p>' +
      '<div><label class="lb" for="webSrc">來源</label><select id="webSrc"><option value="PHONE">電話</option><option value="ORAL">口頭</option><option value="WEB">其他（網頁）</option></select></div>' +
      '<div><label class="lb" for="webText">原文（照客戶說的打，不要整理）</label><textarea id="webText" rows="5" data-act-input="webText" placeholder="例：乙那邊要插一張 B2，11/20 要，零件不變">' + esc(ui.web.text) + '</textarea></div>',
      '<button type="button" class="btn primary" id="btnWeb" data-act="web-intake"' + (ui.web.text.trim().length >= 4 ? '' : ' disabled') + '>登錄</button><p class="why" id="webWhy">' + (ui.web.text.trim().length >= 4 ? '登錄後到「確認新單」' : '先輸入原文') + '</p>');
  }

  function viewBind() {
    if (me) return liffShell('綁定帳號', '<div class="banner info">你已綁定為「' + esc(me.name) + '」（' + esc(me.roleLabel) + '）。</div>');
    return liffShell('綁定帳號',
      '<p>輸入管理者給你的一次性綁定碼。系統用 LINE 登入取得你的 LINE 使用者 ID，和人員資料對上。</p>' +
      '<div><label class="lb" for="bindCode">綁定碼</label><input id="bindCode" type="text" autocomplete="off" autocapitalize="characters" value="' + esc(ui.bindCode) + '" data-act-input="bindCode" placeholder="例：K7Q2-9F"></div>',
      '<button type="button" class="btn primary" data-act="bind" id="btnBind"' + (ui.bindCode.trim() ? '' : ' disabled') + '>綁定</button><p class="why" id="bindWhy">' + (ui.bindCode.trim() ? '綁定後，新單通知會傳到這個 LINE' : '先輸入綁定碼') + '</p>');
  }

  function render() {
    const y = (document.querySelector('.liff-b') || {}).scrollTop || 0;
    const o = orderId ? A.ord(orderId) : null;
    let html;
    if (page === 'bind' || !me) html = viewBind();
    else if (me.role !== 'sales') html = liffShell('昇嶺插單入口', '<div class="banner info">' + (me.role === 'boss' ? '老闆只需要在 LINE 轉傳訊息，系統會回「已收單」與可交日卡片，不用開這個頁面。' : '這個小頁給業務使用。生管請用電腦網頁。') + '</div>');
    else if (page === 'confirm') html = viewConfirm(o);
    else if (page === 'reply') html = viewReply(o);
    else if (page === 'intake') html = viewIntake();
    else html = viewList();
    $('#view').innerHTML = html;
    const b = document.querySelector('.liff-b'); if (b) b.scrollTop = y;
  }

  async function loadOrder(id) {
    const r = await A.api('GET', '/api/orders/' + encodeURIComponent(id));
    if (!r.ok) { toast(r.msg || '讀取失敗'); return null; }
    return st.put(r.order);
  }
  async function loadList() {
    const r = await A.api('GET', '/api/orders');
    list = r.ok ? r.orders : [];
    if (!r.ok) toast(r.msg || '讀取失敗');
  }
  async function go(pg, id) {
    page = pg; orderId = id || null; pollN = 0;
    const q = new URLSearchParams(location.search); q.set('page', pg); if (id) q.set('order', id); else q.delete('order');
    history.replaceState(null, '', location.pathname + '?' + q.toString());
    if (!me) return render();
    if (pg === 'list') await loadList();
    if (id) { const o = await loadOrder(id); if (o && !o.parse) setTimeout(poll, 2000); }
    render();
  }
  async function poll() {
    if (!orderId || pollN++ > 8) return;
    const o = await loadOrder(orderId);
    render();
    if (o && !o.parse) setTimeout(poll, 2000);
  }

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove(); return ok;
    }
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const o = orderId ? A.ord(orderId) : null;
    switch (b.dataset.act) {
      case 'go': return go(b.dataset.page, b.dataset.id);
      case 'edit': ui.edit[o.id + b.dataset.f] = true; return render();
      case 'pick': st.setField(o, b.dataset.f, b.dataset.v); delete ui.edit[o.id + b.dataset.f]; return render();
      case 'keep': st.keepField(o, b.dataset.f); return render();
      case 'fu-set': {
        const v = ui.fu[o.id + b.dataset.f];
        if (!v) return toast('先填答案');
        st.setField(o, b.dataset.f, v); delete ui.fu[o.id + b.dataset.f]; return render();
      }
      case 'submit': {
        const fields = {}, confirmed = [];
        for (const k of E.FIELD_ORDER) { fields[k] = o.draft.fields[k].value; if (o.draft.fields[k].confirmed) confirmed.push(k); }
        busy(true); const r = await A.api('POST', '/api/orders/' + o.id + '/confirm', { fields, confirmed }); busy(false);
        if (!r.ok) return toast(r.msg);
        await loadOrder(o.id); render();
        return toast(o.id + ' 已送出，試算 ' + r.calcId + ' 完成，交給生管');
      }
      case 'return': {
        if (!confirm('確定這不是插單、要退回？原文會保留。')) return;
        const r = await A.api('POST', '/api/orders/' + o.id + '/return');
        if (!r.ok) return toast(r.msg);
        toast(o.id + ' 已退回，原文保留'); return go('list');
      }
      case 'copy': {
        const d = st.replyInfo(o);
        if (!d.calc || d.noDecision) return;
        const copied = await copyText(d.draft);
        busy(true); const r = await A.api('POST', '/api/orders/' + o.id + '/reply'); busy(false);
        if (!r.ok) { await loadOrder(o.id); render(); return toast('沒有留下回覆紀錄：' + r.msg + '。請先不要貼給客戶。'); }
        await loadOrder(o.id); render();
        return toast(copied ? '已複製回覆，貼給客戶即可。已通知老闆。' : '手機不讓程式複製，請長按草稿手動複製。回覆紀錄已留下。');
      }
      case 'recopy': { const ok = await copyText(o.reply.text); return toast(ok ? '已複製' : '請長按草稿手動複製'); }
      case 'actual-save': {
        const ship = $('#a_ship').value, c = parseInt($('#a_c').value, 10), h = parseFloat($('#a_h').value);
        if (!ship || isNaN(c) || isNaN(h)) return toast('實際出貨日、換線次數、換線小時都要填');
        busy(true); const r = await A.api('POST', '/api/orders/' + o.id + '/actual', { shipDate: ship, changeovers: c, hours: h }); busy(false);
        if (!r.ok) return toast(r.msg);
        await loadOrder(o.id); render(); return toast('已回填');
      }
      case 'web-intake': {
        const t = ui.web.text.trim(); if (t.length < 4) return;
        busy(true); const r = await A.api('POST', '/api/intake', { text: t, source: $('#webSrc').value }); busy(false);
        if (!r.ok) return toast(r.msg);
        ui.web.text = ''; toast(r.orderId + ' 已登錄，解析中'); return go('confirm', r.orderId);
      }
      case 'bind': {
        const code = ui.bindCode.trim(); if (!code) return;
        const tok = root.liff && root.liff.getIDToken ? root.liff.getIDToken() : null;
        if (!tok) return toast('請從 LINE 裡開啟這個頁面再綁定');
        busy(true); const r = await A.api('POST', '/api/liff/bind', { idToken: tok, code }); busy(false);
        if (!r.ok) return toast(r.msg);
        ui.bindCode = ''; toast('已綁定為「' + r.name + '」（' + r.role + '）');
        await whoami(); return go('list');
      }
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.field) { const o = A.ord(orderId); if (o) { delete ui.edit[o.id + t.dataset.field]; st.setField(o, t.dataset.field, t.value); render(); } }
  });
  document.addEventListener('input', e => {
    const t = e.target; const a = t.dataset.actInput; if (!a) return;
    if (a === 'fu') ui.fu[orderId + t.dataset.f] = t.value;
    if (a === 'webText') {
      ui.web.text = t.value; const ok = t.value.trim().length >= 4;
      const bt = $('#btnWeb'); if (bt) bt.disabled = !ok;
      const w = $('#webWhy'); if (w) w.textContent = ok ? '登錄後到「確認新單」' : '先輸入原文';
    }
    if (a === 'bindCode') {
      ui.bindCode = t.value;
      const bt = $('#btnBind'); if (bt) bt.disabled = !t.value.trim();
      const w = $('#bindWhy'); if (w) w.textContent = t.value.trim() ? '綁定後，新單通知會傳到這個 LINE' : '先輸入綁定碼';
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.actInput === 'fu') { const b = e.target.parentNode.querySelector('[data-act="fu-set"]'); if (b) b.click(); }
  });

  async function whoami() { const r = await A.api('GET', '/api/me'); me = r.ok ? r : null; }

  async function boot() {
    cfg = await A.api('GET', '/api/config');
    const q0 = new URLSearchParams(location.search);
    const dev = cfg.devLogin && q0.get('dev') === '1';
    if (!dev) {
      if (!root.liff || !cfg.liffId) { $('#view').innerHTML = liffShell('昇嶺插單入口', '<div class="err-box">尚未設定 LIFF，請從 LINE 官方帳號的連結開啟。</div>'); return; }
      try { await root.liff.init({ liffId: cfg.liffId }); } catch (e) { $('#view').innerHTML = liffShell('昇嶺插單入口', '<div class="err-box">LINE 初始化失敗，請關閉後從 LINE 重新開啟。</div>'); return; }
      if (!root.liff.isLoggedIn()) { root.liff.login({ redirectUri: location.href }); return; }
      A.setIdToken(root.liff.getIDToken());
    }
    await whoami();
    const q = new URLSearchParams(location.search);
    await go(me ? (q.get('page') || 'list') : 'bind', q.get('order'));
  }
  window.__liff = { get me() { return me; }, get page() { return page; }, st };
  boot();
})(window);
