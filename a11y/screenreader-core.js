/* DUNGZAK CESTLAVIE LAB / ARCHIVE PRO — screen reader semantics.
 * Read-only DOM accessibility layer (2026-11-22): does not change search,
 * session, works, upload or publishing logic. */
(function () {
  'use strict';
  if (window.__DZ_SCREENREADER_CORE__) return;
  window.__DZ_SCREENREADER_CORE__ = true;
  var doc = document, root = doc.documentElement;
  function $(s) { return doc.querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function language() {
    var item = $('.lang-tabs [aria-pressed="true"][data-lang]') ||
      $('.lang-global button.active[data-lang]');
    if (item) return item.dataset.lang === 'en' ? 'en' : 'ko';
    if (root.lang === 'en') return 'en';
    return 'ko';
  }
  function T(ko, en) { return language() === 'en' ? en : ko; }
  function focusTarget() {
    return $('.view.active') || $('#archiveMain') || $('main') || $('#home') || $('.site-shell');
  }
  function skipLink() {
    if ($('#dz-sr-skip')) return;
    var target = focusTarget();
    if (!target) return;
    var a = doc.createElement('a');
    a.id = 'dz-sr-skip';
    a.className = 'dz-sr-skip';
    a.href = '#dz-sr-start';
    a.textContent = '본문으로 이동 / Skip to content';
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var t = focusTarget();
      if (!t) return;
      if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex','-1');
      try { t.focus({ preventScroll: true }); } catch (x) { t.focus(); }
      t.scrollIntoView({ block:'start',behavior:'auto' });
    });
    doc.body.insertBefore(a,doc.body.firstChild);
  }
  function syncLanguage() {
    var l = language();
    root.lang = l;
    $$('.lang-global, .lang-tabs').forEach(function (group) {
      if (!group.querySelector('[role="tab"]')) group.setAttribute('role','group');
      group.setAttribute('aria-label', T('화면 언어 선택','Display language'));
    });
    $$('[data-lang][aria-pressed]').forEach(function (b) {
      if (b.tagName !== 'BUTTON') return;
      if (!b.closest('.lang-tabs, .lang-global')) return;
      b.setAttribute('aria-pressed', String(b.dataset.lang === l ||
        (l === 'ko' && b.dataset.lang === 'kr')));
    });
    // Keep the native visible <label> as the accessible name. The obsolete
    // fixed Korean aria-label overrode English on the actual select.
    ['sectionSelect','sortSelect','searchInput'].forEach(function (id) {
      var input=doc.getElementById(id);
      if(input && input.id && $('label[for="'+id+'"]')) input.removeAttribute('aria-label');
    });
    var bar = $('#searchArea');
    if (bar) bar.setAttribute('aria-label',
      T('아카이브 검색 및 필터','Archive search and filters'));
  }
  function syncMenu() {
    var trigger = $('#menuBtn');
    var menu = $('#menu');
    if (!trigger || !menu) return;
    trigger.setAttribute('aria-haspopup','dialog');
    trigger.setAttribute('aria-controls','menu');
    trigger.setAttribute('aria-expanded',String(menu.classList.contains('open')));
    // The existing LAB menu a11y module owns modal/inert/focus/ESC behavior.
    if (!trigger.hasAttribute('role')) trigger.setAttribute('role','button');
    var opened=menu.classList.contains('open');
    trigger.setAttribute('aria-label',opened?
      T('메뉴 닫기','Close menu'):T('메뉴 열기','Open menu'));
  }
  function syncViews() {
    var views=$$('.view');
    if(!views.length)return;
    views.forEach(function (v) {
      if(v.classList.contains('active')) {
        v.setAttribute('role','main');
        v.removeAttribute('aria-hidden');
      } else {
        v.removeAttribute('role');
        v.setAttribute('aria-hidden','true');
      }
    });
  }
  function syncFilter() {
    var b=$('#filterToggleBtn'), panel=$('#searchArea');
    if (b && panel) {
      b.setAttribute('aria-controls','searchArea');
      var expanded=!doc.body.classList.contains('archive-filter-collapsed') &&
        (doc.body.classList.contains('archive-filter-open') ||
         getComputedStyle(panel).maxHeight!=='0px');
      b.setAttribute('aria-expanded',String(expanded));
    }
    var main=$('#archiveMain');
    if(main)main.removeAttribute('aria-live'); // never announce all cards on every search
    var results=$('#statFiltered');
    if(results) {
      results.setAttribute('role','status');
      results.setAttribute('aria-live','polite');
      results.setAttribute('aria-atomic','true');
      results.setAttribute('aria-label',T('현재 검색 결과 수','Current result count'));
    }
  }
  function syncWorkCards() {
    $('#grid .card[data-id]').forEach(function(c) {
      var action=c.querySelector('.thumb-wrap[role="button"]') || (c.getAttribute('role')==='button'?c:null);
      if (!action || action.getAttribute('data-dz-sr-title') === language()) return;
      var id=c.getAttribute('data-id') || '';
      var heading=c.querySelector('.title');
      var name=heading && heading.textContent.trim() || id;
      action.setAttribute('aria-label',(id ? id+' · ':'')+name+' · '+
        T('작품 상세 보기','View artwork details'));
      action.setAttribute('data-dz-sr-title', language());
    });
  }
  function initViewerFocus() {
    // The viewer already supports keyboard navigation and <button> controls;
    // add a resilient focus loop and restore the precise source card on close.
    var dialog=$('#lightbox'), close=$('#viewerCloseBtn');
    if(!dialog || !close || dialog.dataset.srBound==='true')return;
    dialog.dataset.srBound='true';
    var was=false,source=null;
    var cards=$('#grid');
    if(cards)cards.addEventListener('click',function(e) {
      var c=e.target && e.target.closest && e.target.closest('.card[data-id]');
      if(c)source=c;
    },true);
    if(cards)cards.addEventListener('keydown',function(e) {
      if(e.key==='Enter'||e.key===' ') {
        var c=e.target && e.target.closest && e.target.closest('.card[data-id]');
        if(c)source=c;
      }
    },true);
    function open(){return dialog.getAttribute('aria-hidden')==='false' && getComputedStyle(dialog).display!=='none';}
    function changed(){
      var opened=open();
      if(opened===was)return;
      was=opened;
      if(opened){
        setTimeout(function () { if(open())close.focus({preventScroll:true}); },30);
      }else if(source && source.isConnected){
        var target=source;source=null;
        setTimeout(function () {try{target.focus({preventScroll:true});}catch(e){target.focus();}},50);
      }
    }
    new MutationObserver(changed).observe(dialog,
      {attributes:true,attributeFilter:['aria-hidden','class','style']});
    doc.addEventListener('keydown',function(e) {
      if(!open()||e.key!=='Tab')return;
      var f=$$('button:not([disabled]),a[href]:not([tabindex="-1"]),[tabindex]:not([tabindex="-1"])',dialog)
        .filter(function(x){return x.getClientRects().length>0;});
      if(!f.length)return;
      var first=f[0],last=f[f.length-1],a=doc.activeElement;
      if(e.shiftKey && (a===first||!dialog.contains(a))){
        e.preventDefault();last.focus();
      }else if(!e.shiftKey&&(a===last||!dialog.contains(a))){
        e.preventDefault();first.focus();
      }
    },true);
  }
  function boot() {
    skipLink();
    syncLanguage();
    syncMenu();
    syncViews();
    syncFilter();
    initViewerFocus();
    var queue=0;
    function later(){
      if(queue)return;
      queue=setTimeout(function(){
        queue=0;syncLanguage();syncMenu();syncViews();syncFilter();syncWorkCards();
      },100);
    }
    doc.addEventListener('click',later,true);
    doc.addEventListener('change',later,true);
    var menu=$('#menu');
    if(menu)new MutationObserver(later).observe(menu,{attributes:true,attributeFilter:['class']});
    var views=$$('.view');
    views.forEach(function (v) {
      new MutationObserver(later).observe(v,{attributes:true,attributeFilter:['class']});
    });
    var grid=$('#grid');
    if(grid)new MutationObserver(later).observe(grid,{childList:true,subtree:false});
    var bar=$('#searchArea');
    if(bar)new MutationObserver(later).observe(doc.body,{attributes:true,attributeFilter:['class']});
    // Language labels and result/status changes may arrive after the first render.
    setTimeout(later,600);
    syncWorkCards();
  }
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot);
  else boot();
})();