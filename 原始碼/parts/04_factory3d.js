/* =====================================================================
   3D 廠房（three.js r128，已內嵌，離線可用）
   比照參考檔的造型：Lambert 材質、半球光＋方向光、文字看板 Sprite、自動運鏡。
   擴充：客戶三家、老闆、AI 收件、業務、生管＋排程白板、倉庫、四條 SMT、
         後段四站、品保、出貨碼頭與貨車。
   ===================================================================== */
const F3 = { ok:false, lines:[], T:0, goal:null };
const LS = (window.innerWidth || 1000) < 600 ? 1.1 : 1.5;
const LZ = [0, 4.4, 8.8, 13.2];                       // 四條線的 z
const P3 = {                                            // 部門在 3D 的位置（訊息飛行端點）
  ja:[-39,2.4,0], jb:[-39,2.4,4.4], jc:[-39,2.4,8.8], boss:[-31.5,2.4,1.6], ai:[-31.5,2.4,7.4],
  sales:[-24,2.4,1.6], plan:[-17,2.4,8.6], wh:[-8,2.4,6.6], smt:[-2.6,2.4,6.6],
  qa:[26.5,2.4,3.0], man:[30.5,2.4,9.6], ship:[41,2.4,6.6]
};
function f3Fail(msg) {
  const host = $('#f3');
  host.insertAdjacentHTML('afterbegin', '<p class="fail">' + msg + '下方的 2D 流程和時間軸照常可以看。</p>');
  host.style.minHeight = '0'; host.querySelectorAll('.hud').forEach(h => h.hidden = true);
}
function drawLabel(text, bg, fg) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  const font = '700 60px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif';
  g.font = font; const w = Math.ceil(g.measureText(text).width) + 56; c.width = w; c.height = 104; g.font = font;
  g.fillStyle = bg; g.beginPath(); if (g.roundRect) g.roundRect(0,4,w,96,26); else g.rect(0,4,w,96); g.fill();
  g.fillStyle = fg || '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w/2, 54); return c;
}
function label(text, bg, h, fg) {
  h *= LS; const c = drawLabel(text, bg, fg), t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:t, depthTest:false, transparent:true }));
  s.scale.set(h * c.width / 104, h, 1); s.renderOrder = 10; s.userData = { h, bg, fg, text }; return s;
}
function relabel(s, text, bg) {
  if (s.userData.text === text && (!bg || s.userData.bg === bg)) return;
  s.userData.text = text; if (bg) s.userData.bg = bg;
  const c = drawLabel(text, s.userData.bg, s.userData.fg); s.material.map.dispose();
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; s.material.map = t; s.material.needsUpdate = true;
  s.scale.set(s.userData.h * c.width / 104, s.userData.h, 1);
}

