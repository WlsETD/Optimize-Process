/* =====================================================================
   2D 部門流程（SVG）：比照參考檔，節點＋虛線連線＋流動的訊息封包，
   下方是四條 SMT 線（各四站）、後段四站與出貨計數。和 3D 同一個時鐘。
   ===================================================================== */
const NS = 'http://www.w3.org/2000/svg';
const F2 = {};
function sel(tag, attrs, parent, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text; (parent || F2.svg).appendChild(e); return e; }
/* 節點位置 [x, y, w, h] */
const NODES = {
  ja:[16,14,150,58], jb:[16,84,150,58], jc:[16,154,150,58],
  boss:[214,14,184,64], ai:[214,124,184,64],
  sales:[446,14,190,64], plan:[684,14,196,64], wh:[684,124,196,64],
  smt:[928,68,214,64], qa:[1190,14,166,64], man:[1190,124,166,64], ship:[1376,68,110,64]
};
function anchor(id, side) { const [x,y,w,h] = NODES[id]; return side === 'r' ? [x+w, y+h/2] : side === 'l' ? [x, y+h/2] : side === 'b' ? [x+w/2, y+h] : [x+w/2, y]; }
function curve(a, b) { const mx = (a[0]+b[0])/2; return 'M'+a[0]+','+a[1]+' C'+mx+','+a[1]+' '+mx+','+b[1]+' '+b[0]+','+b[1]; }
function arc(a, b, up) { const my = up; return 'M'+a[0]+','+a[1]+' C'+a[0]+','+my+' '+b[0]+','+my+' '+b[0]+','+b[1]; }
/* 連線：key 為兩端（不分方向），路徑方向為 a→b */
const EDGES = {
  'ja|boss':    () => curve(anchor('ja','r'), anchor('boss','l')),
  'jb|boss':    () => curve(anchor('jb','r'), anchor('boss','l')),
  'boss|sales': () => curve(anchor('boss','r'), anchor('sales','l')),
  'boss|ai':    () => 'M'+anchor('boss','b')[0]+','+anchor('boss','b')[1]+' V'+anchor('ai','t')[1],
  'ai|sales':   () => curve(anchor('ai','r'), anchor('sales','l')),
  'sales|plan': () => curve(anchor('sales','r'), anchor('plan','l')),
  'plan|boss':  () => arc(anchor('plan','t'), anchor('boss','t'), -6),
  'sales|ja':   () => arc(anchor('sales','t'), anchor('ja','t'), -10),
  'sales|jc':   () => 'M'+anchor('sales','b')[0]+','+anchor('sales','b')[1]+' C'+anchor('sales','b')[0]+',230 '+(NODES.jc[0]+NODES.jc[2]+40)+',200 '+anchor('jc','r')[0]+','+anchor('jc','r')[1],
  'plan|smt':   () => curve(anchor('plan','r'), anchor('smt','l')),
  'plan|wh':    () => 'M'+anchor('plan','b')[0]+','+anchor('plan','b')[1]+' V'+anchor('wh','t')[1],
  'wh|smt':     () => curve(anchor('wh','r'), anchor('smt','l')),
  'smt|man':    () => curve(anchor('smt','r'), anchor('man','l')),
  'man|ship':   () => curve(anchor('man','r'), anchor('ship','l')),
  'smt|qa':     () => curve(anchor('smt','r'), anchor('qa','l'))
};
const EDGE_LABEL = { 'ja|boss':'LINE', 'boss|sales':'LINE', 'sales|plan':'', 'plan|smt':'', 'boss|ai':'轉傳', 'ai|sales':'需求單', 'wh|smt':'料車', 'smt|man':'板子', 'man|ship':'成品' };
const STN = ['印錫膏','高速機','泛用機','回焊'];
const DS = [['插件',700],['測試',870],['組裝',1040],['包裝',1210]];
const LY0 = 262, LDY = 56, MY = 360;

