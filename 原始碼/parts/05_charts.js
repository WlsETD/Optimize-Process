/* =====================================================================
   圖表：十二個月歷史 ＋ 三個月分岔折線圖、停機工時組成橫條圖
   配色取自已驗證的類別色盤（slot 1/2/3），淺色模式的 aqua 低於 3:1，
   因此一律附直接標籤與資料表檢視。
   ===================================================================== */
const CH = { s1:'--series-1', s2:'--series-2', s3:'--series-3' };
const FC_EV = [0, 2, 4, 6].map(x => SEP.s[1] + x);   // 插單次數延伸：每月 +2（趨勢 6→8→10→12）【我猜的】；起點＝基準月
const FC_LABEL = [CM.name + (CUR ? '（' + CM.tag + '）' : '（實際）'), '+1 月', '+2 月', '+3 月'];

const METRICS = [
  { k:'ship',   name:'出貨',        unit:'千片', hist:i=>SALES[i][2], dec:1, target:TARGET.ship },
  { k:'otd',    name:'準時交貨率',  unit:'%',   hist:i=>SALES[i][3], dec:1, pct:true, target:TARGET.otd },
  { k:'cAll',   name:'客訴合計',    unit:'件',   hist:i=>SALES[i][6], dec:1, lowerBetter:true },
  { k:'co',     name:'換線次數',    unit:'次',   hist:i=>FLOOR[i][4], dec:0, lowerBetter:true },
  { k:'util',   name:'SMT 稼動率',  unit:'%',   hist:i=>FLOOR[i][2]/FLOOR[i][1], dec:1, pct:true },
  { k:'retest', name:'重測比率',    unit:'%',   hist:i=>SALES[i][5], dec:2, pct:true, lowerBetter:true },
  { k:'ot',     name:'加班',        unit:'h',   hist:i=>SALES[i][4], dec:0, lowerBetter:true, cap:OT_CAP }
];

function forecast(metricKey, ids, strength) {
  return FC_EV.map(ev => {
    const s = scenario(ids, strength, ev);
    const r = s.rows.find(x => x.k === metricKey);
    return r ? r.after : null;
  });
}

