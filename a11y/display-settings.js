/* display-settings.js — ELSOL · 2026-11-22 (a11y1 · LAB 공용판 lab1)
   ARCHIVE PRO — Artist Edition 전역 「보기 설정 / Display settings」 (저시력자 접근성 공통 기반)
   LAB(dungzaklab.art) 공용판: 앱과 같은 엔진·같은 저장 키. 추가로 LAB 헤더(.lang-global)·문서 헤더(.langs) 진입점,
   LAB KR/EN 언어 인식, LAB 슬라이드 메뉴(#menu) 대화상자 보강(역할·Tab 순환·확대 시 헤더 아래 전체 폭)을 한다.

   - 글자 크기 100·150·200·300·400%, 화면 대비 기본·고대비, 설정 초기화.
   - 「문의 및 지원」(dungzaklab.art/support/)과 같은 저장 키·형식을 공유한다
     → 웹(같은 출처 dungzaklab.art)에서는 어느 화면에서 바꿔도 모든 화면에 적용된다.
     저장 형식: dz.support.a11y.v1 = { v:1, scale:100|150|200|300|400, contrast:true|false }
   - 기존 CSS·JS 파일은 한 줄도 바꾸지 않는다. 화면에 이미 적용된 스타일 규칙(CSSOM)을 읽어
     "확대 전용 덮어쓰기 규칙"을 만든다:
       · px/rem/vw/clamp 글자 크기 → calc(원래 값 × 배율)  (em·% 는 부모를 따라 자동 확대되므로 그대로)
       · 확대 중에만: 줄바꿈 허용(nowrap 해제), 말줄임 해제, 글자 상자의 고정 높이 → 최소 높이,
         px max-height 비례 확대(접힘 0은 유지), flex 줄바꿈, 좁은 화면 1열 전환
       · 고대비: 검정 바탕·흰 글자·밝은 금색(ARCHIVE PRO 검정·금빛 유지)
     100%·기본 대비에서는 덮어쓰기 규칙이 하나도 적용되지 않는다(Golden Baseline 그대로).
   - transform: scale()·CSS zoom 으로 화면을 통째로 키우지 않는다(실제 레이아웃 재배치).
   - 제외: Portfolio PDF 페이지(.ap-pf-) — PDF 결과물 보존, 캡션 리더(.dzcr-) — 자체 100~400% 확대가 있음.
   - 인증·권한·작품 데이터·네트워크를 건드리지 않는다. localStorage 키 1개만 읽고 쓴다.
*/
(function () {
  'use strict';
  if (window.APP_DISPLAY_SETTINGS) return;

  var KEY = 'dz.support.a11y.v1';
  var SCALES = [100, 150, 200, 300, 400];
  var root = document.documentElement;
  var state = { scale: 100, contrast: false };

  // ------------------------------------------------------------------ 저장·적용
  function load() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || '{}');
      state.scale = o && SCALES.indexOf(Number(o.scale)) !== -1 ? Number(o.scale) : 100;
      state.contrast = !!(o && o.contrast === true);
    } catch (e) { state.scale = 100; state.contrast = false; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, scale: state.scale, contrast: state.contrast })); } catch (e) {}
  }
  function effClass() {
    // 확대 후 "실제로 쓸 수 있는 폭" = 화면 폭 ÷ 배율. 좁으면 1열, 중간이면 최대 2열.
    var s = state.scale / 100;
    var w = (window.visualViewport && window.visualViewport.width) || window.innerWidth || root.clientWidth || 1024;
    var ew = w / s;
    // 560 미만 = 1열(1920px 화면 400%의 실효 폭 480px도 1열 — 여러 열이면 「SEARCH」 같은 단어가 중간에서 잘림)
    root.classList.toggle('dz-ew1', s > 1 && ew < 560);
    root.classList.toggle('dz-ew2', s > 1 && ew >= 560 && ew < 820);
  }
  function apply() {
    var s = state.scale / 100;
    root.style.setProperty('--dz-s', String(s));
    root.style.setProperty('--dz-sb', String(Math.round((1 + (s - 1) * 0.6) * 100) / 100));
    root.setAttribute('data-dz-scale', String(state.scale));
    root.classList.toggle('dz-z', state.scale > 100);
    root.classList.toggle('dz-hc', state.contrast);
    effClass();
    if (state.scale > 100 || state.contrast) { Gen.ensure(); Gen.tracks(); }
    syncUi();
    if (typeof laterPlace === 'function') laterPlace();
    if (typeof LabMenu !== 'undefined' && LabMenu) setTimeout(LabMenu.hdr, 60);
    if (typeof WordFit !== 'undefined' && document.body) WordFit.later(120);
  }
  load();


  // ------------------------------------------------------------------ 단어 맞춤(제목·메뉴·버튼 같은 짧은 글자)
  // 크게 키운 짧은 이름이 화면 폭보다 길어 단어 중간에서 끊기면, 그 요소만 단어가 한 줄에 들어갈 만큼 줄인다.
  // 원래 크기의 200% 아래로는 줄이지 않는다(그보다 작아져야 하면 끊김을 허용). 본문 문단은 건드리지 않는다.
  var WordFit = (function () {
    var SEL = 'h1,h2,h3,h4,h5,h6,a,button,label,legend,summary,th,dt,[role=button],[role=link],[role=tab],[class*=title],[class*=logo],[class*=kicker],[class*=label],[class*=eyebrow],[class*=sub],[class*=menu],[class*=link],[class*=brand],[class*=heading],[class*=role],[class*=tag],[class*=chip],[class*=entry]';
    var WORD = /[A-Za-z0-9À-ɏ가-힣.'’_]{2,}/g; // 붙임표(-)에서 줄이 바뀌는 것은 허용
    var t = 0;
    function short(e) {
      var c = e.closest(SEL); if (!c || c.closest('.ap-pf-page, #dzDisplayDialog')) return false;
      return (c.textContent || '').replace(/\s+/g, ' ').trim().length <= 90;
    }
    function avail(e) {
      var b = e;
      while (b.parentElement && /^inline/.test(getComputedStyle(b).display)) b = b.parentElement;
      var cs = getComputedStyle(b);
      return b.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    }
    function pass(sc) {
      var need = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false), n, seen = [];
      while ((n = w.nextNode())) {
        var p = n.parentElement; if (!p || seen.indexOf(p) !== -1 || !/\S/.test(n.nodeValue)) continue;
        if (p.closest('script, style, [hidden], [aria-hidden="true"]:not(.dzds-entry-text)') || !short(p)) continue;
        var txt = n.nodeValue, m, worst = 1; WORD.lastIndex = 0;
        while ((m = WORD.exec(txt))) {
          var r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
          var rs = r.getClientRects(), lines = {}, k, cnt = 0, wid = 0;
          var out = false, vw = document.documentElement.clientWidth;
          for (k = 0; k < rs.length; k++) { if (rs[k].width < 0.5) continue; wid += rs[k].width; if (rs[k].left < -1 || rs[k].right > vw + 1) out = true; var key = Math.round(rs[k].top / 4); if (!lines[key]) { lines[key] = 1; cnt++; } }
          if (out && cnt === 1) cnt = 2; // 줄바꿈 금지(keep-all) 때문에 화면 밖으로 삐져나간 단어도 같은 방식으로 맞춘다
          if (cnt > 1) { var a = avail(p); worst = Math.min(worst, 0.92, a > 20 ? (a * 0.96) / wid : 1); } // 폭 계산이 어긋나는 배치(flex 안 글자 등)는 한 번에 8%씩 더 줄인다
        }
        if (worst < 1) { seen.push(p); need.push([p, worst]); }
      }
      need.forEach(function (x) {
        var e = x[0], cur = parseFloat(getComputedStyle(e).fontSize) || 16;
        var base = parseFloat(e.getAttribute('data-dz-fit')) || cur;
        var fl = base / sc * Math.min(sc, 2);
        var nv = Math.max(fl, Math.floor(cur * x[1] * 10) / 10);
        if (nv < cur - 0.3) { if (!e.hasAttribute('data-dz-fit')) e.setAttribute('data-dz-fit', String(cur)); e.style.setProperty('font-size', nv + 'px', 'important'); }
      });
      return need.length;
    }
    function run() {
      t = 0;
      var old = document.querySelectorAll('[data-dz-fit]');
      for (var i = 0; i < old.length; i++) { old[i].style.removeProperty('font-size'); old[i].removeAttribute('data-dz-fit'); }
      if (!root.classList.contains('dz-z')) return;
      var sc = state.scale / 100;
      for (var j = 0; j < 6; j++) if (!pass(sc)) break;
    }
    function later(ms) { if (t) clearTimeout(t); t = setTimeout(run, ms || 180); }
    var mo = null;
    function watch() {
      if (mo || !window.MutationObserver) return;
      mo = new MutationObserver(function (list) {
        if (!root.classList.contains('dz-z') && !document.querySelector('[data-dz-fit]')) return;
        for (var i = 0; i < list.length; i++) { var tg = list[i].target; if (tg.nodeType === 1 && (tg.id === 'dzLive' || tg.closest && tg.closest('#dzDisplayDialog'))) continue; later(220); return; }
      });
      mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] });
      window.addEventListener('resize', function () { later(200); });
    }
    return { later: later, watch: watch };
  })();

  // ------------------------------------------------------------------ 확대·고대비 규칙 생성기
  var Gen = (function () {
    var styleEl = null, started = false, done = typeof WeakSet === 'function' ? new WeakSet() : null, doneList = [];
    var SKIP_SEL = /\.ap-pf-page|\.dzcr-|#dzCaptionReader|\.dzds-|#dzDisplay/;
    var SKIP_PF_ALL = /\.ap-pf-/; // :not() 복합 선택자를 지원하지 않는 구형 엔진에서만 PDF 관련 규칙 전체를 제외
    var ABS = /(\d|\))(px|rem|vw|vh|vmin|vmax|pt)\b|clamp\(|min\(|max\(/i;

    function seen(sheet) {
      if (done) { if (done.has(sheet)) return true; done.add(sheet); return false; }
      if (doneList.indexOf(sheet) !== -1) return true; doneList.push(sheet); return false;
    }
    // 선택자 목록을 최상위 쉼표로 나눈다(:is(a,b) 등 괄호 안 쉼표는 유지).
    function splitSel(s) {
      var out = [], depth = 0, cur = '', q = null;
      for (var i = 0; i < s.length; i++) {
        var c = s.charAt(i);
        if (q) { cur += c; if (c === q && s.charAt(i - 1) !== '\\') q = null; continue; }
        if (c === '"' || c === "'") { q = c; cur += c; continue; }
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
        cur += c;
      }
      if (cur.trim()) out.push(cur.trim());
      return out;
    }
    // html/:root 로 시작하면 그 자리에 조건을 붙이고, 아니면 앞에 붙인다. :where()로 우선순위는 원래 규칙과 같다.
    // 끝(대상 요소)에는 「Portfolio PDF 페이지와 그 안은 제외」 조건을 붙인다 → PDF 결과물이 화면 설정과 무관하게 같다.
    var NOT_PDF = '';
    try { if (window.CSS && CSS.supports && CSS.supports('selector(:not(.a, .a *))')) NOT_PDF = ':where(:not(.ap-pf-page, .ap-pf-page *))'; } catch (e) {}
    var PSEUDO_END = /((?:::?(?:before|after|first-line|first-letter|marker|placeholder|selection|backdrop|file-selector-button|-webkit-[a-z-]+|-moz-[a-z-]+)(?:\([^)]*\))?)+)$/i;
    function scope(sel, cond) {
      return splitSel(sel).map(function (one) {
        if (NOT_PDF) {
          var pm = one.match(PSEUDO_END);
          one = pm ? one.slice(0, one.length - pm[1].length) + NOT_PDF + pm[1] : one + NOT_PDF;
        }
        var m = one.match(/^(html|:root)(?=[.#:\[\s>~+]|$)/i);
        if (m) return m[1] + ':where(' + cond + ')' + one.slice(m[1].length);
        return ':where(html' + cond + ') ' + one;
      }).join(', ');
    }
    function px(v) { var m = /^(-?\d*\.?\d+)px$/.exec(v); return m ? parseFloat(m[1]) : null; }

    // ---- 색 계산(고대비)
    var probe = null;
    function rgba(v) {
      if (!v || /var\(|currentcolor|inherit|initial|unset|transparent|gradient|url\(/i.test(v)) return null;
      if (!probe) { probe = document.createElement('span'); }
      probe.style.color = '';
      probe.style.color = v;
      if (!probe.style.color) return null;
      var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?/i.exec(cssToRgb(v));
      if (!m) return null;
      var a = m[4] == null ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
      return { r: +m[1], g: +m[2], b: +m[3], a: a };
    }
    var cvs = null;
    function cssToRgb(v) {
      if (/^rgba?\(/i.test(v)) return v;
      try {
        if (!cvs) cvs = document.createElement('canvas').getContext('2d');
        cvs.fillStyle = '#000'; cvs.fillStyle = v;
        var f = cvs.fillStyle;
        if (/^#/.test(f)) { var n = parseInt(f.slice(1), 16); return 'rgb(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ')'; }
        return f;
      } catch (e) { return ''; }
    }
    function lum(c) {
      function ch(x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
      return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
    }
    function isGold(c) { return c.r > 150 && c.r >= c.g && c.g > c.b + 25 && (c.r - c.b) > 50; }
    function isRed(c) { return c.r > 180 && c.g < c.r - 50 && c.b < c.r - 50; }
    var HC_GOLD = '#FFD75E', HC_TEXT = '#FFFFFF';
    function hcText(v) {
      var c = rgba(v); if (!c || c.a === 0) return null;
      var L = lum(c);
      if (L < 0.12 && c.a > 0.5) return '#000000';           // 금색 버튼 위 어두운 글자 → 검정
      if (isRed(c)) return '#FFB4B4';
      if ((L + 0.05) / 0.05 >= 12 && c.a >= 0.95 && !isGold(c)) return null; // 이미 충분히 밝은 흰 글자
      return isGold(c) ? HC_GOLD : HC_TEXT;
    }
    function hcBg(v) {
      var c = rgba(v); if (!c || c.a < 0.35) return null;      // 옅은 금빛 틴트(선택 표시)는 유지
      var L = lum(c);
      if (L < 0.08) return '#000000';
      if (isGold(c)) return c.a >= 0.6 ? HC_GOLD : null;
      if (L > 0.6 && c.a >= 0.6) return '#FFFFFF';
      return null;
    }
    function hcBorder(v) {
      var c = rgba(v); if (!c || c.a === 0) return null;
      if (isGold(c)) return HC_GOLD;
      if (lum(c) > 0.4) return 'rgba(255,255,255,.9)';
      return null;
    }
    function darkGradient(v) {
      if (!/gradient\(/i.test(v) || /url\(/i.test(v)) return false;
      var cols = v.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/ig) || [];
      if (!cols.length) return false;
      for (var i = 0; i < cols.length; i++) { var c = rgba(cols[i]); if (c && c.a > 0.3 && lum(c) > 0.1) return false; }
      return true;
    }

    function ruleText(rule) {
      var st = rule.style, sel = rule.selectorText || '';
      if (!sel || SKIP_SEL.test(sel) || (!NOT_PDF && SKIP_PF_ALL.test(sel)) || /::?-webkit-scrollbar|::?selection|::?placeholder/i.test(sel)) return '';
      var Z = [], N = [], H = [], imp;
      function P(n) { return st.getPropertyValue(n).trim(); }
      function I(n) { return st.getPropertyPriority(n) ? ' !important' : ''; }

      // ---- 확대
      var fs = P('font-size'), lh = P('line-height');
      var textRule = !!fs || /px$/.test(lh);
      if (fs && ABS.test(fs) && !/var\(--dz-s/.test(fs)) {
        // 22px 이상 큰 글자(제목)와 clamp/vw(대부분 제목)는 완만하게(400%일 때 2.8배) — 본문(16px×4=64px)보다 작아지지 않는다
        var fv = px(fs), big = (fv && fv >= 22) || (!fv && /clamp\(|vw|vmin|vmax/i.test(fs));
        Z.push('font-size:calc(' + fs + ' * var(' + (big ? '--dz-sb' : '--dz-s') + '))' + I('font-size'));
      }
      if (/px$/.test(lh)) {
        var lhv = px(lh), fsv = px(fs);
        var r = lhv && fsv ? lhv / fsv : 0;
        Z.push('line-height:' + (r && r <= 1.6 ? Math.max(r, 1.2).toFixed(3) : '1.35') + I('line-height'));
      } else if (/^(0?\.\d+|1(\.[01]\d*)?)$/.test(lh)) {
        // 줄 간격 1.0~1.1(한 줄 전제)은 확대되어 두 줄이 되면 윗줄·아랫줄 글자가 겹친다(예: 섹션/SECTION) → 1.2
        Z.push('line-height:1.2' + I('line-height'));
      }
      if (textRule) {
        var h = P('height'), hv = px(h);
        if (hv && hv > 0) { Z.push('height:auto' + I('height')); if (!P('min-height')) Z.push('min-height:' + h + I('height')); }
        if (/ellipsis/.test(P('text-overflow'))) { Z.push('text-overflow:clip' + I('text-overflow')); Z.push('overflow:visible' + I('text-overflow')); }
        if (P('-webkit-line-clamp')) Z.push('-webkit-line-clamp:unset' + I('-webkit-line-clamp'));
        var br = px(P('border-top-left-radius'));
        if (br && br >= 40) Z.push('border-radius:16px' + I('border-top-left-radius'));
      }
      var scroller = /(auto|scroll)/.test(P('overflow-x') + P('overflow')) || !!P('scroll-snap-type');
      var ws = P('white-space');
      if (/^(nowrap|pre)$/.test(ws) && !scroller) {
        Z.push('white-space:' + (ws === 'pre' ? 'pre-wrap' : 'normal') + I('white-space'));
        // 한 줄 전용으로 만든 버튼은 max-width:none인 경우가 많다 → 화면 폭을 넘지 않게
        var mw = P('max-width');
        if (!mw || mw === 'none') Z.push('max-width:100%' + (mw ? I('max-width') : I('white-space')));
      }
      var mh = P('max-height'), mhv = px(mh);
      if (mhv && mhv > 0) Z.push('max-height:calc(' + mh + ' * var(--dz-s))' + I('max-height'));
      var disp = P('display');
      if (/^(inline-)?flex$/.test(disp) && !/^wrap/.test(P('flex-wrap')) && !/column/.test(P('flex-direction')) &&
          !/(auto|scroll)/.test(P('overflow-x') + P('overflow')) && !P('scroll-snap-type')) {
        Z.push('flex-wrap:wrap' + I('flex-wrap'));
      }
      // 좁은 실효 폭(화면 폭 ÷ 배율 < 480px): 여러 열 격자 → 1열
      if (P('grid-template-columns') && P('grid-template-columns') !== 'none') N.push('grid-template-columns:minmax(0,1fr)' + I('grid-template-columns'));
      if (P('grid-column') && P('grid-column') !== 'auto') N.push('grid-column:1 / -1' + I('grid-column'));

      // ---- 고대비
      var col = P('color'), x;
      if (col && (x = hcText(col))) H.push('color:' + x + I('color'));
      var bgc = P('background-color');
      if (bgc && (x = hcBg(bgc))) H.push('background-color:' + x + I('background-color'));
      var bgi = P('background-image');
      if (bgi && darkGradient(bgi)) H.push('background-image:none' + I('background-image'));
      ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color'].forEach(function (n) {
        var v = P(n); if (v && (x = hcBorder(v))) H.push(n + ':' + x + I(n));
      });
      var op = parseFloat(P('opacity'));
      if (op > 0.6 && op < 1 && (col || fs)) H.push('opacity:1' + I('opacity'));
      if (P('text-shadow') && P('text-shadow') !== 'none') H.push('text-shadow:none' + I('text-shadow'));

      var out = '';
      if (Z.length) out += scope(sel, '.dz-z') + '{' + Z.join(';') + '}\n';
      if (N.length) out += scope(sel, '.dz-z.dz-ew1') + '{' + N.join(';') + '}\n';
      if (H.length) out += scope(sel, '.dz-hc') + '{' + H.join(';') + '}\n';
      return out;
    }

    function walk(rules, acc) {
      for (var i = 0; i < rules.length; i++) {
        var r = rules[i];
        try {
          if (r.type === 1) acc.push(ruleText(r));
          else if (r.type === 4) { // @media
            var m = r.media && r.media.mediaText || '';
            if (/^\s*print\s*$/i.test(m)) continue;
            var inner = []; walk(r.cssRules, inner);
            var t = inner.join('');
            if (t) acc.push('@media ' + m + '{\n' + t + '}\n');
          } else if (r.type === 12) { // @supports
            var inner2 = []; walk(r.cssRules, inner2);
            var t2 = inner2.join('');
            if (t2) acc.push('@supports ' + r.conditionText + '{\n' + t2 + '}\n');
          }
        } catch (e) { /* 개별 규칙 오류는 무시 */ }
      }
    }
    function processSheet(sheet) {
      if (!sheet || seen(sheet)) return '';
      var node = sheet.ownerNode;
      if (node && (node.id === 'dz-a11y-gen' || node.id === 'dz-a11y-css' || node.getAttribute && node.getAttribute('data-dz-skip') != null)) return '';
      if (node && node.href && /display-settings\.css/.test(node.href)) return '';
      var rules;
      try { rules = sheet.cssRules; } catch (e) { return ''; } // 다른 출처 스타일은 읽을 수 없음 → 건너뜀
      if (!rules) return '';
      var acc = []; walk(rules, acc);
      return acc.join('');
    }
    function scan() {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'dz-a11y-gen';
        styleEl.setAttribute('data-dz-skip', '');
      }
      var add = '';
      var sheets = document.styleSheets;
      for (var i = 0; i < sheets.length; i++) add += processSheet(sheets[i]);
      if (add) styleEl.appendChild(document.createTextNode(add));
      // 생성 규칙은 항상 문서 끝에 둔다(같은 우선순위면 원래 규칙보다 뒤에 와야 적용됨)
      var host = document.head || root;
      if (styleEl.parentNode !== host || host.lastElementChild !== styleEl) host.appendChild(styleEl);
    }
    // 가로로 넘기는 영역(overflow-x: auto/scroll 인 flex 줄)은 줄바꿈하지 않는다 → data-dz-track 표시
    function markTracks() {
      if (!root.classList.contains('dz-z') || !document.body) return;
      var all = document.body.getElementsByTagName('*');
      for (var i = 0; i < all.length; i++) {
        var e = all[i];
        if (e.hasAttribute('data-dz-track')) continue;
        var c = getComputedStyle(e);
        if (/flex/.test(c.display) && /(auto|scroll)/.test(c.overflowX) && c.flexDirection.indexOf('column') === -1) e.setAttribute('data-dz-track', '');
      }
    }
    // 고정 높이 상자에 글자가 잘리면(자기 자신 또는 overflow hidden 조상) 그 상자만 높이를 풀어 준다 → data-dz-grow
    function ownText(e) { for (var n = e.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.textContent.trim()) return true; return false; }
    function growFix() {
      if (!root.classList.contains('dz-z') || !document.body) return;
      var all = document.body.getElementsByTagName('*'), vh = window.innerHeight || 800;
      for (var i = 0; i < all.length; i++) {
        var e = all[i];
        if (!ownText(e) || e.closest('.dzcr-root, .ap-pf-page, [data-dz-skip], .dzds-sr, .visually-hidden')) continue;
        var r = e.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || r.bottom < -vh || r.top > vh * 4) continue; // 화면 근처만(무한 스크롤 목록 비용 제한)
        var c = getComputedStyle(e);
        if (/(hidden|clip)/.test(c.overflowX + c.overflowY) && (e.scrollHeight > e.clientHeight + 4 || e.scrollWidth > e.clientWidth + 4)) { e.setAttribute('data-dz-grow', ''); continue; }
        // 상자보다 글자가 커서 밖으로 넘친 경우(overflow visible — 아래 요소와 겹침)
        if (c.display !== 'inline' && e.clientHeight > 0 && e.scrollHeight > e.clientHeight + 4 && !/(auto|scroll)/.test(c.overflowY)) { e.setAttribute('data-dz-grow', ''); continue; }
        for (var p = e.parentElement, k = 0; p && p !== document.body && k < 6; p = p.parentElement, k++) {
          var pc = getComputedStyle(p);
          if (/(auto|scroll)/.test(pc.overflowX + pc.overflowY)) break;
          if (/(hidden|clip)/.test(pc.overflowX + pc.overflowY)) {
            var pr = p.getBoundingClientRect();
            if (pr.height > 2 && (r.bottom > pr.bottom + 3 || r.right > pr.right + 3)) p.setAttribute('data-dz-grow', '');
            break;
          }
        }
      }
    }
    // 확대 중 입력칸 안내 문구(placeholder)가 칸 너비를 넘으면 같은 문구를 칸 위에 보이는 글자로 표시한다
    // (입력칸은 한 줄이라 안내 문구가 잘린다). 화면 읽기 도구는 입력칸 자체 이름을 읽으므로 aria-hidden.
    var meas = null;
    function phLabels() {
      var ins = document.querySelectorAll('input[placeholder]:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea[placeholder]');
      for (var i = 0; i < ins.length; i++) {
        var inp = ins[i], ph = inp.getAttribute('placeholder') || '', prev = inp.previousElementSibling;
        var lab = prev && prev.classList && prev.classList.contains('dzds-ph') ? prev : null;
        if (inp.closest('.ap-pf-page, .dzcr-root, .dzds-panel') || !ph.trim()) { if (lab) lab.remove(); continue; }
        // Archive Pro already has a visible <label> above its search field.
        // Do not duplicate a long bilingual placeholder inside the search grid.
        if (inp.closest('.archive-search') && inp.id && document.querySelector('label[for="' + inp.id + '"]')) {
          if (lab) lab.remove();
          continue;
        }
        var r = inp.getBoundingClientRect(); if (r.width < 2) continue;
        var c = getComputedStyle(inp);
        if (!meas) meas = document.createElement('canvas').getContext('2d');
        meas.font = c.fontWeight + ' ' + c.fontSize + ' ' + c.fontFamily;
        var avail = inp.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight);
        var need = inp.tagName === 'TEXTAREA' ? 0 : meas.measureText(ph).width;
        if (need > avail + 1) {
          if (!lab) { lab = document.createElement('span'); lab.className = 'dzds-ph'; lab.setAttribute('aria-hidden', 'true'); inp.parentNode.insertBefore(lab, inp); }
          if (lab.textContent !== ph) lab.textContent = ph;
        } else if (lab) lab.remove();
      }
    }
    // 확대 중 선택칸(select)은 한 줄이라 고른 항목 이름이 길면 잘린다 → 같은 이름을 칸 바로 위에 보이는 글자로 표시(화면 읽기 도구는 선택칸 값을 읽으므로 aria-hidden)
    function selLabels() {
      var ss = document.querySelectorAll('select');
      for (var i = 0; i < ss.length; i++) {
        var sl = ss[i], prev = sl.previousElementSibling;
        var lab = prev && prev.classList && prev.classList.contains('dzds-sel') ? prev : null;
        var o = sl.options && sl.selectedIndex >= 0 ? sl.options[sl.selectedIndex] : null, txt = o ? (o.text || '').trim() : '';
        if (!root.classList.contains('dz-z') || !txt || !sl.getClientRects().length || sl.closest('.ap-pf-page, .dzcr-root, .dzds-panel')) { if (lab) lab.remove(); continue; }
        var c = getComputedStyle(sl);
        if (!meas) meas = document.createElement('canvas').getContext('2d');
        meas.font = c.fontWeight + ' ' + c.fontSize + ' ' + c.fontFamily;
        var avail = sl.clientWidth - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight);
        if (meas.measureText(txt).width > avail + 1) {
          if (!lab) { lab = document.createElement('span'); lab.className = 'dzds-sel'; lab.setAttribute('aria-hidden', 'true'); sl.parentNode.insertBefore(lab, sl); }
          if (lab.textContent !== txt) lab.textContent = txt;
        } else if (lab) lab.remove();
      }
    }
    var growT = 0;
    function laterGrow() { if (growT) clearTimeout(growT); growT = setTimeout(function () { growT = 0; growFix(); if (root.classList.contains('dz-z')) phLabels(); selLabels(); }, 500); }
    document.addEventListener('change', function (e) { if (e.target && e.target.tagName === 'SELECT') laterGrow(); }, true);
    var pending = 0, trackT = 0;
    function later() {
      if (pending) return;
      pending = setTimeout(function () { pending = 0; scan(); }, 30);
    }
    function laterTracks() {
      if (trackT) return;
      trackT = setTimeout(function () { trackT = 0; markTracks(); }, 400);
      laterGrow();
    }
    function ensure() {
      if (started) { later(); return; }
      started = true;
      scan();
      document.addEventListener('DOMContentLoaded', function () { scan(); laterTracks(); });
      window.addEventListener('load', function () { scan(); laterTracks(); });
      // 지연 로드되는 CSS(lazy-modules, preload→stylesheet 전환, 모듈이 넣는 <style>)도 따라간다
      try {
        new MutationObserver(function (list) {
          for (var i = 0; i < list.length; i++) {
            var a = list[i].addedNodes;
            for (var j = 0; j < a.length; j++) {
              var n = a[j];
              if (n.nodeType !== 1 || n.id === 'dz-a11y-gen') continue;
              if (n.tagName === 'STYLE' || (n.tagName === 'LINK' && /stylesheet|preload/i.test(n.rel || ''))) {
                later();
                if (n.tagName === 'LINK') n.addEventListener('load', later);
              }
            }
            if (list[i].type === 'attributes') later(); // preload → rel=stylesheet
            if (list[i].addedNodes.length) laterTracks();
          }
        }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['rel'] });
      } catch (e) {}
    }
    return { ensure: ensure, rescan: later, tracks: laterTracks, grow: laterGrow };
  })();
  apply(); // <head>에서 실행되면 첫 화면부터 설정이 적용된다(깜빡임 최소화)

  // ------------------------------------------------------------------ 문구
  var T = {
    title: { kr: '보기 설정', en: 'Display settings' },
    entry: { kr: '보기 설정', en: 'Display settings' },
    size: { kr: '글자 크기', en: 'Text size' },
    contrast: { kr: '화면 대비', en: 'Contrast' },
    std: { kr: '기본', en: 'Standard' },
    hc: { kr: '고대비', en: 'High contrast' },
    reset: { kr: '설정 초기화', en: 'Reset settings' },
    close: { kr: '닫기', en: 'Close' },
    note: { kr: '이 기기의 Artist Edition 모든 화면과 「문의 및 지원」에 함께 적용됩니다. 작품·계정·로그인 정보에는 영향을 주지 않습니다.',
            en: 'Applies to every Artist Edition screen and Contact & Support on this device. Your artworks, account, and sign-in are not affected.' },
    rowDesc: { kr: '글자 크기(100~400%)와 고대비 화면을 설정합니다.', en: 'Set text size (100–400%) and high-contrast display.' },
    sizeNow: { kr: '글자 크기 {s}%', en: 'Text size {s}%' },
    hcOn: { kr: '고대비 모드를 켰습니다.', en: 'High contrast on.' },
    hcOff: { kr: '기본 화면으로 표시합니다.', en: 'Standard contrast.' },
    resetDone: { kr: '보기 설정을 초기화했습니다. 글자 크기 100%, 기본 대비.', en: 'Display settings reset: text size 100%, standard contrast.' },
    manageDesc: { kr: '작가 관리 메뉴를 엽니다. 로그인하지 않았으면 로그인 안내가 표시되며, 작품은 본인 계정으로 로그인한 경우에만 바꿀 수 있습니다.',
                  en: 'Opens the artist management menu. If you are not signed in, sign-in guidance is shown; artworks can be changed only when signed in to your own account.' }
  };
  function lang() {
    var raw = window.APP_FILTER && window.APP_FILTER.state && window.APP_FILTER.state.lang;
    if (!raw) { var a = document.querySelector('.lang-tab.active[data-lang]'); raw = a && a.getAttribute('data-lang'); }
    if (!raw) { var d = document.querySelector('.ap-discover-lang-btn.is-active'); raw = d && /EN/i.test(d.textContent) ? 'en' : null; } // COSMOS/DISCOVER
    if (!raw) { var g = document.querySelector('.lang-global button.active[data-lang]'); if (g) raw = g.getAttribute('data-lang') === 'en' ? 'en' : 'kr'; } // LAB
    if (!raw && document.body) { var bc = document.body.className; raw = /\blang-en\b/.test(bc) ? 'en' : /\blang-both\b/.test(bc) ? 'both' : /\blang-kr\b/.test(bc) ? 'kr' : null; } // privacy·삭제 안내
    if (!raw) raw = /^en/i.test(root.lang || '') ? 'en' : 'kr';
    return raw === 'en' || raw === 'both' ? raw : 'kr';
  }
  // 현재 언어에 맞춰 lang 속성이 붙은 span을 채운다(화면 읽기 도구 발음용)
  function fill(el, pair, vars) {
    var L = lang(), list = L === 'kr' ? [['ko', pair.kr]] : L === 'en' ? [['en', pair.en]] : [['ko', pair.kr], ['en', pair.en]];
    el.textContent = '';
    list.forEach(function (x, i) {
      if (i) el.appendChild(document.createTextNode(' · '));
      var s = document.createElement('span'); s.setAttribute('lang', x[0]);
      s.textContent = vars ? x[1].replace(/\{(\w+)\}/g, function (_, k) { return vars[k]; }) : x[1];
      el.appendChild(s);
    });
  }
  function plain(pair) { var L = lang(); return L === 'kr' ? pair.kr : L === 'en' ? pair.en : pair.kr + ' · ' + pair.en; }

  // ------------------------------------------------------------------ 패널(대화상자)
  var D = null, lastFocus = null;
  function el(tag, cls, attrs) {
    var e = document.createElement(tag); if (cls) e.className = cls;
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function build() {
    if (D) return D;
    var back = el('div', 'dzds-backdrop', { id: 'dzDisplayDialog', hidden: '' });
    var panel = el('div', 'dzds-panel', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dzdsTitle' });
    var head = el('div', 'dzds-head');
    var title = el('h2', 'dzds-title', { id: 'dzdsTitle', tabindex: '-1' });
    var x = el('button', 'dzds-x', { type: 'button', 'data-dzds': 'close' });
    x.innerHTML = '<span aria-hidden="true">×</span>';
    head.appendChild(title); head.appendChild(x);
    var body = el('div', 'dzds-body');
    function group(id, items) {
      var g = el('div', 'dzds-group', { role: 'group', 'aria-labelledby': id });
      var lab = el('p', 'dzds-label', { id: id });
      var chips = el('div', 'dzds-chips');
      items.forEach(function (it) { chips.appendChild(it); });
      g.appendChild(lab); g.appendChild(chips);
      return { g: g, lab: lab };
    }
    var sizeBtns = SCALES.map(function (s) {
      var b = el('button', 'dzds-chip', { type: 'button', 'data-dzds': 'scale', 'data-scale': String(s), 'aria-pressed': 'false' });
      b.textContent = s + '%'; return b;
    });
    var cBtns = ['off', 'on'].map(function (v) {
      return el('button', 'dzds-chip', { type: 'button', 'data-dzds': 'contrast', 'data-contrast': v, 'aria-pressed': 'false' });
    });
    var g1 = group('dzdsSizeLabel', sizeBtns), g2 = group('dzdsContrastLabel', cBtns);
    var reset = el('button', 'dzds-reset', { type: 'button', 'data-dzds': 'reset' });
    var note = el('p', 'dzds-note');
    body.appendChild(g1.g); body.appendChild(g2.g); body.appendChild(note);
    var foot = el('div', 'dzds-foot');
    var close = el('button', 'dzds-close', { type: 'button', 'data-dzds': 'close' });
    // 2026-11-22 zoomfix: 설정 초기화는 닫기와 같은 고정 아래 줄 — 400%에서도 스크롤 없이 항상 보이고 누를 수 있다
    foot.appendChild(reset); foot.appendChild(close);
    var live = el('p', 'dzds-sr', { role: 'status', 'aria-live': 'polite' });
    panel.appendChild(head); panel.appendChild(body); panel.appendChild(foot); panel.appendChild(live);
    back.appendChild(panel);
    (document.body || root).appendChild(back);

    back.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-dzds]') : null;
      if (e.target === back) { closeDlg(); return; }
      if (!b) return;
      var a = b.getAttribute('data-dzds');
      if (a === 'close') closeDlg();
      else if (a === 'scale') { set({ scale: Number(b.getAttribute('data-scale')) }); say(T.sizeNow, { s: state.scale }); }
      else if (a === 'contrast') { set({ contrast: b.getAttribute('data-contrast') === 'on' }); say(state.contrast ? T.hcOn : T.hcOff); }
      else if (a === 'reset') { set({ scale: 100, contrast: false }); say(T.resetDone); }
    });
    back.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); e.stopPropagation(); closeDlg(); return; }
      if (e.key !== 'Tab') return;
      var f = panel.querySelectorAll('button:not([disabled])'), first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === title)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    D = { back: back, panel: panel, title: title, x: x, g1: g1, g2: g2, sizeBtns: sizeBtns, cBtns: cBtns, reset: reset, note: note, close: close, live: live };
    texts();
    return D;
  }
  function texts() {
    if (!D) return;
    fill(D.title, T.title); fill(D.g1.lab, T.size); fill(D.g2.lab, T.contrast);
    fill(D.cBtns[0], T.std); fill(D.cBtns[1], T.hc);
    fill(D.reset, T.reset); fill(D.close, T.close); fill(D.note, T.note);
    D.x.setAttribute('aria-label', plain(T.close));
    D.panel.setAttribute('lang', lang() === 'en' ? 'en' : 'ko');
  }
  function say(pair, vars) {
    if (!D) return;
    D.live.textContent = '';
    setTimeout(function () { fill(D.live, pair, vars); }, 60);
  }
  function syncUi() {
    if (D) {
      D.sizeBtns.forEach(function (b) { b.setAttribute('aria-pressed', Number(b.getAttribute('data-scale')) === state.scale ? 'true' : 'false'); });
      D.cBtns.forEach(function (b) { b.setAttribute('aria-pressed', (b.getAttribute('data-contrast') === 'on') === state.contrast ? 'true' : 'false'); });
    }
    var e = document.getElementById('dzDisplayBtn');
    if (e) e.setAttribute('data-dz-active', state.scale > 100 || state.contrast ? 'true' : 'false');
  }
  var scrollY0 = 0;
  function openDlg(from) {
    build(); texts(); syncUi();
    lastFocus = from || document.activeElement;
    D.back.hidden = false;
    root.classList.add('dzds-open');
    var entry = document.getElementById('dzDisplayBtn'); if (entry) entry.setAttribute('aria-expanded', 'true');
    setTimeout(function () { try { D.title.focus({ preventScroll: true }); } catch (e) { D.title.focus(); } }, 0);
  }
  function closeDlg() {
    if (!D || D.back.hidden) return;
    D.back.hidden = true;
    root.classList.remove('dzds-open');
    var entry = document.getElementById('dzDisplayBtn'); if (entry) entry.setAttribute('aria-expanded', 'false');
    var t = lastFocus; lastFocus = null;
    if (t && t.focus && document.contains(t)) { try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }
  }
  function set(p) {
    if (p.scale != null && SCALES.indexOf(p.scale) !== -1) state.scale = p.scale;
    if (p.contrast != null) state.contrast = !!p.contrast;
    save(); apply();
  }

  // ------------------------------------------------------------------ 진입점: 헤더 버튼 + 설정 메뉴 한 줄
  function entryLabel(btn) {
    btn.textContent = '';
    var a = el('span', 'dzds-entry-mark', { 'aria-hidden': 'true' }); a.textContent = 'Aa';
    btn.appendChild(a);
    if (btn.classList.contains('dzds-entry-menu')) { // 메뉴 안: 보이는 글자가 곧 버튼 이름(Aa는 장식)
      var en = lang() === 'en';
      var t = el('span', 'dzds-entry-text', { lang: en ? 'en' : 'ko' }); t.textContent = en ? 'DISPLAY SETTINGS' : '보기 설정';
      btn.appendChild(t);
      btn.removeAttribute('aria-label'); btn.removeAttribute('title');
      return;
    }
    if (btn.classList.contains('dzds-entry-hero')) { // aa1(2026-11-23) 원조 Archive Pro 언어 줄: 「Aa 보기 설정」을 글자로 함께 보여 독립 기능임을 분명히(보이는 글자 = 버튼 이름)
      var L = lang(), parts = L === 'en' ? [['en', 'Display Settings']] : [['ko', '보기 설정']]; // aa2: EN 「Display Settings」, KR·KR+EN 「보기 설정」
      var tx = el('span', 'dzds-entry-text');
      parts.forEach(function (q, i) { if (i) tx.appendChild(document.createTextNode(' · ')); var sp = el('span', '', { lang: q[0] }); sp.textContent = q[1]; tx.appendChild(sp); });
      btn.appendChild(tx);
      btn.removeAttribute('aria-label'); btn.removeAttribute('title');
      return;
    }
    btn.setAttribute('aria-label', plain(T.entry));
    btn.setAttribute('title', plain(T.entry));
  }
  function addHeaderEntry() {
    if (document.getElementById('dzDisplayBtn')) return;
    var host = document.querySelector('.site-header .header-actions') || document.querySelector('[data-dz-display-host]');
    var before = host ? host.firstChild : null;
    if (!host) { var li = document.querySelector('.hero .lang-inline'); if (li) { host = li; before = document.getElementById('heroModeLine'); if (before && before.parentNode !== li) before = null; } } // LAB Archive Pro: 언어 버튼 줄(헤더 높이·제목 그대로 — 100% 화면 무변경)
    var inMenu = false;
    if (!host) { var lm = document.getElementById('menu'); if (lm && lm.classList.contains('menu')) { host = lm; before = lm.firstChild; inMenu = true; } } // LAB: 슬라이드 메뉴 맨 위(헤더 칸이 고정 폭이라 넣지 않음)
    if (!host && document.querySelector('.header .lang-global')) { // 메뉴 없는 LAB 문서: 헤더 바로 아래 본문 첫 줄 오른쪽
      var row = el('div', 'dzds-entry-row'); var hd = document.querySelector('.header');
      var anchor = hd && hd.nextElementSibling; if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(row, anchor); else document.body.insertBefore(row, document.body.firstChild);
      host = row; before = null;
    }
    if (!host) { var ls = document.querySelector('header .langs'); if (ls) { host = ls.parentNode; before = ls; } } // 문서형(privacy 등)
    if (!host) { // COSMOS/DISCOVER: 언어 전환 버튼 바로 왼쪽
      var tg = document.querySelector('.ap-discover-header-top .ap-discover-lang-toggle');
      if (!tg) return;
      host = tg.parentNode; before = tg;
    }
    var hero = !!(host && host.classList && host.classList.contains('lang-inline') && host.closest('.hero'));
    var b = el('button', 'dzds-entry' + (inMenu ? ' dzds-entry-menu' : '') + (hero ? ' dzds-entry-hero' : ''), { id: 'dzDisplayBtn', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'dzDisplayDialog' });
    entryLabel(b);
    b.addEventListener('click', function () { openDlg(b); });
    host.insertBefore(b, before);
    syncUi();
    placeEntry();
  }
  // 100%에서 헤더에 넣었을 때 작가 화면 제목(Artist Edition)이 잘리면 → 바로 아래 「50점 PDF」 줄 끝으로 옮긴다.
  // (헤더 높이·제목·로그인 버튼은 원래 그대로. 확대 중에는 헤더가 줄바꿈되므로 항상 헤더에 둔다)
  var placing = 0;
  function placeEntry() {
    var b = document.getElementById('dzDisplayBtn'), hdr = document.querySelector('.site-header .header-actions');
    var row = document.querySelector('.ap-brand-links-row'), h1 = document.querySelector('.site-header .brand-row h1'), wrap = document.querySelector('.site-header .brand-wrap');
    if (!b || !hdr || !h1 || !wrap) return;
    if (b.parentNode !== hdr) { var hf = document.activeElement === b; hdr.insertBefore(b, hdr.firstChild); if (hf) { try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); } } } // 먼저 헤더에 두고 잰다(초점 유지)
    if (root.classList.contains('dz-z') || !row) return;
    if (h1.scrollWidth > wrap.clientWidth + 1 || h1.scrollWidth > h1.clientWidth + 1) {
      var mode = document.getElementById('heroModeLine');
      var hadFocus = document.activeElement === b; // 옮기면 초점이 풀리므로(보기 설정 닫은 직후 등) 그대로 돌려준다
      row.insertBefore(b, mode && mode.parentNode === row ? mode : null);
      if (hadFocus) { try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); } }
    }
  }
  function laterPlace() { if (placing) return; placing = setTimeout(function () { placing = 0; placeEntry(); }, 120); }
  function settingsRow() {
    var a = el('button', 'ap-cms-settings-row dzds-settings-row', { type: 'button', 'data-dz-display-row': '' });
    var tw = el('span', 'ap-cms-settings-row-text');
    var lb = el('span', 'ap-cms-settings-row-label ap-cms-settings-row-label-bi');
    var k = el('span', 'ap-cms-bi-label-kr'); k.textContent = T.entry.kr;
    var e = el('span', 'ap-cms-bi-label-en'); e.textContent = T.entry.en;
    lb.appendChild(k); lb.appendChild(e);
    var ds = el('span', 'ap-cms-settings-row-desc ap-cms-settings-row-desc-bi');
    var dk = el('span', 'ap-cms-bi-rdesc-kr'); dk.textContent = T.rowDesc.kr;
    var de = el('span', 'ap-cms-bi-rdesc-en'); de.textContent = T.rowDesc.en;
    ds.appendChild(dk); ds.appendChild(de);
    tw.appendChild(lb); tw.appendChild(ds);
    var ch = el('span', 'ap-cms-settings-chevron', { 'aria-hidden': 'true' }); ch.textContent = '›';
    a.appendChild(tw); a.appendChild(ch);
    a.setAttribute('aria-haspopup', 'dialog');
    a.addEventListener('click', function () { openDlg(a); });
    return a;
  }
  function injectRow(list) {
    if (!list || list.querySelector('[data-dz-display-row]')) return;
    var about = list.querySelector('.ap-cms-settings-row[data-go="settingsAbout"]');
    if (!about) return;
    about.parentNode.insertBefore(settingsRow(), about);
  }
  // 로그인 전 「관리」 버튼: 이름·용도를 화면 읽기 도구에 알린다(동작·권한은 기존 그대로)
  function describeManage() {
    var m = document.getElementById('manageTabBtn');
    if (!m || m.getAttribute('aria-describedby') === 'dzManageDesc') return;
    var d = document.getElementById('dzManageDesc');
    if (!d) { d = el('span', 'dzds-sr', { id: 'dzManageDesc' }); (document.body || root).appendChild(d); }
    fill(d, T.manageDesc);
    m.setAttribute('aria-describedby', 'dzManageDesc');
    m.setAttribute('aria-haspopup', 'dialog');
  }
  // 언어·Bio·관리 버튼 묶음이 role=tablist로 표시되어 있으나 실제 탭(role=tab)이 아니다 → 버튼 묶음(group)으로 바로잡는다(동작 무변경)
  function fixRoles() {
    var tl = document.querySelectorAll('.lang-tabs[role="tablist"]');
    for (var i = 0; i < tl.length; i++) if (!tl[i].querySelector('[role="tab"]')) tl[i].setAttribute('role', 'group');
  }
  function scrollRegions() {
    var tb = document.querySelectorAll('table');
    for (var i = 0; i < tb.length; i++) {
      var p = tb[i].parentElement;
      if (!p || p.hasAttribute('tabindex') || p.closest('.ap-pf-page')) continue;
      var c = getComputedStyle(p);
      if (/(auto|scroll)/.test(c.overflowX) && p.scrollWidth > p.clientWidth + 1 && !p.querySelector('a, button, input, select, textarea, [tabindex]')) {
        p.setAttribute('tabindex', '0'); p.setAttribute('role', 'region');
        var cap = tb[i].querySelector('caption'), h = p.previousElementSibling;
        p.setAttribute('aria-label', (cap && cap.textContent.trim()) || (h && /^H[1-6]$/.test(h.tagName) && h.textContent.trim()) || (lang() === 'en' ? 'Scrollable table' : '가로로 넘겨 보는 표'));
      }
    }
  }
  function onLangChange() {
    texts();
    LabMenu.lang();
    var b = document.getElementById('dzDisplayBtn'); if (b) entryLabel(b);
    var d = document.getElementById('dzManageDesc'); if (d) fill(d, T.manageDesc);
  }

  // ------------------------------------------------------------------ 대화상자 포커스(열림 → 안으로, 닫힘 → 원래 자리로)
  // 기존 모듈이 이미 포커스를 옮기는 대화상자(관리 미리보기·캡션 리더·문의 메뉴 등)는 건드리지 않는다:
  // 열린 뒤 잠시 기다려도 포커스가 바깥에 있을 때만 옮긴다.
  var Focus = (function () {
    var open = []; // { el, from }
    var FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    function visible(e) {
      if (!e || !e.isConnected || e.hidden || e.closest('[hidden]') || e.getAttribute('aria-hidden') === 'true') return false;
      var c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden') return false; // 투명도 전환 중에도 "열림"으로 본다
      var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0;
    }
    function target(d) {
      if (d.hasAttribute('data-dz-focus-self')) return d; // LAB 슬라이드 메뉴: 메뉴 자체(테두리 없음)로 들어가 화면 읽기 도구가 '메뉴, 대화상자'를 읽게
      var h = d.querySelector('h1, h2, h3, [role=heading]');
      if (h && visible(h)) { if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); return h; }
      var f = d.querySelectorAll(FOCUSABLE);
      for (var i = 0; i < f.length; i++) if (visible(f[i])) return f[i];
      if (!d.hasAttribute('tabindex')) d.setAttribute('tabindex', '-1');
      return d;
    }
    var lastOutside = null;
    document.addEventListener('focusin', function (e) {
      var inDlg = false; for (var i = 0; i < open.length; i++) if (open[i].el.contains(e.target)) inDlg = true;
      if (!inDlg) lastOutside = e.target;
    }, true);
    function check() {
      var ds = document.querySelectorAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"]');
      var now = [];
      for (var i = 0; i < ds.length; i++) { var d = ds[i]; if (d.id === 'dzDisplayDialog' || d.closest('#dzDisplayDialog')) continue; if (visible(d)) now.push(d); }
      // 새로 열린 대화상자
      now.forEach(function (d) {
        for (var k = 0; k < open.length; k++) if (open[k].el === d) return;
        var rec = { el: d, from: lastOutside || document.activeElement };
        open.push(rec);
        function move() {
          if (!visible(d) || d.contains(document.activeElement)) return;
          // 보기 설정 창이 그 위에 열려 있으면 그대로 둔다
          var own = document.getElementById('dzDisplayDialog'); if (own && !own.hidden && own.contains(document.activeElement)) return;
          // 더 위에 열린 다른 대화상자 안에 포커스가 있으면 두기
          for (var m = 0; m < open.length; m++) if (open[m].el !== d && open[m].el.contains(document.activeElement)) return;
          var t = target(d); try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); }
        }
        setTimeout(move, 160); setTimeout(move, 520); // 열림 애니메이션이 끝난 뒤 한 번 더 확인
      });
      // 닫힌 대화상자
      open = open.filter(function (rec) {
        if (now.indexOf(rec.el) !== -1) return true;
        setTimeout(function () {
          var a = document.activeElement;
          var lost = !a || a === document.body || a === root || !a.isConnected || !visible(a) || rec.el.contains(a);
          if (lost && rec.from && rec.from.isConnected && visible(rec.from)) { try { rec.from.focus({ preventScroll: true }); } catch (e) { rec.from.focus(); } }
        }, 120);
        return false;
      });
    }
    var t = 0;
    function later() { if (t) return; t = setTimeout(function () { t = 0; check(); }, 90); }
    return { later: later };
  })();

  // ------------------------------------------------------------------ 안내 토스트 → 화면 읽기 도구 알림
  // role 없는 토스트(예: .ap-portfolio-toast)의 글자를 공용 상태 알림(role=status)으로 전달한다.
  var Live = (function () {
    var box = null, last = '', lastAt = 0;
    function ensure() {
      if (box) return box;
      box = el('div', 'dzds-sr', { id: 'dzLive', role: 'status', 'aria-live': 'polite' });
      (document.body || root).appendChild(box);
      return box;
    }
    function relay(node) {
      if (!node || node.nodeType !== 1) return;
      if (node.closest('[role=status], [role=alert], [aria-live]')) return;
      var txt = (node.textContent || '').trim();
      if (!txt || (txt === last && Date.now() - lastAt < 1500)) return;
      last = txt; lastAt = Date.now();
      var b = ensure(); b.textContent = '';
      setTimeout(function () { b.textContent = txt; }, 50);
    }
    function isToast(n) { return n && n.nodeType === 1 && /toast|snackbar/i.test(String(n.className || '')); }
    return { relay: relay, isToast: isToast };
  })();

  // ------------------------------------------------------------------ LAB 슬라이드 메뉴(#menu) 보강 — 기존 열기/닫기 함수·순서·문구는 그대로
  var LabMenu = (function () {
    var menu = null, btn = null, hdr = null;
    var NAME = { kr: '메뉴', en: 'Menu' };
    function setHdr() {
      if (!hdr) return;
      var b = Math.ceil(hdr.getBoundingClientRect().bottom);
      if (b > 0) root.style.setProperty('--dz-lab-hdr', b + 'px');
    }
    function sync() {
      var open = menu.classList.contains('open');
      // 닫힌 메뉴(화면 밖으로 밀려 있음)에는 Tab·화면 읽기 도구가 들어가지 않게
      if ('inert' in menu) menu.inert = !open; else if (!open) menu.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!btn.hasAttribute('aria-controls')) btn.setAttribute('aria-controls', 'menu');
    }
    function init() {
      hdr = document.querySelector('.header');
      if (hdr && hdr.querySelector('.lang-global')) { root.classList.add('dz-lab'); if (!document.getElementById('menuBtn')) root.classList.add('dz-lab-x'); /* ocean·제안서처럼 헤더 버튼이 절대 위치인 문서 */ setHdr(); window.addEventListener('resize', setHdr); }
      menu = document.getElementById('menu'); btn = document.getElementById('menuBtn') || document.querySelector('.header .menu-btn');
      if (!menu || !btn || !menu.classList.contains('menu')) return;
      menu.setAttribute('role', 'dialog');
      menu.setAttribute('aria-modal', 'true');
      menu.setAttribute('aria-label', plain(NAME));
      menu.setAttribute('tabindex', '-1'); menu.setAttribute('data-dz-focus-self', '');
      if (parseFloat(getComputedStyle(menu).left) < 0) root.classList.add('dz-lab-lm'); // left 값으로 숨기는 메뉴(ocean.html): 확대 때 폭이 넓어져도 삐져나오지 않게
      sync();
      try { new MutationObserver(sync).observe(menu, { attributes: true, attributeFilter: ['class'] }); } catch (e) {}
      // Esc로 닫기: 자체 Esc 처리가 없는 페이지(ocean.html 등)에만
      if (!document.getElementById('viewClose')) {
        document.addEventListener('keydown', function (e) {
          if ((e.key === 'Escape' || e.key === 'Esc') && menu.classList.contains('open') && typeof window.closeMenu === 'function') { window.closeMenu(); try { btn.focus(); } catch (x) {} }
        });
      }
      if (window.ResizeObserver && hdr) try { new ResizeObserver(setHdr).observe(hdr); } catch (e) {}
      // 열린 동안 Tab은 메뉴 버튼(×)과 메뉴 항목 사이에서만 돈다
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab' || !menu.classList.contains('open')) return;
        var items = [btn].concat(Array.prototype.slice.call(menu.querySelectorAll('a[href], button:not([disabled])')));
        items = items.filter(function (x) { return x && x.getClientRects().length; });
        if (!items.length) return;
        // 순서를 직접 정한다(헤더 로고·언어 버튼 등 메뉴 밖으로 새지 않게)
        var i = items.indexOf(document.activeElement), n = items.length;
        e.preventDefault();
        if (document.activeElement === menu) { items[e.shiftKey ? n - 1 : Math.min(1, n - 1)].focus(); return; }
        items[i === -1 ? (e.shiftKey ? n - 1 : 0) : (i + (e.shiftKey ? n - 1 : 1)) % n].focus();
      }, true);
    }
    return { init: init, lang: function () { if (menu) menu.setAttribute('aria-label', plain(NAME)); }, hdr: setHdr };
  })();

  // ------------------------------------------------------------------ 시작
  function boot() {
    LabMenu.init();
    scrollRegions(); window.addEventListener('resize', scrollRegions);
    WordFit.watch(); WordFit.later(300);
    fixRoles();
    addHeaderEntry();
    describeManage();
    var lists = document.querySelectorAll('.ap-cms-settings-list');
    for (var i = 0; i < lists.length; i++) injectRow(lists[i]);
    try {
      new MutationObserver(function (recs) {
        for (var q = 0; q < recs.length; q++) {
          var r = recs[q], tn = r.target && (r.target.nodeType === 1 ? r.target : r.target.parentNode);
          if (r.type === 'attributes') { Focus.later(); if (Live.isToast(tn) && /is-visible|show|open|active/.test(String(tn.className))) Live.relay(tn); }
          else {
            if (r.addedNodes.length || r.removedNodes.length) Focus.later();
            if (tn && tn.closest && tn.closest('.site-header')) laterPlace(); // 로그인 버튼 글자(로그인/계정명) 변경
            var tt = tn && tn.closest ? tn.closest('[class*="toast"], [class*="snackbar"]') : null;
            if (tt) Live.relay(tt);
          }
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'style', 'aria-hidden', 'open'] });
    } catch (e) {}
    try {
      new MutationObserver(function (recs) {
        for (var i = 0; i < recs.length; i++) {
          var a = recs[i].addedNodes;
          for (var j = 0; j < a.length; j++) {
            var n = a[j]; if (n.nodeType !== 1) continue;
            if (n.classList.contains('ap-cms-settings-list')) injectRow(n);
            else if (n.querySelector) {
              var ls = n.querySelectorAll('.ap-cms-settings-list'); for (var k = 0; k < ls.length; k++) injectRow(ls[k]);
              if (n.id === 'manageTabBtn' || n.querySelector('#manageTabBtn')) describeManage();
              if (!document.getElementById('dzDisplayBtn')) addHeaderEntry();
              if (n.closest && n.closest('.site-header')) laterPlace();
            }
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
    // 언어 전환(KR/EN/KR+EN) 뒤 문구 갱신
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('.lang-tab[data-lang], [data-lang], .ap-discover-lang-btn');
      if (t) { setTimeout(onLangChange, 0); Gen.grow(); laterPlace(); }
    }, true);
    window.addEventListener('resize', function () { effClass(); Gen.grow(); laterPlace(); });
    window.addEventListener('scroll', function () { if (root.classList.contains('dz-z')) Gen.grow(); }, { passive: true, capture: true });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', effClass);
    window.addEventListener('orientationchange', function () { setTimeout(effClass, 120); });
  }
  // 다른 탭·「문의 및 지원」에서 바꾼 설정을 즉시 반영
  window.addEventListener('storage', function (e) { if (e.key === KEY || e.key === null) { load(); apply(); } });
  // bfcache 복귀·앱 재개 시 최신 설정 반영
  window.addEventListener('pageshow', function () { load(); apply(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.APP_DISPLAY_SETTINGS = {
    get: function () { return { scale: state.scale, contrast: state.contrast }; },
    set: set,
    reset: function () { set({ scale: 100, contrast: false }); },
    open: function () { openDlg(document.activeElement); },
    close: closeDlg,
    rescan: function () { Gen.rescan(); }
  };
})();

/* dzsel1 (2026-11-23) — 확대(150~400%) 중 선택칸(섹션·정렬 등)의 펼친 목록을 접근성 전용 선택 창으로.
   iOS·Android·일부 PC 브라우저의 기본 선택 팝업은 페이지 글자 크기를 따르지 않아, 바깥 글자만 크고 펼친 목록은 작게 남았다.
   - 글자 크기 100%(html.dz-z 아님)에서는 아무것도 바꾸지 않는다(기본 선택 팝업 그대로, Golden Baseline).
   - 확대 중에만 선택칸을 누르거나(마우스·터치) Enter·Space·Alt+↓·F4 를 누르면 이 창을 연다. ↑↓ 로 값 바꾸기 등 나머지 기본 동작은 그대로.
   - 항목을 고르면 원래 <select> 의 값을 바꾸고 input·change 이벤트를 보낸다 → 기존 섹션·정렬·필터 처리 그대로(작품 데이터 무변경).
   - role=dialog + listbox/option, 선택 상태 aria-selected, ↑↓·Home·End·Enter·Space·Escape·Tab 순환, 닫으면 원래 선택칸으로 초점 복귀.
   - 제외: PDF 결과 페이지(.ap-pf-page), 여러 항목 선택칸, [data-dz-native]. */
(function () {
  'use strict';
  if (window.DZ_A11Y_SELECT) return;
  var root = document.documentElement, back = null, box = null, list = null, titleEl = null, xBtn = null, closeBtn = null;
  var cur = null, lastOpen = 0, touch = null, opts = [];

  function zoomed() { return root.classList.contains('dz-z'); }
  function lang() {
    var raw = window.APP_FILTER && window.APP_FILTER.state && window.APP_FILTER.state.lang;
    if (!raw) { var a = document.querySelector('.lang-tab.active[data-lang], .lang-tab[aria-pressed="true"][data-lang]'); raw = a && a.getAttribute('data-lang'); }
    return raw === 'en' || raw === 'both' ? raw : 'kr';
  }
  function tx(kr, en) { var l = lang(); return l === 'en' ? en : (l === 'both' ? kr + ' · ' + en : kr); }
  function eligible(s) {
    return !!(s && s.tagName === 'SELECT' && zoomed() && !s.multiple && !(s.size > 1) && !s.disabled &&
      !(s.closest && s.closest('.ap-pf-page, [data-dz-native]')) && s.options && s.options.length);
  }
  function clean(t) { return String(t || '').replace(/\s+/g, ' ').trim(); }
  function labelOf(s) {
    var t = s.getAttribute('aria-label');
    if (!t && s.id) { try { var l = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(s.id) : s.id) + '"]'); t = l && l.textContent; } catch (e) {} }
    if (!t && s.getAttribute('aria-labelledby')) { var e2 = document.getElementById(s.getAttribute('aria-labelledby').split(/\s+/)[0]); t = e2 && e2.textContent; }
    if (!t) { var l2 = s.closest('label'); t = l2 && l2.textContent; }
    if (!t && s.title) t = s.title;
    return clean(t) || tx('선택', 'Select');
  }

  function css() {
    if (document.getElementById('dzSelStyle')) return;
    var st = document.createElement('style'); st.id = 'dzSelStyle';
    st.textContent =
      '.dzsel-back{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.72);display:flex;align-items:stretch;justify-content:center;padding:max(8px,env(safe-area-inset-top,0px)) max(8px,env(safe-area-inset-right,0px)) max(8px,env(safe-area-inset-bottom,0px)) max(8px,env(safe-area-inset-left,0px));box-sizing:border-box}' +
      '.dzsel-back[hidden]{display:none}' +
      '.dzsel{display:flex;flex-direction:column;width:100%;max-width:920px;max-height:100%;margin:auto;background:#0b1220;color:#f4efe6;border:1px solid rgba(212,180,109,.55);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.6);box-sizing:border-box;overflow:hidden;font-family:inherit}' +
      '.dzsel-head{flex:0 0 auto;display:flex;align-items:flex-start;gap:min(10px,2vw);padding:min(14px,1.6vh) min(16px,3vw);border-bottom:1px solid rgba(212,180,109,.25)}' +
      '.dzsel-title{flex:1 1 0;min-width:0;margin:0;color:#d6b76f;font-weight:700;line-height:1.25;overflow-wrap:anywhere;font-size:min(calc(19px * var(--dz-s,1)),6vh,9vw);font-size:min(calc(19px * var(--dz-s,1)),6dvh,9vw)}' +
      '.dzsel-x,.dzsel-close{min-width:44px;min-height:44px;box-sizing:border-box;border:1px solid rgba(214,183,111,.6);border-radius:999px;background:rgba(212,180,109,.08);color:#f0d79c;font:inherit;font-weight:700;cursor:pointer;line-height:1.15;padding:4px 14px;touch-action:manipulation}' +
      '.dzsel-x{flex:0 0 auto;padding:0 10px;font-size:min(calc(22px * var(--dz-s,1)),6.5vh,10vw);font-size:min(calc(22px * var(--dz-s,1)),6.5dvh,10vw)}' +
      '.dzsel-list{flex:1 1 auto;min-height:0;margin:0;padding:min(10px,1.2vh) min(12px,2.5vw);list-style:none;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}' +
      '.dzsel-opt{display:flex;align-items:flex-start;gap:.4em;box-sizing:border-box;min-height:44px;margin:0 0 min(8px,1vh);padding:.35em .6em;border:2px solid rgba(214,183,111,.28);border-radius:12px;background:rgba(255,255,255,.03);color:#f4efe6;font-size:calc(17px * var(--dz-s,1));line-height:1.3;white-space:normal;overflow-wrap:anywhere;word-break:keep-all;cursor:pointer;touch-action:manipulation}' +
      '.dzsel-opt[aria-selected="true"]{border-color:#d4b46d;background:rgba(212,180,109,.2);font-weight:800}' +
      '.dzsel-opt[aria-disabled="true"]{opacity:.45;cursor:default}' +
      '.dzsel-opt:focus-visible,.dzsel-x:focus-visible,.dzsel-close:focus-visible{outline:3px solid #f0d79c;outline-offset:2px}' +
      '.dzsel-mark{flex:0 0 auto;width:1.1em;color:#d4b46d}' +
      '.dzsel-grp{margin:min(10px,1.2vh) 0 min(6px,.8vh);color:#d6b76f;font-weight:700;font-size:calc(15px * var(--dz-s,1));overflow-wrap:anywhere}' +
      '.dzsel-foot{flex:0 0 auto;display:flex;justify-content:flex-end;padding:min(10px,1.2vh) min(16px,3vw);border-top:1px solid rgba(212,180,109,.25)}' +
      '.dzsel-close{font-size:min(calc(16px * var(--dz-s,1)),5.3vh,8.5vw);font-size:min(calc(16px * var(--dz-s,1)),5.3dvh,8.5vw)}' +
      'html.dz-hc .dzsel{background:#000;color:#fff;border-color:#FFD75E}' +
      'html.dz-hc .dzsel-title,html.dz-hc .dzsel-mark,html.dz-hc .dzsel-grp{color:#FFD75E}' +
      'html.dz-hc .dzsel-opt{background:#000;color:#fff;border-color:#bbb}' +
      'html.dz-hc .dzsel-opt[aria-selected="true"]{border-color:#FFD75E;background:#1a1500}' +
      'html.dz-hc .dzsel-x,html.dz-hc .dzsel-close{background:#000;color:#FFD75E;border-color:#FFD75E}';
    (document.head || root).appendChild(st);
  }
  function build() {
    if (back) return;
    css();
    back = document.createElement('div'); back.className = 'dzsel-back'; back.hidden = true;
    back.innerHTML =
      '<div class="dzsel" role="dialog" aria-modal="true" aria-labelledby="dzSelTitle">' +
        '<div class="dzsel-head"><h2 class="dzsel-title" id="dzSelTitle"></h2><button type="button" class="dzsel-x">&times;</button></div>' +
        '<ul class="dzsel-list" role="listbox" aria-labelledby="dzSelTitle"></ul>' +
        '<div class="dzsel-foot"><button type="button" class="dzsel-close"></button></div>' +
      '</div>';
    document.body.appendChild(back);
    box = back.firstChild; list = back.querySelector('.dzsel-list'); titleEl = back.querySelector('.dzsel-title');
    xBtn = back.querySelector('.dzsel-x'); closeBtn = back.querySelector('.dzsel-close');
    xBtn.addEventListener('click', function () { close(); });
    closeBtn.addEventListener('click', function () { close(); });
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    list.addEventListener('click', function (e) {
      var li = e.target && e.target.closest ? e.target.closest('.dzsel-opt') : null;
      if (li && list.contains(li)) choose(li);
    });
    back.addEventListener('keydown', onKey);
  }
  function items() { return Array.prototype.slice.call(list.querySelectorAll('.dzsel-opt:not([aria-disabled="true"])')); }
  function focusItem(li) {
    if (!li) return;
    Array.prototype.forEach.call(list.querySelectorAll('.dzsel-opt'), function (x) { x.tabIndex = -1; });
    li.tabIndex = 0; li.focus();
    try { li.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }
  function onKey(e) {
    var k = e.key, its = items(), i = its.indexOf(document.activeElement);
    if (k === 'Escape' || k === 'Esc') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (k === 'Tab') {
      var f = [list.querySelector('.dzsel-opt[tabindex="0"]') || its[0], closeBtn, xBtn].filter(Boolean);
      var j = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(j + (e.shiftKey ? f.length - 1 : 1) + f.length) % f.length].focus();
      return;
    }
    if (i === -1) return;
    if (k === 'ArrowDown' || k === 'Down') { e.preventDefault(); focusItem(its[Math.min(its.length - 1, i + 1)]); }
    else if (k === 'ArrowUp' || k === 'Up') { e.preventDefault(); focusItem(its[Math.max(0, i - 1)]); }
    else if (k === 'Home') { e.preventDefault(); focusItem(its[0]); }
    else if (k === 'End') { e.preventDefault(); focusItem(its[its.length - 1]); }
    else if (k === 'Enter' || k === ' ' || k === 'Spacebar') { e.preventDefault(); choose(document.activeElement); }
  }
  function open(s) {
    if (!eligible(s)) return false;
    var now = Date.now(); if (now - lastOpen < 450 && cur === s) return true; lastOpen = now;
    build(); cur = s;
    titleEl.textContent = labelOf(s);
    xBtn.setAttribute('aria-label', tx('닫기', 'Close'));
    closeBtn.textContent = tx('닫기', 'Close');
    list.innerHTML = ''; opts = [];
    var n = 0, sel = null;
    Array.prototype.forEach.call(s.children, function (ch) {
      if (ch.tagName === 'OPTGROUP') {
        var g = document.createElement('li'); g.className = 'dzsel-grp'; g.setAttribute('role', 'presentation'); g.textContent = clean(ch.label);
        list.appendChild(g);
        Array.prototype.forEach.call(ch.children, add);
      } else add(ch);
    });
    function add(o) {
      if (!o || o.tagName !== 'OPTION' || o.hidden) return;
      var li = document.createElement('li');
      li.className = 'dzsel-opt'; li.id = 'dzSelOpt' + (n++); li.setAttribute('role', 'option'); li.tabIndex = -1;
      li.setAttribute('data-i', String(o.index));
      var on = o.index === s.selectedIndex; li.setAttribute('aria-selected', on ? 'true' : 'false');
      if (o.disabled) li.setAttribute('aria-disabled', 'true');
      var m = document.createElement('span'); m.className = 'dzsel-mark'; m.setAttribute('aria-hidden', 'true'); m.textContent = on ? '✓' : '';
      var t = document.createElement('span'); t.textContent = clean(o.label || o.textContent);
      li.appendChild(m); li.appendChild(t); list.appendChild(li); opts.push(li);
      if (on) sel = li;
    }
    back.hidden = false;
    root.classList.add('dzsel-open');
    focusItem(sel && sel.getAttribute('aria-disabled') !== 'true' ? sel : items()[0]);
    return true;
  }
  function choose(li) {
    if (!li || !cur || li.getAttribute('aria-disabled') === 'true') return;
    var s = cur, idx = Number(li.getAttribute('data-i'));
    close(true);
    if (s.selectedIndex !== idx) {
      s.selectedIndex = idx;
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  function close(chosen) {
    if (!back || back.hidden) return;
    back.hidden = true; root.classList.remove('dzsel-open');
    var s = cur; cur = null; list.innerHTML = '';
    if (s && s.isConnected) { try { s.focus({ preventScroll: true }); } catch (e) { try { s.focus(); } catch (e2) {} } }
  }
  function sel(t) { return t && t.closest ? t.closest('select') : null; }
  // 마우스(PC·태블릿 포인터): 기본 팝업 대신 이 창
  document.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    var s = sel(e.target); if (!eligible(s)) return;
    e.preventDefault(); open(s);
  }, true);
  // 터치: 손가락을 거의 움직이지 않고 뗐을 때만(목록 스크롤은 그대로)
  document.addEventListener('touchstart', function (e) {
    var s = sel(e.target); touch = eligible(s) && e.touches && e.touches[0] ? { s: s, x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { capture: true, passive: true });
  document.addEventListener('touchend', function (e) {
    var t = touch; touch = null; if (!t) return;
    var c = e.changedTouches && e.changedTouches[0];
    if (c && (Math.abs(c.clientX - t.x) > 10 || Math.abs(c.clientY - t.y) > 10)) return;
    if (!eligible(t.s)) return;
    e.preventDefault(); open(t.s);
  }, { capture: true, passive: false });
  // 그 밖의 클릭(화면 읽기 도구의 두 번 탭 등)
  document.addEventListener('click', function (e) {
    var s = sel(e.target); if (!eligible(s)) return;
    e.preventDefault(); open(s);
  }, true);
  // 키보드: Enter·Space·Alt+↓·F4 로 펼치기(↑↓ 값 바꾸기는 기본 그대로)
  document.addEventListener('keydown', function (e) {
    var s = e.target && e.target.tagName === 'SELECT' ? e.target : null; if (!eligible(s)) return;
    var k = e.key;
    if (k === 'Enter' || k === ' ' || k === 'Spacebar' || k === 'F4' || (e.altKey && (k === 'ArrowDown' || k === 'Down'))) { e.preventDefault(); open(s); }
  }, true);
  // 확대를 끄면 열린 창을 닫는다
  try { new MutationObserver(function () { if (!zoomed()) close(); }).observe(root, { attributes: true, attributeFilter: ['class'] }); } catch (e) {}

  window.DZ_A11Y_SELECT = { open: open, close: close, isOpen: function () { return !!(back && !back.hidden); } };
})();
