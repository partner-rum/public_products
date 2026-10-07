/* Нижняя панель вкладок на телефоне — ШАБЛОН (07.10.2026).

   Запрос Руслана: «вид похожий на телегу/инсту: снизу панель с набором, а на
   основном экране — отображение всей информации». Пять вкладок: Главная, Доска,
   AI, Аналитика, Ещё. Главная и Доска — страницы; AI открывает ассистента
   (window.Chat.open из chat.js); Аналитика и Ещё — листы снизу со ссылками на
   разделы. Пилюля «Спросить AI» и бургер в шапке на телефоне при этом не нужны.

   Только ≤860px. Переход между вкладками — обычная загрузка страницы: сайт
   многостраничный, мгновенного переключения, как в Telegram, здесь нет. */
(function () {
  "use strict";
  // ПРЕВЬЮ: на сайте панель выключена и включается только у того, кто открыл
  // ссылку с ?tabbar=1 (запоминается в этом браузере); ?tabbar=0 — выключить.
  // Обычные посетители её не видят. После решения Руслана флаг убрать.
  try {
    var qp = new URLSearchParams(location.search).get("tabbar");
    if (qp === "1") localStorage.setItem("so_tb_preview", "1");
    if (qp === "0") localStorage.removeItem("so_tb_preview");
    if (localStorage.getItem("so_tb_preview") !== "1") return;
  } catch (e) { return; }
  var MQ = window.matchMedia && window.matchMedia("(max-width: 860px)");
  if (!MQ) return;
  if (MQ.matches) init();
  else {
    var onCh = function () {
      if (!MQ.matches) return;
      if (MQ.removeEventListener) MQ.removeEventListener("change", onCh); else MQ.removeListener(onCh);
      init();
    };
    if (MQ.addEventListener) MQ.addEventListener("change", onCh); else MQ.addListener(onCh);
  }

  function init() {
    if (document.querySelector(".tb")) return;
    var here = (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "") || "index";

    // Вкладка страницы: куда «принадлежит» раздел
    var OWNER = {
      index: "home",
      board: "board", instrument: "board",
      research: "an", ideas: "an", digest: "an", screener: "an", events: "an", market: "an",
      offerings: "more", placements: "more", about: "more", map: "more", partners: "more",
      company: "more", guide: "more", me: "more", "product-partners": "more"
    };
    var active = OWNER[here] || "";

    var SHEETS = {
      an: { title: "Аналитика", items: [
        ["research.html", "Утро на рынках", "обзор дня: мир, США, Азия, Россия"],
        ["ideas.html", "Разборы", "темы вебинаров и компании"],
        ["digest.html", "Дайджест", "идеи недели и PDF"],
        ["screener.html", "Лучшие ставки", "вклады, фонды и ОФЗ до года"],
        ["market.html", "Рынок структурных облигаций", "объёмы и эмитенты с 2020 года"],
        ["events.html", "События", "вебинары и записи"]
      ] },
      more: { title: "Ещё", items: [
        ["offerings.html", "На размещении", "выпуски с открытым приёмом заявок"],
        ["placements.html", "Размещённые выпуски", "котировки Bid и документы"],
        ["about.html", "Библиотека", "как устроен каждый тип продукта"],
        ["map.html", "Карта структурных продуктов", "все типы рынка и формулы"],
        ["partners.html", "Сотрудничество", "для финансовых институтов и агентов"],
        ["company.html", "О компании", "юрлица и контакты"],
        ["me.html", "Кабинет партнёра", "выпуски, сделки, вознаграждение"],
        ["https://t.me/+NHbVOoUI5IBkN2Uy", "Telegram-группа", "новости и обсуждение"]
      ] }
    };

    var IC = {
      home: '<path d="M4 11.2 12 4.5l8 6.7V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
      board: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M4 9.5h16M9.5 9.5V20"/>',
      ai: '<path d="M12 3.5l1.9 5.6L19.5 11l-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9z"/>',
      an: '<path d="M4.5 19.5h15"/><path d="M7 16v-4M11 16V8M15 16v-6M19 16V5"/>',
      more: '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>'
    };
    function icon(k) {
      return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[k] + '</svg>';
    }

    var css = document.createElement("style");
    css.textContent = [
      "html.tb-on body{padding-bottom:calc(62px + env(safe-area-inset-bottom))!important;}",
      // На телефоне вкладки заменяют пилюлю ассистента и бургер шапки
      "html.tb-on .ca-dock{display:none!important;}",
      "html.tb-on .nav-burger,html.tb-on .mx-mbtn{display:none!important;}",
      // Окно ассистента — над панелью: вкладки остаются под пальцем
      "html.tb-on .ca-panel{bottom:calc(70px + env(safe-area-inset-bottom))!important;height:min(560px,calc(100dvh - 140px - env(safe-area-inset-bottom)))!important;}",
      // Экраны главной — под панель: иначе их низ уходит за неё
      "html.tb-on .hero,html.tb-on .mx-s{min-height:calc(100svh - 57px - 62px - env(safe-area-inset-bottom))!important;}",
      "html.tb-on{scroll-padding-bottom:calc(62px + env(safe-area-inset-bottom));}",
      // Нижняя панель карточки продукта встаёт над вкладками
      "html.tb-on .mbar{bottom:calc(62px + env(safe-area-inset-bottom))!important;padding-bottom:10px!important;}",
      ".tb{position:fixed;left:0;right:0;bottom:0;z-index:290;display:flex;height:calc(62px + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom);",
      "  background:rgba(11,12,16,.97);border-top:1px solid rgba(255,255,255,.1);box-sizing:border-box;font-family:'Onest',system-ui,sans-serif;}",
      ".tb a,.tb button{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:0;",
      "  background:none;border:0;padding:0;color:rgba(242,243,247,.56);font-family:inherit;font-size:11px;font-weight:500;text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent;}",
      ".tb .on{color:#EE7D1B;}",
      ".tb .ai svg{color:#EE7D1B;}",
      ".tb a:active,.tb button:active{opacity:.7;}",
      ".tb :focus-visible{outline:2px solid #EE7D1B;outline-offset:-4px;border-radius:10px;}",
      // Листы «Аналитика» и «Ещё»
      ".tb-back{position:fixed;inset:0;z-index:288;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .2s;}",
      ".tb-back.on{opacity:1;pointer-events:auto;}",
      ".tb-sheet{position:fixed;left:0;right:0;bottom:calc(62px + env(safe-area-inset-bottom));z-index:289;max-height:calc(100svh - 140px);overflow-y:auto;overscroll-behavior:contain;",
      "  background:#14161C;border-top:1px solid rgba(255,255,255,.12);border-radius:18px 18px 0 0;padding:8px 16px 10px;",
      "  transform:translateY(105%);transition:transform .24s cubic-bezier(.16,1,.3,1);font-family:'Onest',system-ui,sans-serif;}",
      ".tb-sheet.on{transform:none;}",
      ".tb-grab{width:38px;height:4px;border-radius:2px;background:rgba(255,255,255,.22);margin:4px auto 10px;}",
      ".tb-sheet h2{margin:0 0 6px;font-family:'Rubik',sans-serif;font-size:20px;font-weight:600;color:#F2F3F7;}",
      ".tb-sheet a{display:flex;align-items:center;gap:12px;min-height:58px;padding:8px 2px;border-top:1px solid rgba(255,255,255,.07);color:#F2F3F7;text-decoration:none;}",
      ".tb-sheet a:first-of-type{border-top:0;}",
      ".tb-sheet a .t{display:block;font-size:15.5px;font-weight:500;line-height:1.3;}",
      ".tb-sheet a .s{display:block;margin-top:2px;font-size:12.5px;color:rgba(242,243,247,.56);line-height:1.35;}",
      ".tb-sheet a .x{margin-left:auto;color:rgba(242,243,247,.35);}",
      ".tb-sheet a[aria-current] .t{color:#EE7D1B;}",
      "@media (prefers-reduced-motion:reduce){.tb-sheet,.tb-back{transition:none;}}",
      "@media (min-width:861px){.tb,.tb-sheet,.tb-back{display:none!important;}}"
    ].join("");
    document.head.appendChild(css);
    document.documentElement.classList.add("tb-on");

    var bar = document.createElement("nav");
    bar.className = "tb";
    bar.setAttribute("aria-label", "Разделы");
    function tab(k, label, href) {
      var on = active === k ? ' class="on" aria-current="page"' : "";
      return href
        ? '<a href="' + href + '"' + on + '>' + icon(k) + '<span>' + label + '</span></a>'
        : '<button type="button" data-k="' + k + '"' + (active === k ? ' class="on"' : (k === "ai" ? ' class="ai"' : "")) + ' aria-expanded="false">' + icon(k) + '<span>' + label + '</span></button>';
    }
    bar.innerHTML = tab("home", "Главная", "index.html") + tab("board", "Доска", "board.html") +
      tab("ai", "AI") + tab("an", "Аналитика") + tab("more", "Ещё");
    document.body.appendChild(bar);

    var back = document.createElement("div"); back.className = "tb-back";
    var sheet = document.createElement("div"); sheet.className = "tb-sheet";
    sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true");
    document.body.appendChild(back); document.body.appendChild(sheet);
    var openK = null;

    function arrow() { return '<svg class="x" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7 H12 M8 3 L12 7 L8 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
    function show(k) {
      var S = SHEETS[k];
      sheet.setAttribute("aria-label", S.title);
      sheet.innerHTML = '<div class="tb-grab"></div><h2>' + S.title + '</h2>' + S.items.map(function (it) {
        var cur = it[0] === here + ".html" ? ' aria-current="page"' : "";
        var ext = /^https?:/.test(it[0]) ? ' target="_blank" rel="noopener"' : "";
        return '<a href="' + it[0] + '"' + cur + ext + '><span><span class="t">' + it[1] + '</span><span class="s">' + it[2] + '</span></span>' + arrow() + '</a>';
      }).join("");
      sheet.scrollTop = 0;
      sheet.classList.add("on"); back.classList.add("on");
      openK = k;
      bar.querySelectorAll("button[data-k]").forEach(function (b) { b.setAttribute("aria-expanded", b.getAttribute("data-k") === k ? "true" : "false"); });
      var f = sheet.querySelector("a"); if (f) f.focus({ preventScroll: true });
    }
    function hide() {
      sheet.classList.remove("on"); back.classList.remove("on"); openK = null;
      bar.querySelectorAll("button[data-k]").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    }
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-k]"); if (!b) { hide(); return; }
      var k = b.getAttribute("data-k");
      if (k === "ai") {
        hide();
        if (window.Chat && Chat.open) Chat.open();
        return;
      }
      if (openK === k) hide(); else show(k);
    });
    back.addEventListener("click", hide);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && openK) hide(); });
    // Свайп вниз по листу — закрыть
    var y0 = null;
    sheet.addEventListener("touchstart", function (e) { y0 = sheet.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
    sheet.addEventListener("touchend", function (e) { if (y0 != null && e.changedTouches[0].clientY - y0 > 70) hide(); y0 = null; }, { passive: true });
    // Вернулись кнопкой «Назад» из bfcache — лист закрыт
    window.addEventListener("pageshow", hide);
  }
})();
