/* Ссылка «О компании» рядом с логотипом в шапке. Единый вид на всех страницах.
   На мобильном (≤640px) прячем длинную надпись-логотип «Структурные продукты»,
   оставляя значок-звезду + «О компании» + «Доска» — чтобы шапка не переполнялась.
   Подключение: <script src="nav-about.js?v=1"></script> перед </body>. Без зависимостей. */
(function () {
  "use strict";
  if (/company\.html$/.test(location.pathname)) return; // на самой странице ссылка не нужна

  function init() {
    var navIn = document.querySelector(".nav-in");
    if (!navIn || navIn.querySelector(".nav-about")) return;
    var brand = navIn.querySelector(".brand") || navIn.querySelector(".name");
    if (!brand) return;

    if (!document.getElementById("nav-about-css")) {
      var s = document.createElement("style");
      s.id = "nav-about-css";
      s.textContent =
        ".nav-about{font-size:13px;font-weight:500;color:rgba(242,243,247,0.6);white-space:nowrap;transition:color .2s;}" +
        ".nav-about:hover{color:#F2F3F7;}" +
        "@media(max-width:640px){.nav-in .brand-name,.nav-in .name{display:none;}" +
        ".nav-in .topnav a:not(.btn-solar){display:none;}.nav-about{font-size:12.5px;}}";
      document.head.appendChild(s);
    }

    var a = document.createElement("a");
    a.className = "nav-about";
    a.href = "company.html";
    a.textContent = "О компании";
    brand.insertAdjacentElement("afterend", a);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
