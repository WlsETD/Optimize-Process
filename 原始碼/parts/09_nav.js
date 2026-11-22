/* =====================================================================
   導覽列：六個頁面各自一屏，不用捲動；單日重播再分 3D / 2D / 時間軸三個畫面
   ===================================================================== */
const PAGES = ['day', 'month', 'impact', 'history', 'sched', 'roster', 'notes'];
let PAGE = 'day';
const dayLogPanel = $('#dayLogs');
function navSync() {
  document.body.dataset.page = PAGE;
  syncComparisonButtons(PAGE === 'roster' ? RS7.view : S.mode);
  document.querySelectorAll('#nav .tabs button').forEach(b => { const on = b.dataset.p === PAGE; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
  try { if (location.hash.slice(1) !== PAGE) history.replaceState(null, '', '#' + PAGE); } catch (e) { /* 嵌入頁面可能不允許 */ }
  navH();
}
/* 單日重播：展開按鈕放在播放列右邊（列置中），和列同高 */
function alignDock() { const b = document.querySelector('.bar'); if (!b) return; if (b.offsetWidth) document.documentElement.style.setProperty('--bh', b.offsetHeight + 'px'); if (b.offsetWidth) { const l = Math.round(b.getBoundingClientRect().right + 12); document.documentElement.style.setProperty('--dock-l', l + 'px'); const hint = document.querySelector('.dock .hint'); if (hint) hint.style.display = innerWidth - l < hint.scrollWidth + 24 ? 'none' : ''; } }
function navH() { alignDock(); const n = $('#nav'), b = document.querySelector('.bar'); if (n) document.documentElement.style.setProperty('--nh', (window.matchMedia('(min-width:900px)').matches ? 0 : n.offsetHeight) + 'px'); if (b && b.offsetHeight) document.documentElement.style.setProperty('--bh', b.offsetHeight + 'px'); if (F3.ok && PAGE === 'day') resize3D(); }
function startPreviewPlayback(view) {
  if (REDUCED || (view !== '3d' && view !== '2d')) return;
  if (S.t >= DAY.H1) S.t = DAY.H0;
  S.playing = true;
  playBtn();
}
function showPage(p, autoplay = true) {
  if (PAGES.indexOf(p) < 0) return;
  if (p !== 'day') dayLogPanel.hidePopover();
  window.scrollTo(0, 0);
  if (p === 'day' || p === 'month') {
    if (p === 'day' && PAGE !== 'day' && autoplay) startPreviewPlayback(document.body.dataset.dv);
    setScope(p);
    return;
  }
  PAGE = p; S.playing = false; MM.playing = false; playBtn(); navSync();
  requestAnimationFrame(() => { if (p === 'history' || p === 'impact') renderCharts(); if (p === 'sched') RS.render(); if (p === 'roster') rosterRender(); });
}
function showDV(v) {
  const previous = document.body.dataset.dv;
  if (v !== previous && (v === '2d' || v === '3d')) {
    const speed = $('#speed');
    speed.value = v === '2d' ? '4' : '2';
    speed.dispatchEvent(new Event('change'));
  }
  document.body.dataset.dv = v;
  startPreviewPlayback(v);
  document.querySelectorAll('.dvseg button').forEach(b => b.classList.toggle('on', b.dataset.dv === v));
  const tl = $('#tl');
  if (v === '3d') $('#f3').closest('.preview-frame').after(tl);
  else if (v === '2d') $('#f2').closest('section').appendChild(tl);
  else $('.dayr').prepend(tl);
  if (v === '3d' && F3.ok) resize3D();
  if (v === 'calc') renderCalc();
  _feedIdx = -1;
  render(0);
}
document.querySelectorAll('#nav .tabs button').forEach(b => b.addEventListener('click', () => showPage(b.dataset.p)));
$('#notesInfo').addEventListener('click', () => showPage('notes'));
document.querySelectorAll('.dvseg button').forEach(b => b.addEventListener('click', () => showDV(b.dataset.dv)));
$('#gofeat').addEventListener('click', () => {
  renderQuickFeatures();
  $('#featurePicker').showModal();
});
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test((e.target || {}).tagName || '')) return;
  if (MD.open || $('#featurePicker').open) return;
  if (e.key === 'Escape' && dayLogPanel.matches(':popover-open')) { e.preventDefault(); dayLogPanel.hidePopover(); return; }
  if (PAGE === 'day' && /^(BUTTON)$/.test((e.target || {}).tagName || '') && e.key === ' ') return;
  if (PAGE === 'day' && e.key === ' ') { e.preventDefault(); $('#play').click(); return; }
  if (PAGE === 'day' && (e.key === ',' || e.key === '.') && window.stepEvent) { window.stepEvent(e.key === ',' ? -1 : 1); return; }
  if (PAGE === 'sched' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { RS.step(e.key === 'ArrowLeft' ? -1 : 1); return; }
  const i = '1234567'.indexOf(e.key); if (i >= 0) showPage(PAGES[i]);
  else if (PAGE === 'day' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { const vs = ['3d', '2d', 'calc', 'kpi'], k = vs.indexOf(document.body.dataset.dv); showDV(vs[(k + 1) % 4]); }
});
window.addEventListener('resize', navH);
if (window.ResizeObserver) new ResizeObserver(() => { if (PAGE === 'day' && F3.ok) resize3D(); }).observe($('#dayg'));
if (window.ResizeObserver) new ResizeObserver(() => { if (PAGE === 'history') renderCharts(); }).observe($('.pg-history'));
/* 標籤說明：點「標籤」開 modal；關閉鈕、點背景、Esc 都能關，關閉後焦點回到按鈕 */
{
  const ov = $('#tagOvl'), bt = $('#tagBtn'), cl = () => { ov.classList.remove('on'); bt.focus(); };
  bt.addEventListener('click', () => { ov.classList.add('on'); $('#tagX').focus(); });
  $('#tagX').addEventListener('click', cl);
  ov.addEventListener('click', e => { if (e.target === ov) cl(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov.classList.contains('on')) cl(); });
}
/* 側邊欄收合：預設展開；箭頭收成只剩數字的窄條，狀態記在 localStorage（不可用時只在這次有效） */
{
  const tg = $('#sbTog');
  const apply = c => { document.body.classList.toggle('sb-collapsed', c); tg.textContent = c ? '›' : '‹'; tg.setAttribute('aria-expanded', c ? 'false' : 'true'); tg.setAttribute('aria-label', c ? '展開側邊欄' : '收合側邊欄');
    document.querySelectorAll('#nav .tabs button').forEach(b => { const t = b.querySelector('.tl'); if (t) b.title = c ? t.textContent : ''; });
    setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 230); };
  let c0 = false; try { c0 = localStorage.getItem('sbc') === '1'; } catch (e) { /* 嵌入頁面可能不允許 */ }
  apply(c0);
  tg.addEventListener('click', () => { const c = !document.body.classList.contains('sb-collapsed'); apply(c); try { localStorage.setItem('sbc', c ? '1' : '0'); } catch (e) { /* 略過 */ } });
}
/* 播放列自適應縮放：從 1.0 逐步縮到 0.62，找到第一個能排成一行的比例；再窄就允許換行（用 0.8） */
let _fitBusy = false;
function fitBar() {
  const b = document.querySelector('.bar'); if (!b || _fitBusy || !b.offsetParent && getComputedStyle(b).position !== 'fixed') return;
  _fitBusy = true;
  try {
    const prev = b.style.getPropertyValue('--bz');
    b.classList.remove('bz-wrap');
    let chosen = null;
    for (let z = 1; z >= 0.62 - 1e-9; z -= 0.04) {
      b.style.setProperty('--bz', z.toFixed(2));
      if (b.scrollWidth <= b.clientWidth + 1) { chosen = z; break; }
    }
    if (chosen == null) { b.classList.add('bz-wrap'); b.style.setProperty('--bz', '0.8'); }
    else b.style.setProperty('--bz', chosen.toFixed(2));
    if (prev !== b.style.getPropertyValue('--bz')) alignDock();
  } finally { _fitBusy = false; }
}
window.addEventListener('resize', fitBar);
if (window.ResizeObserver && document.querySelector('.bar')) new ResizeObserver(() => { alignDock(); fitBar(); }).observe(document.querySelector('.bar'));
new MutationObserver(() => fitBar()).observe(document.querySelector('.bar'), { childList:true, subtree:true, characterData:true });
fitBar();
document.body.dataset.dv = '3d';
/* ===== 全螢幕預覽：3D 廠房／2D 部門流程都能放大，且在全螢幕裡可切換、可播放（鍵盤 F 進出，Esc 離開）===== */
{
  const G = $('#dayg'), fsb = $('#fsbar'), body = document.body;
  const nativeEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const canNative = !!(G.requestFullscreen || G.webkitRequestFullscreen);
  let fake = false;                                   /* 不支援原生全螢幕（例如 iPhone）時，用鋪滿視窗代替 */
  const isFS = () => nativeEl() === G || fake;
  const origMode = m => document.querySelector('.mode [data-m="' + m + '"]');
  $('#fsSpeed').innerHTML = $('#speed').innerHTML;
  function sync() {
    if (!isFS()) return;
    const dv = body.dataset.dv, mo = document.querySelector('.mode button.on'), md = mo ? mo.dataset.m : 'before';
    fsb.querySelectorAll('[data-fdv]').forEach(b => b.classList.toggle('on', b.dataset.fdv === dv));
    fsb.querySelectorAll('[data-fm]').forEach(b => { b.classList.toggle('on', b.dataset.fm === md); const o = origMode(b.dataset.fm); if (o && b.textContent !== o.textContent) b.textContent = o.textContent; });
    if ($('#fsPlay').textContent !== $('#play').textContent) $('#fsPlay').textContent = $('#play').textContent;
    $('#fsClock').textContent = $('#clock').textContent;
    if ($('#fsSpeed').value !== $('#speed').value) $('#fsSpeed').value = $('#speed').value;
  }
  function refit() { [0, 150, 500].forEach(ms => setTimeout(() => { if (F3.ok) resize3D(); render(0); }, ms)); }
  function apply() {
    const on = isFS();
    G.classList.toggle('fs-on', on); G.classList.toggle('fs-fake', on && fake); body.classList.toggle('fsmode', on);
    sync(); refit();
  }
  function enter() {
    if (PAGE !== 'day' || isFS()) return;
    if (body.dataset.dv !== '3d' && body.dataset.dv !== '2d') showDV('3d');
    if (canNative) { try { const p = (G.requestFullscreen || G.webkitRequestFullscreen).call(G); if (p && p.catch) p.catch(() => { fake = true; apply(); }); } catch (e) { fake = true; apply(); } }
    else { fake = true; apply(); }
  }
  function leave() {
    if (fake) { fake = false; apply(); }
    else if (nativeEl()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
  }
  G.addEventListener('tour-factory-fullscreen', e => { fake = e.detail; apply(); });
  document.addEventListener('fullscreenchange', apply); document.addEventListener('webkitfullscreenchange', apply);
  document.querySelectorAll('.fsopen').forEach(b => b.addEventListener('click', enter));
  fsb.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.fdv) showDV(b.dataset.fdv);
    else if (b.dataset.fm) { const o = origMode(b.dataset.fm); if (o) o.click(); }
    else if (b.id === 'fsPlay') $('#play').click();
    else if (b.id === 'fsRestart') $('#restart').click();
    else if (b.id === 'fsExit') leave();
    sync();
  });
  $('#fsSpeed').addEventListener('change', e => { const s = $('#speed'); s.value = e.target.value; s.dispatchEvent(new Event('change', { bubbles: true })); });
  /* 全螢幕裡看不到「機器細節」的彈窗，所以先退出全螢幕再開 */
  document.querySelectorAll('.mdopen').forEach(b => b.addEventListener('click', () => { if (isFS()) leave(); }, true));
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test((e.target || {}).tagName || '')) return;
    if (e.key === 'f' || e.key === 'F') { if (typeof MD !== 'undefined' && MD.open) return; e.preventDefault(); e.stopPropagation(); isFS() ? leave() : enter(); }
    else if (e.key === 'Escape' && fake) { leave(); }
    else if (isFS() && /^[1-6]$/.test(e.key)) e.stopPropagation();   /* 全螢幕時不切頁 */
  }, true);
  setInterval(sync, 250);
}
{ const h = location.hash.slice(1); if (PAGES.indexOf(h) > 0) showPage(h); else navSync(); }
