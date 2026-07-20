/* ARCHIVE PRO APP — viewer.js
   Per Lumera's review: viewer no longer owns its own scale/pan/index
   state — those live in filter.js's shared state object. This module:
   1) mutates state.scale/panX/panY/currentIndex/viewerOpen in response
      to gestures (wheel, drag, pinch, swipe, double-tap, keyboard), then
   2) calls window.APP_RENDER() — the single render entry — every time,
      never painting the DOM itself outside of renderViewer().
   Ephemeral gesture bookkeeping (isDragging, touch start coordinates,
   tap timing, etc.) stays local here — those aren't "state" in the
   product sense, just interaction plumbing, and don't need to be shared.
*/
window.APP_VIEWER = (function () {
  'use strict';

  var filterMod = window.APP_FILTER;
  var $ = function (sel) { return document.querySelector(sel); };

  var els = {};
  var loadToken = 0;
  var lastRenderedIndex = -1;
  var frameCache = null;

  // Ephemeral gesture state only — NOT part of the shared app state.
  var startX = 0, startY = 0, lastX = 0, lastY = 0;
  var startTX = 0, startTY = 0;
  var isDragging = false, isZooming = false, touchMoved = false;
  var initialDistance = 0, startScale = 1;
  var lastTap = 0;
  var swipeDX = 0, swipeDY = 0, swipeLocked = false;
  var busy = false, lastSwipeTime = 0;
  var mouseDragging = false, mouseLastX = 0, mouseLastY = 0;

  var SWIPE_THRESHOLD = 45;
  var SWIPE_VERTICAL_LIMIT = 70;
  var SWIPE_COOLDOWN = 45;

  function state() { return filterMod.state; }
  function clampNum(v, min, max) { return Math.min(Math.max(v, min), max); }
  function getTouchDistance(t1, t2) { return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY); }

  function markBusy() {
    busy = true;
    clearTimeout(window.__apViewerBusyTimer);
    window.__apViewerBusyTimer = setTimeout(function () { busy = false; }, 180);
  }

  function invalidateFrameCache() { frameCache = null; }

  // Runs unconditionally regardless of input device (mouse, touch, pen) —
  // per principle "Clamp는 항상 적용", no touch-only / mobile-only gate.
  function clampToFrame(s) {
    if (!els.stage || !els.image) return;
    if (s.scale <= 1) { s.panX = 0; s.panY = 0; return; }

    if (!frameCache) {
      var frame = els.stage.getBoundingClientRect();
      if (!frame.width || !frame.height) return;
      var boxW = els.image.offsetWidth || frame.width;
      var boxH = els.image.offsetHeight || frame.height;
      var natW = els.image.naturalWidth || boxW;
      var natH = els.image.naturalHeight || boxH;
      var fit = Math.min(boxW / natW, boxH / natH) || 1;
      frameCache = { boxW: boxW, boxH: boxH, renderedW: natW * fit, renderedH: natH * fit };
    }

    var scaledW = frameCache.renderedW * s.scale;
    var scaledH = frameCache.renderedH * s.scale;
    var maxX = Math.max(0, (scaledW - frameCache.boxW) / 2);
    var maxY = Math.max(0, (scaledH - frameCache.boxH) / 2);
    s.panX = maxX > 0 ? clampNum(s.panX, -maxX, maxX) : 0;
    s.panY = maxY > 0 ? clampNum(s.panY, -maxY, maxY) : 0;
  }

  // applyTransform() -> clamp() -> updateCursor(), per Lumera's required
  // order. Reads/writes state.scale/panX/panY directly — this is the
  // ONE place transform math happens.
  function applyTransform() {
    var s = state();
    if (s.scale <= 1.02) { s.scale = 1; s.panX = 0; s.panY = 0; }
    clampToFrame(s);
    if (els.image) {
      els.image.style.transform = 'translate3d(' + s.panX + 'px, ' + s.panY + 'px, 0) scale(' + s.scale + ')';
    }
    updateCursor();
  }

  function updateCursor() {
    if (!els.stage) return;
    els.stage.classList.toggle('is-zoomed', state().scale > 1.02);
  }

  function resetTransform() {
    var s = state();
    s.scale = 1; s.panX = 0; s.panY = 0;
    isDragging = false; isZooming = false; mouseDragging = false;
    startScale = 1; initialDistance = 0; touchMoved = false;
    invalidateFrameCache();
    if (els.stage) els.stage.classList.remove('is-dragging', 'is-zoomed');
    if (els.image) {
      els.image.classList.add('no-transition');
      els.image.style.transform = 'translate3d(0px, 0px, 0) scale(1)';
      requestAnimationFrame(function () {
        if (els.image) els.image.classList.remove('no-transition');
      });
    }
  }

  function toggleZoomAndRender() {
    var s = state();
    s.scale = s.scale > 1 ? 1 : 2;
    s.panX = 0; s.panY = 0;
    applyTransform();
    rerender();
  }

  function preloadNeighbors() {
    var s = state();
    var items = s.filtered;
    if (items.length < 2) return;
    [items[s.currentIndex + 1], items[s.currentIndex - 1]].forEach(function (item) {
      if (!item) return;
      var url = item.zoom || item.image;
      if (!url) return;
      var pre = new Image();
      pre.decoding = 'async';
      pre.src = url;
    });
  }

  function isOrigin(item) { return Number(item.section_id) === 0; }

  // Loads captions + progressive image for the current slide. Only runs
  // when currentIndex actually changed since the last renderViewer() call
  // — repeated renderViewer() calls during a zoom/pan gesture must NOT
  // reload the image.
  function loadSlide(item) {
    loadToken += 1;
    var thisToken = loadToken;

    var title = isOrigin(item) ? '무제' : (filterMod.getTitle(item) || '무제');
    var material = isOrigin(item) ? '—' : (filterMod.getMaterial(item) || '—');
    var size = isOrigin(item) ? '—' : (filterMod.getSize(item) || '—');
    var year = isOrigin(item) ? '—' : (filterMod.getYear(item) || '—');
    var imageUrl = item.image || '';
    var zoomUrl = item.zoom || '';

    if (els.lbId) els.lbId.textContent = item.id || '—';
    if (els.lbTitle) els.lbTitle.textContent = title;
    if (els.lbSection) els.lbSection.textContent = filterMod.sectionTextFor(item);
    if (els.lbMaterial) els.lbMaterial.textContent = material;
    if (els.lbSize) els.lbSize.textContent = size;
    if (els.lbYear) els.lbYear.textContent = year;
    if (els.lbImagePath) els.lbImagePath.textContent = imageUrl || '—';
    if (els.lbZoomPath) els.lbZoomPath.textContent = zoomUrl || '—';
    if (els.lbOpenImage) els.lbOpenImage.href = imageUrl || '#';
    if (els.lbOpenZoom) els.lbOpenZoom.href = zoomUrl || imageUrl || '#';

    if (els.image) {
      els.image.alt = title;
      els.image.classList.remove('is-ready');
      els.image.classList.add('is-loading');
      els.image.src = imageUrl || zoomUrl || '';
      els.image.onload = function () {
        if (thisToken !== loadToken) return;
        els.image.classList.remove('is-loading');
        els.image.classList.add('is-ready');
        invalidateFrameCache();
        if (zoomUrl && zoomUrl !== imageUrl) {
          var pre = new Image();
          pre.onload = function () {
            if (thisToken !== loadToken || !els.image) return;
            els.image.src = zoomUrl;
            invalidateFrameCache();
          };
          pre.src = zoomUrl;
        }
      };
    }

    preloadNeighbors();
  }

  // The single paint function for the viewer, called every time
  // window.APP_RENDER() runs. Cheap to call repeatedly: only reloads the
  // slide image when currentIndex changed, otherwise just re-applies the
  // transform (so it's safe to call on every wheel/drag tick too).
  function renderViewer() {
    var s = state();

    if (els.lightbox) {
      els.lightbox.classList.toggle('open', s.viewerOpen);
      els.lightbox.setAttribute('aria-hidden', String(!s.viewerOpen));
    }
    document.documentElement.classList.toggle('viewer-open', s.viewerOpen);
    document.body.classList.toggle('viewer-open', s.viewerOpen);
    document.documentElement.style.overflow = s.viewerOpen ? 'hidden' : '';
    document.body.style.overflow = s.viewerOpen ? 'hidden' : '';

    if (!s.viewerOpen) {
      if (lastRenderedIndex !== -1 && els.image) {
        els.image.removeAttribute('src');
        els.image.alt = '';
      }
      lastRenderedIndex = -1;
      return;
    }

    var item = s.filtered[s.currentIndex];
    if (!item) return;

    if (s.currentIndex !== lastRenderedIndex) {
      lastRenderedIndex = s.currentIndex;
      resetTransform();
      loadSlide(item);
    }

    applyTransform();
  }

  function rerender() {
    if (typeof window.APP_RENDER === 'function') window.APP_RENDER();
    else renderViewer();
  }

  function next() {
    var s = state();
    if (isZooming || s.scale > 1.02) return;
    if (!s.filtered.length) return;
    var target = Math.min(s.currentIndex + 1, s.filtered.length - 1);
    if (target === s.currentIndex) return;
    s.currentIndex = target;
    rerender();
  }

  function prev() {
    var s = state();
    if (isZooming || s.scale > 1.02) return;
    if (!s.filtered.length) return;
    var target = Math.max(s.currentIndex - 1, 0);
    if (target === s.currentIndex) return;
    s.currentIndex = target;
    rerender();
  }

  function open(index) {
    var s = state();
    if (!s.filtered.length) return;
    s.currentIndex = clampNum(index, 0, s.filtered.length - 1);
    s.viewerOpen = true;
    s.scale = 1; s.panX = 0; s.panY = 0;
    rerender();
  }

  function returnToLastViewed(returnIndex) {
    if (returnIndex == null || returnIndex < 0) return;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var target = window.APP_UI ? window.APP_UI.ensureCardRenderedForIndex(returnIndex) : null;
        if (!target) return;
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      });
    });
  }

  function close() {
    var s = state();
    var returnIndex = s.currentIndex;
    s.viewerOpen = false;
    s.scale = 1; s.panX = 0; s.panY = 0;
    resetTransform();
    rerender();
    returnToLastViewed(returnIndex);
  }

  function isOpen() { return !!state().viewerOpen; }
  function isCloseTarget(e) {
    return !!(e && e.target && e.target.closest && e.target.closest('.lightbox-close, .viewer-close'));
  }

  function bindEvents() {
    if (!els.lightbox) return;

    if (els.closeBtn) els.closeBtn.addEventListener('click', close);
    if (els.prevBtn) els.prevBtn.addEventListener('click', function (e) { e.preventDefault(); prev(); });
    if (els.nextBtn) els.nextBtn.addEventListener('click', function (e) { e.preventDefault(); next(); });

    els.lightbox.addEventListener('click', function (e) {
      if (e.target === els.lightbox) close();
    });

    els.lightbox.addEventListener('dblclick', function (e) {
      if (!isOpen()) return;
      e.preventDefault();
      toggleZoomAndRender();
    });

    // Mouse wheel / trackpad zoom.
    els.lightbox.addEventListener('wheel', function (e) {
      if (!isOpen()) return;
      e.preventDefault();
      var s = state();
      var delta = -e.deltaY * 0.0015;
      s.scale = clampNum(s.scale + delta * s.scale, 1, 4);
      applyTransform();
      rerender();
      markBusy();
    }, { passive: false });

    // Mouse drag-to-pan when zoomed. Same clamp/cursor path as touch —
    // no device-specific branch beyond "which event fired".
    els.lightbox.addEventListener('mousedown', function (e) {
      var s = state();
      if (!isOpen() || s.scale <= 1.02 || e.button !== 0) return;
      e.preventDefault();
      mouseDragging = true;
      mouseLastX = e.clientX;
      mouseLastY = e.clientY;
      if (els.stage) els.stage.classList.add('is-dragging');
    });
    document.addEventListener('mousemove', function (e) {
      var s = state();
      if (!mouseDragging || s.scale <= 1.02) return;
      s.panX += e.clientX - mouseLastX;
      s.panY += e.clientY - mouseLastY;
      mouseLastX = e.clientX;
      mouseLastY = e.clientY;
      applyTransform();
      rerender();
    });
    document.addEventListener('mouseup', function () {
      mouseDragging = false;
      if (els.stage) els.stage.classList.remove('is-dragging');
    });

    // Touch: pinch zoom, swipe navigation, double-tap zoom, pan when zoomed.
    els.lightbox.addEventListener('touchstart', function (e) {
      if (isCloseTarget(e) || !isOpen()) return;
      var s = state();

      if (e.touches.length === 2) {
        e.preventDefault();
        isZooming = true; isDragging = false; touchMoved = false;
        swipeLocked = false; swipeDX = 0; swipeDY = 0;
        initialDistance = getTouchDistance(e.touches[0], e.touches[1]);
        startScale = s.scale; startTX = s.panX; startTY = s.panY;
        return;
      }
      if (e.touches.length !== 1) return;

      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      lastX = startX; lastY = startY;
      swipeDX = 0; swipeDY = 0; swipeLocked = false; touchMoved = false;

      if (s.scale > 1.02) {
        e.preventDefault();
        isDragging = true;
        startTX = s.panX; startTY = s.panY;
        return;
      }
      isDragging = true;
    }, { passive: false });

    els.lightbox.addEventListener('touchmove', function (e) {
      if (isCloseTarget(e) || !isOpen()) return;
      var s = state();

      if (isZooming && e.touches.length === 2) {
        e.preventDefault();
        var newDist = getTouchDistance(e.touches[0], e.touches[1]);
        if (!initialDistance) initialDistance = newDist;
        s.scale = clampNum(startScale * (newDist / initialDistance), 1, 4);
        if (s.scale <= 1.02) { s.panX = 0; s.panY = 0; } else { s.panX = startTX; s.panY = startTY; }
        applyTransform();
        rerender();
        markBusy();
        return;
      }

      if (!isDragging || e.touches.length !== 1) return;

      var nowX = e.touches[0].clientX;
      var nowY = e.touches[0].clientY;
      var moveX = nowX - startX;
      var moveY = nowY - startY;
      if (Math.abs(moveX) > 4 || Math.abs(moveY) > 4) touchMoved = true;

      if (s.scale > 1.02) {
        e.preventDefault();
        s.panX = startTX + moveX;
        s.panY = startTY + moveY;
        applyTransform();
        rerender();
        markBusy();
        return;
      }

      swipeDX = moveX; swipeDY = moveY;
      lastX = nowX; lastY = nowY;
      if (Math.abs(swipeDX) > Math.abs(swipeDY)) {
        if (Math.abs(swipeDX) > 12) swipeLocked = true;
        e.preventDefault();
      }
    }, { passive: false });

    els.lightbox.addEventListener('touchend', function (e) {
      if (isCloseTarget(e) || !isOpen()) return;
      var s = state();

      if (isZooming && e.touches.length < 2) {
        e.preventDefault();
        isZooming = false; initialDistance = 0; startScale = s.scale;
        if (s.scale <= 1.02) { s.panX = 0; s.panY = 0; applyTransform(); rerender(); }
        return;
      }
      if (!isDragging) return;

      if (s.scale > 1.02) {
        isDragging = false; touchMoved = false; swipeLocked = false;
        swipeDX = 0; swipeDY = 0;
        return;
      }

      var horizontal = Math.abs(swipeDX), vertical = Math.abs(swipeDY);
      var now = performance.now();

      if (swipeLocked && !busy && now - lastSwipeTime > SWIPE_COOLDOWN &&
          horizontal > SWIPE_THRESHOLD && vertical < SWIPE_VERTICAL_LIMIT) {
        e.preventDefault();
        lastSwipeTime = now;
        var direction = swipeDX > 0 ? -1 : 1;
        requestAnimationFrame(function () { direction < 0 ? prev() : next(); });
        lastTap = 0;
      } else if (horizontal < 12 && vertical < 12 && !touchMoved) {
        var tapNow = Date.now();
        if (tapNow - lastTap < 300) {
          e.preventDefault();
          toggleZoomAndRender();
          lastTap = 0;
        } else {
          lastTap = tapNow;
        }
      }

      isDragging = false; touchMoved = false; swipeLocked = false;
      swipeDX = 0; swipeDY = 0;
    }, { passive: false });

    els.lightbox.addEventListener('touchcancel', function () {
      var s = state();
      isDragging = false; isZooming = false; initialDistance = 0;
      startScale = s.scale; startTX = s.panX; startTY = s.panY;
      touchMoved = false; swipeLocked = false; swipeDX = 0; swipeDY = 0;
    }, { passive: false });

    document.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'ArrowRight') { next(); return; }
      if (e.key === 'ArrowLeft') { prev(); return; }
      if (e.key === 'Escape') { close(); return; }
    });

    window.addEventListener('resize', invalidateFrameCache, { passive: true });
    window.addEventListener('orientationchange', invalidateFrameCache, { passive: true });
  }

  var bound = false;
  function init() {
    if (bound) return; // idempotency guard
    bound = true;

    els.lightbox = $('#lightbox');
    els.closeBtn = $('#viewerCloseBtn');
    els.prevBtn = $('#lightboxPrev');
    els.nextBtn = $('#lightboxNext');
    els.stage = document.querySelector('.lightbox-stage');
    els.image = $('#lightboxImage');
    els.lbId = $('#lbId');
    els.lbTitle = $('#lbTitle');
    els.lbSection = $('#lbSection');
    els.lbMaterial = $('#lbMaterial');
    els.lbSize = $('#lbSize');
    els.lbYear = $('#lbYear');
    els.lbImagePath = $('#lbImagePath');
    els.lbZoomPath = $('#lbZoomPath');
    els.lbOpenImage = $('#lbOpenImage');
    els.lbOpenZoom = $('#lbOpenZoom');
    bindEvents();
  }

  return { init: init, open: open, close: close, next: next, prev: prev, renderViewer: renderViewer };
})();
