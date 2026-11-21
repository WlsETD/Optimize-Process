/* =====================================================================
   機器細節：A1 的一條 SMT 線（Blender 建模，3D 示意）＋一般換線＋換線標準化
   這一頁不放任何效果數字：換線外部化需要線外預裝台等設備與人力，
   不符合個案「不買機台、不加人」的限制，已移出方案；也不納入模擬。
   換線各動作的順序與時間沒有資料，動畫只示意「新飛達從料車換到機台上」。
   ===================================================================== */
const MD = { open:false, m:0, playing:!REDUCED, r:null, sc3:null, cam:null, ctl:null, refs:null, raf:0, last:0, hud:{} };
const MD_MIN_S = 0.18;      // 動畫：1 分鐘 ＝ 0.18 秒（只為看清楚，不是實際速度）
const MD_CYCLE = 54;        // 一次換線平均 54 分（0.90 h，資料3：133 h ÷ 148 次）
const MD_TXT   = '停機：換鋼板、換料、調程式、第一片檢查（個案單的定義；各動作的順序與時間，資料沒有）';

/* ---------- Blender 建模的機台（GLB）：載入、換材質、找出會動的節點 ---------- */
let MD_TPL = null;
function mdSetMat(node, m) {
  if (node.userData.mat === m) return;
  node.userData.mat = m;
  node.traverse(o => { if (o.isMesh) o.material = m; });
}
function mdPrepTemplate(gltf) {
  const cache = {};
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material, n = m.name;
    if (!cache[n]) {
      if (n === 'glass') cache[n] = new THREE.MeshLambertMaterial({ color:m.color, transparent:true, opacity:0.26, depthWrite:false, side:THREE.DoubleSide });
      else if (n === 'screen' || n === 'light') cache[n] = new THREE.MeshBasicMaterial({ color:m.color });
      else cache[n] = new THREE.MeshLambertMaterial({ color:m.color });
    }
    o.material = cache[n];
    if (n === 'glass') o.renderOrder = 2;
  });
  return gltf.scene;
}
function mdBuildGLB(sc, tpl) {
  const root = tpl.clone(true), by = {};
  root.traverse(o => { if (o.name) by[o.name] = o; });
  const get = n => { const o = by[n]; if (!o) throw new Error('model node missing: ' + n); return o; };
  const R = { boards:[], placers:[], racks:[], cartReels:[] };
  for (let i = 0; i < 6; i++) R.boards.push(get('Board_' + i));
  [0, 1].forEach(p => {
    const h = get('Head_' + p); R.placers.push({ x:h.position.x, head:h });
    const list = []; for (let j = 0; j < 8; j++) list.push(get('FR' + p + '_' + j)); R.racks.push(list);
  });
  for (let j = 0; j < 7; j++) R.cartReels.push(get('CartReel_' + j));
  R.cart = get('Cart'); R.tech = get('Tech'); R.lamp = get('Lamp');
  R.lampG = new THREE.MeshBasicMaterial({ color:0x35d07f }); R.lampR = new THREE.MeshBasicMaterial({ color:0xb4282e });
  /* 文字標籤（機台名稱放在各機台上方，避開上板機的料架與印刷機的錫膏匣） */
  [['上板機',-7.6,3.1],['印刷機',-5.6,2.75],['SPI',-3.9,2.3],['貼片機 1',-1.7,2.85],['貼片機 2',1.1,2.85],['迴焊爐',4.6,2.45],['AOI',7.4,2.3],['收板機',9.1,3.1]]
    .forEach(a => { const lb = label(a[0], '#27303a', 0.52); lb.position.set(a[1], a[2], 0); root.add(lb); });
  const ll = label('A1 一條線（Blender 建模・示意，不是實際機型）', '#0f5e8c', 0.42); ll.position.set(0.7, 3.9, 0); root.add(ll);
  sc.add(root); R.root = root;
  return R;
}
function mdAttachModel(sc) {
  const fallback = why => { console.warn('machine model failed:', why); const h = MD.host; if (h && MD.sc3 === sc) { const p = document.createElement('p'); p.className = 'fail'; p.textContent = '3D 機台模型沒有載入。下方的說明照常可以看。'; h.appendChild(p); } };
  const go = tpl => { if (MD.sc3 !== sc) return; try { MD.refs = mdBuildGLB(sc, tpl); } catch (e) { fallback(e && e.message); } };
  if (typeof THREE.GLTFLoader === 'undefined' || !window.MD_GLB_B64) { fallback('no loader or model'); return; }
  if (MD_TPL) { go(MD_TPL); return; }
  try {
    const bin = atob(window.MD_GLB_B64), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    new THREE.GLTFLoader().parse(buf.buffer, '', g => { try { MD_TPL = mdPrepTemplate(g); } catch (e) { fallback(e.message); return; } go(MD_TPL); }, e => fallback(e && e.message));
  } catch (e) { fallback(e.message); }
}