function build2D() {
  const svg = $('#f2'); svg.innerHTML = ''; F2.svg = svg; F2.edges = {}; F2.nodes = {}; F2.lines = []; F2.ds = [];
  for (const k in EDGES) { const p = sel('path', { d:EDGES[k](), class:'ed' }); F2.edges[k] = p; }
  F2.elab = {};
  for (const k in EDGE_LABEL) { const p = F2.edges[k], L = p.getTotalLength(), pt = p.getPointAtLength(L/2);
    F2.elab[k] = sel('text', { x:pt.x, y:pt.y - 6, class:'el', 'text-anchor':'middle' }, null, EDGE_LABEL[k]); }
  for (const id in NODES) { const [x,y,w,h] = NODES[id]; const g = sel('g', { class:'nd' });
    sel('rect', { x, y, width:w, height:h, rx:8 }, g); sel('text', { x:x+12, y:y+25, class:'h' }, g, NODE_NAME[id]);
    const s = sel('text', { x:x+12, y:y+47, class:'s' }, g, ''); F2.nodes[id] = { g, s }; }
  F2.pk = sel('circle', { r:8, class:'pk', visibility:'hidden' });
  F2.pkl = sel('text', { class:'pkl', 'text-anchor':'middle', visibility:'hidden' }, null, '');
  sel('text', { x:16, y:LY0 - 14, class:'sec' }, null, 'SMT 四線（速度由機台決定，每線每小時 150 片）');
  for (let l = 1; l <= LINES; l++) {
    const y = LY0 + (l-1)*LDY, L = { stations:[], dots:[] };
    sel('text', { x:16, y:y+22, class:'ln' }, null, l + ' 線'); L.m = sel('text', { x:16, y:y+40, class:'lm' }, null, LINE_BASE[l].join(' '));
    const rail = sel('path', { d:'M86,'+(y+46)+' H560 C625,'+(y+46)+' 630,'+MY+' 700,'+MY, class:'rail' }); L.rail = rail; L.len = rail.getTotalLength();
    STN.forEach((n,i) => { const g = sel('g', { class:'st run' }); sel('rect', { x:86+i*92, y, width:84, height:34, rx:6 }, g);
      sel('text', { x:86+i*92+42, y:y+22, 'text-anchor':'middle' }, g, n); L.stations.push(g); });
    L.txt = sel('text', { x:462, y:y+22, class:'stt run' }, null, '運轉中');
    for (let k = 0; k < 5; k++) L.dots.push(sel('circle', { r:5, class:'dot' }));
    L.ph = (l*0.23) % 1; F2.lines.push(L);
  }
  const main = sel('path', { d:'M700,'+MY+' H1490', class:'rail' }); F2.main = main; F2.mlen = main.getTotalLength();
  DS.forEach(([n,x]) => { const g = sel('g', { class:'ds' }); sel('rect', { x, y:LY0, width:150, height:190, rx:8 }, g);
    sel('text', { x:x+12, y:LY0+26, class:'h' }, g, n); const s = sel('text', { x:x+12, y:LY0+50, class:'s' }, g, '有板可做'); F2.ds.push({ g, s, n }); });
  const sg = sel('g', { class:'ship' }); sel('rect', { x:1376, y:LY0, width:110, height:190, rx:8 }, sg);
  sel('text', { x:1431, y:LY0+26, class:'h', 'text-anchor':'middle' }, sg, '出貨');
  F2.ship = sel('text', { x:1431, y:LY0+76, class:'v', 'text-anchor':'middle' }, sg, '0');
  sel('text', { x:1431, y:LY0+98, class:'s', 'text-anchor':'middle' }, sg, '片｜今天 SMT 產出');
  F2.mdots = []; for (let k = 0; k < 14; k++) F2.mdots.push(sel('circle', { r:5, class:'dot' }));
  F2.mph = 0;
}
function edgeFor(a, b) {
  if (F2.edges[a+'|'+b]) return { p:F2.edges[a+'|'+b], rev:false, key:a+'|'+b };
  if (F2.edges[b+'|'+a]) return { p:F2.edges[b+'|'+a], rev:true, key:b+'|'+a };
  return null;
}
const STXT = { run:'運轉中', co:'換線中', mw:'等料', flt:'拋料／故障', rt:'例行停機' };

