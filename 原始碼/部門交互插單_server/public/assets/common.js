/* 昇嶺插單入口 正式版前端共用：
   - window.Store：常數（與 Demo v2 相同文字）
   - App.st：把後端回傳的訂單包成 Demo 畫面認得的樣子；試算結果由同一份引擎依存檔輸入重算，指紋不符就報錯
   - App.api：呼叫後端（LIFF 帶 ID token；電腦網頁帶 cookie） */
(function (root) {
  'use strict';
  const E = root.Engine, U = E.util;

  root.Store = {
    ROLE: { boss: '老闆', sales: '業務', planner: '生管', lead: '生管主管', admin: '管理者' },
    STATUS: { received: '待業務確認', queued: '待生管決定', decided: '生管已決定', replied: '已回覆客戶', done: '已回填結果', returned: '已退回' },
    STAGES: ['已收單', '已確認', '試算', '生管決定', '已回覆', '已回填'],
    SRC: { LINE: 'LINE 轉傳', WEB: '網頁備援', PHONE: '電話', ORAL: '口頭' }
  };
  const REQ = ['customer', 'model', 'qty', 'due', 'partChange'];
  const fmtN = n => Number(n).toLocaleString('en-US');
  const A = root.App = root.App || {};
  /* 罰款變化：插單後重排可能讓總罰款變少，負數寫「減少」，不能寫成 +NT$-681 */
  const lossTxt = d => { const n = Math.round(d); return n > 0 ? '罰款 +NT$' + fmtN(n) : n < 0 ? '罰款減少 NT$' + fmtN(-n) : '罰款不變'; };
  A.lossTxt = lossTxt;

  /* ---------- 後端 ---------- */
  let idToken = null;
  A.setIdToken = t => { idToken = t; };
  A.api = async function (method, path, body) {
    const h = { 'Content-Type': 'application/json' };
    if (idToken) h.Authorization = 'Bearer ' + idToken;
    let r;
    try { r = await fetch(path, { method, headers: h, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch (e) { return { ok: false, msg: '連不上伺服器，請檢查網路後再試', status: 0 }; }
    let j = {};
    try { j = await r.json(); } catch (e) { j = { ok: false, msg: '伺服器回應看不懂（HTTP ' + r.status + '）' }; }
    j.status = r.status;
    return j;
  };

  /* ---------- 把後端訂單變成 Demo 畫面的形狀 ---------- */
  function hydrate(o) {
    for (const c of o.calcs) {
      const i = c.input;
      c.result = E.calc(i.queue, i.X, i.P, i.asOf);
      c.P = i.P;
      if (c.result.fingerprint !== c.fingerprint) c.broken = true;
    }
    o.calcs.sort((a, b) => a.rev - b.rev);
    return o;
  }

  const st = A.st = {
    S: { orders: [], P: { conf: { threshold: 0.7 } }, ai: { timeoutMs: 8000 } },
    hydrate,
    put(o) {
      hydrate(o);
      if (o.paramsNow) st.S.P = { conf: { threshold: o.paramsNow.threshold } };
      const i = st.S.orders.findIndex(x => x.id === o.id);
      if (i >= 0) st.S.orders[i] = o; else st.S.orders.unshift(o);
      return o;
    },
    stage: o => ({ received: 1, queued: 3, decided: 4, replied: 5, done: 6, returned: 0 }[o.status]),
    showVal(k, v) {
      if (v == null || v === '') return '—';
      if (k === 'qty') return fmtN(v) + ' 片';
      if (k === 'due') return U.mdw(v);
      if (k === 'partChange') return v ? '要換' : '不換';
      if (k === 'isAdd') return v ? '追加單' : '一般單';
      return String(v);
    },
    lowOf(o, k) {
      const f = o.draft.fields[k];
      if (f.value == null || f.value === '') return 'missing';
      if (f.confirmed) return null;
      if (k === 'model' && !E.TABLES.models.includes(f.value)) return 'low';
      return f.conf < st.S.P.conf.threshold ? 'low' : null;
    },
    pendingFields(o) {
      if (!o.draft) return [];
      return REQ.concat(['isAdd']).map(k => ({ k, why: st.lowOf(o, k) })).filter(x => x.why);
    },
    followups(o) {
      return st.pendingFields(o).map(({ k, why }) => {
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
    },
    coerce(k, v) {
      if (v === '' || v == null) return null;
      if (k === 'qty') { const n = parseInt(String(v).replace(/,/g, ''), 10); return n > 0 ? n : null; }
      if (k === 'partChange' || k === 'isAdd') return v === true || v === 'true';
      return v;
    },
    setField(o, k, raw) { if (o.status !== 'received' || !o.draft) return; const f = o.draft.fields[k]; const v = st.coerce(k, raw); f.value = v; f.confirmed = v != null; },
    keepField(o, k) { if (o.draft) o.draft.fields[k].confirmed = true; },
    calcRef: c => c ? c.id : '',
    latestCalc: o => o.calcs[o.calcs.length - 1] || null,
    summary(o) {
      const c = st.latestCalc(o); if (!c) return null;
      const r = c.result, b = r.cands[r.best];
      return { cand: b, risk: E.risk(b, r.cal, c.P), loss: E.lossLevel(b.deltaLoss, c.P),
        text: '建議排在 ' + b.afterId + ' 後，預計 ' + b.startAt.label + ' 開工；' + lossTxt(b.deltaLoss) + '；連帶 ' + b.newLate.length + ' 張晚交' };
    },
    replyInfo(o) {
      const calc = st.latestCalc(o);
      if (!calc) return { calc: null };
      if (!o.decision) return { calc, noDecision: true };
      const req = o.draft.fields.due.value, due = o.decision.promise;
      return { calc, est: o.decision.est, dueDate: due, req, draft: o.reply ? o.reply.text : o.replyDraft, onTime: due <= req };
    },
    /* B1 沒有逾時提醒（B2 才做升級），這裡只算等了多久 */
    timerState(o) {
      if (!o.t || !o.t.waitingSince) return null;
      const w = Math.max(0, Math.round((Date.now() - new Date(o.t.waitingSince).getTime()) / 60000));
      return { w, level: 0 };
    }
  };
})(window);
