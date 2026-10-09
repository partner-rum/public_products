/* «Потяните, чтобы обновить» — на телефоне и планшете.

   Зачем (09.10.2026, Руслан): «с мобилы не могу обновить страницу или не понимаю,
   когда её обновляю; хочу потянуть вниз, увидеть, что страница перезагрузилась, и
   быть уверенным, что всё ок». Во встроенном браузере Telegram и в витрине,
   добавленной на экран «Домой», родного «потянуть» нет вовсе; в Safari и Chrome оно
   есть, но после него не видно, что что-то произошло: страница та же, без отметки.

   Как работает. Страница прокручена до верха → тянем вниз → из-под шапки выезжает
   пилюля со звездой; кольцо вокруг звезды заполняется по мере натяжения, «Потяните,
   чтобы обновить» → «Отпустите, чтобы обновить». Отпустили — «Обновляем…»: сначала
   короткий запрос к сайту мимо кэша, и только если сайт ответил — перезагрузка. Нет
   сети или сайт молчит — страница остаётся как была, и пилюля так и говорит (иначе
   в метро браузер показал бы свою страницу ошибки вместо витрины). После любой
   перезагрузки — нашей или кнопкой браузера — «✓ Страница обновлена · 14:52».

   Плавность (v2, Руслан: «работает, только лагает»). Пилюля больше НЕ ездит за пальцем
   покадрово: на iPhone requestAnimationFrame идёт с частотой 60 Гц, а родная прокрутка —
   120, и всё, что двигает скрипт, рядом с ней дёргается. Теперь выезд, уход, «щелчок»
   звезды и вертушка — CSS-переходы на собственных слоях, их рисует сам телефон; скрипт
   по ходу жеста меняет только заполнение кольца (перерисовка значка 28×28).

   Родное «потянуть» гасится, чтобы не было двух индикаторов и двух перезагрузок:
   • движок Chrome (Android, его WebView, встроенный браузер Telegram на Android) —
     CSS overscroll-behavior-y: none, пока страница наверху (класс ptr-top на html;
     ниже по странице пружина у края остаётся родной);
   • iPhone и iPad — там CSS родное обновление Safari НЕ отключает (баг WebKit
     275947), поэтому, пока страница наверху, висит непассивный touchmove, который
     гасит только явное движение пальца вниз. Ушли с верха — слушатель снимается, и
     прокрутка снова идёт совсем без участия скрипта.

   Где жест не срабатывает: в меню, окне ассистента, историях, гейте и любых других
   фиксированных слоях; во вложенных прокрутках; на элементах, которые сами ведут
   палец (touch-action без pan-y); при открытой клавиатуре и увеличении; на
   горизонтальных лентах — направление решается по первым пикселям движения.
   Исключение — «страницы поверх страницы» (LAYERS): паспорт на доске и в размещённых
   выпусках, выпуск на размещении. Там жест работает, когда слой прокручен до верха,
   а после перезагрузки якорь открывает тот же выпуск.

   Подключение: <script src="ptr.js?v=2" defer></script> перед </body>. В админке
   модуля нет намеренно — там формы, случайный жест стёр бы набранное. */
