/* ARCHIVE PRO APP — app.js
   Bootstrap + the ONE render() entry point (per Lumera's architecture
   review, principle 3). Every state mutation anywhere in the app ends
   with a call to window.APP_RENDER() — this is the only place that
   fans out into renderHeader() -> renderFilters() -> renderGrid() ->
   renderViewer(). No other module calls another module's render function
   directly; they only mutate filter.js's shared state and call render(). */
(function () {
  'use strict';

  var cfg = window.APP_CONFIG;
  var api = window.APP_API;
  var filterMod = window.APP_FILTER;
  var ui = window.APP_UI;
  var viewer = window.APP_VIEWER;
  var search = window.APP_SEARCH;
  var $ = function (sel) { return document.querySelector(sel); };

  var HERO_MODE_LABEL = { kr: '한국어 기준', en: 'English mode', both: '한국어 + English' };

  function syncDataLanguage(lang) {
    document.querySelectorAll('[data-kr][data-en]').forEach(function (node) {
      var kr = node.getAttribute('data-kr') || '';
      var en = node.getAttribute('data-en') || '';
      var text = lang === 'en' ? en : (lang === 'both' ? (kr + '\n' + en) : kr);
      if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') node.placeholder = text;
      else node.textContent = text;
    });
  }

  // ---- The single render entry ----
  // render() -> renderHeader() -> renderFilters() -> renderGrid() -> renderViewer()
  function renderHeader() {
    var lang = filterMod.state.lang;
    document.querySelectorAll('.lang-tab').forEach(function (btn) {
      var active = btn.dataset.lang === lang;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    syncDataLanguage(lang);
    var heroModeLine = $('#heroModeLine');
    if (heroModeLine) heroModeLine.textContent = HERO_MODE_LABEL[lang] || HERO_MODE_LABEL.kr;
  }

  function render() {
    renderHeader();
    ui.renderFilters();
    ui.renderGrid();
    ui.updateStats();
    viewer.renderViewer();
  }
  window.APP_RENDER = render;

  function initLanguageTabs() {
    document.querySelectorAll('.lang-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterMod.setLang(btn.dataset.lang);
        search.populateSectionSelect(filterMod.state.sections);
      });
    });
  }

  function initEnterLink() {
    var enterBtn = $('#enterArchivePro');
    var target = $('#archiveWorks');
    if (!enterBtn || !target) return;
    enterBtn.addEventListener('click', function (e) {
      e.preventDefault();
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  function initResetTrigger() {
    var trigger = $('#ap-reset-trigger');
    if (!trigger) return;
    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      var resetBtn = $('#resetBtn');
      if (resetBtn) resetBtn.click();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function initInstallPrompt() {
    var panel = $('#installPanel');
    var installBtn = $('#installAppBtn');
    var deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      if (panel) panel.hidden = false;
    });

    if (installBtn) {
      installBtn.addEventListener('click', function () {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(function () {
          deferredPrompt = null;
          if (panel) panel.hidden = true;
        });
      });
    }

    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isIOS && !isStandalone) {
      var iosGuide = $('#iosInstallGuide');
      if (panel) panel.hidden = false;
      if (iosGuide) iosGuide.hidden = false;
    }
  }

  // NOTE for Lumera / next pass: cache-name versioning + old-cache cleanup
  // (principle 9) lives in sw.js itself, which I have not seen the
  // contents of — only registering it here. Needs a follow-up check that
  // sw.js actually bumps its cache name per APP_CONFIG.VERSION and purges
  // stale caches on activate; not verified in this pass.
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(cfg.SW_URL).catch(function (err) {
        console.warn('[Archive Pro App] service worker registration failed', err);
      });
    });
  }

  function loadData() {
    var loadingScreen = $('#loadingScreen');
    if (loadingScreen) loadingScreen.hidden = false;

    api.loadSections().then(function (sections) {
      filterMod.setSections(sections);
      search.populateSectionSelect(sections);
    });

    api.loadWorksProgressive(
      function onCached(cached) {
        filterMod.setAllWorks(cached);
        if (loadingScreen) loadingScreen.hidden = true;
      },
      function onFresh(fresh) {
        filterMod.setAllWorks(fresh);
        if (loadingScreen) loadingScreen.hidden = true;
      }
    );
  }

  var bootstrapped = false;
  function bootstrap() {
    if (bootstrapped) return; // idempotency guard — init sequence runs exactly once
    bootstrapped = true;

    try { ui.init(); } catch (e) { console.error(e); }
    try { viewer.init(); } catch (e) { console.error(e); }
    try { search.init(); } catch (e) { console.error(e); }
    try { initLanguageTabs(); } catch (e) { console.error(e); }
    try { initEnterLink(); } catch (e) { console.error(e); }
    try { initResetTrigger(); } catch (e) { console.error(e); }
    try { initInstallPrompt(); } catch (e) { console.error(e); }
    try { registerServiceWorker(); } catch (e) { console.error(e); }
    try { loadData(); } catch (e) { console.error(e); }
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();
