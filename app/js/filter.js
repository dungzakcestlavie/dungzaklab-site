/* ARCHIVE PRO APP — filter.js
   Holds the single shared state object (allWorks, sections, filtered,
   current section/search/sort) and the pure filtering/sorting logic.
   ui.js reads state.filtered to render; search.js and the section/sort
   selects call setSectionFilter/setSearchQuery/setSortMode, which always
   go through applyFilters() so state.filtered is never stale. */
window.APP_FILTER = (function () {
  'use strict';

  var cfg = window.APP_CONFIG;

  var state = {
    allWorks: [],
    sections: [],
    filtered: [],
    sectionFilter: 'all',
    searchQuery: '',
    sortMode: 'section-id-asc',
    lang: 'kr', // 'kr' | 'en' | 'both' — kept in sync with ui.js's language tabs
    visibleCount: cfg.INITIAL_VISIBLE
  };

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
      item.id,
      getTitle(item),
      getMaterial(item),
      getYear(item),
      sectionTextFor(item)
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

  function applyFilters() {
    var list = state.allWorks.filter(function (item) {
      return matchesSection(item) && matchesSearch(item);
    });
    var sorter = SORTERS[state.sortMode] || SORTERS['section-id-asc'];
    list.sort(sorter);
    state.filtered = list;
    if (window.APP_UI && typeof window.APP_UI.renderGrid === 'function') {
      window.APP_UI.renderGrid();
    }
    if (window.APP_UI && typeof window.APP_UI.updateStats === 'function') {
      window.APP_UI.updateStats();
    }
  }

  function setAllWorks(works) {
    state.allWorks = Array.isArray(works) ? works : [];
    applyFilters();
  }

  function setSections(sections) {
    state.sections = Array.isArray(sections) ? sections : [];
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

  return {
    state: state,
    applyFilters: applyFilters,
    setAllWorks: setAllWorks,
    setSections: setSections,
    setSectionFilter: setSectionFilter,
    setSearchQuery: setSearchQuery,
    setSortMode: setSortMode,
    setLang: setLang,
    getTitle: getTitle,
    getMaterial: getMaterial,
    getSize: getSize,
    getYear: getYear,
    sectionTextFor: sectionTextFor
  };
})();
