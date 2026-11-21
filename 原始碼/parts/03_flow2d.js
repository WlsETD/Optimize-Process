/* =====================================================================
   2D 部門流程（SVG）：比照參考檔，節點＋虛線連線＋流動的訊息封包，
   下方是四條 SMT 線（各四站）、後段四站與出貨計數。和 3D 同一個時鐘。
   ===================================================================== */
const NS = 'http://www.w3.org/2000/svg';
const F2 = {};
function sel(tag, attrs, parent, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text; (parent || F2.svg).appendChild(e); return e; }
/* 節點位置 [x, y, w, h] */
const COMPACT_NODES = {
  ja:[16,18,134,48], jb:[16,78,134,48], jc:[16,138,134,48],
  boss:[192,18,150,55], ai:[192,117,150,55],
  sales:[386,18,150,55], plan:[580,18,150,55], wh:[580,117,150,55],
  smt:[763,77,182,60], qa:[763,228,182,51], man:[548,228,158,51], ship:[354,228,147,51]
};
const WIDE_NODES = {
  ja:[16,16,152,46], jb:[16,70,152,46], jc:[16,124,152,46],
  boss:[210,16,164,51], ai:[210,94,164,51], sales:[422,16,174,51],
  plan:[650,16,171,51], wh:[650,91,171,52], smt:[867,55,194,55],
  qa:[1102,16,171,51], man:[1102,94,171,51], ship:[1297,55,126,55]
};
function anchor(id, side) { const [x,y,w,h] = F2.layout.nodes[id]; return side === 'r' ? [x+w, y+h/2] : side === 'l' ? [x, y+h/2] : side === 'b' ? [x+w/2, y+h] : [x+w/2, y]; }
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
  'sales|ja':   () => arc(anchor('sales','t'), anchor('ja','t'), -4),
  'sales|jc':   () => {
    const from = anchor('sales','b'), to = anchor('jc','r');
    const lane = F2.layout.wide ? 176 : 230;
    return 'M'+from[0]+','+from[1]+' C'+from[0]+','+lane+' '+(to[0]+40)+','+(lane-30)+' '+to[0]+','+to[1];
  },
  'plan|smt':   () => curve(anchor('plan','r'), anchor('smt','l')),
  'plan|wh':    () => 'M'+anchor('plan','b')[0]+','+anchor('plan','b')[1]+' V'+anchor('wh','t')[1],
  'wh|smt':     () => curve(anchor('wh','r'), anchor('smt','l')),
  'smt|man':    () => F2.layout.wide ? curve(anchor('smt','r'), anchor('man','l')) : curve(anchor('smt','l'), anchor('man','r')),
  'man|ship':   () => F2.layout.wide ? curve(anchor('man','r'), anchor('ship','l')) : curve(anchor('man','l'), anchor('ship','r')),
  'smt|qa':     () => F2.layout.wide ? curve(anchor('smt','r'), anchor('qa','l')) : curve(anchor('smt','b'), anchor('qa','t'))
};
const EDGE_LABEL = { 'ja|boss':'LINE', 'boss|sales':'LINE', 'sales|plan':'', 'plan|smt':'', 'boss|ai':'轉傳', 'ai|sales':'需求單', 'wh|smt':'料車', 'smt|man':'板子', 'man|ship':'成品' };
const STN = ['印錫膏','高速機','泛用機','回焊'];
const FLOW_LAYOUTS = {
  compact:{nodes:COMPACT_NODES, viewBox:'0 -8 960 540', y:321, laneGap:51, railY:413, railDrop:41,
    stationX:74, stationGap:70, stationWidth:64, stationHeight:34, statusX:360,
    bend:[424,463,470], rear:[503,590,677,764], rearWidth:77, shipX:851, end:945, rearHeight:190},
  wide:{wide:true, nodes:WIDE_NODES, viewBox:'0 -9 1440 402', y:211, laneGap:42, railY:295, railDrop:36,
    stationX:86, stationGap:88, stationWidth:80, stationHeight:31, statusX:445,
    bend:[540,590,604], rear:[658,807,956,1105], rearWidth:132, shipX:1254, end:1423, rearHeight:165},
};
const DOWNSTREAM = ['插件','測試','組裝','包裝'];

