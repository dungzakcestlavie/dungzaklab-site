/* ARCHIVE PRO APP — api.js
   Loads works.json and sections.json. Cache-first (localStorage, TTL from
   config.js), background-refreshed from network. Falls back to
   works.example.json if works.json isn't present yet (repo currently only
   ships the example file), so the app never shows a hard error on a fresh
   checkout — only the empty-state screen already built into index.html. */
window.APP_API = (function () {
  'use strict';

  var cfg = window.APP_CONFIG;
  var cache = window.APP_CACHE;

  function safeJSONFetch(url) {
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return res.json();
    });
  }

  function loadWorks() {
    var cached = cache.get(cfg.WORKS_CACHE_KEY);
    var networkPromise = safeJSONFetch(cfg.DATA_URL)
      .catch(function () {
        // works.json not published yet in this checkout — fall back to the
        // bundled example file so the grid isn't empty during development.
        return safeJSONFetch(cfg.DATA_URL_FALLBACK);
      })
      .then(function (data) {
        var works = Array.isArray(data) ? data : [];
        cache.set(cfg.WORKS_CACHE_KEY, works);
        return works;
      })
      .catch(function (err) {
        console.warn('[Archive Pro App] works.json load failed', err);
        return cached || [];
      });

    // Return cached data immediately if we have it (caller can render right
    // away), while the network promise resolves in the background with the
    // authoritative list. Callers that want "cache now, fresh later" use
    // loadWorksProgressive(); simple callers can just await loadWorks().
    return networkPromise;
  }

  function loadWorksProgressive(onCached, onFresh) {
    var cached = cache.get(cfg.WORKS_CACHE_KEY);
    if (cached && cached.length && typeof onCached === 'function') {
      onCached(cached);
    }
    loadWorks().then(function (fresh) {
      if (typeof onFresh === 'function') onFresh(fresh);
    });
  }

  function loadSections() {
    var cached = cache.get(cfg.SECTIONS_CACHE_KEY);
    return safeJSONFetch(cfg.SECTIONS_URL)
      .then(function (data) {
        var sections = Array.isArray(data) ? data : [];
        cache.set(cfg.SECTIONS_CACHE_KEY, sections);
        return sections;
      })
      .catch(function () {
        // sections.json is optional — no error, just no section list beyond
        // "전체 섹션" (All Sections).
        return cached || [];
      });
  }

  return {
    loadWorks: loadWorks,
    loadWorksProgressive: loadWorksProgressive,
    loadSections: loadSections
  };
})();
