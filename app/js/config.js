/* ARCHIVE PRO APP — config.js
   Central, single source of truth for paths, cache keys, and small
   constants shared across every other module. No DOM access here. */
window.APP_CONFIG = (function () {
  'use strict';

  var VERSION = 'app-v1-20260720';

  return {
    VERSION: VERSION,
    DATA_URL: '/app/data/works.json?v=' + VERSION,
    DATA_URL_FALLBACK: '/app/data/works.example.json?v=' + VERSION,
    SECTIONS_URL: '/app/data/sections.json?v=' + VERSION,
    CACHE_TTL_MS: 1000 * 60 * 60 * 12, // 12h, matches dungzak.art's works cache
    WORKS_CACHE_KEY: 'archiveProApp_works_v1',
    SECTIONS_CACHE_KEY: 'archiveProApp_sections_v1',
    UI_STATE_KEY: 'archiveProApp_uiState_v1',
    INITIAL_VISIBLE: 24,
    LOAD_STEP: 24,
    INITIAL_EAGER_COUNT: 6,
    SW_URL: '/app/sw.js',
    MIN_EXPECTED_WORKS: 0 // App starts empty; dungzak.art's own MIN_EXPECTED_WORKS gate doesn't apply here.
  };
})();