function drawTrend(cv, tip, mKey, ids, strength, hoverX) {
  const M = METRICS.find(m => m.k === mKey) || METRICS[0];
  const { ctx, w:W, h:H } = fitCanvas(cv);
  const sur = ink('--surface-1'), gl = ink('--grid'), ax = ink('--axis'),
        tx = ink('--text-primary'), tx2 = ink('--text-secondary'), mu = ink('--muted');
  const c1 = ink(CH.s1), c2 = ink(CH.s2), c3 = ink(CH.s3);
  ctx.clearRect(0,0,W,H); ctx.fillStyle = sur; ctx.fillRect(0,0,W,H);

  const hist = MONTHS.map((_,i) => M.hist(i));
  const noAdopt = forecast(M.k, [], 1);
  const has = ids.length > 0;                            // 沒導入任何策略：不畫「導入」那條
  const adopt   = has ? forecast(M.k, ids, strength) : noAdopt.map(() => null);
  const nH = hist.length, nF = FC_EV.length - 1;          // 分岔多出 3 點
  const N = nH + nF;

  const all = hist.concat(noAdopt, adopt).filter(v => v != null);
  if (M.target != null) all.push(M.target);
  let lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
  const pad = (hi - lo) * 0.18 || (hi * 0.1 || 1);
  lo = M.pct ? Math.max(0, lo - pad) : Math.max(0, lo - pad); hi = hi + pad;

  const padL = 46, padR = 86, padT = 16, padB = 34;
  const X = i => padL + (W - padL - padR) * (i / (N - 1));
  const Y = v => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
  const fmt = v => M.pct ? (v*100).toFixed(M.dec)+'%' : v.toFixed(M.dec);

  /* 格線與刻度 */
  ctx.font = '10px ui-sans-serif,system-ui,sans-serif'; ctx.textAlign = 'right';
  for (let g = 0; g <= 4; g++) {
    const v = lo + (hi-lo)*g/4, y = Y(v);
    ctx.strokeStyle = gl; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle = mu; ctx.fillText(fmt(v), padL - 6, y + 3);
  }
  /* 分岔分隔線 */
  ctx.strokeStyle = ax; ctx.lineWidth = 1; ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(X(nH-1), padT); ctx.lineTo(X(nH-1), H-padB); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = mu; ctx.textAlign = 'center'; ctx.font = '9px ui-sans-serif,system-ui,sans-serif';
  ctx.fillText('↓ 往後三個月（插單每月 +2 次【我猜的】）', X(nH-1) + 42, padT + 10);

  /* 目標線 */
  if (M.target != null) {
    ctx.strokeStyle = mu; ctx.lineWidth = 1; ctx.setLineDash([5,4]);
    ctx.beginPath(); ctx.moveTo(padL, Y(M.target)); ctx.lineTo(W-padR, Y(M.target)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = mu; ctx.textAlign = 'left'; ctx.font = '9px ui-sans-serif,system-ui,sans-serif';
    ctx.fillText('目標 ' + fmt(M.target), W - padR + 4, Y(M.target) - 4);
  }
  if (M.cap != null && M.cap >= lo && M.cap <= hi) {
    ctx.strokeStyle = ST.fault.hex; ctx.lineWidth = 1; ctx.setLineDash([2,3]); ctx.globalAlpha = .7;
    ctx.beginPath(); ctx.moveTo(padL, Y(M.cap)); ctx.lineTo(W-padR, Y(M.cap)); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = ST.fault.hex; ctx.textAlign = 'left'; ctx.font = '9px ui-sans-serif,system-ui,sans-serif';
    ctx.fillText('上限 ' + fmt(M.cap), W - padR + 4, Y(M.cap) + 10);
  }

  /* 月份標籤 */
  ctx.fillStyle = mu; ctx.textAlign = 'center'; ctx.font = '9px ui-sans-serif,system-ui,sans-serif';
  MONTHS.forEach((m,i) => { if (i % 2 === 0 || i === nH-1) ctx.fillText(m.slice(5) + (CUR && i === nH-1 ? '*' : ''), X(i), H - 18); });
  if (CUR) { ctx.fillStyle = ink('--warn'); ctx.fillText('*' + CM.tag, X(nH-1), H - 6); ctx.fillStyle = mu; }
  for (let j = 1; j <= nF; j++) ctx.fillText('+'+j, X(nH-1+j), H - 18);
  ctx.fillText('月', padL - 24, H - 18);

  const line = (pts, color, width) => {
    ctx.strokeStyle = color; ctx.lineWidth = width || 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p,k) => { if (p.v == null) return; k === 0 ? ctx.moveTo(p.x,Y(p.v)) : ctx.lineTo(p.x,Y(p.v)); });
    ctx.stroke();
  };
  const dot = (x,v,color,r) => {
    ctx.fillStyle = ink('--surface-1'); ctx.beginPath(); ctx.arc(x,Y(v),(r||4)+1.6,0,7); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x,Y(v),r||4,0,7); ctx.fill();
  };

  /* 歷史實際 */
  line(hist.map((v,i)=>({x:X(i),v})), c1, 2);
  hist.forEach((v,i) => { if (i === nH-1) dot(X(i),v,c1,4.5); });
  /* 兩條分岔 */
  const fx = j => X(nH-1+j);
  ctx.setLineDash([5,4]);
  line(noAdopt.map((v,j)=>({x:fx(j),v})), c2, 2);
  if (has) line(adopt.map((v,j)=>({x:fx(j),v})),   c3, 2);
  ctx.setLineDash([]);
  noAdopt.forEach((v,j)=>{ if(v!=null&&j>0) dot(fx(j),v,c2,3.5); });
  adopt.forEach((v,j)=>{ if(v!=null&&j>0) dot(fx(j),v,c3,3.5); });

  /* 直接標籤（淺色模式 aqua 低對比的補償措施） */
  ctx.font = '600 10px ui-sans-serif,system-ui,sans-serif'; ctx.textAlign = 'left';
  const lastN = noAdopt[nF], lastA = adopt[nF];
  if (lastA != null) { ctx.fillStyle = tx;  ctx.fillText('導入 '   + fmt(lastA), fx(nF)+7, Y(lastA)+3); }
  if (lastN != null) { ctx.fillStyle = tx;  ctx.fillText('不導入 ' + fmt(lastN), fx(nF)+7, Y(lastN)+3); }
  ctx.fillStyle = tx; ctx.textAlign = 'right';
  ctx.fillText(CUR ? '實際＋' + CM.tag : '歷史實際', X(nH-1)-8, Y(hist[nH-1]) - 9);

  /* hover */
  if (hoverX != null) {
    let bi = 0, bd = 1e9;
    for (let i = 0; i < N; i++) { const d = Math.abs(X(i)-hoverX); if (d < bd) { bd = d; bi = i; } }
    ctx.strokeStyle = ax; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(bi),padT); ctx.lineTo(X(bi),H-padB); ctx.stroke();
    const isH = bi <= nH-1, j = bi - (nH-1);
    const rows = isH
      ? [['歷史實際', hist[bi], c1]]
      : [['不導入（推算）', noAdopt[j], c2]].concat(has ? [['導入（模擬）', adopt[j], c3]] : []);
    if (!isH) rows.unshift(['插單次數', FC_EV[j], null]);
    tip.innerHTML = '<b>' + (isH ? MONTHS[bi] : FC_LABEL[j]) + '</b>'
      + rows.map(r => '<div class="tr">' + (r[2] ? '<i style="background:'+r[2]+'"></i>' : '<i class="no"></i>')
        + r[0] + '<span>' + (r[1] == null ? '—' : (r[0]==='插單次數' ? r[1]+' 次' : fmt(r[1]))) + '</span></div>').join('');
    tip.style.display = 'block';
    const tw = tip.offsetWidth || 160;
    tip.style.left = Math.max(4, Math.min(W - tw - 4, X(bi) - tw/2)) + 'px';
    tip.style.top = (padT + 4) + 'px';
  } else tip.style.display = 'none';
}

