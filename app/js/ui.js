/* ARCHIVE PRO APP — ui.js
   Renders the grid + stats + filter controls from state (filter.js owns
   the state object; this module only reads it and paints DOM). Card
   clicks mutate state and call window.APP_RENDER() — they do not call
   viewer.js directly, per the "state drives render, not imperative calls
   between modules" principle. */
window.APP_UI = (function () {
  'use strict';

  var cfg = window.APP_CONFIG;
  var filterMod = window.APP_FILTER;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var SVG_PLACEHOLDER = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="4" height="5"></svg>';
  var lazyObserver = null;
  var bound = false;

  function escapeHTML(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function buildAltText(work) {
    var title = filterMod.getTitle(work);
    var year = work.year ? String(work.year) : '';
    return title ? (title + (year ? ', ' + year : '')) : ('무제' + (year ? ', ' + year : ''));
  }

  function buildCardHTML(work, index) {
    try {
      var title = filterMod.getTitle(work);
      var material = filterMod.getMaterial(work);
      var year = work.year;
      var rawImage = work.image || '';
      var priority = index < cfg.INITIAL_EAGER_COUNT;
      var imgSrc = priority ? (rawImage || SVG_PLACEHOLDER) : SVG_PLACEHOLDER;
      var dataSrc = (!priority && rawImage) ? ' data-src="' + escapeHTML(rawImage) + '"' : '';
      var altText = buildAltText(work);

      return (
        '<article class="card" data-index="' + index + '" data-id="' + escapeHTML(work.id) + '">' +
          '<div class="thumb-wrap">' +
            '<img class="thumb' + (priority ? ' is-loaded' : '') + '" src="' + escapeHTML(imgSrc) + '"' + dataSrc +
            ' alt="' + escapeHTML(altText) + '" loading="' + (priority ? 'eager' : 'lazy') + '" decoding="async" fetchpriority="' + (priority ? 'high' : 'low') + '">' +
          '</div>' +
          '<div class="meta">' +
            '<div class="t">' + escapeHTML(title || '\u00A0') + '</div>' +
            '<div class="s">' + escapeHTML(material) + (year ? ' · ' + escapeHTML(year) : '') + '</div>' +
          '</div>' +
        '</article>'
      );
    } catch (e) {
      console.warn('[Archive Pro App] skipped malformed work', work && work.id, e);
      return '';
    }
  }

  function ensureLazyObserver() {
    if (lazyObserver || !('IntersectionObserver' in window)) return lazyObserver;
    lazyObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        loadLazyImage(entry.target);
        observer.unobserve(entry.target);
      });
    }, { root: null, rootMargin: '300px 0px', threshold: 0.01 });
    return lazyObserver;
  }

  function loadLazyImage(img) {
    var src = img.getAttribute('data-src');
    if (!src) return;
    img.addEventListener('load', function () { img.classList.add('is-loaded'); }, { once: true });
    img.src = src;
    img.removeAttribute('data-src');
  }

  function observeLazyImages(root) {
    var observer = ensureLazyObserver();
    var imgs = root.querySelectorAll('img.thumb[data-src]');
    if (observer) imgs.forEach(function (img) { observer.observe(img); });
    else imgs.forEach(loadLazyImage);
  }

  // Renders only the parts of #grid that actually need new markup: if the
  // filtered list + visibleCount haven't changed since the last render,
  // skips the (relatively expensive) innerHTML rebuild. This keeps
  // render() cheap to call after every state change, per Lumera's "single
  // render entry" principle — callers don't need to reason about whether
  // a grid rebuild is "necessary", renderGrid() decides that itself.
  var lastGridSignature = '';

  function renderGrid() {
    var grid = $('#grid');
    var empty = $('#emptyState');
    var loadWrap = $('#loadWrap');
    var state = filterMod.state;
    if (!grid) return;

    var signature = state.filtered.length + ':' + state.visibleCount + ':' + state.lang;
    if (signature === lastGridSignature) return;
    lastGridSignature = signature;

    if (!state.filtered.length) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      if (loadWrap) loadWrap.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;

    var visible = state.filtered.slice(0, state.visibleCount);
    var html = visible.map(function (w, i) { return buildCardHTML(w, i); }).join('');
    var template = document.createElement('template');
    template.innerHTML = html;
    grid.replaceChildren(template.content);
    observeLazyImages(grid);

    if (loadWrap) loadWrap.hidden = visible.length >= state.filtered.length;
  }

  function renderFilters() {
    var state = filterMod.state;
    var sectionSelect = $('#sectionSelect');
    var sortSelect = $('#sortSelect');
    var searchInput = $('#searchInput');
    if (sectionSelect && sectionSelect.value !== state.sectionFilter) sectionSelect.value = state.sectionFilter;
    if (sortSelect && sortSelect.value !== state.sortMode) sortSelect.value = state.sortMode;
    if (searchInput && document.activeElement !== searchInput && searchInput.value !== state.searchQuery) {
      searchInput.value = state.searchQuery;
    }
  }

  function updateStats() {
    var state = filterMod.state;
    var statTotal = $('#statTotal'), statFiltered = $('#statFiltered'), statSections = $('#statSections');
    var apStatTotalTablet = $('#apStatTotalTablet'), apStatFilteredTablet = $('#apStatFilteredTablet'), apStatSectionsTablet = $('#apStatSectionsTablet');
    var resultText = $('#resultText'), renderedText = $('#renderedText');

    var sectionCount = state.sections.length;
    if (statTotal) statTotal.textContent = state.allWorks.length;
    if (statFiltered) statFiltered.textContent = state.filtered.length;
    if (statSections) statSections.textContent = sectionCount;
    if (apStatTotalTablet) apStatTotalTablet.textContent = state.allWorks.length;
    if (apStatFilteredTablet) apStatFilteredTablet.textContent = state.filtered.length;
    if (apStatSectionsTablet) apStatSectionsTablet.textContent = sectionCount;
    if (resultText) resultText.textContent = state.filtered.length + '점';
    if (renderedText) renderedText.textContent = '표시 ' + Math.min(state.visibleCount, state.filtered.length) + '점';
  }

  function bindGridClicks() {
    var grid = $('#grid');
    if (!grid) return;
    grid.addEventListener('click', function (e) {
      var card = e.target.closest('.card');
      if (!card) return;
      var idx = Number(card.dataset.index);
      if (!Number.isFinite(idx)) return;
      var state = filterMod.state;
      // State-driven open: set currentIndex + viewerOpen, then let the
      // single render() entry paint the viewer. ui.js never calls
      // viewer.js's functions directly.
      state.currentIndex = idx;
      state.viewerOpen = true;
      state.scale = 1; state.panX = 0; state.panY = 0;
      if (typeof window.APP_RENDER === 'function') window.APP_RENDER();
    });
  }

  function init() {
    if (bound) return; // idempotency guard — init() must only ever bind once
    bound = true;
    bindGridClicks();
    var loadMoreBtn = $('#loadMoreBtn');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', filterMod.loadMore);
  }

  return {
    init: init,
    renderGrid: renderGrid,
    renderFilters: renderFilters,
    updateStats: updateStats,
    ensureCardRenderedForIndex: function (index) {
      var state = filterMod.state;
      if (index >= state.visibleCount) {
        state.visibleCount = index + 1;
        lastGridSignature = ''; // force rebuild since visibleCount changed
        renderGrid();
        updateStats();
      }
      return $('.card[data-index="' + index + '"]', $('#grid'));
    }
  };
})();