function mdEnsure3D() {
  const host = $('#md3d');
  if (!host || MD.r) return;
  if (typeof THREE === 'undefined') { host.innerHTML = '<p class="fail">3D 元件沒有載入。下方的說明照常可以看。</p>'; return; }
  let r;
  try { r = new THREE.WebGLRenderer({ antialias:true }); } catch (e) { host.innerHTML = '<p class="fail">這個裝置不支援 3D 繪圖。下方的說明照常可以看。</p>'; return; }
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  host.insertBefore(r.domElement, host.firstChild);
  const sc = new THREE.Scene(); sc.background = new THREE.Color(css('--future') || '#e9edf1');
  const cam = new THREE.PerspectiveCamera(36, 2, 0.1, 200); cam.position.set(0.7, 10.4, 14.0);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x77808c, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 0.5); sun.position.set(10, 20, 14); sc.add(sun);
  if (THREE.OrbitControls) {
    MD.ctl = new THREE.OrbitControls(cam, r.domElement);
    MD.ctl.target.set(0.7, 1.5, 2.9); MD.ctl.enableDamping = true; MD.ctl.maxPolarAngle = 1.45; MD.ctl.minDistance = 6; MD.ctl.maxDistance = 40; MD.ctl.update();
  }
  M_OR = new THREE.MeshLambertMaterial({ color:0xeb6834 }); M_GR = new THREE.MeshLambertMaterial({ color:0x8792a0 });
  MD.r = r; MD.sc3 = sc; MD.cam = cam; MD.refs = null; MD.host = host; mdAttachModel(sc);
  mdResize();
}
function mdResize() {
  if (!MD.r || !MD.host) return;
  const w = MD.host.clientWidth, h = MD.host.clientHeight;
  if (!w || !h) return;
  MD.r.setSize(w, h, false); MD.cam.aspect = w / h; MD.cam.updateProjectionMatrix();
}
function mdDispose() {
  if (MD.r) { MD.r.dispose(); try { MD.r.forceContextLoss(); } catch (e) {} if (MD.r.domElement && MD.r.domElement.parentNode) MD.r.domElement.parentNode.removeChild(MD.r.domElement); }
  if (MD.ctl) MD.ctl.dispose();
  MD.r = null; MD.sc3 = null; MD.cam = null; MD.ctl = null; MD.refs = null; MD.host = null;
}

/* 每一幀：依時間更新機器狀態（一般換線：整段都停機） */
const mdNear = (a, b, k) => a + (b - a) * k;
let M_OR = null, M_GR = null;
function mdTick(dt) {
  const R = MD.refs; if (!R) return;
  const m = MD.m, prog = Math.max(0, Math.min(1, m / MD_CYCLE));
  const now = performance.now() / 1000;

  mdSetMat(R.lamp, R.lampR);                                   // 換線＝停機，紅燈
  R.placers.forEach(p => { p.head.position.x = p.x; });
  /* 示意：新飛達從料車（橘）逐支換到機台上；舊的是灰色 */
  R.racks.forEach(list => list.forEach((node, j) => mdSetMat(node, j / list.length < prog ? M_OR : M_GR)));
  R.cartReels.forEach((node, j) => mdSetMat(node, j / R.cartReels.length >= prog ? M_OR : M_GR));
  R.cart.position.set(-1.7, 0, 2.5);

  const k = 1 - Math.pow(0.002, dt);
  R.tech.position.x = mdNear(R.tech.position.x, -0.45, k);
  R.tech.position.z = mdNear(R.tech.position.z, 2.5, k);
  R.tech.position.y = 0;

  const hc = '第 ' + Math.floor(m) + ' 分', hs = '停機 ' + Math.floor(m) + ' 分';
  if (MD.hud.c !== hc) { MD.hud.c = hc; $('#mdC').textContent = hc; }
  if (MD.hud.p !== MD_TXT) { MD.hud.p = MD_TXT; $('#mdP').textContent = MD_TXT; }
  if (MD.hud.s !== hs) { MD.hud.s = hs; $('#mdS').textContent = hs; }
}

function mdFrame(ts) {
  if (!MD.open) return;
  const dt = Math.min(0.1, Math.max(0, (ts - MD.last) / 1000)); MD.last = ts;
  if (MD.playing) { MD.m += dt / MD_MIN_S; if (MD.m >= MD_CYCLE) MD.m -= MD_CYCLE; const sc = $('#mdScrub'); if (sc) sc.value = MD.m; }
  mdTick(dt);
  if (MD.ctl) MD.ctl.update();
  if (MD.r) MD.r.render(MD.sc3, MD.cam);
  MD.raf = requestAnimationFrame(mdFrame);
}

