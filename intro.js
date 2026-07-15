/* Вход для новичка. Три варианта в одном модуле:
   Intro.show()  — приветственная карточка поверх сайта (первый заход, главная)
   Intro.start() — встроенный блок «С чего начать» на главной
   Intro.hint()  — тонкая плашка-гид на странице продукта
   Подключение: <script src="intro.js?v=1"></script> перед </body>. Без зависимостей. */
(function () {
  "use strict";

  var KEY_OVERLAY = "so_intro_v1";   // приветствие показано
  var KEY_HINT    = "so_hint_v1";    // плашка закрыта
  var GUIDE_URL   = "guide.html";    // короткий путеводитель по сайту

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return "1"; } }
  function lsSet(k) { try { localStorage.setItem(k, "1"); } catch (e) {} }

  var css = "" +
    /* — вариант 1: приветственная карточка — */
    ".in-veil{position:fixed;inset:0;background:rgba(11,12,16,.74);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);z-index:220;display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .25s ease;}" +
    ".in-veil.on{opacity:1;}" +
    ".in-card{position:relative;width:100%;max-width:470px;background:#14161C;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:26px 26px 20px;color:#F2F3F7;font-family:'Onest',system-ui,sans-serif;transform:translateY(12px);transition:transform .25s ease;box-shadow:0 24px 70px rgba(0,0,0,.5);}" +
    ".in-veil.on .in-card{transform:none;}" +
    ".in-eyebrow{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(242,243,247,.55);margin:0 0 10px;}" +
    ".in-dot{width:8px;height:8px;border-radius:50%;background:#EE7D1B;flex:none;}" +
    ".in-h{margin:0 0 16px;font-family:'Rubik','Onest',sans-serif;font-weight:600;font-size:22px;line-height:1.2;color:#F2F3F7;}" +
    ".in-step{display:flex;gap:12px;margin:0 0 12px;}" +
    ".in-n{flex:none;width:24px;height:24px;border-radius:50%;background:rgba(238,125,27,.14);border:1px solid rgba(238,125,27,.4);color:#F58E33;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;margin-top:1px;}" +
    ".in-step p{margin:0;font-size:13.5px;line-height:1.55;color:rgba(242,243,247,.78);}" +
    ".in-step b{color:#F2F3F7;font-weight:500;}" +
    ".in-btns{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 0;}" +
    ".in-go{flex:1 1 auto;min-width:180px;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#EE7D1B;color:#0C0A08;font-weight:600;font-size:14px;text-decoration:none;border-radius:12px;padding:12px 18px;transition:background .15s;}" +
    ".in-go:hover{background:#F58E33;}" +
    ".in-skip{flex:1 1 auto;background:none;border:1px solid rgba(255,255,255,.16);color:rgba(242,243,247,.8);font-family:inherit;font-size:14px;border-radius:12px;padding:12px 18px;cursor:pointer;transition:border-color .15s,color .15s;}" +
    ".in-skip:hover{border-color:rgba(255,255,255,.32);color:#F2F3F7;}" +
    ".in-note{margin:14px 0 0;font-size:11.5px;color:rgba(242,243,247,.4);text-align:center;}" +
    ".in-x{position:absolute;top:12px;right:12px;width:32px;height:32px;border:0;background:none;color:rgba(242,243,247,.5);font-size:20px;line-height:1;cursor:pointer;border-radius:8px;}" +
    ".in-x:hover{color:#F2F3F7;background:rgba(255,255,255,.06);}" +
    "@media(max-width:480px){.in-card{padding:22px 18px 16px;}.in-btns{flex-direction:column;}}" +
    /* — вариант 2: блок «С чего начать» — */
    ".in-start{max-width:1180px;margin:26px auto 6px;padding:0 22px;font-family:'Onest',system-ui,sans-serif;}" +
    ".in-start-cap{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(242,243,247,.55);margin:0 0 12px;}" +
    ".in-start-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;}" +
    ".in-sc{display:block;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:16px 18px;text-decoration:none;transition:border-color .15s,background .15s;}" +
    ".in-sc:hover{border-color:rgba(255,255,255,.22);background:rgba(255,255,255,.06);}" +
    ".in-sc.accent{border-color:rgba(238,125,27,.45);background:rgba(238,125,27,.07);}" +
    ".in-sc.accent:hover{border-color:rgba(238,125,27,.75);}" +
    ".in-sc .t{font-family:'Rubik','Onest',sans-serif;font-weight:600;font-size:15px;color:#F2F3F7;margin:0 0 6px;}" +
    ".in-sc .d{font-size:12.5px;line-height:1.5;color:rgba(242,243,247,.6);margin:0 0 10px;}" +
    ".in-sc .go{font-size:12.5px;font-weight:500;color:#F58E33;}" +
    /* — вариант 2a: одна строка для новичка — */
    ".in-line{display:flex;align-items:center;gap:10px;margin:18px 0 0;font-family:'Onest',system-ui,sans-serif;font-size:13.5px;color:rgba(242,243,247,.66);flex-wrap:wrap;}" +
    ".in-line a{color:#F58E33;text-decoration:none;font-weight:500;white-space:nowrap;}" +
    ".in-line a:hover{text-decoration:underline;}" +
    /* — вариант 2b: две мини-дорожки — */
    ".in-mini{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 0;font-family:'Onest',system-ui,sans-serif;}" +
    ".in-mc{flex:1 1 230px;display:flex;justify-content:space-between;align-items:baseline;gap:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:13px 16px;text-decoration:none;transition:border-color .15s;}" +
    ".in-mc:hover{border-color:rgba(255,255,255,.22);}" +
    ".in-mc.accent{border-color:rgba(238,125,27,.45);background:rgba(238,125,27,.06);}" +
    ".in-mc.accent:hover{border-color:rgba(238,125,27,.75);}" +
    ".in-mc span{font-family:'Rubik','Onest',sans-serif;font-weight:600;font-size:14px;color:#F2F3F7;}" +
    ".in-mc em{font-style:normal;font-size:12.5px;font-weight:500;color:#F58E33;white-space:nowrap;}" +
    /* — вариант 3: плашка-гид — */
    ".in-hint{display:flex;align-items:center;gap:10px;background:rgba(238,125,27,.07);border:1px solid rgba(238,125,27,.28);border-radius:12px;padding:10px 14px;margin:0 0 16px;font-family:'Onest',system-ui,sans-serif;font-size:13px;line-height:1.45;color:rgba(242,243,247,.78);flex-wrap:wrap;}" +
    ".in-hint a{color:#F58E33;text-decoration:none;font-weight:500;white-space:nowrap;}" +
    ".in-hint a:hover{text-decoration:underline;}" +
    ".in-hint-x{margin-left:auto;flex:none;width:26px;height:26px;border:0;background:none;color:rgba(242,243,247,.45);font-size:16px;line-height:1;cursor:pointer;border-radius:6px;}" +
    ".in-hint-x:hover{color:#F2F3F7;background:rgba(255,255,255,.06);}";

  function injectCss() {
    if (document.getElementById("intro-css")) return;
    var s = document.createElement("style");
    s.id = "intro-css";
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ---------- вариант 1: приветственная карточка ---------- */
  function showOverlay() {
    injectCss();
    var veil = document.createElement("div");
    veil.className = "in-veil";
    veil.setAttribute("role", "dialog");
    veil.setAttribute("aria-modal", "true");
    veil.setAttribute("aria-label", "Коротко о сайте");
    veil.innerHTML =
      '<div class="in-card">' +
        '<button class="in-x" aria-label="Закрыть">&times;</button>' +
        '<div class="in-eyebrow"><span class="in-dot"></span>Коротко о главном</div>' +
        '<h2 class="in-h">Впервые здесь?</h2>' +
        '<div class="in-step"><span class="in-n">1</span><p><b>Структурный продукт</b> — доход по формуле, известной до сделки: сколько получите и при каких условиях, видно заранее.</p></div>' +
        '<div class="in-step"><span class="in-n">2</span><p>Здесь — <b>идеи, которые можно запустить сейчас</b>, и уже размещённые выпуски с документами.</p></div>' +
        '<div class="in-step"><span class="in-n">3</span><p>Понравилась идея — жмите <b>«Обсудить продукт»</b>, ответим в Telegram.</p></div>' +
        '<div class="in-btns">' +
          '<a class="in-go" href="' + GUIDE_URL + '">Как это работает — 2 мин</a>' +
          '<button class="in-skip">Сразу к продуктам</button>' +
        '</div>' +
        '<div class="in-note">Для квалифицированных инвесторов</div>' +
      '</div>';
    document.body.appendChild(veil);
    requestAnimationFrame(function () { veil.classList.add("on"); });

    function close() {
      lsSet(KEY_OVERLAY);
      veil.classList.remove("on");
      setTimeout(function () { veil.remove(); }, 260);
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    veil.addEventListener("click", function (e) { if (e.target === veil) close(); });
    veil.querySelector(".in-x").addEventListener("click", close);
    veil.querySelector(".in-skip").addEventListener("click", close);
    veil.querySelector(".in-go").addEventListener("click", function () { lsSet(KEY_OVERLAY); });
    document.addEventListener("keydown", onKey);
  }

  /* ---------- вариант 2: блок «С чего начать» ---------- */
  function showStart(afterEl) {
    injectCss();
    var el = document.createElement("section");
    el.className = "in-start";
    el.innerHTML =
      '<div class="in-start-cap"><span class="in-dot"></span>С чего начать</div>' +
      '<div class="in-start-grid">' +
        '<a class="in-sc accent" href="' + GUIDE_URL + '">' +
          '<div class="t">Я здесь впервые</div>' +
          '<div class="d">Что такое структурный продукт и как читать условия — простыми словами.</div>' +
          '<div class="go">Как это работает &rarr;</div>' +
        '</a>' +
        '<a class="in-sc" href="digest.html">' +
          '<div class="t">Идея этой недели</div>' +
          '<div class="d">Дайджест: гипотеза, рыночная ситуация, факторы и параметры выпуска.</div>' +
          '<div class="go">Читать дайджест &rarr;</div>' +
        '</a>' +
        '<a class="in-sc" href="board.html">' +
          '<div class="t">Текущие продукты</div>' +
          '<div class="d">Доска прайсинга: котировки в % от номинала, параметры, профили выплат.</div>' +
          '<div class="go">Открыть доску &rarr;</div>' +
        '</a>' +
        '<a class="in-sc" href="placements.html">' +
          '<div class="t">Что уже разместили</div>' +
          '<div class="d">Реальные выпуски с фиксингами, динамикой и документами.</div>' +
          '<div class="go">Смотреть выпуски &rarr;</div>' +
        '</a>' +
      '</div>';
    if (afterEl && afterEl.parentNode) afterEl.insertAdjacentElement("afterend", el);
    else document.body.appendChild(el);
    return el;
  }

  /* ---------- вариант 2a: одна строка для новичка ---------- */
  function showStartLine(afterEl) {
    injectCss();
    var el = document.createElement("div");
    el.className = "in-line";
    el.innerHTML =
      '<span>Впервые со структурными продуктами?</span>' +
      '<a href="' + GUIDE_URL + '">Как это работает — 2 мин &rarr;</a>';
    if (afterEl && afterEl.parentNode) afterEl.insertAdjacentElement("afterend", el);
    return el;
  }

  /* ---------- вариант 2b: две мини-дорожки ---------- */
  function showStartMini(afterEl) {
    injectCss();
    var el = document.createElement("div");
    el.className = "in-mini";
    el.innerHTML =
      '<a class="in-mc accent" href="' + GUIDE_URL + '"><span>Я впервые здесь</span><em>Как это работает &rarr;</em></a>' +
      '<a class="in-mc" href="digest.html"><span>Идея этой недели</span><em>Читать дайджест &rarr;</em></a>';
    if (afterEl && afterEl.parentNode) afterEl.insertAdjacentElement("afterend", el);
    return el;
  }

  /* ---------- вариант 3: плашка-гид ---------- */
  function showHint(mount) {
    injectCss();
    var el = document.createElement("div");
    el.className = "in-hint";
    el.innerHTML =
      '<span>Впервые со структурными продуктами?</span>' +
      '<a href="' + GUIDE_URL + '">Как это работает &rarr;</a>' +
      '<button class="in-hint-x" aria-label="Скрыть подсказку">&times;</button>';
    mount.insertBefore(el, mount.firstChild);
    el.querySelector(".in-hint-x").addEventListener("click", function () {
      lsSet(KEY_HINT);
      el.remove();
    });
    return el;
  }

  function init() {
    var path = location.pathname;
    var isIndex = /\/$|index\.html$/.test(path);
    var isProduct = /instrument\.html$|board\.html$/.test(path);

    /* демо-режим: ?intro=1|2|2a|3 принудительно показывает вариант (2b — боевой) */
    var demo = (location.search.match(/[?&]intro=(\w+)/) || [])[1];
    var tapeEl = document.querySelector(".tape-box") || document.querySelector(".hero");
    if (demo === "1") { showOverlay(); return; }
    if (demo === "2") { showStart(tapeEl); return; }
    if (demo === "2a") { showStartLine(tapeEl); return; }
    if (demo === "3") { var m3 = document.querySelector(".wrap"); if (m3) showHint(m3); return; }

    /* боевой режим: две мини-дорожки на главной, постоянно */
    if (isIndex && tapeEl) showStartMini(tapeEl);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.Intro = {
    show: showOverlay,
    start: function () { return showStart(document.querySelector(".tape-box") || document.querySelector(".hero")); },
    startLine: function () { return showStartLine(document.querySelector(".tape-box") || document.querySelector(".hero")); },
    startMini: function () { return showStartMini(document.querySelector(".tape-box") || document.querySelector(".hero")); },
    hint: function () { var m = document.querySelector(".wrap"); if (m) return showHint(m); }
  };
})();