/* 停機工時組成：導入前 vs 導入後，橫條分組 */
function drawStops(cv, sc, has) {
  const { ctx, w:W, h:H } = fitCanvas(cv);
  const sur = ink('--surface-1'), gl = ink('--grid'), tx = ink('--text-primary'), mu = ink('--muted');
  const c1 = ink(CH.s1), c2 = ink(CH.s2);
  ctx.clearRect(0,0,W,H); ctx.fillStyle = sur; ctx.fillRect(0,0,W,H);
  const get = k => sc.rows.find(r => r.k === k);
  const rows = [
    { n:'正常運轉',     b:get('run').before,    a:get('run').after },
    { n:'換線停機',     b:get('coH').before,    a:get('coH').after },
    { n:'等料停機',     b:get('waitH').before,  a:get('waitH').after },
    { n:'拋料與故障',   b:get('faultH').before, a:get('faultH').after }
  ];
  const max = Math.max.apply(null, rows.map(r => has ? Math.max(r.b, r.a) : r.b)) * 1.18;
  const padL = 74, padR = 58, padT = 22, padB = 14;
  const rowH = (H - padT - padB) / rows.length;
  const bh = Math.min(11, rowH * 0.3);
  const X = v => padL + (W - padL - padR) * (v / max);

  ctx.font = '10px ui-sans-serif,system-ui,sans-serif';
  ctx.fillStyle = mu; ctx.textAlign = 'left';
  ctx.fillText('小時／月', padL, 12);
  rows.forEach((r, i) => {
    const y = padT + rowH*i + rowH/2;
    ctx.fillStyle = tx; ctx.textAlign = 'right'; ctx.font = '11px ui-sans-serif,system-ui,sans-serif';
    ctx.fillText(r.n, padL - 8, y + 3);
    (has ? [['b',c1,-1],['a',c2,1]] : [['b',c1,0]]).forEach(([k,col,dir]) => {
      const v = r[k], yy = y + dir*(bh/2 + 1) - bh/2;      // 兩條之間留 2px 間隙
      ctx.fillStyle = col;
      roundRect(ctx, padL, yy, Math.max(2, X(v)-padL), bh, 3); ctx.fill();
      ctx.fillStyle = tx; ctx.textAlign = 'left'; ctx.font = '10px ui-sans-serif,system-ui,sans-serif';
      ctx.fillText(v.toFixed(0), X(v) + 5, yy + bh - 1.5);
    });
    ctx.strokeStyle = gl; ctx.lineWidth = 1;
    if (i) { ctx.beginPath(); ctx.moveTo(padL, padT + rowH*i); ctx.lineTo(W-padR, padT + rowH*i); ctx.stroke(); }
  });
  ctx.strokeStyle = ink('--axis'); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, H - padB); ctx.stroke();
}

