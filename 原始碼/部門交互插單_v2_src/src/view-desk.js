/* 昇嶺電子 單一插單入口 Demo v2 — 電腦網頁端（生管、後台）
   看板與指標只顯示單與機台，不顯示個人績效。 */
(function (root) {
  'use strict';
  const E = root.Engine, U = E.util, Store = root.Store;
  const A = root.App;
  const { esc, fmtN, yen, tag, guessTag, simTag, demoTag, statusChip, srcTag, ord, minTxt, rawBlock, rawMeta, prog, timeline, candTable, aiPanel, showVal } = A;

  /* =====================================================================
     生管：待處理清單（依等待時間）→ 一行結論 → 採用或調整
     ===================================================================== */
  function curSchedule() {
    const st = A.st, S = st.S, now = st.stamp();
    const cal = E.makeCal(now.date, S.P);
    const nd = U.dow(now.date) === 0 ? U.nextWork(now.date) : now.date;
    const p0 = cal.pos(nd, U.dow(now.date) === 0 ? S.P.guess.dayStart : now.hour);
    return { cal, rows: E.runSeq(S.queue, p0, S.P, cal) };
  }

  function viewPlanner() {
    const st = A.st, S = st.S, ui = A.ui;
    const pend = S.orders.filter(o => o.status === 'queued').sort((a, b) => st.timerState(b).w - st.timerState(a).w);
    const done = S.orders.filter(o => o.calcs.length && o.status !== 'queued' && o.status !== 'returned');
    const head = '<div class="ph"><h1>生管看板</h1>' + tag('human', '生管') + '<span class="sub">電腦網頁</span></div>' +
      '<p class="lede">左邊是待決定的單，等最久的排最上面。每張單先看一行結論，要看依據再展開。看板只顯示單與機台，不顯示個人。</p>';
    let sel = ord(ui.sel);
    if (!sel || !sel.calcs.length || sel.status === 'returned') sel = pend[0] || done[0] || null;
    if (sel) ui.sel = sel.id;

    const item = o => {
      const sm = st.summary(o); const tm = st.timerState(o);
      const w = tm ? '<span class="wait l' + tm.level + '">' + (tm.level === 2 ? '已升級・' : tm.level === 1 ? '逾時・' : '') + '等 ' + minTxt(tm.w) + '</span>' : '';
      return '<button type="button" class="pl-item" data-act="sel" data-id="' + o.id + '"' + (sel && sel.id === o.id ? ' aria-current="true"' : '') + '><span class="l1"><b>' + o.id + '</b>' + statusChip(o) + demoTag(o) + w + '</span>' +
        (o.status === 'queued' && sm ? '<span class="sum">' + esc(sm.text) + '</span>' : o.decision ? '<span class="sub">' + esc(o.decision.by) + ' ' + (o.decision.type === 'adopt' ? '採用' : '調整') + '，排在 ' + esc(o.decision.afterId) + ' 之後</span>' : '') + '</button>';
    };
    const list = '<nav class="panel pl-list" aria-label="單據清單"><div class="grp">待決定（' + pend.length + '）・依等待時間</div>' +
      (pend.length ? pend.map(item).join('') : '<div class="pb sub">沒有待決定的單。</div>') +
      '<div class="grp">已決定（' + done.length + '）</div>' + (done.length ? done.map(item).join('') : '<div class="pb sub">還沒有。</div>') + '</nav>';

    let detail, tl;
    if (!sel) {
      detail = '<section class="panel"><div class="pb"><div class="empty">還沒有送來的單。<br>老闆在 LINE 轉傳、業務在 LINE 確認送出之後，單會出現在這裡。</div></div></section>';
    } else {
      detail = ticket(sel);
    }
    if (sel && sel.status === 'queued') {
      const calc = st.latestCalc(sel), r = calc.result; const adj = ui.adj[sel.id] || {};
      const k = adj.open && adj.k != null ? adj.k : r.cands[r.best].k; const c = r.cands.find(z => z.k === k);
      tl = '<div class="ptitle">排程預覽<small>' + sel.id + ' 排在 ' + c.afterId + ' 之後' + (adj.open && adj.k != null ? '（調整中）' : '（AI 建議）') + '</small></div>' + timeline(c.rows, r.cal, sel.id);
    } else {
      const cs = curSchedule();
      tl = '<div class="ptitle">現行排程 ' + tag('demo', '示意') + '<small>Q-01～Q-07 是示意佇列</small></div>' + timeline(cs.rows, cs.cal, sel ? sel.id : '');
    }
    const side = '<aside class="pl-side stack"><div class="panel">' + tl + '</div>' +
      '<p class="sub">每天可排小時由九月 (760＋133)÷26 推算，4 線合計。<b>插件站是瓶頸，試算目前未納入</b>（站數與班次資料未提供）。</p></aside>';
    return head + '<div class="pl">' + list + '<div class="pl-detail-wrap">' + detail + '</div>' + side + '</div>';
  }

  function ticket(o) {
    const st = A.st, ui = A.ui;
    const calc = st.latestCalc(o); const r = calc.result; const sm = st.summary(o);
    const f = o.draft.fields;
    const chg = k => o.confirm && o.confirm.changes.some(c => c.field === k) ? '<span class="chg">業務改過</span>' : '';
    const fl = E.FIELD_ORDER.map(k => '<tr><th scope="row">' + E.FIELD_LABEL[k] + '</th><td>' + esc(showVal(k, f[k].value)) + chg(k) + '</td></tr>').join('');
    const adj = ui.adj[o.id] || {}; const open = !!adj.open;
    const selK = adj.k != null ? adj.k : r.cands[r.best].k;
    const rsn = ui.reason[o.id] || '';
    const tm = st.timerState(o);
    let act;
    if (o.status === 'queued') {
      // 回給客戶的期限：預填試算完成日，可以訂晚一點留緩衝，不能更早；改了要寫原因
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
        '<div style="margin-top:4px">實際插入：排在 ' + esc(d.afterId) + ' 之後，' + esc(d.actualSlot) + '</div>' + (d.explain ? '<div>解釋：' + esc(d.explain) + '</div>' : '') + (d.reason ? '<div>原因：' + esc(d.reason) + (d.reasonCat ? '（分類：' + esc(d.reasonCat) + '）' : '') + '</div>' : '') +
        '<div>回給客戶的期限：<b>' + U.mdw(d.promise) + '</b>（試算完成 ' + esc(d.est.endLabel) + '）</div>' +
        '<div class="sub" style="margin-top:4px">期限已推到業務與老闆的 LINE（模擬）。' + (o.reply ? '業務已於 ' + esc(o.reply.at) + ' 回覆客戶。' : '業務尚未回覆客戶。') + '</div>' +
        (stale ? '<div class="why warn">之後排程或參數有變動，最新試算是 ' + esc(st.calcRef(calc)) + '，這個決定依據舊版。</div>' : '') + '</section>' : '';
    }
    return '<article class="panel pl-detail"><div class="t-head"><b>' + o.id + '</b>' + statusChip(o) + demoTag(o) + '<span class="sub">試算 ' + esc(st.calcRef(calc)) + (calc.rev > 1 ? '（' + esc(calc.reason) + '）' : '') + '</span>' +
      (tm && tm.level ? '<span class="wait l' + tm.level + '">' + (tm.level === 2 ? '已升級給生管主管' : '已逾時') + '・等 ' + minTxt(tm.w) + '</span>' : '') + '</div><div class="pb">' +
      prog(o) +
      (o.status === 'queued' ? '<div class="concl">' + tag('ai', 'AI 結論') + ' ' + esc(sm.text) + '<span class="sub">' + esc(sm.explain.ok ? '解釋：' + sm.explain.text : '解釋未通過數字檢查，只顯示試算表') + '</span><span class="sub">準時風險 ' + sm.risk.label + '（' + esc(sm.risk.why.join('；')) + '）；罰款等級 ' + sm.loss.label + '</span></div>' : '') +
      act +
      '<details class="more"' + (open ? ' open' : '') + '><summary>看原單與試算依據</summary><div class="t-grid">' +
      '<section class="t-orig"><h4>原單原樣 ' + tag('raw', '原文') + '<small class="sub">不可修改</small></h4>' + rawBlock(o, []) + rawMeta(o) +
      '<h4 style="margin-top:14px">確認後的欄位 ' + tag('human', '業務確認') + '</h4><table class="mini"><tbody>' + fl + '<tr><th scope="row">確認</th><td>' + esc(o.confirm.by) + '　' + esc(o.confirm.at) + '</td></tr></tbody></table></section>' +
      '<section class="t-ai"><h4>AI 分析 ' + tag('ai', 'AI') + '<small>只給建議，由生管決定</small></h4>' + aiPanel(o, calc) + '</section></div></details>' +
      '</div></article>';
  }

  /* =====================================================================
     後台（管理者）
     ===================================================================== */
  const TABS = [['people', '人員與綁定'], ['params', '參數'], ['master', '客戶・機種・單價'], ['audit', '稽核紀錄'], ['metrics', '指標'], ['line', 'LINE 紀錄']];
  const GUESS_FIELDS = [
    ['wA', '甲的虛擬權重（%／天）', '範圍 1–1.5，需老闆確認', 'number', { step: 0.05, min: 0, max: 10 }],
    ['maxDelayA', '甲最多延後（天）', '超過就提醒交老闆決定', 'number', { step: 1, min: 0, max: 10 }],
    ['slot1', '固定插單時段 1', '新單只在固定時段排入', 'time'],
    ['slot2', '固定插單時段 2', '留空表示只用一個時段', 'time'],
    ['merge', '同機種合併', '相鄰同機種免一次換線', 'check'],
    ['freezeH', '凍結（小時）', '這段時間內已排好的單不重排', 'number', { step: 1, min: 0, max: 240 }],
    ['partExtra', '換零件額外換線（次）', '', 'number', { step: 1, min: 0, max: 3 }],
    ['nCand', '比較幾個插入位置', '', 'number', { step: 1, min: 2, max: 8 }],
    ['dayStart', '工作日開始（點）', '一天長度由九月資料推算', 'number', { step: 0.5, min: 5, max: 11 }],
    ['lossLow', '罰款「低」上限（NT$）', '', 'number', { step: 500, min: 0 }],
    ['lossMid', '罰款「中」上限（NT$）', '', 'number', { step: 500, min: 0 }]
  ];
  const OPS_FIELDS = [
    ['salesRemindMin', '業務多久沒確認就提醒（分鐘）', '推播給業務'],
    ['plannerRemindMin', '生管多久沒決定就提醒（分鐘）', '在生管看板標示'],
    ['plannerEscalateMin', '生管多久沒決定就升級（分鐘）', '推播給生管主管，不推給老闆']
  ];

  function qrSVG(code) {
    // 示意用的方塊圖，不是真的 QR Code
    const h = A.st && root.Engine.util.fnv(code); let bits = '';
    for (let i = 0; i < 8; i++) bits += parseInt(root.Engine.util.fnv(code + i), 16).toString(2).padStart(32, '0').slice(0, 8);
    let rects = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (bits[y * 8 + x] === '1') rects += '<rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="1" height="1"/>';
    return '<svg class="qr" viewBox="0 0 10 10" role="img" aria-label="綁定 QR（示意，不是真的 QR Code）" data-h="' + h + '"><rect width="10" height="10" fill="#fff"/><g fill="#14212E">' + rects + '</g></svg>';
  }

  function adPeople() {
    const st = A.st, S = st.S;
    const stTxt = p => p.status === 'bound' ? tag('human', '已綁定') : p.status === 'unbound' ? '<span class="tag low">未綁定</span>' : '<span class="tag data">電腦網頁</span>';
    return '<section class="panel"><div class="ptitle">人員與角色<small>LINE 使用者 ID 都是模擬值</small></div><div class="scroll-x"><table class="tbl"><thead><tr><th>人員</th><th>角色</th><th>載體</th><th>狀態</th><th>LINE 使用者 ID</th><th>綁定時間</th><th>一次性綁定碼</th><th></th></tr></thead><tbody>' +
      S.people.map(p => '<tr><td><b>' + esc(p.name) + '</b></td><td>' + Store.ROLE[p.role] + '</td><td>' + ({ boss: 'LINE', sales: 'LINE＋小網頁', lead: 'LINE（只收升級）', planner: '電腦網頁', admin: '電腦網頁' }[p.role]) + '</td><td>' + stTxt(p) + '</td>' +
        '<td class="mono">' + esc(p.lineUserId || '—') + '</td><td>' + esc(p.boundAt || '—') + '</td>' +
        '<td>' + (p.status === 'unbound' ? '<div class="row" style="gap:8px">' + qrSVG(p.code) + '<span class="code">' + esc(p.code) + '</span></div>' : '—') + '</td>' +
        '<td>' + (p.status === 'bound' ? '<button type="button" class="btn sm" data-act="unbind" data-pid="' + p.id + '">解除綁定</button>' : p.status === 'unbound' ? '<button type="button" class="btn sm" data-act="regen" data-pid="' + p.id + '">重新產生</button>' : '') + '</td></tr>').join('') +
      '</tbody></table></div></section>' +
      '<div class="banner info" style="margin-top:14px">綁定流程：管理者在這裡建人員、產生一次性綁定碼或 QR → 本人加官方帳號好友 → 在 LIFF 小頁輸入綁定碼 → 系統用 LINE Login 取得使用者 ID 對上人員。' +
      '<br>官方帳號（Messaging API）與 LIFF（LINE Login channel）要放在<b>同一個 provider</b>，使用者 ID 才一致。只用一對一聊天，不用群組，才分得清誰說了什麼。未綁定者的訊息一律不處理，並回覆引導。</div>' +
      '<p class="sub" style="margin-top:10px">QR 圖是示意方塊，不是真的 QR Code。新增人員在正式版做，Demo 固定 6 位。</p>';
  }

  function adParams() {
    const st = A.st, S = st.S, G = S.P.guess;
    const val = k => k === 'slot1' ? (G.slots[0] || '') : k === 'slot2' ? (G.slots[1] || '') : G[k];
    const row = f => {
      const [k, nm, sub, type, attr] = f; const id = 'g_' + k; const v = val(k);
      const inp = type === 'check' ? '<input id="' + id + '" type="checkbox"' + (v ? ' checked' : '') + '>' : '<input id="' + id + '" type="' + type + '" value="' + esc(v) + '"' + (attr ? Object.entries(attr).map(([a, x]) => ' ' + a + '="' + x + '"').join('') : '') + '>';
      return '<div class="srow guess"><label class="nm" for="' + id + '">' + nm + ' ' + guessTag() + (sub ? '<small>' + sub + '</small>' : '') + '</label>' + inp + '</div>';
    };
    const waiting = S.orders.filter(o => o.status === 'queued').length;
    return '<section class="panel"><div class="ptitle">推算用的假設 ' + guessTag() + '<small>改了，待生管決定的單會重新試算</small></div><div class="pb">' + GUESS_FIELDS.map(row).join('') + '</div></section>' +
      '<section class="panel" style="margin-top:16px"><div class="ptitle">逾時提醒 ' + guessTag() + '<small>資料沒有時長，先用猜的；不影響試算</small></div><div class="pb">' +
      OPS_FIELDS.map(([k, nm, sub]) => '<div class="srow guess"><label class="nm" for="o_' + k + '">' + nm + ' ' + guessTag() + '<small>' + sub + '</small></label><input id="o_' + k + '" type="number" min="5" step="5" value="' + S.ops[k] + '"></div>').join('') + '</div></section>' +
      '<section class="panel" style="margin-top:16px"><div class="ptitle">AI 解析 ' + tag('ai', 'AI') + '<small>LLM 只負責文字→欄位、追問、回覆措辭；試算不用 LLM</small></div><div class="pb">' +
      '<div class="srow"><label class="nm" for="ai_mode">解析模式<small>Demo 沒有連模型。正式版由後端呼叫 OpenAI，失敗或超過 8 秒退回規則</small></label><select id="ai_mode">' +
      [['rule', '規則解析'], ['sim-fail', '模擬模型失敗 → 退回規則'], ['sim-timeout', '模擬模型逾時 8 秒 → 退回規則']].map(([v, l]) => '<option value="' + v + '"' + (S.ai.mode === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div></div></section>' +
      '<section class="panel" style="margin-top:16px"><div class="ptitle">還沒定的事 ' + tag('guess', '【未定】') + '<small>先留位置，不影響試算</small></div><div class="pb">' +
      '<div class="srow"><label class="nm" for="p_erp">是否接 ERP</label><select id="p_erp">' + ['未定', '接', '不接'].map(v => '<option' + (S.pending.erp === v ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></div>' +
      '<div class="srow"><label class="nm" for="p_stations">插件站數<small>插件站是瓶頸，資料未提供，未納入試算</small></label><input id="p_stations" type="text" value="' + esc(S.pending.stations) + '" placeholder="待提供"></div>' +
      '<div class="srow"><label class="nm" for="p_shifts">班次<small>未納入試算</small></label><input id="p_shifts" type="text" value="' + esc(S.pending.shifts) + '" placeholder="待提供"></div></div></section>' +
      '<section class="panel" style="margin-top:16px"><div class="ptitle">個案資料 ' + tag('data', '資料') + '<small>來自個案，只看不改</small></div><div class="pb">' +
      [['SMT 產能', S.P.data.rate + ' 片／小時'], ['換線', S.P.data.changeoverH.toFixed(2) + ' 小時／次（機台紀錄 133 h ÷ 148 次）'], ['現行排程抓的換線', S.P.data.sched05 + ' 小時／線／天（實際約 ' + S.P.data.actualPerLineDay + '）'], ['罰款', '乙 2%／天、丙 1%／天、甲無'], ['每天可排小時', S.P.data.poolHoursPerDay.toFixed(2) + ' 小時（九月 (760＋133)÷26，4 線合計）']]
        .map(r => '<div class="srow locked"><span class="nm">' + r[0] + '</span><span style="font-size:13px">' + r[1] + '</span></div>').join('') + '</div></section>' +
      '<div class="row" style="margin-top:16px;position:sticky;bottom:0;background:var(--bg);padding:10px 0"><button type="button" class="btn primary" data-act="apply-params">套用並記錄</button><button type="button" class="btn" data-act="reset-params">還原預設值</button>' +
      '<span class="why">逐項寫進稽核，產生新的參數版本 p' + (st.curPver() + 1) + '；' + (waiting ? '待決定的 ' + waiting + ' 張單會重新試算' : '目前沒有待決定的單') + '</span></div>' +
      '<section class="panel" style="margin-top:16px"><div class="ptitle">參數版本<small>每張試算都記錄當時用哪一版</small></div><div class="pb"><ol class="pv">' +
      S.pver.slice().reverse().map(v => '<li><b>p' + v.v + '</b>　' + esc(v.at) + '　' + esc(v.by) + '：' + esc(v.changes.join('；')) + '</li>').join('') + '</ol></div></section>';
  }
  function readParams() {
    const $ = A.$; const g = {};
    GUESS_FIELDS.forEach(([k, , , type]) => { const el = $('#g_' + k); g[k] = type === 'check' ? el.checked : type === 'number' ? Number(el.value) : el.value; });
    const slots = [g.slot1, g.slot2].filter(x => /^\d{1,2}:\d{2}$/.test(x || '')); delete g.slot1; delete g.slot2; g.slots = slots;
    const ops = {}; OPS_FIELDS.forEach(([k]) => { ops[k] = Number($('#o_' + k).value); });
    return { guess: g, ops, ai: { mode: $('#ai_mode').value }, pending: { erp: $('#p_erp').value, stations: $('#p_stations').value.trim(), shifts: $('#p_shifts').value.trim() } };
  }

  function adMaster() {
    const S = A.st.S;
    return '<section class="panel"><div class="ptitle">客戶<small>罰款來自個案合約；甲的權重是猜的</small></div><div class="scroll-x"><table class="tbl"><thead><tr><th>客戶</th><th>別名（解析用）</th><th>日罰款率</th></tr></thead><tbody>' +
      Object.entries(E.TABLES.customers).map(([k, al]) => '<tr><td><b>' + k + '</b></td><td>' + esc(al.join('、')) + '</td><td>' + (k === '甲' ? '無合約罰款；虛擬權重 ' + S.P.guess.wA + '%／天 ' + guessTag() : (S.P.data.penalty[k] * 100) + '%／天 ' + tag('data', '個案合約')) + '</td></tr>').join('') + '</tbody></table></div></section>' +
      '<section class="panel" style="margin-top:16px"><div class="ptitle">機種與單價 ' + tag('data', '個案平均') + '<small>個案只給平均每片約 1,200 元，各機種單價未提供；金額只用來比較晚一天的損失，請換成報價</small></div><div class="pb">' +
      E.TABLES.models.map(m => '<div class="srow"><label class="nm" for="pr_' + m + '">' + m + '（元／片）</label><input id="pr_' + m + '" type="number" min="0" step="1" value="' + S.P.prices[m] + '"></div>').join('') +
      '<div class="row" style="margin-top:10px"><button type="button" class="btn primary" data-act="apply-prices">儲存單價並記錄</button><span class="why">改單價會產生新參數版本，待決定的單重新試算</span></div></div></section>' +
      '<section class="panel" style="margin-top:16px"><div class="ptitle">排程佇列 ' + tag('demo', '示意') + '<small>Q-01～Q-07 要換成真資料；生管採用後新單會插進來</small></div><div class="scroll-x"><table class="tbl"><thead><tr><th>單號</th><th>客戶</th><th>機種</th><th class="n">數量</th><th>交期</th></tr></thead><tbody>' +
      S.queue.map(q => '<tr><td>' + esc(q.id) + (q.running ? ' <span class="sub">生產中</span>' : '') + (q.fromOrder ? ' ' + tag('human', '插單') : '') + '</td><td>' + q.customer + '</td><td>' + q.model + '</td><td class="n">' + fmtN(q.qty) + '</td><td>' + U.mdw(q.due) + '</td></tr>').join('') + '</tbody></table></div></section>';
  }

  function adAudit() {
    const st = A.st, f = A.ui.auditFilter;
    const all = st.auditList();
    const au = all.filter(a => f === 'all' || (f === 'decide' && a.role === 'planner') || (f === 'sales' && a.role === 'sales') || (f === 'param' && /參數/.test(a.action)) || (f === 'line' && /webhook|綁定|未綁定|LINE|推播|訊息/.test(a.action)) || (f === 'ai' && (a.role === 'ai' || a.role === 'system')));
    const who = a => a.role === 'ai' ? tag('ai', 'AI') : a.role === 'system' ? tag('data', '系統') : tag('human', esc(a.who));
    return '<section class="panel"><div class="ptitle">稽核紀錄<small>只能追加，不能修改或刪除；最新在上，共 ' + all.length + ' 筆</small><span class="sp"></span><label class="sr" for="afilter">篩選</label><select id="afilter" data-act-change="afilter" style="width:auto">' +
      [['all', '全部'], ['decide', '生管決定'], ['sales', '業務確認與回覆'], ['param', '參數變更'], ['line', 'LINE 與綁定'], ['ai', 'AI／系統']].map(([v, l]) => '<option value="' + v + '"' + (f === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
      '<div class="scroll-x" style="max-height:560px;overflow:auto"><table class="audit"><thead><tr><th>#</th><th>時間</th><th>誰</th><th>動作</th><th>單號</th><th>內容</th></tr></thead><tbody>' +
      (au.length ? au.map(a => '<tr><td class="t">' + a.seq + '</td><td class="t">' + esc(a.t) + '</td><td class="who">' + who(a) + '</td><td>' + esc(a.action) + '</td><td>' + esc(a.order) + '</td><td>' + esc(a.detail) + '</td></tr>').join('') : '<tr><td colspan="6" class="sub">沒有符合的紀錄。</td></tr>') +
      '</tbody></table></div></section>';
  }

  function adMetrics() {
    const st = A.st, S = st.S, m = st.metrics(), D = S.P.data;
    const kpi = (t, big, small, rows) => '<div class="kpi"><h3>' + t + '</h3><div class="big">' + big + '<small>' + small + '</small></div><dl>' + rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('') + '</dl></div>';
    const none = '—';
    const os = S.orders.filter(o => o.status !== 'returned');
    return '<p class="lede">數字來自這次 Demo 內操作過的單；基準與目標來自個案資料與方案文件。試點還沒開始，沒有實測月數字，只能說「進入試點驗證」。</p>' +
      '<div class="kpis">' +
      kpi('出貨量', m.filled ? fmtN(m.qty) : none, m.filled ? ' 片（已回填 ' + m.filled + ' 張）' : '回填後出現', [['基準', '114 千片／月（九月）'], ['試點目標', '≥ 125.4 千片／月'], ['說明', 'Demo 只有幾張單，不能和月值比']]) +
      kpi('準時率', m.filled ? m.onTime + ' / ' + m.filled : none, m.filled ? ' 張準時' : '回填後出現', [['基準', '78%（九月）'], ['試點目標', '≥ 90%；甲 ≥ 87%'], ['算法', '實際出貨日 ≤ 要求交期']]) +
      kpi('插單多出的換線', m.decided ? '+' + m.estC : none, m.decided ? ' 次（預估）' : '生管決定後出現', [['實際回填', m.filled ? '+' + m.actC + ' 次' : none], ['基準', '148 次／月（九月）'], ['換線時間', D.changeoverH.toFixed(2) + ' h／次']]) +
      kpi('試算誤差', m.err != null ? Math.round(m.err * 100) + '%' : none, m.err != null ? ' 平均（換線時數）' : '回填後出現', [['目標', '±20% 內'], ['現行排程', '抓 ' + D.sched05 + ' h／線／天，實際約 ' + D.actualPerLineDay], ['試算用', D.changeoverH.toFixed(2) + ' h × 預估次數']]) +
      '</div>' +
      '<div class="kpis k3" style="margin-top:16px">' +
      kpi('試算覆蓋率', m.replied ? Math.round(m.covered / m.replied * 100) + '%' : none, m.replied ? '（回覆 ' + m.replied + ' 張）' : '回覆後出現', [['規則', '沒有試算不放行回覆']]) +
      kpi('AI 輔助提醒', String(m.anomalies + m.estFlags), ' 件（異常 ' + m.anomalies + '；換線估計超過 20% ' + m.estFlags + '）', [['理由分類', Object.keys(m.reasonCats).length ? Object.keys(m.reasonCats).map(function (k) { return k + ' ' + m.reasonCats[k]; }).join('、') : '尚無']]) +
      kpi('收單到回覆', m.lat != null ? minTxt(Math.round(m.lat)) : none, m.lat != null ? ' 平均' : '回覆後出現', [['九月', '非正式通知平均晚約 7 小時才到現場']]) +
      kpi('LINE 推播', String(m.push), ' 則（計則數）', [['回覆', m.reply + ' 則（不計）'], ['失敗', m.failed + ' 則']]) +
      '</div>' +
      '<section class="panel" style="margin-top:20px"><div class="ptitle">每張單的進度與等待<small>只看單，不看人</small></div><div class="scroll-x"><table class="tbl"><thead><tr><th>單號</th><th>狀態</th><th style="min-width:280px">進度</th><th>目前等待</th><th>生管</th><th>試算</th></tr></thead><tbody>' +
      (os.length ? os.map(o => { const tm = st.timerState(o); const c = st.latestCalc(o);
        return '<tr><td><b>' + o.id + '</b>' + demoTag(o) + '</td><td>' + statusChip(o) + '</td><td>' + prog(o) + '</td><td>' + (tm ? '<span class="wait l' + tm.level + '">' + tm.who + ' ' + minTxt(tm.w) + '</span>' : '—') + '</td><td>' + (o.decision ? (o.decision.type === 'adopt' ? '採用' : '調整') : '—') + '</td><td>' + (c ? st.calcRef(c) + '（p' + c.pv + '）' : '—') + '</td></tr>'; }).join('') : '<tr><td colspan="6" class="sub">還沒有單。</td></tr>') +
      '</tbody></table></div></section>' +
      '<p class="footnote">指標與看板只顯示單與機台，不顯示個人績效。</p>';
  }

  function adLine() {
    const st = A.st, S = st.S;
    return '<section class="panel"><div class="ptitle">連線狀態 ' + simTag() + '<small>Demo 沒有連真的 LINE</small></div><div class="pb stack">' +
      '<div class="row"><span>官方帳號：</span>' + (S.sim.lineDown ? '<b class="lowtxt">斷線（模擬）</b>' : '<b>正常（模擬）</b>') +
      '<button type="button" class="btn sm" data-act="line-toggle">' + (S.sim.lineDown ? '恢復連線' : '模擬斷線') + '</button>' +
      '<button type="button" class="btn sm" data-act="bad-sig">模擬一筆簽章不符的請求</button></div>' +
      '<p class="sub">webhook 每筆都驗證 <span class="mono">x-line-signature</span>（以 channel secret 對 body 做 HMAC-SHA256），不符就拒絕；重送或重複事件用事件 ID 去重，只處理一次。回覆（Reply）不計則數，主動推播（Push）計則數；方案與價格以官方公告為準，正式版實作前再查。</p></div></section>' +
      '<section class="panel" style="margin-top:16px"><div class="ptitle">原始訊息紀錄（webhook 事件）<small>原文照收，不改</small></div><div class="scroll-x"><table class="tbl"><thead><tr><th>時間</th><th>事件 ID</th><th>LINE 使用者 ID</th><th>簽章</th><th>處理結果</th><th>原文</th><th></th></tr></thead><tbody>' +
      (S.events.length ? S.events.map(e => '<tr><td>' + esc(e.at) + '</td><td class="mono">' + esc(e.eventId) + '</td><td class="mono">' + esc(e.userId || '—') + '</td><td>' + esc(e.sig) + '</td><td>' + esc(e.result) + '</td><td class="mono">' + esc(e.text) + '</td><td>' +
        (e.sig === '通過（模擬）' ? '<button type="button" class="btn sm" data-act="redeliver" data-ev="' + esc(e.eventId) + '">模擬重送</button>' : '') + '</td></tr>').join('') : '<tr><td colspan="7" class="sub">還沒有事件。到「老闆」轉傳一則訊息。</td></tr>') +
      '</tbody></table></div></section>' +
      '<section class="panel" style="margin-top:16px"><div class="ptitle">通知紀錄<small>推播 ' + st.pushCount() + ' 則（計則數）・回覆 ' + st.replyCount() + ' 則（不計）</small></div><div class="scroll-x"><table class="tbl"><thead><tr><th>編號</th><th>時間</th><th>推給</th><th>類型</th><th>單號</th><th>對應試算</th><th>方式</th><th>狀態</th></tr></thead><tbody>' +
      (S.notes.length ? S.notes.slice().reverse().map(n => '<tr><td class="mono">' + n.id + '</td><td>' + esc(n.at) + '</td><td>' + esc(n.to) + '</td><td>' + esc(n.msgType) + '</td><td>' + esc(n.order) + '</td><td>' + esc(n.calc || '—') + '</td><td>' + (n.cost === 'push' ? '推播（計則數）' : '回覆（不計）') + '</td><td>' + ({ sent: '已送出', failed: '<b class="lowtxt">失敗</b>', resent: '已補送' }[n.status]) + '</td></tr>').join('') : '<tr><td colspan="8" class="sub">還沒有通知。</td></tr>') +
      '</tbody></table></div></section>';
  }

  function viewAdmin() {
    const tab = A.ui.adminTab;
    const fn = { people: adPeople, params: adParams, master: adMaster, audit: adAudit, metrics: adMetrics, line: adLine }[tab];
    return '<div class="ph"><h1>後台</h1>' + tag('human', '管理者') + '<span class="sub">電腦網頁</span></div>' +
      '<div class="ad"><nav class="ad-nav" aria-label="後台功能">' + TABS.map(([k, l]) => '<button type="button" data-act="atab" data-k="' + k + '"' + (tab === k ? ' aria-current="page"' : '') + '>' + l + '</button>').join('') + '</nav><div>' + fn() + '</div></div>';
  }

  Object.assign(A, { viewPlanner, viewAdmin, readParams });
})(window);
