/* 昇嶺電子 單一插單入口 Demo v2 — 資料層（記憶體版）
   對應正式版的資料表：人員、原單、AI 解析、業務確認、試算、生管決定、通知、回覆客戶、實際結果、參數版本、稽核紀錄。
   原則：
   - 原文建立後凍結，永不修改。
   - 稽核紀錄只能追加，每筆凍結，沒有修改或刪除的函式。
   - 試算只用 engine.js（固定程式），不用 LLM。
   - 沒有試算紀錄，不產生交期草稿、不能複製回覆。
   - 這一層不碰畫面，Node 可直接 require 來測試。 */
(function (root) {
  'use strict';
  const E = root.Engine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const U = E.util;

  /* ---------- 常數 ---------- */
  const SAMPLES = [
    { key: 'full', label: '完整', from: '客戶甲', text: '甲客戶追加 A1 800片，11/20 要出貨，零件有換。', hint: '五個欄位原文都有' },
    { key: 'noqty', label: '缺數量', from: '客戶乙', text: '乙那邊要插一張 B2，11/20 要，零件不變', hint: '沒寫數量，業務要回答追問' },
    { key: 'vague', label: '交期模糊', from: '客戶丙', text: '丙的 C3 加 600片，週四要，零件不變', hint: '「週四」是這週還是下週，要業務選' }
  ];
  const ROLE = { boss: '老闆', sales: '業務', planner: '生管', lead: '生管主管', admin: '管理者' };
  const STATUS = { received: '待業務確認', queued: '待生管決定', decided: '生管已決定', replied: '已回覆客戶', done: '已回填結果', returned: '已退回' };
  const STAGES = ['已收單', '已確認', '試算', '生管決定', '已回覆', '已回填'];
  const SRC = { LINE: 'LINE 轉傳', WEB: '網頁備援', '電話': '電話', '口頭': '口頭' };
  const REQ = ['customer', 'model', 'qty', 'due', 'partChange'];
  // 【我猜的】逾時時長：資料沒有，放在後台參數
  const OPS_DEFAULT = { salesRemindMin: 30, plannerRemindMin: 120, plannerEscalateMin: 240 };
  // 解析模式：Demo 沒有連模型。rule＝規則解析；sim-fail／sim-timeout＝示範模型失敗或逾時後退回規則
  const AI_DEFAULT = { mode: 'rule', timeoutMs: 8000 };

  /* 單價：個案只給「平均每片售價約 1,200 元」，各機種單價未提供。
     engine.js 必須與 v1 一字不差，所以在這裡覆寫，不改引擎。 */
  const CASE_PRICE = 1200;
  function caseDefaults() {
    const d = E.defaults();
    E.TABLES.models.forEach(m => { d.prices[m] = CASE_PRICE; });
    return d;
  }

  const pad4 = n => String(n).padStart(4, '0');
  const clone = o => JSON.parse(JSON.stringify(o));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fmtN = n => Number(n).toLocaleString('en-US');

  function seedPeople() {
    return [
      { id: 'P-01', name: '老闆', role: 'boss', status: 'bound', lineUserId: 'U-模擬-boss01', boundAt: '11/10 09:00', code: null },
      { id: 'P-02', name: '業務 A', role: 'sales', status: 'bound', lineUserId: 'U-模擬-sales02', boundAt: '11/10 09:20', code: null },
      { id: 'P-03', name: '業務 B', role: 'sales', status: 'unbound', lineUserId: null, boundAt: null, code: 'K7Q2-9F' },
      { id: 'P-04', name: '生管 A', role: 'planner', status: 'web', lineUserId: null, boundAt: null, code: null },
      { id: 'P-05', name: '生管主管', role: 'lead', status: 'bound', lineUserId: 'U-模擬-lead05', boundAt: '11/10 10:05', code: null },
      { id: 'P-06', name: '管理者', role: 'admin', status: 'web', lineUserId: null, boundAt: null, code: null }
    ];
  }

  /* ---------- 建立一份 Demo 資料 ---------- */
  function create(opts) {
    opts = opts || {};
    const onChange = opts.onChange || (() => {});
    const audit = [];            // 只能追加
    const seenEvents = new Set();
    const S = {
      P: caseDefaults(), queue: E.seedQueue(), people: seedPeople(),
      ops: Object.assign({}, OPS_DEFAULT), ai: Object.assign({}, AI_DEFAULT),
      pending: { erp: '未定', stations: '', shifts: '' },
      orders: [], events: [], notes: [], chats: {}, pver: [],
      sim: { lineDown: false },
      oseq: 0, tseq: 0, eseq: 0, nseq: 0, mseq: 0, tick: 0
    };
    S.pver.push(Object.freeze({ v: 1, at: stamp().label, by: '系統', changes: ['初始預設值'] }));

    /* ===== 時間 ===== */
    function stamp() {
      const base = U.hourOf(S.P.clock.time) * 60 + S.tick;
      const day = Math.floor(base / 1440), m = base % 1440;
      const date = U.addDays(S.P.clock.date, day), hour = m / 60;
      return { date, hour, abs: S.tick, label: U.md(date) + ' ' + U.hhmm(hour), hm: U.hhmm(hour) };
    }
    function advance(min) {
      S.tick += min;
      log('系統', 'system', '模擬時鐘', '', '時間前進 ' + min + ' 分鐘，現在 ' + stamp().label, false);
      checkTimers();
      onChange();
    }

    /* ===== 稽核（只能追加） ===== */
    function log(who, role, action, order, detail, tick) {
      if (tick !== false) S.tick++;
      const st = stamp();
      const e = Object.freeze({ seq: audit.length + 1, t: st.label, abs: S.tick, who, role, action, order: order || '', detail: detail || '' });
      audit.push(e);
      return st;
    }
    const auditList = () => audit.slice().reverse();

    /* ===== 人員 ===== */
    const person = id => S.people.find(p => p.id === id);
    const byLine = uid => S.people.find(p => p.lineUserId && p.lineUserId === uid);
    const boundSales = () => S.people.filter(p => p.role === 'sales' && p.status === 'bound');
    function newCode(p) { return U.fnv(p.id + ':' + S.tick + ':' + audit.length).slice(0, 4).toUpperCase() + '-' + U.fnv(p.name + S.tick).slice(0, 2).toUpperCase(); }

    function bind(pid, code) {
      const p = person(pid);
      if (!p || p.status !== 'unbound') return { ok: false, msg: '這個帳號不需要綁定' };
      if (String(code || '').trim().toUpperCase() !== p.code) {
        log('系統', 'system', '綁定失敗', '', p.name + '：綁定碼不符');
        onChange();
        return { ok: false, msg: '綁定碼不對。請向管理者確認，或請管理者重新產生。' };
      }
      p.status = 'bound'; p.lineUserId = 'U-模擬-' + U.fnv(p.id + 'line').slice(0, 6); p.code = null;
      const st = log(p.name, p.role, '綁定 LINE', '', '以綁定碼完成；LINE 使用者 ID ' + p.lineUserId + '（模擬，由 LINE Login 取得）');
      p.boundAt = st.label;
      chat(p.id, { from: 'oa', kind: 'text', text: '綁定完成。你是「' + p.name + '」（' + ROLE[p.role] + '），之後的新單通知會傳到這裡。' }, 'reply');
      onChange();
      return { ok: true };
    }
    function unbind(pid, by) {
      const p = person(pid);
      if (!p || p.status !== 'bound') return { ok: false };
      const old = p.lineUserId;
      p.status = 'unbound'; p.lineUserId = null; p.boundAt = null; p.code = newCode(p);
      log(by || '管理者', 'admin', '解除綁定', '', p.name + '（原 ' + old + '）；新綁定碼 ' + p.code);
      onChange();
      return { ok: true };
    }
    function regenCode(pid, by) {
      const p = person(pid);
      if (!p || p.status !== 'unbound') return;
      p.code = newCode(p);
      log(by || '管理者', 'admin', '產生綁定碼', '', p.name + '：' + p.code + '（一次性）');
      onChange();
    }

    /* ===== LINE 聊天與通知（模擬） ===== */
    function chat(pid, msg, cost) {
      const st = stamp();
      const m = Object.assign({ id: 'M' + (++S.mseq), at: st.hm, atLabel: st.label, cost: cost || 'none' }, msg);
      (S.chats[pid] = S.chats[pid] || []).push(m);
      return m;
    }
    // cost：reply＝回覆（不計則數）；push＝主動推播（計則數）
    function notify(pid, msgType, order, calcRef, msg, cost) {
      const p = person(pid);
      const st = stamp();
      const n = { id: 'N-' + pad4(++S.nseq), at: st.label, to: p ? p.name : pid, toId: pid, msgType, order: order || '', calc: calcRef || '', cost, status: 'sent' };
      if (S.sim.lineDown) { n.status = 'failed'; n.pending = { pid, msg }; S.notes.push(n); return n; }
      chat(pid, msg, cost);
      S.notes.push(n);
      return n;
    }
    function setLineDown(down, by) {
      S.sim.lineDown = !!down;
      log(by || '管理者', 'admin', down ? '模擬 LINE 斷線' : '模擬 LINE 恢復', '', down ? '官方帳號收不到訊息，推播會失敗' : '');
      if (!down) {
        const failed = S.notes.filter(n => n.status === 'failed');
        failed.forEach(n => { n.status = 'resent'; chat(n.pending.pid, n.pending.msg, n.cost); delete n.pending; });
        if (failed.length) log('系統', 'system', '補送推播', '', '連線恢復，補送 ' + failed.length + ' 則');
      }
      onChange();
    }
    const pushCount = () => S.notes.filter(n => n.cost === 'push' && n.status !== 'failed').length;
    const replyCount = () => S.notes.filter(n => n.cost === 'reply').length;

    /* ===== 解析 ===== */
    async function parseText(text) {
      const ctx = { P: S.P, today: stamp().date };
      const rule = E.ruleParse(text, ctx);
      const ms = S.ai.timeoutMs || 8000;
      if (S.ai.mode === 'sim-fail') {
        if (!opts.fast) await sleep(400);
        return { fields: rule, engine: 'rule', fallback: true, status: '規則解析（模擬模型呼叫失敗，已退回規則）' };
      }
      if (S.ai.mode === 'sim-timeout') {
        if (!opts.fast) await sleep(ms);
        return { fields: rule, engine: 'rule', fallback: true, status: '規則解析（模擬模型超過 ' + ms / 1000 + ' 秒，已退回規則）' };
      }
      return { fields: rule, engine: 'rule', fallback: false, status: '規則解析（Demo 沒有連模型；正式版由後端呼叫 OpenAI，失敗或超過 ' + ms / 1000 + ' 秒退回規則）' };
    }
    const anyField = f => E.FIELD_ORDER.some(k => k !== 'isAdd' && f[k].value != null);

    /* ===== 建單 ===== */
    function createOrder(text, meta) {
      const st = stamp();
      const id = 'A-' + pad4(++S.oseq);
      const sample = meta.sample && SAMPLES.find(s => s.key === meta.sample && s.text === text);
      const o = {
        id, status: 'received', sample: sample ? sample.label : null,
        raw: Object.freeze({ text, source: meta.source, by: meta.by, byId: meta.byId || '', forwardedAt: meta.forwardedAt || st.label, receivedAt: st.label, receivedAbs: S.tick, eventId: meta.eventId || '' }),
        parse: null, draft: null, confirm: null, calcs: [], decision: null, reply: null, actual: null,
        t: { received: S.tick }, reminded: {}
      };
      S.orders.unshift(o);
      log(meta.by, meta.role, '建單', id, '來源 ' + SRC[meta.source] + (meta.eventId ? '，事件 ' + meta.eventId : '') + '，原文 ' + text.length + ' 字（凍結，不可修改）', false);
      return o;
    }
    async function runParse(o) {
      const res = await parseText(o.raw.text);
      o.parse = { engine: res.engine, fallback: res.fallback, status: res.status, fields: clone(res.fields), failed: !anyField(res.fields) };
      o.draft = { fields: clone(res.fields) };
      for (const k of E.FIELD_ORDER) o.draft.fields[k].confirmed = false;
      log('AI', 'ai', '解析欄位', o.id, res.status + (o.parse.failed ? '；沒有拆出任何欄位，請業務在追問區補' : ''));
      o.t.parsed = S.tick;
      const low = pendingFields(o).length;
      boundSales().forEach(p => notify(p.id, '新單待確認', o.id, '', { from: 'oa', kind: 'new', order: o.id, low }, 'push'));
      onChange();
      return o;
    }

    /* webhook：簽章驗證（模擬）→ 事件 ID 去重 → 身分 → 建單 */
    async function webhook(ev) {
      const st = stamp();
      const rec = { eventId: ev.eventId, at: st.label, userId: ev.userId, text: ev.text, sig: ev.badSig ? '不符' : '通過（模擬）', result: '' };
      S.events.unshift(rec);
      if (ev.badSig) { rec.result = '簽章不符，拒絕（HTTP 401）'; log('系統', 'system', 'webhook 拒絕', '', '事件 ' + ev.eventId + ' 簽章不符'); onChange(); return { ok: false }; }
      if (seenEvents.has(ev.eventId)) { rec.result = '重複事件，略過'; log('系統', 'system', 'webhook 重送', '', '事件 ' + ev.eventId + ' 已處理過，略過'); onChange(); return { ok: true, dup: true }; }
      seenEvents.add(ev.eventId);
      const p = byLine(ev.userId);
      if (!p || p.status !== 'bound') {
        rec.result = '未綁定，不處理，已回覆引導';
        const who = S.people.find(x => x.id === ev.pid);
        if (who) chat(who.id, { from: 'oa', kind: 'unbound' }, 'reply');
        S.notes.push({ id: 'N-' + pad4(++S.nseq), at: st.label, to: '未綁定使用者', toId: ev.pid || '', msgType: '綁定引導', order: '', calc: '', cost: 'reply', status: 'sent' });
        log('系統', 'system', '未綁定訊息', '', '使用者 ' + (ev.userId || '（無 ID）') + ' 未綁定，訊息不處理');
        onChange();
        return { ok: true, unbound: true };
      }
      if (p.role !== 'boss' && p.role !== 'sales') {
        rec.result = '此角色不收單，已回覆說明';
        chat(p.id, { from: 'oa', kind: 'text', text: '這個帳號不收單。新單請由老闆或業務轉傳。' }, 'reply');
        onChange();
        return { ok: true };
      }
      const o = createOrder(ev.text, { source: 'LINE', by: p.name, byId: p.id, role: p.role, eventId: ev.eventId, sample: ev.sample, forwardedAt: ev.forwardedAt });
      rec.result = '建單 ' + o.id;
      notify(p.id, '已收單', o.id, '', { from: 'oa', kind: 'ack', order: o.id }, 'reply');
      onChange();
      await runParse(o);
      return { ok: true, order: o };
    }

    /* 老闆（或業務）在 LINE 轉傳一則訊息給官方帳號 */
    async function forward(pid, text, sample) {
      const p = person(pid);
      const st = stamp();
      const m = chat(pid, { from: 'me', kind: 'fwd', text, fwdFrom: sample ? (SAMPLES.find(s => s.key === sample) || {}).from : '' }, 'none');
      if (S.sim.lineDown) {
        m.failed = true;
        chat(pid, { from: 'sys', kind: 'down' }, 'none');
        log('系統', 'system', '訊息未送達', '', (p ? p.name : pid) + ' 轉傳失敗：LINE 斷線（模擬）');
        onChange();
        return { ok: false, down: true };
      }
      const eventId = 'ev-' + U.fnv(pid + text + (++S.eseq)).slice(0, 8);
      m.eventId = eventId;
      return webhook({ eventId, userId: p && p.lineUserId, pid, text, sample, forwardedAt: st.label });
    }
    /* 模擬 LINE 平台重送同一個事件 */
    function redeliver(eventId) {
      const rec = S.events.find(e => e.eventId === eventId);
      if (!rec) return;
      return webhook({ eventId, userId: rec.userId, text: rec.text });
    }

    /* 網頁備援入口：LINE 故障時，業務把原文貼到網頁 */
    async function webIntake(pid, text, source) {
      const p = person(pid);
      const o = createOrder(text, { source: source || 'WEB', by: p.name, byId: p.id, role: p.role });
      onChange();
      await runParse(o);
      return o;
    }

    /* ===== 業務確認 ===== */
    function lowOf(o, k) {
      const f = o.draft.fields[k];
      if (f.value == null || f.value === '') return 'missing';
      if (f.confirmed) return null;
      if (k === 'model' && !E.TABLES.models.includes(f.value)) return 'low';
      return f.conf < S.P.conf.threshold ? 'low' : null;
    }
    function pendingFields(o) {
      if (!o.draft) return [];
      return [...REQ, 'isAdd'].map(k => ({ k, why: lowOf(o, k) })).filter(x => x.why);
    }
    function followups(o) {
      return pendingFields(o).map(({ k, why }) => {
        const f = o.draft.fields[k]; let text = '', chips = [], input = null;
        if (k === 'customer') { text = why === 'missing' ? '客戶是哪一家？' : '客戶是「' + f.value + '」嗎？'; chips = Object.keys(E.TABLES.customers).map(c => ({ v: c, l: c })); }
        if (k === 'model') { text = why === 'missing' ? '機種代碼是什麼？' : '機種「' + f.value + '」不在對照表，是哪一個？'; chips = E.TABLES.models.map(c => ({ v: c, l: c })); }
        if (k === 'qty') { text = '這張要幾片？'; input = 'number'; }
        if (k === 'due') {
          if (why === 'missing') { text = '客戶要幾號出貨？'; input = 'date'; }
          else { text = '「' + (f.span ? o.raw.text.slice(f.span[0], f.span[1]) : '交期') + '」是哪一天？'; chips = (f.alts || [{ value: f.value, label: U.mdw(f.value) }]).map(a => ({ v: a.value, l: a.label })); }
        }
        if (k === 'partChange') { text = '這張要換零件嗎？原文沒有講。'; chips = [{ v: 'true', l: '要換' }, { v: 'false', l: '不換' }]; }
        if (k === 'isAdd') { text = '這是追加單還是一般單？'; chips = [{ v: 'true', l: '追加單' }, { v: 'false', l: '一般單' }]; }
        return { k, why, text, chips, input };
      });
    }
    function coerce(k, v) {
      if (v === '' || v == null) return null;
      if (k === 'qty') { const n = parseInt(String(v).replace(/,/g, ''), 10); return n > 0 ? n : null; }
      if (k === 'partChange' || k === 'isAdd') return v === true || v === 'true';
      return v;
    }
    function setField(o, k, raw) {
      if (o.status !== 'received' || !o.draft) return;
      const f = o.draft.fields[k]; const v = coerce(k, raw);
      f.value = v; f.confirmed = v != null;
      onChange();
    }
    function keepField(o, k) { if (o.draft) { o.draft.fields[k].confirmed = true; onChange(); } }
    function changesOf(o) {
      const out = [];
      for (const k of E.FIELD_ORDER) {
        const a = o.parse.fields[k].value, b = o.draft.fields[k].value;
        if (String(a) !== String(b)) out.push({ field: k, from: a, to: b });
      }
      return out;
    }
    function submit(o, pid) {
      if (o.status !== 'received' || !o.draft) return { ok: false, msg: '這張不是待確認狀態' };
      const pend = pendingFields(o);
      if (pend.length) return { ok: false, msg: '還有 ' + pend.length + ' 欄要處理' };
      const p = person(pid);
      const chg = changesOf(o);
      const st = log(p.name, 'sales', '確認並送出', o.id, chg.length ? '修改欄位：' + chg.map(c => E.FIELD_LABEL[c.field] + ' ' + showVal(c.field, c.from) + ' → ' + showVal(c.field, c.to)).join('；') : '沒有修改欄位');
      o.confirm = { by: p.name, byId: p.id, at: st.label, changes: chg };
      o.anomalies = anomalies(o);
      if (o.anomalies.length) log('系統', 'system', '異常提醒', o.id, o.anomalies.join('；'));
      o.status = 'queued'; o.t.confirmed = S.tick;
      const c = runCalc(o, '首次試算');
      const b = c.result.cands[c.result.best];
      log('系統', 'system', '試算完成', o.id, calcRef(c) + '；建議排在 ' + b.afterId + ' 之後，額外換線 ' + b.extraC + ' 次');
      o.t.calc = S.tick;
      onChange();
      return { ok: true, calc: c };
    }
    function returnOrder(o, pid) {
      if (o.status !== 'received') return;
      o.status = 'returned';
      log(person(pid).name, 'sales', '退回', o.id, '原文保留，欄位草稿作廢');
      onChange();
    }

    /* ===== 試算 ===== */
    const calcRef = c => c ? c.id + ' r' + c.rev : '';
    const latestCalc = o => o.calcs[o.calcs.length - 1] || null;
    const curPver = () => S.pver[S.pver.length - 1].v;
    function xOf(o) {
      const f = o.draft.fields;
      return { id: o.id, customer: f.customer.value, model: f.model.value, qty: f.qty.value, due: f.due.value, partChange: !!f.partChange.value };
    }
    function runCalc(o, reason) {
      const st = stamp();
      const X = xOf(o);
      const result = E.calc(S.queue, X, S.P, { date: st.date, hour: st.hour });
      if (!o.calcId) o.calcId = 'T-' + pad4(++S.tseq);
      const c = { id: o.calcId, rev: o.calcs.length + 1, reason, at: st.label, result, X, P: clone(S.P), pv: curPver(), queueIds: S.queue.map(q => q.id) };
      o.calcs.push(c);
      return c;
    }
    function recalcPending(reason) {
      S.orders.filter(o => o.status === 'queued').forEach(o => {
        const c = runCalc(o, reason);
        const b = c.result.cands[c.result.best];
        log('系統', 'system', '重新試算', o.id, calcRef(c) + '（' + reason + '）；建議排在 ' + b.afterId + ' 之後；輸入指紋 ' + c.result.fingerprint);
      });
    }
    /* 一行結論 */
    function summary(o) {
      const c = latestCalc(o); if (!c) return null;
      const r = c.result, b = r.cands[r.best];
      return { cand: b, risk: E.risk(b, r.cal, c.P), loss: E.lossLevel(b.deltaLoss, c.P), explain: explainCalc(b),
        text: '建議排在 ' + b.afterId + ' 後，預計 ' + b.startAt.label + ' 開工；罰款 +NT$' + fmtN(Math.round(b.deltaLoss)) + '；連帶 ' + b.newLate.length + ' 張晚交' };
    }

    /* ===== AI 輔助：只提醒、解釋、估計與分類，不改試算與欄位 ===== */
    // 異常檢查：只提醒，不擋送出。1–20,000 片的範圍是【我猜的】，待業務確認。
    function anomalies(o) {
      const f = o.draft ? o.draft.fields : null;
      if (!f) return o.anomalies || [];
      const out = [];
      const today = stamp().date;
      if (f.qty.value != null && (f.qty.value <= 0 || f.qty.value > 20000)) out.push('數量 ' + f.qty.value + ' 片超出 1 到 20,000 的範圍，請確認');
      if (f.due.value != null && String(f.due.value) < today) out.push('交期 ' + f.due.value + ' 早於今天 ' + today + '，請確認');
      if (f.model.value != null && !E.TABLES.models.includes(f.model.value)) out.push('機種 ' + f.model.value + ' 不在機種表中');
      if (f.customer.value != null && !E.TABLES.customers[f.customer.value]) out.push('客戶 ' + f.customer.value + ' 不在客戶名單中');
      return out;
    }
    // 換線實績估計：由已回填實績的平均推估；沒有實績時沿用參數，並標示來源
    function estimateChangeover() {
      const filled = S.orders.filter(o => o.actual && o.actual.changeovers > 0);
      if (!filled.length) return { hours: S.P.data.changeoverH, label: '估計（尚無實績，沿用參數 ' + S.P.data.changeoverH + ' h）', n: 0 };
      const hours = filled.reduce((a, o) => a + o.actual.hours, 0);
      const cnt = filled.reduce((a, o) => a + o.actual.changeovers, 0);
      return { hours: Math.round(hours / cnt * 100) / 100, label: '估計（已回填 ' + filled.length + ' 張實績的平均）', n: filled.length };
    }

    /* ===== 生管決定 ===== */
    function decide(o, type, pid, opt) {
      if (o.status !== 'queued') return { ok: false, msg: '這張不是待決定狀態' };
      const calc = latestCalc(o);
      if (!calc) return { ok: false, msg: '沒有試算紀錄' };
      const r = calc.result;
      let c = r.cands[r.best];
      const reason = String((opt && opt.reason) || '').trim();
      if (type === 'adjust') c = r.cands.find(x => x.k === (opt && opt.k)) || c;
      // 回給客戶的期限：由生管訂，預填試算完成日；不能早於完成日；和完成日不同就要寫原因
      const minDate = c.endAt.date;
      const promise = (opt && opt.promise) || minDate;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(promise)) return { ok: false, msg: '客戶期限要是日期' };
      if (promise < minDate) return { ok: false, msg: '客戶期限不能早於試算完成日 ' + U.mdw(minDate) };
      const needReason = type === 'adjust' || promise !== minDate;
      if (needReason && reason.length < 4) return { ok: false, msg: (type === 'adjust' ? '調整' : '改客戶期限') + '一定要寫原因（至少 4 個字）' };
      const p = person(pid);
      const rk = E.risk(c, r.cal, calc.P);
      const st = log(p.name, 'planner', type === 'adopt' ? '採用 AI 建議' : '調整', o.id,
        '依據 ' + calcRef(calc) + '；排在 ' + c.afterId + ' 之後，' + c.startAt.label + ' 開工；試算完成 ' + c.endAt.label +
        '；回給客戶期限 ' + U.mdw(promise) + (promise !== minDate ? '（比完成日晚 ' + U.workdaysBetween(minDate, promise) + ' 個工作天）' : '') + (needReason ? '；原因：' + reason : ''));
      const ex = explainCalc(c);
      o.decision = {
        type, k: c.k, afterId: c.afterId, reason, reasonCat: reasonCategory(reason), explain: ex.ok ? ex.text : null, by: p.name, at: st.label, calc: calcRef(calc), promise, promiseChanged: promise !== minDate,
        actualSlot: c.startAt.label + ' 開工（' + r.entry.label + ' 排入）',
        est: { extraC: c.extraC, extraH: c.extraH, endDate: c.endAt.date, endLabel: c.endAt.label, lateX: c.lateX, risk: rk.label, startLabel: c.startAt.label }
      };
      o.status = 'decided'; o.t.decided = S.tick;
      log('AI', 'ai', '模板解釋', o.id, ex.ok ? ex.text + '（模板 v1，數字已對照試算結果）' : '數字檢查未通過，未顯示解釋：' + ex.bad.join('、'));
      S.queue = c.seqJobs.map(j => { const n = Object.assign({}, j); delete n.notBefore; delete n.inserted; if (j.id === o.id) n.fromOrder = true; return n; });
      recalcPending('佇列已變動：' + o.id + ' 已插入');
      const card = { from: 'oa', kind: 'due', order: o.id };
      const to = o.confirm && person(o.confirm.byId) && person(o.confirm.byId).status === 'bound' ? [o.confirm.byId] : boundSales().map(x => x.id);
      to.forEach(id => notify(id, '可交日', o.id, o.decision.calc, card, 'push'));
      const boss = S.people.find(x => x.role === 'boss' && x.status === 'bound');
      if (boss) notify(boss.id, '可交日卡片', o.id, o.decision.calc, { from: 'oa', kind: 'bossdue', order: o.id, replied: false }, 'push');
      onChange();
      return { ok: true };
    }

    /* ===== 回覆客戶 ===== */
    function replyInfo(o) {
      const calc = latestCalc(o);
      if (!calc) return { calc: null };
      if (!o.decision) return { calc, noDecision: true };
      const est = o.decision.est; const req = o.draft.fields.due.value;
      const due = o.decision.promise;
      return { calc, est, dueDate: due, req, draft: E.replyDraft(o.draft, due, req), onTime: due <= req };
    }
    function copyReply(o, pid, text) {
      const d = replyInfo(o);
      if (!d.calc) return { ok: false, msg: '沒有試算紀錄，不能回覆' };
      if (d.noDecision) return { ok: false, msg: '生管還沒決定，不能回覆' };
      const p = person(pid);
      const st = log(p.name, 'sales', '複製回覆', o.id, '交期 ' + U.mdw(d.dueDate) + '，對應試算 ' + o.decision.calc);
      o.reply = { dueDate: d.dueDate, at: st.label, by: p.name, calc: o.decision.calc, text: text || d.draft };
      o.status = 'replied'; o.t.replied = S.tick;
      const boss = S.people.find(x => x.role === 'boss' && x.status === 'bound');
      if (boss) notify(boss.id, '可交日卡片', o.id, o.decision.calc, { from: 'oa', kind: 'bossdue', order: o.id, replied: true }, 'push');
      onChange();
      return { ok: true };
    }
    function sampleActual(o) {
      const idx = S.orders.filter(x => x.status !== 'returned').indexOf(o);
      const f = [1.17, 0.88, 1.31][((idx % 3) + 3) % 3];
      const est = o.decision.est;
      const hours = Math.round(est.extraH * f * 100) / 100;
      return { shipDate: o.reply ? o.reply.dueDate : est.endDate, changeovers: Math.round(hours / S.P.data.changeoverH), hours, sample: true };
    }
    function saveActual(o, pid, a) {
      if (!o.reply) return { ok: false, msg: '還沒回覆客戶' };
      const p = person(pid);
      const st = log(p.name, 'sales', '回填實際結果', o.id, '實際出貨 ' + U.mdw(a.shipDate) + '；額外換線 ' + a.changeovers + ' 次 / ' + a.hours + ' h' + (a.sample ? '（示意數字）' : ''));
      const est = estimateChangeover();
      const perAct = a.changeovers > 0 ? a.hours / a.changeovers : null;
      const estErr = perAct != null ? Math.abs(perAct - est.hours) / est.hours : null;
      const estFlag = estErr != null && estErr > 0.2;
      o.actual = Object.assign({ at: st.label, estBasis: est.label, estErr: estErr == null ? null : Math.round(estErr * 100) / 100, estFlag }, a);
      if (estFlag) log('系統', 'system', '換線估計誤差提醒', o.id, '每次換線實績 ' + perAct.toFixed(2) + ' h，估計 ' + est.hours + ' h，誤差 ' + Math.round(estErr * 100) + '%，超過 20%，要檢討');
      o.status = 'done'; o.t.done = S.tick;
      onChange();
      return { ok: true };
    }

    /* ===== 逾時提醒 ===== */
    function waitMin(o) {
      if (o.status === 'received' && o.parse) return S.tick - o.t.parsed;
      if (o.status === 'queued') return S.tick - o.t.confirmed;
      return null;
    }
    function timerState(o) {
      const w = waitMin(o); if (w == null) return null;
      if (o.status === 'received') return { w, level: w >= S.ops.salesRemindMin ? 1 : 0, who: '業務' };
      return { w, level: w >= S.ops.plannerEscalateMin ? 2 : w >= S.ops.plannerRemindMin ? 1 : 0, who: '生管' };
    }
    function checkTimers() {
      S.orders.forEach(o => {
        const t = timerState(o); if (!t) return;
        if (o.status === 'received' && t.level >= 1 && !o.reminded.sales) {
          o.reminded.sales = true;
          boundSales().forEach(p => notify(p.id, '逾時提醒', o.id, '', { from: 'oa', kind: 'remind', order: o.id, min: t.w }, 'push'));
          log('系統', 'system', '逾時提醒', o.id, '業務 ' + t.w + ' 分鐘未確認（門檻 ' + S.ops.salesRemindMin + ' 分鐘，【我猜的】）');
        }
        if (o.status === 'queued' && t.level >= 1 && !o.reminded.planner) {
          o.reminded.planner = true;
          log('系統', 'system', '逾時提醒', o.id, '生管 ' + t.w + ' 分鐘未決定（門檻 ' + S.ops.plannerRemindMin + ' 分鐘，【我猜的】）；生管看板標示');
        }
        if (o.status === 'queued' && t.level >= 2 && !o.reminded.lead) {
          o.reminded.lead = true;
          const lead = S.people.find(x => x.role === 'lead' && x.status === 'bound');
          if (lead) notify(lead.id, '升級', o.id, calcRef(latestCalc(o)), { from: 'oa', kind: 'escalate', order: o.id, min: t.w }, 'push');
          log('系統', 'system', '升級', o.id, '生管 ' + t.w + ' 分鐘未決定，升級給生管主管（門檻 ' + S.ops.plannerEscalateMin + ' 分鐘，【我猜的】）');
        }
      });
    }

    /* ===== 參數（後台） ===== */
    function applyParams(n, by) {
      const G = S.P.guess; const changes = []; let affects = false;
      const cmp = (label, a, b, unit, calcKey) => { if (String(a) !== String(b)) { changes.push(label + ' ' + a + ' → ' + b + (unit || '')); if (calcKey) affects = true; } };
      if (n.guess) {
        const g = n.guess;
        if (!g.slots || !g.slots.length) return { ok: false, msg: '固定插單時段至少要有一個' };
        if (!(g.wA >= 0)) return { ok: false, msg: '甲的虛擬權重要是數字' };
        if (!(g.lossLow <= g.lossMid)) return { ok: false, msg: '罰款「低」上限不能大於「中」上限' };
        cmp('甲虛擬權重', G.wA, g.wA, '%／天', 1); cmp('甲最多延後', G.maxDelayA, g.maxDelayA, ' 天', 1);
        cmp('固定插單時段', G.slots.join('、'), g.slots.join('、'), '', 1); cmp('同機種合併', G.merge ? '開' : '關', g.merge ? '開' : '關', '', 1);
        cmp('凍結', G.freezeH, g.freezeH, ' 小時', 1); cmp('換零件額外換線', G.partExtra, g.partExtra, ' 次', 1);
        cmp('比較位置數', G.nCand, g.nCand, '', 1); cmp('工作日開始', G.dayStart, g.dayStart, ' 點', 1);
        cmp('罰款低上限', G.lossLow, g.lossLow, '', 1); cmp('罰款中上限', G.lossMid, g.lossMid, '', 1);
      }
      if (n.prices) E.TABLES.models.forEach(m => cmp('單價 ' + m + '（個案平均）', S.P.prices[m], n.prices[m], ' 元／片', 1));
      if (n.ops) {
        cmp('業務提醒', S.ops.salesRemindMin, n.ops.salesRemindMin, ' 分鐘'); cmp('生管提醒', S.ops.plannerRemindMin, n.ops.plannerRemindMin, ' 分鐘');
        cmp('升級生管主管', S.ops.plannerEscalateMin, n.ops.plannerEscalateMin, ' 分鐘');
      }
      if (n.ai) cmp('解析模式', S.ai.mode, n.ai.mode);
      if (n.pending) { cmp('是否接 ERP', S.pending.erp, n.pending.erp); cmp('插件站數', S.pending.stations || '（空）', n.pending.stations || '（空）'); cmp('班次', S.pending.shifts || '（空）', n.pending.shifts || '（空）'); }
      if (!changes.length) return { ok: false, msg: '沒有任何變更' };
      if (n.guess) Object.assign(G, n.guess);
      if (n.prices) Object.assign(S.P.prices, n.prices);
      if (n.ops) Object.assign(S.ops, n.ops);
      if (n.ai) Object.assign(S.ai, n.ai);
      if (n.pending) Object.assign(S.pending, n.pending);
      const v = curPver() + 1;
      const st = stamp();
      S.pver.push(Object.freeze({ v, at: st.label, by: by || '管理者', changes: Object.freeze(changes.slice()) }));
      changes.forEach(c => log(by || '管理者', 'admin', '參數變更 p' + v, '', c));
      const waiting = S.orders.filter(o => o.status === 'queued').length;
      if (affects) recalcPending('參數 p' + v);
      onChange();
      return { ok: true, n: changes.length, v, recalc: affects ? waiting : 0 };
    }
    function resetParams(by) {
      const d = caseDefaults();
      return applyParams({ guess: d.guess, prices: d.prices, ops: Object.assign({}, OPS_DEFAULT), ai: Object.assign({}, AI_DEFAULT) }, by);
    }

    /* ===== 指標（只看單與機台，不看個人） ===== */
    function metrics() {
      const os = S.orders.filter(o => o.status !== 'returned');
      const decided = os.filter(o => o.decision), filled = os.filter(o => o.actual), replied = os.filter(o => o.reply);
      const errs = filled.map(o => { const e = o.decision.est.extraH; return e > 0 ? Math.abs(o.actual.hours - e) / e : null; }).filter(x => x != null);
      const lat = replied.map(o => o.t.replied - o.raw.receivedAbs);
      return {
        n: os.length, decided: decided.length, adopt: decided.filter(o => o.decision.type === 'adopt').length, adjust: decided.filter(o => o.decision.type === 'adjust').length,
        replied: replied.length, covered: replied.filter(o => o.reply.calc).length, filled: filled.length,
        qty: filled.reduce((a, o) => a + o.draft.fields.qty.value, 0), onTime: filled.filter(o => o.actual.shipDate <= o.draft.fields.due.value).length,
        onPromise: filled.filter(o => o.actual.shipDate <= o.decision.promise).length,
        estC: decided.reduce((a, o) => a + o.decision.est.extraC, 0), actC: filled.reduce((a, o) => a + o.actual.changeovers, 0),
        err: errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : null,
        lat: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : null,
        anomalies: os.filter(o => (o.anomalies || []).length).length,
        estFlags: filled.filter(o => o.actual.estFlag).length,
        reasonCats: decided.reduce((m, o) => { const k = o.decision.reasonCat; if (k) m[k] = (m[k] || 0) + 1; return m; }, {}),
        push: pushCount(), reply: replyCount(), failed: S.notes.filter(n => n.status === 'failed').length
      };
    }

    /* ===== 進度 ===== */
    function stage(o) {
      return { received: 1, queued: 3, decided: 4, replied: 5, done: 6, returned: 0 }[o.status];
    }

    function showVal(k, v) {
      if (v == null || v === '') return '—';
      if (k === 'qty') return fmtN(v) + ' 片';
      if (k === 'due') return U.mdw(v);
      if (k === 'partChange') return v ? '要換' : '不換';
      if (k === 'isAdd') return v ? '追加單' : '一般單';
      return String(v);
    }

    return {
      S, stamp, advance, log, auditList, person, boundSales,
      bind, unbind, regenCode, setLineDown, pushCount, replyCount,
      forward, webhook, redeliver, webIntake, runParse, anomalies, estimateChangeover,
      lowOf, pendingFields, followups, setField, keepField, changesOf, submit, returnOrder,
      calcRef, latestCalc, summary, decide, replyInfo, copyReply, sampleActual, saveActual,
      timerState, checkTimers, applyParams, resetParams, metrics, stage, showVal, curPver
    };
  }

  // 理由分類：關鍵字規則，只供事後檢討，不影響試算
  function reasonCategory(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    if (/機台|設備|治具|故障|保養|檢修|換線/.test(t)) return '設備';
    if (/缺料|物料|齊套|來料|供應|料/.test(t)) return '物料';
    if (/客戶|客人|期限|改期/.test(t)) return '客戶';
    return '其他';
  }
  // 解釋：只用試算結果的數字與標籤；文字中每個數字都必須在試算結果中找得到，否則不顯示
  function explainCalc(b) {
    const text = '建議排在 ' + b.afterId + ' 之後，' + b.startAt.label + ' 開工，試算完成 ' + b.endAt.label + '，額外換線 ' + b.extraC + ' 次。';
    const allowed = new Set(JSON.stringify(b).match(/\d+(\.\d+)?/g) || []);
    const bad = (text.match(/\d+(\.\d+)?/g) || []).filter(n => !allowed.has(n));
    return { text, ok: bad.length === 0, bad };
  }
  const api = { create, SAMPLES, ROLE, STATUS, STAGES, SRC, OPS_DEFAULT, AI_DEFAULT, reasonCategory, explainCalc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Store = api;
})(typeof window !== 'undefined' ? window : globalThis);
