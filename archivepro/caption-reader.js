/*
 * ELSOL — GOLD CAPTION READER  (caption-reader.js)
 * build 20261117-cr2 · 2026-11-17 (cr2: 화면이 백그라운드여도 버튼이 늦게 붙지 않게 setTimeout 보조)
 *
 * 저시력 이용자용 캡션 리더 — 세 서비스 공통 모듈(같은 파일을 그대로 복사해 사용).
 *   A. Artist Edition       /app/, /app/{artistId}        (Firebase Hosting)
 *   B. ARCHIVE PRO 아카이브  /archivepro/index.html         (GitHub Pages)
 *   C. COSMOS               /cosmos                        (Firebase Hosting)
 *
 * 원칙
 *  - 작품 이미지·카드·뷰어·검색·FILTER·Bio·PDF·로그인 코드는 건드리지 않는다. 이 파일은
 *    화면에 이미 있는 작품 데이터를 "읽기만" 하고, 작품 이미지와 분리된 전용 읽기 화면 1개를 재사용한다.
 *  - 작품 수와 무관하게 리더(대화상자)는 문서 전체에 1개만 만든다(카드마다 모달 생성 금지).
 *  - 확대 100·150·200·300·400%. 첫 사용 300%, 이후 마지막 선택 유지(전용 키 dz.captionReader.v1).
 *  - KR / EN / KR+EN: 원본 데이터를 번역·변형하지 않는다. 한쪽 언어가 비어 있을 때 화면이 이미 하던
 *    것과 같이 다른 언어 원문을 보여 주되, lang 속성은 실제 글자의 언어로 붙인다.
 *  - CSS는 .dzcr- 접두사, 이벤트는 리더가 열려 있고 대상이 리더 안일 때만 가로챈다.
 *  - 애니메이션·자동 음성 재생 없음.
 */