/* 十二個月：反推人工站時數（推算）vs 全廠加班（資料1）；同單位 h／月、單一座標軸 */
function otCmpData() {
  const std = BASE.stdSec.ins + BASE.stdSec.test + BASE.stdSec.asm + BASE.stdSec.pack;
  return MONTHS.map((m,i) => ({ m, der: SALES[i][2]*1000*std/3600/FLOOR[i][0], ot: SALES[i][4] }));
}
function drawOtCmp(cv) {
  const { ctx, w:W, h:H } = fitCanvas(cv);
  const sur = ink('--surface-1'), gl = ink('--grid'), ax = ink('--axis'), tx = ink('--text-primary'), mu = ink('--muted');
  const c1 = ink(CH.s1), c2 = ink(CH.s2);
  ctx.clearRect(0,0,W,H); ctx.fillStyle = sur; ctx.fillRect(0,0,W,H);
  const D = otCmpData(), N = D.length;
  const hi = 5500, lo = 0;
  const padL = 46, padR = 118, padT = 18, padB = 28;
  const X = i => padL + (W - padL - padR) * (i / (N - 1));
  const Y = v => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
  ctx.font = '10px ui-sans-serif,system-ui,sans-serif';
  for (let g = 0; g <= 5; g++) {
    const v = g * 1000, y = Y(v);
    ctx.strokeStyle = gl; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle = mu; ctx.textAlign = 'right'; ctx.fillText(v.toLocaleString(), padL - 6, y + 3);
  }
  ctx.fillStyle = mu; ctx.textAlign = 'left'; ctx.fillText('小時／月', 4, 10);
  ctx.textAlign = 'center';
  D.forEach((d,i) => { if (i % 2 === 0 || i === N-1) { ctx.fillStyle = mu; ctx.fillText(d.m.slice(2) + (CUR && i === N-1 ? '*' : ''), X(i), H - 10); } });
  ctx.strokeStyle = ax; ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(W - padR, Y(0)); ctx.stroke();
  [['der', c1, '反推人工站時數（推算）'], ['ot', c2, '全廠加班（資料1）']].forEach(([k, col, name]) => {
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
    D.forEach((d,i) => { const x = X(i), y = Y(d[k]); i ? ctx.lineTo(x,y) : ctx.moveTo(x,y); }); ctx.stroke();
    D.forEach((d,i) => { ctx.fillStyle = col; ctx.strokeStyle = sur; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(i), Y(d[k]), 3.5, 0, 6.2832); ctx.fill(); ctx.stroke(); });
    const last = D[N-1], y = Y(last[k]);
    ctx.fillStyle = tx; ctx.textAlign = 'left'; ctx.font = '11px ui-sans-serif,system-ui,sans-serif';
    ctx.fillText(Math.round(last[k]).toLocaleString() + ' h', X(N-1) + 9, y + (k === 'der' ? -2 : 12));
    ctx.font = '10px ui-sans-serif,system-ui,sans-serif'; ctx.fillStyle = mu;
    ctx.fillText(k === 'der' ? '人工站（推算）' : '全廠加班', X(N-1) + 9, y + (k === 'der' ? -14 : 24));
  });
}
