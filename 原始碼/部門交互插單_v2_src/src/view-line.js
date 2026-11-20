/* 昇嶺電子 單一插單入口 Demo v2 — LINE 端（老闆、業務）
   全部是「模擬」：沒有連真的 LINE。手機畫面裡只有 LINE 會出現的東西；
   手機外面的綠色虛線框是 Demo 用的模擬操作。 */
(function (root) {
  'use strict';
  const E = root.Engine, U = E.util, Store = root.Store;
  const A = root.App;
  const { esc, fmtN, tag, guessTag, simTag, demoTag, statusChip, ord, minTxt, rawBlock, rawMeta, prog, showVal } = A;

  /* ---------- 手機外框 ---------- */
  function phone(p, chatHTML, foot, overlay) {
    return '<div class="phone" role="region" aria-label="模擬 LINE：' + esc(p.name) + ' 的手機">' +
      '<div class="ph-top"><b>昇嶺插單</b><span class="tag sim">LINE 官方帳號・模擬</span><span class="who">' + esc(p.name) + '</span></div>' +
      '<div class="ph-chat" data-chat="' + p.id + '">' + chatHTML + '</div>' + foot + (overlay || '') + '</div>';
  }
  const oaMsg = (inner, at) => '<div class="msg"><span class="av" aria-hidden="true">昇嶺</span>' + inner + '<span class="tm">' + at + '</span></div>';
  const bubble = t => '<div class="bub">' + t + '</div>';

  function fieldsDl(o) {
    const f = o.draft.fields;
    return '<dt>客戶</dt><dd>' + esc(f.customer.value) + '</dd><dt>機種</dt><dd>' + esc(f.model.value) + '</dd><dt>數量</dt><dd>' + esc(showVal('qty', f.qty.value)) + '</dd>';
  }

  /* ---------- 一則訊息 ---------- */
  function msgHTML(m, viewer) {
    if (m.from === 'me') {
      return '<div class="msg me"><div class="bub' + (m.failed ? ' failed' : '') + '">' + (m.fwdFrom ? '<span class="fw">轉傳自 ' + esc(m.fwdFrom) + '（示意）</span>' : '') + esc(m.text) +
        (m.failed ? '<span class="fail">未送出：LINE 斷線（模擬）</span>' : '') + '</div><span class="tm">' + m.at + '</span></div>';
    }
    if (m.from === 'sys' && m.kind === 'down') {
      return '<div class="sysmsg" role="alert"><b>訊息沒有送到官方帳號</b>（LINE 斷線，模擬）。<br>請打電話通知業務，業務會用「網頁備援入口」登錄原文。</div>';
    }
    const o = m.order ? ord(m.order) : null;
    switch (m.kind) {
      case 'ack':
        return oaMsg(bubble('已收單 <b>' + esc(m.order) + '</b>。<br>業務確認後由生管試算，可交日會再傳到這裡。<br>請先不要口頭答應交期。'), m.at);
      case 'bossdue': {
        const d = o.decision;
        return oaMsg('<div class="fx"><div class="fx-h">可交日　' + esc(o.id) + '</div><div class="fx-b"><dl>' + fieldsDl(o) +
          '<dt>客戶要求</dt><dd>' + U.mdw(o.draft.fields.due.value) + '</dd>' +
          '<dt>可交日</dt><dd><b>' + U.mdw(d.promise) + '</b>（試算完成 ' + esc(d.est.endLabel) + '）</dd>' +
          '<dt>決定人</dt><dd>' + esc(d.by) + '（' + (d.type === 'adopt' ? '採用 AI 建議' : '調整') + '）</dd>' +
          '<dt>決定時間</dt><dd>' + esc(d.at) + '</dd>' +
          '<dt>依據</dt><dd>試算 ' + esc(d.calc) + '</dd>' +
          '<dt>業務回覆</dt><dd>' + (m.replied ? '<b>已回覆客戶</b> ' + esc(o.reply.at) : '尚未回覆') + '</dd></dl></div></div>', m.at);
      }
      case 'new': {
        const open = o.status === 'received';
        return oaMsg('<div class="fx"><div class="fx-h g">新單待確認　' + esc(o.id) + '</div><div class="fx-b"><div class="q">' + esc(o.raw.text) + '</div>' +
          '<p>' + (m.low ? '有 <b>' + m.low + '</b> 欄要你確認或補' : '欄位齊全，確認後送出') + '</p></div>' +
          '<div class="fx-f"><button type="button" class="fx-btn" data-act="liff" data-page="confirm" data-id="' + o.id + '">' + (open ? '開啟確認頁' : '查看（' + Store.STATUS[o.status] + '）') + '</button></div></div>', m.at);
      }
      case 'remind':
        return oaMsg('<div class="fx"><div class="fx-h o">提醒　' + esc(m.order) + '</div><div class="fx-b"><p>這張已等 ' + minTxt(m.min) + '還沒確認（提醒門檻 ' + guessTag() + '）。</p></div>' +
          '<div class="fx-f"><button type="button" class="fx-btn" data-act="liff" data-page="confirm" data-id="' + m.order + '">開啟確認頁</button></div></div>', m.at);
      case 'due': {
        const d = o.decision;
        return oaMsg('<div class="fx"><div class="fx-h">可交日已決定　' + esc(o.id) + '</div><div class="fx-b"><dl>' + fieldsDl(o) +
          '<dt>客戶要求</dt><dd>' + U.mdw(o.draft.fields.due.value) + '</dd><dt>可交日</dt><dd><b>' + U.mdw(d.promise) + '</b></dd>' +
          '<dt>決定</dt><dd>' + esc(d.by) + '（' + (d.type === 'adopt' ? '採用 AI 建議' : '調整') + '）</dd></dl></div>' +
          '<div class="fx-f"><button type="button" class="fx-btn" data-act="liff" data-page="reply" data-id="' + o.id + '">開啟回覆草稿</button></div></div>', m.at);
      }
      case 'escalate':
        return oaMsg('<div class="fx"><div class="fx-h r">升級　' + esc(m.order) + '</div><div class="fx-b"><p>生管已 ' + minTxt(m.min) + '沒有決定。</p></div></div>', m.at);
      case 'unbound':
        return oaMsg('<div class="fx"><div class="fx-h o">帳號尚未綁定</div><div class="fx-b"><p>你的 LINE 還沒綁定，這則訊息系統不會處理。</p><p>請向管理者索取一次性綁定碼，再按下方按鈕綁定。</p></div>' +
          '<div class="fx-f"><button type="button" class="fx-btn" data-act="liff" data-page="bind">綁定帳號</button></div></div>', m.at);
      default:
        return oaMsg(bubble(esc(m.text || '')), m.at);
    }
  }
  function chatHTML(pid, emptyTxt) {
    const ms = A.st.S.chats[pid] || [];
    if (!ms.length) return '<div class="ph-empty">' + emptyTxt + '</div>';
    return ms.map(m => msgHTML(m)).join('');
  }

  /* =====================================================================
     老闆端：只收兩種訊息，沒有任何要操作的東西
     ===================================================================== */
  function viewBoss() {
    const st = A.st, S = st.S;
    const boss = S.people.find(p => p.role === 'boss');
    const foot = '<div class="ph-foot">老闆端只收訊息：「已收單」與「可交日」卡片</div>';
    const sim = '<aside class="panel sim"><div class="ptitle">' + simTag() + ' 老闆在 LINE 轉傳客戶訊息<small>手機外的操作都是 Demo 模擬</small></div><div class="pb stack">' +
      '<p class="sub">真實情境：老闆在 LINE 長按客戶的訊息 →「轉傳」→ 選官方帳號「昇嶺插單」。這裡用按鈕代替。三筆原文都是編的 ' + tag('demo', '示意') + '。</p>' +
      '<div class="samples">' + Store.SAMPLES.map(s =>
        '<div class="sample" style="cursor:default"><b>' + s.label + '</b><span class="tx">' + esc(s.text) + '</span><span class="h">' + esc(s.from) + '（示意）・' + esc(s.hint) + '</span>' +
        '<span style="grid-column:2"><button type="button" class="btn sm" data-act="fwd" data-k="' + s.key + '"' + (A.ui.busyFwd ? ' disabled' : '') + '>轉傳給官方帳號</button></span></div>').join('') + '</div>' +
      (S.sim.lineDown ? '<div class="banner err"><b>LINE 斷線中（模擬）。</b>轉傳會失敗，訊息不會建單。到「後台 → LINE 紀錄」可恢復連線。</div>' : '') +
      '<p class="sub">老闆端沒有可以編輯的欄位，也沒有要按的按鈕；交期一律來自生管試算，老闆不再口頭承諾。</p></div></aside>';
    return '<div class="end-line">' + phone(boss, chatHTML(boss.id, '還沒有訊息。<br>從右邊（手機版在下方）的模擬面板，轉傳一則客戶訊息給官方帳號。'), foot) + sim + '</div>';
  }

  /* =====================================================================
     業務端：LINE 通知 ＋ 從 LINE 開啟的小網頁（LIFF）
     ===================================================================== */
  function liffShell(title, body, act) {
    return '<section class="liff" role="dialog" aria-label="' + esc(title) + '"><div class="liff-h"><b>' + esc(title) + '</b>' + simTag('LIFF 小頁・模擬') +
      '<button type="button" class="btn sm x" data-act="liff-close">關閉</button></div><div class="liff-b">' + body + '</div>' + (act ? '<div class="liff-act">' + act + '</div>' : '') + '</section>';
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

  function liffConfirm(o) {
    const st = A.st, ui = A.ui;
    if (!o) return liffShell('確認新單', '<div class="empty">找不到這張單。</div>');
    const head = '<div class="row"><b>' + o.id + '</b>' + statusChip(o) + demoTag(o) + '</div>' + prog(o);
    if (!o.parse) {
      return liffShell('確認新單', head + '<div class="banner info"><span class="busy"></span>解析中…最久 ' + (st.S.ai.timeoutMs / 1000) + ' 秒，超過就改用規則解析。</div>' + rawBlock(o, []));
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
      const edit = draft && !editing && !why ? ' <button type="button" class="btn link" data-act="edit" data-id="' + o.id + '" data-f="' + k + '">改</button>' : '';
      return '<div class="lf-row ' + cls + '"><span class="lf-k">' + E.FIELD_LABEL[k] + '</span><span class="lf-v">' + val + edit + '</span><span>' + conf + '</span><span class="lf-n">' + ev + esc(f.note || '') + '</span></div>';
    }).join('');
    const fu = draft ? st.followups(o) : [];
    const fuHTML = fu.length ? '<section class="fuq" aria-label="追問"><h4>追問 ' + tag('ai', 'AI') + '<span class="sub">直接回答，答案會填進欄位</span></h4><ol>' + fu.map(q => {
      const f = o.draft.fields[q.k];
      let ctl = '';
      if (q.chips.length) ctl = '<div class="chips">' + q.chips.map(c => '<button type="button" class="chip-btn" data-act="pick" data-id="' + o.id + '" data-f="' + q.k + '" data-v="' + esc(c.v) + '">' + esc(c.l) + '</button>').join('') + '</div>';
      if (q.input) ctl = '<div class="in"><label class="sr" for="fu_' + q.k + '">' + esc(q.text) + '</label><input id="fu_' + q.k + '" type="' + q.input + '"' + (q.input === 'number' ? ' min="1" step="1" inputmode="numeric" placeholder="片數"' : '') + ' value="' + esc(A.ui.fu[o.id + q.k] || '') + '" data-act-input="fu" data-id="' + o.id + '" data-f="' + q.k + '"><button type="button" class="btn sm" data-act="fu-set" data-id="' + o.id + '" data-f="' + q.k + '">填入</button></div>';
      const keep = q.why === 'low' && f.value != null && !q.chips.some(c => String(c.v) === String(f.value)) ? '<div class="chips"><button type="button" class="chip-btn" data-act="keep" data-id="' + o.id + '" data-f="' + q.k + '">沿用「' + esc(showVal(q.k, f.value)) + '」</button></div>' : '';
      return '<li>' + esc(q.text) + (q.why === 'low' ? ' <span class="tag low">低信心</span>' : '') + ctl + keep + '</li>';
    }).join('') + '</ol></section>' : '';
    const body = head + eng + failed +
      '<section><h4 class="sub" style="margin-bottom:4px">原文（唯讀）' + tag('raw', '原文') + '　底線＝AI 取值位置</h4>' + rawBlock(o, spans) + rawMeta(o) + '</section>' +
      '<section><h4 class="sub" style="margin-bottom:4px">欄位草稿 ' + tag('ai', 'AI') + (draft ? '　信心低於 ' + Math.round(st.S.P.conf.threshold * 100) + '% 標紅' : '　已送出，唯讀') + '</h4><div class="lf">' + rows + '</div></section>' +
      fuHTML +
      (function () { var a = draft ? st.anomalies(o) : (o.anomalies || []); return a.length ? '<section class="fuq"><h4>異常提醒 ' + tag('ai', 'AI') + '<span class="sub">只提醒，請業務確認</span></h4><ul>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>' : ''; })() +
      (draft ? '<button type="button" class="btn link" data-act="return" data-id="' + o.id + '" style="align-self:flex-start">這不是插單，退回</button>' : '');
    let act;
    if (draft) {
      const pend = st.pendingFields(o);
      const why = pend.length ? '還有 ' + pend.length + ' 欄要處理：' + pend.map(p => E.FIELD_LABEL[p.k] + (p.why === 'missing' ? '（缺）' : '（低信心）')).join('、') : '送出後系統會試算，交給生管決定。';
      act = '<button type="button" class="btn primary" data-act="submit" data-id="' + o.id + '"' + (pend.length ? ' disabled' : '') + '>確認送出</button><p class="why' + (pend.length ? ' warn' : '') + '">' + esc(why) + '</p>';
    } else {
      const c = st.latestCalc(o);
      act = '<p class="why">' + (o.confirm ? esc(o.confirm.by) + ' 已於 ' + esc(o.confirm.at) + ' 確認' : '') + (c ? '；試算 ' + st.calcRef(c) + ' 完成' : '') + '。' +
        (o.status === 'queued' ? '等生管決定，可交日會傳到 LINE。' : o.status === 'returned' ? '已退回。' : '') + '</p>';
    }
    return liffShell('確認新單', body, act);
  }

  function liffReply(o) {
    const st = A.st;
    if (!o) return liffShell('交期回覆', '<div class="empty">找不到這張單。</div>');
    const head = '<div class="row"><b>' + o.id + '</b>' + statusChip(o) + demoTag(o) + '</div>' + prog(o);
    const d = st.replyInfo(o);
    if (!d.calc || d.noDecision) {
      const why = !d.calc ? '這張還沒有試算紀錄。沒有試算，系統不產生交期草稿。' : '生管還沒決定。決定後可交日會傳到 LINE。';
      return liffShell('交期回覆', head + '<div class="noreply">' + why + '</div>' + rawBlock(o, []),
        '<button type="button" class="btn primary" disabled>複製回覆</button><p class="why">' + (!d.calc ? '沒有試算紀錄，不能複製' : '生管還沒決定，不能複製') + '</p>');
    }
    const dec = o.decision;
    let body = head +
      '<div class="cmpdue"><div><div class="a">客戶要求</div><div class="b">' + U.mdw(d.req) + '</div></div><div class="ar" aria-hidden="true">→</div><div><div class="a">可交日（生管決定）</div><div class="b ' + (d.onTime ? '' : 'lowtxt') + '">' + U.mdw(d.dueDate) + '</div></div></div>' +
      '<p class="sub">' + (d.onTime ? '趕得上。' : '趕不上，晚 ' + U.workdaysBetween(d.req, d.dueDate) + ' 個工作天。') + '試算預計 ' + esc(d.est.endLabel) + ' 完成' + (o.decision.promiseChanged ? '，生管留了緩衝' : '') + '。</p>' +
      '<div class="human-block" style="padding:8px 12px;font-size:13px">' + tag('human', '生管決定') + ' ' + esc(dec.by) + '　' + (dec.type === 'adopt' ? '採用 AI 建議' : '調整') + '　' + esc(dec.at) + '<br>依據試算 ' + esc(dec.calc) + (dec.reason ? '<br>原因：' + esc(dec.reason) : '') + '</div>' +
      '<section class="ai-block"><div class="ptitle">回覆草稿 ' + tag('ai', 'AI') + '<small>日期來自試算，AI 只能改措辭</small></div><div class="pb"><p id="replyTxt" style="white-space:pre-wrap">' + esc(o.reply ? o.reply.text : d.draft) + '</p>' +
      '<div class="row" style="margin-top:8px"><button type="button" class="btn sm" disabled>AI 改寫措辭</button><span class="why">Demo 沒有連模型；正式版由後端呼叫 OpenAI，改寫後檢查日期、數量、機種沒被改動</span></div></div></section>' +
      rawBlock(o, []);
    let act;
    if (!o.reply) {
      act = '<button type="button" class="btn primary" data-act="copy" data-id="' + o.id + '">複製回覆</button><p class="why">複製後貼給客戶；系統會記錄交期、時間與試算編號，並通知老闆。</p>';
    } else {
      const a = o.actual;
      body += '<div class="banner info">已回覆：' + esc(o.reply.by) + ' ' + esc(o.reply.at) + '，交期 ' + U.mdw(o.reply.dueDate) + '，試算 ' + esc(o.reply.calc) + '。</div>' +
        '<section class="panel"><div class="ptitle">回填實際結果<small>出貨後填，用來算試算誤差</small>' + (a && a.sample ? tag('demo', '示意數字') : '') + '</div><div class="pb stack">' +
        '<div class="fgrid"><div><label class="lb" for="a_ship">實際出貨日</label><input id="a_ship" type="date" value="' + (a ? a.shipDate : d.dueDate) + '"' + (a ? ' disabled' : '') + '></div>' +
        '<div><label class="lb" for="a_c">額外換線（次）</label><input id="a_c" type="number" min="0" step="1" value="' + (a ? a.changeovers : '') + '"' + (a ? ' disabled' : '') + '></div>' +
        '<div><label class="lb" for="a_h">額外換線（小時）</label><input id="a_h" type="number" min="0" step="0.01" value="' + (a ? a.hours : '') + '"' + (a ? ' disabled' : '') + '></div></div>' +
        '<p class="sub">預估：額外換線 ' + d.est.extraC + ' 次 / ' + d.est.extraH.toFixed(2) + ' h' + (a ? '；誤差 ' + (d.est.extraH > 0 ? Math.round(Math.abs(a.hours - d.est.extraH) / d.est.extraH * 100) + '%（目標 ±20%）' : '—（預估為 0）') : '') + '</p></div></section>';
      act = a ? '<p class="why">已回填（' + esc(a.at) + '）。這張單完成。</p>'
        : '<button type="button" class="btn primary" data-act="actual-save" data-id="' + o.id + '">儲存回填</button><div class="row"><button type="button" class="btn sm" data-act="actual-sample" data-id="' + o.id + '">帶入示意數字</button><span class="why">三欄都要填</span></div>';
    }
    return liffShell('交期回覆', body, act);
  }

  function liffList(p) {
    const st = A.st;
    const mine = st.S.orders.filter(o => o.status !== 'returned');
    const grp = (t, list, page) => '<section><h4 class="sub" style="margin-bottom:4px">' + t + '（' + list.length + '）</h4>' + (list.length ? '<ul class="list lf">' + list.map(o => {
      const tm = st.timerState(o);
      return '<li><button type="button" class="item" data-act="liff" data-page="' + page + '" data-id="' + o.id + '"><span class="l1"><b>' + o.id + '</b>' + statusChip(o) + demoTag(o) + (tm ? '<span class="wait l' + tm.level + '">等 ' + minTxt(tm.w) + '</span>' : '') + '</span><span class="l2">' + esc(o.raw.text) + '</span></button></li>';
    }).join('') + '</ul>' : '<p class="sub">沒有。</p>') + '</section>';
    return liffShell('我的待辦', grp('待確認', mine.filter(o => o.status === 'received'), 'confirm') + grp('待回覆客戶', mine.filter(o => o.status === 'decided'), 'reply') +
      grp('待回填實際結果', mine.filter(o => o.status === 'replied'), 'reply') + '<p class="sub">清單依單排列，只看單的狀態。</p>');
  }

  function liffBind(p) {
    if (p.status === 'bound') return liffShell('綁定帳號', '<div class="banner info">你已綁定為「' + esc(p.name) + '」（' + Store.ROLE[p.role] + '）。</div>');
    return liffShell('綁定帳號',
      '<p>輸入管理者給你的一次性綁定碼。按下綁定時，系統會用 LINE Login 取得你的 LINE 使用者 ID，和後台的人員資料對上。</p>' +
      '<div><label class="lb" for="bindCode">綁定碼</label><input id="bindCode" type="text" autocomplete="off" value="' + esc(A.ui.bindCode) + '" data-act-input="bindCode" placeholder="例：K7Q2-9F"></div>' +
      '<p class="sub">Demo：' + esc(p.name) + ' 的綁定碼是 <span class="code">' + esc(p.code) + '</span>（在「後台 → 人員與綁定」看得到）。</p>',
      '<button type="button" class="btn primary" data-act="bind" id="btnBind"' + (A.ui.bindCode.trim() ? '' : ' disabled') + '>綁定</button><p class="why" id="bindWhy">' + (A.ui.bindCode.trim() ? '綁定後，新單通知會傳到這個 LINE' : '先輸入綁定碼') + '</p>');
  }

  function viewSales() {
    const st = A.st, S = st.S, ui = A.ui;
    const p = st.person(ui.salesId);
    let overlay = '';
    if (ui.liff) {
      const o = ui.liff.id ? ord(ui.liff.id) : null;
      if (p.status !== 'bound' && ui.liff.page !== 'bind') ui.liff = { page: 'bind' };
      overlay = ui.liff.page === 'confirm' ? liffConfirm(o) : ui.liff.page === 'reply' ? liffReply(o) : ui.liff.page === 'list' ? liffList(p) : liffBind(p);
    }
    const foot = p.status === 'bound'
      ? '<div class="ph-menu"><span class="lbl">圖文選單</span><button type="button" data-act="liff" data-page="list">我的待辦</button><button type="button" data-act="liff" data-page="bind">帳號</button></div>'
      : '<div class="ph-menu"><span class="lbl">圖文選單</span><button type="button" data-act="liff" data-page="bind">綁定帳號</button><button type="button" data-act="unbound-say">傳一則訊息</button></div>';
    const empty = p.status === 'bound' ? '還沒有通知。<br>老闆轉傳客戶訊息後，新單通知會出現在這裡。' : '這個 LINE 還沒綁定。<br>先傳一則訊息試試，或直接按下方「綁定帳號」。';
    const people = st.S.people.filter(x => x.role === 'sales');
    const waiting = S.orders.filter(o => o.status === 'received' && o.parse);
    const sim = '<aside class="stack">' +
      (S.sim.lineDown ? '<div class="banner err" role="alert"><b>LINE 斷線中（模擬）。</b>新單通知暫時收不到，請改用下方「網頁備援入口」。連線恢復後，失敗的通知會自動補送。</div>' : '') +
      '<section class="panel sim"><div class="ptitle">' + simTag() + ' 換一位業務<small>每位業務只看到自己的 LINE</small></div><div class="pb stack">' +
      '<div class="seg" role="radiogroup" aria-label="業務">' + people.map(x => '<label><input type="radio" name="salesId" value="' + x.id + '" data-act-change="salesId"' + (x.id === ui.salesId ? ' checked' : '') + '><span>' + esc(x.name) + '（' + (x.status === 'bound' ? '已綁定' : '未綁定') + '）</span></label>').join('') + '</div>' +
      '<p class="sub">「業務 B」還沒綁定：可以示範未綁定的訊息不處理，以及用綁定碼綁定。</p></div></section>' +
      '<section class="panel"><div class="ptitle">網頁備援入口 ' + tag('raw', '原文') + '<small>LINE 故障時用</small></div><div class="pb stack">' +
      '<p class="sub">電話或口頭收到、或 LINE 斷線時，把原話照打一行貼在這裡。貼上後一樣解析、一樣要確認，原文一樣不能改。</p>' +
      '<div class="seg" role="radiogroup" aria-label="來源">' + ['電話', '口頭', 'LINE'].map(k => '<label><input type="radio" name="webSrc" value="' + k + '" data-act-change="webSrc"' + (ui.web.source === k ? ' checked' : '') + '><span>' + (k === 'LINE' ? 'LINE（斷線補登）' : k) + '</span></label>').join('') + '</div>' +
      '<div><label class="lb" for="webText">原文</label><textarea id="webText" rows="3" data-act-input="webText" placeholder="例：丙的 C3 加 600片，週四要，零件不變">' + esc(ui.web.text) + '</textarea></div>' +
      '<div class="row"><button type="button" class="btn" id="btnWeb" data-act="web-intake"' + (ui.web.text.trim() && p.status === 'bound' ? '' : ' disabled') + '>登錄原文</button><span class="why" id="webWhy">' + (p.status !== 'bound' ? '未綁定的人員不能登錄' : ui.web.text.trim() ? '登錄後到「我的待辦」確認' : '先貼上原文') + '</span></div>' +
      (waiting.length ? '<p class="sub">待確認：' + waiting.map(o => '<button type="button" class="btn link" data-act="liff" data-page="confirm" data-id="' + o.id + '">' + o.id + '</button>').join(' ') + '</p>' : '') +
      '</div></section></aside>';
    return '<div class="end-line">' + phone(p, chatHTML(p.id, empty), foot, overlay) + sim + '</div>';
  }

  Object.assign(A, { viewBoss, viewSales });
})(window);