(function () {
  "use strict";
  if (window.DZ_CAPTION_READER) return;

  var BUILD = "20261117-cr2";
  var STORE_KEY = "dz.captionReader.v1";
  var SCALES = [100, 150, 200, 300, 400];
  var DEFAULT_SCALE = 300;

  // ------------------------------------------------------------------
  // 문구(UI 전용 — 작품 데이터가 아님)
  // ------------------------------------------------------------------
  var UI = {
    kr: {
      listBtn: "캡션 큰 글씨로 보기",
      workBtn: "캡션 크게 보기",
      dialog: "캡션 크게 보기",
      close: "닫기",
      prev: "이전 작품",
      next: "다음 작품",
      prevShort: "이전",
      nextShort: "다음",
      textSize: "글자 크기",
      language: "언어",
      langKr: "한국어",
      langEn: "영어",
      langBoth: "한국어와 영어 함께",
      section: "섹션",
      code: "작품 번호",
      artist: "작가",
      material: "재료·기법",
      size: "크기",
      year: "제작연도",
      status: "상태",
      series: "시리즈",
      note: "작가 노트",
      untitled: "무제",
      position: "{i} / {n}",
      positionSr: "{n}점 중 {i}번째 작품",
      sizeNow: "글자 크기 {s}%",
      empty: "표시할 작품이 없습니다."
    },
    en: {
      listBtn: "Large Caption View",
      workBtn: "Enlarge Caption",
      dialog: "Enlarge Caption",
      close: "Close",
      prev: "Previous",
      next: "Next",
      prevShort: "Previous",
      nextShort: "Next",
      textSize: "Text size",
      language: "Language",
      langKr: "Korean",
      langEn: "English",
      langBoth: "Korean and English",
      section: "Section",
      code: "No.",
      artist: "Artist",
      material: "Medium",
      size: "Size",
      year: "Year",
      status: "Status",
      series: "Series",
      note: "Artist's note",
      untitled: "Untitled",
      position: "{i} / {n}",
      positionSr: "Work {i} of {n}",
      sizeNow: "Text size {s}%",
      empty: "No works to show."
    }
  };

  function fmt(s, o) {
    return String(s).replace(/\{(\w+)\}/g, function (_m, k) { return o && o[k] != null ? o[k] : ""; });
  }
  function str(v) { return v == null ? "" : String(v).trim(); }
  function normLang(l) { return l === "en" ? "en" : l === "both" || l === "kren" || l === "kr+en" ? "both" : "kr"; }

  // 한글이 하나라도 있으면 ko, 아니면 en — 대체 표시(KR 칸이 비어 EN 원문을 보일 때)의 lang 속성용
  function langOf(text, fallback) {
    if (/[ㄱ-ㆎ가-힣]/.test(text)) return "ko";
    if (/[A-Za-z]/.test(text)) return "en";
    return fallback;
  }

  // el 안에 UI 문구를 언어 모드대로 넣는다(KR+EN이면 두 언어를 각각 lang을 붙여 나란히)
  function putUi(el, key, mode, vars, stacked) {
    el.textContent = "";
    if (mode === "both") {
      var a = document.createElement("span");
      a.lang = "ko";
      a.textContent = fmt(UI.kr[key], vars);
      var b = document.createElement("span");
      b.lang = "en";
      b.textContent = fmt(UI.en[key], vars);
      if (stacked) { a.className = b.className = "dzcr-stack"; }
      el.appendChild(a);
      if (!stacked) el.appendChild(document.createTextNode(" · "));
      el.appendChild(b);
      el.removeAttribute("lang");
    } else {
      el.textContent = fmt(UI[mode === "en" ? "en" : "kr"][key], vars);
      el.lang = mode === "en" ? "en" : "ko";
    }
  }
  function uiText(key, mode, vars) {
    if (mode === "both") return fmt(UI.kr[key], vars) + " · " + fmt(UI.en[key], vars);
    return fmt(UI[mode === "en" ? "en" : "kr"][key], vars);
  }

  // ------------------------------------------------------------------
  // 사용자 설정(확대 비율) — 전용 키. 기존 설정 데이터와 섞지 않는다.
  // ------------------------------------------------------------------
  function loadScale() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && SCALES.indexOf(Number(o.scale)) !== -1) return Number(o.scale);
      }
    } catch (e) { /* 저장소 사용 불가 — 기본값 */ }
    return DEFAULT_SCALE;
  }
  function saveScale(s) {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, scale: s })); } catch (e) { /* 무시 */ }
  }

  // ------------------------------------------------------------------
  // 캡션 데이터 → 화면용 행(row) 목록. 순수 함수(DOM 없음) — 테스트에서 직접 검사한다.
  //  item: { code, sectionKr, sectionEn, titleKr, titleEn, artistKr, artistEn, materialKr, materialEn,
  //          sizeKr, sizeEn, year, statusKr, statusEn, seriesKr, seriesEn, noteKr, noteEn,
  //          hideMeta(기원 등 화면이 재료·크기·연도를 숨기는 작품), forceUntitled(화면이 항상 무제로 보이는 작품) }
  //  반환: { title: [{text, lang}], rows: [{key, values:[{text, lang}]}], notes: [{text, lang}] }
  // ------------------------------------------------------------------
  function pickValues(kr, en, mode) {
    kr = str(kr);
    en = str(en);
    if (!kr && !en) return [];
    if (mode === "en") {
      var e1 = en || kr;
      return [{ text: e1, lang: en ? "en" : langOf(e1, "ko") }];
    }
    if (mode === "both") {
      if (kr && en && kr !== en) return [{ text: kr, lang: langOf(kr, "ko") }, { text: en, lang: langOf(en, "en") }];
      var one = kr || en;
      return [{ text: one, lang: langOf(one, kr ? "ko" : "en") }];
    }
    var k1 = kr || en;
    return [{ text: k1, lang: kr ? langOf(kr, "ko") : langOf(k1, "en") }];
  }

  function buildCaption(item, mode) {
    item = item || {};
    mode = normLang(mode);
    var out = { title: [], rows: [], notes: [] };
    var titleVals = item.forceUntitled ? [] : pickValues(item.titleKr, item.titleEn, mode);
    if (!titleVals.length) {
      if (mode === "both") titleVals = [{ text: UI.kr.untitled, lang: "ko" }, { text: UI.en.untitled, lang: "en" }];
      else titleVals = [{ text: UI[mode === "en" ? "en" : "kr"].untitled, lang: mode === "en" ? "en" : "ko" }];
    }
    out.title = titleVals;
    function row(key, vals) { if (vals && vals.length) out.rows.push({ key: key, values: vals }); }
    row("artist", pickValues(item.artistKr, item.artistEn, mode));
    row("code", str(item.code) ? [{ text: str(item.code), lang: "en" }] : []);
    row("section", pickValues(item.sectionKr, item.sectionEn, mode));
    row("series", pickValues(item.seriesKr, item.seriesEn, mode));
    if (!item.hideMeta) {
      row("material", pickValues(item.materialKr, item.materialEn, mode));
      row("size", pickValues(item.sizeKr, item.sizeEn, mode));
      row("year", str(item.year) ? [{ text: str(item.year), lang: "en" }] : []);
    }
    row("status", pickValues(item.statusKr, item.statusEn, mode));
    var nk = str(item.noteKr), ne = str(item.noteEn);
    if (mode === "en") { if (ne) out.notes.push({ text: ne, lang: langOf(ne, "en") }); }
    else if (mode === "both") {
      if (nk) out.notes.push({ text: nk, lang: langOf(nk, "ko") });
      if (ne && ne !== nk) out.notes.push({ text: ne, lang: langOf(ne, "en") });
    } else if (nk) out.notes.push({ text: nk, lang: langOf(nk, "ko") });
    return out;
  }

  // ------------------------------------------------------------------
  // 리더(대화상자) — 문서 전체에 1개
  // ------------------------------------------------------------------
  var R = {
    root: null, open: false, provider: null, index: 0, mode: "kr", scale: DEFAULT_SCALE,
    returnFocus: null, returnFocusFallback: null, pushed: false, ignorePop: false, ignoreTimer: 0,
    saved: null, els: {}
  };

  function el(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    return e;
  }

  function buildRoot() {
    if (R.root) return R.root;
    var root = el("div", "dzcr-root", {
      id: "dzCaptionReader", role: "dialog", "aria-modal": "true", "aria-labelledby": "dzcrTitle",
      "data-independent-scroll": "true", hidden: ""
    });
    root.setAttribute("data-dzcr-build", BUILD);

    var bar = el("div", "dzcr-bar");
    var close = el("button", "dzcr-btn dzcr-close", { type: "button", "data-dzcr": "close" });
    var nav = el("div", "dzcr-nav");
    var prev = el("button", "dzcr-btn dzcr-prev", { type: "button", "data-dzcr": "prev" });
    var pos = el("p", "dzcr-pos");
    var next = el("button", "dzcr-btn dzcr-next", { type: "button", "data-dzcr": "next" });
    nav.appendChild(prev); nav.appendChild(pos); nav.appendChild(next);
    bar.appendChild(close); bar.appendChild(nav);

    var settings = el("div", "dzcr-settings");
    var sizeGroup = el("div", "dzcr-group", { role: "group", "aria-labelledby": "dzcrSizeLabel" });
    var sizeLabel = el("p", "dzcr-group-label", { id: "dzcrSizeLabel" });
    var sizeBtns = el("div", "dzcr-choices");
    SCALES.forEach(function (s) {
      var b = el("button", "dzcr-btn dzcr-choice", { type: "button", "data-dzcr": "scale", "data-dzcr-scale": String(s), "aria-pressed": "false" });
      var mark = el("span", "dzcr-check", { "aria-hidden": "true" });
      mark.textContent = "✓";
      var t = el("span", "dzcr-choice-text");
      t.textContent = s + "%";
      b.appendChild(mark); b.appendChild(t);
      sizeBtns.appendChild(b);
    });
    sizeGroup.appendChild(sizeLabel); sizeGroup.appendChild(sizeBtns);

    var langGroup = el("div", "dzcr-group", { role: "group", "aria-labelledby": "dzcrLangLabel" });
    var langLabel = el("p", "dzcr-group-label", { id: "dzcrLangLabel" });
    var langBtns = el("div", "dzcr-choices");
    [["kr", "KR", "langKr"], ["en", "EN", "langEn"], ["both", "KR+EN", "langBoth"]].forEach(function (L) {
      var b = el("button", "dzcr-btn dzcr-choice", { type: "button", "data-dzcr": "lang", "data-dzcr-lang": L[0], "aria-pressed": "false", "data-dzcr-aria": L[2] });
      var mark = el("span", "dzcr-check", { "aria-hidden": "true" });
      mark.textContent = "✓";
      var t = el("span", "dzcr-choice-text", { "aria-hidden": "true" });
      t.textContent = L[1];
      b.appendChild(mark); b.appendChild(t);
      langBtns.appendChild(b);
    });
    langGroup.appendChild(langLabel); langGroup.appendChild(langBtns);
    settings.appendChild(sizeGroup); settings.appendChild(langGroup);

    var body = el("div", "dzcr-body");
    var caption = el("article", "dzcr-caption");
    var title = el("h2", "dzcr-title", { id: "dzcrTitle", tabindex: "-1" });
    var dl = el("dl", "dzcr-fields");
    var notes = el("div", "dzcr-notes");
    caption.appendChild(title); caption.appendChild(dl); caption.appendChild(notes);
    body.appendChild(caption);

    var foot = el("div", "dzcr-foot");
    var prev2 = el("button", "dzcr-btn dzcr-prev", { type: "button", "data-dzcr": "prev" });
    var next2 = el("button", "dzcr-btn dzcr-next", { type: "button", "data-dzcr": "next" });
    var close2 = el("button", "dzcr-btn dzcr-close", { type: "button", "data-dzcr": "close" });
    foot.appendChild(prev2); foot.appendChild(next2); foot.appendChild(close2);

    var live = el("p", "dzcr-sr", { "aria-live": "polite", role: "status" });

    var inner = el("div", "dzcr-inner");
    inner.appendChild(bar); inner.appendChild(settings); inner.appendChild(body); inner.appendChild(foot); inner.appendChild(live);
    root.appendChild(inner);
    document.body.appendChild(root);

    R.root = root;
    R.els = {
      inner: inner, bar: bar, close: [close, close2], prev: [prev, prev2], next: [next, next2], pos: pos, nav: nav, foot: foot,
      sizeLabel: sizeLabel, langLabel: langLabel, sizeBtns: sizeBtns, langBtns: langBtns,
      caption: caption, title: title, dl: dl, notes: notes, live: live
    };
    return root;
  }

  function renderChrome() {
    var m = R.mode, E = R.els, n = R.provider ? R.provider.count() : 0;
    R.root.setAttribute("aria-label", uiText("dialog", m));
    // 상단 막대는 짧은 문구·KR+EN은 두 줄로(작은 화면에서 막대가 화면을 덮지 않게), 하단은 전체 문구
    E.close.forEach(function (b, i) { putUi(b, "close", m, null, i === 0); });
    E.prev.forEach(function (b, i) { putUi(b, i === 0 ? "prevShort" : "prev", m, null, i === 0); b.setAttribute("aria-label", uiText("prev", m)); b.disabled = n < 2; b.hidden = n < 2; });
    E.next.forEach(function (b, i) { putUi(b, i === 0 ? "nextShort" : "next", m, null, i === 0); b.setAttribute("aria-label", uiText("next", m)); b.disabled = n < 2; b.hidden = n < 2; });
    if (n >= 2) {
      E.pos.hidden = false;
      E.pos.textContent = fmt(UI.kr.position, { i: R.index + 1, n: n });
      E.pos.setAttribute("aria-label", uiText("positionSr", m, { i: R.index + 1, n: n }));
    } else {
      E.pos.hidden = true;
    }
    putUi(E.sizeLabel, "textSize", m);
    putUi(E.langLabel, "language", m);
    Array.prototype.forEach.call(E.sizeBtns.children, function (b) {
      var on = Number(b.getAttribute("data-dzcr-scale")) === R.scale;
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    Array.prototype.forEach.call(E.langBtns.children, function (b) {
      var on = b.getAttribute("data-dzcr-lang") === R.mode;
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.setAttribute("aria-label", uiText(b.getAttribute("data-dzcr-aria"), m));
    });
    R.root.style.setProperty("--dzcr-scale", String(R.scale / 100));
    R.root.setAttribute("data-dzcr-scale", String(R.scale));
  }

  function renderCaption() {
    var E = R.els, m = R.mode;
    var item = R.provider ? R.provider.get(R.index) : null;
    E.title.textContent = "";
    E.dl.textContent = "";
    E.notes.textContent = "";
    if (!item) {
      var p = el("span", "dzcr-line");
      putUi(p, "empty", m);
      E.title.appendChild(p);
      return;
    }
    var cap = buildCaption(item, m);
    cap.title.forEach(function (v) {
      var s = el("span", "dzcr-line", { lang: v.lang });
      s.textContent = v.text;
      E.title.appendChild(s);
    });
    cap.rows.forEach(function (r) {
      var wrap = el("div", "dzcr-row dzcr-row-" + r.key);
      var dt = el("dt", "dzcr-key");
      putUi(dt, r.key, m);
      wrap.appendChild(dt);
      r.values.forEach(function (v) {
        var dd = el("dd", "dzcr-val", { lang: v.lang });
        dd.textContent = v.text;
        wrap.appendChild(dd);
      });
      E.dl.appendChild(wrap);
    });
    if (cap.notes.length) {
      var h = el("p", "dzcr-key dzcr-notes-key");
      putUi(h, "note", m);
      E.notes.appendChild(h);
      cap.notes.forEach(function (v) {
        var p2 = el("p", "dzcr-note", { lang: v.lang });
        p2.textContent = v.text;
        E.notes.appendChild(p2);
      });
    }
  }

  function render() { renderChrome(); renderCaption(); }

  function announce(text) {
    var L = R.els.live;
    if (!L) return;
    L.textContent = "";
    setTimeout(function () { L.textContent = text; }, 30);
  }

  // ---- 배경 잠금(inert/aria-hidden) & 스크롤 잠금 — 열기 전 값을 그대로 기억했다가 복원 ----
  function lockBackground() {
    var saved = { nodes: [], htmlOverflow: document.documentElement.style.overflow, bodyOverflow: document.body.style.overflow };
    Array.prototype.forEach.call(document.body.children, function (n) {
      if (n === R.root || n.nodeType !== 1) return;
      var tag = n.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "LINK" || tag === "TEMPLATE" || tag === "NOSCRIPT") return;
      saved.nodes.push({ n: n, ah: n.getAttribute("aria-hidden"), inert: n.hasAttribute("inert") });
      n.setAttribute("aria-hidden", "true");
      n.setAttribute("inert", "");
    });
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("dzcr-open");
    R.saved = saved;
  }
  function unlockBackground() {
    var s = R.saved;
    R.saved = null;
    document.documentElement.classList.remove("dzcr-open");
    if (!s) return;
    s.nodes.forEach(function (x) {
      if (x.ah == null) x.n.removeAttribute("aria-hidden"); else x.n.setAttribute("aria-hidden", x.ah);
      if (!x.inert) x.n.removeAttribute("inert");
    });
    document.documentElement.style.overflow = s.htmlOverflow;
    document.body.style.overflow = s.bodyOverflow;
  }

  function focusables() {
    return Array.prototype.filter.call(
      R.root.querySelectorAll("button, [href], [tabindex]:not([tabindex='-1'])"),
      function (b) { return !b.disabled && !b.hidden && b.offsetParent !== null; }
    );
  }

  function focusTitle() {
    try { R.els.title.focus({ preventScroll: true }); } catch (e) { try { R.els.title.focus(); } catch (e2) {} }
  }

  /**
   * opts: { provider: {count(), get(i)}, index, lang: 'kr'|'en'|'both', trigger: Element, fallbackFocus: fn → Element }
   */
  function open(opts) {
    if (!opts || !opts.provider) return false;
    buildRoot();
    var n = opts.provider.count();
    if (!n) return false;
    R.provider = opts.provider;
    R.index = Math.max(0, Math.min(n - 1, Number(opts.index) || 0));
    R.mode = normLang(opts.lang);
    R.scale = loadScale();
    R.returnFocus = opts.trigger || document.activeElement;
    R.returnFocusFallback = typeof opts.fallbackFocus === "function" ? opts.fallbackFocus : null;
    var wasOpen = R.open;
    render();
    if (!wasOpen) {
      lockBackground();
      R.root.hidden = false;
      R.open = true;
      R.root.scrollTop = 0;
      try {
        var st = window.history.state;
        var next = {};
        if (st && typeof st === "object") for (var k in st) if (Object.prototype.hasOwnProperty.call(st, k)) next[k] = st[k];
        next.dzCaptionReader = 1;
        window.history.pushState(next, "", window.location.href);
        R.pushed = true;
      } catch (e) { R.pushed = false; }
    }
    focusTitle();
    return true;
  }

  function finishClose() {
    R.open = false;
    R.root.hidden = true;
    unlockBackground();
    var f = R.returnFocus;
    if (!f || !document.body.contains(f) || f.offsetParent === null) f = R.returnFocusFallback ? R.returnFocusFallback() : null;
    R.returnFocus = null;
    R.returnFocusFallback = null;
    R.provider = null;
    if (f && f.focus) { try { f.focus({ preventScroll: true }); } catch (e) { try { f.focus(); } catch (e2) {} } }
  }

  function close() {
    if (!R.open) return;
    finishClose();
    if (R.pushed) {
      R.pushed = false;
      var st = window.history.state;
      if (st && st.dzCaptionReader) {
        // 우리가 넣은 기록 1개만 되돌린다. 이 뒤에 오는 popstate는 리더가 소비한다(아래 onPopState) —
        // 작품 뷰어 닫힘·맨 위 스크롤 같은 다른 화면의 뒤로가기 처리가 함께 실행되지 않게.
        R.ignorePop = true;
        clearTimeout(R.ignoreTimer);
        R.ignoreTimer = setTimeout(function () { R.ignorePop = false; }, 1500);
        try { window.history.back(); } catch (e) { R.ignorePop = false; }
      }
    }
  }

  function go(delta) {
    var n = R.provider ? R.provider.count() : 0;
    if (n < 2) return;
    R.index = (R.index + delta + n) % n;
    render();
    R.root.scrollTop = 0;
    focusTitle();
  }

  function setScale(s) {
    if (SCALES.indexOf(s) === -1) return;
    R.scale = s;
    saveScale(s);
    renderChrome();
    announce(uiText("sizeNow", R.mode, { s: s }));
  }

  function setMode(m) {
    R.mode = normLang(m);
    render();
  }

  // ---- 이벤트: 리더가 열려 있을 때만, window capture 단계에서 먼저 받아 처리하고 페이지로 전파하지 않는다 ----
  function inReader(t) { return !!(R.root && t && t.nodeType && (t === R.root || R.root.contains(t))); }

  function onClickCapture(e) {
    if (!R.open || !inReader(e.target)) return;
    e.stopPropagation();
    var b = e.target.closest ? e.target.closest("[data-dzcr]") : null;
    if (!b || !R.root.contains(b) || b.disabled) return;
    var a = b.getAttribute("data-dzcr");
    if (a === "close") close();
    else if (a === "prev") go(-1);
    else if (a === "next") go(1);
    else if (a === "scale") setScale(Number(b.getAttribute("data-dzcr-scale")));
    else if (a === "lang") setMode(b.getAttribute("data-dzcr-lang"));
  }

  function onKeyCapture(e) {
    if (!R.open) return;
    var k = e.key;
    if (k === "Escape" || k === "Esc") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (k === "Tab") {
      var f = focusables();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (e.shiftKey && (a === first || !inReader(a) || a === R.els.title)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (a === last || !inReader(a))) { e.preventDefault(); first.focus(); }
      e.stopPropagation();
      return;
    }
    if ((k === "ArrowLeft" || k === "ArrowRight") && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      go(k === "ArrowLeft" ? -1 : 1);
      e.stopPropagation();
      return;
    }
    // 그 밖의 키(스크롤·버튼 실행 등 기본 동작)는 그대로 두고, 페이지의 단축키·뷰어 키 처리로만 전파하지 않는다.
    e.stopPropagation();
  }

  function onPassThroughCapture(e) {
    // 터치·포인터·휠: 리더 안 이벤트를 페이지의 문서 단위 처리(뷰어 터치 잠금, 당겨서 새로고침 방지 등)로 보내지 않는다.
    if (R.open && inReader(e.target)) e.stopPropagation();
  }

  function onPopState(e) {
    if (R.ignorePop) {
      R.ignorePop = false;
      clearTimeout(R.ignoreTimer);
      e.stopImmediatePropagation();
      return;
    }
    if (R.open) {
      // 뒤로가기(Android 뒤로 가기 버튼·브라우저 뒤로) = 리더만 닫는다.
      e.stopImmediatePropagation();
      R.pushed = false;
      finishClose();
    }
  }

  window.addEventListener("click", onClickCapture, true);
  window.addEventListener("keydown", onKeyCapture, true);
  ["touchstart", "touchmove", "touchend", "touchcancel", "pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "dblclick", "wheel", "contextmenu"].forEach(function (t) {
    window.addEventListener(t, onPassThroughCapture, { capture: true, passive: true });
  });
  window.addEventListener("popstate", onPopState, true);

  // ------------------------------------------------------------------
  // 트리거 버튼(돋보기 + 텍스트 라벨 — 검색 아이콘과 구분되도록 글자를 항상 함께 표시)
  // ------------------------------------------------------------------
  var ICON =
    '<svg class="dzcr-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">' +
    '<circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M10 7v6M7 10h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M15 15l5.5 5.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

  function makeTrigger(kind) {
    var b = el("button", "dzcr-trigger dzcr-trigger-" + kind, { type: "button", "data-dzcr-trigger": kind });
    b.innerHTML = ICON + '<span class="dzcr-trigger-label"></span>';
    return b;
  }
  function labelTrigger(b, mode) {
    var key = b.getAttribute("data-dzcr-trigger") === "list" ? "listBtn" : "workBtn";
    var lab = b.querySelector(".dzcr-trigger-label");
    if (b.getAttribute("data-dzcr-mode") === mode && lab.childNodes.length) return;
    b.setAttribute("data-dzcr-mode", mode);
    lab.textContent = "";
    if (mode === "both") {
      var a = el("span", "dzcr-tl", { lang: "ko" }); a.textContent = UI.kr[key];
      var c = el("span", "dzcr-tl", { lang: "en" }); c.textContent = UI.en[key];
      lab.appendChild(a); lab.appendChild(c);
      b.removeAttribute("lang");
    } else {
      lab.textContent = UI[mode === "en" ? "en" : "kr"][key];
      b.lang = mode === "en" ? "en" : "ko";
    }
  }

  // 화면에 보이는 첫 작품 카드(목록 보기 시작 위치)
  function firstVisible(cards) {
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    var vw = window.innerWidth || document.documentElement.clientWidth || 0;
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].getBoundingClientRect();
      if (!(r.height > 0 && r.width > 0 && r.bottom > 60 && r.top < vh && r.right > 0 && r.left < vw)) continue;
      // 캐러셀(가로로 넘기는 작품 묶음)은 지금 상자 안에 보이는 슬라이드만
      var box = cards[i].closest ? cards[i].closest("[data-ap-carousel]") : null;
      if (box) {
        var b = box.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        if (cx < b.left || cx > b.right) continue;
      }
      return cards[i];
    }
    return null;
  }

  function sliceProvider(arr, norm) {
    var list = Array.prototype.slice.call(arr || []);
    var cache = {};
    return {
      count: function () { return list.length; },
      get: function (i) {
        if (!(i in cache)) { try { cache[i] = list[i] ? norm(list[i]) : null; } catch (e) { cache[i] = null; } }
        return cache[i];
      }
    };
  }

  // ------------------------------------------------------------------
  // A. Artist Edition (/app/) 어댑터 — APP_FILTER(state.filtered, lang, sections) 읽기 전용
  // ------------------------------------------------------------------
  function artistAdapter() {
    var F = window.APP_FILTER;
    function sectionOf(w) {
      var sid = w.section_id, list = (F.state && F.state.sections) || [];
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (String(s.id) === String(sid) || String(s.section_id) === String(sid)) {
          return { kr: str(s.title_kr || s.labelKr || s.kr), en: str(s.title_en || s.labelEn || s.en) };
        }
      }
      return { kr: str(w.section_kr), en: str(w.section_en) };
    }
    function norm(w) {
      var origin = Number(w.section_id) === 0;
      var sec = sectionOf(w);
      var S = window.APP_STATUS_LABELS;
      var sk = !origin && S ? S.renderStatusLabel(w.status, "kr") : "";
      var se = !origin && S ? S.renderStatusLabel(w.status, "en") : "";
      return {
        code: str(w.artworkCode) || str(w.id),
        sectionKr: sec.kr, sectionEn: sec.en,
        titleKr: w.title_kr, titleEn: w.title_en,
        materialKr: w.material_kr, materialEn: w.material_en,
        sizeKr: w.size_kr || w.size, sizeEn: w.size_en || w.size,
        year: w.year,
        statusKr: sk, statusEn: se,
        noteKr: w.note_kr, noteEn: w.note_en,
        hideMeta: origin
      };
    }
    function lang() { return normLang(F.state && F.state.lang); }
    function openList(trigger) {
      var st = F.state, grid = document.getElementById("grid");
      var start = 0;
      var card = grid ? firstVisible(grid.querySelectorAll(".card[data-index]")) : null;
      if (card) start = Number(card.getAttribute("data-index")) || 0;
      return open({ provider: sliceProvider(st.filtered, norm), index: start, lang: lang(), trigger: trigger, fallbackFocus: function () { return document.querySelector(".dzcr-trigger-list"); } });
    }
    function openViewer(trigger) {
      var st = F.state;
      return open({ provider: sliceProvider(st.filtered, norm), index: st.currentIndex || 0, lang: lang(), trigger: trigger });
    }
    function ensure() {
      var m = lang();
      var grid = document.getElementById("grid");
      if (grid && grid.parentNode) {
        var bar = document.getElementById("dzcrListBar");
        if (!bar) {
          bar = el("div", "dzcr-listbar", { id: "dzcrListBar" });
          var b = makeTrigger("list");
          b.addEventListener("click", function () { openList(b); });
          bar.appendChild(b);
          grid.parentNode.insertBefore(bar, grid);
        }
        var lb = bar.firstChild;
        labelTrigger(lb, m);
        lb.disabled = !(F.state && F.state.filtered && F.state.filtered.length);
      }
      var t = document.getElementById("lbTitle");
      if (t && t.parentNode) {
        var w = document.getElementById("dzcrViewerWrap");
        if (!w) {
          w = el("div", "dzcr-viewerwrap", { id: "dzcrViewerWrap" });
          var vb = makeTrigger("work");
          vb.addEventListener("click", function (e) { e.stopPropagation(); openViewer(vb); });
          w.appendChild(vb);
          t.parentNode.insertBefore(w, t.nextSibling);
        }
        labelTrigger(w.firstChild, m);
      }
    }
    return { ensure: ensure, watch: ["grid", "heroModeLine", "lbTitle"], openList: openList, openViewer: openViewer, norm: norm };
  }

  // ------------------------------------------------------------------
  // B. ARCHIVE PRO 작품 아카이브 (/archivepro/) 어댑터 — 페이지가 노출한 읽기 전용 브리지 사용
  // ------------------------------------------------------------------
  function archiveAdapter() {
    var B = window.__AP_CAPTION_BRIDGE;
    function norm(w) {
      var origin = Number(w.section_id) === 0;
      var sec = B.section(w.section_id) || { kr: "", en: "" };
      var st = B.status(w) || { kr: "", en: "" };
      return {
        code: str(w.id),
        sectionKr: sec.kr, sectionEn: sec.en,
        titleKr: w.title_kr, titleEn: w.title_en,
        materialKr: w.material_kr, materialEn: w.material_en,
        sizeKr: w.size_kr, sizeEn: w.size_en,
        year: w.year,
        statusKr: st.kr, statusEn: st.en,
        hideMeta: origin, forceUntitled: origin
      };
    }
    function lang() { return normLang(B.lang()); }
    function indexOfItem(list, item) {
      if (!item) return -1;
      for (var i = 0; i < list.length; i++) if (list[i] === item || (list[i] && list[i].id === item.id && String(list[i].section_id) === String(item.section_id))) return i;
      return -1;
    }
    function openList(trigger) {
      var list = B.list() || [];
      var start = 0;
      var grid = document.getElementById("grid");
      var card = grid ? firstVisible(grid.querySelectorAll(".card")) : null;
      if (card) {
        var id = card.getAttribute("data-id"), sid = card.getAttribute("data-section-id");
        for (var i = 0; i < list.length; i++) if (String(list[i].id) === id && String(list[i].section_id) === sid) { start = i; break; }
      }
      return open({ provider: sliceProvider(list, norm), index: start, lang: lang(), trigger: trigger, fallbackFocus: function () { return document.querySelector(".dzcr-trigger-list"); } });
    }
    function openViewer(trigger) {
      var list = B.list() || [], cur = B.current();
      if (!cur) return false;
      var at = indexOfItem(list, cur);
      var provider = at >= 0 ? sliceProvider(list, norm) : sliceProvider([cur], norm);
      return open({ provider: provider, index: at >= 0 ? at : 0, lang: lang(), trigger: trigger });
    }
    function ensure() {
      var m = lang();
      var grid = document.getElementById("grid");
      if (grid && grid.parentNode) {
        var bar = document.getElementById("dzcrListBar");
        if (!bar) {
          bar = el("div", "dzcr-listbar", { id: "dzcrListBar" });
          var b = makeTrigger("list");
          b.addEventListener("click", function () { openList(b); });
          bar.appendChild(b);
          grid.parentNode.insertBefore(bar, grid);
        }
        var lb = bar.firstChild;
        labelTrigger(lb, m);
        var L = B.list();
        lb.disabled = !(L && L.length);
      }
      var anchor = document.getElementById("lbSection") || document.getElementById("lbTitle");
      if (anchor && anchor.parentNode) {
        var w = document.getElementById("dzcrViewerWrap");
        if (!w) {
          w = el("div", "dzcr-viewerwrap", { id: "dzcrViewerWrap" });
          var vb = makeTrigger("work");
          vb.addEventListener("click", function (e) { e.stopPropagation(); openViewer(vb); });
          w.appendChild(vb);
          anchor.parentNode.insertBefore(w, anchor.nextSibling);
        }
        labelTrigger(w.firstChild, m);
      }
    }
    return { ensure: ensure, watch: ["grid", "heroModeLine", "lbTitle"], openList: openList, openViewer: openViewer, norm: norm };
  }

  // ------------------------------------------------------------------
  // C. COSMOS (/cosmos) 어댑터 — APP_DISCOVER.getLang()/getWorkCaption(id) 읽기 전용.
  //    COSMOS 전역 언어(KR/EN)는 바꾸지 않고, 리더 안에서만 KR+EN 병기를 선택할 수 있다.
  // ------------------------------------------------------------------
  function cosmosAdapter() {
    var D = window.APP_DISCOVER;
    var root = document.getElementById("discoverRoot");
    function lang() { try { return normLang(D.getLang()); } catch (e) { return "kr"; } }
    function norm(id) {
      var c = D.getWorkCaption(id);
      if (!c) return null;
      return {
        artistKr: c.artistNameKr, artistEn: c.artistNameEn,
        titleKr: c.title_kr, titleEn: c.title_en,
        materialKr: c.material_kr, materialEn: c.material_en,
        sizeKr: c.size_kr, sizeEn: c.size_en,
        year: c.year,
        seriesKr: c.seriesKr, seriesEn: c.seriesEn
      };
    }
    // 작품 링크(작품 카드·작품 탭 캐러셀 슬라이드·대표 이미지 링크) — 화면 순서 그대로
    var WORK_SEL = ".ap-discover-work-card[data-ap-work], .ap-discover-carousel-slide[data-ap-work], .ap-discover-worktab-frame-img-link[data-ap-work]";
    function workEls(scope) { return (scope || root).querySelectorAll(WORK_SEL); }
    function cardIds(scope) {
      var seen = {}, ids = [];
      Array.prototype.forEach.call(workEls(scope), function (a) {
        var id = a.getAttribute("data-ap-work");
        if (id && !seen[id]) { seen[id] = 1; ids.push(id); }
      });
      return ids;
    }
    function openList(trigger, grid) {
      var ids = cardIds(grid);
      var start = 0;
      var card = firstVisible(workEls(grid));
      if (card) start = Math.max(0, ids.indexOf(card.getAttribute("data-ap-work")));
      return open({
        provider: sliceProvider(ids, norm), index: start, lang: lang(), trigger: trigger,
        fallbackFocus: function () { return root.querySelector(".dzcr-trigger-list") || root; }
      });
    }
    function openDetail(trigger) {
      var r = D.getRoute ? D.getRoute() : null;
      if (!r || !r.work) return false;
      return open({
        provider: sliceProvider([r.work], norm), index: 0, lang: lang(), trigger: trigger,
        fallbackFocus: function () { return root.querySelector(".dzcr-trigger-work") || root; }
      });
    }
    function ensure() {
      if (!root) return;
      var m = lang();
      // 작품 목록(작품 탭·작가별 작품·관련 작품 묶음): 작품 카드가 들어 있는 각 목록 바로 위에 버튼 1개
      var grids = [];
      Array.prototype.forEach.call(root.querySelectorAll(".ap-discover-work-card[data-ap-work], .ap-discover-worktab-frame"), function (a) {
        var g = a.closest ? a.closest(".ap-discover-grid") : null;
        if (g && grids.indexOf(g) === -1 && workEls(g).length) grids.push(g);
      });
      grids.forEach(function (g) {
        var prevEl = g.previousElementSibling;
        var bar = prevEl && prevEl.classList && prevEl.classList.contains("dzcr-listbar") ? prevEl : null;
        if (!bar) {
          bar = el("div", "dzcr-listbar dzcr-listbar-cosmos");
          var b = makeTrigger("list");
          b.addEventListener("click", function (e) { e.preventDefault(); openList(b, g); });
          bar.appendChild(b);
          g.parentNode.insertBefore(bar, g);
        }
        labelTrigger(bar.firstChild, m);
      });
      // 작품 상세: 메타 정보 바로 아래(없으면 제목 아래)
      var detail = root.querySelector(".ap-discover-work-detail");
      if (detail && !detail.querySelector(".dzcr-viewerwrap")) {
        var anchor = detail.querySelector(".ap-discover-detail-meta") || detail.querySelector(".ap-discover-detail-artist") || detail.querySelector(".ap-discover-detail-title");
        if (anchor) {
          var w = el("div", "dzcr-viewerwrap dzcr-viewerwrap-cosmos");
          var vb = makeTrigger("work");
          vb.addEventListener("click", function (e) { e.preventDefault(); openDetail(vb); });
          w.appendChild(vb);
          anchor.parentNode.insertBefore(w, anchor.nextSibling);
        }
      }
      var vw = detail && detail.querySelector(".dzcr-viewerwrap");
      if (vw) labelTrigger(vw.firstChild, m);
    }
    return { ensure: ensure, watchRoot: root, openList: openList, openDetail: openDetail, norm: norm };
  }

  // ------------------------------------------------------------------
  // 초기화
  // ------------------------------------------------------------------
  var adapter = null;
  function pickAdapter() {
    if (document.getElementById("discoverRoot") && window.APP_DISCOVER && typeof window.APP_DISCOVER.getWorkCaption === "function") return cosmosAdapter();
    if (window.__AP_CAPTION_BRIDGE && document.getElementById("grid")) return archiveAdapter();
    if (window.APP_FILTER && window.APP_FILTER.state && document.getElementById("grid")) return artistAdapter();
    return null;
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var done = false;
    var run = function () {
      if (done) return;
      done = true;
      scheduled = false;
      try { adapter && adapter.ensure(); } catch (e) { /* 리더 버튼 실패는 페이지 기능에 영향 없음 */ }
    };
    // 다음 화면 그리기 직후 1회. 화면 그리기가 멈춘 상태(백그라운드 탭·숨은 WebView)에서도 붙도록 시간 보조.
    if (window.requestAnimationFrame) window.requestAnimationFrame(run);
    setTimeout(run, 250);
  }

  function init() {
    if (adapter) return;
    adapter = pickAdapter();
    if (!adapter) return;
    document.documentElement.classList.add("dzcr-ready");
    schedule();
    if (!("MutationObserver" in window)) return;
    var mo = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var t = list[i].target;
        // 리더 자신이 만든 변화는 무시(무한 반복 방지)
        if (R.root && (t === R.root || R.root.contains(t))) continue;
        if (t && t.closest && t.closest(".dzcr-listbar, .dzcr-viewerwrap") && list[i].type !== "childList") continue;
        schedule();
        return;
      }
    });
    if (adapter.watchRoot) {
      mo.observe(adapter.watchRoot, { childList: true, subtree: true });
    } else {
      (adapter.watch || []).forEach(function (id) {
        var n = document.getElementById(id);
        if (n) mo.observe(n, id === "grid" ? { childList: true } : { childList: true, characterData: true, subtree: true });
      });
      // 언어 버튼(aria-pressed/active 변경)으로 언어가 바뀌는 화면 대비
      Array.prototype.forEach.call(document.querySelectorAll(".lang-tab, [data-lang]"), function (n) {
        mo.observe(n, { attributes: true, attributeFilter: ["class", "aria-pressed"] });
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else setTimeout(init, 0);
  window.addEventListener("load", function () { if (!adapter) init(); else schedule(); });

  window.DZ_CAPTION_READER = {
    BUILD: BUILD,
    SCALES: SCALES.slice(),
    STORE_KEY: STORE_KEY,
    open: open,
    close: close,
    isOpen: function () { return R.open; },
    refresh: schedule,
    _pure: { buildCaption: buildCaption, pickValues: pickValues, normLang: normLang, loadScale: loadScale },
    _adapter: function () { return adapter; }
  };
})();
