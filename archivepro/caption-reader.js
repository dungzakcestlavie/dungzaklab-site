/*
 * ELSOL — GOLD CAPTION READER  (caption-reader.js)
 * build 20261117-cr4 · 2026-11-17
 *   cr4: 최초 진입 레이아웃 근본 수정 — 리더 전체가 스크롤되던 구조(상단 막대 sticky)를
 *        "고정 상단 막대 + 독립 세로 스크롤 본문"으로 바꾸고, 리더 위치·크기를 실제 보이는 화면(visualViewport)에 맞춤
 *        (iOS 손가락 확대·키보드·주소창·Stage Manager로 레이아웃 뷰포트와 보이는 화면이 어긋나도 상단 조작 영역이 화면 안에 있음)
 *   cr2: 화면이 백그라운드여도 버튼이 늦게 붙지 않게 setTimeout 보조
 *   cr3: 목록(FILTER 아래) 버튼 제거 — 작품 상세 버튼만, 돋보기(+) 32/36px·터치 48px, 처음/마지막에서 멈춤(순환 없음),
 *        닫기·뒤로가기 = 마지막으로 읽은 작품의 상세 이미지로 복귀(작품 ID 기준), 설정 패널 접기·펼치기, 듀얼스크린 힌지 회피
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

  var BUILD = "20261117-cr6-p0";
  var STORE_KEY = "dz.captionReader.v1";
  var SCALES = [100, 150, 200, 300, 400];
  var DEFAULT_SCALE = 300;

  // ------------------------------------------------------------------
  // 문구(UI 전용 — 작품 데이터가 아님)
  // ------------------------------------------------------------------
  var UI = {
    kr: {
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
      empty: "표시할 작품이 없습니다.",
      settings: "글자 크기·언어",
      settingsOpen: "설정 펼치기",
      settingsClose: "설정 접기",
      firstItem: "첫 작품입니다.",
      lastItem: "마지막 작품입니다.",
      inquiry: "이메일 문의", mailApp: "메일 앱에서 작성", mailGmail: "Gmail 웹에서 작성",
      mailCopy: "문의 내용 복사", mailCopyAddress: "이메일 주소 복사", mailAddressCopied: "이메일 주소가 복사되었습니다.", mailAddress: "수신 이메일", mailCopied: "문의 내용이 복사되었습니다.", mailFailed: "복사할 수 없습니다. 메일 앱에서 작성해 주세요."
    },
    en: {
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
      empty: "No works to show.",
      settings: "Text size · Language",
      settingsOpen: "Show settings",
      settingsClose: "Hide settings",
      firstItem: "This is the first work.",
      lastItem: "This is the last work.",
      inquiry: "Email inquiry", mailApp: "Write in mail app", mailGmail: "Compose in Gmail",
      mailCopy: "Copy inquiry details", mailCopyAddress: "Copy email address", mailAddressCopied: "Email address copied.", mailAddress: "Recipient", mailCopied: "Inquiry details copied.", mailFailed: "Unable to copy. Use your mail app."
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
  // 저장 형식(같은 키 유지): { v:1, scale:300, settingsOpen:true|false } — cr1 형식({v,scale})도 그대로 읽는다.
  function loadPrefs() {
    var p = { scale: DEFAULT_SCALE, settingsOpen: true };
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && SCALES.indexOf(Number(o.scale)) !== -1) p.scale = Number(o.scale);
        if (o && typeof o.settingsOpen === "boolean") p.settingsOpen = o.settingsOpen;
      }
    } catch (e) { /* 저장소 사용 불가 — 기본값 */ }
    return p;
  }
  function loadScale() { return loadPrefs().scale; }
  function savePrefs() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, scale: R.scale, settingsOpen: R.settingsOpen })); } catch (e) { /* 무시 */ }
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
    saved: null, els: {}, settingsOpen: true, onReturn: null, pendingReturn: null, inquiry: null, inquiryInfo: null
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
    var toggle = el("button", "dzcr-btn dzcr-settings-toggle", { type: "button", "data-dzcr": "settings", "aria-controls": "dzcrSettingsBody", "aria-expanded": "true" });
    var tMark = el("span", "dzcr-chev", { "aria-hidden": "true" });
    var tText = el("span", "dzcr-settings-toggle-text");
    toggle.appendChild(tMark); toggle.appendChild(tText);
    var setBody = el("div", "dzcr-settings-body", { id: "dzcrSettingsBody" });
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
    setBody.appendChild(sizeGroup); setBody.appendChild(langGroup);
    settings.appendChild(toggle); settings.appendChild(setBody);

    var body = el("div", "dzcr-body");
    var caption = el("article", "dzcr-caption");
    var title = el("h2", "dzcr-title", { id: "dzcrTitle", tabindex: "-1" });
    var dl = el("dl", "dzcr-fields");
    var notes = el("div", "dzcr-notes");
    caption.appendChild(title); caption.appendChild(dl); caption.appendChild(notes);
    // Accessible, independently scaled mail compose panel; it never sends automatically.
    var mailSection = el("section", "dzcr-mail", { hidden: "" });
    var mailButton = el("button", "dzcr-btn dzcr-mail-trigger", { type: "button", "data-dzcr": "inquiry", "aria-expanded": "false", "aria-controls": "dzcrInquiryPanel" });
    var mailPanel = el("div", "dzcr-mail-panel", { id: "dzcrInquiryPanel", hidden: "" });
    var mailAddress = el("p", "dzcr-mail-address");
    var mailApp = el("a", "dzcr-mail-option", { target: "_self" });
    var mailGmail = el("a", "dzcr-mail-option", { target: "_blank", rel: "noopener noreferrer" });
    var mailCopyAddress = el("button", "dzcr-btn dzcr-mail-option", { type: "button", "data-dzcr": "copy-address" });
    var mailCopy = el("button", "dzcr-btn dzcr-mail-option", { type: "button", "data-dzcr": "copy-inquiry" });
    mailPanel.appendChild(mailAddress);
    mailPanel.appendChild(mailApp); mailPanel.appendChild(mailGmail); mailPanel.appendChild(mailCopyAddress); mailPanel.appendChild(mailCopy);
    mailSection.appendChild(mailButton); mailSection.appendChild(mailPanel);
    caption.appendChild(mailSection);
    body.appendChild(caption);

    var foot = el("div", "dzcr-foot");
    var prev2 = el("button", "dzcr-btn dzcr-prev", { type: "button", "data-dzcr": "prev" });
    var next2 = el("button", "dzcr-btn dzcr-next", { type: "button", "data-dzcr": "next" });
    var close2 = el("button", "dzcr-btn dzcr-close", { type: "button", "data-dzcr": "close" });
    foot.appendChild(prev2); foot.appendChild(next2); foot.appendChild(close2);

    var live = el("p", "dzcr-sr", { "aria-live": "polite", role: "status" });

    // cr4: 상단 막대는 스크롤 영역 밖(항상 보임), 설정·본문·하단 버튼은 독립 세로 스크롤 영역 안
    var scroll = el("div", "dzcr-scroll", { "data-independent-scroll": "true" });
    var inner = el("div", "dzcr-inner");
    inner.appendChild(settings); inner.appendChild(body); inner.appendChild(foot);
    scroll.appendChild(inner);
    root.appendChild(bar); root.appendChild(scroll); root.appendChild(live);
    document.body.appendChild(root);

    R.root = root;
    R.els = {
      inner: inner, scroll: scroll, bar: bar, close: [close, close2], prev: [prev, prev2], next: [next, next2], pos: pos, nav: nav, foot: foot,
      sizeLabel: sizeLabel, langLabel: langLabel, sizeBtns: sizeBtns, langBtns: langBtns,
      toggle: toggle, toggleText: tText, toggleMark: tMark, setBody: setBody,
      caption: caption, title: title, dl: dl, notes: notes, live: live,
      mailSection: mailSection, mailButton: mailButton, mailPanel: mailPanel,
      mailAddress: mailAddress, mailApp: mailApp, mailGmail: mailGmail, mailCopyAddress: mailCopyAddress, mailCopy: mailCopy
    };
    return root;
  }

  function renderChrome() {
    var m = R.mode, E = R.els, n = R.provider ? R.provider.count() : 0;
    R.root.setAttribute("aria-label", uiText("dialog", m));
    // 상단 막대는 짧은 문구·KR+EN은 두 줄로(작은 화면에서 막대가 화면을 덮지 않게), 하단은 전체 문구
    E.close.forEach(function (b, i) { putUi(b, "close", m, null, i === 0); });
    // 처음·마지막에서는 순환하지 않는다: 버튼은 그대로 보이되 aria-disabled(포커스 유지) + 흐리게 + 누르면 "첫/마지막 작품" 안내
    var atFirst = R.index <= 0, atLast = R.index >= n - 1;
    E.prev.forEach(function (b, i) { putUi(b, i === 0 ? "prevShort" : "prev", m, null, i === 0); b.removeAttribute("aria-label"); b.hidden = n < 2; b.setAttribute("aria-disabled", atFirst ? "true" : "false"); });
    E.next.forEach(function (b, i) { putUi(b, i === 0 ? "nextShort" : "next", m, null, i === 0); b.removeAttribute("aria-label"); b.hidden = n < 2; b.setAttribute("aria-disabled", atLast ? "true" : "false"); });
    // 설정 패널 접기·펼치기(상태는 저장, 접어도 값 유지)
    E.toggle.setAttribute("aria-expanded", R.settingsOpen ? "true" : "false");
    E.setBody.hidden = !R.settingsOpen;
    E.toggleMark.textContent = R.settingsOpen ? "▾" : "▸";
    E.toggleText.textContent = uiText("settings", m) + " — " + R.scale + "% · " + (R.mode === "both" ? "KR+EN" : R.mode === "en" ? "EN" : "KR");
    // 접힘/펼침은 aria-expanded로 전달(보이는 글자 = 접근 이름, WCAG 2.5.3)
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
      // 보이는 글자(KR/EN/KR+EN)를 접근 이름 앞에 그대로 두고 뜻을 덧붙인다(WCAG 2.5.3 Label in Name)
      b.setAttribute("aria-label", b.textContent.replace("✓", "").trim() + " — " + uiText(b.getAttribute("data-dzcr-aria"), m));
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
    E.mailSection.hidden = true;
    E.mailPanel.hidden = true;
    E.mailButton.setAttribute("aria-expanded", "false");
    R.inquiryInfo = null;
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
    if (typeof R.inquiry === "function" && R.provider) {
      try {
        var info = R.inquiry(R.provider.raw(R.index), R.mode);
        if (info && info.mailto && info.address) {
          R.inquiryInfo = info;
          E.mailSection.hidden = false;
          putUi(E.mailButton, "inquiry", m);
          putUi(E.mailApp, "mailApp", m);
          putUi(E.mailGmail, "mailGmail", m);
          putUi(E.mailCopy, "mailCopy", m);
          putUi(E.mailCopyAddress, "mailCopyAddress", m);
          E.mailAddress.textContent = uiText("mailAddress", m) + ": " + info.address;
          E.mailApp.href = info.mailto;
          if (info.gmail) { E.mailGmail.hidden = false; E.mailGmail.href = info.gmail; }
          else { E.mailGmail.hidden = true; E.mailGmail.removeAttribute("href"); }
        }
      } catch (_e) { R.inquiryInfo = null; E.mailSection.hidden = true; }
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

  // ---- cr4: 실제 보이는 화면(visualViewport)에 리더를 맞춘다 ----
  // position:fixed 는 "레이아웃 뷰포트" 기준이다. iOS Safari·Android Chrome에서 손가락 확대(iOS는 user-scalable=no도 무시),
  // 입력창 자동 확대, 화면 키보드, 주소창 전환 중에는 보이는 화면이 레이아웃 뷰포트의 일부만이거나 위치가 어긋나,
  // inset:0 리더의 위쪽(상단 조작 영역)이 화면 밖에 놓일 수 있다. 이 상태는 새로고침해야 풀린다(확대·스크롤 초기화).
  // 두 뷰포트가 같을 때는 CSS(inset:0)에 맡기고, 어긋날 때만 보이는 화면의 위치·크기를 그대로 적용한다(배율 강제 없음).
  var vvPending = 0;
  function clearViewport() {
    if (!R.root) return;
    var st = R.root.style;
    st.top = st.left = st.width = st.height = st.right = st.bottom = "";
    R.root.removeAttribute("data-dzcr-vv");
  }
  function syncViewport() {
    vvPending = 0;
    if (!R.open || !R.root) return;
    var vv = window.visualViewport, de = document.documentElement;
    if (!vv) { clearViewport(); return; }
    var cw = de.clientWidth || window.innerWidth, ch = de.clientHeight || window.innerHeight;
    var off = vv.offsetTop > 0.5 || vv.offsetLeft > 0.5;
    var diff = Math.abs(vv.scale - 1) > 0.01 || Math.abs(vv.width - cw) > 1 || Math.abs(vv.height - ch) > 1;
    if (!off && !diff) { clearViewport(); return; }
    var st = R.root.style;
    st.top = vv.offsetTop + "px";
    st.left = vv.offsetLeft + "px";
    st.width = vv.width + "px";
    st.height = vv.height + "px";
    st.right = "auto";
    st.bottom = "auto";
    R.root.setAttribute("data-dzcr-vv", "1");
  }
  function scheduleViewport() {
    if (!R.open || vvPending) return;
    // 화면 그리기 직전 1회로 묶는다(연속 resize/scroll 이벤트에도 레이아웃 계산 1회, 흔들림 없음)
    if (window.requestAnimationFrame) vvPending = window.requestAnimationFrame(syncViewport);
    else syncViewport();
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", scheduleViewport);
    window.visualViewport.addEventListener("scroll", scheduleViewport);
  }
  window.addEventListener("resize", scheduleViewport);
  window.addEventListener("orientationchange", scheduleViewport);
  // 백그라운드에서 돌아왔을 때(그리기가 멈춰 있던 동안의 변화 반영) — 즉시 1회
  window.addEventListener("pageshow", function () { if (R.open) syncViewport(); });
  document.addEventListener("visibilitychange", function () { if (R.open && document.visibilityState === "visible") syncViewport(); });

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
    var prefs = loadPrefs();
    R.scale = prefs.scale;
    R.settingsOpen = prefs.settingsOpen;
    R.onReturn = typeof opts.onReturn === "function" ? opts.onReturn : null;
    R.inquiry = typeof opts.inquiry === "function" ? opts.inquiry : null;
    R.returnFocus = opts.trigger || document.activeElement;
    R.returnFocusFallback = typeof opts.fallbackFocus === "function" ? opts.fallbackFocus : null;
    var wasOpen = R.open;
    render();
    if (!wasOpen) {
      lockBackground();
      R.root.hidden = false;
      R.open = true;
      syncViewport();
      try {
        var st = window.history.state;
        var next = {};
        if (st && typeof st === "object") for (var k in st) if (Object.prototype.hasOwnProperty.call(st, k)) next[k] = st[k];
        next.dzCaptionReader = 1;
        window.history.pushState(next, "", window.location.href);
        R.pushed = true;
      } catch (e) { R.pushed = false; }
    }
    R.els.scroll.scrollTop = 0;
    focusTitle();
    return true;
  }

  function focusBack() {
    var f = R.returnFocus;
    if (!f || !document.body.contains(f) || f.offsetParent === null) f = R.returnFocusFallback ? R.returnFocusFallback() : null;
    if (f && f.focus) { try { f.focus({ preventScroll: true }); } catch (e) { try { f.focus(); } catch (e2) {} } }
  }

  // 닫힌 뒤: 마지막으로 읽던 작품(R.index)의 상세 이미지로 복귀 → 포커스를 그 화면의 캡션 확대 버튼으로
  function runReturn(job) {
    if (!job) return;
    try { if (job.cb) job.cb(job.index); } catch (e) { /* 복귀 실패는 닫힘 자체에 영향 없음 */ }
    // 화면을 다시 그리는 서비스(COSMOS)는 새 상세 화면·버튼이 생길 때까지 몇 번 더(사용자가 이미 다른 곳으로 옮겼으면 건드리지 않음)
    var tries = [0, 120, 400, 900, 1600], k = 0;
    var step = function () {
      var a = document.activeElement;
      var idle = !a || a === document.body || a === document.documentElement || !document.body.contains(a);
      var onTrigger = a && a.classList && a.classList.contains("dzcr-trigger");
      if (k === 0 || (idle && !onTrigger)) focusBack();
      k++;
      if (k < tries.length) setTimeout(step, tries[k] - tries[k - 1]);
      else { R.returnFocus = null; R.returnFocusFallback = null; }
    };
    step();
  }

  function finishClose() {
    R.open = false;
    R.root.hidden = true;
    clearViewport();
    unlockBackground();
    var job = { cb: R.onReturn, index: R.index };
    R.onReturn = null;
    R.provider = null;
    R.inquiry = null;
    R.inquiryInfo = null;
    return job;
  }

  function close() {
    if (!R.open) return;
    var job = finishClose();
    if (R.pushed) {
      R.pushed = false;
      var st = window.history.state;
      if (st && st.dzCaptionReader) {
        // 우리가 넣은 기록 1개만 되돌린다. 이 뒤에 오는 popstate는 리더가 소비하고(다른 화면의 뒤로가기 처리 차단),
        // 그다음에 작품 복귀를 실행한다(COSMOS는 복귀가 새 기록을 넣으므로 순서가 중요).
        R.ignorePop = true;
        R.pendingReturn = job;
        clearTimeout(R.ignoreTimer);
        R.ignoreTimer = setTimeout(function () { R.ignorePop = false; var j = R.pendingReturn; R.pendingReturn = null; runReturn(j); }, 1500);
        try { window.history.back(); return; } catch (e) { R.ignorePop = false; R.pendingReturn = null; clearTimeout(R.ignoreTimer); }
      }
    }
    runReturn(job);
  }

  function go(delta) {
    var n = R.provider ? R.provider.count() : 0;
    if (n < 2) return;
    var to = R.index + delta;
    if (to < 0 || to > n - 1) { announce(uiText(to < 0 ? "firstItem" : "lastItem", R.mode)); return; }
    R.index = to;
    render();
    R.els.scroll.scrollTop = 0;
    focusTitle();
    announce(uiText("positionSr", R.mode, { i: R.index + 1, n: n }));
  }

  function setScale(s) {
    if (SCALES.indexOf(s) === -1) return;
    R.scale = s;
    savePrefs();
    renderChrome();
    announce(uiText("sizeNow", R.mode, { s: s }));
  }

  function toggleSettings() {
    R.settingsOpen = !R.settingsOpen;
    savePrefs();
    renderChrome();
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
    if (b.getAttribute("aria-disabled") === "true") { var a0 = b.getAttribute("data-dzcr"); announce(uiText(a0 === "prev" ? "firstItem" : "lastItem", R.mode)); return; }
    var a = b.getAttribute("data-dzcr");
    if (a === "close") close();
    else if (a === "prev") go(-1);
    else if (a === "next") go(1);
    else if (a === "scale") setScale(Number(b.getAttribute("data-dzcr-scale")));
    else if (a === "lang") setMode(b.getAttribute("data-dzcr-lang"));
    else if (a === "settings") toggleSettings();
    else if (a === "inquiry") {
      if (!R.inquiryInfo) return;
      var expand = R.els.mailPanel.hidden;
      R.els.mailPanel.hidden = !expand;
      R.els.mailButton.setAttribute("aria-expanded", expand ? "true" : "false");
      if (expand) { R.els.scroll.scrollTop = R.els.scroll.scrollHeight; }
    }
    else if (a === "copy-inquiry" || a === "copy-address") {
      if (!R.inquiryInfo) return;
      var addressOnly = a === "copy-address";
      var value = addressOnly ? R.inquiryInfo.address : R.inquiryInfo.text;
      if (!value) return;
      copyReaderText(String(value)).then(function () {
        announce(uiText(addressOnly ? "mailAddressCopied" : "mailCopied", R.mode));
      }).catch(function () { announce(uiText("mailFailed", R.mode)); });
    }
  }

  function copyReaderText(text) {
    function fallback() {
      return new Promise(function (resolve, reject) {
        var field = document.createElement("textarea");
        try {
          field.value = text; field.readOnly = true;
          field.style.cssText = "position:fixed;top:-9999px;left:0;opacity:0";
          document.body.appendChild(field); field.select();
          var ok = document.execCommand("copy");
          if (ok) resolve(); else reject(new Error("Copy unavailable"));
        } catch (e) { reject(e); }
        finally { if (field.parentNode) field.parentNode.removeChild(field); }
      });
    }
    if (navigator.clipboard && window.isSecureContext && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(fallback);
    }
    return fallback();
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
      var j = R.pendingReturn;
      R.pendingReturn = null;
      setTimeout(function () { runReturn(j); }, 0);
      return;
    }
    if (R.open) {
      // 뒤로가기(Android 뒤로 가기 버튼·브라우저 뒤로) = 리더만 닫고, 닫기 버튼과 같게 마지막 작품으로 복귀
      e.stopImmediatePropagation();
      R.pushed = false;
      var job = finishClose();
      setTimeout(function () { runReturn(job); }, 0);
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
  // 금빛 돋보기(+): 선 두께는 크기와 무관하게 2.75 CSS px(vector-effect), 크기는 CSS(폰 32px·넓은 화면 36px)
  var ICON =
    '<svg class="dzcr-icon" viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" focusable="false">' +
    '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" vector-effect="non-scaling-stroke"/>' +
    '<path d="M10 6.4v7.2M6.4 10h7.2" fill="none" stroke="currentColor" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
    '<path d="M15.1 15.1l5.6 5.6" fill="none" stroke="currentColor" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';

  function makeTrigger(kind) {
    var b = el("button", "dzcr-trigger dzcr-trigger-" + kind, { type: "button", "data-dzcr-trigger": kind });
    b.innerHTML = ICON + '<span class="dzcr-trigger-label"></span>';
    return b;
  }
  function labelTrigger(b, mode) {
    var key = "workBtn";
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

  function sliceProvider(arr, norm) {
    var list = Array.prototype.slice.call(arr || []);
    var cache = {};
    return {
      count: function () { return list.length; },
      raw: function (i) { return list[i]; },
      get: function (i) {
        if (!(i in cache)) { try { cache[i] = list[i] ? norm(list[i]) : null; } catch (e) { cache[i] = null; } }
        return cache[i];
      }
    };
  }

  // 작품 상세(뷰어) 정보 영역에 버튼 1개를 둔다(cr3: 목록 FILTER 아래 버튼은 제거).
  function ensureWorkButton(anchor, onOpen, extraClass) {
    if (!anchor || !anchor.parentNode) return null;
    var w = document.getElementById("dzcrViewerWrap");
    if (w && w.parentNode !== anchor.parentNode) { w.parentNode.removeChild(w); w = null; }
    if (!w) {
      w = el("div", "dzcr-viewerwrap" + (extraClass ? " " + extraClass : ""), { id: "dzcrViewerWrap" });
      var vb = makeTrigger("work");
      vb.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); onOpen(vb); });
      w.appendChild(vb);
      anchor.parentNode.insertBefore(w, anchor.nextSibling);
    }
    return w;
  }

  // 같은 작품인지: 배열 번호가 아니라 섹션+작품 번호(작품 식별자)로 비교
  function workKey(w) { return w ? String(w.section_id) + "::" + String(w.id) : ""; }
  function indexByKey(list, key) {
    for (var i = 0; i < (list || []).length; i++) if (workKey(list[i]) === key) return i;
    return -1;
  }

  // ------------------------------------------------------------------
  // Firebase page contract: only a VERIFIED PUBLIC representative or Artist Bio
  // address may be used. No signed-in account email and no cross-artist fallback.
  function statusPair(value) {
    var labels = { "available":["소장 가능","Available"], "collected":["소장됨","Collected"],
      "reserved":["예약 중","Reserved"], "not_for_sale":["비매품","Not for Sale"],
      "private":["비공개","Private"] };
    var pair = labels[str(value).toLowerCase()];
    return { kr: pair ? pair[0] : "", en: pair ? pair[1] : "" };
  }
  function publicInquiry(service, work, mode) {
    var bridge = window.DZ_PUBLIC_INQUIRY;
    if (!bridge || typeof bridge.resolve !== "function") return null;
    try {
      var info = bridge.resolve({ service:service, work:work, lang:normLang(mode) });
      if (!info || info.public !== true || (info.source !== "artist-bio" && info.source !== "representative-public")) return null;
      if (str(info.status).toLowerCase() !== "available") return null;
      var address = str(info.address);
      if (!/^[^\\s@<>]+@[^\\s@<>]+\\.[^\\s@<>]+$/.test(address)) return null;
      var mailto = str(info.mailto), gmail = str(info.gmail);
      if (mailto.indexOf("mailto:") !== 0 || !str(info.text)) return null;
      return { address:address, mailto:mailto, gmail:/^https:\/\/mail\.google\.com\/mail\//.test(gmail) ? gmail : "", text:str(info.text) };
    } catch (e) { return null; }
  }

  // A. Artist Edition (/app/) 어댑터 — APP_FILTER(state.filtered, lang, sections) 읽기 전용
  //    탐색 범위 = 지금 화면의 검색·섹션·정렬 결과(state.filtered)와 같은 순서
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
      var sk = !origin && str(w.status) && S ? S.renderStatusLabel(w.status, "kr") : "";
      var se = !origin && str(w.status) && S ? S.renderStatusLabel(w.status, "en") : "";
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
    function openViewer(trigger) {
      var st = F.state;
      var provider = sliceProvider(st.filtered, norm);
      return open({
        provider: provider, index: st.currentIndex || 0, lang: lang(), trigger: trigger,
        inquiry: function (work, mode) { return publicInquiry("artist", work, mode); },
        fallbackFocus: function () { return document.querySelector("#dzcrViewerWrap .dzcr-trigger"); },
        onReturn: function (i) {
          var key = workKey(provider.raw(i));
          if (!key || !st.viewerOpen) return;
          var j = indexByKey(st.filtered, key);
          if (j < 0 || j === st.currentIndex) return;
          st.currentIndex = j; st.scale = 1; st.panX = 0; st.panY = 0;
          if (typeof window.APP_RENDER === "function") window.APP_RENDER();
          else if (window.APP_VIEWER && window.APP_VIEWER.renderViewer) window.APP_VIEWER.renderViewer();
        }
      });
    }
    function ensure() {
      var w = ensureWorkButton(document.getElementById("lbTitle"), openViewer);
      if (w) labelTrigger(w.firstChild, lang());
    }
    return { ensure: ensure, watch: ["heroModeLine", "lbTitle"], openViewer: openViewer, norm: norm };
  }

  // ------------------------------------------------------------------
  // B. ARCHIVE PRO 작품 아카이브 (/archivepro/) 어댑터 — 페이지가 노출한 읽기 전용 브리지 + 뷰어 표시(show)
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
    function openViewer(trigger) {
      var list = B.list() || [], cur = B.current();
      if (!cur) return false;
      var at = list.indexOf(cur);
      if (at < 0) at = indexByKey(list, workKey(cur));
      var provider = at >= 0 ? sliceProvider(list, norm) : sliceProvider([cur], norm);
      return open({
        provider: provider, index: at >= 0 ? at : 0, lang: lang(), trigger: trigger,
        inquiry: function (work, mode) { return typeof B.inquiry === "function" ? B.inquiry(work, mode) : null; },
        fallbackFocus: function () { return document.querySelector("#dzcrViewerWrap .dzcr-trigger"); },
        onReturn: function (i) {
          var item = provider.raw(i), now = B.current();
          if (!item || !now || workKey(item) === workKey(now)) return;
          if (typeof B.show === "function") B.show(item);
        }
      });
    }
    function ensure() {
      var w = ensureWorkButton(document.getElementById("lbSection") || document.getElementById("lbTitle"), openViewer);
      if (w) labelTrigger(w.firstChild, lang());
    }
    return { ensure: ensure, watch: ["heroModeLine", "lbTitle"], openViewer: openViewer, norm: norm };
  }

  // ------------------------------------------------------------------
  // C. COSMOS (/cosmos) 어댑터 — APP_DISCOVER.getLang()/getWorkCaption(id)/getWorkSequence(id) 읽기 전용.
  //    탐색 범위 = 작품 상세의 기존 이전·다음(‹ ›)과 같은 목록·순서. COSMOS 전역 언어(KR/EN)는 바꾸지 않는다.
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
        seriesKr: c.seriesKr, seriesEn: c.seriesEn,
        code: str(c.workId) || str(id),
        statusKr: statusPair(c.status).kr, statusEn: statusPair(c.status).en
      };
    }
    function openDetail(trigger) {
      var r = D.getRoute ? D.getRoute() : null;
      if (!r || !r.work) return false;
      var seq = typeof D.getWorkSequence === "function" ? D.getWorkSequence(r.work) : null;
      var ids = seq && seq.ids && seq.ids.length ? seq.ids : [r.work];
      var at = seq && seq.ids && seq.ids.length ? seq.index : 0;
      var provider = sliceProvider(ids, norm);
      return open({
        provider: provider, index: at, lang: lang(), trigger: trigger,
        inquiry: function (id, mode) { return publicInquiry("cosmos", id, mode); },
        fallbackFocus: function () { return root.querySelector(".dzcr-trigger-work") || root; },
        onReturn: function (i) {
          var id = provider.raw(i), now = D.getRoute ? D.getRoute() : null;
          if (!id || !now || now.work === id) return;
          D.navigate(Object.assign({}, now, { work: id }));
        }
      });
    }
    function ensure() {
      if (!root) return;
      var detail = root.querySelector(".ap-discover-work-detail");
      if (!detail) return;
      var anchor = detail.querySelector(".ap-discover-detail-meta") || detail.querySelector(".ap-discover-detail-artist") || detail.querySelector(".ap-discover-detail-title");
      var w = ensureWorkButton(anchor, openDetail, "dzcr-viewerwrap-cosmos");
      if (w) labelTrigger(w.firstChild, lang());
    }
    return { ensure: ensure, watchRoot: root, openDetail: openDetail, norm: norm };
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
        if (t && t.closest && t.closest(".dzcr-viewerwrap") && list[i].type !== "childList") continue;
        schedule();
        return;
      }
    });
    if (adapter.watchRoot) {
      mo.observe(adapter.watchRoot, { childList: true, subtree: true });
    } else {
      (adapter.watch || []).forEach(function (id) {
        var n = document.getElementById(id);
        if (n) mo.observe(n, { childList: true, characterData: true, subtree: true });
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