function render2D(t, dt) {
  const P = S.plan, E = S.events, f = P.f;
  const ns = nodeStateAt(E, t);
  for (const id in F2.nodes) { const n = F2.nodes[id]; let c = 'nd';
    if (ns.st[id]) c += ' ' + ns.st[id];
    if (id === 'ai' && (P.isBefore || !f.intake)) c += ' dim';
    n.g.setAttribute('class', c);
    n.s.textContent = ns.say[id] || (id === 'ai' ? (P.isBefore || !f.intake ? '現況沒有這一站' : '待命') : id.startsWith('j') ? '—' : '待命'); }
  if (F2.nodes.jb) F2.nodes.jb.s.textContent = ns.say.jb || '35%｜罰 2%／天';
  if (F2.nodes.jc && !ns.say.jc) F2.nodes.jc.s.textContent = '20%｜罰 1%／天';
  F2.elab['sales|plan'].textContent = (P.isBefore || (!f.gate && !f.intake)) ? '口頭' : '系統';
  F2.elab['plan|smt'].textContent = (P.isBefore || !f.gate) ? '口頭' : '看板＋時段';
  /* 連線：用過的變實線，正在傳的發亮 */
  for (const k in F2.edges) F2.edges[k].setAttribute('class', 'ed');
  let shown = false;
  for (const e of E) {
    if (!e.from || !e.to || e.from === e.to) continue;
    const ed = edgeFor(e.from, e.to); if (!ed) continue;
    if (t >= e.t + e.dur) ed.p.setAttribute('class', 'ed used');
    if (t >= e.t && t < e.t + Math.max(e.dur, 0.06)) {
      ed.p.setAttribute('class', 'ed live');
      const L = ed.p.getTotalLength(); let fr = (t - e.t) / Math.max(e.dur, 0.06); if (ed.rev) fr = 1 - fr;
      const pt = ed.p.getPointAtLength(L * fr);
      F2.pk.setAttribute('cx', pt.x); F2.pk.setAttribute('cy', pt.y); F2.pk.setAttribute('class', 'pk k-' + e.kind);
      F2.pkl.setAttribute('x', pt.x); F2.pkl.setAttribute('y', pt.y - 14); F2.pkl.textContent = e.kind + '｜' + e.fly; shown = true;
    }
  }
  F2.pk.setAttribute('visibility', shown ? 'visible' : 'hidden'); F2.pkl.setAttribute('visibility', shown ? 'visible' : 'hidden');
  /* 四條線 */
  let running = 0; const down = [];
  F2.lines.forEach((L, i) => { const l = i+1, s = lineState(P, l, t), m = lineModel(P, l, t), on = s.k === 'run';
    if (on) running++; else if (s.k !== 'rt') down.push(l + ' 線' + STXT[s.k]);
    L.m.textContent = m.join(' ') + (l === 3 && m[0] === 'C2' ? ' W0915' : ''); L.m.setAttribute('class', 'lm' + (m[0] === 'A1' ? ' a1' : ''));
    const lit = s.k === 'co' ? [0,1,2] : s.k === 'mw' ? [1,2] : s.k === 'flt' ? [2] : s.k === 'rt' ? [0,1,2,3] : [];
    L.stations.forEach((g,j) => g.setAttribute('class', 'st ' + (lit.includes(j) ? s.k : 'run')));
    const left = s.b ? Math.max(0, s.b - t) : 0;
    L.txt.setAttribute('class', 'stt ' + s.k); L.txt.textContent = STXT[s.k] + (s.b ? '  剩 ' + hhmm(left).replace(/^0/, '') : '');
    if (on && S.playing) L.ph = (L.ph + dt*0.12*S.speed) % 1;
    L.dots.forEach((d,k) => { const fr = (L.ph + k/5) % 1, pt = L.rail.getPointAtLength(L.len*fr);
      d.setAttribute('cx', pt.x); d.setAttribute('cy', pt.y); d.setAttribute('visibility', on || fr > 0.82 ? 'visible' : 'hidden');
      d.setAttribute('class', 'dot' + (m[0] === 'A1' ? ' a1' : '')); });
  });
  const sn = F2.nodes.smt;
  if (!ns.say.smt || t > (E.filter(e => e.say && e.say.smt).slice(-1)[0] || {t:0}).t + 0.6)
    sn.s.textContent = running === 4 ? '四線運轉' : down.length ? down.slice(0,2).join('、') + (down.length > 2 ? '…' : '') : running + ' 線運轉';
  if (down.length >= 2) sn.g.setAttribute('class', 'nd bad');
  const idle = running <= 2;
  F2.nodes.man.s.textContent = idle ? '人在等板（示意）' : (ns.say.man || '有板可做');
  if (idle) F2.nodes.man.g.setAttribute('class', 'nd warn');
  const qaOn = P.isBefore && t >= 14.0;
  F2.ds.forEach(d => { d.g.setAttribute('class', 'ds' + (idle ? ' idle' : '') + (qaOn && d.n === '測試' ? ' qa' : ''));
    d.s.textContent = qaOn && d.n === '測試' ? '重測 640 片' : (idle ? '人在等板' : '有板可做'); });
  if (S.playing) F2.mph = (F2.mph + dt*0.05*S.speed*Math.max(0.2, running/4)) % 1;
  const nd = Math.round(running/4*14);
  F2.mdots.forEach((d,k) => { const fr = (F2.mph + k/14) % 1, pt = F2.main.getPointAtLength(F2.mlen*fr);
    d.setAttribute('cx', pt.x); d.setAttribute('cy', pt.y); d.setAttribute('visibility', k < nd ? 'visible' : 'hidden'); });
  F2.ship.textContent = Math.round(dayMetrics(P, t).prod).toLocaleString('en-US');
}
