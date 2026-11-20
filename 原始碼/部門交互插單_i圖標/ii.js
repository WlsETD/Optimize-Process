/* ⓘ 說明圖示（只動「說明文字」，不動資料、按鈕與模擬畫面）
   - 頂端說明、顏色圖例、面板標題旁小字、頁首說明段、頁尾註解 → 收進 ⓘ
   - 每次 render 後由 MutationObserver 重新處理；已處理的不重複 */
(function () {
  'use strict';
  var TIPS = new WeakMap();
  var KEEP_SMALL = /\d+ 筆|推播 \d|排在/;                 // 帶即時數字或狀態的小字：保留
  var KEEP_P = /^(沒有|趕得上|趕不上|預估|輸入指紋|待確認|Demo：|處理中)/;
  var SKIP_IN = '.liff, .liff-b, [data-chat], .ph-chat, .tour, .tour-card, li, td, th, .guide, #toast, #iiTip';
  var tip = null, cur = null;

  function mk(html) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'ii'; b.setAttribute('aria-label', '說明'); b.textContent = 'i';
    TIPS.set(b, [html]); return b;
  }
  function addTo(host, html, before) {
    var ex = host.querySelector(':scope > .ii');
    if (ex) { TIPS.get(ex).push(html); return; }
    var b = mk(html);
    if (before) host.insertBefore(b, before); else host.appendChild(b);
  }
  /* 往上、往前找最近的標題，當作 ⓘ 的位置 */
  function headOf(el) {
    var sel = ':scope > .ptitle, :scope > h4, :scope > h3, :scope > h2';
    var panel = el.closest('.panel,section,article');
    if (panel) { var h = panel.querySelector(sel); if (h) return h; }
    /* 緊接在某個面板後面的說明：掛到那個面板的標題 */
    var prev = el.previousElementSibling;
    if (prev && prev.matches('.panel')) { var h2 = prev.querySelector(':scope > .ptitle'); if (h2) return h2; }
    return null;
  }
  function plain(el) { return (el.textContent || '').trim(); }

  function decorate() {
    var view = document.getElementById('view'); if (!view) return;
    /* 1. 標題旁的小字：原地換成 ⓘ */
    view.querySelectorAll('.ptitle small, h3 small, h4 small, label.nm small').forEach(function (sm) {
      if (sm.closest(SKIP_IN.replace('li, td, th, ', ''))) return;
      if (KEEP_SMALL.test(plain(sm))) return;
      var b = mk(sm.innerHTML); sm.parentNode.replaceChild(b, sm);
    });
    /* 2. 頁首說明段 */
    view.querySelectorAll('p.lede').forEach(function (p) {
      var ph = view.querySelector('.ph h1'); var html = p.innerHTML;
      if (ph) { addTo(ph.parentNode, html); p.remove(); } else { p.parentNode.replaceChild(mk(html), p); }
    });
    /* 3. 說明段、頁尾註解、說明框 */
    view.querySelectorAll('p.sub, p.footnote, .banner.info').forEach(function (p) {
      if (p.closest(SKIP_IN)) return;
      if (p.matches('.banner.info') && !/^綁定流程/.test(plain(p))) return;
      var t = plain(p);
      if (t.length < 10 || KEEP_P.test(t)) return;
      if (p.querySelector('button, .code, input, select, a')) return;
      var h = headOf(p); if (!h) return;
      addTo(h, p.innerHTML); p.remove();
    });
  }

  /* 頂端：說明文字與顏色圖例收進 ⓘ（只做一次） */
  function chrome() {
    var mid = document.querySelector('.top-mid');
    if (mid && !mid.querySelector('.ii')) {
      var spans = mid.querySelectorAll(':scope > span:not(.tag)');
      spans.forEach(function (s) { var b = mk(s.innerHTML); s.parentNode.replaceChild(b, s); });
    }
    var lg = document.querySelector('.legend');
    if (lg && !lg.classList.contains('ii-moved') && mid) {
      var box = '<div class="iileg">' + Array.prototype.map.call(lg.children, function (c) { return c.outerHTML; }).join('') + '</div>';
      var b = mk(box); b.setAttribute('aria-label', '顏色說明'); b.classList.add('lbl'); b.innerHTML = '<i>i</i>圖例'; mid.appendChild(b);
      lg.classList.add('ii-moved');
    }
  }

  /* 提示框 */
  function ensureTip() { if (!tip) { tip = document.createElement('div'); tip.id = 'iiTip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); } return tip; }
  function show(b) {
    var arr = TIPS.get(b); if (!arr) return;
    var t = ensureTip(); cur = b; b.classList.add('on');
    t.innerHTML = arr.map(function (h) { return /^<div/.test(h) ? h : '<p>' + h + '</p>'; }).join('');
    t.classList.add('show');
    var r = b.getBoundingClientRect(), w = t.offsetWidth, hh = t.offsetHeight;
    var x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
    var y = r.bottom + 8; if (y + hh > innerHeight - 8) y = Math.max(8, r.top - hh - 8);
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hide() { if (tip) tip.classList.remove('show'); if (cur) cur.classList.remove('on'); cur = null; }
  document.addEventListener('mouseover', function (e) { var b = e.target.closest && e.target.closest('.ii'); if (b) show(b); });
  document.addEventListener('mouseout', function (e) { var b = e.target.closest && e.target.closest('.ii'); if (b && !(e.relatedTarget && b.contains(e.relatedTarget))) hide(); });
  document.addEventListener('focusin', function (e) { var b = e.target.closest && e.target.closest('.ii'); if (b) show(b); });
  document.addEventListener('focusout', function (e) { if (e.target.closest && e.target.closest('.ii')) hide(); });
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.ii'); if (b) { e.preventDefault(); e.stopPropagation(); cur === b && tip.classList.contains('show') && e.detail === 0 ? hide() : show(b); } else hide(); }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  addEventListener('scroll', hide, true); addEventListener('resize', hide);

  var raf = 0;
  function run() { raf = 0; chrome(); decorate(); }
  function sched() { if (!raf) raf = requestAnimationFrame(run); }
  function start() {
    run();
    new MutationObserver(sched).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
