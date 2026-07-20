/* ARCHIVE PRO APP — cache.js
   Small localStorage cache-with-TTL helper. Same pattern as dungzak.art's
   worksCacheGet/worksCacheSet, generalized to any key so api.js can use it
   for both works.json and sections.json. */
window.APP_CACHE = (function () {
  'use strict';

  function get(key) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.t !== 'number') return null;
      if (Date.now() - parsed.t > (window.APP_CONFIG ? window.APP_CONFIG.CACHE_TTL_MS : 0)) return null;
      return parsed.data;
    } catch (_e) {
      return null;
    }
  }

  function set(key, data) {
    try {
      window.localStorage.setItem(key, JSON.stringify({ t: Date.now(), data: data }));
    } catch (_e) {
      /* localStorage full or unavailable (private mode) — silently skip caching. */
    }
  }

  function clear(key) {
    try { window.localStorage.removeItem(key); } catch (_e) {}
  }

  return { get: get, set: set, clear: clear };
})();