(function () {
  "use strict";
  if (window.__soPtr || !window.matchMedia || !matchMedia("(pointer: coarse)").matches) return;
  window.__soPtr = 1;

  var root = document.documentElement;
  var ua = navigator.userAgent || "";
  var IOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var SLOP = 6;          // px пальца до того, как жест считается
  var SHOW = 14;         // px натяжения, после которых выезжает пилюля (короткий рывок её не дёргает)
  var ARM = 84;          // px натяжения до «Отпустите»
  var C = 75.4;          // длина кольца, 2π·12
  var FLAG = "so_ptr";
  var LAYERS = ".panel-wrap.open, .panel.open";
  // Под чем выезжает пилюля: первая видимая полоса у верхнего края окна
  var BARS = [".tg-nav", ".appbar", "header.nav", ".topnav", ".bar-in", "header"];
  var STAR = "M13 1 L15.6 10.4 L25 13 L15.6 15.6 L13 25 L10.4 15.6 L1 13 L10.4 10.4 Z";

  var css =
    "html.ptr-top,html.ptr-top body{overscroll-behavior-y:none}" +
    ".panel-wrap.open,.panel.open{overscroll-behavior-y:none}" +
    ".ptr-clip{position:fixed;left:0;right:0;height:100px;overflow:hidden;pointer-events:none;z-index:9000}" +
    ".ptr{position:absolute;left:50%;top:0;display:flex;align-items:center;gap:9px;height:40px;padding:0 16px 0 6px;" +
      "box-sizing:border-box;border-radius:999px;background:#1B1E25;border:1px solid rgba(255,255,255,.09);" +
      "box-shadow:0 12px 28px -10px rgba(0,0,0,.75);color:rgba(242,243,247,.72);" +
      "font:500 14px/1 'Onest',system-ui,-apple-system,sans-serif;letter-spacing:0;white-space:nowrap;" +
      "transform:translate(-50%,-58px);opacity:0;will-change:transform,opacity;" +
      "transition:transform .3s cubic-bezier(.16,1,.3,1),opacity .2s;-webkit-tap-highlight-color:transparent}" +
    ".ptr.vis{transform:translate(-50%,10px);opacity:1}" +
    ".ptr.on{pointer-events:auto}" +
    ".ptr.armed,.ptr.busy,.ptr.ok,.ptr.err{color:#F2F3F7}" +
    ".ptr-ic{position:relative;flex:none;width:28px;height:28px}" +
    ".ptr-ic svg{position:absolute;left:0;top:0;width:28px;height:28px;overflow:visible}" +
    ".ptr-ring,.ptr-star{will-change:transform}" +
    ".ptr-star{opacity:.62;transition:transform .22s cubic-bezier(.34,1.56,.64,1),opacity .15s}" +
    ".ptr.armed .ptr-star{transform:scale(1.2);opacity:1}" +
    ".ptr.busy .ptr-star{opacity:1}" +
    ".ptr.busy .ptr-ring{animation:ptr-spin .8s linear infinite}" +
    "@keyframes ptr-spin{to{transform:rotate(360deg)}}" +
    ".ptr-mark,.ptr-ok,.ptr-er{display:none}" +
    ".ptr.ok .ptr-mark,.ptr.err .ptr-mark,.ptr.ok .ptr-ok,.ptr.err .ptr-er{display:block}" +
    ".ptr.ok .ptr-star,.ptr.err .ptr-star,.ptr.ok .ptr-pr,.ptr.err .ptr-pr{display:none}" +
    ".ptr.ok .ptr-tr{stroke:rgba(85,192,138,.38)}" +
    ".ptr.err .ptr-tr{stroke:rgba(224,112,90,.38)}" +
    ".ptr-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}" +
    "@media (prefers-reduced-motion:reduce){.ptr{transition:opacity .2s}.ptr.busy .ptr-ring{animation:none}.ptr-star{transition:opacity .15s}}";

  // Стили — сразу: overscroll-behavior обязан действовать уже на первом касании, иначе
  // первое же «потянуть» на Android запустит и родное обновление. Пилюля — по требованию
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var clip = null, pill = null, ring = null, text = null, live = null;
  var T = null, busy = false, raf = 0, hideTimer = 0;

  function mount() {
    if (clip) return;
    clip = document.createElement("div");
    clip.className = "ptr-clip";
    clip.innerHTML =
      '<div class="ptr" aria-hidden="true"><span class="ptr-ic">' +
        '<svg class="ptr-ring" viewBox="0 0 28 28">' +
          '<circle class="ptr-tr" cx="14" cy="14" r="12" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="2"/>' +
          '<circle class="ptr-pr" cx="14" cy="14" r="12" fill="none" stroke="#EE7D1B" stroke-width="2" stroke-linecap="round"' +
            ' stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '" transform="rotate(-90 14 14)"/></svg>' +
        '<svg class="ptr-star" viewBox="0 0 28 28"><path d="' + STAR + '" fill="#EE7D1B" transform="translate(14 14) scale(.5) translate(-13 -13)"/></svg>' +
        '<svg class="ptr-mark" viewBox="0 0 28 28">' +
          '<path class="ptr-ok" d="M9.2 14.4l3.1 3.1 6.5-6.6" fill="none" stroke="#55C08A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<g class="ptr-er" fill="#E0705A"><rect x="13" y="7.5" width="2" height="8.5" rx="1"/><circle cx="14" cy="19.6" r="1.3"/></g></svg>' +
      '</span><span class="ptr-t"></span></div><span class="ptr-sr" role="status" aria-live="polite"></span>';
    document.body.appendChild(clip);
    pill = clip.firstChild;
    ring = pill.querySelector(".ptr-pr");
    text = pill.querySelector(".ptr-t");
    live = clip.lastChild;
    pill.addEventListener("click", function () { if (!busy) hide(); });
  }

  // Нижний край полосы, под которой выезжает пилюля (у слоя — его верх)
  function place(layer) {
    var top = 0;
    if (layer && layer !== root) {
      // У слоя наверху кнопка «← К списку» — пилюля выезжает под ней, а не поверх
      top = Math.max(0, layer.getBoundingClientRect().top);
      var b = layer.querySelector(".panel-close"), rb = b && b.getBoundingClientRect();
      if (rb && rb.height && rb.top < 120 && rb.bottom > top) top = rb.bottom;
    } else {
      for (var i = 0; i < BARS.length && !top; i++) {
        var els = document.querySelectorAll(BARS[i]);
        for (var j = 0; j < els.length; j++) {
          var r = els[j].getBoundingClientRect();
          if (r.height > 0 && r.height < 200 && r.top <= 8 && r.bottom > 0) { top = r.bottom; break; }
        }
      }
    }
    clip.style.top = top > 0 ? Math.round(top) + "px" : "env(safe-area-inset-top, 0px)";
  }

  // Состояние пилюли — набор классов; положение и прозрачность берёт CSS-переход
  function set(state, msg, vis) {
    clearTimeout(hideTimer);
    pill.className = "ptr" + (state ? " " + state : "") + (vis ? " vis" : "");
    text.textContent = msg;
  }
  function hide() { if (pill) pill.classList.remove("vis", "on"); }
  function say(state, msg, ms) {
    set(state + " on", msg, true);
    live.textContent = msg;
    hideTimer = setTimeout(hide, ms);
  }

  // ── Чей это жест ─────────────────────────────────────────────────────────
  // root — страница целиком; элемент из LAYERS — «страница поверх страницы»; null — не наш
  function scrollerOf(el) {
    for (var n = el && el.nodeType === 1 ? el : el && el.parentElement; n && n !== root && n !== document.body; n = n.parentElement) {
      if (n.tagName === "INPUT" && n.type === "range") return null;
      var cs = getComputedStyle(n), ta = cs.touchAction;
      if (ta && ta !== "auto" && ta !== "manipulation" && ta.indexOf("pan-y") < 0) return null;
      if (cs.position === "fixed") return n.matches(LAYERS) ? n : null;
      var oy = cs.overflowY;
      if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) return null;
    }
    // Меню и гейты запирают прокрутку на html/body — тогда страница не наша
    if (getComputedStyle(root).overflowY === "hidden" || getComputedStyle(document.body).overflowY === "hidden") return null;
    return root;
  }
  function atTop(layer) { return layer === root ? window.scrollY <= 0 : layer.scrollTop <= 0; }
  function openLayer() { var L = document.querySelector(LAYERS); return L && getComputedStyle(L).position === "fixed" ? L : null; }

  function onStart(e) {
    if (busy || e.touches.length !== 1) { if (T) drop(); return; }
    // Открыта клавиатура (поле в фокусе и видимая часть окна ужалась) — человек печатает, не обновляем.
    // Поле с автофокусом без клавиатуры (вход в кабинет) жест не глушит
    var a = document.activeElement, vv = window.visualViewport;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.isContentEditable) && vv && vv.height < innerHeight * 0.85) return;
    if (vv && vv.scale > 1.01) return;
    if (window.scrollY > 0 && !document.querySelector(LAYERS)) return;   // обычный случай — прокрученная страница: ничего не считаем
    var layer = scrollerOf(e.target);
    if (!layer || !atTop(layer)) return;
    var t = e.touches[0];
    T = { x0: t.clientX, y0: t.clientY, dir: 0, d: 0, layer: layer, vis: false, armed: false };
  }
  // Направление — по первым пикселям: вниз — наше, вверх или вбок — не наше
  function decide(t) {
    if (T.dir) return;
    var dy = t.clientY - T.y0, dx = t.clientX - T.x0;
    if (dy > 2 && dy > Math.abs(dx) * 1.2) {
      T.dir = 1;
      mount(); place(T.layer);
      set("", "Потяните, чтобы обновить", false);
      ring.style.strokeDashoffset = C;
    } else if (dy < -1 || Math.abs(dx) > 6) T.dir = -1;
  }
  function onMove(e) {
    if (!T) return;
    if (e.touches.length !== 1 || !atTop(T.layer)) { drop(); return; }   // второй палец или страница поехала — не обновление
    var t = e.touches[0];
    decide(t);
    if (T.dir === -1) { T = null; return; }
    if (T.dir !== 1) return;
    T.d = Math.max(0, t.clientY - T.y0 - SLOP);
    if (!raf) raf = requestAnimationFrame(paint);
  }
  // iPhone: гасим родную пружину и родное обновление Safari — только явное «вниз» сверху
  function onBlock(e) {
    if (!T || T.layer !== root || e.touches.length !== 1) return;
    decide(e.touches[0]);
    if (T && T.dir === 1 && e.cancelable) e.preventDefault();
  }
  function onEnd() {
    if (!T) return;
    var go = T.dir === 1 && T.d >= ARM, was = T.dir === 1;
    T = null;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (go) refresh();
    else if (was) hide();
  }
  function drop() {
    var was = T && T.dir === 1;
    T = null;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (was) hide();
  }

  // По ходу жеста скрипт трогает только кольцо и классы; всё движение — CSS
  function paint() {
    raf = 0;
    if (!T || T.dir !== 1) return;
    var d = T.d, vis = d >= SHOW, arm = d >= ARM;
    ring.style.strokeDashoffset = (C * (1 - Math.min(1, d / ARM))).toFixed(2);
    if (vis !== T.vis) { T.vis = vis; pill.classList.toggle("vis", vis); }
    if (arm !== T.armed) {
      T.armed = arm;
      pill.classList.toggle("armed", arm);
      text.textContent = arm ? "Отпустите, чтобы обновить" : "Потяните, чтобы обновить";
      if (arm && navigator.vibrate) try { navigator.vibrate(8); } catch (x) {}
    }
  }

  // ── Обновление: сначала спросить сайт, потом перезагрузиться ──────────────
  // Пока новая страница не нарисовалась, браузер держит старую — «Обновляем…» видно
  // до самой смены картинки, искусственная пауза не нужна
  function refresh() {
    busy = true;
    set("busy", "Обновляем…", true);
    ring.style.strokeDashoffset = (C * 0.72).toFixed(2);
    probe(function (ok, why) {
      if (!ok) {
        busy = false;
        say("err", why === "net" ? "Нет сети — оставили как было" : "Сайт не ответил — повторите", 3200);
        return;
      }
      try { sessionStorage.setItem(FLAG, String(Date.now())); } catch (x) {}
      // Доска и выпуски пишут в адрес якорь выбранного выпуска, а на телефоне якорь при
      // загрузке открывает его паспорт поверх списка. Смотрели список — списком и вернёмся
      if (location.hash && innerWidth <= 920 && document.querySelector(".panel-wrap, #panel.panel") && !openLayer()) {
        try { history.replaceState(history.state, "", location.pathname + location.search); } catch (x) {}
      }
      location.reload();
    });
  }
  function probe(cb) {
    if (navigator.onLine === false) { cb(false, "net"); return; }
    var fin = false, ctl = window.AbortController ? new AbortController() : null;
    function end(ok, why) { if (fin) return; fin = true; clearTimeout(timer); cb(ok, why); }
    var timer = setTimeout(function () { if (ctl) ctl.abort(); end(false, "slow"); }, 8000);
    try {
      fetch(location.href.split("#")[0], { method: "HEAD", cache: "no-store", credentials: "same-origin", signal: ctl ? ctl.signal : undefined })
        .then(function (r) { end(r.status < 500, "srv"); }, function () { end(false, "net"); });
    } catch (x) { end(true, ""); }   // fetch нет — просто обновляем, как кнопка браузера
  }

  // ── После перезагрузки: подтверждение ────────────────────────────────────
  function confirmReload() {
    var mine = false, nav = "";
    try { mine = Date.now() - (+sessionStorage.getItem(FLAG) || 0) < 30000; sessionStorage.removeItem(FLAG); } catch (x) {}
    try { nav = ((performance.getEntriesByType && performance.getEntriesByType("navigation")[0]) || {}).type || ""; } catch (x) {}
    if (!mine && nav !== "reload") return;
    if (mine) try { window.ym && ym(110759242, "reachGoal", "ptr_refresh"); } catch (x) {}
    var at = new Date(), hh = ("0" + at.getHours()).slice(-2), mm = ("0" + at.getMinutes()).slice(-2);
    setTimeout(function () {
      if (busy || T) return;
      // Паспорт, открытый якорем, лежит поверх шапки — тогда пилюля у его верхнего края
      mount(); place(openLayer() || root);
      set("ok", "", false);
      void pill.offsetWidth;   // исходное положение — до перехода, иначе пилюля появится без выезда
      say("ok", "Страница обновлена · " + hh + ":" + mm, 2800);
    }, 160);
  }

  // ── Верх страницы: где гасить родное «потянуть» ─────────────────────────
  var top = null;
  function syncTop() {
    var t = window.scrollY <= 0;
    if (t === top) return;
    top = t;
    root.classList.toggle("ptr-top", t);
    if (IOS) {
      if (t) document.addEventListener("touchmove", onBlock, { passive: false });
      else document.removeEventListener("touchmove", onBlock, { passive: false });
    }
  }

  window.addEventListener("scroll", syncTop, { passive: true });
  window.addEventListener("touchstart", onStart, { passive: true });
  window.addEventListener("touchmove", onMove, { passive: true });
  window.addEventListener("touchend", onEnd, { passive: true });
  window.addEventListener("touchcancel", drop, { passive: true });
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    busy = false; T = null;
    if (pill) set("", "", false);
    top = null; syncTop();
  });
  syncTop();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", confirmReload);
  else confirmReload();
})();
