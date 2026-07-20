/* ARCHIVE PRO APP — app.js
   Bootstrap only: init order, data loading, language tabs, install prompt,
   service worker registration. All real logic lives in the other modules. */
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
      if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
        node.placeholder = text;
      } else {
        node.textContent = text;
      }
    });
  }

  function setLanguage(lang) {
    document.querySelectorAll('.lang-tab').forEach(function (btn) {
      var active = btn.dataset.lang === lang;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    syncDataLanguage(lang);
    var heroModeLine = $('#heroModeLine');
    if (heroModeLine) heroModeLine.textContent = HERO_MODE_LABEL[lang] || HERO_MODE_LABEL.kr;
    filterMod.setLang(lang === 'both' ? 'both' : lang);
    search.populateSectionSelect(filterMod.state.sections);
  }

  function initLanguageTabs() {
    document.querySelectorAll('.lang-tab').forEach(function (btn) {
      btn.addEventListener('click', function () { setLanguage(btn.dataset.lang); });
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
      // Soft reset: clear filters and scroll home without a full page
      // reload, matching the single-file Archive Pro's brand-click behavior.
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

    // iOS Safari never fires beforeinstallprompt — show the manual guide
    // instead when running in Safari on iOS and not already installed.
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isIOS && !isStandalone) {
      var iosGuide = $('#iosInstallGuide');
      if (panel) panel.hidden = false;
      if (iosGuide) iosGuide.hidden = false;
    }
  }

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
      ui.updateStats();
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

  document.addEventListener('DOMContentLoaded', function () {
    try { ui.init(); } catch (e) { console.error(e); }
    try { viewer.init(); } catch (e) { console.error(e); }
    try { search.init(); } catch (e) { console.error(e); }
    try { initLanguageTabs(); } catch (e) { console.error(e); }
    try { initEnterLink(); } catch (e) { console.error(e); }
    try { initResetTrigger(); } catch (e) { console.error(e); }
    try { initInstallPrompt(); } catch (e) { console.error(e); }
    try { registerServiceWorker(); } catch (e) { console.error(e); }
    try { loadData(); } catch (e) { console.error(e); }
  });
})();
