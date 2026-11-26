    (() => {
      'use strict';
      const ARCHIVE_PRO_DESKTOP_LIGHTBOX_SIZE_LOCK_JS = true;

      if (window.__ARCHIVE_PRO_BOOTED__) return;
      window.__ARCHIVE_PRO_BOOTED__ = true;

      /* REOPEN SPEED PATCH 2026-07-13 — Console Timing:
         Marks the checkpoints from the speed spec (shell / first cards /
         interactive) so they can be measured on a real iPhone via Safari
         Web Inspector > Console. No UI, no layout cost, safe to keep. */
      const AP_BOOT_T0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      function apLogTiming(label) {
        try {
          const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          console.log('[Archive Pro][timing]', label, '+' + Math.round(now - AP_BOOT_T0) + 'ms');
        } catch (_) {}
      }
      apLogTiming('script start (app shell already parsed)');

      /* REOPEN SPEED PATCH 2026-07-13 — Background Resume Timing:
         When the app resumes from the background without a full reload,
         this script never re-executes, so there is no "shell / first card"
         moment to log — that absence IS the fast path (nothing had to be
         rebuilt). These two listeners only log that a resume happened, for
         the "C. 백그라운드 복귀" measurement in the speed spec; they do not
         change any behavior. */
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          try { apLogTiming('resumed from background (no reload — page state preserved)'); } catch (_) {}
        }
      });
      window.addEventListener('pageshow', (e) => {
        if (e.persisted) {
          try { apLogTiming('restored from bfcache (no reload)'); } catch (_) {}
        }
      });

      /* PAGE ZOOM LOCK — keep whole Archive Pro viewport fixed.
         Lightbox image zoom still works through the existing custom viewerScale engine.

         2026-08-04 변경 (Android 세로 스크롤 완전 복구) — 실제 원인 확인:
         이 블록에 있던 document 전역 touchmove 리스너가
         (e.touches.length > 1 && !viewer-open일 때만 preventDefault) 원인이었다.
         조건 자체는 "2손가락일 때만" preventDefault를 부르지만, {passive:false}로
         document에 상시 등록돼 있다는 사실 하나만으로 Samsung Internet/Xiaomi
         Chrome 등 일부 Android 빌드는 "이 터치 시퀀스가 결국 preventDefault를
         부를지" 알 수 없어 스크롤을 컴포지터 스레드 단독으로 처리하는 빠른 경로
         (scroll fast-path)를 아예 꺼버린다 — 이게 "손가락으로 위아래로 밀어도
         전혀 반응하지 않는" 증상의 실체다(iPhone Safari는 이 최적화 여부와 무관하게
         정상 동작해 왔기 때문에 iOS에서는 증상이 없었다).
         제거해도 핀치 줌 차단 기능은 그대로 유지된다 — html/body의
         touch-action:pan-y(순수 CSS)가 이미 페이지 전체에서 핀치줌을 막고
         있어서, 이 JS는 애초에 중복 방어였다. gesturestart/gesturechange/
         gestureend(Safari 전용 핀치 이벤트)는 touchmove와 무관하므로 그대로 둔다. */
      const preventBrowserZoom = (e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
      };

      ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
        document.addEventListener(type, preventBrowserZoom, { passive: false });
        window.addEventListener(type, preventBrowserZoom, { passive: false });
      });

      document.addEventListener('dblclick', (e) => {
        const lightbox = document.getElementById('lightbox');
        if (!lightbox || !lightbox.contains(e.target)) e.preventDefault();
      }, { passive: false });

      document.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) e.preventDefault();
      }, { passive: false });

      document.addEventListener('keydown', (e) => {
        const key = String(e.key || '').toLowerCase();
        if ((e.ctrlKey || e.metaKey) && (key === '+' || key === '-' || key === '=' || key === '0')) {
          e.preventDefault();
        }
      }, { passive: false });

      const SITE_ROOT = 'https://dungzakcestlavie.github.io/';
      const DATA_URL = 'https://raw.githubusercontent.com/dungzakcestlavie/dungzakcestlavie.github.io/main/data/works.json';
      const DUNGZAK_ART_DATA_URL = 'https://dungzak.art/data/works.json';
      const MIN_EXPECTED_WORKS = 100;
      const AUTO_AVAILABLE_AFTER_COUNT = 1345;
      const MOBILE_FIRST_RENDER_COUNT = 12;
      const DESKTOP_FIRST_RENDER_COUNT = 24;
      const FIRST_RENDER_COUNT = DESKTOP_FIRST_RENDER_COUNT;
      const FAST_ORDER = 'section-id-asc';
      /* 2026-10-18 (apdefsec1) 아카이브 첫 화면 기본 섹션 = I 우리를 위해 기도해 주세요 (section_id 1).
         새 진입·새로고침·상단 ARCHIVE PRO 로고 클릭·초기화 버튼에 적용. */
      const DEFAULT_ENTRY_SECTION = '1';
      const LOAD_MORE_COUNT = 40;
      const AUTO_RENDER_ROOT_MARGIN = '360px 0px 600px 0px';
      const INITIAL_VISIBLE = getInitialVisibleCount();
      /*
        MOBILE PERFORMANCE ONLY FIX 2026-07-13 — LCP Priority Count:
        This gated how many of the first-batch cards get eager loading +
        fetchpriority="high" real <img src> (createCardHTML() below). It was
        24 — the same number as the DOM card batch size (getInitialVisibleCount)
        — so every card in the first render, not just the ones actually
        visible without scrolling, competed for "high priority" bandwidth at
        once. Under Lighthouse's throttled mobile network simulation, 24
        simultaneous high-priority image requests can starve each other badly
        enough that the last one to finish — still a valid LCP candidate —
        finishes tens of seconds late, which matches the reported 33.9s LCP
        despite genuinely fast real-device perceived speed. Narrowing this to
        a true above-the-fold count (roughly 2 columns × 3 rows on mobile)
        concentrates bandwidth on the images that actually determine LCP.
        Cards 7–24 already still render immediately in the DOM (unchanged)
        and still get picked up almost instantly by the existing
        IntersectionObserver lazy path (AUTO_RENDER_ROOT_MARGIN is generous),
        so real perceived speed and design/behavior are unaffected — only
        which images get "eager + high" HTTP priority changes.
      */
      const INITIAL_RENDER_COUNT = 2;
      const STANDARD_ART_BASE = 'https://raw.githubusercontent.com/dungzakcestlavie/dungzakcestlavie.github.io/main/images/standard/';
      const VERIFIED_CATALOG_SIZE = 2535;
      const WORKS_TIMEOUT_MS = 12000;
      /* SKIP-REDUNDANT-RECHECK PATCH 2026-07-18: see loadArchiveData() STEP 3.
         3 minutes — long enough to skip pointless back-to-back reloads
         within the same visit/session, short enough that any real
         works.json update still reaches the app almost immediately. */
      const AP_COMPLETENESS_RECHECK_MIN_INTERVAL_MS = 3 * 60 * 1000;
      const LOAD_STEP = LOAD_MORE_COUNT;
      const SEARCH_DEBOUNCE_MS = 150; /* 2026-10-14 (apsearch2) 앱 search.js와 같게 220→150 */
      /* REOPEN SPEED PATCH 2026-07-13 — Stable Image Cache Key:
         ASSET_VERSION used to be 'ap-img-' + Date.now(), a brand new value
         every single time the app opened. Every thumbnail/zoom URL is built
         with this value (withCacheBust()), so a fresh Date.now() meant every
         image — including the first-screen priority thumbnails — was forced
         to re-download from the network on every reopen, even seconds after
         the previous visit. That was a primary cause of the 2–3s reopen delay.
         Fix: keep the SAME version value for the whole calendar day (persisted
         in localStorage). Repeated opens on the same day now reuse the exact
         same image URLs, so the browser/Service Worker cache serves them with
         no network request. Any real image update still reaches users within
         at most one day, unchanged from the original safety intent. Image
         paths and works.json structure are untouched — only how often the
         cache-busting value changes. */
      function getStableAssetVersion() {
        const fallback = 'ap-img-' + Date.now();
        try {
          if (typeof window === 'undefined' || !window.localStorage) return fallback;
          const KEY = 'apAssetVersionV1';
          const today = new Date().toISOString().slice(0, 10);
          const stored = window.localStorage.getItem(KEY);
          if (stored) {
            const sep = stored.indexOf('|');
            const storedDay = sep === -1 ? '' : stored.slice(0, sep);
            const storedValue = sep === -1 ? '' : stored.slice(sep + 1);
            if (storedDay === today && storedValue) return storedValue;
          }
          const value = 'ap-img-' + today;
          try { window.localStorage.setItem(KEY, today + '|' + value); } catch (_e) {}
          return value;
        } catch (_e) {
          return fallback;
        }
      }
      const ASSET_VERSION = getStableAssetVersion();
      const PAGE_OFFLINE_CACHE_NAME = 'archive-pro-page-non-origins-v3';

      function isArchiveOfflineMode() {
        return typeof navigator !== 'undefined' && navigator.onLine === false;
      }

      /* REOPEN SPEED PATCH 2026-07-13 — Local works.json Cache (IndexedDB):
         Minimal key/value wrapper around IndexedDB, used only to remember the
         last known-good works.json so a reopen can paint real cards instantly
         instead of waiting on a network round trip. No work item fields, no
         image paths, no data structure are touched — this only stores a copy
         of the exact same array fetchWorksDirect() already produces today. */
      const AP_CACHE_DB_NAME = 'archive-pro-cache';
      const AP_CACHE_DB_VERSION = 1;
      const AP_CACHE_STORE = 'kv';
      const AP_WORKS_CACHE_KEY = 'worksPayloadV1';

      function apOpenCacheDB() {
        return new Promise((resolve) => {
          try {
            if (!('indexedDB' in window)) { resolve(null); return; }
            const req = indexedDB.open(AP_CACHE_DB_NAME, AP_CACHE_DB_VERSION);
            req.onupgradeneeded = () => {
              try {
                if (!req.result.objectStoreNames.contains(AP_CACHE_STORE)) {
                  req.result.createObjectStore(AP_CACHE_STORE);
                }
              } catch (_) {}
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          } catch (_) {
            resolve(null);
          }
        });
      }

      async function apCacheGet(key) {
        try {
          const db = await apOpenCacheDB();
          if (!db) return null;
          return await new Promise((resolve) => {
            try {
              const tx = db.transaction(AP_CACHE_STORE, 'readonly');
              const req = tx.objectStore(AP_CACHE_STORE).get(key);
              req.onsuccess = () => resolve(req.result || null);
              req.onerror = () => resolve(null);
            } catch (_) { resolve(null); }
          });
        } catch (_) { return null; }
      }

      async function apCacheSet(key, value) {
        try {
          const db = await apOpenCacheDB();
          if (!db) return false;
          return await new Promise((resolve) => {
            try {
              const tx = db.transaction(AP_CACHE_STORE, 'readwrite');
              const req = tx.objectStore(AP_CACHE_STORE).put(value, key);
              req.onsuccess = () => resolve(true);
              req.onerror = () => resolve(false);
            } catch (_) { resolve(false); }
          });
        } catch (_) { return false; }
      }

      /* REOPEN SPEED PATCH 2026-07-13 — Last UI State (language / filter):
         Remembers language, section, sort, and search query across a full
         app close+reopen so the person returns to what they were looking at.
         Restoring this never blocks or delays the first render — it is only
         ever read once, synchronously, before the first paint decision. */
      const AP_UI_STATE_KEY = 'apArchiveProUiStateV1';

      function loadSavedUiState() {
        try {
          if (!window.localStorage) return null;
          const raw = window.localStorage.getItem(AP_UI_STATE_KEY);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          return (parsed && typeof parsed === 'object') ? parsed : null;
        } catch (_) { return null; }
      }

      function saveUiState() {
        try {
          if (!window.localStorage) return;
          window.localStorage.setItem(AP_UI_STATE_KEY, JSON.stringify({
            lang: state.lang,
            section: state.section,
            sort: state.sort,
            query: state.query,
            ts: Date.now()
          }));
        } catch (_) {}
      }

      /* REOPEN SPEED PATCH 2026-07-13 — Last Scroll Position:
         Best-effort only. Saves window.scrollY at most once every 300ms
         (no scroll-jank risk) and restores it once after the first grid
         render. If the saved position is deeper than what is rendered yet,
         the browser simply clamps the scroll — it never forces extra cards
         to render early, so it can't work against the "don't build all
         2,000 cards up front" goal. */
      const AP_SCROLL_KEY = 'apArchiveProScrollYV1';
      let apLastScrollSaveAt = 0;

      function saveScrollYThrottled() {
        const now = Date.now();
        if (now - apLastScrollSaveAt < 300) return;
        apLastScrollSaveAt = now;
        try {
          window.localStorage.setItem(AP_SCROLL_KEY, String(window.scrollY || 0));
        } catch (_) {}
      }

      function restoreScrollYOnce() {
        try {
          const raw = window.localStorage.getItem(AP_SCROLL_KEY);
          const y = raw ? parseInt(raw, 10) : 0;
          if (y > 0) window.scrollTo(0, y);
        } catch (_) {}
      }

      function nonOriginsOnly(list) {
        return (Array.isArray(list) ? list : []).filter(function(item){
          return Number(item && item.section_id) !== 0;
        });
      }

      function standardImageUrlOnly(url) {
        const clean = safeText(url);
        if (!clean) return '';
        if (clean.indexOf('/zoom/') !== -1) return '';
        if (clean.indexOf('/standard/') === -1) return '';
        return clean.split('?')[0];
      }

      function requestServiceWorkerNonOriginsCache() {
        try {
          if (!('serviceWorker' in navigator)) return;
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'CACHE_NON_ORIGINS' });
          }
        } catch (_) {}
      }

      async function cacheNonOriginStandardImagesFromPage(items) {
        /*
          CPU Blocking Time Reduction:
          The page no longer preloads/caches every non-Origin standard image.
          Service worker may handle offline caching separately inside /archivepro/ scope.
        */
        return;
      }

      const ART_EMAIL = "dungzakcestlavie@gmail.com";


      function normalizeStatus(status) {
        const value = safeText(status).toLowerCase();
        if (!value) return '';
        if (['available', 'available for collection', '소장가능', '소장 가능'].includes(value)) return 'available';
        if (['collected', 'sold', '소장', '소장됨', '소장완료', '소장 완료', '판매완료', '판매 완료'].includes(value)) return 'collected';
        if (['reserved', '예약', '예약중', '예약 중'].includes(value)) return 'reserved';
        if (['not_for_sale', 'not for sale', '비매품'].includes(value)) return 'not_for_sale';
        if (['private', '비공개'].includes(value)) return 'private';
        return value;
      }

      const COLLECTION_LABELS = new Map([
        ['available', { kr: '소장 가능', en: 'Available' }],
        ['collected', { kr: '소장됨', en: 'Collected' }],
        ['reserved', { kr: '예약 중', en: 'Reserved' }],
        ['not_for_sale', { kr: '비매품', en: 'Not for Sale' }],
        ['private', { kr: '비공개', en: 'Private' }]
      ]);

      function getStatusLabel(status) {
        const label = COLLECTION_LABELS.get(normalizeStatus(status));
        if (!label) return '';
        if (state.lang === 'en') return label.en;
        if (state.lang === 'both') return label.kr + ' / ' + label.en;
        return label.kr;
      }


      function getInquiryText() {
        /* 2026-10-18 (apinquiry6) 화살표 앞은 줄바꿈 없는 공백(\u00A0) — 화살표가 혼자 다음 줄로 내려가지 않게 */
        if (state.lang === 'en') return 'inquiry via email\u00A0→';
        if (state.lang === 'both') return '이메일 문의\u00A0→ / inquiry via email\u00A0→';
        return '이메일 문의\u00A0→';
      }

      /* 2026-10-18 (apinquiry2) 문의 메일 제목·본문을 ARCHIVE PRO 현재 언어(state.lang: kr / en / both)로 생성.
         OS 언어가 아닌 화면의 KR / EN / KR+EN 선택을 따른다. 수신 주소(ART_EMAIL)는 그대로. */
      /* 2026-10-18 (apinquiry3) 작품 정보(작품명·재료·크기·연도)를 제목·본문에 포함. 같은 생성기를
         메일 앱 · Gmail · 문의 내용 복사가 함께 쓴다. 비어 있는 항목은 줄을 넣지 않는다. */
      function getInquiryInfo(work, readerMode) {
        if (!work || Number(work.section_id) === 0) return { title: '', material: '', size: '', year: '' };
        // Reader-only language overrides do not mutate the surrounding gallery language.
        const language = readerMode === 'en' || readerMode === 'kr' || readerMode === 'both' ? readerMode : state.lang;
        const pick = (kr, en) => {
          kr = safeText(kr); en = safeText(en);
          if (language === 'en') return en || kr;
          if (language === 'both') return kr && en && kr !== en ? kr + ' / ' + en : kr || en;
          return kr || en;
        };
        return { title: pick(work.title_kr, work.title_en), material: pick(work.material_kr, work.material_en),
          size: pick(work.size_kr, work.size_en), year: getYear(work) };
      }

      function getInquirySubject(workId, work, readerMode) {
        const info = getInquiryInfo(work, readerMode);
        const language = readerMode === 'en' || readerMode === 'kr' || readerMode === 'both' ? readerMode : state.lang;
        const tail = workId + (info.title ? ' · ' + info.title : '');
        if (language === 'en') return "Artwork Inquiry — " + tail;
        if (language === 'both') return "작품 문의 / Artwork Inquiry — " + tail;
        return "작품 문의 — " + tail;
      }

      function getInquiryBody(workId, work, readerMode) {
        const info = getInquiryInfo(work, readerMode);
        const mode = readerMode === 'en' || readerMode === 'kr' || readerMode === 'both' ? readerMode : state.lang;
        const lang = mode === 'en' ? 'en' : (mode === 'both' ? 'both' : 'kr');
        const L = {
          kr:   { id: '작품 ID', title: '작품명', material: '재료', size: '크기', year: '제작 연도' },
          en:   { id: 'Artwork ID', title: 'Title', material: 'Medium', size: 'Size', year: 'Year' },
          both: { id: '작품 ID / Artwork ID', title: '작품명 / Title', material: '재료 / Medium', size: '크기 / Size', year: '제작 연도 / Year' }
        }[lang];
        const lines = [L.id + ': ' + workId];
        if (info.title) lines.push(L.title + ': ' + info.title);
        if (info.material) lines.push(L.material + ': ' + info.material);
        if (info.size) lines.push(L.size + ': ' + info.size);
        if (info.year) lines.push(L.year + ': ' + info.year);
        const details = lines.join('\n');
        if (lang === 'en') {
          return "Hello,\n\nI would like to inquire about this artwork.\n\n" + details;
        }
        if (lang === 'both') {
          return "안녕하세요. / Hello,\n\n해당 작품에 대해 문의드립니다.\n\nI would like to inquire about this artwork.\n\n" + details;
        }
        return "안녕하세요,\n\n해당 작품에 대해 문의드립니다.\n\n" + details;
      }

      function getInquiryPlainText(workId, work) {
        return "To: " + ART_EMAIL + "\nSubject: " + getInquirySubject(workId, work) + "\n\n" + getInquiryBody(workId, work);
      }

      function findInquiryWork(workId, workKey) {
        const list = Array.isArray(state.all) ? state.all : [];
        return (workKey && list.find((w) => String(w._key) === String(workKey))) ||
          list.find((w) => String(w.id) === String(workId)) || null;
      }

      function getInquiryLink(workId, work, readerMode) {
        const subject = encodeURIComponent(getInquirySubject(workId, work, readerMode));
        const body = encodeURIComponent(getInquiryBody(workId, work, readerMode));
        return "mailto:" + ART_EMAIL + "?subject=" + subject + "&body=" + body;
      }

      /* 2026-10-18 (apinquiry1) PC·노트북 이메일 문의 — 작성 방법 선택 안내.
         2026-10-18 (apinquiry3) 모든 기기(PC·노트북·터치 노트북·iPhone·iPad·Android)에서 이 안내를 먼저 띄운다.
         mailto는 안내의 "메일 앱에서 작성"을 직접 눌렀을 때만 실행.
         ① 메일 앱(mailto) ② Gmail 웹 작성(새 탭, 사용자 클릭 링크) ③ 주소 복사 ④ 문의 내용 복사. 발송은 방문자가 직접. */
      function getGmailComposeLink(workId, work, readerMode) {
        return "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(ART_EMAIL) +
          "&su=" + encodeURIComponent(getInquirySubject(workId, work, readerMode)) +
          "&body=" + encodeURIComponent(getInquiryBody(workId, work, readerMode));
      }

      const INQUIRY_MENU_TEXT = {
        title: { kr: '이메일 문의 방법', en: 'Email inquiry', both: '이메일 문의 방법 / Email inquiry' },
        app: { kr: '메일 앱에서 작성', en: 'Write in mail app', both: '메일 앱에서 작성 / Mail app' },
        gmail: { kr: 'Gmail 웹에서 작성', en: 'Write in Gmail (web)', both: 'Gmail 웹에서 작성 / Gmail web' },
        copy: { kr: '이메일 주소 복사', en: 'Copy email address', both: '이메일 주소 복사 / Copy address' },
        gmailFail: { kr: 'Gmail 앱이 열리지 않았다면 메일 앱에서 작성하거나, 문의 내용을 복사해 사용하시는 메일에 붙여 넣어 주세요.', en: 'If the Gmail app did not open, use your mail app, or copy the inquiry text and paste it into your own email.', both: 'Gmail 앱이 열리지 않았다면 메일 앱에서 작성하거나, 문의 내용을 복사해 사용하시는 메일에 붙여 넣어 주세요.\nIf the Gmail app did not open, use your mail app, or copy the inquiry text and paste it into your own email.' },
        appFail: { kr: '메일 앱이 열리지 않았다면 Gmail 웹에서 작성하거나 문의 내용을 복사해 주세요.', en: 'If no mail app opened, use Gmail (web) or copy the inquiry text.', both: '메일 앱이 열리지 않았다면 Gmail 웹에서 작성하거나 문의 내용을 복사해 주세요.\nIf no mail app opened, use Gmail (web) or copy the inquiry text.' },
        copyContent: { kr: '문의 내용 복사', en: 'Copy inquiry text', both: '문의 내용 복사 / Copy inquiry text' },
        copiedContent: { kr: '복사되었습니다', en: 'Copied', both: '복사되었습니다 / Copied' },
        copied: { kr: '복사되었습니다', en: 'Copied', both: '복사되었습니다 / Copied' },
        copyFail: { kr: '복사하지 못했습니다. 아래 주소를 직접 선택해 주세요.', en: 'Could not copy. Please select the address below.', both: '복사하지 못했습니다. 아래 주소를 직접 선택해 주세요.\nCould not copy. Please select the address below.' },
        close: { kr: '닫기', en: 'Close', both: '닫기 / Close' }
      };

      function inquiryMenuText(key) {
        const v = INQUIRY_MENU_TEXT[key];
        return v ? (v[state.lang] || v.kr) : '';
      }

      function copyTextToClipboard(text) {
        const fallback = () => new Promise((resolve, reject) => {
          try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            try { ta.setSelectionRange(0, text.length); } catch (_) {}
            const ok = document.execCommand('copy');
            ta.remove();
            if (ok) resolve(); else reject(new Error('copy failed'));
          } catch (err) { reject(err); }
        });
        if (navigator.clipboard && window.isSecureContext) {
          return navigator.clipboard.writeText(text).catch(fallback);
        }
        return fallback();
      }

      /* 2026-10-18 (apinquiry5) 휴대폰·태블릿 판별 — 운영체제 기준(터치스크린 노트북은 PC로 본다).
         iPadOS 13+는 Mac으로 보고하므로 MacIntel + 터치 지점으로 따로 확인. */
      /* 2026-10-18 (apgmail1) 모바일 Gmail: 휴대폰·태블릿에서 Gmail 웹 작성 주소는 Google이 모바일 Gmail/앱으로
         넘기면서 받는 사람·제목·본문을 버린다. 그래서 모바일은 Gmail 앱을 직접 연다.
         iPhone·iPad: googlegmail:///co?to&subject&body (Gmail 앱 공식 작성 주소)
         Android: intent(SENDTO mailto, Gmail 앱 지정). Gmail 앱이 없으면 Gmail 웹 작성 주소로 넘어간다. */
      function getMobileMailOS() {
        try {
          const ua = navigator.userAgent || '';
          if (/Android/i.test(ua)) return 'android';
          if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
          if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return 'ios';
        } catch (_) {}
        return '';
      }

      function getGmailLinkForDevice(workId, work, readerMode) {
        const subject = encodeURIComponent(getInquirySubject(workId, work, readerMode));
        const body = encodeURIComponent(getInquiryBody(workId, work, readerMode));
        const os = getMobileMailOS();
        if (os === 'ios') {
          return "googlegmail:///co?to=" + encodeURIComponent(ART_EMAIL) + "&subject=" + subject + "&body=" + body;
        }
        if (os === 'android') {
          return "intent:mailto:" + ART_EMAIL + "?subject=" + subject + "&body=" + body +
            "#Intent;action=android.intent.action.SENDTO;package=com.google.android.gm;" +
            "S.browser_fallback_url=" + encodeURIComponent(getGmailComposeLink(workId, work, readerMode)) + ";end";
        }
        return getGmailComposeLink(workId, work, readerMode);
      }

      function isMobileMailDevice() {
        try {
          const ua = navigator.userAgent || '';
          if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
          return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
        } catch (_) { return false; }
      }

      let inquiryMenuEl = null;
      let inquiryReturnFocus = null;
      let inquiryAppCheckTimer = null;

      /* 2026-10-18 (apinquiry4) 메일 앱 실행 확인. 메일 앱(또는 Windows 앱 선택창)이 뜨면 브라우저가 포커스를 잃는다.
         1.5초 안에 그런 변화가 없으면 이 컴퓨터에 연결된 메일 앱이 없는 것으로 보고 Gmail·복사 안내를 띄운다.
         발송 성공 여부는 표시하지 않는다. */
      function watchMailAppLaunch(menu, failKey) {
        if (inquiryAppCheckTimer) { clearTimeout(inquiryAppCheckTimer); inquiryAppCheckTimer = null; }
        let left = false;
        const onBlur = () => { left = true; };
        const onVis = () => { if (document.hidden) left = true; };
        window.addEventListener('blur', onBlur);
        document.addEventListener('visibilitychange', onVis);
        inquiryAppCheckTimer = setTimeout(() => {
          inquiryAppCheckTimer = null;
          window.removeEventListener('blur', onBlur);
          document.removeEventListener('visibilitychange', onVis);
          if (left || inquiryMenuEl !== menu) return;
          const msg = menu.querySelector('.ap-inquiry-menu__msg');
          if (msg) msg.textContent = inquiryMenuText(failKey || 'appFail');
          const nextBtn = menu.querySelector(failKey === 'gmailFail' ? '[data-act=copy-content]' : '[data-act=gmail]');
          if (nextBtn) { try { nextBtn.focus({ preventScroll: true }); } catch (_) {} }
        }, 1500);
      }

      function onInquiryMenuOutside(e) {
        if (inquiryMenuEl && !inquiryMenuEl.contains(e.target)) closeInquiryMenu();
      }

      function onInquiryMenuKey(e) {
        if (!inquiryMenuEl) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          closeInquiryMenu(true);
          return;
        }
        if (e.key !== 'Tab') return;
        const items = Array.from(inquiryMenuEl.querySelectorAll('button:not([disabled]),a[href]'))
          .filter(el => el.getClientRects().length > 0);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !inquiryMenuEl.contains(document.activeElement))) {
          e.preventDefault(); e.stopPropagation(); last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !inquiryMenuEl.contains(document.activeElement))) {
          e.preventDefault(); e.stopPropagation(); first.focus();
        }
      }

      function closeInquiryMenu(restoreFocus) {
        if (!inquiryMenuEl) return;
        if (inquiryAppCheckTimer) { clearTimeout(inquiryAppCheckTimer); inquiryAppCheckTimer = null; }
        inquiryMenuEl.remove();
        inquiryMenuEl = null;
        const prev = inquiryReturnFocus;
        inquiryReturnFocus = null;
        if (restoreFocus && prev && document.contains(prev)) {
          try { prev.focus({ preventScroll:true }); } catch (_) { try { prev.focus(); } catch (_e) {} }
        }
        document.removeEventListener('pointerdown', onInquiryMenuOutside, true);
        document.removeEventListener('keydown', onInquiryMenuKey, true);
        window.removeEventListener('scroll', closeInquiryMenu);
      }

      function openInquiryMenu(anchor, workId, work) {
        closeInquiryMenu();
        inquiryReturnFocus = anchor;
        const menu = document.createElement('div');
        menu.className = 'ap-inquiry-menu ap-inquiry-menu--adaptive';
        try {
          const stored = JSON.parse(localStorage.getItem('dz.captionReader.v1') || '{}');
          const scale = [100,150,200,300,400].indexOf(Number(stored.scale)) >= 0 ? Number(stored.scale) : 300;
          menu.style.setProperty('--ap-inquiry-scale', String(scale / 100));
        } catch (_) { menu.style.setProperty('--ap-inquiry-scale', '3'); }
        menu.setAttribute('role', 'dialog');
        menu.setAttribute('aria-modal', 'true');
        menu.setAttribute('aria-label', inquiryMenuText('title'));
        const appOpt = '<a class="ap-inquiry-menu__opt" data-act="app" href="' + escapeHTML(getInquiryLink(workId, work)) + '">' + escapeHTML(inquiryMenuText('app')) + '</a>';
        const gmailIsApp = !!getMobileMailOS();
        const gmailOpt = '<a class="ap-inquiry-menu__opt" data-act="gmail" href="' + escapeHTML(getGmailLinkForDevice(workId, work)) + '"' + (gmailIsApp ? '' : ' target="_blank" rel="noopener noreferrer"') + '>' + escapeHTML(inquiryMenuText('gmail')) + '</a>';
        menu.innerHTML = [
          '<button type="button" class="ap-inquiry-menu__x" aria-label="', escapeHTML(inquiryMenuText('close')), '">×</button>',
          '<p class="ap-inquiry-menu__title">', escapeHTML(inquiryMenuText('title')), ' · ', escapeHTML(workId), '</p>',
          /* 2026-10-18 (apinquiry5) 모바일(iPhone·iPad·Android)은 메일 앱 먼저, PC·노트북은 Gmail 먼저 */
          isMobileMailDevice() ? appOpt + gmailOpt : gmailOpt + appOpt,
          '<button type="button" class="ap-inquiry-menu__opt" data-act="copy">', escapeHTML(inquiryMenuText('copy')), '</button>',
          '<button type="button" class="ap-inquiry-menu__opt" data-act="copy-content">', escapeHTML(inquiryMenuText('copyContent')), '</button>',
          '<p class="ap-inquiry-menu__addr">', escapeHTML(ART_EMAIL), '</p>',
          '<p class="ap-inquiry-menu__msg" aria-live="polite"></p>'
        ].join('');

        menu.addEventListener('click', (ev) => {
          const target = ev.target && ev.target.closest ? ev.target.closest('[data-act], .ap-inquiry-menu__x') : null;
          if (!target) return;
          if (target.classList.contains('ap-inquiry-menu__x')) { closeInquiryMenu(true); return; }
          const act = target.dataset.act;
          if (act === 'gmail') {
            /* (apgmail1) 모바일은 Gmail 앱 실행 — 창을 열어두고 실행 여부를 확인. PC는 새 탭(기존) */
            if (getMobileMailOS()) {
              const msg = menu.querySelector('.ap-inquiry-menu__msg');
              if (msg) msg.textContent = '';
              watchMailAppLaunch(menu, 'gmailFail');
              return;
            }
            window.setTimeout(closeInquiryMenu, 0);
            return;
          }
          if (act === 'copy' || act === 'copy-content') {
            const msg = menu.querySelector('.ap-inquiry-menu__msg');
            const isContent = act === 'copy-content';
            copyTextToClipboard(isContent ? getInquiryPlainText(workId, work) : ART_EMAIL).then(() => {
              if (msg) {
                /* 2026-10-18 (apinquiry6) 실제 복사 성공 뒤에만 표시, 약 2초 뒤 자동으로 지움 */
                const doneText = inquiryMenuText(isContent ? 'copiedContent' : 'copied');
                msg.textContent = doneText;
                window.setTimeout(() => { if (msg.textContent === doneText) msg.textContent = ''; }, 2000);
              }
            }).catch(() => {
              if (msg) msg.textContent = inquiryMenuText('copyFail');
            });
          }
          /* act === 'app': mailto 기본 동작. 메일 앱이 없어 아무 일도 없을 수 있으므로 안내는 열어두고 실행 여부를 확인한다 */
          if (act === 'app') {
            const msg = menu.querySelector('.ap-inquiry-menu__msg');
            if (msg) msg.textContent = '';
            watchMailAppLaunch(menu);
          }
        });

        document.body.appendChild(menu);
        inquiryMenuEl = menu;

        const r = anchor.getBoundingClientRect();
        const viewport = window.visualViewport;
        const vx = viewport ? viewport.offsetLeft : 0, vy = viewport ? viewport.offsetTop : 0;
        const vw = viewport ? viewport.width : window.innerWidth;
        const vh = viewport ? viewport.height : window.innerHeight;
        menu.style.maxWidth = Math.max(0, vw - 16) + 'px';
        menu.style.maxHeight = Math.max(0, vh - 16) + 'px';
        const mw = menu.offsetWidth, mh = menu.offsetHeight;
        const left = Math.min(Math.max(vx + 8, r.left), Math.max(vx + 8, vx + vw - mw - 8));
        let top = r.bottom + 8;
        if (top + mh > vy + vh - 8) top = r.top - mh - 8;
        top = Math.max(vy + 8, Math.min(top, vy + vh - mh - 8));
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';

        document.addEventListener('pointerdown', onInquiryMenuOutside, true);
        document.addEventListener('keydown', onInquiryMenuKey, true);
        window.addEventListener('scroll', closeInquiryMenu, { passive: true });

        const first = menu.querySelector('.ap-inquiry-menu__opt');
        if (first) { try { first.focus({ preventScroll: true }); } catch (_) {} }
      }

      // The viewer reads the same source status and uses the existing four-option inquiry dialog.
      function updateViewerCollectionStatus(work) {
        const host = document.getElementById('lbCollectionStatus');
        if (!host) return;
        host.textContent = '';
        host.hidden = true;
        if (!work || Number(work.section_id) === 0) return;
        const status = normalizeStatus(work.status);
        const label = getStatusLabel(status);
        if (!label) return; // Unset/unknown is never treated as available.
        const name = document.createElement('span');
        name.className = 'lb-collection-status__text';
        name.textContent = label;
        host.appendChild(name);
        if (status === 'available') {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'lb-collection-status__inquiry';
          btn.textContent = getInquiryText();
          btn.addEventListener('click', function () { openInquiryMenu(btn, safeText(work.id), work); });
          host.appendChild(btn);
        }
        host.hidden = false;
      }

      function renderStatusUI(work) {
        if (work.section_id === 0) return '';

        const status = normalizeStatus(work.status);
        const label = getStatusLabel(status);
        if (!label) return '';

        if (status === 'available') {
          return [
            '<div class="work-status">',
            '<div class="status-label">' + label + '</div>',
            '<a href="' + getInquiryLink(work.id, work) + '" class="status-inquiry">',
            getInquiryText(),
            '</a>',
            '</div>'
          ].join('');
        }

        return [
          '<div class="work-status">',
          '<div class="status-label">' + label + '</div>',
          '</div>'
        ].join('');
      }


      const SECTION_MAP = {
        0: { kr: 'A 기원', en: 'A Origins', enCombined: 'Origins', enLegacy: 'Origins' },
        1: { kr: 'I 우리를 위해 기도해 주세요', en: 'I Pray for Us', enCombined: 'Pray for Us', enLegacy: 'Pray for Us' },
        2: { kr: 'II 인간', en: 'II Human Being', enCombined: 'Human Being', enLegacy: 'Human Being' },
        3: { kr: 'III 정신의 재탄생', en: 'III Rebirth of Mind', enCombined: 'Rebirth of Mind', enLegacy: 'Rebirth of Mind' },
        4: { kr: 'IV 존재의 회복', en: 'IV Restoration of Being', enCombined: 'Restoration of Being', enLegacy: 'Restoration of Being' },
        5: { kr: 'V 빛의 초의식', en: 'V Metaconsciousness of Light', enCombined: 'Metaconsciousness of Light', enLegacy: 'Metaconsciousness of Light' },
        6: { kr: 'VI 빛의 파도', en: 'VI Waves of Light', enCombined: 'Waves of Light' }
      };

      /* SECTION EXCLUDE LIST — 2026-07-08 works.json 실데이터 확인 완료:
         과거에는 DZ-034("사랑") / DZ-038("당신으로부터")이 IV 섹션이 아니라는
         전제로 IV(section_id 4) 뷰에서 강제 제외하는 하드락이 걸려 있었다.
         dungzak.art의 실제 works.json을 확인한 결과 두 작품 모두
         section_id: 4, section_kr: "IV 존재의 회복", section_en:
         "Restoration of Being"으로 정확히 등록되어 있어 그 전제가 더 이상
         맞지 않는다. 확인된 데이터를 기준으로 잠금을 해제한다.
         이 목록/함수 자체는 향후 실제로 특정 작품을 특정 섹션 뷰에서
         제외해야 하는 경우를 위해 그대로 남겨둔다(예: SECTION_EXCLUDE_IDS
         = { 4: new Set(['DZ-999']) }). */
      const SECTION_EXCLUDE_IDS = {};

      function isExcludedFromSectionView(item, sectionValue) {
        if (!item || sectionValue === 'all') return false;
        const sectionNumber = Number(sectionValue);
        const id = normalizeCanonicalWorkId(item.id);
        return !!(SECTION_EXCLUDE_IDS[sectionNumber] && SECTION_EXCLUDE_IDS[sectionNumber].has(id));
      }

      /* SECTION MATCH FALLBACK FIX (IV 존재의 회복 누락 방지):
         섹션 필터는 원래 item.section_id(숫자)만 비교했다. works.json에서
         특정 작품의 section_id가 비어 있거나(null/undefined) 숫자가 아닌 값이면
         inferSectionId()가 9999(미분류)로 떨어뜨려, section_kr/section_en이
         "IV 존재의 회복 / Restoration of Being"으로 정확히 적혀 있어도 IV 섹션
         필터에서 제외되었다. dungzak.art는 section_kr/section_en 텍스트 기준으로도
         작품을 분류하므로 그쪽에서는 정상적으로 보이는 반면 Archive Pro에서만
         빠지는 정확히 이 증상을 만든다.
         이제 section_id가 일치하지 않을 때 item.section_kr / item.section_en
         텍스트를 SECTION_MAP의 해당 섹션 이름과 비교(공백/로마숫자/대소문자
         차이는 normalizeSearchToken으로 흡수)하여, 텍스트가 정확히 일치하면
         해당 섹션에 포함시킨다. section_id가 이미 올바른 작품의 동작은
         전혀 바뀌지 않는다. */
      function sectionMatchesTarget(item, sectionNumber) {
        if (!item) return false;
        if (Number(item.section_id) === sectionNumber) return true;

        const target = SECTION_MAP[sectionNumber];
        if (!target) return false;

        const itemKr = normalizeSearchToken(item.section_kr);
        const itemEn = normalizeSearchToken(item.section_en);
        const targetKr = normalizeSearchToken(target.kr);
        const targetEn = normalizeSearchToken(target.enLegacy || target.en);

        return !!((itemKr && itemKr === targetKr) || (itemEn && itemEn === targetEn));
      }

      const SVG_PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
          <rect width="800" height="800" fill="#091018"/>
          <circle cx="400" cy="400" r="180" fill="rgba(212,180,109,.08)"/>
          <circle cx="400" cy="400" r="120" fill="rgba(212,180,109,.10)"/>
          <path d="M250 520 L360 400 L455 485 L550 360 L650 520" fill="none" stroke="#7a6740" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="305" cy="270" r="42" fill="#7a6740"/>
        </svg>
      `)}`;

      const uiText = {
        kr: {
          heroModeLine: '한국어 기준',
          statDescTotal: '전체 작품 수',
          statDescFiltered: '현재 검색 결과',
          statDescSections: '섹션 수',
          labelSearch: '검색',
          labelSection: '섹션',
          labelSort: '정렬',
          placeholderSearch: '작품 검색',
          searchHint: '작품명 · ID · 재료 · 연도',
          searchClear: '검색어 지우기',
          resetBtn: '초기화',
          focusSearchBtn: '검색',
          filterToggleBtn: 'Filter / Search',
          statusIdle: '대기 중',
          statusLoading: '준비됨',
          statusFailed: '로드 실패',
          loadingScreen: '',
          loadingScreenError: 'works.json을 불러오지 못했습니다. 경로 또는 접근 권한을 확인해 주세요.',
          resultUnit: '점',
          renderedPrefix: '표시 ',
          renderedSuffix: '점',
          activeFilterNone: '필터 없음',
          filteredPrefix: '필터 적용됨',
          searchPrefix: '검색',
          sectionPrefix: '섹션',
          yearPrefix: '연도',
          emptyState: '조건에 맞는 작품이 없습니다.',
          loadMore: '더 보기 / Load more',
untitled: '무제 / 캡션 없음',
          noInfo: '정보 없음',
          allSections: '전체 섹션',
          lbMaterial: '재료',
          lbSize: '크기',
          lbYear: '연도',
          lbImage: '이미지',
          lbZoom: '줌',
          openImage: '이미지 열기',
          openZoom: '전체보기',
          offlineNotice: '오프라인에서는\nA 기원 섹션과 확대 이미지를\n제외했습니다.',
          zoomOffline: '오프라인에서는 확대 이미지를 사용할 수 없습니다.',
          sortOptions: [
            '기본순',
            '번호 늦은순',
            '최신순'
          ]
        },
        en: {
          heroModeLine: 'English mode',
          statDescTotal: 'Total works',
          statDescFiltered: 'Current results',
          statDescSections: 'Section count',
          labelSearch: 'SEARCH',
          labelSection: 'SECTION',
          labelSort: 'SORT',
          placeholderSearch: 'Search works',
          searchHint: 'Title · ID · Medium · Year',
          searchClear: 'Clear search',
          resetBtn: 'RESET',
          focusSearchBtn: 'Search',
          filterToggleBtn: 'Filter / Search',
          statusIdle: 'Idle',
          statusLoading: 'Ready',
          statusFailed: 'Failed',
          loadingScreen: '',
          loadingScreenError: 'Unable to load works.json.',
          resultUnit: ' works',
          renderedPrefix: 'Visible ',
          renderedSuffix: '',
          activeFilterNone: 'No filters',
          filteredPrefix: 'Filtered',
          searchPrefix: 'Search',
          sectionPrefix: 'Section',
          yearPrefix: 'Year',
          emptyState: 'No artworks match the current filters.',
          loadMore: '더 보기 / Load more',
untitled: 'Untitled / No Caption',
          noInfo: 'No information',
          allSections: 'All Sections',
          lbMaterial: 'Material',
          lbSize: 'Size',
          lbYear: 'Year',
          lbImage: 'Image',
          lbZoom: 'Zoom',
          openImage: 'Open image',
          openZoom: 'View Full',
          offlineNotice: 'Origins section and zoom images\nare unavailable offline.',
          zoomOffline: 'Zoom images are unavailable offline.',
          sortOptions: [
            'Default order',
            'Latest ID first',
            'Newest first'
          ]
        },
        both: {
          heroModeLine: 'KR / EN',
          statDescTotal: '전체 작품 수 / Total works',
          statDescFiltered: '현재 검색 결과 / Current results',
          statDescSections: '섹션 수 / Section count',
          labelSearch: '검색 · SEARCH',
          labelSection: '섹션 · SECTION',
          labelSort: '정렬 · SORT',
          placeholderSearch: '검색 · Search',
          searchHint: '작품명 Title · ID · 재료 Medium · 연도 Year',
          searchClear: '검색어 지우기 · Clear',
          resetBtn: '초기화 · RESET',
          focusSearchBtn: '검색 · Search',
          filterToggleBtn: 'Filter / Search',
          statusIdle: '대기 / Idle',
          statusLoading: '준비됨 / Ready',
          statusFailed: '로드 실패 / Failed',
          loadingScreen: '',
          loadingScreenError: 'works.json을 불러오지 못했습니다 / Unable to load works.json.',
          resultUnit: '점 / works',
          renderedPrefix: '표시 / Visible ',
          renderedSuffix: '',
          activeFilterNone: '필터 없음 / No filters',
          filteredPrefix: '필터 적용됨 / Filtered',
          searchPrefix: '검색 / Search',
          sectionPrefix: '섹션 / Section',
          yearPrefix: '연도 / Year',
          emptyState: '조건에 맞는 작품이 없습니다 / No artworks match the current filters.',
          loadMore: '더 보기 / Load more',
untitled: '무제 / Untitled',
          noInfo: '정보 없음 / No information',
          allSections: '전체 섹션 · All Sections',
          lbMaterial: '재료 / Material',
          lbSize: '크기 / Size',
          lbYear: '연도 / Year',
          lbImage: '이미지 / Image',
          lbZoom: '줌 / Zoom',
          openImage: '이미지 열기 / Open image',
          openZoom: '전체보기 / View Full',
          offlineNotice: '오프라인에서는\nA 기원 섹션과 확대 이미지를\n제외했습니다.\nOrigins section and zoom images\nare unavailable offline.',
          zoomOffline: '오프라인에서는 확대 이미지를 사용할 수 없습니다.\nZoom images are unavailable offline.',
          sortOptions: [
            '기본순 · Default',
            '번호 늦은순 · Latest ID',
            '최신순 · Newest'
          ]
        }
      };

      function getInitialVisibleCount() {
        return window.matchMedia('(max-width: 768px)').matches ? MOBILE_FIRST_RENDER_COUNT : DESKTOP_FIRST_RENDER_COUNT;
      }


      const state = {
        all: [],
        filtered: [],
        visibleCount: getInitialVisibleCount(),
        query: '',
        section: DEFAULT_ENTRY_SECTION,
        sort: 'section-id-asc',
        lightboxItem: null,
        lang: 'kr',
        loadState: 'idle',
        isLoaded: false,
        _searchPrepared: false,
        _sectionCount: 0
      };

      let visibleCount = getInitialVisibleCount();
      let WORKS_DATA = [];
      let WORKS_READY = false;
      let CURRENT_LIST = [];
      let finalFilteredWorks = [];
      let archiveEntered = true;
      let filterPanelOpen = true;

      const els = {
        statTotal: document.getElementById('statTotal'),
        statFiltered: document.getElementById('statFiltered'),
        statSections: document.getElementById('statSections'),
        statDescTotal: document.getElementById('statDescTotal'),
        statDescFiltered: document.getElementById('statDescFiltered'),
        statDescSections: document.getElementById('statDescSections'),
        apStatsTablet: document.querySelector('.ap-stats-tablet'),
        apStatTotalTablet: document.getElementById('apStatTotalTablet'),
        apStatFilteredTablet: document.getElementById('apStatFilteredTablet'),
        apStatSectionsTablet: document.getElementById('apStatSectionsTablet'),
        heroModeLine: document.getElementById('heroModeLine'),
        searchInput: document.getElementById('searchInput'),
        sectionSelect: document.getElementById('sectionSelect'),
        sortSelect: document.getElementById('sortSelect'),
        resetBtn: document.getElementById('resetBtn'),
        focusSearchBtn: document.getElementById('focusSearchBtn'),
        labelSearch: document.getElementById('labelSearch'),
        labelSection: document.getElementById('labelSection'),
        labelSort: document.getElementById('labelSort'),
        loadingScreen: document.getElementById('loadingScreen'),
        resultsMeta: document.getElementById('resultsMeta'),
        resultText: document.getElementById('resultText'),
        renderedText: document.getElementById('renderedText'),
        activeFilterText: document.getElementById('activeFilterText'),
        grid: document.getElementById('grid'),
        emptyState: document.getElementById('emptyState'),
        loadWrap: document.getElementById('loadWrap'),
        loadMoreBtn: document.getElementById('loadMoreBtn'),
lightbox: document.getElementById('lightbox'),
        lightboxClose: document.getElementById('viewerCloseBtn') || document.getElementById('lightboxClose'),
        lightboxPrev: document.getElementById('lightboxPrev'),
        lightboxNext: document.getElementById('lightboxNext'),
        lightboxImage: document.getElementById('lightboxImage'),
        lightboxStage: document.querySelector('.lightbox-stage'),
        lbId: document.getElementById('lbId'),
        lbTitle: document.getElementById('lbTitle'),
        lbSection: document.getElementById('lbSection'),
        lbMaterialVal: document.getElementById('lbMaterial'),
        lbSizeVal: document.getElementById('lbSize'),
        lbYearVal: document.getElementById('lbYear'),
        lbImagePath: document.getElementById('lbImagePath'),
        lbZoomPath: document.getElementById('lbZoomPath'),
        lbOpenImage: document.getElementById('lbOpenImage'),
        lbOpenZoom: document.getElementById('lbOpenZoom'),
        lbKeyMaterial: document.getElementById('lbKeyMaterial'),
        lbKeySize: document.getElementById('lbKeySize'),
        lbKeyYear: document.getElementById('lbKeyYear'),
        lbKeyImage: document.getElementById('lbKeyImage'),
        lbKeyZoom: document.getElementById('lbKeyZoom'),
        langTabs: Array.from(document.querySelectorAll('.lang-tab')),
        apResetTrigger: document.getElementById('ap-reset-trigger'),
        labLink: document.getElementById('labLink'),
        entryBtn: document.getElementById('entryBtn') || document.getElementById('enterArchivePro'),
        filterToggleWrap: document.getElementById('filterToggleWrap'),
        filterToggleBtn: document.getElementById('filterToggleBtn'),
        searchArea: document.getElementById('searchArea'),
        sectionButtons: Array.from(document.querySelectorAll('.section-btn'))
      };

      const numberFormat = new Intl.NumberFormat('ko-KR');
      let searchTimer = null;
      let worksLoadPromise = null;
      let archiveRefreshTask = null;
      let archiveScrollY = 0;
      /* IPAD FULLSCREEN TOUCH-SCROLL-LOCK FIX 2026-08-25:
         Separate from archiveScrollY above (which is left completely untouched — it
         still drives where the gallery scrolls back to on close, unchanged). This pair
         only tracks whether the new body position:fixed scroll lock is currently
         applied, so it can be engaged exactly once per lightbox-open session (not
         reapplied on every Next/Prev step, which would otherwise stomp the saved
         position with 0 on the second navigation) and safely released on close. */
      let bodyScrollLockActive = false;
      let bodyScrollLockY = 0;
      let closeClickBlockUntil = 0;

      let viewerScale = 1;
      let viewerX = 0;
      let viewerY = 0;
      let viewerStartX = 0;
      let viewerStartY = 0;
      let viewerLastX = 0;
      let viewerLastY = 0;
      let viewerStartTime = 0;
      let viewerIsDragging = false;
      let viewerIsZooming = false;
      let viewerInitialDistance = 0;
      let viewerStartScale = 1;
      let viewerLastTap = 0;
      let viewerMouseDragging = false;
      /* ARCHIVE PRO MOBILE PINCH-END SWIPE MISFIRE FIX ONLY */
      let mobilePinchJustEnded = false;
      let mobilePinchEndTimer = null;

      /* PERF PATCH 2026-07-11: viewer frame-rect cache (avoids getBoundingClientRect
         on every touchmove) + a load token so a background zoom-image swap never
         lands on top of a viewer the user has already navigated away from. */
      let viewerFrameCache = null;
      let viewerLoadToken = 0;

      function isViewerOpen() {
        return els.lightbox && els.lightbox.classList.contains('open') && document.body.classList.contains('viewer-open');
      }

      function isMobileViewerMode() {
        return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
      }

      function isIPadPortraitViewerMode() {
        return (
          navigator.maxTouchPoints > 1 &&
          Math.min(window.screen.width, window.screen.height) >= 768 &&
          window.matchMedia &&
          window.matchMedia('(orientation: portrait)').matches
        );
      }

      /* ARCHIVE PRO VIEWER ZOOM/PAN BOUNDARY MODE
         Touch/tablet detection used ONLY to gate the fullscreen Viewer
         pinch-zoom + drag-pan boundary engine. Desktop (fine pointer with
         hover) is deliberately excluded so existing desktop behaviour is
         untouched. */
      function isCoarsePointerViewerMode() {
        return !!(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
      }

      function isIPadDeviceViewerMode() {
        // iPad in BOTH orientations (portrait + landscape).
        return (
          navigator.maxTouchPoints > 1 &&
          Math.min(window.screen.width, window.screen.height) >= 768
        );
      }

      function isTouchViewerBoundaryMode() {
        return isMobileViewerMode() || isIPadDeviceViewerMode() || isCoarsePointerViewerMode();
      }

      if (
        navigator.maxTouchPoints > 1 &&
        Math.min(window.screen.width, window.screen.height) >= 768
      ) {
        document.documentElement.classList.add('is-ipad');
      }

      /* IPAD PORTRAIT "INTERMITTENT IMAGE HEIGHT OVERFLOW" FIX — SAFETY NET 2026-08-25:
         The CSS fix above (max-width:880px branch now pins .lightbox/#lightbox to
         100dvh, closing the 769-880px width gap that had no explicit dvh height at
         all) addresses the confirmed, code-verified root cause. This is an additional,
         purely-additive hardening layer for the narrower failure window `dvh` itself
         can still have on some iPadOS Safari versions: `dvh` is defined to track the
         CURRENT dynamic viewport, but while the address bar/toolbar is actively
         animating open or closed, a couple of versions of Safari have been observed to
         report a transiently stale value for a frame or two before settling. Per the
         "가능하면 visualViewport.height를 우선 고려하라" guidance, this reads
         window.visualViewport.height (the API specifically designed to reflect the
         actual currently-visible area, independent of layout-viewport/toolbar quirks)
         when available, and writes it to a CSS custom property that ONLY the portrait
         + touch + <=880px branch consumes (see the `--ap-portrait-vvh` rule below) — it
         has no effect on iPad Landscape, PC, or any other already-working environment.
         Recomputed on resize/orientationchange/visualViewport resize+scroll, coalesced
         to one requestAnimationFrame per burst so a flurry of events (all three commonly
         fire together on iPad) can never apply a stale value after a newer one — only
         the LAST scheduled read before the next paint ever gets written. */
      (function setupPortraitViewportHeightGuard() {
        var vvhRaf = null;
        function applyUsableHeight() {
          vvhRaf = null;
          var usable = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
          if (usable) {
            document.documentElement.style.setProperty('--ap-portrait-vvh', usable + 'px');
          }
        }
        function scheduleUsableHeight() {
          if (vvhRaf) return;
          vvhRaf = requestAnimationFrame(applyUsableHeight);
        }
        scheduleUsableHeight();
        window.addEventListener('resize', scheduleUsableHeight, { passive: true });
        window.addEventListener('orientationchange', scheduleUsableHeight, { passive: true });
        if (window.visualViewport) {
          window.visualViewport.addEventListener('resize', scheduleUsableHeight, { passive: true });
          window.visualViewport.addEventListener('scroll', scheduleUsableHeight, { passive: true });
        }
      })();

      function armMobilePinchEndGuard() {
        mobilePinchJustEnded = true;
        if (mobilePinchEndTimer) clearTimeout(mobilePinchEndTimer);
        mobilePinchEndTimer = setTimeout(() => {
          mobilePinchJustEnded = false;
          mobilePinchEndTimer = null;
        }, 350);
      }

      function clearMobilePinchEndGuard() {
        mobilePinchJustEnded = false;
        if (mobilePinchEndTimer) {
          clearTimeout(mobilePinchEndTimer);
          mobilePinchEndTimer = null;
        }
      }

      function shouldBlockMobileViewerSwipe() {
        return isTouchViewerBoundaryMode() && (viewerIsZooming || mobilePinchJustEnded || viewerScale > 1.01);
      }

      function clampViewerValue(value, min, max) {
        return Math.min(Math.max(value, min), max);
      }

      function invalidateViewerFrameCache() {
        viewerFrameCache = null;
      }

      function clampViewerToFrame() {
        if (!els.lightboxStage || !els.lightboxImage) return;
        if (viewerScale <= 1) { viewerX = 0; viewerY = 0; return; }

        /* PERF PATCH 2026-07-11: getBoundingClientRect()/offsetWidth/offsetHeight
           are layout reads. During a pinch/pan gesture this function runs on every
           touchmove (up to ~60-120x/sec), so re-reading layout each time is the
           actual jank source on iPhone Safari. Frame/box/natural size never change
           mid-gesture (only viewerScale/X/Y do), so compute once per gesture and
           reuse until invalidateViewerFrameCache() is called (new artwork, zoom
           image swap, resize/orientation change, new touch gesture start). */
        if (!viewerFrameCache) {
          const frame = els.lightboxStage.getBoundingClientRect();
          if (!frame || !frame.width || !frame.height) return;

          /* Visible window = the image element's own box (the Viewer image area).
             On mobile the <img> is width/height:100%, so this equals the stage
             content box; on the desktop-style layout it equals the contained
             image. Either way pan is bounded to this rectangle. */
          const boxW = els.lightboxImage.offsetWidth || frame.width;
          const boxH = els.lightboxImage.offsetHeight || frame.height;

          /* Actual rendered content size AFTER object-fit:contain, so letterboxed
             (portrait/landscape) images get correct limits instead of the full box. */
          const natW = els.lightboxImage.naturalWidth || boxW;
          const natH = els.lightboxImage.naturalHeight || boxH;
          const fitScale = Math.min(boxW / natW, boxH / natH) || 1;
          const renderedW = natW * fitScale;
          const renderedH = natH * fitScale;

          viewerFrameCache = { boxW: boxW, boxH: boxH, renderedW: renderedW, renderedH: renderedH };
        }

        const cache = viewerFrameCache;
        const scaledW = cache.renderedW * viewerScale;
        const scaledH = cache.renderedH * viewerScale;

        /* Move only when the scaled content is larger than the visible box;
           otherwise that axis stays centred at 0. */
        const maxX = Math.max(0, (scaledW - cache.boxW) / 2);
        const maxY = Math.max(0, (scaledH - cache.boxH) / 2);

        viewerX = maxX > 0 ? clampViewerValue(viewerX, -maxX, maxX) : 0;
        viewerY = maxY > 0 ? clampViewerValue(viewerY, -maxY, maxY) : 0;
      }

      function applyViewerTransform() {
        if (!els.lightboxImage) return;
        if (viewerScale <= 1.02) {
          viewerScale = 1;
          viewerX = 0;
          viewerY = 0;
        }
        clampViewerToFrame();
        els.lightboxImage.style.transform = `translate3d(${viewerX}px, ${viewerY}px, 0) scale(${viewerScale})`;
        if (els.lightboxStage) els.lightboxStage.classList.toggle('is-zoomed', viewerScale > 1.02);
      }

      function resetViewerTransform() {
        viewerScale = 1;
        viewerX = 0;
        viewerY = 0;
        viewerIsDragging = false;
        viewerIsZooming = false;
        viewerMouseDragging = false;
        viewerStartScale = 1;
        viewerInitialDistance = 0;
        invalidateViewerFrameCache();
        clearMobilePinchEndGuard();
        if (els.lightboxStage) els.lightboxStage.classList.remove('is-dragging', 'is-zoomed');
        if (els.lightboxImage) {
          /* ARCHIVE PRO VIEWER TRANSFORM RESET FIX ONLY
             Always overwrite the previous zoom/pan matrix before a new artwork renders. */
          els.lightboxImage.style.transition = 'none';
          els.lightboxImage.style.transform = 'translate3d(0px, 0px, 0) scale(1)';
          els.lightboxImage.style.willChange = 'transform';
          requestAnimationFrame(() => {
            if (els.lightboxImage) els.lightboxImage.style.transition = '';
          });
        }
      }

      function getViewerDistance(t1, t2) {
        return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      }

      function getCurrentViewerIndex() {
        if (!state.lightboxItem || !state.filtered.length) return -1;
        return state.filtered.findIndex((item) => item === state.lightboxItem || item.id === state.lightboxItem.id);
      }

      function openViewerByOffset(offset) {
        if (!isViewerOpen() || !state.filtered.length) return;
        if (shouldBlockMobileViewerSwipe()) return;
        const current = getCurrentViewerIndex();
        if (current < 0) return;
        const nextIndex = (current + offset + state.filtered.length) % state.filtered.length;
        resetViewerTransform();
        openLightbox(state.filtered[nextIndex]);
      }

      function nextViewer() { openViewerByOffset(1); }
      function prevViewer() { openViewerByOffset(-1); }

      const lazyImageObserver = 'IntersectionObserver' in window
        ? new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              loadLazyImage(entry.target);
              observer.unobserve(entry.target);
            });
          }, { root: null, rootMargin: '200px 0px', threshold: 0.001 })
        : null;

      function t(key) {
        return uiText[state.lang][key];
      }

      function renderFilterToggleLabel() {
        if (!els.filterToggleBtn) return;
        const main = escapeHTML(t('filterToggleBtn'));
        const clickText = 'click';
        els.filterToggleBtn.innerHTML = '<span class="cta-main">' + main.toUpperCase() + '</span><span class="cta-sub">' + escapeHTML(clickText) + '</span>';
      }

      function playFilterGlowOnce() {
        if (!els.filterToggleBtn || window.__filterGlowPlayed) return;
        window.__filterGlowPlayed = true;
        els.filterToggleBtn.classList.remove('glow-once', 'brand-glow-once');
        void els.filterToggleBtn.offsetWidth;
        els.filterToggleBtn.classList.add('brand-glow-once');
      }


      function safeText(v) {
        if (v === null || v === undefined) return '';
        return String(v).trim();
      }

      function escapeHTML(value) {
        return String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      function toAbsoluteUrl(path) {
        const clean = safeText(path);
        if (!clean) return '';
        if (/^https?:\/\//i.test(clean)) return clean;
        return new URL(clean.replace(/^\/+/, ''), SITE_ROOT).href;
      }

      function debounce(fn, delay) {
        return (...args) => {
          window.clearTimeout(searchTimer);
          searchTimer = window.setTimeout(() => fn(...args), delay);
        };
      }

      function syncDataLanguage(root = document) {
        root.querySelectorAll('[data-kr][data-en]').forEach((node) => {
          const kr = node.dataset.kr || '';
          const en = node.dataset.en || '';

          if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
            node.placeholder = state.lang === 'en' ? en : (state.lang === 'both' ? `${kr}\n${en}` : kr);
            return;
          }

          if (state.lang === 'en') node.textContent = en;
          else if (state.lang === 'both') node.textContent = `${kr}\n${en}`;
          else node.textContent = kr;
        });
      }

      function setStatusByState() {
        return;
      }

      function getSectionTextById(sectionId) {
        const sec = SECTION_MAP[sectionId];
        if (!sec) return state.lang === 'en' ? 'Unsorted' : (state.lang === 'both' ? '미분류 · Unsorted' : '미분류');
        if (state.lang === 'en') return sec.en;
        /* 2026-10-13 (apsearch1): 섹션 선택 상자의 KR+EN 표기를 앱과 같게 "한글 · 영문(로마숫자 포함)" */
        if (state.lang === 'both') return `${sec.kr} · ${sec.en}`;
        return sec.kr;
      }

      /* LEGACY EN DISPLAY — used only outside the SECTION dropdown/select box
         (work card section-tag, Viewer section label). The dropdown fix
         (roman numerals in EN mode for all sections) is scoped to the
         dropdown/select display only; every other existing surface keeps
         showing section names exactly as it did before that fix. */
      function getSectionTextByIdLegacyEN(sectionId) {
        const sec = SECTION_MAP[sectionId];
        if (!sec) return state.lang === 'en' ? 'Unsorted' : (state.lang === 'both' ? '미분류 / Unsorted' : '미분류');
        if (state.lang === 'en') return sec.enLegacy || sec.en;
        if (state.lang === 'both') return `${sec.kr} / ${sec.enCombined || sec.en}`;
        return sec.kr;
      }

      function getSectionPlainById(sectionId, lang) {
        const sec = SECTION_MAP[sectionId];
        if (!sec) return lang === 'en' ? 'Unsorted' : '미분류';
        return lang === 'en' ? (sec.enLegacy || sec.en) : sec.kr;
      }

      function getTitle(item) {
        const kr = safeText(item.title_kr);
        const en = safeText(item.title_en);
        if (state.lang === 'en') return en || kr || '';
        if (state.lang === 'both') {
          if (kr && en && kr !== en) return `${kr} / ${en}`;
          return kr || en || '';
        }
        return kr || en || '';
      }

      /* VIEWER TITLE — KR+EN two-line render (display only).
         KR+EN 모드에서만 제목을 KR(첫 줄) / EN(둘째 줄)로 분리해 표시한다.
         getTitle()은 카드·정렬·alt에 그대로 쓰이므로 변경하지 않는다.
         "/" 구분자 제거, 언어 전환 로직·JSON 구조·Viewer 기능은 변경 없음. */
      function setViewerTitle(item, fallbackTitle, isOrigin) {
        const el = els.lbTitle;
        if (!el) return;
        el.classList.remove('lb-title--stacked');

        if (isOrigin || state.lang !== 'both') {
          el.textContent = fallbackTitle;
          return;
        }

        const kr = safeText(item.title_kr);
        const en = safeText(item.title_en);

        if (kr && en && kr !== en) {
          el.textContent = '';
          const krLine = document.createElement('span');
          krLine.className = 'lb-title-kr';
          krLine.textContent = kr;
          const enLine = document.createElement('span');
          enLine.className = 'lb-title-en';
          enLine.textContent = en;
          el.appendChild(krLine);
          el.appendChild(enLine);
          el.classList.add('lb-title--stacked');
        } else {
          el.textContent = fallbackTitle;
        }
      }

      function getMaterial(item) {
        const kr = safeText(item.material_kr);
        const en = safeText(item.material_en);
        if (state.lang === 'en') return en || kr;
        if (state.lang === 'both') {
          if (kr && en && kr !== en) return `${kr} / ${en}`;
          return kr || en;
        }
        return kr || en;
      }

      function getSize(item) {
        const kr = safeText(item.size_kr);
        const en = safeText(item.size_en);
        if (state.lang === 'en') return en || kr;
        if (state.lang === 'both') {
          if (kr && en && kr !== en) return `${kr} / ${en}`;
          return kr || en;
        }
        return kr || en;
      }

      function getYear(item) {
        return safeText(item.year);
      }

      function getOriginTitle() {
        if (state.lang === 'en') return 'Untitled';
        if (state.lang === 'both') return '무제 / Untitled';
        return '무제';
      }

      function parseIdNumber(id) {
        const match = safeText(id).match(/(\d+)(?!.*\d)/);
        return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
      }

      function parseIdPrefix(id) {
        return safeText(id)
          .toLowerCase()
          .replace(/[-_\s]*\d+.*$/i, '')
          .replace(/[^a-z가-힣]/g, '');
      }

      function compareIdNatural(a, b, direction = 'asc') {
        const ap = parseIdPrefix(a.id);
        const bp = parseIdPrefix(b.id);
        const prefixCompare = ap.localeCompare(bp, 'ko', { numeric: true, sensitivity: 'base' });
        if (prefixCompare !== 0) return direction === 'desc' ? -prefixCompare : prefixCompare;

        const an = parseIdNumber(a.id);
        const bn = parseIdNumber(b.id);
        if (an !== bn) return direction === 'desc' ? bn - an : an - bn;

        const rawCompare = safeText(a.id).localeCompare(safeText(b.id), 'ko', { numeric: true, sensitivity: 'base' });
        return direction === 'desc' ? -rawCompare : rawCompare;
      }

      function parseYearNumbers(year) {
        const matches = String(year || '').match(/\d{4}/g) || [];
        const nums = matches
          .map((v) => parseInt(v, 10))
          .filter((v) => Number.isFinite(v));
        return nums;
      }

      function parseYearNumber(year) {
        const nums = parseYearNumbers(year);
        return nums.length ? nums[0] : null;
      }

      function parseYearEndNumber(year) {
        const nums = parseYearNumbers(year);
        return nums.length ? nums[nums.length - 1] : null;
      }

      function getYearSearchValues(item) {
        const raw = safeText(item.year);
        const parsed = parseYearNumber(raw);
        const values = [raw];
        if (parsed !== null) values.push(String(parsed), `year ${parsed}`, `연도 ${parsed}`);
        return values.filter(Boolean);
      }

      function getIdSearchValues(item) {
        const id = safeText(item.id);
        const compact = compactSearchToken(id);
        const noDash = id.replace(/[-_\s]/g, '');
        const number = parseIdNumber(id);
        const prefix = id.replace(/[-_]?\d+$/i, '');
        const values = [id, compact, noDash];
        if (Number.isFinite(number) && number !== Number.MAX_SAFE_INTEGER) {
          values.push(String(number), `${prefix}${number}`, `${prefix}${String(number).padStart(3, '0')}`);
        }
        return values.filter(Boolean);
      }

      function inferSectionId(item) {
        const id = safeText(item.id);
        const sid = Number(item.section_id);

        /* SECTION ABSOLUTE RULE:
           - OR-* is always Origins.
           - All other works use JSON section_id only.
           - No title/section text guessing, so sections never overlap by inference. */
        if (/^or[-_]?\d+/i.test(id)) return 0;
        if (Number.isFinite(sid) && sid >= 0 && sid <= 6) return sid;
        return 9999;
      }

      function normalizeCanonicalWorkId(id) {
        const raw = safeText(id);
        const m = raw.match(/^(OR|DZ)[-_]?(\d+)$/i);
        if (!m) return raw;
        const prefix = m[1].toUpperCase();
        const num = Number(m[2]);
        if (!Number.isFinite(num)) return raw;
        if (prefix === 'OR') return 'OR-' + String(num).padStart(3, '0');
        return 'DZ-' + String(num).padStart(3, '0');
      }

      function buildDungzakMainImageUrl(id, kind) {
        const cleanId = normalizeCanonicalWorkId(id);
        const folder = kind === 'zoom' ? 'zoom' : 'standard';
        if (!/^DZ-\d{3}$/i.test(cleanId)) return '';
        return 'https://raw.githubusercontent.com/dungzakcestlavie/dungzakcestlavie.github.io/main/images/' + folder + '/' + encodeURIComponent(cleanId) + '.jpg';
      }
function normalizeImageUrl(url, kind, id, sectionId) {
        /* DATA MIXING EMERGENCY FIX:
           대표 이미지와 줌 이미지는 works.json의 같은 work 객체 값만 사용한다.
           id / section / index로 이미지 경로를 새로 조합하지 않는다. */
        return safeText(url).replace(/\s+/g, '');
      }

      function normalizeItem(raw, index) {
        const item = raw && typeof raw === 'object' ? raw : {};
        const id = String(item.id || '').trim() || 'item-' + (index + 1);
        const sectionId = inferSectionId({ id, section_id: item.section_id });

        let image = normalizeImageUrl(item.image, 'image', id, sectionId);
        let zoom = normalizeImageUrl(item.zoom || item.image, 'zoom', id, sectionId) || image;

        /* HUMAN SECTION IMAGE LOCK FIX:
           II 인간(section_id 2)은 제목/메타데이터와 이미지가 섞여 보이지 않도록
           카드와 라이트박스 이미지를 반드시 작품 id(DZ-###) 기준의 dungzak.art 이미지 경로로 고정한다.
           works.json의 구조와 작품 데이터는 변경하지 않고, 화면 출력 경로만 안전하게 잠근다. */
        if (Number(sectionId) === 2 && /^DZ-\d{3}$/i.test(normalizeCanonicalWorkId(id))) {
          const lockedImage = buildDungzakMainImageUrl(id, 'image');
          const lockedZoom = buildDungzakMainImageUrl(id, 'zoom');
          if (lockedImage) image = lockedImage;
          if (lockedZoom) zoom = lockedZoom;
        }

        return {
          _index: index,
          _key: `${index}::${sectionId}::${id}`,
          id,
          section_id: sectionId,
          section_kr: String(item.section_kr || '').trim(),
          section_en: String(item.section_en || '').trim(),
          title_kr: String(item.title_kr || '').trim(),
          title_en: String(item.title_en || '').trim(),
          material_kr: String(item.material_kr || '').trim(),
          material_en: String(item.material_en || '').trim(),
          size_kr: String(item.size_kr || '').trim(),
          size_en: String(item.size_en || '').trim(),
          year: String(item.year || '').trim(),
          keywords: item.keywords == null ? '' : item.keywords, /* 2026-10-14 (apsearch2) 앱 검색 대상과 같게 */
          image,
          zoom,
          status: String(item.status || '').trim()
        };
      }

      function normalizeSearchToken(value) {
        return safeText(value)
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .normalize('NFKC')
          .replace(/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅰⅱⅲⅳⅴⅵⅶⅷⅸⅹ]/g, (m) => ({
            'Ⅰ':'1', 'Ⅱ':'2', 'Ⅲ':'3', 'Ⅳ':'4', 'Ⅴ':'5', 'Ⅵ':'6', 'Ⅶ':'7', 'Ⅷ':'8', 'Ⅸ':'9', 'Ⅹ':'10',
            'ⅰ':'1', 'ⅱ':'2', 'ⅲ':'3', 'ⅳ':'4', 'ⅴ':'5', 'ⅵ':'6', 'ⅶ':'7', 'ⅷ':'8', 'ⅸ':'9', 'ⅹ':'10'
          }[m] || m))
          .replace(/[‐‑‒–—―]/g, '-')
          .replace(/&/g, ' and ')
          .replace(/\+/g, ' plus ')
          .replace(/\bcolour\b/g, 'color')
          .replace(/\bcolours\b/g, 'colors')
          .replace(/\bcentre\b/g, 'center')
          .replace(/\bmetaconsciousness\b/g, 'meta consciousness')
          .replace(/\boilstick\b/g, 'oil stick')
          .replace(/\bmixedmedia\b/g, 'mixed media')
          .replace(/["'“”‘’]+/g, '')
          .replace(/[_:;,.\/\|()[\]{}<>]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      function compactSearchToken(value) {
        return normalizeSearchToken(value).replace(/[^a-z0-9가-힣ㄱ-ㅎ]/g, '');
      }

      function hangulInitials(value) {
        const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
        return safeText(value).split('').map((ch) => {
          const code = ch.charCodeAt(0) - 0xAC00;
          if (code >= 0 && code <= 11171) return CHO[Math.floor(code / 588)] || ch;
          return ch;
        }).join('');
      }

      /* SEARCH LANGUAGE ALIAS MAP — search-only enhancement
         KR queries match Korean title/material words.
         EN queries match English title/material words.
         No UI, design, data, render, section, or sort behavior is changed. */
      const SEARCH_ALIAS_GROUPS = [
        ['watercolour', 'watercolor', 'water colour', 'water color', 'aquarelle', '수채', '수채화', '수채물감', '수채 물감', '종이에 수채', 'watercolour on paper', 'watercolor on paper'],
        ['oil', 'oil paint', 'oil painting', 'oil on canvas', 'oil on paper', '유화', '오일', '오일 물감', '캔버스에 유채', '종이에 유채'],
        ['oilstick', 'oil stick', 'oil pastel', '오일스틱', '오일 스틱', '오일 파스텔'],
        ['acrylic', 'acrylics', 'acrylic paint', 'acrylic on canvas', 'acrylic on paper', '아크릴', '아크릴 물감', '캔버스에 아크릴', '종이에 아크릴'],
        ['canvas', 'on canvas', 'linen', '천', '캔버스', '캔버스에', '캔버스 작품'],
        ['paper', 'on paper', 'drawing paper', 'hanji', '종이', '종이에', '한지', '종이 작품'],
        ['pencil', 'graphite', 'graphite pencil', 'colored pencil', 'colour pencil', 'color pencil', 'pencil on paper', '연필', '흑연', '색연필', '종이에 연필'],
        ['charcoal', 'charcoal on paper', '목탄', '숯', '종이에 목탄'],
        ['ink', 'ink on paper', 'indian ink', '먹', '잉크', '종이에 먹', '종이에 잉크'],
        ['gouache', 'gouache on paper', '과슈', '구아슈'],
        ['pigment', 'powder pigment', 'pigment on cotton', '분채', '안료', '분채화'],
        ['unbleached cotton', 'cotton', 'raw cotton', 'cotton cloth', '광목', '면천', '천에 분채'],
        ['mixed media', 'mixed-media', 'mixed materials', '혼합재료', '혼합 재료', '복합매체'],
        ['light', 'illumination', 'radiance', '빛', '광', '광휘'],
        ['awakens', 'awake', 'awakening', 'wake', 'light awakens us', '빛은 우리를 깨어나게 한다', '깨어나게', '깨어나다', '깨우다', '각성'],
        ['memory', 'remember', 'remembrance', '기억', '기억하다'],
        ['being', 'existence', 'presence', '존재', '실존'],
        ['human', 'human being', 'people', 'person', '인간', '사람'],
        ['mind', 'spirit', 'consciousness', 'psyche', '정신', '마음', '의식'],
        ['rebirth', 'regeneration', 'rebirth of mind', '정신의 재탄생', '재탄생', '다시 태어남'],
        ['restoration', 'recovery', 'restoration of being', '존재의 회복', '회복', '복원'],
        ['metaconsciousness', 'meta consciousness', 'metaconsciousness of light', '빛의 초의식', '초의식'],
        ['origin', 'origins', 'beginning', 'source', 'root', '기원', '근원', '시작'],
        ['pray', 'prayer', 'pray for us', 'please pray for us', '기도', '우리를 위해 기도', '우리를 위해 기도해 주세요'],
        ['art', 'artist', 'artwork', 'painting', '예술', '미술', '작품', '회화'],
        ['life', 'living', '인생', '삶', '생명'],
        ['here', 'there', 'where', 'wherefrom', '여기', '거기', '어디', '어디에서'],
        ['thought', 'thinking', 'contemplation', 'meditation', '사유', '생각'],
        ['shape', 'form', 'structure', 'forms', '형태', '구조'],
        ['sky', 'heaven', '하늘'],
        ['wave', 'waving', 'waving sky', '파도', '파도치는', '물결'],
        ['seine', 'seine river', 'paris', '센느강', '센강', '파리'],
        ['tears', 'tear', 'crying', '눈물'],
        ['love', '사랑'],
        ['time', 'temporality', '시간'],
        ['blue', 'green', 'red', 'yellow', 'gold', 'white', 'black', '푸른', '파랑', '초록', '빨강', '노랑', '금빛', '흰색', '검정'],
        ['available', 'available for collection', 'for sale', 'inquiry', '소장 가능', '소장가능', '문의'],
        ['reserved', 'on hold', '예약', '예약중'],
        ['collected', 'sold', 'sold out', '소장 완료', '소장완료', '소장됨', '판매완료']
      ];

      function getSearchAliases(value) {
        const base = normalizeSearchToken(value);
        const compact = compactSearchToken(value);
        const aliases = [base, compact, hangulInitials(base), hangulInitials(compact)];

        const groups = SEARCH_ALIAS_GROUPS;

        groups.forEach((group) => {
          const normalizedGroup = group.map(normalizeSearchToken);
          if (normalizedGroup.some((word) => base.includes(word) || compact.includes(compactSearchToken(word)))) {
            aliases.push(...group, ...normalizedGroup, ...group.map(compactSearchToken));
          }
        });

        return Array.from(new Set(aliases.map(safeText).filter(Boolean)));
      }

      function getSectionAliases(sectionId) {
        const map = {
          0: ['0', 'a', 'origin', 'origins', 'or', 'beginning', 'source', '기원', '근원', 'ㄱㅇ'],
          1: ['1', 'i', 'pray', 'pray for us', 'prayer', '우리를 위해 기도해 주세요', '우리를 위해 기도', '기도', 'ㅇㄹㄹㅇㅎㄱㄷㅎㅈㅅㅇ', 'ㄱㄷ'],
          2: ['2', 'ii', 'human', 'human being', 'people', '인간', '사람', 'ㅇㄱ'],
          3: ['3', 'iii', 'rebirth', 'rebirth of mind', 'mind', 'spirit', '정신의 재탄생', '정신', '재탄생', 'ㅈㅅㅇㅈㅌㅅ', 'ㅈㅅ'],
          4: ['4', 'iv', 'restoration', 'restoration of being', 'being', 'existence', '존재의 회복', '존재', '회복', 'ㅈㅈㅇㅎㅂ', 'ㅈㅈ'],
          5: ['5', 'v', 'metaconsciousness', 'meta consciousness', 'metaconsciousness of light', 'light', '빛의 초의식', '빛', '초의식', 'ㅂㅇㅊㅇㅅ', 'ㅂㅊㅇㅅ', 'ㅂ'],
          6: ['6', 'vi', 'waves of light', 'wave of light', 'waves', 'wave', '빛의 파도', '파도', 'ㅂㅇㅍㄷ', 'ㅍㄷ']
        };
        return map[Number(sectionId)] || [];
      }

      function buildSearchText(item) {
        if (item && item._searchText) return item._searchText;

        const sectionKr = getSectionPlainById(item.section_id, 'kr');
        const sectionEn = getSectionPlainById(item.section_id, 'en');
        const values = [
          ...getIdSearchValues(item),
          `section ${item.section_id}`,
          `섹션 ${item.section_id}`,
          `${item.section_id}섹션`,
          item.section_id,
          item.section_kr,
          item.section_en,
          sectionKr,
          sectionEn,
          ...getSectionAliases(item.section_id),
          item.title_kr,
          item.title_en,
          item.material_kr,
          item.material_en,
          item.size_kr,
          item.size_en,
          ...getYearSearchValues(item),
          item.status,
          item.image,
          item.zoom
        ];

        const expanded = values.flatMap(getSearchAliases);
        const normalized = expanded.map(normalizeSearchToken).filter(Boolean);
        const compacted = expanded.map(compactSearchToken).filter(Boolean);
        const initials = expanded.map(hangulInitials).map(compactSearchToken).filter(Boolean);
        const searchText = Array.from(new Set([...normalized, ...compacted, ...initials])).join(' ');

        if (item) {
          item._searchText = searchText;
          item._searchCompact = compactSearchToken(searchText);
          item._searchInitials = compactSearchToken(hangulInitials(searchText));
          item._sectionAliases = getSectionAliases(item.section_id).flatMap(getSearchAliases).map(normalizeSearchToken);
        }

        return searchText;
      }

      function getItemSearchCompact(item, haystack) {
        if (item && item._searchCompact) return item._searchCompact;
        const compact = compactSearchToken(haystack || buildSearchText(item));
        if (item) item._searchCompact = compact;
        return compact;
      }

      function getItemSearchInitials(item, haystack) {
        if (item && item._searchInitials) return item._searchInitials;
        const initials = compactSearchToken(hangulInitials(haystack || buildSearchText(item)));
        if (item) item._searchInitials = initials;
        return initials;
      }

      function getItemSectionAliases(item) {
        if (item && item._sectionAliases) return item._sectionAliases;
        const aliases = getSectionAliases(item.section_id).flatMap(getSearchAliases).map(normalizeSearchToken);
        if (item) item._sectionAliases = aliases;
        return aliases;
      }


      /* SEARCH INDEX — built once per work (lazily, the first time a search
         actually runs), then reused for every keystroke. Nothing here is
         recomputed per keystroke, and nothing about loading, infinite
         scroll, or caching elsewhere in the file is touched. */
      function normalizeSearchText(text) {
        return String(text == null ? '' : text)
          .toLowerCase()
          .replace(/[-_.,\/]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      /* Bare initial consonants can reach this function in either of two
         Unicode blocks that look identical to the eye but are different
         code points:
           - U+3131–U+314E  Hangul Compatibility Jamo (ㄱㄴㄷ...) — what a
             real keyboard/IME produces when you type a consonant on its own.
           - U+1100–U+1112  Hangul Choseong Jamo (ᄀᄂᄃ...) — the old-style
             lead-consonant block, which text can arrive in after copy/paste
             or NFD normalization elsewhere.
         Both are canonicalized to the Compatibility Jamo form below, so a
         query is matched correctly no matter which block it was typed or
         pasted in. */
      const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
      const CHOSEONG_JAMO_TO_COMPAT = {};
      for (let i = 0; i < CHO.length; i += 1) {
        CHOSEONG_JAMO_TO_COMPAT[String.fromCharCode(0x1100 + i)] = CHO[i];
      }

      function getKoreanInitials(text) {
        const str = String(text == null ? '' : text);
        let result = '';

        for (let i = 0; i < str.length; i += 1) {
          const ch = str[i];
          const code = ch.charCodeAt(0) - 0xAC00;

          if (code >= 0 && code <= 11171) {
            /* Composed Hangul syllable (가–힣) → its leading consonant (초성). */
            result += CHO[Math.floor(code / 588)];
          } else if (CHOSEONG_JAMO_TO_COMPAT[ch]) {
            /* Old-style Choseong jamo (ᄀᄂᄃ...) → canonical compatibility form. */
            result += CHOSEONG_JAMO_TO_COMPAT[ch];
          } else if (CHO.indexOf(ch) !== -1) {
            /* Already a bare compatibility consonant (typed directly) → keep as-is. */
            result += ch;
          }
          /* Everything else (spaces, latin letters, digits, punctuation) is dropped,
             so "존재의 회복" → "ㅈㅈㅇㅎㅂ" with no leftover space. */
        }

        return result;
      }

      /* 2026-10-14 (apsearch2) — 검색 판정을 ARCHIVE PRO 앱(app/js/filter.js)과 똑같이.
         · 검색 대상(필드별): ID · 작품명 KR/EN · 재료 KR/EN · 크기 KR/EN · 연도 · 상태 · 키워드 · 섹션명
         · 검색어 = 앞뒤 공백 제거 + 소문자. 각 필드(소문자)에 검색어가 포함되면 일치
         · 검색어가 초성만(ㄱ~ㅎ)이면 각 필드의 초성 변환값에도 포함 여부 확인
         색인은 작품마다 첫 검색 때 1번만 만들고 재사용(기존 지연 색인 방식 유지). */
      const AP_APP_CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

      function apAppLower(value) {
        return String(value == null ? '' : value).trim().toLowerCase();
      }

      function apAppToChosung(text) {
        let out = '';
        for (let i = 0; i < text.length; i += 1) {
          const code = text.charCodeAt(i);
          out += (code >= 44032 && code <= 55203) ? AP_APP_CHO[Math.floor((code - 44032) / 588)] : text[i];
        }
        return out;
      }

      function apAppIsChosungOnly(query) {
        if (!query) return false;
        for (let i = 0; i < query.length; i += 1) {
          if (AP_APP_CHO.indexOf(query[i]) === -1) return false;
        }
        return true;
      }

      function buildWorkSearchIndex(item) {
        const sec = SECTION_MAP[item.section_id] || null;
        const fields = [
          item.id,
          item.title_kr,
          item.title_en,
          item.material_kr,
          item.material_en,
          item.size_kr,
          item.size_en,
          item.year,
          item.status,
          item.keywords,
          item.section_kr,
          item.section_en
        ];
        if (sec) {
          fields.push(sec.kr, sec.en);
          if (sec.enLegacy && sec.enLegacy !== sec.en) fields.push(sec.enLegacy);
        }
        const text = fields.map(apAppLower);
        return { text, initials: text.map(apAppToChosung) };
      }

      function prepareFastSearchCache(item) {
        if (!item) return item;
        if (item.__searchIndex) return item;
        item.__searchIndex = buildWorkSearchIndex(item);
        item._yearEndNumber = parseYearEndNumber(item.year) || 0;
        item._yearStartNumber = parseYearNumber(item.year) || 0;
        return item;
      }

      function scheduleFullSearchIndex() {
        /* 첫 화면 CPU 절약: 전체 색인은 첫 검색 때 만든다(기존 그대로). */
        return;
      }

      function matchesSearch(item, rawQuery) {
        const query = apAppLower(rawQuery);
        if (!query) return true;

        const index = item && item.__searchIndex;
        if (!index) return false;

        const chosungOnly = apAppIsChosungOnly(query);
        for (let i = 0; i < index.text.length; i += 1) {
          if (index.text[i].indexOf(query) !== -1) return true;
          if (chosungOnly && index.initials[i].indexOf(query) !== -1) return true;
        }
        return false;
      }

      function compareIdAsc(a, b) {
        return compareIdNatural(a, b, 'asc');
      }

      function compareIdDesc(a, b) {
        return compareIdNatural(a, b, 'desc');
      }

      function compareYearAsc(a, b) {
        const ay = parseYearNumber(a.year);
        const by = parseYearNumber(b.year);

        // Year 없는 항목은 항상 뒤로 보낸다. 둘 다 없으면 ID 자연 정렬.
        if (ay === null && by === null) return compareIdAsc(a, b);
        if (ay === null) return 1;
        if (by === null) return -1;

        if (ay !== by) return ay - by;
        return compareIdAsc(a, b);
      }

      function compareYearDesc(a, b) {
        const ay = parseYearEndNumber(a.year);
        const by = parseYearEndNumber(b.year);

        // Year 없는 항목은 항상 뒤로 보낸다. 둘 다 없으면 ID 자연 정렬.
        if (ay === null && by === null) return compareIdAsc(a, b);
        if (ay === null) return 1;
        if (by === null) return -1;

        if (ay !== by) return by - ay;
        return compareIdAsc(a, b);
      }

      function compareItems(a, b, mode) {
        /* SORT HARD RULE:
           - Section filter and section buttons are independent from sorting.
           - Year sort always uses parsed numeric year first.
           - If the year is the same, ID order is used as the stable tie-breaker.
           - Section + Year keeps sections grouped, then orders works by year inside each section. */
        switch (mode) {
          case 'section-year-asc': {
            if (a.section_id !== b.section_id) return a.section_id - b.section_id;
            return compareYearAsc(a, b);
          }
          case 'section-year-desc': {
            if (a.section_id !== b.section_id) return a.section_id - b.section_id;
            return compareYearDesc(a, b);
          }
          case 'id-asc':
            return compareIdAsc(a, b);
          case 'id-desc':
            return compareIdDesc(a, b);
          case 'year-desc':
            return compareYearDesc(a, b);
          case 'year-asc':
            return compareYearAsc(a, b);
          case 'title-asc': {
            const at = getTitle(a) || a.id;
            const bt = getTitle(b) || b.id;
            const c = at.localeCompare(bt, 'ko', { numeric: true, sensitivity: 'base' });
            if (c !== 0) return c;
            return compareIdAsc(a, b);
          }
          case 'section-id-asc':
          default: {
            if (a.section_id !== b.section_id) return a.section_id - b.section_id;
            return compareIdAsc(a, b);
          }
        }
      }

      function syncEntryButtonLanguage() {
        if (!els.entryBtn) return;
        const kr = els.entryBtn.dataset.kr || '아카이브 입장 →';
        const en = els.entryBtn.dataset.en || 'Enter Archive →';
        if (state.lang === 'en') {
          els.entryBtn.textContent = en;
        } else if (state.lang === 'both') {
          els.entryBtn.innerHTML = kr + '<br>' + en;
        } else {
          els.entryBtn.textContent = kr;
        }
      }

      function setFieldTitle(el, text) {
        if (!el) return;
        while (el.firstChild) el.removeChild(el.firstChild);
        const part = (value, cls) => {
          const sp = document.createElement('span');
          sp.className = cls;
          sp.textContent = value;
          el.appendChild(sp);
        };
        const pieces = String(text || '').split(' · ');
        if (pieces.length === 2) {
          part(pieces[0], 'ap-lbl-ko');
          el.appendChild(document.createTextNode(' · '));
          part(pieces[1], 'ap-lbl-en');
        } else {
          part(String(text || ''), /[가-힣]/.test(String(text || '')) ? 'ap-lbl-ko' : 'ap-lbl-en');
        }
      }

      function rebuildStaticTexts() {
        syncEntryButtonLanguage();
        els.heroModeLine.textContent = t('heroModeLine');
        els.statDescTotal.textContent = t('statDescTotal');
        els.statDescFiltered.textContent = t('statDescFiltered');
        els.statDescSections.textContent = t('statDescSections');
        /* 2026-10-13 (apsearch1): 섹션·정렬·검색 제목은 한글/영문을 span으로 나눠 넣는다(영문 자간만 따로). 안내·지우기 문구도 언어별 */
        setFieldTitle(els.labelSearch, t('labelSearch'));
        setFieldTitle(els.labelSection, t('labelSection'));
        setFieldTitle(els.labelSort, t('labelSort'));
        els.searchInput.placeholder = t('placeholderSearch');
        els.resetBtn.textContent = t('resetBtn');
        els.focusSearchBtn.textContent = t('focusSearchBtn');
        const searchHintEl = document.getElementById('archiveSearchHint');
        if (searchHintEl) searchHintEl.textContent = t('searchHint');
        const searchClearEl = document.getElementById('archiveSearchClear');
        if (searchClearEl) searchClearEl.setAttribute('aria-label', t('searchClear'));
        renderFilterToggleLabel();
        els.emptyState.textContent = t('emptyState');
        els.loadMoreBtn.textContent = t('loadMore');
els.lbKeyMaterial.textContent = t('lbMaterial');
        els.lbKeySize.textContent = t('lbSize');
        els.lbKeyYear.textContent = t('lbYear');
        els.lbKeyImage.textContent = t('lbImage');
        els.lbKeyZoom.textContent = t('lbZoom');
        els.lbOpenImage.textContent = t('openImage');
        els.lbOpenZoom.textContent = t('openZoom');
        els.loadingScreen.textContent = state.loadState === 'failed' ? t('loadingScreenError') : t('loadingScreen');

        const sortTexts = t('sortOptions');
        Array.from(els.sortSelect.options).forEach((opt, idx) => {
          if (sortTexts[idx]) opt.textContent = sortTexts[idx];
        });

        syncDataLanguage();
        setStatusByState();
      }

      /* ALWAYS-VISIBLE SECTIONS
         Some sections (e.g. VI 빛의 파도 / Waves of Light, section_id 6) are
         defined ahead of any actual works being registered. These must still
         appear in the SECTION dropdown with a normal, empty (0-result) filter
         state — never hidden just because sectionIdsWithWorks doesn't have
         them yet. */
      const ALWAYS_VISIBLE_SECTION_IDS = new Set([6]);

      function populateSections() {
        const prev = state.section;
        els.sectionSelect.textContent = '';

        const fragment = document.createDocumentFragment();

        const sectionIdsWithWorks = new Set(
          (Array.isArray(state.all) ? state.all : [])
            .map(item => Number(item.section_id))
            .filter(n => Number.isFinite(n))
        );

        Object.keys(SECTION_MAP)
          .map(Number)
          .sort((a, b) => a - b)
          .forEach((sectionId) => {
            if (!sectionIdsWithWorks.has(sectionId) && !ALWAYS_VISIBLE_SECTION_IDS.has(sectionId)) return;

            const opt = document.createElement('option');
            opt.value = String(sectionId);
            opt.textContent = getSectionTextById(sectionId);
            fragment.appendChild(opt);
          });

        els.sectionSelect.appendChild(fragment);

        const values = Array.from(els.sectionSelect.options).map(o => o.value);
        /* A section must be selected: restore section I when the legacy 'all' value is loaded. */
        state.section = values.includes(prev) ? prev : (values.includes(DEFAULT_ENTRY_SECTION) ? DEFAULT_ENTRY_SECTION : (values[0] || 'all'));
        els.sectionSelect.value = state.section;

        updateSectionButtonState();
      }

      function updateSectionButtonState() {
        els.sectionButtons.forEach((btn) => {
          const active = state.section !== 'all' && btn.dataset.section === String(state.section);
          btn.classList.toggle('active', active);
        });
      }

      function updateActiveFilterDataset() {
        const krParts = [];
        const enParts = [];

        if (state.section !== 'all') {
          krParts.push(`섹션 ${getSectionPlainById(Number(state.section), 'kr')}`);
          enParts.push(`Section ${getSectionPlainById(Number(state.section), 'en')}`);
        }

        if (state.query) {
          krParts.push(`검색 “${state.query}”`);
          enParts.push(`Search “${state.query}”`);
        }

        /* 정렬(SORT) 라벨은 위쪽 SORT 드롭다운에 이미 동일하게 표시되므로
           이 배지에는 더 이상 중복 표시하지 않음. 필터가 없을 때는
           '필터 없음' 같은 placeholder 문구도 표시하지 않음(아래에서 배지 자체를 숨김). */
        if (!krParts.length && !enParts.length) {
          els.activeFilterText.dataset.kr = '';
          els.activeFilterText.dataset.en = '';
        } else {
          els.activeFilterText.dataset.kr = `필터 적용됨: ${krParts.join(' + ')}`;
          els.activeFilterText.dataset.en = `Filtered: ${enParts.join(' + ')}`;
        }

        if (isArchiveOfflineMode()) {
          const offlineKr = '오프라인에서는\nA 기원 섹션과 확대 이미지를\n제외했습니다.';
          const offlineEn = 'Origins section and zoom images\nare unavailable offline.';

          els.activeFilterText.dataset.kr = els.activeFilterText.dataset.kr
            ? els.activeFilterText.dataset.kr + '\n' + offlineKr
            : offlineKr;

          els.activeFilterText.dataset.en = els.activeFilterText.dataset.en
            ? els.activeFilterText.dataset.en + '\n' + offlineEn
            : offlineEn;
        }

        /* 표시할 내용(필터 적용됨, 오프라인 안내 등)이 전혀 없으면 배지 자체를
           화면에서 완전히 숨김 — 언어 모드(KR/EN/KR+EN)와 무관하게 글자가 남지 않도록
           CSS :empty 대신 직접 display를 제어함. */
        const hasFilterBadgeContent = Boolean(els.activeFilterText.dataset.kr) || Boolean(els.activeFilterText.dataset.en);
        els.activeFilterText.style.display = hasFilterBadgeContent ? '' : 'none';

        syncDataLanguage(els.activeFilterText.parentElement);
      }

      function updateEntryUXClasses() {
        document.body.classList.toggle('archive-entered', archiveEntered);
        document.body.classList.toggle('archive-filter-open', archiveEntered);
        if (els.filterToggleBtn) {
          els.filterToggleBtn.setAttribute('aria-expanded', filterPanelOpen ? 'true' : 'false');
          renderFilterToggleLabel();
        }
      }

      function enterArchiveExperience() {
        archiveEntered = true;
        filterPanelOpen = true;
        state.query = '';
        state.section = DEFAULT_ENTRY_SECTION;
        state.sort = FAST_ORDER;
        state.visibleCount = getInitialVisibleCount();
        visibleCount = state.visibleCount;

        if (els.searchInput) els.searchInput.value = '';
        if (els.sectionSelect) els.sectionSelect.value = state.section;
        if (els.sortSelect) els.sortSelect.value = FAST_ORDER;

        updateEntryUXClasses();
        requestAnimationFrame(playFilterGlowOnce);
        showArchiveShellImmediately();

        if (state.isLoaded && state.all.length) {
          state.filtered = applyFilterSort(state.all);
          CURRENT_LIST = state.filtered;
          renderAll();
        } else {
          updateStats();
        }

        requestAnimationFrame(() => {
          if (els.grid) els.grid.scrollIntoView({ behavior: 'auto', block: 'start' });
        });
      }

      function toggleFilterPanel() {
        archiveEntered = true;
        filterPanelOpen = true;
        updateEntryUXClasses();
      }

      function updateStats() {
        WORKS_DATA = state.all;
        CURRENT_LIST = state.filtered;
        finalFilteredWorks = state.filtered;
        visibleCount = state.visibleCount;

        if (!state.isLoaded && !state.all.length) {
          updateActiveFilterDataset();
          return;
        }

        const total = state.all.length;
        const filtered = state.filtered.length;
        const sections = state._sectionCount || 0;
        const visibleNow = Math.min(state.visibleCount, filtered);

        els.statTotal.textContent = numberFormat.format(total);
        els.statFiltered.textContent = numberFormat.format(filtered);
        els.statSections.textContent = numberFormat.format(sections);

        updateActiveFilterDataset();

        const hasActiveSearchOrFilter = Boolean(state.query) || state.section !== 'all';

        /* Tablet Layout top stats: "N Works · N Sections" before a
           search/filter is active, "N Results" only once one is —
           never both at once. No-op on desktop/mobile (element is
           display:none there, so this write is cheap and harmless). */
        if (els.apStatsTablet) {
          if (els.apStatTotalTablet) els.apStatTotalTablet.textContent = numberFormat.format(total);
          if (els.apStatSectionsTablet) els.apStatSectionsTablet.textContent = numberFormat.format(sections);
          if (els.apStatFilteredTablet) els.apStatFilteredTablet.textContent = numberFormat.format(filtered);
          els.apStatsTablet.classList.toggle('ap-has-results', hasActiveSearchOrFilter);
        }

        if (hasActiveSearchOrFilter) {
          els.resultText.textContent = `${numberFormat.format(filtered)} results · ${numberFormat.format(total)} works`;
          els.renderedText.textContent = `${t('renderedPrefix')}${numberFormat.format(visibleNow)}${t('renderedSuffix')}`;
        } else {
          /* [1] 결과 영역 중복 제거: 상단 stats-inline 영역(전체/결과/섹션 수)과
             동일한 정보이므로 작품 목록 바로 위에는 다시 표시하지 않음.
             검색/필터가 활성화된 경우의 결과 수 표시 로직은 위 분기에서 그대로 유지됨. */
          els.resultText.textContent = '';
          els.renderedText.textContent = '';
        }
      }

      /* ARCHIVE PRO THUMBNAIL AUTO-RECOVERY (GitHub Raw intermittent fail fix)
         A network-level fetch of raw.githubusercontent.com occasionally fails
         once and succeeds immediately on a plain refetch. Instead of asking
         the user to refresh, retry the SAME thumbnail exactly once, after a
         short delay, with a fresh cache-busting param. No infinite loop:
         each <img> is retried at most once via data-thumb-retried. */
      function retryThumbOnce(img, src, onGiveUp) {
        if (!img || !src || img.dataset.thumbRetried === 'true') return false;
        img.dataset.thumbRetried = 'true';
        if (img.dataset.originalSrc) {
          img.src = img.dataset.originalSrc;
          return true;
        }
        const delay = 300 + Math.floor(Math.random() * 200);
        setTimeout(() => {
          if (!img || !document.body.contains(img)) return;
          const sep = src.indexOf('?') === -1 ? '?' : '&';
          img.onerror = () => {
            if (typeof onGiveUp === 'function') onGiveUp();
          };
          img.src = src + sep + '_retry=' + Date.now();
        }, delay);
        return true;
      }

      function loadLazyImage(img) {
        if (!img || img.dataset.loaded === 'true') return;

        const src = img.dataset.src || img.getAttribute('data-src') || '';

        if (!src) {
          img.src = SVG_PLACEHOLDER;
          img.classList.add('is-error', 'is-loaded');
          img.dataset.loaded = 'true';
          return;
        }

        img.onload = () => {
          img.classList.add('is-loaded');
          img.classList.remove('is-error');
          img.dataset.loaded = 'true';
          img.removeAttribute('data-src');
        };

        const giveUpOnThumb = () => {
          img.classList.add('is-error', 'is-loaded');
          img.dataset.loaded = 'true';
          img.removeAttribute('data-src');
          img.src = SVG_PLACEHOLDER;
        };

        img.onerror = () => {
          if (retryThumbOnce(img, src, giveUpOnThumb)) return;
          giveUpOnThumb();
        };

        img.src = src;
      }

      function observeLazyImages(root = els.grid) {
        if (!root) return;
        const images = root.querySelectorAll('img.thumb[data-src]');

        if (!lazyImageObserver) {
          images.forEach(loadLazyImage);
          return;
        }

        images.forEach((img) => lazyImageObserver.observe(img));
      }

      function bindPriorityThumbRetry(root = els.grid) {
        if (!root) return;
        root.querySelectorAll('img.thumb.is-priority').forEach((img) => {
          if (img.dataset.thumbRetryBound === 'true') return;
          img.dataset.thumbRetryBound = 'true';
          const originalSrc = img.getAttribute('src') || '';
          if (!originalSrc || originalSrc === SVG_PLACEHOLDER) return;

          img.onerror = () => {
            if (retryThumbOnce(img, originalSrc, () => {
              img.classList.add('is-error');
              img.src = SVG_PLACEHOLDER;
            })) return;
            img.classList.add('is-error');
            img.src = SVG_PLACEHOLDER;
          };
        });
      }

      function createThumb(primarySrc, alt) {
        const img = document.createElement('img');
        img.className = 'thumb';
        img.alt = alt;
        img.width = 800;
        img.height = 800;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.fetchPriority = 'low';

        img.dataset.src = primarySrc || '';
        img.dataset.loaded = 'false';

        img.addEventListener('load', () => {
          img.classList.add('is-loaded');
        }, { once: true });

        img.addEventListener('error', () => {
          img.removeAttribute('data-src');
          img.src = SVG_PLACEHOLDER;
          img.classList.add('is-error');
        }, { once: true });

        if (!primarySrc) {
          img.src = SVG_PLACEHOLDER;
          img.classList.add('is-error');
          img.dataset.loaded = 'true';
        }

        return img;
      }

      function isSectionAllowedForRender(item) {
        if (!item) return false;
        if (state.section === 'all') return true;
        if (isExcludedFromSectionView(item, state.section)) {
          return false;
        }
        return sectionMatchesTarget(item, Number(state.section));
      }

      function createCardHTML(item, index = 0) {
        if (!isSectionAllowedForRender(item)) return '';

        const work = item;
        const isOrigin = Number(work.section_id) === 0;
        const title = isOrigin ? getOriginTitle() : getTitle(work);
        const material = isOrigin ? '' : getMaterial(work);
        const size = isOrigin ? '' : getSize(work);
        const year = isOrigin ? '' : getYear(work);
        const infoLine = isOrigin ? '' : [material, size, year].filter(Boolean).join(' / ');
        const rawImage = safeText(work.image);
        const originalSrc = rawImage
          ? withCacheBust(isArchiveOfflineMode() ? standardImageUrlOnly(rawImage) : rawImage)
          : '';
        const preset = Number(work.section_id) === 1 && /^DZ-0(?:0[1-9]|1[0-2])$/.test(work.id)
          && rawImage === STANDARD_ART_BASE + work.id + '.jpg';
        const imageSrc = preset ? '/archivepro/thumbs/' + work.id + '.jpg?v=21' : originalSrc;
        const originalAttribute = preset ? ' data-original-src="' + escapeHTML(originalSrc) + '"' : '';
        const detailText = state.lang === 'en' ? 'View Detail →' : (state.lang === 'both' ? '상세 보기 →\nView Detail →' : '상세 보기 →');
        const statusHTML = renderStatusUI(work);
        const priority = index < INITIAL_RENDER_COUNT;
        const imgSrc = imageSrc || SVG_PLACEHOLDER;
        const dataSrc = (!priority && imageSrc) ? ' data-src="' + escapeHTML(imageSrc) + '"' : '';
        const loading = priority ? 'eager' : 'lazy';
        const fetchPriority = index === 0 ? 'high' : priority ? 'auto' : 'low';
        const loadedClass = priority ? ' is-priority' : '';
        const key = String(work._key || (work._index + '::' + work.section_id + '::' + work.id));

        return [
          '<article class="card" data-render-index="', escapeHTML(index), '" data-key="', escapeHTML(key), '" data-id="', escapeHTML(work.id), '" data-section-id="', escapeHTML(work.section_id), '">',
            '<div class="thumb-wrap" role="button" tabindex="0" aria-label="', escapeHTML(work.id), ' · ', escapeHTML(title || work.id), ' · ', escapeHTML(state.lang === 'en' ? 'View artwork details' : '작품 상세 보기'), '">',
              '<img class="thumb', loadedClass, '" src="', escapeHTML(priority ? imgSrc : SVG_PLACEHOLDER), '"', dataSrc, originalAttribute, ' alt="', escapeHTML(title || work.id || ''), '" loading="', loading, '" decoding="async" fetchpriority="', fetchPriority, '" data-zoom="', escapeHTML(work.zoom || ''), '">',
              '<span class="detail-hover" data-kr="상세 보기 →" data-en="View Detail →">', escapeHTML(detailText), '</span>',
            '</div>',
            '<div class="card-body">',
              '<div class="card-top">',
                '<div class="work-id">', escapeHTML(work.id), '</div>',
                '<div class="section-tag">', escapeHTML(getSectionTextByIdLegacyEN(work.section_id)), '</div>',
              '</div>',
              '<p class="title', title ? '' : ' empty', '">', escapeHTML(title || t('untitled')), '</p>',
              isOrigin ? '' : '<p class="caption">' + escapeHTML(infoLine || t('noInfo')) + '</p>',
              statusHTML,
            '</div>',
          '</article>'
        ].join('');
      }

      function isDefaultFastView() {
        return !state.query && state.section === 'all' && state.sort === FAST_ORDER && state.visibleCount === INITIAL_VISIBLE;
      }

      function cacheDefaultGridSnapshot() {
        return;
      }

      function restoreDefaultGridSnapshot() {
        return false;
      }

      function getVisibleItems() {
        /* Load More Continuation Fix:
           The render source is the already filtered + searched + sorted array.
           Do not re-sort here. This keeps id-desc order stable across accumulated loads. */
        finalFilteredWorks = Array.isArray(state.filtered) ? state.filtered : [];
        CURRENT_LIST = finalFilteredWorks;
        visibleCount = state.visibleCount;
        return finalFilteredWorks.slice(0, visibleCount);
      }

      function buildCardHTMLSafely(work, index) {
        /*
          Archive Pro Continuity Guard:
          A single malformed work item must never stop the rest of Origins / archive rendering.
          Return an empty string for the bad item and keep the batch moving.
        */
        try {
          if (!work || typeof work !== 'object') return '';
          if (!isSectionAllowedForRender(work)) return '';
          return createCardHTML(work, index) || '';
        } catch (error) {
          try {
            console.warn('[Archive Pro] skipped malformed work card', work && work.id ? work.id : index, error);
          } catch (_) {}
          return '';
        }
      }

      function renderCards(items) {
        if (!els.grid) return;
        if (lazyImageObserver) {
          els.grid.querySelectorAll('img.thumb[data-src]').forEach((img) => {
            try { lazyImageObserver.unobserve(img); } catch (_) {}
          });
        }

        const safeItems = (Array.isArray(items) ? items : []);
        const template = document.createElement('template');
        template.innerHTML = safeItems.map((work, index) => buildCardHTMLSafely(work, index)).join('');
        const fragment = template.content;

        els.grid.replaceChildren(fragment);
        syncDataLanguage(els.grid);
        observeLazyImages(els.grid);
        bindPriorityThumbRetry(els.grid);
      }

      function appendCards(items, startIndex = 0) {
        if (!els.grid || !items || !items.length) return null;

        const safeItems = (Array.isArray(items) ? items : []);
        const html = safeItems.map((work, index) => buildCardHTMLSafely(work, startIndex + index)).join('');
        if (!html) return null;

        const template = document.createElement('template');
        template.innerHTML = html;
        const fragment = template.content;
        const firstNewCard = fragment.firstElementChild;

        const newCards = Array.from(fragment.children);
        els.grid.appendChild(fragment);
        newCards.forEach((card) => {
          syncDataLanguage(card);
          observeLazyImages(card);
        });

        return els.grid.querySelector('[data-render-index="' + startIndex + '"]') || firstNewCard || (els.grid.children ? els.grid.children[startIndex] : null);
      }

      function scrollToNewLoadStart(anchorCard) {
        if (!anchorCard) return;

        /*
          Precise Load More Start Fix:
          After LOAD MORE, the viewport must begin from the first newly appended card,
          not from the previous row. Do not subtract sticky header height here; on the
          compressed Archive Pro view that subtraction exposes the old row above the
          new batch. Use the card's exact document Y, then confirm once more after
          lazy image/layout settling.
        */
        const getExactTop = () => {
          const rect = anchorCard.getBoundingClientRect();
          return Math.max(0, Math.round(window.scrollY + rect.top));
        };

        const scrollExact = (behavior = 'auto') => {
          window.scrollTo({ top: getExactTop(), behavior });
        };

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollExact('auto');
            window.setTimeout(() => scrollExact('auto'), 80);
            window.setTimeout(() => scrollExact('auto'), 180);
          });
        });
      }

      function renderGrid() {
        if (!els.grid) return;
        if (!archiveEntered) {
          updateStats();
          return;
        }

        if (els.loadingScreen) { els.loadingScreen.hidden = true; els.loadingScreen.style.display = 'none'; }
        if (els.resultsMeta) els.resultsMeta.style.display = 'flex';
        if (els.emptyState) {
          /*
            VI 빛의 파도 / Waves of Light (section_id 6) — EMPTY STATE EXCEPTION
            This section has no works registered yet, so it can never
            produce a non-empty result. Per request, the generic
            "조건에 맞는 작품이 없습니다 / No artworks match the current
            filters." box should not appear for this section — just an
            empty grid area. Every other section/search-empty case keeps
            showing the existing message exactly as before.
          */
          const isEmptyWaveSection = String(state.section) === '6' && state.filtered.length === 0;
          els.emptyState.hidden = state.filtered.length !== 0 || isEmptyWaveSection;
        }

        if (!state.filtered.length) {
          els.grid.innerHTML = '';
          if (els.loadWrap) els.loadWrap.hidden = true;
          updateStats();
          return;
        }

        const visible = getVisibleItems();
        renderCards(visible);
        try { console.log('[Archive Pro] rendered:', visible.length, '/ filtered:', state.filtered.length, '/ allWorks:', state.all.length); } catch (_) {}

        if (els.loadWrap) els.loadWrap.hidden = visible.length >= state.filtered.length;
        updateStats();
        setupAutoBatchRendering();
      }

      function renderSectionOptions() {
        populateSections();
      }

      function renderSectionButtons() {
        updateSectionButtonState();
      }

      function updateMeta() {
        updateStats();
      }

      function renderAll() {
        updateStats();
        renderSectionOptions();
        renderSectionButtons();
        renderGrid();
        updateMeta();
      }

      function render() {
        renderGrid();
      }

      let firstGridRenderScheduled = false;

      function scheduleFirstGridRender() {
        if (firstGridRenderScheduled) return;
        firstGridRenderScheduled = true;
        requestAnimationFrame(() => {
          renderGrid();
          try { apLogTiming('first work cards rendered'); } catch (_) {}
          try {
            /* Measurement only — logs when the first eager/high-priority
               thumbnail actually finishes downloading, as a proxy for LCP.
               Does not change what loads or when. */
            const firstImg = els.grid ? els.grid.querySelector('img.thumb.is-priority') : null;
            if (firstImg) {
              if (firstImg.complete) {
                apLogTiming('first priority thumbnail already loaded');
              } else {
                firstImg.addEventListener('load', () => {
                  try { apLogTiming('first priority thumbnail loaded'); } catch (_) {}
                }, { once: true });
              }
            }
          } catch (_) {}
          scheduleFullSearchIndex();
          /* REOPEN SPEED PATCH 2026-07-13: best-effort scroll restore, after
             the first batch of cards exists. See restoreScrollYOnce() above
             for why this never forces early rendering of extra cards. */
          try { restoreScrollYOnce(); } catch (_) {}
        });
      }

      /* NEIGHBOR PRELOAD PATCH 2026-07-11: warm the browser cache for the
         standard image of the next/previous artwork while the browser is
         idle, so stepping through the Viewer feels instant. Conservative by
         design — only the standard image, never zoom, and never while
         Origins offline mode is on, so it cannot conflict with the existing
         offline cache policy. */
      function preloadImageQuiet(url) {
        if (!url) return;
        try {
          const img = new Image();
          img.decoding = 'async';
          img.src = url;
        } catch (_) {}
      }

      function scheduleNeighborPreload(item) {
        if (!item || isArchiveOfflineMode()) return;
        const list = Array.isArray(state.filtered) && state.filtered.length ? state.filtered : state.all;
        if (!Array.isArray(list) || list.length < 2) return;
        const idx = list.findIndex((work) => work === item || work.id === item.id);
        if (idx < 0) return;

        const run = () => {
          const nextItem = list[(idx + 1) % list.length];
          const prevItem = list[(idx - 1 + list.length) % list.length];
          [nextItem, prevItem].forEach((neighbor) => {
            if (neighbor && neighbor.image) {
              preloadImageQuiet(withCacheBust(toAbsoluteUrl(neighbor.image)));
            }
          });
        };

        /* FLASH-ON-PAGE FIX 2026-08-21: this used to wait for requestIdleCallback
           (up to 1500ms) or a 300ms timeout before warming the neighbor images.
           Under quick, repeated left/right clicks the preload for image N+2
           routinely hadn't started yet by the time the user reached it, so the
           opacity fade (see #lightboxImage.is-loading/.is-ready above) had
           nothing to fade FROM but blank stage for a real network round-trip —
           still reading as a flash even with the transition in place. Firing
           the preload immediately (same as the reference app's viewer.js
           preloadNeighbors(), which has no delay at all) keeps neighbors warm
           enough that the fade is the only thing the eye sees. */
        run();
      }

      function openLightbox(item, fromCaptionReader = false) {
        archiveScrollY = window.scrollY || document.documentElement.scrollTop || 0;
        /* IPAD FULLSCREEN TOUCH-SCROLL-LOCK FIX 2026-08-25:
           Root cause of "swipe up/down in the iPad fullscreen viewer shifts the whole
           screen": the only scroll lock in place was `document.body.style.overflow =
           'hidden'` (further down in this function, unchanged). That alone is a
           well-known-unreliable lock on iOS Safari specifically — Safari can still let
           a touch-driven page scroll/rubber-band happen even with body/html set to
           overflow:hidden, because the page's real scroll position is not the same
           thing CSS overflow governs there. The standard, reliable fix (used broadly
           across the web for exactly this iOS quirk) is to additionally pin body with
           position:fixed at its current scroll offset while the overlay is open, then
           release it and jump back to that offset on close — which is what this block
           does, using the SAME already-open check as the rest of this function so it
           only engages on the initial open, never again on every Next/Prev call (this
           function runs on every navigation, not just the first open). archiveScrollY
           and restoreArchiveScroll() above/below are completely unchanged and still own
           restoring the actual gallery scroll position on close. */
        if (!isViewerOpen() && !bodyScrollLockActive) {
          bodyScrollLockY = window.scrollY || document.documentElement.scrollTop || 0;
          bodyScrollLockActive = true;
          document.body.style.position = 'fixed';
          document.body.style.top = '-' + bodyScrollLockY + 'px';
          document.body.style.left = '0';
          document.body.style.right = '0';
          document.body.style.width = '100%';
        }
        state.lightboxItem = item;
        resetViewerTransform();

        const isOrigin = Number(item.section_id) === 0;
        const title = isOrigin ? getOriginTitle() : (getTitle(item) || t('untitled'));
        const material = isOrigin ? '—' : (getMaterial(item) || '—');
        const size = isOrigin ? '—' : (getSize(item) || '—');
        const year = isOrigin ? '—' : (getYear(item) || '—');
        const offlineMode = isArchiveOfflineMode();
        const imageUrl = item.image ? withCacheBust(toAbsoluteUrl(item.image)) : '';
        const zoomUrl = (!offlineMode && item.zoom) ? withCacheBust(toAbsoluteUrl(item.zoom)) : '';
        /* PROGRESSIVE VIEWER IMAGE PATCH 2026-07-11:
           Show the standard image first — it is usually already warm in the
           browser cache from the grid thumbnail (same `image` field), so the
           Viewer can paint almost instantly. The zoom image loads in the
           background and swaps in once ready (perf brief section 6). Falls
           back to the previous zoom-first behaviour when there is no standard
           image, and offline mode is completely unchanged. */
        const displayUrl = (offlineMode ? imageUrl : (imageUrl || zoomUrl)) || SVG_PLACEHOLDER;
        const pendingZoomUrl = (!offlineMode && zoomUrl && zoomUrl !== displayUrl) ? zoomUrl : '';
        viewerLoadToken += 1;
        const thisViewerLoadToken = viewerLoadToken;

        els.lbId.textContent = item.id;
        setViewerTitle(item, title, isOrigin);
        els.lbSection.textContent = getSectionTextByIdLegacyEN(item.section_id);
        updateViewerCollectionStatus(item);
        els.lbMaterialVal.textContent = material;
        els.lbSizeVal.textContent = size;
        els.lbYearVal.textContent = year;
        els.lbImagePath.textContent = imageUrl || '—';
        els.lbZoomPath.textContent = offlineMode ? t('zoomOffline') : (zoomUrl || '—');
        els.lbOpenImage.href = imageUrl || '#';
        els.lbOpenZoom.href = offlineMode ? '#' : (zoomUrl || imageUrl || '#');
        els.lbOpenZoom.onclick = offlineMode
          ? function(event) {
              event.preventDefault();
              alert(t('zoomOffline'));
              return false;
            }
          : null;

        /* ARCHIVE PRO MOBILE FULLVIEW REMOVE ONLY
           Mobile Viewer caption should not render/show the Full View action.
           Desktop keeps the same Full View action and function. */
        const isMobileCaptionView = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
        if (els.lbOpenZoom) {
          els.lbOpenZoom.classList.add('mobile-hide-fullview');
          els.lbOpenZoom.hidden = !!isMobileCaptionView;
          els.lbOpenZoom.setAttribute('aria-hidden', isMobileCaptionView ? 'true' : 'false');
          els.lbOpenZoom.tabIndex = isMobileCaptionView ? -1 : 0;
        }
        const lbActions = els.lbOpenZoom ? els.lbOpenZoom.closest('.lb-actions') : null;
        if (lbActions) {
          lbActions.classList.add('mobile-hide-fullview-wrap');
          lbActions.hidden = !!isMobileCaptionView;
          lbActions.setAttribute('aria-hidden', isMobileCaptionView ? 'true' : 'false');
        }

        els.lightboxImage.alt = title;
        els.lightboxImage.onload = null;
        els.lightboxImage.onerror = null;

        /* FLICKER-ON-NAV FIX PART 2 (desktop fullscreen, prev/next in viewer) 2026-08-25:
           Part 1 (see the width/height:100% comment above) stopped the <img> BOX from
           collapsing to 0x0, but the visible flash the user still saw came from a
           second, separate bug: this function used to call
           els.lightboxImage.removeAttribute('src') immediately, which blanks the
           on-screen image the instant you click, and only *afterwards* went to fetch
           the next artwork — so for however long that took (real network time on a
           cache miss, but even a cached image still needs a queued decode/paint
           before onload fires), the on-screen box had nothing in it while the
           .is-loading opacity transition was still close to fully opaque. That empty,
           opaque box was the flash.
           Fix: load the next artwork into a detached Image() first (exactly the
           pattern already used below for the high-res zoom swap) and only touch the
           on-screen #lightboxImage — via applyDisplayImage() — once that copy has
           fully decoded. The current artwork now stays on screen, unchanged, right up
           until the moment the next one is ready to replace it outright, so there is
           no longer any instant where the visible image is blank. */
        let displayApplied = false;
        const applyDisplayImage = () => {
          if (displayApplied || thisViewerLoadToken !== viewerLoadToken || !els.lightboxImage) return;
          displayApplied = true;
          invalidateViewerFrameCache();
          els.lightboxImage.src = displayUrl;
          els.lightboxImage.classList.remove('is-loading');
          els.lightboxImage.classList.add('is-ready');
          resetViewerTransform();
          if (window.matchMedia && window.matchMedia('(min-width: 881px)').matches) {
            els.lightboxImage.style.transform = 'translate3d(0,0,0) scale(1)';
          }

          if (pendingZoomUrl) {
            const zoomPreload = new Image();
            zoomPreload.onload = () => {
              if (thisViewerLoadToken !== viewerLoadToken || !els.lightboxImage) return;
              /* Swap without resetting pan/zoom — the user may already be
                 zoomed into the standard image by the time the zoom image
                 finishes loading in the background. */
              invalidateViewerFrameCache();
              els.lightboxImage.src = pendingZoomUrl;
            };
            zoomPreload.src = pendingZoomUrl;
          }
        };

        const preload = new Image();
        preload.loading = 'eager';
        preload.decoding = 'async';
        preload.fetchPriority = 'high';
        preload.onload = applyDisplayImage;
        preload.onerror = () => {
          if (thisViewerLoadToken !== viewerLoadToken || !els.lightboxImage) return;
          displayApplied = true;
          els.lightboxImage.src = SVG_PLACEHOLDER;
          els.lightboxImage.classList.remove('is-loading');
          els.lightboxImage.classList.add('is-ready');
        };
        preload.src = displayUrl;

        /* Already warm in the browser cache (the common case — see
           scheduleNeighborPreload below)? .complete is true synchronously in that
           case, so apply right away instead of waiting an extra task for onload. */
        if (preload.complete && preload.naturalWidth > 0) {
          applyDisplayImage();
        } else {
          if (fromCaptionReader) els.lightboxImage.removeAttribute('src');
          els.lightboxImage.classList.remove('is-ready');
          els.lightboxImage.classList.add('is-loading');
        }

        els.lightbox.classList.add('open');
        els.lightbox.classList.add('active');
        els.lightbox.style.display = '';
        els.lightbox.setAttribute('aria-hidden', 'false');
        document.documentElement.classList.add('viewer-open');
        document.body.classList.add('viewer-open');
        document.body.style.overflow = 'hidden';

        scheduleNeighborPreload(item);
      }

      function armCloseNavigationShield() {
        closeClickBlockUntil = Date.now() + 1400;

        let shield = document.getElementById('viewerCloseShield');
        if (!shield) {
          shield = document.createElement('div');
          shield.id = 'viewerCloseShield';
          shield.setAttribute('aria-hidden', 'true');
          shield.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:transparent;pointer-events:auto;touch-action:none;';
          const kill = function(ev) {
            if (!ev) return;
            if (typeof ev.preventDefault === 'function') ev.preventDefault();
            if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
          };
          ['click','pointerdown','pointerup','touchstart','touchend','mousedown','mouseup'].forEach(function(type) {
            shield.addEventListener(type, kill, { capture:true, passive:false });
          });
          document.body.appendChild(shield);
        }

        window.setTimeout(function() {
          const currentShield = document.getElementById('viewerCloseShield');
          if (currentShield && currentShield.parentNode) currentShield.parentNode.removeChild(currentShield);
        }, 700);
      }

      /* rf1(2026-11-23): 뷰어를 닫은 뒤 마지막으로 본 작품 카드가 화면에 정확히 오도록 잠시(최대 3초) 따라간다 — 위쪽 이미지가 늦게 로드되거나 확대(400%)로 카드 높이가 바뀌어 위치가 밀리는 문제. 사용자가 화면을 만지거나 스크롤·키를 누르면 즉시 멈춘다. 화면보다 큰 카드는 머리(상단 고정 헤더 바로 아래)에 맞춘다. */
      function apFollow(c){if(!c||!c.getBoundingClientRect)return;var de=document.documentElement,end=Date.now()+3000,st=0,stop=!1,ev=["touchstart","wheel","keydown","pointerdown","mousedown"];function off(){stop=!0;ev.forEach(function(t){window.removeEventListener(t,off,!0)})}ev.forEach(function(t){window.addEventListener(t,off,{capture:!0,passive:!0})});function top(){var h=document.querySelector(".site-header");if(!h)return 0;var cs=getComputedStyle(h);if(cs.position!=="sticky"&&cs.position!=="fixed")return 0;var r=h.getBoundingClientRect();return r.bottom>0&&r.top<=1?r.bottom:0}function fit(){var r=c.getBoundingClientRect(),vh=window.innerHeight||de.clientHeight||0,t0=top(),room=vh-t0,d=r.height<=room*.92?r.top+r.height/2-(t0+room/2):r.top-t0-Math.min(12,room*.03);if(Math.abs(d)<=4)return!0;var sb=de.style.scrollBehavior;de.style.scrollBehavior="auto";window.scrollBy(0,d);de.style.scrollBehavior=sb;return!1}try{fit()}catch(e){}(function tick(){if(stop)return;if(!c.isConnected||Date.now()>end)return off();var ok=!1;try{ok=fit()}catch(e){return off()}var n=Date.now();ok?(st||(st=n),n-st>700&&off()):st=0;stop||requestAnimationFrame(tick)})()}

      function restoreArchiveScroll() {
        const item = state.lastClosedLightboxItem || state.lightboxItem || null;

        window.setTimeout(function() {
          let restored = false;

          if (item) {
            const key = String(item._key || '');
            const id = String(item.id || '');
            const findCard = function() {
              let c = null;
              if (key) c = document.querySelector('.card[data-key="' + CSS.escape(key) + '"]');
              if (!c && id) c = document.querySelector('.card[data-id="' + CSS.escape(id) + '"]');
              return c;
            };
            let card = findCard();

            /* rf1(2026-11-23): 뷰어에서 넘겨 본 마지막 작품이 아직 그리지 않은 묶음에 있으면 그 작품까지 묶음을 이어 그린다(화면 이동 없음) */
            if (!card) {
              try {
                const list = Array.isArray(state.filtered) ? state.filtered : [];
                let idx = list.indexOf(item);
                if (idx < 0) idx = list.findIndex(function(w) { return w && ((key && String(w._key || '') === key) || (id && String(w.id || '') === id)); });
                let guard = 0;
                while (idx >= 0 && idx >= (Number(state.visibleCount) || 0) && hasMoreFilteredWorks() && guard++ < 400) loadMoreWorks({ scrollToNewBatch: false });
                card = findCard();
              } catch (_) {}
            }

            if (card && typeof card.scrollIntoView === 'function') {
              card.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
              const artworkButton = card.querySelector('.thumb-wrap[tabindex="0"]');
              if (artworkButton) {
                try { artworkButton.focus({ preventScroll: true }); }
                catch (_) { artworkButton.focus(); }
              }
              apFollow(card);
              restored = true;
            }
          }

          if (!restored) {
            window.scrollTo(0, archiveScrollY || 0);
          }

          state.lastClosedLightboxItem = null;
        }, 0);
      }

      /* IPAD FULLSCREEN TOUCH-SCROLL-LOCK FIX 2026-08-25:
         Releases the position:fixed body lock applied in openLightbox() above. Must run
         BEFORE restoreArchiveScroll() (both call sites below already do this) — while
         body is still position:fixed, window.scrollTo()/scrollIntoView() have no real
         document to scroll, so the lock has to come off first for that existing restore
         logic to actually land back on the right spot. No-ops harmlessly if the lock was
         never engaged. */
      function releaseBodyScrollLock() {
        if (!bodyScrollLockActive) return;
        bodyScrollLockActive = false;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
      }

      function closeLightbox() {
        armCloseNavigationShield();
        state.lastClosedLightboxItem = state.lightboxItem || null;
        state.lightboxItem = null;
        resetViewerTransform();
        if (els.lightbox) {
          els.lightbox.classList.remove('open');
          els.lightbox.classList.remove('active');
          els.lightbox.setAttribute('aria-hidden', 'true');
          els.lightbox.style.display = 'none';
        }
        if (els.lightboxImage) { els.lightboxImage.classList.remove('is-loading', 'is-ready'); els.lightboxImage.removeAttribute('src'); }
        document.documentElement.classList.remove('viewer-open');
        document.body.classList.remove('viewer-open');
        document.body.style.overflow = '';
        releaseBodyScrollLock();
        restoreArchiveScroll();
      }

      function closeViewer() {
        armCloseNavigationShield();
        state.lastClosedLightboxItem = state.lightboxItem || null;
        state.lightboxItem = null;
        resetViewerTransform();

        const viewer = document.querySelector('.viewer, .lightbox');
        if (viewer) {
          viewer.classList.remove('open');
          viewer.classList.remove('active');
          viewer.setAttribute('aria-hidden', 'true');
          viewer.style.display = 'none';
        }

        if (els.lightboxImage) els.lightboxImage.removeAttribute('src');

        document.documentElement.classList.remove('viewer-open');
        document.body.classList.remove('viewer-open');
        document.body.style.overflow = '';
        releaseBodyScrollLock();
        restoreArchiveScroll();
      }

      window.closeViewer = closeViewer;

      /* 2026-11-17 (cr1) 저시력 캡션 리더(caption-reader.js)용 읽기 전용 브리지 — 화면 상태를 바꾸지 않고 읽기만 한다. */
      try {
        window.__AP_CAPTION_BRIDGE = {
          list: function () { return state.filtered; },
          lang: function () { return state.lang; },
          current: function () { return isViewerOpen() ? state.lightboxItem : null; },
          /* 2026-11-17 (cr3) 캡션 리더를 닫을 때 마지막으로 읽은 작품의 상세 이미지로(뷰어가 열려 있을 때만, 기존 openLightbox 그대로 사용) */
          show: function (item) { if (item && isViewerOpen()) openLightbox(item, true); },
          section: function (id) { const sec = SECTION_MAP[id]; return sec ? { kr: sec.kr, en: sec.enLegacy || sec.en } : null; },
          inquiry: function (work, readerMode) {
            if (!work || Number(work.section_id) === 0 || normalizeStatus(work.status) !== 'available') return null;
            const id = safeText(work.id);
            if (!id) return null;
            const subject = getInquirySubject(id, work, readerMode);
            const body = getInquiryBody(id, work, readerMode);
            return { address: ART_EMAIL, mailto: getInquiryLink(id, work, readerMode),
              gmail: getGmailLinkForDevice(id, work, readerMode),
              text: 'To: ' + ART_EMAIL + '\nSubject: ' + subject + '\n\n' + body };
          },
          status: function (work) {
            if (!work || Number(work.section_id) === 0) return null;
            return COLLECTION_LABELS.get(normalizeStatus(work.status)) || null;
          }
        };
      } catch (_crErr) {}

      function applyFilterSort(sourceList = state.all) {
        let result = Array.isArray(sourceList) ? sourceList : [];

        const sectionValue = state.section || 'all';
        if (sectionValue !== 'all') {
          const sectionNumber = Number(sectionValue);
          result = result.filter((item) => sectionMatchesTarget(item, sectionNumber) && !isExcludedFromSectionView(item, sectionValue));
        }

        const queryValue = safeText(state.query);
        if (queryValue && queryValue.trim()) { /* 2026-10-14 (apsearch2) 앱과 같은 빈 검색어 판정 */
          if (!state._searchPrepared) {
            for (let i = 0; i < state.all.length; i += 1) {
              prepareFastSearchCache(state.all[i]);
            }
            state._searchPrepared = true;
          }
          result = result.filter((item) => matchesSearch(item, queryValue));
        }

        if (state.sort && state.sort !== FAST_ORDER) {
          result = result.slice().sort((a, b) => compareItems(a, b, state.sort));
        }

        return result;
      }

      function applyFilters(resetVisible = true) {
        state.query = els.searchInput ? els.searchInput.value : state.query;
        state.section = els.sectionSelect ? els.sectionSelect.value : state.section;
        state.sort = els.sortSelect ? els.sortSelect.value : state.sort;

        if (resetVisible) state.visibleCount = getInitialVisibleCount();

        state.filtered = applyFilterSort(state.all);
        CURRENT_LIST = state.filtered;
        finalFilteredWorks = state.filtered;
        visibleCount = state.visibleCount;

        renderAll();
        try { saveUiState(); } catch (_) {}
      }

      function resetSortToFastOrder() {
        state.sort = FAST_ORDER;
        if (els.sortSelect) els.sortSelect.value = FAST_ORDER;
      }

      const debouncedSearch = debounce(() => {
        state.query = els.searchInput.value;
        /* Search must not change section or sort.
           The user-selected sort order remains active while searching. */
        applyFilters(true);
      }, SEARCH_DEBOUNCE_MS);

      function setLanguage(lang) {
        state.lang = lang;
        els.langTabs.forEach((tab) => {
          const active = tab.dataset.lang === lang;
          tab.classList.toggle('active', active);
          tab.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        rebuildStaticTexts();
        populateSections();
        applyFilters(true);
        if (state.lightboxItem) openLightbox(state.lightboxItem);
      }

      function goArchiveHome() {
        archiveEntered = false;
        filterPanelOpen = false;
        state.query = '';
        state.section = 'all';
        state.sort = FAST_ORDER;
        state.visibleCount = getInitialVisibleCount();
        visibleCount = state.visibleCount;

        if (els.searchInput) els.searchInput.value = '';
        if (els.sectionSelect) els.sectionSelect.value = 'all';
        if (els.sortSelect) els.sortSelect.value = FAST_ORDER;

        updateEntryUXClasses();
        if (state.isLoaded && state.all.length) {
          state.filtered = applyFilterSort(state.all);
          CURRENT_LIST = state.filtered;
          renderAll();
        } else {
          updateStats();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      function parseWorksPayload(json) {
        /*
          Archive Pro must read the real works array, not a wrapper object.
          This prevents the "Total 1 / Data 1 items" failure when works.json
          is accidentally wrapped as [{ works: [...] }] or { data:{ works:[...] } }.
        */
        const seen = new Set();

        function unwrap(value) {
          if (!value || seen.has(value)) return [];
          if (typeof value === 'object') seen.add(value);

          if (Array.isArray(value)) {
            if (value.length === 1) {
              const nested = unwrap(value[0]);
              if (nested.length) return nested;
            }

            if (value.length && value.every(item => item && typeof item === 'object' && ('id' in item || 'image' in item || 'zoom' in item))) {
              return value;
            }

            for (const item of value) {
              const nested = unwrap(item);
              if (nested.length) return nested;
            }

            return value;
          }

          if (Array.isArray(value.works)) return value.works;
          if (Array.isArray(value.items)) return value.items;
          if (Array.isArray(value.data)) return unwrap(value.data);
          if (value.data && typeof value.data === 'object') {
            const nested = unwrap(value.data);
            if (nested.length) return nested;
          }
          if (value.archive && typeof value.archive === 'object') {
            const nested = unwrap(value.archive);
            if (nested.length) return nested;
          }
          if (value.payload && typeof value.payload === 'object') {
            const nested = unwrap(value.payload);
            if (nested.length) return nested;
          }

          return [];
        }

        return unwrap(json).filter(item => item && typeof item === 'object');
      }

     function withCacheBust(url) {
        const clean = safeText(url);
        if (!clean || clean.startsWith('data:') || clean.startsWith('blob:')) return clean;
        if (isArchiveOfflineMode()) return clean.split('?')[0];
        const base = clean.split('?')[0];
        return base + '?v=' + ASSET_VERSION;
      }
      function buildWorksJsonUrls() {
        /*
          LIVE DATA SOURCE HARDENING:
          Try the GitHub raw data first, then dungzak.art. Both requests are
          revalidated on every load by fetchJsonNoStore() (cache:'no-cache').
          This prevents the Archive Pro page from staying on an older
          works.json when Origins is updated.
        */
        return Array.from(new Set([DATA_URL, DUNGZAK_ART_DATA_URL].filter(Boolean)));
      }

      function buildLiveJsonUrl(url) {
        /*
          MOBILE PERFORMANCE ONLY FIX 2026-07-13:
          This used to append '&v=' + Date.now() and fetch with
          cache:'no-store', a genuinely new URL + a hard cache bypass on
          every single load. That guaranteed freshness, but it also meant
          PageSpeed (and every real reopen) paid for a full, uncachable
          works.json download every time, with no way for the browser or
          any CDN in front of GitHub raw / dungzak.art to ever serve a
          conditional (304) response. The IndexedDB cache-first pipeline in
          loadArchiveData() already re-checks the live file on every load
          and only re-renders when the data actually changed, so the
          network layer no longer needs to force a bypass to stay correct.
          Returning the plain, stable URL here (paired with cache:'no-cache'
          in fetchJsonNoStore below) keeps the "always re-check" guarantee
          while letting the browser/CDN reuse a cached body via a normal
          conditional revalidation when nothing changed.
          Offline mode is unaffected — it already returned the plain URL.
        */
        return String(url || '');
      }

      async function fetchJsonNoStore(url) {
        const liveUrl = buildLiveJsonUrl(url);
        const t0 = performance.now();
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timeout = controller && setTimeout(() => controller.abort(), WORKS_TIMEOUT_MS);
        try {
          const res = await fetch(liveUrl, {
            cache: 'no-cache',
            mode: 'cors',
            credentials: 'omit',
            signal: controller ? controller.signal : undefined
          });
          const t1 = performance.now();
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          const t2 = performance.now();
          apLogTiming('works.json fetch: ' + url + ' — network ' + Math.round(t1 - t0) + 'ms, parse ' + Math.round(t2 - t1) + 'ms');
          return json;
        } finally {
          if (timeout) clearTimeout(timeout);
        }
      }

      /*
        COLD-START SPEED PATCH 2026-07-17:
        Each candidate URL is now wrapped exactly once in a shared "task"
        promise (createWorksFetchTask). Both the completeness check
        (fetchWorksDirect, unchanged behavior — waits for every candidate)
        and the new first-paint race (fetchWorksFirstReady) read from the
        SAME underlying task promises, so this never issues a duplicate
        network request. It only changes how early the app is allowed to
        start painting with whichever answer arrives first.
      */
      function createWorksFetchTask(url) {
        const startedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        return (async () => {
          try {
            const json = await fetchJsonNoStore(url);
            const works = parseWorksPayload(json);
            const count = Array.isArray(works) ? works.length : 0;
            const elapsed = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - startedAt);
            try { console.log('[Archive Pro] works.json candidate:', url, '→', count, 'item(s), ' + elapsed + 'ms total'); } catch (_) {}
            return { url, works, count, ok: count >= MIN_EXPECTED_WORKS };
          } catch (error) {
            try { console.warn('[Archive Pro] works.json candidate failed:', url, error && error.message ? error.message : error); } catch (_) {}
            return { url, works: [], count: 0, ok: false, error };
          }
        })();
      }

      let worksFirstReadyPromise = null;

      function ensureWorksFetchTasks(knownCount = 0) {
        if (!worksLoadPromise) {
          const [primaryUrl, mirrorUrl] = buildWorksJsonUrls();
          const primary = createWorksFetchTask(primaryUrl);
          const tasks = [primary, primary.then((result) => {
            if (result.ok && result.count >= Math.max(knownCount, VERIFIED_CATALOG_SIZE)) {
              return { url: mirrorUrl, ok: false, count: 0 };
            }
            return createWorksFetchTask(mirrorUrl);
          })];

          /*
            FULL-COVERAGE DATA SOURCE FIX (works.json 누락 방지) — unchanged:
            waits for every candidate URL, then picks whichever valid
            candidate has the highest item count, so a stale-but-plausible
            mirror can never quietly win over a more complete source. This
            promise is what the local cache gets written from, and what the
            background completeness check in loadArchiveData() awaits.
          */
          worksLoadPromise = (async () => {
            if (!tasks.length) {
              throw new Error('No valid works.json found. (no source url configured)');
            }

            const results = await Promise.all(tasks);
            const valid = results.filter((r) => r.ok);

            if (!valid.length) {
              const failures = results.map((r) => `${r.url} → ${r.error ? (r.error.message || r.error) : r.count + ' item(s), skipped'}`);
              throw new Error('No valid works.json found. ' + failures.join(' | '));
            }

            const best = valid.reduce((a, b) => (b.count > a.count ? b : a));
            try { console.log('[Archive Pro] works.json source selected:', best.url, '(', best.count, 'item(s) )'); } catch (_) {}

            return best.works;
          })().catch((error) => {
            worksLoadPromise = null;
            worksFirstReadyPromise = null;
            throw error;
          });

          /*
            First-paint race: resolves with the FIRST candidate that turns
            out valid (count >= MIN_EXPECTED_WORKS), whichever URL that is.
            On a cold start (no local cache yet) this is what lets the
            first screen of cards appear as soon as the faster of the two
            sources answers, instead of always waiting for the slower one.
            The completeness check above still runs to completion in the
            background and silently corrects the view if the slower source
            turns out to have more items.
          */
          worksFirstReadyPromise = new Promise((resolve, reject) => {
            let settledCount = 0;
            let bestSoFar = null;
            tasks.forEach((taskPromise) => {
              taskPromise.then((result) => {
                settledCount += 1;
                if (result.ok && (!bestSoFar || result.count > bestSoFar.count)) {
                  bestSoFar = result;
                  resolve(result);
                }
                if (settledCount === tasks.length && !bestSoFar) {
                  reject(new Error('No valid works.json found among ' + tasks.length + ' candidate(s).'));
                }
              }).catch(() => {
                settledCount += 1;
                if (settledCount === tasks.length && !bestSoFar) {
                  reject(new Error('No valid works.json found among ' + tasks.length + ' candidate(s).'));
                }
              });
            });
          });
        }

        return { fullPromise: worksLoadPromise, firstReadyPromise: worksFirstReadyPromise };
      }

      async function fetchWorksDirect(knownCount) {
        return ensureWorksFetchTasks(knownCount).fullPromise;
      }

      async function fetchWorksFirstReady() {
        return ensureWorksFetchTasks().firstReadyPromise;
      }

      function showArchiveShellImmediately() {
        if (els.loadingScreen) {
          els.loadingScreen.hidden = true;
          els.loadingScreen.style.display = 'none';
          els.loadingScreen.textContent = '';
        }
        if (els.resultsMeta) els.resultsMeta.style.display = 'flex';
      }

      function makeOriginTailWork(n) {
        const id = 'OR-' + String(n).padStart(4, '0');
        return {
          id: id,
          section_id: 0,
          section_kr: 'A 기원',
          section_en: 'Origins',
          title_kr: '',
          title_en: '',
          material_kr: '',
          material_en: '',
          size_kr: '',
          size_en: '',
          year: '',
          image: 'https://raw.githubusercontent.com/dungzakcestlavie/dungzaklab-images/main/archivepro/standard/' + id + '.jpg',
          zoom: 'https://raw.githubusercontent.com/dungzakcestlavie/dungzaklab-images/main/archivepro/zoom/' + id + '.jpg',
          _autoTailOrigin: true
        };
      }

      function ensureOriginsTailWorks(list) {
        /*
          ORIGINS TAIL SAFETY PATCH:
          If the newest six Origins image files exist but works.json has not yet
          caught up, create safe records for OR-1892 through OR-1897.
          Existing records are never overwritten.
        */
        const source = Array.isArray(list) ? list.slice() : [];
        const ids = new Set(source.map(item => safeText(item && item.id).toUpperCase()).filter(Boolean));
        const REQUIRED_ORIGIN_TAIL_START = 1892;
        const REQUIRED_ORIGIN_TAIL_END = 1897;

        for (let n = REQUIRED_ORIGIN_TAIL_START; n <= REQUIRED_ORIGIN_TAIL_END; n += 1) {
          const id = 'OR-' + String(n).padStart(4, '0');
          if (!ids.has(id)) {
            source.push(makeOriginTailWork(n));
            ids.add(id);
          }
        }

        return source;
      }

      let apDataAppliedOnce = false;

      function apRestoreUiStateIfFirstRun() {
        /* Only ever applied once per page load, before the very first
           cards paint. A later background refresh must never reset
           filters the person may already be actively using. */
        const saved = loadSavedUiState();
        if (!saved) return;
        if (saved.lang === 'kr' || saved.lang === 'en' || saved.lang === 'both') {
          state.lang = saved.lang;
          els.langTabs.forEach((tab) => {
            const active = tab.dataset.lang === state.lang;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-pressed', active ? 'true' : 'false');
          });
        }
        /* 2026-10-18 (apdefsec1) 섹션은 복원하지 않음 — 새 진입·새로고침은 항상 기본 섹션(I)으로 시작 */
        if (typeof saved.sort === 'string' && saved.sort) state.sort = saved.sort;
        if (typeof saved.query === 'string') state.query = saved.query;
      }

      function applyWorksToState(rawWorks) {
        /*
          REOPEN SPEED PATCH 2026-07-13 — shared apply+render pipeline.
          Used by both the instant local-cache path and the background
          works.json refresh path in loadArchiveData(), so the two can
          never drift out of sync, and so a background refresh re-renders
          the grid directly instead of relying on the one-time first-paint
          scheduler. Field names, normalizeItem(), ensureOriginsTailWorks(),
          and the Offline Display Rule below are unchanged from before.
        */
        const __apNormalizeT0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const normalizedAll = (Array.isArray(rawWorks) ? rawWorks : [])
          .map(function(work, index) {
            try {
              return normalizeItem(work, index);
            } catch (error) {
              try {
                console.warn('[Archive Pro] skipped malformed work data', work && work.id ? work.id : index, error);
              } catch (_) {}
              return null;
            }
          })
          .filter(item => item && item.id);

        /*
          Offline Display Rule:
          When Archive Pro is opened without Wi‑Fi, hide A Origins (section_id: 0)
          and show all remaining sections I–V only. Online mode keeps the full archive.
        */
        const completedAll = ensureOriginsTailWorks(normalizedAll);
        const normalized = isArchiveOfflineMode() ? nonOriginsOnly(completedAll) : completedAll;

        state.all = normalized;
        try { window.__ARCHIVE_PRO_WORKS__ = state.all; } catch (_) {}
        try { console.log('[Archive Pro] normalized works total (allWorks):', state.all.length, '/ raw fetched:', (Array.isArray(rawWorks) ? rawWorks.length : 0)); } catch (_) {}
        try {
          const __apNormalizeT1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          apLogTiming('normalize/apply took ' + Math.round(__apNormalizeT1 - __apNormalizeT0) + 'ms (' + state.all.length + ' items)');
        } catch (_) {}

        if (!apDataAppliedOnce) {
          state.query = '';
          state.section = DEFAULT_ENTRY_SECTION;
          state.sort = FAST_ORDER;
          state.visibleCount = getInitialVisibleCount();
          apRestoreUiStateIfFirstRun();
          apDataAppliedOnce = true;
        }

        state._searchPrepared = false;
        /* SECTION COUNT — reflects the number of defined sections in
           SECTION_MAP (structure), not just the section_ids that happen to
           have works today. This is what makes "6 Sections" become
           "7 Sections" the moment VI 빛의 파도 / Waves of Light is defined,
           even before any work with section_id 6 exists. */
        state._sectionCount = Object.keys(SECTION_MAP).length;
        state.loadState = 'loaded';
        state.isLoaded = true;

        WORKS_READY = true;
        WORKS_DATA = state.all;
        visibleCount = state.visibleCount;

        if (els.searchInput) els.searchInput.value = state.query;
        if (els.sortSelect) els.sortSelect.value = state.sort;
        /* els.sectionSelect.value is set inside populateSections() (called
           via renderSectionOptions() below), which validates state.section
           against the options it just rebuilt and falls back to 'all' if
           the saved section no longer exists. */

        state.filtered = applyFilterSort(state.all);
        CURRENT_LIST = state.filtered;
        finalFilteredWorks = state.filtered;

        rebuildStaticTexts();
        renderSectionOptions();
        renderSectionButtons();
        updateStats();
        updateMeta();

        if (archiveEntered) {
          if (firstGridRenderScheduled) {
            /* Already painted once this session (from cache) — a
               background refresh applies directly, no rAF/search-index
               bookkeeping needed a second time. */
            renderGrid();
          } else {
            scheduleFirstGridRender();
          }
        }

        return state.all.length;
      }

      function worksSignature(rawWorks) {
        return JSON.stringify(rawWorks);
      }

      function refreshArchiveData(force = false) {
        if (archiveRefreshTask) return force ? archiveRefreshTask.then(() => refreshArchiveData(true)) : archiveRefreshTask;
        worksLoadPromise = null;
        worksFirstReadyPromise = null;
        archiveRefreshTask = loadArchiveData(force).finally(() => { archiveRefreshTask = null; });
        return archiveRefreshTask;
      }

      async function loadArchiveData(force) {
        showArchiveShellImmediately();
        state.loadState = 'loading';
        setStatusByState();

        let renderedFromCache = false;
        let renderedFromNetwork = false;
        let appliedSignature = '';
        let cachedRecently = false;
        let knownCount = 0;

        /*
          STEP 1 — instant paint from the last known-good local cache, if
          any. This is what makes a normal reopen feel instant: no network
          round trip sits on the critical path to the first screen of cards.
        */
        try {
          const cached = await apCacheGet(AP_WORKS_CACHE_KEY);
          if (cached && Array.isArray(cached.works) && cached.works.length) {
            applyWorksToState(cached.works);
            renderedFromCache = true;
            knownCount = cached.works.length;
            appliedSignature = worksSignature(cached.works);
            try { apLogTiming('rendered from local cache (' + cached.works.length + ' items)'); } catch (_) {}
            /*
              SKIP-REDUNDANT-RECHECK PATCH 2026-07-18:
              cached.ts is the timestamp this same payload was last written
              by STEP 3 (apCacheSet in the block below). If it was written
              very recently, works.json cannot realistically have changed
              since — re-fetching + re-normalizing all ~2,000 items again
              right now is pure wasted network + main-thread work with zero
              visible benefit. Only skips the background re-check; STEP 1's
              instant paint and STEP 2's cold-start race are untouched, and
              a normal reopen after the window still re-checks exactly as
              before, so the "always confirm completeness" guarantee is
              unchanged for any realistically-timed use.
            */
            if (typeof cached.ts === 'number' && (Date.now() - cached.ts) < AP_COMPLETENESS_RECHECK_MIN_INTERVAL_MS) {
              cachedRecently = true;
            }
          }
        } catch (_) {}

        if (renderedFromCache && isArchiveOfflineMode()) return;
        if (cachedRecently && !force) {
          try { apLogTiming('completeness check skipped (cache is fresh)'); } catch (_) {}
          return;
        }

        /*
          STEP 2 — COLD START ONLY (no local cache yet, e.g. very first
          open on a device): paint as soon as whichever candidate URL
          answers first, instead of waiting for the slower of the two.
          This is the change that actually shortens the first-ever launch;
          every later open already gets its instant paint from STEP 1.
        */
        if (!renderedFromCache) {
          try {
            const firstReady = await fetchWorksFirstReady();
            applyWorksToState(firstReady.works);
            renderedFromNetwork = true;
            appliedSignature = worksSignature(firstReady.works);
            try { apLogTiming('rendered from first-available source: ' + firstReady.url + ' (' + firstReady.count + ' items)'); } catch (_) {}
          } catch (_) {
            /* Every candidate failed the race (rare — usually means every
               source is genuinely unreachable). Fall through to STEP 3,
               which still surfaces the same error state as before if
               nothing at all can be loaded. */
          }
        }

        /*
          STEP 3 — always confirm completeness against every candidate in
          the background. On a warm reopen this is the original "revalidate
          against live works.json" check. On a cold start it additionally
          catches the case where the source used in STEP 2 turned out to be
          the less-complete one; the more complete data silently replaces it
          with no extra spinner or flicker of the empty state.
        */
        try {
          const works = await fetchWorksDirect(knownCount);
          if (renderedFromCache && works.length < Math.min(knownCount, VERIFIED_CATALOG_SIZE)) return;
          const freshSignature = worksSignature(works);

          if (!(renderedFromCache || renderedFromNetwork) || freshSignature !== appliedSignature) {
            applyWorksToState(works);
            try { apLogTiming('completeness check applied final works.json (' + (Array.isArray(works) ? works.length : 0) + ' items)'); } catch (_) {}
            try { console.log('[Archive Pro] applied live works.json:', Array.isArray(works) ? works.length : 0, 'item(s)'); } catch (_) {}
          }

          try { await apCacheSet(AP_WORKS_CACHE_KEY, { works: works, ts: Date.now() }); } catch (_) {}

          if (!isArchiveOfflineMode()) {
            requestServiceWorkerNonOriginsCache();
          }
        } catch (error) {
          if (renderedFromCache || renderedFromNetwork) {
            /* Something is already correctly on screen; a failed
               background completeness check should stay silent rather
               than replace good data with an error state. */
            try { console.warn('[Archive Pro] background works.json refresh failed, keeping current view', error); } catch (_) {}
            return;
          }

          state.loadState = 'failed';
          state.isLoaded = false;
          WORKS_READY = false;
          WORKS_DATA = [];
          CURRENT_LIST = [];
          state.all = [];
          state.filtered = [];
          state._sectionCount = 0;

          if (els.emptyState) {
            els.emptyState.hidden = false;
            els.emptyState.textContent = t('loadingScreenError');
          }
          updateStats();
        }
      }

      function resetFilters(shouldScrollTop = true) {
        /* FULL RESET BUTTON FIX
           초기화 버튼은 section / search / sort / visibleCount / internal state를
           모두 기본 상태로 되돌린 뒤 전체 작품을 다시 렌더링한다. */
        state.query = '';
        state.section = DEFAULT_ENTRY_SECTION; /* 2026-10-18 (apreset1) 초기화 = I 우리를 위해 기도해 주세요 */
        state.sort = FAST_ORDER;
        state.visibleCount = getInitialVisibleCount();

        if (els.searchInput) els.searchInput.value = '';
        if (els.sectionSelect) els.sectionSelect.value = state.section;
        if (els.sortSelect) els.sortSelect.value = FAST_ORDER;

        state.filtered = applyFilterSort(state.all);
        WORKS_DATA = state.all;
        CURRENT_LIST = state.filtered;
        finalFilteredWorks = state.filtered;
        visibleCount = state.visibleCount;

        renderAll();
        if (shouldScrollTop) window.scrollTo({ top: 0, behavior: 'auto' });
      }

      function resetAllSections(targetSection) {
        archiveEntered = true;
        filterPanelOpen = true;
        state.query = '';
        state.section = targetSection || 'all';
        state.sort = FAST_ORDER;
        state.visibleCount = getInitialVisibleCount();
        state.filtered = applyFilterSort(state.all);

        WORKS_DATA = state.all;
        CURRENT_LIST = state.filtered;
        finalFilteredWorks = state.filtered;
        visibleCount = state.visibleCount;

        if (els.searchInput) els.searchInput.value = '';
        if (els.sectionSelect) els.sectionSelect.value = state.section;
        if (els.sortSelect) els.sortSelect.value = FAST_ORDER;

        updateEntryUXClasses();
        renderAll();
        window.scrollTo({ top: 0, behavior: 'auto' });
      }

      function scrollToSearch() {
        if (!els.searchArea) return;
        els.searchArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      function isStandaloneArchiveApp() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true;
      }

      function setupLabButtonAppOnlyReset() {
        if (!els.labLink || !isStandaloneArchiveApp()) return;

        els.labLink.removeAttribute('href');
        els.labLink.addEventListener('click', function(event) {
          event.preventDefault();
          event.stopPropagation();

          if (Date.now() <= closeClickBlockUntil) {
            blockEvent(event);
            return;
          }

          resetAllSections();
        }, { passive:false });
      }

      let autoBatchObserver = null;
      let autoBatchTicking = false;

      function hasMoreFilteredWorks() {
        const list = Array.isArray(state.filtered) ? state.filtered : [];
        return archiveEntered && list.length > 0 && state.visibleCount < list.length;
      }

      function loadMoreWorks(options = {}) {
        /* Load More Continuation Fix
           Use only the current state.filtered array, which already has section + search + sort applied.
           Manual button clicks may jump to the new batch; automatic scroll loading must not move the viewport. */
        finalFilteredWorks = Array.isArray(state.filtered) ? state.filtered : [];
        CURRENT_LIST = finalFilteredWorks;

        const previousVisibleCount = Math.max(0, Number(state.visibleCount) || 0);
        const loadMoreStartIndex = previousVisibleCount;
        const nextVisibleCount = Math.min(
          previousVisibleCount + LOAD_MORE_COUNT,
          finalFilteredWorks.length
        );

        if (nextVisibleCount <= previousVisibleCount) {
          if (els.loadWrap) els.loadWrap.hidden = true;
          return;
        }

        const nextItems = finalFilteredWorks.slice(loadMoreStartIndex, nextVisibleCount);
        state.visibleCount = nextVisibleCount;
        visibleCount = state.visibleCount;

        const newFirstCard = appendCards(nextItems, loadMoreStartIndex);

        if (els.loadWrap) els.loadWrap.hidden = state.visibleCount >= finalFilteredWorks.length;
        updateStats();
        setupAutoBatchRendering();

        if (options && options.scrollToNewBatch) {
          scrollToNewLoadStart(newFirstCard);
        }
      }

      function autoLoadNextBatch() {
        if (autoBatchTicking || !hasMoreFilteredWorks()) return;
        autoBatchTicking = true;
        requestAnimationFrame(() => {
          try {
            if (hasMoreFilteredWorks()) loadMoreWorks({ scrollToNewBatch: false });
          } finally {
            autoBatchTicking = false;
          }
        });
      }

      function setupAutoBatchRendering() {
        if (!els.loadWrap) return;

        if (!('IntersectionObserver' in window)) {
          if (hasMoreFilteredWorks()) {
            window.removeEventListener('scroll', autoLoadNextBatch);
            window.addEventListener('scroll', autoLoadNextBatch, { passive: true });
          } else {
            window.removeEventListener('scroll', autoLoadNextBatch);
          }
          return;
        }

        if (!autoBatchObserver) {
          autoBatchObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) autoLoadNextBatch();
            });
          }, { root: null, rootMargin: AUTO_RENDER_ROOT_MARGIN, threshold: 0.001 });
        }

        try { autoBatchObserver.unobserve(els.loadWrap); } catch (_) {}
        if (hasMoreFilteredWorks()) {
          try { autoBatchObserver.observe(els.loadWrap); } catch (_) {}
        }
      }

      function bindEvents() {
        if (bindEvents._bound) return;
        bindEvents._bound = true;
        /* 2026-10-14 (apsearch2) 앱 search.js와 같게: 한글 조합 중에는 검색하지 않고, 조합이 끝나면 검색 */
        let apSearchComposing = false;
        els.searchInput.addEventListener('compositionstart', () => { apSearchComposing = true; });
        els.searchInput.addEventListener('compositionend', () => { apSearchComposing = false; debouncedSearch(); });
        els.searchInput.addEventListener('input', () => { if (!apSearchComposing) debouncedSearch(); });

        /* REOPEN SPEED PATCH 2026-07-13: remember scroll position, throttled
           and passive so it can't cost a scroll-jank frame. */
        window.addEventListener('scroll', saveScrollYThrottled, { passive: true });

        els.sectionSelect.addEventListener('change', () => {
          state.section = els.sectionSelect.value;
          state.visibleCount = getInitialVisibleCount();
          applyFilters(true);
        });

        els.sortSelect.addEventListener('change', () => {
          state.sort = els.sortSelect.value;
          applyFilters(true);
        });

        if (els.resetBtn) els.resetBtn.addEventListener('click', () => resetFilters(false));
        if (els.filterToggleBtn) els.filterToggleBtn.addEventListener('click', toggleFilterPanel);
        setupLabButtonAppOnlyReset();

        /* 2026-10-13 (apsearch1): 검색 버튼 = 앱과 같이 지금 입력된 검색어로 바로 검색(기다림 없이).
           Enter도 같은 경로(form submit). 실시간 검색(input → debouncedSearch)은 그대로 */
        const runSearchNow = () => {
          window.clearTimeout(searchTimer);
          state.query = els.searchInput.value;
          applyFilters(true);
        };
        const searchForm = document.getElementById('archiveSearchForm');
        if (searchForm) {
          searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            runSearchNow();
          });
        } else {
          els.focusSearchBtn.addEventListener('click', runSearchNow);
        }
        const searchClearBtn = document.getElementById('archiveSearchClear');
        if (searchClearBtn) {
          searchClearBtn.addEventListener('click', () => {
            els.searchInput.value = '';
            runSearchNow();
            els.searchInput.focus({ preventScroll: true });
          });
        }
        els.searchInput.addEventListener('keydown', (e) => {
          /* Enter = 검색 버튼과 같음(한글 조합 중 Enter는 제외 — 조합이 끝나면 실시간 검색이 처리) */
          if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            runSearchNow();
            return;
          }
          if (e.key === 'Escape' && els.searchInput.value) {
            e.preventDefault();
            els.searchInput.value = '';
            runSearchNow();
          }
        });

        els.loadMoreBtn.addEventListener('click', () => {
          loadMoreWorks({ scrollToNewBatch: true });
        });

        if (els.grid) {
          els.grid.addEventListener('click', (e) => {
            const inquiryLink = e.target && e.target.closest ? e.target.closest('.status-inquiry') : null;
            if (inquiryLink) {
              /* 2026-10-18 (apinquiry3) 모든 기기에서 첫 클릭은 ARCHIVE PRO 문의창. mailto 직접 실행 안 함 */
              const inquiryCard = inquiryLink.closest('.card[data-id]');
              const inquiryWorkId = inquiryCard ? safeText(inquiryCard.dataset.id) : '';
              if (inquiryWorkId) {
                const inquiryWork = findInquiryWork(inquiryWorkId, inquiryCard.dataset.key);
                /* 누르는 순간의 언어로 링크 갱신(문의창이 열리지 못하는 예외 상황의 대비) */
                inquiryLink.setAttribute('href', getInquiryLink(inquiryWorkId, inquiryWork));
                e.preventDefault();
                e.stopPropagation();
                openInquiryMenu(inquiryLink, inquiryWorkId, inquiryWork);
              }
              return;
            }
            const card = e.target && e.target.closest ? e.target.closest('.card[data-key]') : null;
            if (!card) return;
            const targetKey = safeText(card.dataset.key);
            const targetId = safeText(card.dataset.id);
            const sourceList = Array.isArray(state.filtered) && state.filtered.length ? state.filtered : state.all;
            const item = sourceList.find((work) => String(work._key) === String(targetKey)) || state.all.find((work) => String(work._key) === String(targetKey)) || state.all.find((work) => String(work.id) === String(targetId));
            if (item) openLightbox(item);
          });

          els.grid.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            if (e.target && e.target.closest && e.target.closest('.status-inquiry')) return; /* 2026-10-18 (apinquiry1) 문의 링크의 Enter는 링크 자체 동작 */
            const card = e.target && e.target.closest ? e.target.closest('.card[data-key]') : null;
            if (!card) return;
            e.preventDefault();
            const targetKey = safeText(card.dataset.key);
            const targetId = safeText(card.dataset.id);
            const sourceList = Array.isArray(state.filtered) && state.filtered.length ? state.filtered : state.all;
            const item = sourceList.find((work) => String(work._key) === String(targetKey)) || state.all.find((work) => String(work._key) === String(targetKey)) || state.all.find((work) => String(work.id) === String(targetId));
            if (item) openLightbox(item);
          });
        }

        /* MOBILE X CLOSE FINAL FIX — close only the viewer, never navigate.
           Capture the X event first, block bubbling/default, arm a temporary shield
           against Safari ghost taps, then restore the exact archive scroll position. */
        const getCloseButton = (e) => {
          return e.target && e.target.closest
            ? e.target.closest('#viewerCloseBtn, #lightboxClose, .viewer-close, .lightbox-close, .close-viewer')
            : null;
        };

        const blockEvent = (e) => {
          if (!e) return;
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        };

        const blockGhostNavigation = (e) => {
if (Date.now() <= closeClickBlockUntil) blockEvent(e);
        };

        const closeFromX = (e) => {
          const closeBtn = getCloseButton(e);
          if (!closeBtn) return;
          blockEvent(e);
          closeViewer();
        };

        const consumeCloseTouch = (e) => {
          const closeBtn = getCloseButton(e);
          if (!closeBtn) return;
          blockEvent(e);
        };

        document.addEventListener('pointerdown', consumeCloseTouch, true);
        document.addEventListener('touchstart', consumeCloseTouch, { capture:true, passive:false });
        document.addEventListener('pointerup', consumeCloseTouch, true);
        document.addEventListener('touchend', closeFromX, { capture:true, passive:false });
        document.addEventListener('click', closeFromX, true);

        ['click','pointerdown','pointerup','touchstart','touchend','mousedown','mouseup'].forEach((type) => {
          document.addEventListener(type, blockGhostNavigation, { capture:true, passive:false });
        });

        /* IPAD FULLSCREEN TOUCH-SCROLL-LOCK FIX 2026-08-25 — safety net:
           The body position:fixed lock above (openLightbox/releaseBodyScrollLock) and
           the existing CSS (html.viewer-open/body.viewer-open: overflow:hidden,
           touch-action:none, overscroll-behavior:none — unchanged) are the primary
           fix. iOS Safari has a well-documented history of still letting a touch
           gesture bounce/scroll the page in some cases even with all of that in place,
           so this adds one more layer: while the viewer is open, block the DEFAULT
           action of any touchmove that isn't inside the one area that must keep
           scrolling on purpose — the caption/info side panel (.lightbox-side), which
           already has its own overflow-y:auto for long captions and is left exactly as
           it works today. Registered on the capture phase so it runs before, and
           without interfering with, the existing pan/zoom touchmove handler on
           .lightbox-stage (that handler calls preventDefault() itself already; calling
           it again here from a different listener for the same event is harmless).
           When the viewer isn't open this does nothing at all, so ordinary gallery
           scrolling is completely unaffected. */
        document.addEventListener('touchmove', (e) => {
          if (!isViewerOpen()) return;
          if (e.target && e.target.closest && e.target.closest('.lightbox-side')) return;
          if (e.cancelable) e.preventDefault();
        }, { capture:true, passive:false });

        if (els.lightboxClose) {
          els.lightboxClose.addEventListener('pointerdown', consumeCloseTouch, { passive:false });
          els.lightboxClose.addEventListener('touchstart', (e) => {
            blockEvent(e);
            closeViewer();
          }, { passive:false });
          els.lightboxClose.addEventListener('pointerup', consumeCloseTouch, { passive:false });
          els.lightboxClose.addEventListener('touchend', closeFromX, { passive:false });
          els.lightboxClose.addEventListener('click', closeFromX, { passive:false });
        }

        if (els.lightboxPrev) {
          els.lightboxPrev.addEventListener('click', (e) => {
            blockEvent(e);
            prevViewer();
          });
        }

        if (els.lightboxNext) {
          els.lightboxNext.addEventListener('click', (e) => {
            blockEvent(e);
            nextViewer();
          });
        }

        /* PERF PATCH 2026-07-11: keep the cached viewer frame rect correct across
           a resize/orientation change without re-reading layout on every touchmove. */
        window.addEventListener('resize', invalidateViewerFrameCache, { passive: true });
        window.addEventListener('orientationchange', invalidateViewerFrameCache, { passive: true });

        els.lightbox.addEventListener('click', (e) => {
          if (e.target === els.lightbox) closeLightbox();
        });

        els.lightbox.addEventListener('dblclick', (e) => {
          if (!isViewerOpen()) return;
          /* PC/NOTEBOOK FULLSCREEN "INTERMITTENT OVER-ZOOM ON NEXT" ROOT-CAUSE FIX
             2026-08-25:
             Root cause (confirmed in code + reproduced with Playwright, not guessed):
             this listener is bound on the whole `.lightbox` container and had no
             check on e.target, so it treated ANY double-click anywhere inside the
             lightbox — including two fast clicks landing on the Next/Prev arrow
             buttons, which is exactly what happens when a person clicks Next
             quickly and repeatedly — as "double-click the artwork to zoom in".
             A browser fires a native `dblclick` after any two clicks close enough
             in time/position, regardless of which element they were aimed at, and
             that event still bubbles up to `.lightbox` even though the two
             underlying `click` events were separately consumed by the Next/Prev
             button handlers (stopPropagation on `click` does not stop the
             independently-dispatched `dblclick`).
             This set viewerScale to 2 on whatever artwork the second click had
             just navigated to. Whether that stuck was itself a race: the very
             next artwork's image is usually not preloaded yet, so its own
             onload -> resetViewerTransform() would normally overwrite the zoom a
             moment later — except when the image happened to already be warm in
             the browser cache (a very common case, since neighbor images are
             preloaded proactively), in which case nothing ran afterward to reset
             it, and the artwork was left rendered at 2x scale, overflowing the
             frame exactly as reported: "정상적으로 contain되어야 할 작품이 간헐적으로
             과도하게 확대되어 나타난다." That race is why it was intermittent rather
             than constant.
             Fix: only treat a double-click as "zoom the artwork" when it actually
             lands on the image/stage itself, not on the nav arrows, close button,
             or the info side panel. This is scoped to this one PC-only,
             mouse-driven handler — the separate touch double-tap-to-zoom gesture
             (touchend, elsewhere) and all iPad/mobile/tablet code are untouched. */
          if (e.target && e.target.closest && e.target.closest(
            '.lightbox-nav, .lightbox-prev, .lightbox-next, .lightbox-close, .viewer-close, .close-viewer, #lightboxClose, #viewerCloseBtn, .lightbox-side, .lb-actions'
          )) return;
          e.preventDefault();
          viewerScale = viewerScale > 1 ? 1 : 2;
          viewerX = 0;
          viewerY = 0;
          applyViewerTransform();
        });

        // Mouse wheel / trackpad zoom (desktop) — matches dungzak.art / jskim.art.
        // Existing pinch (touch), double-click, and mouse-drag pan are unaffected.
        /* HORIZONTAL-SCROLL-NAVIGATES FIX 2026-08-25:
           Root cause of the original "flicker/grows when scrolling left-right in the
           viewer" report: this handler used to read ONLY e.deltaY, so ANY scroll
           input while the viewer was open — including a left/right trackpad swipe,
           which is how the reporter was actually trying to move between artworks —
           got treated as a zoom gesture (a horizontal swipe still reports a non-zero
           deltaY on most trackpads/drivers). That produced exactly the symptoms
           reported across this whole investigation: a same-artwork "flash" as scale
           jumped around mid-swipe, and later the artwork "suddenly growing", because
           the viewer was never being asked to change images at all — it was being
           zoomed by an input the person expected to page through the gallery.
           Fix: when a wheel/trackpad event is clearly horizontal (|deltaX| bigger
           than |deltaY|) and the image isn't currently zoomed in, treat it as a
           swipe — advance to the next/previous artwork, the same as clicking the
           lightbox-nav arrows or pressing the arrow keys — instead of zooming.
           One physical trackpad swipe fires dozens of 'wheel' events as it
           decelerates, so firing on every qualifying event would race through many
           artworks per swipe. wheelSwipeArmed collapses that: the first qualifying
           event in a gesture navigates once and disarms. Re-arming is primarily
           driven by the gesture's own physical momentum decay — a real trackpad
           swipe's deltaX tapers toward zero as it settles, so the trailing event(s)
           naturally fall below the isHorizontalSwipe threshold and re-arm right as
           the swipe actually ends, however long that takes; a vertical/zoom event
           re-arms immediately too. The 500ms idle timer underneath is only a safety
           net for input devices that stop abruptly with no decaying tail (plain
           notch-scroll wheels, some mouse drivers) so a single stuck disarm can
           never block all future swipes. Horizontal scroll while already zoomed in
           still does nothing (unchanged) rather than fighting an in-progress
           zoom/pan. */
        let wheelSwipeArmed = true;
        let wheelSwipeIdleTimer = null;
        els.lightbox.addEventListener('wheel', (e) => {
          if (!isViewerOpen()) return;
          e.preventDefault();

          const isHorizontalSwipe = Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 8;
          if (isHorizontalSwipe && viewerScale <= 1.02) {
            clearTimeout(wheelSwipeIdleTimer);
            wheelSwipeIdleTimer = setTimeout(() => { wheelSwipeArmed = true; }, 500);
            if (wheelSwipeArmed) {
              wheelSwipeArmed = false;
              if (e.deltaX > 0) nextViewer(); else prevViewer();
            }
            return;
          }
          clearTimeout(wheelSwipeIdleTimer);
          wheelSwipeArmed = true;

          const delta = -e.deltaY * 0.0015;
          viewerScale = Math.min(Math.max(1, viewerScale + delta * viewerScale), 4);
          if (viewerScale <= 1.02) {
            viewerScale = 1;
            viewerX = 0;
            viewerY = 0;
          }
          applyViewerTransform();
        }, { passive: false });

        const viewerTouchTarget = els.lightboxStage || els.lightbox;
        viewerTouchTarget.addEventListener('touchstart', (e) => {
          if (!isViewerOpen()) return;
          if (e.target && e.target.closest && e.target.closest('.viewer-close, .lightbox-close, .modal-close, .close-btn, #viewerCloseBtn, #lightboxClose')) return;
          e.preventDefault();
          e.stopPropagation();
          invalidateViewerFrameCache();

          if (e.touches.length >= 2) {
            viewerIsZooming = true;
            viewerIsDragging = false;
            clearMobilePinchEndGuard();
            viewerInitialDistance = getViewerDistance(e.touches[0], e.touches[1]);
            viewerStartScale = viewerScale;
            viewerStartX = null;
            viewerStartY = null;
            viewerLastX = null;
            viewerLastY = null;
            return;
          }

          if (e.touches.length !== 1) return;
          const touch = e.touches[0];
          viewerStartX = touch.clientX;
          viewerStartY = touch.clientY;
          viewerLastX = touch.clientX;
          viewerLastY = touch.clientY;
          viewerStartTime = Date.now();
          viewerIsDragging = true;
          if (els.lightboxStage) els.lightboxStage.classList.add('is-dragging');
        }, { passive:false });

        viewerTouchTarget.addEventListener('touchmove', (e) => {
          if (!isViewerOpen()) return;
          if (e.target && e.target.closest && e.target.closest('.viewer-close, .lightbox-close, .modal-close, .close-btn, #viewerCloseBtn, #lightboxClose')) return;
          e.preventDefault();
          e.stopPropagation();

          if (viewerIsZooming && e.touches.length >= 2) {
            const newDistance = getViewerDistance(e.touches[0], e.touches[1]);
            if (!viewerInitialDistance) viewerInitialDistance = newDistance;
            const nextScale = viewerStartScale * (newDistance / viewerInitialDistance);
            viewerScale = Math.min(Math.max(1, nextScale), 4);
            if (viewerScale <= 1.02) {
              viewerScale = 1;
              viewerX = 0;
              viewerY = 0;
            }
            applyViewerTransform();
            return;
          }

          if (!viewerIsDragging || e.touches.length !== 1) return;

          const touch = e.touches[0];
          const dx = touch.clientX - viewerLastX;
          const dy = touch.clientY - viewerLastY;

          if (viewerScale > 1.02) {
            viewerX += dx;
            viewerY += dy;
            applyViewerTransform();
          }

          viewerLastX = touch.clientX;
          viewerLastY = touch.clientY;
        }, { passive:false });

        viewerTouchTarget.addEventListener('touchend', (e) => {
          if (!isViewerOpen()) return;
          if (e.target && e.target.closest && e.target.closest('.viewer-close, .lightbox-close, .modal-close, .close-btn, #viewerCloseBtn, #lightboxClose')) return;

          if (viewerIsZooming) {
            if (e.touches.length < 2) {
              viewerIsZooming = false;
              viewerInitialDistance = 0;
              armMobilePinchEndGuard();
              if (viewerScale <= 1.02) {
                viewerScale = 1;
                viewerX = 0;
                viewerY = 0;
              }
              applyViewerTransform();
            }
            return;
          }

          if (shouldBlockMobileViewerSwipe()) {
            viewerIsDragging = false;
            if (els.lightboxStage) els.lightboxStage.classList.remove('is-dragging');
            return;
          }

          const changed = e.changedTouches && e.changedTouches[0];
          const endX = changed ? changed.clientX : viewerLastX;
          const endY = changed ? changed.clientY : viewerLastY;
          const totalDx = endX - viewerStartX;
          const totalDy = endY - viewerStartY;
          const elapsed = Date.now() - viewerStartTime;

          if (!viewerIsZooming && viewerScale <= 1.01 && Math.abs(totalDx) > 60 && Math.abs(totalDx) > Math.abs(totalDy) * 1.25) {
            if (totalDx > 0) prevViewer();
            else nextViewer();
          }

          const now = Date.now();
          if (viewerScale <= 1.02 && Math.abs(totalDx) < 12 && Math.abs(totalDy) < 12 && elapsed < 320 && now - viewerLastTap < 300) {
            viewerScale = 2;
            viewerX = 0;
            viewerY = 0;
            applyViewerTransform();
            viewerLastTap = 0;
          } else {
            viewerLastTap = now;
          }

          viewerIsDragging = false;
          if (els.lightboxStage) els.lightboxStage.classList.remove('is-dragging');
        }, { passive:false });

        els.lightbox.addEventListener('mousedown', (e) => {
          if (!isViewerOpen() || viewerScale <= 1 || e.button !== 0) return;
          e.preventDefault();
          viewerMouseDragging = true;
          viewerLastX = e.clientX;
          viewerLastY = e.clientY;
          if (els.lightboxStage) els.lightboxStage.classList.add('is-dragging');
        });

        document.addEventListener('mousemove', (e) => {
          if (!isViewerOpen() || !viewerMouseDragging || viewerScale <= 1) return;
          const dx = e.clientX - viewerLastX;
          const dy = e.clientY - viewerLastY;
          viewerX += dx;
          viewerY += dy;
          viewerLastX = e.clientX;
          viewerLastY = e.clientY;
          applyViewerTransform();
        });

        document.addEventListener('mouseup', () => {
          viewerMouseDragging = false;
          if (els.lightboxStage) els.lightboxStage.classList.remove('is-dragging');
        });

        document.addEventListener('keydown', (e) => {
          if (!isViewerOpen()) return;
          if (e.key === 'Escape') closeLightbox();
          if (e.key === 'ArrowRight') nextViewer();
          if (e.key === 'ArrowLeft') prevViewer();
        });

        els.langTabs.forEach((tab) => {
          tab.addEventListener('click', () => setLanguage(tab.dataset.lang));
        });
        if (els.apResetTrigger) {
          els.apResetTrigger.addEventListener('click', (e) => {
            e.preventDefault();
            if (Date.now() <= closeClickBlockUntil) {
              blockEvent(e);
              return;
            }
            resetAllSections(DEFAULT_ENTRY_SECTION); /* 2026-10-18 (aplogo1) 로고 = I 우리를 위해 기도해 주세요 처음으로 */
          });
        }

        if (els.entryBtn) {
          els.entryBtn.addEventListener('click', (e) => {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            enterArchiveExperience();
          }, { passive:false });
        }

        els.sectionButtons.forEach((btn) => {
          btn.addEventListener('click', () => {
            /* Section buttons now open a clean section view.
               Search text is cleared and sort returns to the simple default order. */
            state.section = btn.dataset.section || 'all';
            state.query = '';
            state.sort = FAST_ORDER;
            state.visibleCount = getInitialVisibleCount();

            els.searchInput.value = '';
            els.sectionSelect.value = state.section;
            els.sortSelect.value = FAST_ORDER;

            applyFilters(true);
            scrollToSearch();
          });
        });
      }

      bindEvents();
      try { apLogTiming('events bound (app shell interactive)'); } catch (_) {}

      let archiveLoadStarted = false;

      function startLoad() {
        if (archiveLoadStarted) return;
        archiveLoadStarted = true;
        archiveEntered = true;
        filterPanelOpen = true;

        updateEntryUXClasses();
        showArchiveShellImmediately();
        requestAnimationFrame(() => {
          rebuildStaticTexts();
          updateStats();
        });

        refreshArchiveData();
      }

      /*
        FIRST-LOAD SPEED PATCH:
        Every element startLoad()/bindEvents() touch (grid, loadingScreen,
        resultsMeta, search/section/sort controls, viewer, entry button, etc.)
        is already parsed above this <script> tag, so waiting for the entire
        remaining document — including the PWA install script and the Service
        Worker registration further below — to finish parsing before starting
        the works.json fetch only delays the background data load for no
        reason. startLoad() is idempotent (guarded by archiveLoadStarted), so
        it is safe to call it immediately here; the DOMContentLoaded listener
        stays only as a harmless safety net. */
      startLoad();
      window.addEventListener('online', () => refreshArchiveData(true));
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startLoad, { once: true });
      }
    })();

