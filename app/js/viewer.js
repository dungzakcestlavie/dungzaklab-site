/* ARCHIVE PRO APP — viewer.js
   Same engine as the single-file Archive Pro's lightbox, built here with
   the fixes already learned there from day one:
   - clamp runs on every device (mouse AND touch), not touch-only, so
     drag-to-pan while zoomed can never render outside the window.
   - image sizing is max-width/max-height:100% of the (already padded)
     stage box — no separate vw/vh calc that double-shrinks the image.
   - closing the viewer always scrolls back to the last-viewed card,
     rendering it first via ui.js if it wasn't paginated into the DOM yet.
*/
window.APP_VIEWER = (function () {
  'use strict';

  var filterMod = window.APP_FILTER;
  var $ = function (sel) { return document.querySelector(sel); };

  var els = {};
  var items = [];
  var index = 0;
  var loadToken = 0;

  var scale = 1, x = 0, y = 0;
  var startX = 0, startY = 0, lastX = 0, lastY = 0;
  var startTX = 0, startTY = 0;
  var isDragging = false, isZooming = false, touchMoved = false;
  var initialDistance = 0, startScale = 1;
  var lastTap = 0;
  var swipeDX = 0, swipeDY = 0, swipeLocked = false;
  var busy = false, lastSwipeTime = 0;
  var mouseDragging = false, mouseLastX = 0, mouseLastY = 0;
  var frameCache = null;

  var SWIPE_THRESHOLD = 45;
  var SWIPE_VERTICAL_LIMIT = 70;
  var SWIPE_COOLDOWN = 45;

  function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
  function getTouchDistance(t1, t2) { return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY); }

  function markBusy() {
    busy = true;
    clearTimeout(window.__apViewerBusyTimer);
    window.__apViewerBusyTimer = setTimeout(function () { busy = false; }, 180);
  }

  function invalidateFrameCache() { frameCache = null; }

  function clampToFrame() {
    if (!els.stage || !els.image) return;
    if (scale <= 1) { x = 0; y = 0; return; }

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

    var scaledW = frameCache.renderedW * scale;
    var scaledH = frameCache.renderedH * scale;
    var maxX = Math.max(0, (scaledW - frameCache.boxW) / 2);
    var maxY = Math.max(0, (scaledH - frameCache.boxH) / 2);
    x = maxX > 0 ? clamp(x, -maxX, maxX) : 0;
    y = maxY > 0 ? clamp(y, -maxY, maxY) : 0;
  }

  function applyTransform() {
    if (!els.image) return;
    if (scale <= 1.02) { scale = 1; x = 0; y = 0; }
    clampToFrame();
    els.image.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0) scale(' + scale + ')';
    if (els.stage) els.stage.classList.toggle('is-zoomed', scale > 1.02);
  }

  function resetTransform() {
    scale = 1; x = 0; y = 0;
    isDragging = false; isZooming = false; mouseDragging = false;
    startScale = 1; initialDistance = 0; touchMoved = false;
    invalidateFrameCache();
    if (els.stage) els.stage.classList.remove('is-dragging', 'is-zoomed');
    if (els.image) {
      els.image.style.transition = 'none';
      els.image.style.transform = 'translate3d(0px, 0px, 0) scale(1)';
      requestAnimationFrame(function () {
        if (els.image) els.image.style.transition = '';
      });
    }
  }

  function toggleZoom() {
    scale = scale > 1 ? 1 : 2;
    x = 0; y = 0;
    applyTransform();
  }

  function preloadNeighbors() {
    if (items.length < 2) return;
    [items[index + 1], items[index - 1]].forEach(function (item) {
      if (!item) return;
      var url = item.zoom || item.image;
      if (!url) return;
      var pre = new Image();
      pre.decoding = 'async';
      pre.src = url;
    });
  }

  function isOrigin(item) { return Number(item.section_id) === 0; }

  function setSlide(newIndex) {
    if (!items[newIndex]) return;
    markBusy();
    index = newIndex;
    var item = items[index];
    loadToken += 1;
    var thisToken = loadToken;

    resetTransform();

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
      // Progressive load: show the standard image first (usually already
      // warm from the grid thumbnail), swap to the zoom image once it's
      // decoded in the background.
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

  function changeSlideSafely(target) {
    if (!items.length || target === index) return;
    setSlide(target);
  }

  function next() {
    if (isZooming || scale > 1.02) return;
    if (!items.length) return;
    changeSlideSafely(Math.min(index + 1, items.length - 1));
  }
  function prev() {
    if (isZooming || scale > 1.02) return;
    if (!items.length) return;
    changeSlideSafely(Math.max(index - 1, 0));
  }

  function isOpen() {
    return !!(els.lightbox && els.lightbox.classList.contains('open') && document.body.classList.contains('viewer-open'));
  }

  function open(clickedIndex) {
    items = filterMod.state.filtered;
    if (!items.length) return;
    var startAt = clamp(clickedIndex, 0, items.length - 1);

    if (els.lightbox) {
      els.lightbox.classList.add('open');
      els.lightbox.setAttribute('aria-hidden', 'false');
    }
    document.documentElement.classList.add('viewer-open');
    document.body.classList.add('viewer-open');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    setSlide(startAt);
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
    var returnIndex = index;
    if (els.lightbox) {
      els.lightbox.classList.remove('open');
      els.lightbox.setAttribute('aria-hidden', 'true');
    }
    document.documentElement.classList.remove('viewer-open');
    document.body.classList.remove('viewer-open');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    if (els.image) {
      els.image.removeAttribute('src');
      els.image.alt = '';
    }
    loadToken += 1;
    resetTransform();
    items = [];
    index = 0;
    returnToLastViewed(returnIndex);
  }

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
      toggleZoom();
    });

    // Mouse wheel / trackpad zoom.
    els.lightbox.addEventListener('wheel', function (e) {
      if (!isOpen()) return;
      e.preventDefault();
      var delta = -e.deltaY * 0.0015;
      scale = clamp(scale + delta * scale, 1, 4);
      applyTransform();
      markBusy();
    }, { passive: false });

    // Mouse drag-to-pan when zoomed. Cursor becomes a hand via the
    // .is-zoomed/.is-dragging classes toggled in applyTransform()/here.
    els.lightbox.addEventListener('mousedown', function (e) {
      if (!isOpen() || scale <= 1.02 || e.button !== 0) return;
      e.preventDefault();
      mouseDragging = true;
      mouseLastX = e.clientX;
      mouseLastY = e.clientY;
      if (els.stage) els.stage.classList.add('is-dragging');
    });
    document.addEventListener('mousemove', function (e) {
      if (!mouseDragging || scale <= 1.02) return;
      x += e.clientX - mouseLastX;
      y += e.clientY - mouseLastY;
      mouseLastX = e.clientX;
      mouseLastY = e.clientY;
      applyTransform();
    });
    document.addEventListener('mouseup', function () {
      mouseDragging = false;
      if (els.stage) els.stage.classList.remove('is-dragging');
    });

    // Touch: pinch zoom, swipe navigation, double-tap zoom, pan when zoomed.
    els.lightbox.addEventListener('touchstart', function (e) {
      if (isCloseTarget(e) || !isOpen()) return;

      if (e.touches.length === 2) {
        e.preventDefault();
        isZooming = true; isDragging = false; touchMoved = false;
        swipeLocked = false; swipeDX = 0; swipeDY = 0;
        initialDistance = getTouchDistance(e.touches[0], e.touches[1]);
        startScale = scale; startTX = x; startTY = y;
        return;
      }
      if (e.touches.length !== 1) return;

      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      lastX = startX; lastY = startY;
      swipeDX = 0; swipeDY = 0; swipeLocked = false; touchMoved = false;

      if (scale > 1.02) {
        e.preventDefault();
        isDragging = true;
        startTX = x; startTY = y;
        return;
      }
      isDragging = true;
    }, { passive: false });

    els.lightbox.addEventListener('touchmove', function (e) {
      if (isCloseTarget(e) || !isOpen()) return;

      if (isZooming && e.touches.length === 2) {
        e.preventDefault();
        var newDist = getTouchDistance(e.touches[0], e.touches[1]);
        if (!initialDistance) initialDistance = newDist;
        scale = clamp(startScale * (newDist / initialDistance), 1, 4);
        if (scale <= 1.02) { x = 0; y = 0; } else { x = startTX; y = startTY; }
        applyTransform();
        markBusy();
        return;
      }

      if (!isDragging || e.touches.length !== 1) return;

      var nowX = e.touches[0].clientX;
      var nowY = e.touches[0].clientY;
      var moveX = nowX - startX;
      var moveY = nowY - startY;
      if (Math.abs(moveX) > 4 || Math.abs(moveY) > 4) touchMoved = true;

      if (scale > 1.02) {
        e.preventDefault();
        x = startTX + moveX;
        y = startTY + moveY;
        applyTransform();
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

      if (isZooming && e.touches.length < 2) {
        e.preventDefault();
        isZooming = false; initialDistance = 0; startScale = scale;
        if (scale <= 1.02) { x = 0; y = 0; applyTransform(); }
        return;
      }
      if (!isDragging) return;

      if (scale > 1.02) {
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
          toggleZoom();
          lastTap = 0;
        } else {
          lastTap = tapNow;
        }
      }

      isDragging = false; touchMoved = false; swipeLocked = false;
      swipeDX = 0; swipeDY = 0;
    }, { passive: false });

    els.lightbox.addEventListener('touchcancel', function () {
      isDragging = false; isZooming = false; initialDistance = 0;
      startScale = scale; startTX = x; startTY = y;
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

  function init() {
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

  return { init: init, open: open, close: close, next: next, prev: prev };
})();
