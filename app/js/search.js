/* ARCHIVE PRO APP — search.js
   DOM wiring only: search input (debounced), section <select>, sort
   <select>, reset/focus-search buttons. Every handler calls a filter.js
   setter, which mutates state and calls window.APP_RENDER() itself —
   search.js never renders anything directly. */
window.APP_SEARCH = (function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var searchTimer = null;
  var bound = false;

  function debounce(fn, delay) {
    return function () {
      var args = arguments;
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () { fn.apply(null, args); }, delay);
    };
  }

  function populateSectionSelect(sections) {
    var select = $('#sectionSelect');
    if (!select) return;
    var current = select.value || 'all';
    select.innerHTML = '<option value="all">전체 섹션</option>';
    sections
      .slice()
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
      .forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = String(s.id != null ? s.id : s.section_id);
        opt.textContent = s.title_kr || s.kr || s.title_en || s.en || opt.value;
        select.appendChild(opt);
      });
    select.value = current;
  }

  function init() {
    if (bound) return; // idempotency guard
    bound = true;

    var searchInput = $('#searchInput');
    var sectionSelect = $('#sectionSelect');
    var sortSelect = $('#sortSelect');
    var resetBtn = $('#resetBtn');
    var focusSearchBtn = $('#focusSearchBtn');

    if (searchInput) {
      searchInput.addEventListener('input', debounce(function (e) {
        window.APP_FILTER.setSearchQuery(e.target.value);
      }, 180));
    }

    if (sectionSelect) {
      sectionSelect.addEventListener('change', function (e) {
        window.APP_FILTER.setSectionFilter(e.target.value);
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener('change', function (e) {
        window.APP_FILTER.setSortMode(e.target.value);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        window.APP_FILTER.setSectionFilter('all');
        window.APP_FILTER.setSortMode('section-id-asc');
        window.APP_FILTER.setSearchQuery('');
        // Select/input values are synced from state by ui.js's
        // renderFilters() — no manual DOM writes needed here.
      });
    }

    if (focusSearchBtn && searchInput) {
      focusSearchBtn.addEventListener('click', function () {
        searchInput.focus();
        searchInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
  }

  return { init: init, populateSectionSelect: populateSectionSelect };
})();