/* ---------- 區塊 ---------- */
function mdChangeover() {
  return '<div class="tl2"><div class="tl2r"><span>一次換線</span><div class="tl2b"><i class="int" style="width:100%">停機：換鋼板、換料、調程式、第一片檢查</i></div><b>平均停機 54 分（0.90 h）</b></div></div>'
    + '<p class="note" style="margin-top:6px">九月每次換線平均 0.90 h（133 h ÷ 148 次，資料3）。個案單只定義了換線包含哪四件事，沒有說各自的順序與時間，也沒有說哪些可以在機台運轉時先做；所以這裡不拆時間，也不算「能省多少」。</p>';
}
function mdStandard() {
  return '<div class="mdgrid">'
    + '<div class="mdcard"><h4>換線標準化（不買機器、不加人）【我猜的】</h4><ul>'
    + '<li>換線前先照齊料清單確認料與鋼板都在線邊</li>'
    + '<li>換線動作寫成固定步驟與檢查表，首件檢查有固定表單</li>'
    + '<li>換線時間一律記在機台紀錄（本來就有），試算用實際值</li>'
    + '<li><b>不列任何省多少時間、多出多少貨的數字</b>：沒有現場計時，不能估</li></ul></div>'
    + '<div class="mdcard"><h4>為什麼沒有「換線外部化」</h4><ul>'
    + '<li>外部化通常要線外預裝台、預裝治具等設備，也要有人在線外做，這和個案限制「不買新機台、不加人」衝突</li>'
    + '<li>有些情況還受機台硬體限制，要換機器才能解決</li>'
    + '<li>因此已移出方案與模擬器，不再放任何成本或效果數字</li></ul></div>'
    + '<div class="mdcard"><h4>要現場確認的</h4><ul>'
    + '<li>四個動作的順序與各自的時間（計時 2 週）</li>'
    + '<li>哪些準備不需要新設備、也不增加人力就能先做</li>'
    + '<li>確認前，不把任何換線改善寫進預估</li></ul></div>'
    + '</div>';
}
function mdSpecs() {
  return '<div class="mdgrid">'
    + '<div class="mdcard"><h4>資料看得到的</h4><ul>'
    + '<li>4 條 SMT 線，26 個工作日（資料3）</li>'
    + '<li>機台設定 24 秒／片，約 150 片／正常運轉小時（資料2；資料1 推算）</li>'
    + '<li>九月開機 1,003 h，正常運轉 760 h（資料3）</li>'
    + '<li>九月換線 148 次、換線停機 133 h，每次約 0.90 h</li></ul></div>'
    + '<div class="mdcard"><h4>資料沒有的（畫面為示意）</h4><ul>'
    + '<li>機台品牌、型號、貼片頭數、飛達數量</li>'
    + '<li>每條線的站數與班次；換線各動作的實際時間</li>'
    + '<li>3D 的尺寸與排列只為看懂流程，不是廠房平面圖；機台外觀是通用示意（Blender 建模）</li></ul></div>'
    + '</div>';
}

function mdOpen() {
  const m = $('#mdl');
  $('#dayLogs').hidePopover();
  $('#mdbody').innerHTML =
    '<section class="md-preview"><h3>機器（3D 示意）</h3>'
    + '<div class="md3d" id="md3d"><div class="mdhud"><span class="c" id="mdC">第 0 分</span><span class="p" id="mdP"></span><span class="p" id="mdS"></span></div></div>'
    + '<div class="mdctl"><button type="button" class="btn sm pri" id="mdPlay">❚❚ 暫停</button><input type="range" id="mdScrub" min="0" max="54" step="0.1" value="0" aria-label="拖曳換線時間"></div>'
    + '</section><details class="md-details" id="mdDetails"><summary>詳細資訊</summary>'
    + '<section>' + mdSpecs() + '</section>'
    + '<section><h3>一次換線（資料只有平均時間）</h3>' + mdChangeover() + '</section>'
    + '<section><h3>換線標準化與外部化的取捨</h3>' + mdStandard() + '</section></details>';
  m.classList.add('on'); MD.open = true; MD.m = 0; MD.playing = !REDUCED; MD.hud = {};
  mdEnsure3D();
  mdBindBody();
  $('#mdPlay').textContent = MD.playing ? '❚❚ 暫停' : '▶ 播放';
  MD.last = performance.now(); MD.raf = requestAnimationFrame(mdFrame);
  $('#mdX').focus();
}
function mdClose() {
  if (!MD.open) return;
  MD.open = false; cancelAnimationFrame(MD.raf); $('#mdl').classList.remove('on');
  mdDispose(); $('#mdbody').innerHTML = '';
}
function mdBindBody() {
  $('#mdDetails').addEventListener('toggle', () => requestAnimationFrame(mdResize));
  $('#mdPlay').addEventListener('click', () => { MD.playing = !MD.playing; $('#mdPlay').textContent = MD.playing ? '❚❚ 暫停' : '▶ 播放'; });
  $('#mdScrub').addEventListener('input', e => { MD.m = +e.target.value; MD.playing = false; $('#mdPlay').textContent = '▶ 播放'; });
}

document.querySelectorAll('.mdopen').forEach(b => b.addEventListener('click', mdOpen));
$('#mdX').addEventListener('click', mdClose);
$('#mdl').addEventListener('click', e => { if (e.target === $('#mdl')) mdClose(); });
window.addEventListener('keydown', e => { if (e.key === 'Escape' && MD.open) mdClose(); });
window.addEventListener('resize', () => { if (MD.open) mdResize(); });
