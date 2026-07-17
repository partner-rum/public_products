/* Шапка: ссылка «О компании» рядом с логотипом (десктоп) + бургер-меню на мобильном.
   На десктопе — как раньше: звезда + «О компании» + пункты меню + «Доска».
   На мобильном (≤640px) длинные пункты прячутся, вместо них — кнопка ☰, по тапу
   выпадает панель со всеми разделами (Дайджест / Размещения / Выпуски / Библиотека /
   О компании / Доска). Бургер появляется только там, где есть .topnav (внутренние страницы).
   Подключение: <script src="nav-about.js?v=3"></script> перед </body>. Без зависимостей. */
(function () {
  "use strict";
  var onCompany = /company\.html$/.test(location.pathname);

  function init() {
    var navIn = document.querySelector(".nav-in");
    if (!navIn || navIn.querySelector(".nav-burger")) return;
    var brand = navIn.querySelector(".brand") || navIn.querySelector(".name");

    injectCSS();

    // «О компании» рядом с логотипом (десктоп) — как раньше; на самой странице не нужно
    if (brand && !onCompany && !navIn.querySelector(".nav-about")) {
      var a = document.createElement("a");
      a.className = "nav-about";
      a.href = "company.html";
      a.textContent = "О компании";
      brand.insertAdjacentElement("afterend", a);
    }

    var topnav = navIn.querySelector(".topnav");
    if (!topnav) return; // главная: разделы и так на странице — бургер не нужен

    // Собираем пункты меню из существующих ссылок шапки
    var items = [];
    topnav.querySelectorAll("a").forEach(function (a) {
      items.push({
        href: a.getAttribute("href"),
        text: a.textContent.replace(/\s+/g, " ").trim(),
        cta: a.classList.contains("btn-solar")
      });
    });
    // «О компании» — перед кнопкой «Доска», если её нет в списке
    if (!onCompany && !items.some(function (i) { return /company\.html/.test(i.href); })) {
      var ctaAt = items.findIndex(function (i) { return i.cta; });
      items.splice(ctaAt < 0 ? items.length : ctaAt, 0, { href: "company.html", text: "О компании", cta: false });
    }

    var here = location.pathname.split("/").pop() || "index.html";

    // Кнопка-бургер (в topnav, слева от «Доски»; на десктопе скрыта)
    var burger = document.createElement("button");
    burger.className = "nav-burger";
    burger.type = "button";
    burger.setAttribute("aria-label", "Меню");
    burger.setAttribute("aria-expanded", "false");
    burger.innerHTML = ICON_MENU;
    topnav.insertBefore(burger, topnav.firstChild);

    // Панель + затемнение
    var backdrop = document.createElement("div");
    backdrop.className = "nav-backdrop";
    var menu = document.createElement("nav");
    menu.className = "nav-menu";
    menu.setAttribute("aria-label", "Разделы сайта");
    menu.innerHTML = items.map(function (i) {
      var cur = i.href.split("?")[0] === here ? ' aria-current="page"' : "";
      return '<a href="' + i.href + '"' + (i.cta ? ' class="item-cta"' : "") + cur + ">" + i.text +
        '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7 H12 M8 3 L12 7 L8 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></a>';
    }).join("");
    document.body.appendChild(backdrop);
    document.body.appendChild(menu);

    var nav = navIn.closest(".nav") || navIn.parentElement;
    function open() {
      menu.style.top = backdrop.style.top = (nav ? nav.getBoundingClientRect().height : 60) + "px";
      menu.classList.add("open"); backdrop.classList.add("open");
      burger.setAttribute("aria-expanded", "true"); burger.innerHTML = ICON_CLOSE;
    }
    function close() {
      menu.classList.remove("open"); backdrop.classList.remove("open");
      burger.setAttribute("aria-expanded", "false"); burger.innerHTML = ICON_MENU;
    }
    function toggle() { menu.classList.contains("open") ? close() : open(); }

    burger.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
    backdrop.addEventListener("click", close);
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    window.addEventListener("resize", function () { if (window.innerWidth > 640) close(); });
  }

  var ICON_MENU = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#F2F3F7" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M2 5h14M2 9h14M2 13h14"/></svg>';
  var ICON_CLOSE = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#F2F3F7" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14"/></svg>';

  function injectCSS() {
    if (document.getElementById("nav-about-css")) return;
    var s = document.createElement("style");
    s.id = "nav-about-css";
    s.textContent =
      ".nav-about{font-size:13px;font-weight:500;color:rgba(242,243,247,0.6);white-space:nowrap;transition:color .2s;}" +
      ".nav-about:hover{color:#F2F3F7;}" +
      ".nav-burger{display:none;align-items:center;justify-content:center;width:38px;height:38px;border:1px solid rgba(255,255,255,0.14);border-radius:6px;background:transparent;cursor:pointer;padding:0;}" +
      ".nav-burger:hover{border-color:rgba(255,255,255,0.30);}" +
      ".nav-backdrop{position:fixed;inset:0;z-index:39;background:rgba(0,0,0,0.45);opacity:0;pointer-events:none;transition:opacity .18s;}" +
      ".nav-backdrop.open{opacity:1;pointer-events:auto;}" +
      ".nav-menu{position:fixed;right:12px;left:12px;z-index:41;background:#14161C;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:6px;box-shadow:0 16px 40px rgba(0,0,0,0.55);opacity:0;transform:translateY(-6px);pointer-events:none;transition:opacity .18s,transform .18s cubic-bezier(0.16,1,0.3,1);}" +
      ".nav-menu.open{opacity:1;transform:none;pointer-events:auto;}" +
      ".nav-menu a{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 14px;border-radius:8px;font-family:inherit;font-size:15px;font-weight:500;color:#F2F3F7;text-decoration:none;}" +
      ".nav-menu a+a{border-top:1px solid rgba(255,255,255,0.06);}" +
      ".nav-menu a:hover{background:rgba(255,255,255,0.06);}" +
      ".nav-menu a svg path{stroke:rgba(242,243,247,0.35);}" +
      '.nav-menu a[aria-current="page"]{color:#EE7D1B;}' +
      '.nav-menu a[aria-current="page"] svg path{stroke:#EE7D1B;}' +
      ".nav-menu a.item-cta{color:#EE7D1B;font-weight:600;}" +
      ".nav-menu a.item-cta svg path{stroke:#EE7D1B;}" +
      "@media(max-width:640px){.nav-in .brand-name,.nav-in .name{display:none;}" +
      ".nav-in .topnav a:not(.btn-solar){display:none;}.nav-about{display:none;}" +
      ".nav-burger{display:inline-flex;}}" +
      "@media(min-width:641px){.nav-menu,.nav-backdrop{display:none !important;}}";
    document.head.appendChild(s);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
