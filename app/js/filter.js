/* ARCHIVE PRO APP — filter.js
   Single shared state object for the WHOLE app (per Lumera's architecture
   review): language, section, search, filtered, currentIndex, viewerOpen,
   scale, panX, panY all live here — not scattered across modules. Every
   setter mutates state then calls window.APP_RENDER() (defined in app.js),
   the one render entry point. No module calls another module's render
   function directly. */
window.APP_FILTER = (function () {
  'use strict';

  var cfg = window.APP_CONFIG;

  var state = {
    // data
    allWorks: [],
    sections: [],
    filtered: [],
    visibleCount: cfg.INITIAL_VISIBLE,

    // filter/search/lang
    sectionFilter: 'all',
    searchQuery: '',
    sortMode: 'section-id-asc',
    lang: 'kr',

    // viewer (single source of truth — viewer.js reads/writes these,
    // it does not keep its own separate copies)
    viewerOpen: false,
    currentIndex: 0,
    scale: 1,
    panX: 0,
    panY: 0
  };

  function render() {
    if (typeof window.APP_RENDER === 'function') window.APP_RENDER();
  }

  function safeText(v) {
    return (v === null || v === undefined) ? '' : String(v);
  }

  function fieldByLang(item, base) {
    var kr = safeText(item[base + '_kr']);
    var en = safeText(item[base + '_en']);
    if (state.lang === 'en') return en || kr;
    if (state.lang === 'both') {
      if (kr && en && kr !== en) return kr + ' / ' + en;
      return kr || en;
    }
    return kr || en;
  }

  function getTitle(item) { return fieldByLang(item, 'title'); }
  function getMaterial(item) { return fieldByLang(item, 'material'); }
  function getSize(item) { return fieldByLang(item, 'size'); }
  function getYear(item) { return safeText(item.year); }

  function sectionMetaFor(item) {
    var sid = item.section_id;
    return state.sections.find(function (s) { return s.id === sid || s.section_id === sid; }) || null;
  }

  function sectionTextFor(item) {
    var meta = sectionMetaFor(item);
    if (!meta) return state.lang === 'en' ? 'Unsorted' : '미분류';
    if (state.lang === 'en') return meta.title_en || meta.en || '';
    return meta.title_kr || meta.kr || '';
  }

  function matchesSection(item) {
    if (state.sectionFilter === 'all') return true;
    return String(item.section_id) === String(state.sectionFilter);
  }

  function matchesSearch(item) {
    var q = state.searchQuery.trim().toLowerCase();
    if (!q) return true;
    var haystack = [
      item.id, getTitle(item), getMaterial(item), getYear(item), sectionTextFor(item)
    ].join(' ').toLowerCase();
    return haystack.indexOf(q) !== -1;
  }

  function parseIdNumber(id) {
    var m = safeText(id).match(/(\d+)(?!.*\d)/);
    return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
  }

  var SORTERS = {
    'section-id-asc': function (a, b) {
      var sa = Number(a.section_id) || 0, sb = Number(b.section_id) || 0;
      if (sa !== sb) return sa - sb;
      return parseIdNumber(a.id) - parseIdNumber(b.id);
    },
    'id-desc': function (a, b) { return parseIdNumber(b.id) - parseIdNumber(a.id); },
    'year-desc': function (a, b) {
      var ya = Number(a.year) || 0, yb = Number(b.year) || 0;
      if (ya !== yb) return yb - ya;
      return parseIdNumber(b.id) - parseIdNumber(a.id);
    }
  };

  function recomputeFiltered() {
    var list = state.allWorks.filter(function (item) {
      return matchesSection(item) && matchesSearch(item);
    });
    var sorter = SORTERS[state.sortMode] || SORTERS['section-id-asc'];
    list.sort(sorter);
    state.filtered = list;
    if (state.currentIndex >= list.length) state.currentIndex = Math.max(0, list.length - 1);
  }

  function applyFilters() {
    recomputeFiltered();
    render();
  }

  function setAllWorks(works) {
    state.allWorks = Array.isArray(works) ? works : [];
    applyFilters();
  }

  function setSections(sections) {
    state.sections = Array.isArray(sections) ? sections : [];
    render();
  }

  function setSectionFilter(sectionId) {
    state.sectionFilter = sectionId;
    state.visibleCount = cfg.INITIAL_VISIBLE;
    applyFilters();
  }

  function setSearchQuery(q) {
    state.searchQuery = q || '';
    state.visibleCount = cfg.INITIAL_VISIBLE;
    applyFilters();
  }

  function setSortMode(mode) {
    state.sortMode = mode;
    applyFilters();
  }

  function setLang(lang) {
    state.lang = lang;
    applyFilters();
  }

  function loadMore() {
    state.visibleCount += cfg.LOAD_STEP;
    render();
  }

  return {
    state: state,
    applyFilters: applyFilters,
    setAllWorks: setAllWorks,
    setSections: setSections,
    setSectionFilter: setSectionFilter,
    setSearchQuery: setSearchQuery,
    setSortMode: setSortMode,
    setLang: setLang,
    loadMore: loadMore,
    getTitle: getTitle,
    getMaterial: getMaterial,
    getSize: getSize,
    getYear: getYear,
    sectionTextFor: sectionTextFor
  };
})();