function init3D() {
  if (typeof THREE === 'undefined') return f3Fail('3D 元件沒有載入。');
  const host = $('#f3'); let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias:true }); } catch (e) { return f3Fail('這個裝置不支援 3D 繪圖。'); }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); host.insertBefore(renderer.domElement, host.firstChild);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, 2, 0.1, 600);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x77808c, 0.66));
  const sun = new THREE.DirectionalLight(0xffffff, 0.45); sun.position.set(20, 40, 25); scene.add(sun);
  const M = c => new THREE.MeshLambertMaterial({ color:c });
  const mat = { body:M(0xe6eaee), base:M(0x56616d), dark:M(0x27303a), metal:M(0xa3adb8), conv:M(0x39434e),
    board:M(0x2e9e62), a1:M(0xd99a14), blue:M(0x2a78d6), gray:M(0x8792a0), orange:M(0xeb6834), teal:M(0x1b9c85),
    skin:M(0xf0c9a4), floor:M(0xcfd5dc), office:M(0xbfcad6), dock:M(0xc3ccd6), carton:M(0xc79a62), white:M(0xf7f9fb),
    line:M(0x06c755), wood:M(0xb08a5a), red:M(0xb4282e), navy:M(0x0f5e8c), purple:M(0x7a5bc7),
    screen:new THREE.MeshBasicMaterial({ color:0x35d07f }),
    glass:new THREE.MeshLambertMaterial({ color:0x8fc1ee, transparent:true, opacity:0.28 }),
    glow:new THREE.MeshBasicMaterial({ color:0xff8a2a }) };
  const G = {}, geo = (w,h,d) => { const k = w+'_'+h+'_'+d; return G[k] || (G[k] = new THREE.BoxGeometry(w,h,d)); };
  const box = (w,h,d,m,x,y,z,p) => { const o = new THREE.Mesh(geo(w,h,d), m); o.position.set(x,y,z); (p||scene).add(o); return o; };
  /* 靜態方塊：Blender 廠房模型載入後會隱藏，換成 factory_kit.glb 的細節 */
  const STATIC = [], sbox = (...a) => { const o = box(...a); STATIC.push(o); return o; };
  const cyl = (r,h,m,x,y,z,p,seg) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,seg||14), m); o.position.set(x,y,z); (p||scene).add(o); return o; };
  const person = (m,x,z,p) => { const g = new THREE.Group(); cyl(0.2,0.95,m,0,0.78,0,g); cyl(0.13,0.5,mat.dark,0,0.25,0,g,8);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.17,12,10), mat.skin); h.position.y = 1.45; g.add(h); g.position.set(x,0,z); (p||scene).add(g); return g; };
  const cart = (reelMat,x,z) => { const g = new THREE.Group(); box(1.5,0.55,0.55,mat.metal,0,0.5,0,g); box(1.5,0.06,0.6,mat.dark,0,0.2,0,g);
    g.userData.reels = []; for (let i=0;i<7;i++){ const r = cyl(0.2,0.05,reelMat,-0.6+i*0.2,0.98,0,g,16); r.rotation.z = Math.PI/2; g.userData.reels.push(r); }
    [[-0.6,-0.22],[0.6,-0.22],[-0.6,0.22],[0.6,0.22]].forEach(([a,b]) => { const w = cyl(0.09,0.06,mat.dark,a,0.09,b,g,10); w.rotation.x = Math.PI/2; });
    g.position.set(x,0,z); scene.add(g); return g; };
  const desk = (x,z) => { sbox(1.9,0.08,0.9,mat.wood,x,0.76,z); [[-0.85,-0.38],[0.85,-0.38],[-0.85,0.38],[0.85,0.38]].forEach(([a,b]) => sbox(0.06,0.74,0.06,mat.dark,x+a,0.37,z+b));
    sbox(0.8,0.5,0.05,mat.dark,x,1.1,z-0.25); return sbox(0.72,0.42,0.02,mat.screen,x,1.1,z-0.22); };
  const phone = p => box(0.12,0.22,0.03,mat.dark,0.25,1.15,0.18,p);

  /* ---- 地板與分區 ---- */
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(96,26), mat.floor); fl.rotation.x = -Math.PI/2; fl.position.set(4,0,6.6); scene.add(fl);
  const grid = new THREE.GridHelper(96, 48, 0xb8c1cb, 0xc8d0d8); grid.position.set(4,0.01,6.6); grid.scale.z = 26/96; scene.add(grid);
  const of = new THREE.Mesh(new THREE.PlaneGeometry(26,18), mat.office); of.rotation.x = -Math.PI/2; of.position.set(-24.5,0.02,6.6); scene.add(of);
  const dk = new THREE.Mesh(new THREE.PlaneGeometry(13,18), mat.dock); dk.rotation.x = -Math.PI/2; dk.position.set(43.5,0.02,6.6); scene.add(dk);
  sbox(0.08,1.4,18,mat.glass,-11.5,0.7,6.6);
  const zl = (t,x,z) => { const s = label(t,'#39434e',0.9); s.position.set(x,4.6,z); scene.add(s); };
  zl('辦公室',-24.5,-2.2); zl('倉庫',-8,-2.2); zl('SMT 四線',8.3,-2.6); zl('後段人工站',28.5,-2.2); zl('出貨',43.5,-2.2);

  /* ---- 客戶（門外） ---- */
  sbox(0.25,2.6,0.25,mat.base,-37.2,1.3,-1.2); sbox(0.25,2.6,0.25,mat.base,-37.2,1.3,10.2); sbox(0.25,0.25,11.6,mat.base,-37.2,2.6,4.5);
  F3.clients = {};
  [['ja','客戶甲',0,mat.gray],['jb','客戶乙',4.4,mat.purple],['jc','客戶丙',8.8,mat.teal]].forEach(([id,n,z,m]) => {
    const p = person(m,-39.4,z); phone(p); const l = label(n,'#56616d',0.72); l.position.set(-39.4,2.6,z); scene.add(l);
    F3.clients[id] = { p, l };
  });
  /* ---- 辦公室：老闆、AI、業務、生管 ---- */
  F3.bossScreen = desk(-31.5,1.6); F3.bossP = person(mat.dark,-31.5,2.4);
  const bl = label('老闆','#14202b',0.8); bl.position.set(-31.5,3.3,1.6); scene.add(bl);
  F3.ai = new THREE.Group(); scene.add(F3.ai);
  box(0.9,1.4,0.7,mat.body,-31.5,0.7,7.4,F3.ai); F3.aiScreen = box(0.7,0.45,0.02,mat.screen,-31.5,1.15,7.76,F3.ai);
  F3.aiLab = label('AI 收件（官方帳號）','#1b9c85',0.7); F3.aiLab.position.set(-31.5,2.9,7.4); scene.add(F3.aiLab);
  F3.salesScreen = desk(-24,1.6); F3.salesP = person(mat.blue,-24,2.4);
  const sl = label('業務','#0f5e8c',0.8); sl.position.set(-24,3.3,1.6); scene.add(sl);
  F3.planScreen = desk(-17,8.6); F3.planP = person(mat.orange,-17,9.4);
  const pl = label('生管','#0f5e8c',0.8); pl.position.set(-17,3.3,8.6); scene.add(pl);
  F3.board = new THREE.Group(); scene.add(F3.board);
  box(2.8,1.5,0.08,mat.white,-17,1.55,11.6,F3.board); box(0.06,0.8,0.06,mat.dark,-18.3,0.4,11.6,F3.board); box(0.06,0.8,0.06,mat.dark,-15.7,0.4,11.6,F3.board);
  for (let i=0;i<3;i++) box(2.4,0.18,0.02,i===2?mat.a1:mat.blue,-17,2.0-i*0.36,11.55,F3.board);
  F3.boardLab = label('插單時段 15:00','#16794a',0.62); F3.boardLab.position.set(-17,2.75,11.6); scene.add(F3.boardLab);
  /* ---- 倉庫 ---- */
  for (let i=0;i<4;i++) { sbox(0.6,2.2,3,mat.metal,-8,1.1,LZ[i]); for (let k=0;k<3;k++) sbox(0.5,0.35,2.6,k%2?mat.carton:mat.blue,-8,0.45+k*0.7,LZ[i]); }
  F3.whStaff = person(mat.orange,-6.4,6.6); F3.whBox = box(0.4,0.3,0.4,mat.carton,0,1.15,0.32,F3.whStaff); F3.whBox.visible = false;
  F3.whCart = cart(mat.a1,-6.2,10.6); F3.whCart.visible = false;
  /* 齊套區（導入齊套才出現）：四台點齊的料車放在料架之間，綠色吊牌＝已點齊 */
  const tagM = new THREE.MeshBasicMaterial({ color:0x25c26e });
  F3.kitCarts = LZ.map(z => { const c = cart(mat.teal,-9.9,z+2.2); box(0.32,0.32,0.04,tagM,0.6,1.35,0.3,c); c.visible = false; return c; });
  F3.kitLab = label('齊套區：料齊才換線','#16794a',0.6); F3.kitLab.position.set(-9.9,3.1,8.8); F3.kitLab.visible = false; scene.add(F3.kitLab);
  F3.whLab = label('倉庫人員','#a86400',0.5); scene.add(F3.whLab);
  F3.whStat = label('倉庫','#39434e',0.5); F3.whStat.position.set(-8,3.5,-2.2); scene.add(F3.whStat);
  /* SMT 課長站在線頭 */
  F3.chief = person(mat.navy,-2.6,6.6);
  const cl = label('SMT 課長','#0f5e8c',0.55); cl.position.set(-2.6,2.3,6.6); scene.add(cl);

  /* ---- 四條 SMT 線（參考檔造型） ---- */
  F3.colG = 0x25c26e; F3.colA = 0xffb020; F3.colR = 0xff4d5e; F3.dim = 0x4a535e;
  const stCol = { co:'#2a78d6', mw:'#eb6834', flt:'#d55181', rt:'#7b8794' };
  for (let l=0;l<4;l++) {
    const z = LZ[l], L = { z, boards:[], phase:(l*0.27)%1, gant:[] };
    sbox(19,0.08,0.5,mat.conv,8.3,1.0,z); sbox(19,0.9,0.12,mat.base,8.3,0.5,z-0.22); sbox(19,0.9,0.12,mat.base,8.3,0.5,z+0.22);
    sbox(0.9,1.5,1.0,mat.body,-0.6,0.75,z); sbox(0.9,1.5,1.0,mat.body,17.2,0.75,z);
    sbox(1.7,0.95,1.5,mat.body,2.2,0.48,z); sbox(1.7,0.75,1.5,mat.glass,2.2,1.35,z); sbox(1.74,0.08,1.54,mat.base,2.2,1.76,z);
    L.sq = box(1.2,0.12,0.12,mat.blue,2.2,1.28,z); L.stencil = box(1.1,0.03,1.0,mat.metal,2.2,1.12,z);
    [[5.2,2.6],[8.6,2.6]].forEach(([x,w],i) => { sbox(w,0.95,1.8,mat.body,x,0.48,z); const hood = box(w,0.8,1.8,mat.glass,x,1.38,z);
      const cap = box(w+0.04,0.1,1.84,i?mat.gray:mat.blue,x,1.83,z);
      const beam = box(0.14,0.12,1.6,mat.dark,x,1.55,z), head = box(0.3,0.3,0.3,mat.orange,x,1.4,z); L.gant.push({ beam, head, x, w, hood, cap }); });
    sbox(5.2,1.25,1.6,mat.body,13.2,0.63,z); sbox(5.24,0.12,1.64,mat.base,13.2,1.3,z); for (let k=0;k<4;k++) sbox(0.04,1.25,1.62,mat.gray,11.2+k*1.3,0.63,z);
    L.glow = mat.glow.clone(); box(0.06,0.25,0.6,L.glow,10.58,1.05,z); box(0.06,0.25,0.6,L.glow,15.82,1.05,z);
    cyl(0.04,0.7,mat.dark,5.2,2.2,z-0.7);
    L.tw = [F3.colR,F3.colA,F3.colG].map((c,i) => cyl(0.1,0.16,new THREE.MeshBasicMaterial({ color:c }),5.2,2.8-i*0.17,z-0.7));
    for (let i=0;i<9;i++) L.boards.push(box(0.5,0.04,0.36,mat.board,0,1.07,z));
    L.cartNew = cart(mat.a1,-4.2,z+1.3); L.cartOld = cart(mat.blue,5.2,z+1.22);
    L.tech = person(mat.blue,3.6,z+1.7);
    /* 等料：線邊料車缺三盤（紅框閃），倉庫人員在料架找料 → 推補料車到線邊 → 一盤一盤上料 */
    L.reelMat = mat.blue; L.newMat = mat.teal;
    L.gap = box(0.66,0.16,0.66,new THREE.MeshBasicMaterial({ color:0xff4d5e, transparent:true, opacity:0.8 }),0,1.5,0,L.cartOld);   /* 浮在料架上方，廠房模型的飛達擋不住 */ L.gap.visible = false;
    L.supply = cart(mat.teal,-6.6,z+2.25); L.supply.visible = false;
    L.runner = person(mat.orange,-7.2,z+1.9); L.runner.visible = false;
    L.runBox = box(0.4,0.3,0.4,mat.carton,0,1.15,0.32,L.runner); L.runBox.visible = false;
    L.st = label('換線中',stCol.co,0.8); L.st.position.set(5.2,4.0,z); L.st.visible = false; scene.add(L.st); L.stCol = stCol;
    L.nm = label((l+1)+' 線','#39434e',0.6); L.nm.position.set(-0.6,2.4,z - 0.7); scene.add(L.nm);
    F3.lines.push(L);
  }
  [['印錫膏',2.2],['高速機',5.2],['泛用機',8.6],['回焊爐',13.2]].forEach(([t,x]) => { const s = label(t,'#56616d',0.62); s.position.set(x,3.0,-1.6); scene.add(s); });

  /* ---- 收集輸送帶與後段主線 ---- */
  box(0.5,0.08,14.2,mat.conv,19.3,1.0,6.6); box(0.12,0.9,14.2,mat.base,19.08,0.5,6.6); box(0.12,0.9,14.2,mat.base,19.52,0.5,6.6);
  box(18,0.08,0.5,mat.conv,28.6,1.0,6.6); box(18,0.9,0.12,mat.base,28.6,0.5,6.38); box(18,0.9,0.12,mat.base,28.6,0.5,6.82);
  F3.mboards = []; for (let i=0;i<16;i++) F3.mboards.push(box(0.5,0.04,0.36,mat.board,0,1.07,6.6));
  /* 後段四站：工作台＋作業員 */
  F3.ds = [];
  [['插件',22.5],['測試',26.5],['組裝',30.5],['包裝',34.5]].forEach(([n,x],i) => {
    box(2.6,0.08,1.4,mat.wood,x,0.9,8.6); [[-1.2,-0.6],[1.2,-0.6],[-1.2,0.6],[1.2,0.6]].forEach(([a,b]) => box(0.06,0.88,0.06,mat.dark,x+a,0.44,8.6+b));
    const tray = box(1.0,0.12,0.7,mat.board,x,1.0,8.6);
    const w1 = person(i===0?mat.orange:mat.blue,x-0.6,9.8), w2 = person(i===0?mat.orange:mat.blue,x+0.6,9.8);
    const lab = label(n,'#56616d',0.62); lab.position.set(x,2.7,8.6); scene.add(lab);
    const stl = label('有板可做','#16794a',0.55); stl.position.set(x,3.5,8.6); scene.add(stl);
    F3.ds.push({ x, tray, w:[w1,w2], stl });
  });
  /* 品保／測試（重測） */
  box(2.2,0.08,1.2,mat.wood,26.5,0.9,3.0); box(0.9,0.6,0.7,mat.dark,26.5,1.25,3.0);
  F3.qaP = person(mat.purple,26.5,1.9);
  const ql = label('品保／測試','#56616d',0.62); ql.position.set(26.5,2.8,3.0); scene.add(ql);
  F3.retest = box(0.9,0.5,0.9,mat.red,28.2,0.25,3.0); F3.retest.visible = false;
  F3.retestLab = label('重測 640 片（平日約 290）','#b4282e',0.55); F3.retestLab.position.set(28.2,1.8,3.0); scene.add(F3.retestLab); F3.retestLab.visible = false;
  /* ---- 出貨碼頭與貨車 ---- */
  sbox(3.6,0.15,6,mat.wood,41,0.08,6.6);
  F3.cartons = []; for (let i=0;i<45;i++) { const b = box(0.8,0.55,0.8,mat.carton,39.9+(i%3)*0.95,0.45+Math.floor(i/15)*0.6,4.2+Math.floor(i%15/3)*0.95); b.visible = false; F3.cartons.push(b); }
  F3.truck = new THREE.Group(); scene.add(F3.truck);
  box(4.6,2.6,2.4,mat.white,0,1.6,0,F3.truck); box(1.6,1.8,2.3,mat.navy,2.9,1.2,0,F3.truck);
  [[-1.4,1.2],[1.4,1.2],[2.9,1.2],[-1.4,-1.2],[1.4,-1.2],[2.9,-1.2]].forEach(([a,b]) => { const w = cyl(0.42,0.3,mat.dark,a,0.42,b,F3.truck,14); w.rotation.x = Math.PI/2; });
  F3.truck.position.set(46.5,0,6.6);
  F3.shipLab = label('出貨：0 片','#0f5e8c',0.75); F3.shipLab.position.set(41,3.4,6.6); scene.add(F3.shipLab);

  /* ---- 訊息與物件的飛行 ---- */
  F3.env = new THREE.Group(); box(0.8,0.52,0.08,mat.white,0,0,0,F3.env); F3.envBand = box(0.8,0.1,0.09,mat.line,0,0.12,0,F3.env);
  scene.add(F3.env); F3.env.visible = false;
  F3.envLab = label('LINE','#06a648',0.62); scene.add(F3.envLab); F3.envLab.visible = false;
  F3.kindMat = { LINE:mat.line, 口頭:mat.orange, 系統:mat.navy, 卡片:mat.teal, 工單:mat.gray, 料:mat.a1, 板:mat.board };

  loadFactoryKit(scene, STATIC);
  let ctl = null;
  if (THREE.OrbitControls) {
    ctl = new THREE.OrbitControls(cam, renderer.domElement); ctl.maxPolarAngle = 1.45; ctl.minDistance = 5; ctl.maxDistance = 140;
    allowFactoryInteraction(ctl, S.view === 'free');
  }
  Object.assign(F3, { ok:true, renderer, scene, cam, ctl, mat, host, fl });
  const g = shot('overview'); cam.position.set(...g.p); if (ctl) { ctl.target.set(...g.t); ctl.update(); } else cam.lookAt(...g.t);
  resize3D();
  if (window.ResizeObserver) new ResizeObserver(resize3D).observe(host);
  window.addEventListener('resize', resize3D); applyTheme3D();
}
/* Blender 廠房細節（factory_kit.glb）：載入成功後隱藏靜態方塊，換成模型；失敗就維持方塊 */
function loadFactoryKit(scene, statics) {
  if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined' || !window.FK_GLB_B64) return;
  try {
    const bin = atob(window.FK_GLB_B64), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    new THREE.GLTFLoader().parse(buf.buffer, '', g => {
      try { const kit = mdPrepTemplate(g); scene.add(kit); statics.forEach(o => { o.visible = false; });
        /* 貼片機的罩與頂板改由模型提供，程式原本的方塊隱藏（換線時仍由吸嘴頭與料車示意） */
        F3.lines.forEach(L => L.gant.forEach(g => { g.hood.visible = false; g.cap.visible = false; }));
        F3.kitOK = true; }
      catch (e) { console.warn('factory kit failed:', e && e.message); }
    }, e => console.warn('factory kit failed:', e && e.message));
  } catch (e) { console.warn('factory kit failed:', e && e.message); }
}
function shot(name) {
  const SH = {
    overview:{ t:[3.5,0,6.6], o:[4,46,54] },
    office:  { t:[-27,1.2,5],o:[2,13,16] },
    wh:      { t:[-5,0.6,7], o:[-5,8,11] },
    smt:     { t:[7,0.8,6.6],o:[-12,15,22] },
    line2:   { t:[7,1,4.4],  o:[-11,10,15] },
    line3:   { t:[8,1,8.8],  o:[-11,10,15] },
    down:    { t:[33,0.8,6.6],o:[-4,12,16] }
  };
  const s = SH[name] || SH.overview, a = F3.cam ? F3.cam.aspect : 2, k = 1.14 * (a < 0.9 ? 1.9 : a < 1.4 ? 1.35 : 1);
  return { t:s.t, p:[s.t[0]+s.o[0]*k, s.t[1]+s.o[1]*k, s.t[2]+s.o[2]*k] };
}
function allowFactoryInteraction(control, enabled) {
  if (!control) return;
  control.enabled = enabled;
  control.enableDamping = enabled;
  control.domElement.style.touchAction = enabled ? 'none' : 'auto';
  control.domElement.style.cursor = enabled ? 'grab' : '';
}
function resize3D() {
  if (!F3.ok) return;
  const {clientWidth: w, clientHeight: h} = F3.host;
  if (!w || !h) return;
  const canvas = F3.renderer.domElement, scale = F3.renderer.getPixelRatio();
  if (canvas.width !== Math.floor(w * scale) || canvas.height !== Math.floor(h * scale)) F3.renderer.setSize(w, h, false);
  if (F3.cam.aspect !== w / h) { F3.cam.aspect = w / h; F3.cam.updateProjectionMatrix(); }
}
function applyTheme3D() {
  if (!F3.ok) return; const bg = css('--bg'); if (bg === F3.bg) return; F3.bg = bg; F3.scene.background = new THREE.Color(bg);
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  F3.mat.floor.color.set(dark ? 0x2a333d : 0xcfd5dc); F3.mat.office.color.set(dark ? 0x33404e : 0xbfcad6); F3.mat.dock.color.set(dark ? 0x313b46 : 0xc3ccd6);
}
const ease = x => x*x*(3-2*x);
function setXZ(o,a,b,f) { o.position.x = a[0]+(b[0]-a[0])*f; o.position.z = a[1]+(b[1]-a[1])*f; }
const KIND_BG = { LINE:'#06a648', 口頭:'#a86400', 系統:'#0f5e8c', 卡片:'#16794a', 工單:'#56616d', 料:'#a86400', 板:'#16794a' };

