/* 黃金測試用的固定輸入：v1 的三筆示意原文、示意時間 11/17 10:30。
   缺的欄位用固定值補，模擬業務確認後的結果。 */
'use strict';
const SAMPLES = [
  { key: 'full', text: '甲客戶追加 A1 800片，11/20 要出貨，零件有換。', fill: {} },
  { key: 'noqty', text: '乙那邊要插一張 B2，11/20 要，零件不變', fill: { qty: 2400 } },
  { key: 'vague', text: '丙的 C3 加 600片，週四要，零件不變', fill: {} }
];
const AS_OF = { date: '2026-11-17', hour: 10.5 };

function summarize(E, s) {
  const P = E.defaults();
  const F = E.ruleParse(s.text, { P, today: AS_OF.date });
  const fields = {};
  for (const k of E.FIELD_ORDER) {
    const f = F[k];
    fields[k] = { value: f.value, conf: f.conf, span: f.span, alts: f.alts ? f.alts.map(a => a.value) : undefined };
  }
  const v = k => (s.fill[k] != null ? s.fill[k] : F[k].value);
  const X = { id: 'A-0001', customer: v('customer'), model: v('model'), qty: v('qty'), due: v('due'), partChange: !!v('partChange') };
  const r = E.calc(E.seedQueue(), X, P, AS_OF);
  return {
    fields,
    X,
    fingerprint: r.fingerprint,
    entry: r.entry.label,
    frozen: r.frozenIds,
    baseLoss: Math.round(r.baseLoss * 100) / 100,
    best: r.best,
    cands: r.cands.map(c => ({
      after: c.afterId, start: c.startAt.label, end: c.endAt.label, extraC: c.extraC,
      lateX: c.lateX, deltaLoss: Math.round(c.deltaLoss * 100) / 100,
      newLate: c.newLate.map(n => n.id + ':' + n.late), resorted: c.resorted,
      risk: E.risk(c, r.cal, P).label, lossLevel: E.lossLevel(c.deltaLoss, P).label
    }))
  };
}

module.exports = { SAMPLES, AS_OF, summarize };
