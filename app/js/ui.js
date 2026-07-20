/* ARCHIVE PRO APP — ui.js
   Renders #grid from filter.js's state.filtered, keeps #resultsMeta stats
   in sync, and handles the "Load more" pagination + lazy image loading.
   Card click delegates straight to viewer.js's openViewer(). */
window.APP_UI = (function () {
  'use strict';

  var cfg = window.APP_CONFIG;
  var filterMod = window.APP_FILTER;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  var SVG_PLACEHOLDER = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="4" height="5"></svg>';
  var lazyObserver = null;

  function escapeHTML(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function buildAltText(work) {
    var title = filterMod.getTitle(work);
    var year = work.year ? String(work.year) : '';
    return title
      ? (title + (year ? ', ' + year : ''))
      : ('무제' + (year ? ', ' + year : ''));
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
    if (observer) {
      imgs.forEach(function (img) { observer.observe(img); });
    } else {
      imgs.forEach(loadLazyImage);
    }
  }

  function renderGrid() {
    var grid = $('#grid');
    var empty = $('#emptyState');
    var loadWrap = $('#loadWrap');
    var state = filterMod.state;
    if (!grid) return;

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

  function loadMore() {
    var state = filterMod.state;
    state.visibleCount += cfg.LOAD_STEP;
    renderGrid();
    updateStats();
  }

  function bindGridClicks() {
    var grid = $('#grid');
    if (!grid) return;
    grid.addEventListener('click', function (e) {
      var card = e.target.closest('.card');
      if (!card) return;
      var index = Number(card.dataset.index);
      if (window.APP_VIEWER && Number.isFinite(index)) {
        window.APP_VIEWER.open(index);
      }
    });
  }

  function init() {
    bindGridClicks();
    var loadMoreBtn = $('#loadMoreBtn');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', loadMore);
  }

  return {
    init: init,
    renderGrid: renderGrid,
    updateStats: updateStats,
    ensureCardRenderedForIndex: function (index) {
      var state = filterMod.state;
      if (index >= state.visibleCount) {
        state.visibleCount = index + 1;
        renderGrid();
        updateStats();
      }
      return $('.card[data-index="' + index + '"]', $('#grid'));
    }
  };
})();
