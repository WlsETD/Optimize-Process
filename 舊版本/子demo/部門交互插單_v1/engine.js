/* 昇嶺電子 單一插單入口 — 固定程式引擎（解析規則、換線試算、排序、風險）
   原則：相同輸入必得相同結果；不呼叫模型；每個數字附算式。 */
(function (root) {
  'use strict';

  /* ---------- 日期工具（工作日：週一到週六，九月 26 個工作日） ---------- */
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  const pad = n => String(n).padStart(2, '0');
  const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12, 0, 0); };
  const fmtD = dt => dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  const addDays = (s, n) => { const dt = parseD(s); dt.setDate(dt.getDate() + n); return fmtD(dt); };
  const dow = s => parseD(s).getDay();
  const md = s => { const dt = parseD(s); return (dt.getMonth() + 1) + '/' + dt.getDate(); };
  const mdw = s => md(s) + '（週' + WD[dow(s)] + '）';
  const hhmm = h => { const t = Math.round(h * 60); return pad(Math.floor(t / 60)) + ':' + pad(t % 60); };
  const nextWork = s => { while (dow(s) === 0) s = addDays(s, 1); return s; };
  const prevWork = s => { while (dow(s) === 0) s = addDays(s, -1); return s; };
  function workdaysBetween(a, b) {
    if (a === b) return 0;
    const dir = a < b ? 1 : -1; let c = a, n = 0, guard = 0;
    while (c !== b && guard++ < 800) { c = addDays(c, dir); if (dow(c) !== 0) n += dir; }
    return n;
  }
  function addWork(s, n) {
    let c = s; const step = n >= 0 ? 1 : -1; let k = Math.abs(n), guard = 0;
    while (k > 0 && guard++ < 800) { c = addDays(c, step); if (dow(c) !== 0) k--; }
    return c;
  }
  const hourOf = t => { const [h, m] = t.split(':').map(Number); return h + (m || 0) / 60; };

  /* ---------- 預設參數 ---------- */
  function defaults() {
    return {
      // 個案資料（唯讀）
      data: {
        rate: 150,                       // SMT 片／正常運轉小時（12 個月實測 149.9–150.1）
        changeoverH: 0.90,               // 機台紀錄，每次換線平均小時
        lines: 4,                        // 九月 4 條 SMT 線
        poolHoursPerDay: (760 + 133) / 26, // 九月（正常運轉 760 h＋換線停機 133 h）÷ 26 個工作日，推算
        penalty: { '乙': 0.02, '丙': 0.01, '甲': 0 }, // 個案合約：乙 2%／天、丙 1%／天、甲無
        sched05: 0.5, actualPerLineDay: 1.28           // 現行排程固定抓 0.5；實際約 1.28 小時／線／天
      },
      // 【我猜的】
      guess: {
        wA: 1.25,            // 甲虛擬權重 %／天（1–1.5）
        maxDelayA: 1,        // 甲最多延後（天）
        slots: ['10:00', '15:00'], // 固定插單時段
        merge: true,         // 同機種合併
        freezeH: 48,         // 凍結小時
        partExtra: 1,        // 換零件額外換線次數
        nCand: 6,            // 比較幾個候選位置
        dayStart: 8,         // 工作日開始時間
        lossLow: 3000, lossMid: 10000 // 罰款損失 低／中 門檻（NT$）
      },
      prices: { A1: 38, B2: 52, C3: 31 },   // 示意單價 NT$／片
      clock: { date: '2026-11-17', time: '10:30' }, // 示意時間
      conf: { threshold: 0.70 }
    };
  }

  /* ---------- 示意資料表 ---------- */
  const TABLES = {
    customers: { '甲': ['客戶甲', '甲客戶', '甲'], '乙': ['客戶乙', '乙客戶', '乙'], '丙': ['客戶丙', '丙客戶', '丙'] },
    models: ['A1', 'B2', 'C3']
  };

  /* ---------- 現行排程（示意） ---------- */
  function seedQueue() {
    return [
      { id: 'Q-01', customer: '乙', model: 'B2', qty: 3300, due: '2026-11-17', running: true },
      { id: 'Q-02', customer: '甲', model: 'A1', qty: 3000, due: '2026-11-18' },
      { id: 'Q-03', customer: '丙', model: 'C3', qty: 1800, due: '2026-11-18' },
      { id: 'Q-04', customer: '乙', model: 'B2', qty: 2400, due: '2026-11-19' },
      { id: 'Q-05', customer: '丙', model: 'C3', qty: 2400, due: '2026-11-19' },
      { id: 'Q-06', customer: '甲', model: 'A1', qty: 3000, due: '2026-11-20' },
      { id: 'Q-07', customer: '乙', model: 'B2', qty: 1200, due: '2026-11-20' }
    ];
  }

  /* ---------- 時間軸：把「合計運轉小時」對到日期與鐘點 ---------- */
  function makeCal(asOfDate, P) {
    const Hday = P.data.poolHoursPerDay, L = Hday / P.data.lines, ds = P.guess.dayStart;
    const base = nextWork(asOfDate);
    const cal = {
      base, Hday, L, ds,
      pos(date, hour) {
        const d = dow(date) === 0 ? prevWork(date) : date;
        const idx = workdaysBetween(base, d);
        const frac = Math.min(1, Math.max(0, (hour - ds) / L));
        return idx * Hday + frac * Hday;
      },
      dueEnd(date) { return cal.pos(date, ds + L); },
      at(p) {
        const idx = Math.floor(p / Hday + 1e-9);
        const frac = Math.min(1, Math.max(0, (p - idx * Hday) / Hday));
        const date = addWork(base, idx), hour = ds + frac * L;
        return { date, hour, label: md(date) + ' ' + hhmm(hour) };
      },
      atEnd(p) { return cal.at(p - 1e-7); },
      slotHours() { return P.guess.slots.map(hourOf).sort((a, b) => a - b); }
    };
    return cal;
  }

  /* ---------- 排程計算 ---------- */
  function weightOf(job, P) {
    const rate = job.customer === '甲' ? P.guess.wA / 100 : (P.data.penalty[job.customer] || 0);
    return { rate, perDay: job.qty * (P.prices[job.model] || 0) * rate };
  }

  function runSeq(seq, p0, P, cal) {
    let p = p0, prev = null; const out = [];
    seq.forEach((j, i) => {
      let c = 0;
      if (i > 0) c = (P.guess.merge ? (prev.model !== j.model ? 1 : 0) : 1) + (j.partChange ? P.guess.partExtra : 0);
      if (j.notBefore != null && p < j.notBefore) p = j.notBefore;
      const run = j.qty / P.data.rate, co = c * P.data.changeoverH;
      const start = p, end = p + run + co;
      const w = weightOf(j, P), amount = j.qty * (P.prices[j.model] || 0);
      const dueEnd = cal.dueEnd(j.due);
      const late = Math.max(0, Math.ceil((end - dueEnd) / cal.Hday - 1e-9));
      out.push({ job: j, start, end, run, co, c, amount, rate: w.rate, perDay: w.perDay, dueEnd, late, loss: w.perDay * late });
      p = end; prev = j;
    });
    return out;
  }
  const totalLoss = rows => rows.reduce((a, r) => a + r.loss, 0);
  const totalC = rows => rows.reduce((a, r) => a + r.c, 0);

  function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }

  /* ---------- 試算：找最佳插單位置 ---------- */
  function calc(queue, X, P, asOf) {
    const cal = makeCal(asOf.date, P);
    const asOfDate = dow(asOf.date) === 0 ? nextWork(asOf.date) : asOf.date;
    const asOfHour = dow(asOf.date) === 0 ? P.guess.dayStart : asOf.hour;
    const p0 = cal.pos(asOfDate, asOfHour);
    const base = runSeq(queue, p0, P, cal);
    const baseLoss = totalLoss(base), baseC = totalC(base);

    // 排入時段：asOf 之後最近的固定時段
    const sh = cal.slotHours();
    let entryDate = asOfDate, entryHour = null;
    for (const h of sh) if (h >= asOfHour - 1e-9) { entryHour = h; break; }
    if (entryHour == null) { entryDate = addWork(asOfDate, 1); entryHour = sh[0]; }
    const entryPos = cal.pos(entryDate, entryHour);
    const entry = { date: entryDate, hour: entryHour, pos: entryPos,
      label: (entryDate === asOfDate ? '今天 ' : md(entryDate) + ' ') + hhmm(entryHour) };

    // 凍結：asOf + freezeH 之前開工的單不重排
    const fd = Math.floor(P.guess.freezeH / 24), fr = P.guess.freezeH % 24;
    let fHour = asOfHour + fr, fDate = addDays(asOfDate, fd);
    if (fHour >= 24) { fHour -= 24; fDate = addDays(fDate, 1); }
    const frozenUntil = cal.pos(fDate, Math.min(fHour, P.guess.dayStart + cal.L));
    const frozen = new Set(base.filter(r => r.start < frozenUntil - 1e-9).map(r => r.job.id));

    const Xjob = Object.assign({}, X, { inserted: true });
    const cands = [];
    const eligible = [];
    for (let k = 1; k <= queue.length; k++) {
      const start = base[k - 1].end;
      if (start >= entryPos - 1e-9) eligible.push(k);
    }
    if (!eligible.length) eligible.push(queue.length);

    eligible.slice(0, P.guess.nCand).forEach(k => {
      const mk = jobs => runSeq(jobs, p0, P, cal);
      const xj = Object.assign({}, Xjob, { notBefore: entryPos });
      const seqA = [...queue.slice(0, k), xj, ...queue.slice(k)];
      const rowsA = mk(seqA);
      let rows = rowsA, resorted = false;
      const after = seqA.slice(k + 1);
      const frozenPart = after.filter(j => frozen.has(j.id));
      const freeTail = after.filter(j => !frozen.has(j.id));
      if (freeTail.length > 1) {
        const lateIn = new Set(rowsA.filter(r => r.late > 0).map(r => r.job.id));
        const idx = new Map(freeTail.map((j, i) => [j.id, i]));
        const sorted = [...freeTail].sort((a, b) => {
          const la = lateIn.has(a.id) ? 1 : 0, lb = lateIn.has(b.id) ? 1 : 0;
          if (la !== lb) return lb - la;
          const wa = weightOf(a, P).perDay, wb = weightOf(b, P).perDay;
          if (Math.abs(wa - wb) > 1e-9) return wb - wa;
          return idx.get(a.id) - idx.get(b.id);
        });
        const changed = sorted.some((j, i) => j.id !== freeTail[i].id);
        if (changed) {
          const seqB = [...seqA.slice(0, k + 1), ...frozenPart, ...sorted];
          const rowsB = mk(seqB);
          if (totalLoss(rowsB) < totalLoss(rowsA) - 1) { rows = rowsB; resorted = true; }
        }
      }
      const xr = rows.find(r => r.job.id === X.id);
      const xi = rows.indexOf(xr);
      const prevJob = xi > 0 ? rows[xi - 1].job : null;
      const nextRow = rows[xi + 1] || null;
      const baseNext = nextRow ? base.find(r => r.job.id === nextRow.job.id) : null;
      const newLate = rows.filter(r => r.job.id !== X.id && r.late > 0 &&
        !(base.find(b => b.job.id === r.job.id && b.late >= r.late)))
        .map(r => ({ id: r.job.id, customer: r.job.customer, model: r.job.model, qty: r.job.qty,
          late: r.late, loss: r.loss - ((base.find(b => b.job.id === r.job.id) || {}).loss || 0) }));
      const aLate = rows.filter(r => r.job.customer === '甲' && r.late > P.guess.maxDelayA)
        .map(r => ({ id: r.job.id, late: r.late }));
      const tl = totalLoss(rows);
      const extraC = totalC(rows) - baseC;
      const sameModelAdj = !!(prevJob && prevJob.model === X.model) || !!(nextRow && nextRow.job.model === X.model);
      cands.push({
        k, afterId: queue[k - 1].id, after: queue[k - 1],
        x: xr, start: xr.start, end: xr.end,
        startAt: cal.at(xr.start), endAt: cal.atEnd(xr.end),
        lateX: xr.late, lossX: xr.loss, totalLoss: tl, deltaLoss: tl - baseLoss,
        newLate, aLate, extraC, extraH: extraC * P.data.changeoverH,
        cX: xr.c, cNextOld: baseNext ? baseNext.c : 0, cNextNew: nextRow ? nextRow.c : 0,
        sameModelAdj, resorted, rows,
        seqJobs: rows.map(r => r.job)
      });
    });

    let best = 0;
    cands.forEach((c, i) => {
      const b = cands[best];
      if (c.totalLoss < b.totalLoss - 1e-6 ||
        (Math.abs(c.totalLoss - b.totalLoss) <= 1e-6 && (c.extraC < b.extraC ||
          (c.extraC === b.extraC && c.start < b.start)))) best = i;
    });

    const fingerprint = fnv(JSON.stringify({ queue: queue.map(q => [q.id, q.customer, q.model, q.qty, q.due, q.partChange || 0]),
      X: [X.customer, X.model, X.qty, X.due, X.partChange || 0], P: { g: P.guess, d: P.data, p: P.prices }, asOf: [asOfDate, asOfHour] }));

    return { cal, asOf: { date: asOfDate, hour: asOfHour, label: md(asOfDate) + ' ' + hhmm(asOfHour) },
      p0, base, baseLoss, baseC, entry, frozenUntil, frozenIds: [...frozen],
      cands, best, fingerprint,
      xRunH: X.qty / P.data.rate };
  }

  /* ---------- 風險與等級 ---------- */
  function risk(c, cal, P) {
    const dueEnd = c.x.dueEnd;
    const slackDays = (dueEnd - c.end) / cal.Hday;
    let level = 0; const why = [];
    if (c.lateX > 0) { level = 2; why.push('本單預計晚 ' + c.lateX + ' 天'); }
    else if (slackDays < 0.5) { level = 1; why.push('餘裕只有 ' + slackDays.toFixed(1) + ' 天'); }
    else why.push('餘裕 ' + slackDays.toFixed(1) + ' 天');
    if (c.newLate.length) { level = Math.max(level, 1); why.push('連帶 ' + c.newLate.length + ' 張變遲'); }
    if (c.aLate.length) { level = 2; why.push('甲超過延後上限 ' + P.guess.maxDelayA + ' 天'); }
    return { level, label: ['低', '中', '高'][level], slackDays, why };
  }
  function lossLevel(delta, P) {
    if (delta <= 0.5) return { level: 0, label: '無' };
    if (delta <= P.guess.lossLow) return { level: 1, label: '低' };
    if (delta <= P.guess.lossMid) return { level: 2, label: '中' };
    return { level: 3, label: '高' };
  }

  /* ---------- 規則解析 ---------- */
  const zhDigit = { '零': 0, '〇': 0, '一': 1, '二': 2, '兩': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  const zhUnit = { '十': 10, '百': 100, '千': 1000 };
  function zhNum(s) {
    let total = 0, cur = 0, last = 0;
    for (const ch of s) {
      if (ch in zhDigit) cur = zhDigit[ch];
      else if (ch in zhUnit) { total += (cur || 1) * zhUnit[ch]; cur = 0; last = zhUnit[ch]; }
    }
    if (cur) total += last >= 100 ? cur * last / 10 : cur;
    return total;
  }
  const wkMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };

  function ruleParse(text, ctx) {
    const P = ctx.P, today = ctx.today;
    const F = {};
    const none = note => ({ value: null, conf: 0, span: null, note, src: 'rule' });

    // 客戶
    F.customer = none('原文找不到客戶');
    let best = null;
    for (const [name, aliases] of Object.entries(TABLES.customers)) {
      for (const a of aliases) {
        const i = text.indexOf(a);
        if (i >= 0 && (!best || i < best.i)) best = { name, i, len: a.length };
      }
    }
    if (best) F.customer = { value: best.name, conf: 0.95, span: [best.i, best.i + best.len], note: '對照客戶別名表', src: 'rule' };

    // 機種
    F.model = none('原文找不到機種代碼');
    const mre = /([A-Za-z])\s?-?\s?(\d{1,3})(?![\d])/g; let m, firstTok = null;
    while ((m = mre.exec(text))) {
      const code = (m[1] + m[2]).toUpperCase();
      if (TABLES.models.includes(code)) { F.model = { value: code, conf: 0.95, span: [m.index, m.index + m[0].length], note: '對照機種表', src: 'rule' }; firstTok = null; break; }
      if (!firstTok) firstTok = { code, i: m.index, len: m[0].length };
    }
    if (F.model.value == null && firstTok) F.model = { value: firstTok.code, conf: 0.5, span: [firstTok.i, firstTok.i + firstTok.len], note: '機種不在對照表', src: 'rule' };

    // 數量
    F.qty = none('原文沒有數量');
    const q1 = /(\d[\d,]{0,6})\s*(片|PCS|pcs|Pcs|pc|PC|個)/.exec(text);
    const q2 = /([零〇一二兩三四五六七八九十百千]{1,8})\s*(片|個)/.exec(text);
    if (q1) F.qty = { value: parseInt(q1[1].replace(/,/g, ''), 10), conf: 0.95, span: [q1.index, q1.index + q1[0].length], note: '數字加單位', src: 'rule' };
    else if (q2 && zhNum(q2[1]) > 0) F.qty = { value: zhNum(q2[1]), conf: 0.85, span: [q2.index, q2.index + q2[0].length], note: '中文數字換算', src: 'rule' };

    // 要求交期
    F.due = none('原文沒有交期');
    const dateRe = /(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*[日號]?/.exec(text);
    const wkRe = /(下|下個|這|本)?\s*(週|周|禮拜|星期)\s*([一二三四五六日天])/.exec(text);
    const relRe = /(今天|今日|明天|明日|大後天|後天)/.exec(text);
    const y = parseInt(today.slice(0, 4), 10);
    if (dateRe) {
      const mm = +dateRe[1], dd = +dateRe[2];
      const ok = mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
      if (ok) F.due = { value: y + '-' + pad(mm) + '-' + pad(dd), conf: 0.95, span: [dateRe.index, dateRe.index + dateRe[0].length], note: '明確日期', src: 'rule' };
    } else if (wkRe) {
      const t = wkMap[wkRe[3]], pre = wkRe[1] || '';
      const dt = dow(today), monday = addDays(today, -((dt + 6) % 7));
      const thisW = addDays(monday, (t + 6) % 7), nextW = addDays(thisW, 7);
      const thisOk = thisW > today;
      if (pre.startsWith('下')) F.due = { value: nextW, conf: 0.85, span: [wkRe.index, wkRe.index + wkRe[0].length], note: '「下週」推算', src: 'rule' };
      else if (pre === '這' || pre === '本') F.due = { value: thisOk ? thisW : nextW, conf: 0.9, span: [wkRe.index, wkRe.index + wkRe[0].length], note: '「本週」推算', src: 'rule' };
      else {
        const v = thisOk ? thisW : nextW, alt = thisOk ? nextW : addDays(nextW, 7);
        F.due = { value: v, conf: 0.55, span: [wkRe.index, wkRe.index + wkRe[0].length], note: '只說星期幾，不知是這週或下週', src: 'rule',
          alts: [{ value: v, label: mdw(v) + '（最近的一個）' }, { value: alt, label: mdw(alt) }] };
      }
    } else if (relRe) {
      const k = { '今天': 0, '今日': 0, '明天': 1, '明日': 1, '後天': 2, '大後天': 3 }[relRe[1]];
      F.due = { value: addDays(today, k), conf: 0.85, span: [relRe.index, relRe.index + relRe[0].length], note: '由「' + relRe[1] + '」推算', src: 'rule' };
    } else if (/(盡快|越快越好|愈快愈好|急)/.test(text)) {
      F.due = none('只說盡快，沒有日期');
    }

    // 是否換零件
    F.partChange = none('原文沒提零件');
    const neg = /(不(用)?(必)?換(零件|料)|零件(不變|沒變|不換|不改|同)|沒有?換(零件|料)|同(零件|料))/.exec(text);
    const pos = /((換|改)(了)?(零件|料)|零件(有)?(換|改|變)|新版|改版)/.exec(text);
    if (neg) F.partChange = { value: false, conf: 0.9, span: [neg.index, neg.index + neg[0].length], note: '原文說零件不變', src: 'rule' };
    else if (pos) F.partChange = { value: true, conf: 0.9, span: [pos.index, pos.index + pos[0].length], note: '原文說要換零件', src: 'rule' };

    // 是否追加單
    const add = /(追加|加單|插單|急單|加急|插一張|加一張|再加|加\s*\d)/.exec(text);
    F.isAdd = add ? { value: true, conf: 0.9, span: [add.index, add.index + add[0].length], note: '原文有追加用語', src: 'rule' }
      : { value: false, conf: 0.6, span: null, note: '原文沒提，暫當一般單', src: 'rule' };
    return F;
  }

  /* ---------- 模型回傳的驗證：每個值都要在原文找得到出處 ---------- */
  function validateModelOutput(text, obj, ctx) {
    const out = {}; const issues = [];
    if (!obj || typeof obj !== 'object') return { fields: null, issues: ['回傳不是物件'] };
    const get = k => (obj[k] && typeof obj[k] === 'object') ? obj[k] : null;
    const evSpan = ev => { if (!ev || typeof ev !== 'string') return null; const i = text.indexOf(ev); return i >= 0 ? [i, i + ev.length] : null; };
    const C = x => { const n = Number(x); return isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5; };
    const one = (k, norm) => {
      const o = get(k);
      if (!o || o.value == null || o.value === '') { out[k] = { value: null, conf: 0, span: null, note: '模型沒找到', src: 'llm' }; return; }
      const v = norm(o.value);
      const span = evSpan(o.evidence);
      if (v == null) { out[k] = { value: null, conf: 0, span: null, note: '模型值無法使用', src: 'llm' }; issues.push(k + ' 值無效'); return; }
      if (!span && k !== 'isAdd' && k !== 'partChange') { out[k] = { value: null, conf: 0, span: null, note: '模型值在原文找不到出處，已丟棄', src: 'llm' }; issues.push(k + ' 無出處'); return; }
      let conf = C(o.confidence); if (!span) conf = Math.min(conf, 0.6);
      out[k] = { value: v, conf, span, note: (o.note && String(o.note).slice(0, 40)) || '模型解析', src: 'llm' };
      if (Array.isArray(o.alternatives)) {
        const alts = o.alternatives.map(a => norm(a)).filter(Boolean);
        if (alts.length) out[k].alts = alts.map(a => ({ value: a, label: k === 'due' ? mdw(a) : String(a) }));
      }
    };
    one('customer', v => Object.keys(TABLES.customers).includes(String(v)) ? String(v) : null);
    one('model', v => { const s = String(v).toUpperCase().replace(/[\s-]/g, ''); return /^[A-Z]\d{1,3}$/.test(s) ? s : null; });
    one('qty', v => { const n = Math.round(Number(String(v).replace(/,/g, ''))); return n > 0 && n < 1000000 ? n : null; });
    one('due', v => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !isNaN(parseD(String(v))) ? String(v) : null);
    one('partChange', v => (v === true || v === 'true' || v === '是' || v === '要') ? true : (v === false || v === 'false' || v === '否' || v === '不') ? false : null);
    one('isAdd', v => (v === true || v === 'true' || v === '是') ? true : (v === false || v === 'false' || v === '否') ? false : null);
    if (out.model && out.model.value && !TABLES.models.includes(out.model.value)) { out.model.conf = Math.min(out.model.conf, 0.5); out.model.note = '機種不在對照表'; }
    return { fields: out, issues };
  }

  /* 規則與模型合併：不一致就降信心，讓業務看到 */
  function mergeParse(rule, llm) {
    const out = {};
    for (const k of Object.keys(rule)) {
      const r = rule[k], l = llm && llm[k];
      if (!l || l.value == null) { out[k] = Object.assign({}, r, { src: r.value == null ? 'none' : 'rule' }); continue; }
      if (r.value == null) { out[k] = l; continue; }
      if (String(r.value) === String(l.value)) {
        const amb = r.alts && r.alts.length > 1 && r.conf < 0.7; // 規則判定有歧義（如只說「週四」）時，模型不能把信心拉高
        out[k] = Object.assign({}, l, { conf: amb ? r.conf : (Math.max(l.conf, r.conf) >= 0.95 ? 0.97 : Math.max(l.conf, r.conf)), note: amb ? r.note : '模型與規則一致', alts: amb ? r.alts : (l.alts || r.alts), span: l.span || r.span });
        continue;
      }
      out[k] = Object.assign({}, l, { conf: Math.min(l.conf, r.conf, 0.6), note: '模型與規則不一致（規則：' + r.value + '）', alts: [{ value: r.value, label: String(r.value) + '（規則）' }, { value: l.value, label: String(l.value) + '（模型）' }] });
    }
    return out;
  }

  const FIELD_ORDER = ['customer', 'model', 'qty', 'due', 'partChange', 'isAdd'];
  const FIELD_LABEL = { customer: '客戶', model: '機種', qty: '數量', due: '要求交期', partChange: '是否換零件', isAdd: '是否追加單' };

  /* ---------- 回覆草稿（固定範本；模型只可改措辭） ---------- */
  function replyDraft(order, dueDate, requested) {
    const f = order.fields; const q = f.qty.value.toLocaleString('en-US');
    const head = '您好，' + f.model.value + ' ' + q + ' 片';
    if (dueDate <= requested) return head + '，預計 ' + mdw(dueDate) + ' 可出貨，符合您要求的 ' + mdw(requested) + '。如有變動我們會先通知您。';
    return head + '，目前排程最快 ' + mdw(dueDate) + ' 出貨，趕不上您要求的 ' + mdw(requested) + '。若要更早，我們需要再與生管確認，確認後回覆您。';
  }

  const api = { defaults, TABLES, seedQueue, makeCal, runSeq, calc, risk, lossLevel, ruleParse, validateModelOutput, mergeParse,
    replyDraft, weightOf, FIELD_ORDER, FIELD_LABEL, util: { pad, parseD, fmtD, addDays, dow, md, mdw, hhmm, nextWork, addWork, workdaysBetween, hourOf, fnv, WD } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);

