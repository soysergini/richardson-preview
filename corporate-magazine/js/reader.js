/* Corporación Richardson, S.A. de C.V. - magazine reader.
   Page turning: page-flip (MIT, vendored). Everything else here is the reader UI. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var TOTAL = window.RC_TOTAL, BASE_W = 794, BASE_H = 1123;
  var book = $('book'), wrap = $('bookWrap'), stage = $('stage');
  var pages = Array.prototype.slice.call(book.querySelectorAll('.pg'));
  var leaves = Array.prototype.slice.call(book.querySelectorAll('.leaf'));
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var flip, zoom = 1, panX = 0, panY = 0, lastFocus = null;

  // ---- Lazy image loading around the current page ----
  // Phones get a lighter image set and load fewer pages ahead, to save data.
  var PHONE = Math.min(window.innerWidth, window.innerHeight) < 600;
  var AHEAD = PHONE ? 3 : 6;
  function srcFor(s) { return PHONE && s.indexOf('assets/img/web/') === 0 ? s.replace('assets/img/web/', 'assets/img/mobile/') : s; }
  function ensureImages(n, radius) {
    for (var i = Math.max(1, n - radius); i <= Math.min(TOTAL, n + radius); i++) {
      var imgs = pages[i - 1].querySelectorAll('img[data-src]');
      for (var k = 0; k < imgs.length; k++) { imgs[k].src = srcFor(imgs[k].getAttribute('data-src')); imgs[k].removeAttribute('data-src'); }
    }
  }

  // ---- Start page from URL ----
  function pageFromHash() {
    var m = /[#&]p=(\d+)/.exec(location.hash);
    return m ? Math.min(TOTAL, Math.max(1, parseInt(m[1], 10))) : 1;
  }
  var start = pageFromHash();
  ensureImages(start, PHONE ? 2 : 4);

  // ---- Init flipbook ----
  flip = new St.PageFlip(book, {
    width: BASE_W, height: BASE_H, size: 'stretch',
    minWidth: 460, maxWidth: 2400, minHeight: 300, maxHeight: 3400,
    usePortrait: true, showCover: true, autoSize: true,
    maxShadowOpacity: 0.55, drawShadow: true,
    flippingTime: reduce ? 1 : 950,
    startPage: start - 1, startZIndex: 2,
    mobileScrollSupport: false, swipeDistance: 24, clickEventForward: true, useMouseEvents: true,
    showPageCorners: true, disableFlipByClick: true,
  });
  flip.loadFromHTML(leaves);

  function applyScale() {
    var r = flip.getBoundsRect();
    if (!r || !r.pageWidth) return;
    document.documentElement.style.setProperty('--s', (r.pageWidth / BASE_W).toFixed(5));
  }
  applyScale();
  requestAnimationFrame(function () { applyScale(); book.classList.add('ready'); });
  window.addEventListener('resize', function () { setTimeout(function () { applyScale(); resetZoom(); refresh(); }, 60); });
  flip.on('changeOrientation', function () { setTimeout(function () { applyScale(); refresh(); }, 30); });
  flip.on('flip', function () { refresh(); });
  flip.on('changeState', function (e) { if (e.data === 'flipping' || e.data === 'user_fold' || e.data === 'fold_corner') ensureImages(cur(), AHEAD); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(applyScale);

  function cur() { return flip.getCurrentPageIndex() + 1; }
  function isDouble() { return flip.getOrientation() === 'landscape'; }
  function visible() {
    var n = cur();
    if (!isDouble()) return [n];
    if (n === 1) return [1];
    if (n === TOTAL && TOTAL % 2 === 0) return [TOTAL];
    var l = n % 2 === 0 ? n : n - 1;
    return [l, l + 1];
  }

  // ---- UI state ----
  var input = $('pageInput');
  function refresh() {
    var v = visible(), n = cur();
    ensureImages(n, AHEAD);
    input.value = v.length > 1 ? v[0] + '-' + v[1] : String(v[0]);
    var last = v[v.length - 1];
    $('progressBar').style.width = (last / TOTAL * 100).toFixed(2) + '%';
    $('progress').setAttribute('aria-valuenow', last);
    var atStart = v[0] <= 1, atEnd = last >= TOTAL;
    $('btnPrev').disabled = atStart; $('edgePrev').disabled = atStart;
    $('btnNext').disabled = atEnd; $('edgeNext').disabled = atEnd;
    try { history.replaceState(null, '', '#p=' + v[0]); } catch (e) { /* file:// on some browsers */ }
    $('live').textContent = 'Page ' + v.join(' and ') + ' of ' + TOTAL;
    markThumb();
    centreCover(false);
  }
  flip.on('init', refresh);
  setTimeout(refresh, 0);

  // A closed magazine sits centred; it slides to its spread position as it opens.
  function centreCover(willOpen) {
    var r = flip.getBoundsRect(), v = visible(), dx = 0;
    if (isDouble() && !willOpen) { if (v[0] === 1) dx = -r.pageWidth / 2; else if (v[0] === TOTAL) dx = r.pageWidth / 2; }
    book.style.transform = dx ? 'translateX(' + dx + 'px)' : '';
  }
  flip.on('changeState', function (e) { if (e.data === 'flipping' || e.data === 'user_fold') centreCover(true); if (e.data === 'read') centreCover(false); });

  function go(n) {
    n = Math.min(TOTAL, Math.max(1, n));
    ensureImages(n, PHONE ? 2 : 4);
    resetZoom();
    var v = visible();
    if (v.indexOf(n) >= 0) return;
    if (reduce) { flip.turnToPage(n - 1); refresh(); return; }
    // Adjacent spreads get a real page turn; distant jumps turn one sheet to the target.
    programmatic(function () { flip.flip(n - 1, 'top'); });
    setTimeout(refresh, 1100);
  }
  // page-flip applies disableFlipByClick to its own API calls too (and miscomputes the corner when the
  // book is centred), so the option is lifted just for a programmatic turn. Reader clicks stay corner-only.
  function programmatic(fn) { var st = flip.getSettings(); st.disableFlipByClick = false; try { fn(); } finally { st.disableFlipByClick = true; } }
  function next() { if (zoom > 1) resetZoom(); programmatic(function () { flip.flipNext('top'); }); }
  function prev() { if (zoom > 1) resetZoom(); programmatic(function () { flip.flipPrev('top'); }); }
  $('btnNext').onclick = next; $('edgeNext').onclick = next;
  $('btnPrev').onclick = prev; $('edgePrev').onclick = prev;

  $('jump').addEventListener('submit', function (e) {
    e.preventDefault();
    var n = parseInt(input.value, 10);
    if (!isNaN(n)) go(n);
    input.blur(); refresh();
  });
  input.addEventListener('focus', function () { input.select(); });

  $('progress').addEventListener('click', function (e) {
    var r = this.getBoundingClientRect();
    go(Math.round((e.clientX - r.left) / r.width * (TOTAL - 1)) + 1);
  });

  // Links inside pages must not start a page turn: keep the press away from the flipbook.
  ['mousedown', 'touchstart'].forEach(function (ev) {
    book.addEventListener(ev, function (e) { if (e.target.closest && e.target.closest('a')) e.stopPropagation(); }, { capture: true, passive: true });
  });
  // Internal links inside pages: <a href="#pg-NN"> (contents, gauge, cross-references)
  book.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#pg-"]');
    if (a) { e.preventDefault(); e.stopPropagation(); go(parseInt(a.getAttribute('href').slice(4), 10)); }
  }, true);
  document.querySelector('.brand').addEventListener('click', function (e) { e.preventDefault(); go(1); });
  window.addEventListener('hashchange', function () { var n = pageFromHash(); if (visible().indexOf(n) < 0) go(n); });

  // ---- Zoom and pan ----
  var panLayer = $('panLayer');
  function setTransform() {
    wrap.style.transform = zoom === 1 ? '' : 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoom + ')';
    $('zoomVal').textContent = Math.round(zoom * 100) + '%';
    panLayer.hidden = zoom === 1;
    $('zoomOut').disabled = zoom <= 1; $('zoomIn').disabled = zoom >= 4;
  }
  function clampPan() {
    var w = wrap.offsetWidth, h = wrap.offsetHeight;
    var maxX = 0, minX = w - w * zoom, maxY = 0, minY = h - h * zoom;
    panX = Math.min(maxX + 120, Math.max(minX - 120, panX));
    panY = Math.min(maxY + 120, Math.max(minY - 120, panY));
  }
  function setZoom(z, cx, cy) {
    z = Math.min(4, Math.max(1, z));
    var w = wrap.offsetWidth, h = wrap.offsetHeight;
    if (cx === undefined) { cx = w / 2; cy = h / 2; }
    var px = (cx - panX) / zoom, py = (cy - panY) / zoom;
    zoom = z;
    panX = cx - px * zoom; panY = cy - py * zoom;
    if (zoom === 1) { panX = panY = 0; } else clampPan();
    wrap.style.transformOrigin = '0 0';
    setTransform();
  }
  function resetZoom() { if (zoom !== 1) setZoom(1); }
  $('zoomIn').onclick = function () { setZoom(zoom + 0.5); };
  $('zoomOut').onclick = function () { setZoom(zoom - 0.5); };
  $('zoomVal').onclick = function () { setZoom(1); };
  setTransform();

  var ptrs = {}, pinch0 = null, drag = null;
  panLayer.addEventListener('pointerdown', function (e) {
    panLayer.setPointerCapture(e.pointerId);
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    drag = { x: e.clientX, y: e.clientY, px: panX, py: panY };
    pinch0 = null;
  });
  panLayer.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId]) return;
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(ptrs);
    if (ids.length === 2) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (!pinch0) pinch0 = { d: d, z: zoom };
      var r = wrap.getBoundingClientRect();
      setZoom(pinch0.z * d / pinch0.d, (a.x + b.x) / 2 - stage.getBoundingClientRect().left - wrap.offsetLeft, (a.y + b.y) / 2 - stage.getBoundingClientRect().top - wrap.offsetTop);
      void r;
    } else if (drag) {
      panX = drag.px + e.clientX - drag.x; panY = drag.py + e.clientY - drag.y; clampPan(); setTransform();
    }
  });
  function ptrUp(e) { delete ptrs[e.pointerId]; pinch0 = null; drag = null; }
  panLayer.addEventListener('pointerup', ptrUp); panLayer.addEventListener('pointercancel', ptrUp);
  stage.addEventListener('wheel', function (e) {
    if (!(e.ctrlKey || e.metaKey) && zoom === 1) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      var r = wrap.parentElement.getBoundingClientRect();
      setZoom(zoom * (e.deltaY < 0 ? 1.12 : 0.89), e.clientX - r.left - wrap.offsetLeft, e.clientY - r.top - wrap.offsetTop);
    } else { panX -= e.deltaX; panY -= e.deltaY; clampPan(); setTransform(); }
  }, { passive: false });
  // Double-tap / double-click on the page zooms at that point
  book.addEventListener('dblclick', function (e) {
    var r = wrap.parentElement.getBoundingClientRect();
    setZoom(2, e.clientX - r.left - wrap.offsetLeft, e.clientY - r.top - wrap.offsetTop);
  });
  // Two-finger pinch from the unzoomed state: intercept before the flipbook sees it
  stage.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2 && zoom === 1) { e.stopPropagation(); pinchStart = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
  }, { capture: true, passive: true });
  var pinchStart = 0;
  stage.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2 && pinchStart) {
      e.stopPropagation();
      var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (d / pinchStart > 1.08) { setZoom(Math.min(2, d / pinchStart)); pinchStart = 0; }
    }
  }, { capture: true, passive: true });

  // ---- Fullscreen ----
  var fsBtn = $('btnFs');
  if (!document.documentElement.requestFullscreen) { fsBtn.hidden = true; fsBtn.style.display = 'none'; }
  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(function () {});
  }
  fsBtn.onclick = toggleFs;
  document.addEventListener('fullscreenchange', function () {
    fsBtn.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
    setTimeout(function () { applyScale(); refresh(); }, 120);
  });

  // ---- Panels ----
  function openPanel(el, focusEl) { lastFocus = document.activeElement; closePanels(true); el.hidden = false; (focusEl || el.querySelector('[data-close]')).focus(); }
  function closePanels(keep) {
    ['tocPanel', 'thumbPanel', 'readPanel'].forEach(function (id) { $(id).hidden = true; });
    if (!keep && lastFocus) { try { lastFocus.focus(); } catch (e) {} lastFocus = null; }
  }
  document.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = function () { closePanels(); }; });
  function anyPanelOpen() { return !$('tocPanel').hidden || !$('thumbPanel').hidden || !$('readPanel').hidden; }

  // Contents
  var tl = $('tocList');
  var coverBtn = '';
  window.RC_TOC.forEach(function (s) {
    coverBtn += '<button class="s" data-p="' + s.p + '"><span class="n">' + s.n + '</span><span>' + s.t.replace('&', '&amp;') + '</span><span class="p">' + s.p + '</span></button>';
    s.subs.forEach(function (c) { coverBtn += '<button class="c" data-p="' + c.p + '"><span></span><span>' + c.t + '</span><span class="p">' + c.p + '</span></button>'; });
  });
  tl.innerHTML = coverBtn;
  tl.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { closePanels(); go(parseInt(b.getAttribute('data-p'), 10)); } });
  $('btnToc').onclick = function () { openPanel($('tocPanel')); };

  // Thumbnails
  var tg = $('thumbGrid'), thumbsBuilt = false;
  function buildThumbs() {
    if (thumbsBuilt) return; thumbsBuilt = true;
    var h = '';
    for (var i = 1; i <= TOTAL; i++) {
      var f = ('00' + i).slice(-3);
      h += '<button data-p="' + i + '" aria-label="Page ' + i + (window.RC_LABELS[i] ? ': ' + window.RC_LABELS[i] : '') + '"><img loading="lazy" src="assets/thumbs/p' + f + '.webp" alt="">' + i + '</button>';
    }
    tg.innerHTML = h;
    markThumb();
  }
  function markThumb() {
    if (!thumbsBuilt) return;
    var v = visible();
    tg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('cur', v.indexOf(parseInt(b.getAttribute('data-p'), 10)) >= 0); });
  }
  tg.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { closePanels(); go(parseInt(b.getAttribute('data-p'), 10)); } });
  $('btnThumbs').onclick = function () {
    buildThumbs(); openPanel($('thumbPanel'));
    var c = tg.querySelector('.cur'); if (c) c.scrollIntoView({ block: 'center' });
  };

  // Reading view: the same DOM text, reflowed. No separate copy to drift out of sync.
  var readAt = null;
  function fillRead(list) {
    var body = $('readBody'); body.innerHTML = '';
    list.forEach(function (n) {
      var src = pages[n - 1], m = document.createElement('p');
      m.className = 'pgmark'; m.textContent = 'Page ' + n + (window.RC_LABELS[n] ? ' · ' + window.RC_LABELS[n] : '');
      body.appendChild(m);
      var c = src.cloneNode(true);
      c.querySelectorAll('.rh,.ft,.gg,.big,[aria-hidden="true"],img,svg,hr,.bg').forEach(function (x) { x.remove(); });
      Array.prototype.slice.call(c.querySelectorAll('h1,h2,h3,h4,p,ul,ol,table,a')).forEach(function (el) {
        // keep only top-level text blocks, in reading order
        if (el.parentElement.closest('ul,ol,table,p,h1,h2,h3,h4')) return;
        var k = el.cloneNode(true);
        k.removeAttribute('style'); k.querySelectorAll('[style]').forEach(function (x) { x.removeAttribute('style'); });
        body.appendChild(k);
      });
    });
    body.scrollTop = 0;
    readAt = list;
    $('readTitle').textContent = 'Reading view · ' + (list.length > 1 ? 'pages ' + list[0] + '-' + list[1] : 'page ' + list[0]);
    $('readPrev').disabled = list[0] <= 1; $('readNext').disabled = list[list.length - 1] >= TOTAL;
    body.querySelectorAll('a[href^="#pg-"]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); var n = parseInt(a.getAttribute('href').slice(4), 10); fillRead([n]); flip.turnToPage(n - 1); refresh(); });
    });
  }
  $('btnRead').onclick = function () { fillRead(visible()); openPanel($('readPanel')); };
  $('readPrev').onclick = function () { var n = readAt[0] - 1; if (n >= 1) { fillRead([n]); flip.turnToPage(n - 1); refresh(); } };
  $('readNext').onclick = function () { var n = readAt[readAt.length - 1] + 1; if (n <= TOTAL) { fillRead([n]); flip.turnToPage(n - 1); refresh(); } };

  // First visit on a phone-size screen: point at Reading view once.
  (function () {
    var h = $('hint'), seen = false;
    try { seen = localStorage.getItem('rc-hint') === '1'; } catch (e) {}
    if (seen || window.innerWidth >= 700) return;
    h.hidden = false;
    var close = function () { h.hidden = true; try { localStorage.setItem('rc-hint', '1'); } catch (e) {} };
    h.onclick = function () { close(); $('btnRead').click(); };
    setTimeout(close, 6000);
    $('btnRead').addEventListener('click', close);
  })();

  // ---- Keyboard ----
  document.addEventListener('keydown', function (e) {
    if (e.target === input) return;
    if (e.key === 'Escape') { if (anyPanelOpen()) closePanels(); else resetZoom(); return; }
    if (anyPanelOpen()) return;
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': case ' ': e.preventDefault(); next(); break;
      case 'ArrowLeft': case 'PageUp': e.preventDefault(); prev(); break;
      case 'Home': e.preventDefault(); go(1); break;
      case 'End': e.preventDefault(); go(TOTAL); break;
      case '+': case '=': setZoom(zoom + 0.5); break;
      case '-': case '_': setZoom(zoom - 0.5); break;
      case '0': setZoom(1); break;
      case 'f': case 'F': toggleFs(); break;
      case 't': case 'T': $('btnThumbs').click(); break;
      case 'c': case 'C': $('btnToc').click(); break;
      case 'r': case 'R': $('btnRead').click(); break;
    }
  });

  // Test hook, harmless in production
  window.RC_READER = { flip: flip, go: go, visible: visible, cur: cur, setZoom: setZoom, getZoom: function () { return zoom; }, fillRead: fillRead };
})();