function render3D(t, dt) {
  if (!F3.ok) return; F3.T += dt; const T = F3.T, run = S.playing && t < DAY.H1, blink = Math.sin(T*8) > 0;
  const P = S.plan, E = S.events, f = P.f;
  F3.ai.visible = F3.aiLab.visible = !P.isBefore && f.intake;
  F3.board.visible = F3.boardLab.visible = !P.isBefore && f.gate;

  /* 飛行中的訊息：取目前正在傳、或剛傳到的那一筆 */
  let cur = null;
  for (const e of E) if (e.from && e.to && e.from !== e.to && t >= e.t && t < e.t + Math.max(e.dur, 0.06) + 0.12) cur = e;
  if (cur) {
    const moving = t < cur.t + cur.dur, fr = moving ? ease((t - cur.t) / cur.dur) : 1, a = P3[cur.from], b = P3[cur.to];
    const x = a[0]+(b[0]-a[0])*fr, z = a[2]+(b[2]-a[2])*fr, y = a[1] + Math.sin(fr*Math.PI) * Math.min(6, 1.5 + Math.abs(b[0]-a[0])*0.06) + Math.sin(T*3)*0.08;
    F3.env.visible = F3.envLab.visible = true; F3.env.position.set(x,y,z); F3.env.rotation.y = T*1.4;
    F3.envBand.material = F3.kindMat[cur.kind] || F3.mat.line;
    F3.envLab.position.set(x, y+0.95, z);
    relabel(F3.envLab, moving ? (cur.kind + '｜' + cur.fly) : cur.done, moving ? (KIND_BG[cur.kind] || '#06a648') : (cur.cls === 'bad' ? '#b4282e' : cur.cls === 'good' ? '#16794a' : '#a86400'));
  } else F3.env.visible = F3.envLab.visible = false;

  /* 倉庫人員：送料事件時推車到線邊 */
  const wev = E.find(e => e.kind === '料' && t >= e.t && t < e.t + e.dur + 0.3);
  if (wev) { const fr = Math.min(1, (t - wev.t) / (wev.dur + 0.3)); F3.whCart.visible = true;
    const toZ = P.isBefore ? 6.6 : LZ[1] + 1.6; setXZ(F3.whCart, [-6.2,10.6], [-1.5,toZ], ease(fr)); F3.whStaff.position.set(F3.whCart.position.x - 1.0, 0, F3.whCart.position.z + 0.2); }
  else { F3.whCart.visible = false; }

  /* 四條線 */
  let running = 0;
  F3.lines.forEach((L, i) => {
    const l = i+1, s = lineState(P, l, t), m = lineModel(P, l, t), on = s.k === 'run', z = L.z;
    if (on) running++;
    relabel(L.nm, l + ' 線 ' + m[0] + ' ' + m[1] + (m[2] ? '（插單）' : (DAY.WO[l] ? ' ' + DAY.WO[l] : '')), m[2] ? '#a86400' : '#39434e');
    const mph = s.k === 'mw' ? Math.max(0, Math.min(1, (t - s.a) / Math.max(0.01, s.b - s.a))) : 0;
    const mwTxt = mph < 0.68 ? '等料：線邊缺料' : mph < 0.88 ? '等料：料送到線邊' : '上料中';
    L.st.visible = !on; if (!on) relabel(L.st, s.k === 'mw' ? mwTxt : ({ co:'換線中', mw:'等料', flt:'拋料／故障', rt:'例行停機' })[s.k], L.stCol[s.k]);
    L.tw[0].material.color.set(s.k === 'flt' && blink ? F3.colR : F3.dim);
    L.tw[1].material.color.set(s.k === 'co' || (s.k === 'mw' && blink) ? F3.colA : F3.dim);
    L.tw[2].material.color.set(on ? F3.colG : F3.dim);
    if (on && run) L.phase = (L.phase + dt*0.09*S.speed) % 1;
    const bm = m[2] ? F3.mat.a1 : F3.mat.board;
    L.boards.forEach((b,k) => { b.position.x = -0.8 + ((k/9 + L.phase) % 1) * 18.2; b.material = bm; });
    L.glow.color.set(on ? 0xff8a2a : 0x8a5a3a);
    L.gant.forEach((g,k) => { if (on && run) { g.beam.position.x = g.x + Math.sin(T*(5+k)) * g.w*0.36; g.head.position.x = g.beam.position.x; g.head.position.z = z + Math.cos(T*(7+k*2))*0.6; } });
    if (on && run) L.sq.position.z = z + Math.sin(T*3)*0.55;
    const dock = [5.2,z+1.22], park = [-4.2,z+1.3], out = [11,z+2.3];
    const hoodUp = s.k === 'co' ? 0.45 : 0, hood = L.gant[0].hood; hood.position.y += ((1.38+hoodUp) - hood.position.y) * Math.min(1, dt*6); L.gant[0].cap.position.y = hood.position.y + 0.45;
    if (s.k === 'co') { const ph = (t - s.a) / (s.b - s.a);
      if (ph < 0.34) { setXZ(L.cartOld, dock, out, ease(ph/0.34)); setXZ(L.cartNew, park, park, 0); L.tech.position.set(L.cartOld.position.x-0.2, 0, L.cartOld.position.z+0.55); }
      else if (ph < 0.68) { setXZ(L.cartOld, out, out, 0); setXZ(L.cartNew, park, dock, ease((ph-0.34)/0.34)); L.tech.position.set(L.cartNew.position.x-0.2, 0, L.cartNew.position.z+0.55); }
      else { const fr = (ph-0.68)/0.32; setXZ(L.cartNew, dock, dock, 0); L.tech.position.set(2.2,0,z+1.15); L.stencil.position.y = 1.12 + Math.sin(fr*Math.PI)*1.1; L.stencil.position.z = z + Math.sin(fr*Math.PI)*0.9; }
      L.cartNew.visible = true;
    } else { setXZ(L.cartOld, dock, dock, 0); setXZ(L.cartNew, park, park, 0); L.cartNew.visible = false; L.stencil.position.set(2.2,1.12,z);
      if (s.k === 'flt') L.tech.position.set(8.6 + Math.sin(T*2)*0.3, 0, z+1.25); else L.tech.position.set(3.6, 0, z+1.7); }
    /* ---- 等料與上料 ---- */
    const R = L.cartOld.userData.reels, SR = L.supply.userData.reels, GAP = [2,3,4];
    if (s.k === 'co') GAP.forEach(k => { R[k].material = L.reelMat; });
    if (s.k === 'mw') {
      const lane = z + 2.25, from = [-6.6, lane], to = [5.2, lane];
      let back = 0;                                                         /* 已補回的盤數 */
      if (mph < 0.68) {                                                     /* 1. 缺料：紅框閃，技術員在料車旁等；倉庫人員在料架前來回找 */
        L.supply.visible = false; L.runner.visible = true; L.runBox.visible = false;
        L.runner.position.set(-7.25, 0, z + Math.sin(T*1.6) * 1.0); L.runner.rotation.y = Math.PI/2;
        L.tech.position.set(4.3 + Math.sin(T*1.2)*0.15, 0, z+1.75);
      } else if (mph < 0.88) {                                              /* 2. 補料車從倉庫推到線邊 */
        const fr = ease((mph - 0.68) / 0.20);
        L.supply.visible = true; setXZ(L.supply, from, to, fr); SR.forEach(r => { r.visible = true; });
        L.runner.visible = true; L.runBox.visible = false; L.runner.rotation.y = 0;
        L.runner.position.set(L.supply.position.x - 1.0, 0, lane + 0.05);
        L.tech.position.set(4.3, 0, z+1.75);
      } else {                                                              /* 3. 一盤一盤從補料車搬到線邊料車 */
        const fr = (mph - 0.88) / 0.12; back = Math.min(3, Math.floor(fr * 3.999));
        L.supply.visible = true; setXZ(L.supply, to, to, 0); SR.forEach((r,k) => { r.visible = k < 7 - back; });
        L.runner.visible = true; L.runner.position.set(4.2, 0, lane + 0.05);
        L.runBox.visible = (fr * 3.999) % 1 < 0.5;
        L.tech.position.set(5.2 + Math.sin(T*3)*0.35, 0, z+1.75);
      }
      GAP.forEach((k,j) => { R[k].visible = j < back; if (j < back) R[k].material = L.newMat; });
      L.gap.visible = mph < 0.88 ? blink : back < 3; L.gap.scale.x = Math.max(0.01, (3 - back) / 3); L.gap.position.x = -back * 0.11;
    } else {
      GAP.forEach(k => { R[k].visible = true; }); L.gap.visible = false;
      L.supply.visible = false; L.runner.visible = false;
    }
  });
  /* 倉庫人員：沒有送料事件時留在倉庫；導入齊套時在齊套區來回點料（等料的找料、補料由各線的倉庫人員示範） */
  const kitOn = !P.isBefore && f.kit, selOn = !P.isBefore && f.kitsel && !f.kit, etaOn = !P.isBefore && f.eta, kitAny = kitOn || selOn;
  F3.kitCarts.forEach(c => { c.visible = kitAny; }); F3.kitLab.visible = kitAny; if (kitAny) relabel(F3.kitLab, selOn ? '齊套區：只備插單、換零件' : '齊套區：料齊才換線', '#16794a');
  if (!wev) { if (kitOn) { F3.whStaff.position.set(-8.9, 0, 6.6 + Math.sin(T*0.7) * 6.2); F3.whBox.visible = Math.sin(T*1.4) > 0; }
              else { F3.whStaff.position.set(-6.4,0,6.6); F3.whBox.visible = false; } }
  F3.whLab.position.set(F3.whStaff.position.x, 2.3, F3.whStaff.position.z);
  relabel(F3.whLab, wev ? '倉庫：送料' : kitOn ? '倉庫：齊套點料' : selOn ? '倉庫：插單才齊套' : etaOn ? '倉庫：回報料到日' : '倉庫人員', kitOn || selOn || etaOn ? '#16794a' : '#a86400');
  const W = P.isBefore ? S.whs0 : S.whs;
  if (W) { const n = whNote(S.whs0, S.whs);
    relabel(F3.whStat, P.isBefore ? '倉庫 ' + f1(W.tot) + ' 人時／月' : '倉庫 +' + f1(n.inc) + ' −' + f1(n.dec) + ' 人時／月' + (n.inc > 0 ? ' ⚠' : ''), !P.isBefore && n.inc > 0 ? '#a86400' : '#39434e'); }

  /* 後段：運轉線數決定主線上的板子量；兩條以上停線時人工站在等板（示意） */
  if (run) F3.mph = ((F3.mph || 0) + dt*0.05*S.speed*Math.max(0.2, running/4)) % 1;
  const nd = Math.round(running/4*16);
  F3.mboards.forEach((b,k) => { b.position.x = 19.8 + (((F3.mph||0) + k/16) % 1) * 17.6; b.visible = k < nd; });
  const idle = running <= 2;
  F3.ds.forEach((d,j) => {
    d.tray.visible = !idle;
    d.w.forEach((w,k) => { w.position.y = (!idle && run) ? Math.abs(Math.sin(T*4 + j + k))*0.05 : 0; });
    relabel(d.stl, idle ? '人在等板' : '有板可做', idle ? '#a86400' : '#16794a');
  });
  const qaOn = P.isBefore && t >= 14.0;
  F3.retest.visible = F3.retestLab.visible = qaOn;
  const m = dayMetrics(P, t);
  const nc = Math.min(45, Math.floor(m.prod / 120)); F3.cartons.forEach((b,i) => b.visible = i < nc);
  relabel(F3.shipLab, '今天 SMT 產出：' + Math.round(m.prod).toLocaleString('en-US') + ' 片');
  F3.truck.position.x = 46.5 + (t >= 18.5 ? Math.min(6, (t - 18.5) * 4) : 0);

  /* 鏡頭 */
  let goal = null;
  if (S.auto) { const c = [...E].reverse().find(e => e.cam && t >= e.t - 0.02); goal = shot(c ? c.cam : 'overview'); }
  else if (F3.goal) goal = F3.goal;
  if (goal && F3.ctl) { const k = REDUCED ? 1 : 1 - Math.exp(-dt*1.8);
    F3.cam.position.lerp(new THREE.Vector3(...goal.p), k); F3.ctl.target.lerp(new THREE.Vector3(...goal.t), k);
    if (!S.auto && F3.cam.position.distanceTo(new THREE.Vector3(...goal.p)) < 0.05) F3.goal = null; }
  if (F3.ctl) F3.ctl.update(); F3.renderer.render(F3.scene, F3.cam);
}
