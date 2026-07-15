/* Archive Pro App — app.js
   ------------------------------------------------------------------
   STEP 2 of 10 — App Shell only.

   Intentionally minimal right now. This file will become the final
   entry point/bootstrap once every other module has been moved in,
   in this order (per agreed plan):

     1. config.js   — app name, data path, default language, cache
                      names, version (shared settings)
     2. api.js      — works.json loading + normalization
     3. ui.js       — card rendering, work count, empty state
     4. viewer.js   — lightbox / zoom / prev-next
     5. search.js   — search + Korean initial-consonant matching
     6. filter.js   — section/sort filtering, load-more
     7. cache.js    — IndexedDB + localStorage UI-state cache
     8. sw.js       — service worker registration (last)

   Until those land, this file only confirms the shell loaded cleanly
   with no console errors. No rendering, search, filter, or viewer
   logic runs yet — the HTML above is static markup, matching the
   original Archive Pro's markup exactly, just without behavior wired
   up. That's expected at this stage, not a bug.
   ------------------------------------------------------------------ */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    try {
      console.log('[Archive Pro App] Shell loaded (step 2/10). No modules wired yet.');
    } catch (_) {}
  });
})();
