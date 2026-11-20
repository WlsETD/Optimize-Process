/* 昇嶺電子 單一插單入口 — 共用畫面元件（自 Demo v2 沿用，算式文字不變）
   時間軸、候選表、AI 分析、參數說明沿用 v1。 */
(function (root) {
  'use strict';
  const E = root.Engine, U = E.util, Store = root.Store;
  const A = root.App = root.App || {};

  A.ui = {
    liff: null,               // { page: 'confirm'|'reply'|'list'|'bind'|'intake', id }
    sel: null, adj: {}, reason: {}, edit: {}, promise: {},
    adminTab: 'people', auditFilter: 'all', fu: {},
    web: { text: '', source: '電話' }, bindCode: '', confirmReset: false, lastMsg: ''
  };

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtN = n => Number(n).toLocaleString('en-US');
  const yen = n => 'NT$ ' + fmtN(Math.round(n));
  const tag = (c, t) => '<span class="tag ' + c + '">' + t + '</span>';
  const guessTag = () => tag('guess', '【我猜的】');
  const simTag = (t) => tag('sim', t || '模擬');
  const demoTag = o => o.sample ? ' ' + tag('demo', '示意') : '';
  const statusChip = o => '<span class="chip s-' + o.status + '">' + Store.STATUS[o.status] + '</span>';
  const srcTag = k => '<span class="src' + (k === 'LINE' ? ' src-line' : '') + '">' + esc(Store.SRC[k] || k) + '</span>';
  const ord = id => A.st.S.orders.find(o => o.id === id);
  const busy = on => { document.body.classList.toggle('is-busy', !!on); document.querySelectorAll('button[data-act]').forEach(b => { if (on) { b.dataset.wasDisabled = b.disabled ? '1' : ''; b.disabled = true; } else if (b.dataset.wasDisabled !== undefined) { b.disabled = b.dataset.wasDisabled === '1'; delete b.dataset.wasDisabled; } }); };
  const minTxt = m => m >= 60 ? Math.floor(m / 60) + ' 小時' + (m % 60 ? ' ' + (m % 60) + ' 分' : '') : m + ' 分';

  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 3400);
  }

  /* 原文：黑邊白底，標出取值位置 */
  function rawHTML(text, spans) {
    const list = (spans || []).filter(s => s && s.span).map(s => ({ s: s.span[0], e: s.span[1], low: s.low })).sort((a, b) => a.s - b.s);
    let out = '', pos = 0;
    for (const sp of list) {
      if (sp.s < pos || sp.e > text.length) continue;
      out += esc(text.slice(pos, sp.s)) + '<mark' + (sp.low ? ' class="low"' : '') + '>' + esc(text.slice(sp.s, sp.e)) + '</mark>';
      pos = sp.e;
    }
    return out + esc(text.slice(pos));
  }
  const rawBlock = (o, spans) => '<pre class="raw" aria-label="原文，不可修改">' + rawHTML(o.raw.text, spans) + '</pre>';
  function rawMeta(o) {
    return '<dl class="kv"><dt>來源</dt><dd>' + srcTag(o.raw.source) + ' ' + esc(o.raw.by) + '</dd>' +
      '<dt>轉傳時間</dt><dd>' + esc(o.raw.forwardedAt) + '</dd>' +
      '<dt>系統收到</dt><dd>' + esc(o.raw.receivedAt) + (o.raw.eventId ? ' <span class="sub mono">' + esc(o.raw.eventId) + '</span>' : '') + '</dd></dl>';
  }

  /* 進度：已收單→已確認→試算→生管決定→已回覆→已回填（三端同一個狀態） */
  function prog(o) {
    if (o.status === 'returned') return '<p class="prog-ret">已退回，原文保留</p>';
    const n = A.st.stage(o);
    return '<ol class="prog" aria-label="進度：' + Store.STAGES.slice(0, n).join('、') + ' 已完成">' + Store.STAGES.map((s, i) =>
      '<li class="' + (i < n ? 'done' : i === n ? 'cur' : '') + '">' + s + '</li>').join('') + '</ol>';
  }

  /* ===== v1：時間軸 ===== */
  function timeline(rows, cal, hlId) {
    const Hd = cal.Hday; const maxEnd = Math.max(...rows.map(r => r.end), Hd);
    const nd = Math.min(7, Math.max(2, Math.ceil(maxEnd / Hd - 1e-9)));
    const L = cal.L, ds = cal.ds; const slots = cal.slotHours();
    const pct = h => ((h - ds) / L * 100);
    let html = '<div class="tl"><div class="scale"><span></span><div>' + [ds, ds + 2, ds + 4, ds + 6, ds + 8].filter(h => h <= ds + L + 0.01).map(h => '<span style="left:' + pct(h) + '%">' + U.hhmm(h) + '</span>').join('') + '</div></div>';
    for (let d = 0; d < nd; d++) {
      const date = U.addWork(cal.base, d);
      let blocks = '';
      rows.forEach(r => {
        const a = Math.max(r.start, d * Hd), b = Math.min(r.end, (d + 1) * Hd);
        if (b - a < 1e-6) return;
        const left = (a - d * Hd) / Hd * 100, w = (b - a) / Hd * 100;
        const j = r.job; const lab = j.customer + j.model + ' ' + fmtN(j.qty);
        const cls = 'blk' + (j.id === hlId ? ' x' : '') + (r.late > 0 ? ' late' : '') + (j.running ? ' run' : '');
        blocks += '<div class="' + cls + '" style="left:' + left.toFixed(2) + '%;width:' + w.toFixed(2) + '%" title="' + esc(j.id + ' ' + lab + '；' + cal.at(r.start).label + ' → ' + cal.atEnd(r.end).label + (r.late ? '；預計晚 ' + r.late + ' 天' : '')) + '">' + (w > 7 ? esc(lab) : '') + '</div>';
      });
      const ticks = slots.map(h => '<div class="tick" style="left:' + pct(h) + '%"></div>').join('');
      html += '<div class="day"><div class="dl">' + U.md(date) + '<br>週' + U.WD[U.dow(date)] + '</div><div class="track">' + ticks + blocks + '</div></div>';
    }
    html += '<div class="tl-leg"><span><i></i>已排的單</span><span><i class="x"></i>這張單</span><span><i class="late"></i>預計晚交</span><span>虛線：固定插單時段 ' + slots.map(U.hhmm).join('、') + '</span></div></div>';
    return html;
  }

  /* ===== v1：參數說明 ===== */
  function paramLines(P) {
    const G = P.guess;
    return '<ul class="params"><li>SMT 產能 ' + P.data.rate + ' 片／小時 ' + tag('data', '個案資料') + '</li>' +
      '<li>換線 ' + P.data.changeoverH.toFixed(2) + ' 小時／次（機台紀錄） ' + tag('data', '個案資料') + '；現行排程固定抓 ' + P.data.sched05 + ' 小時／線／天，實際約 ' + P.data.actualPerLineDay + '，所以這裡不用 ' + P.data.sched05 + '</li>' +
      '<li>每天可排 ' + P.data.poolHoursPerDay.toFixed(2) + ' 小時＝九月 (760＋133)÷26 ' + tag('data', '個案資料') + '</li>' +
      '<li>罰款：乙 2%／天、丙 1%／天（個案合約）；甲沒有合約罰款，用虛擬權重 ' + G.wA + '%／天 ' + guessTag() + '</li>' +
      '<li>甲最多延後 ' + G.maxDelayA + ' 天 ' + guessTag() + '；固定插單時段 ' + G.slots.join('、') + ' ' + guessTag() + '；凍結 ' + G.freezeH + ' 小時 ' + guessTag() + '；同機種合併 ' + (G.merge ? '開' : '關') + ' ' + guessTag() + '</li>' +
      '<li>單價為示意（' + E.TABLES.models.map(m => m + ' ' + P.prices[m] + ' 元／片').join('、') + '），金額只用來排序，不是報價</li>' +
      '<li>沒有計入插件站數與班次（資料沒有，目前插件站是瓶頸）</li></ul>';
  }

  /* ===== v1：候選位置比較 ===== */
  function candTable(o, calc, selK, selectable) {
    const r = calc.result;
    return '<div class="scroll-x"><table class="cmp"><thead><tr>' + (selectable ? '<th></th>' : '') + '<th>排在這張之後</th><th>預計開工</th><th>預計完成</th><th>額外換線</th><th>本單延誤</th><th>罰款增加</th><th>風險</th></tr></thead><tbody>' +
      r.cands.map((c, i) => {
        const rk = E.risk(c, r.cal, calc.P);
        return '<tr class="' + (i === r.best ? 'best ' : '') + (selectable && selK === c.k ? 'sel' : '') + '">' +
          (selectable ? '<td><input type="radio" name="cand-' + o.id + '" value="' + c.k + '" data-act-change="cand" data-id="' + o.id + '"' + (selK === c.k ? ' checked' : '') + ' aria-label="排在 ' + c.afterId + ' 之後"></td>' : '') +
          '<td>' + esc(c.afterId + ' ' + c.after.customer + c.after.model) + (i === r.best ? ' ' + tag('ai', '建議') : '') + '</td><td>' + c.startAt.label + '</td><td>' + c.endAt.label + '</td><td>' + c.extraC + ' 次</td><td>' + (c.lateX ? c.lateX + ' 天' : '0') + '</td><td>' + yen(c.deltaLoss) + '</td><td>' + rk.label + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ===== v1：AI 分析（插入時機、工時、換線、罰款、風險、併單） ===== */
  function aiPanel(o, calc) {
    const r = calc.result, c = r.cands[r.best], P = calc.P; const rk = E.risk(c, r.cal, P); const ll = E.lossLevel(c.deltaLoss, P);
    const x = c.x; const runH = o.draft.fields.qty.value / P.data.rate;
    const merge = (() => {
      const m = r.cands.filter(z => z.sameModelAdj);
      if (c.sameModelAdj) return '建議位置與同機種相鄰，已併單。';
      if (m.length) { const z = m.sort((a, b) => a.totalLoss - b.totalLoss)[0]; return '併單位置：排在 ' + z.afterId + ' 之後，可少換線，但罰款增加 ' + yen(z.deltaLoss) + '，建議位置是 ' + yen(c.deltaLoss) + '。'; }
      return '候選位置裡沒有同機種相鄰的位置，沒有併單可做。';
    })();
    const flags = [];
    if (c.resorted) flags.push('後段沒凍結的單裡，會遲的單已依「金額 × 每日罰款率」由高到低重排。');
    if (c.aLate.length) flags.push('甲的單預計晚過 ' + P.guess.maxDelayA + ' 天（上限，【我猜的】），建議交老闆決定。');
    if (c.newLate.length) flags.push('連帶變遲：' + c.newLate.map(n => n.id + ' ' + n.customer + n.model + ' 晚 ' + n.late + ' 天').join('、') + '。');
    const extra = c.cX + (c.cNextNew - c.cNextOld);
    return '<dl style="margin:0">' +
      '<div class="arow"><dt>插入時機</dt><dd><b>排在 ' + esc(c.afterId + ' ' + c.after.customer + c.after.model + ' ' + fmtN(c.after.qty)) + ' 之後</b>，預計 ' + c.startAt.label + ' 開工、' + c.endAt.label + ' 完成。<span class="fm">' + esc(r.entry.label) + ' 的固定時段排入；不拆單，前一張做完才換</span></dd></div>' +
      '<div class="arow"><dt>單量與工時</dt><dd>' + fmtN(x.job.qty) + ' 片，約 ' + (runH + c.cX * P.data.changeoverH).toFixed(2) + ' 小時<span class="fm">' + fmtN(x.job.qty) + ' ÷ ' + P.data.rate + ' = ' + runH.toFixed(2) + ' h；本單換線 ' + c.cX + ' 次 × ' + P.data.changeoverH.toFixed(2) + ' = ' + (c.cX * P.data.changeoverH).toFixed(2) + ' h</span></dd></div>' +
      '<div class="arow"><dt>換線</dt><dd>這次插單多出 <b>' + c.extraC + ' 次</b>（' + c.extraH.toFixed(2) + ' 小時）<span class="fm">本單 ' + c.cX + ' 次；下一張 ' + c.cNextOld + ' → ' + c.cNextNew + ' 次（' + (c.cNextNew - c.cNextOld >= 0 ? '+' : '−') + Math.abs(c.cNextNew - c.cNextOld) + '）；合計 ' + c.cX + (c.cNextNew - c.cNextOld >= 0 ? ' + ' : ' − ') + Math.abs(c.cNextNew - c.cNextOld) + ' = ' + extra + ' 次</span></dd></div>' +
      '<div class="arow"><dt>罰款損失</dt><dd><span class="pill l' + ll.level + '">' + ll.label + '</span> ' + yen(c.deltaLoss) + '（本單 ' + yen(c.lossX) + '，連帶 ' + yen(c.deltaLoss - c.lossX) + '）<span class="fm">每張 = 金額 × 日罰款率 × 晚的天數；' + esc(x.job.customer) + ' 的日罰款率 ' + (x.rate * 100).toFixed(2).replace(/\.?0+$/, '') + '%' + (x.job.customer === '甲' ? '（虛擬，非合約罰款）' : '') + '，本單金額 ' + yen(x.amount) + '（示意單價）；等級門檻 ' + fmtN(P.guess.lossLow) + '／' + fmtN(P.guess.lossMid) + ' 【我猜的】</span></dd></div>' +
      '<div class="arow"><dt>準時風險</dt><dd><span class="pill l' + rk.level + '">' + rk.label + '</span> ' + esc(rk.why.join('；')) + '；要求 ' + U.mdw(x.job.due) + '</dd></div>' +
      '<div class="arow"><dt>併單建議</dt><dd>' + esc(merge) + '</dd></div>' +
      (flags.length ? '<div class="arow"><dt>注意</dt><dd>' + flags.map(esc).join('<br>') + '</dd></div>' : '') +
      '</dl>' +
      '<details class="basis"><summary>候選位置比較與參數</summary>' + candTable(o, calc, null, false) +
      '<p class="sub fp">輸入指紋 ' + r.fingerprint + '：同樣的排程、參數、單、時間，一定算出同樣結果。試算時間 ' + r.asOf.label + '，參數版本 p' + calc.pv + '。</p>' + paramLines(P) + '</details>';
  }

  /* 欄位值顯示 */
  const showVal = (k, v) => A.st.showVal(k, v);

  Object.assign(A, { busy, $, esc, fmtN, yen, tag, guessTag, simTag, demoTag, statusChip, srcTag, ord, minTxt, toast,
    rawHTML, rawBlock, rawMeta, prog, timeline, paramLines, candTable, aiPanel, showVal });
})(window);