function build2D(name = 'compact') {
  const svg = $('#f2');
  if (!F2.svg && window.ResizeObserver) new ResizeObserver(([entry]) => {
    const {width, height} = entry.contentRect;
    if (!width || !height) return;
    const next = width >= 720 && width / height >= 2.7 ? 'wide' : 'compact';
    if (svg.dataset.layout === next) return;
    build2D(next);
    render2D(S.t, 0);
  }).observe(svg.parentElement);
  const layout = F2.layout = FLOW_LAYOUTS[name];
  const priorPhases = F2.lines?.map(line => line.ph) || [];
  const {nodes, y: firstLane, railY, rear, shipX} = layout;
  const shipWidth = layout.end - shipX;
  svg.dataset.layout = name; svg.setAttribute('viewBox', layout.viewBox);
  svg.innerHTML = ''; F2.svg = svg; F2.edges = {}; F2.nodes = {}; F2.lines = []; F2.ds = [];
  for (const k in EDGES) { const p = sel('path', { d:EDGES[k](), class:'ed' }); F2.edges[k] = p; }
  F2.elab = {};
  for (const k in EDGE_LABEL) { const p = F2.edges[k], L = p.getTotalLength(), pt = p.getPointAtLength(L/2);
    F2.elab[k] = sel('text', { x:pt.x, y:pt.y - 6, class:'el', 'text-anchor':'middle' }, null, EDGE_LABEL[k]); }
  for (const id in nodes) { const [x,y,w,h] = nodes[id]; const g = sel('g', { class:'nd' });
    sel('rect', { x, y, width:w, height:h, rx:8 }, g); sel('text', { x:x+12, y:y+21, class:'h' }, g, NODE_NAME[id]);
    const s = sel('text', { x:x+12, y:y+40, class:'s' }, g, ''); F2.nodes[id] = { g, s }; }
  F2.whS1 = sel('text', { x:nodes.wh[0]+4, y:nodes.wh[1]+nodes.wh[3]+18, class:'whs' }, null, '');
  F2.whS2 = sel('text', { x:nodes.wh[0]+4, y:nodes.wh[1]+nodes.wh[3]+34, class:'whs' }, null, '');
  F2.pk = sel('circle', { r:8, class:'pk', visibility:'hidden' });
  F2.pkl = sel('text', { class:'pkl', 'text-anchor':'middle', visibility:'hidden' }, null, '');
  sel('text', { x:16, y:firstLane - 14, class:'sec' }, null, 'SMT 四線（速度由機台決定，每線每小時 150 片）');
  for (let l = 1; l <= LINES; l++) {
    const y = firstLane + (l-1)*layout.laneGap, L = { stations:[], dots:[] };
    sel('text', { x:16, y:y+22, class:'ln' }, null, l + ' 線'); L.m = sel('text', { x:16, y:y+40, class:'lm' }, null, LINE_BASE[l].join(' '));
    const railStartY = y + layout.railDrop, [bendStart, bendControl, bendEnd] = layout.bend;
    const rail = sel('path', { d:'M'+layout.stationX+','+railStartY+' H'+bendStart+' C'+bendControl+','+railStartY+' '+bendEnd+','+railY+' '+rear[0]+','+railY, class:'rail' });
    L.rail = rail; L.len = rail.getTotalLength();
    STN.forEach((n,i) => {
      const g = sel('g', {class:'st run'}), x = layout.stationX + i * layout.stationGap;
      sel('rect', {x, y, width:layout.stationWidth, height:layout.stationHeight, rx:6}, g);
      sel('text', {x:x+layout.stationWidth/2, y:y+22, 'text-anchor':'middle'}, g, n); L.stations.push(g);
    });
    L.txt = sel('text', {x:layout.statusX, y:y+22, class:'stt run'}, null, '運轉中');
    for (let k = 0; k < 5; k++) L.dots.push(sel('circle', { r:5, class:'dot' }));
    L.ph = priorPhases[l-1] ?? (l*0.23) % 1; F2.lines.push(L);
  }
  const main = sel('path', { d:'M'+rear[0]+','+railY+' H'+layout.end, class:'rail' }); F2.main = main; F2.mlen = main.getTotalLength();
  DOWNSTREAM.forEach((n,i) => {
    const x = rear[i], g = sel('g', {class:'ds'});
    sel('rect', {x, y:firstLane, width:layout.rearWidth, height:layout.rearHeight, rx:8}, g);
    sel('text', {x:x+12, y:firstLane+26, class:'h'}, g, n);
    const s = sel('text', {x:x+12, y:firstLane+50, class:'s'}, g, '有板可做'); F2.ds.push({g, s, n});
  });
  const sg = sel('g', {class:'ship'}), shipCenter = shipX + shipWidth / 2;
  sel('rect', {x:shipX, y:firstLane, width:shipWidth, height:layout.rearHeight, rx:8}, sg);
  sel('text', {x:shipCenter, y:firstLane+26, class:'h', 'text-anchor':'middle'}, sg, '出貨');
  F2.ship = sel('text', {x:shipCenter, y:firstLane+67, class:'v', 'text-anchor':'middle'}, sg, '0');
  sel('text', {x:shipCenter, y:firstLane+89, class:'s', 'text-anchor':'middle'}, sg, '片｜SMT 產出');
  F2.mdots = []; for (let k = 0; k < 14; k++) F2.mdots.push(sel('circle', { r:5, class:'dot' }));
  F2.mph ??= 0;
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
    if (breakAt(t) && (id === 'boss' || id === 'sales' || id === 'plan')) c += ' dim';
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
      F2.pkl.setAttribute('x', pt.x); F2.pkl.setAttribute('y', pt.y < 30 ? pt.y + 23 : pt.y - 14); F2.pkl.textContent = e.kind + '｜' + e.fly; shown = true;
    }
  }
  F2.pk.setAttribute('visibility', shown ? 'visible' : 'hidden'); F2.pkl.setAttribute('visibility', shown ? 'visible' : 'hidden');
  /* 四條線 */
  let running = 0; const down = [];
  F2.lines.forEach((L, i) => { const l = i+1, s = lineState(P, l, t), m = lineModel(P, l, t), on = s.k === 'run';
    if (on) running++; else if (s.k !== 'rt') down.push(l + ' 線' + STXT[s.k]);
    L.m.textContent = m.slice(0, 2).join(' ') + (DAY.WO[l] && !m[2] ? ' ' + DAY.WO[l] : ''); L.m.setAttribute('class', 'lm' + (m[2] ? ' a1' : ''));
    const lit = s.k === 'co' ? [0,1,2] : s.k === 'mw' ? [1,2] : s.k === 'flt' ? [2] : s.k === 'rt' ? [0,1,2,3] : [];
    L.stations.forEach((g,j) => g.setAttribute('class', 'st ' + (lit.includes(j) ? s.k : 'run')));
    const left = s.b ? Math.max(0, s.b - t) : 0;
    L.txt.setAttribute('class', 'stt ' + s.k); L.txt.textContent = STXT[s.k] + (s.b ? '  剩 ' + hhmm(left).replace(/^0/, '') : '');
    if (on && S.playing) L.ph = (L.ph + dt*0.12*S.speed) % 1;
    L.dots.forEach((d,k) => { const fr = (L.ph + k/5) % 1, pt = L.rail.getPointAtLength(L.len*fr);
      d.setAttribute('cx', pt.x); d.setAttribute('cy', pt.y); d.setAttribute('visibility', on || fr > 0.82 ? 'visible' : 'hidden');
      d.setAttribute('class', 'dot' + (m[2] ? ' a1' : '')); });
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
  /* 倉庫：月度數字（和功能頁的倉庫卡同一組計算），導入前看九月、導入後看目前組合 */
  const W = P.isBefore ? S.whs0 : S.whs;
  if (W && F2.whS1) {
    const kitOn = !P.isBefore && f.kit, selOn = !P.isBefore && f.kitsel && !f.kit, etaOn = !P.isBefore && f.eta, n = (S.whs && S.whs0) ? whNote(S.whs0, S.whs) : null;
    if (!ns.say.wh) F2.nodes.wh.s.textContent = kitOn ? '齊套：料齊才換線' : selOn ? '插單換線才齊套' : etaOn ? '先回報新料到料日' : '依工單備料';
    F2.whS1.textContent = '月：找料補料 ' + f1(W.find) + ' h' + (W.prep > 0 ? '｜備料 ' + f1(W.prep) + ' h' : '') + (W.rep > 0 ? '｜回報 ' + f1(W.rep) + ' h' : '') + '｜退料 ' + f1(W.swap) + ' h';
    F2.whS2.textContent = P.isBefore ? '倉庫人時 ' + f1(W.tot) + '／月（人數我猜 ' + LABOR.whPeople + ' 人）'
      : '倉庫 +' + f1(n.inc) + ' −' + f1(n.dec) + '＝淨 ' + hh(n.net) + ' 人時／月' + (n.inc > 0 ? '（⚠ 排不下就違反不加人）' : '');
    F2.whS2.setAttribute('class', 'whs' + (!P.isBefore && n.inc > 0 ? ' warn' : ''));
  }
}
