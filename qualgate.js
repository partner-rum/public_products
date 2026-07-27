/* Гейт квалифицированного инвестора.
   Один раз за сессию поверх витрины: подтверждение статуса до доступа к материалам.
   Подключение: <script src="qualgate.js?v=1"></script> перед </body>. Без зависимостей.
   На главной ждёт завершения интро-ролика (.intro / body.intro-lock), затем показывает гейт —
   ровно «после загрузки витрины». Демо: ?qual=1 — принудительно показать (без записи в sessionStorage). */
(function () {
  "use strict";

  var KEY  = "so_qual_v1";                       // подтверждение статуса за сессию
  var demo = /[?&]qual=1(?:&|$)/.test(location.search);

  function seen() {
    if (demo) return false;
    try { return sessionStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }
  function mark() {
    if (demo) return;
    try { sessionStorage.setItem(KEY, "1"); } catch (e) {}
  }

  var css = "" +
    ".qg-veil{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(9,10,13,.86);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);opacity:0;transition:opacity .3s ease;font-family:'Onest',system-ui,sans-serif;}" +
    ".qg-veil.on{opacity:1;}" +
    ".qg-card{position:relative;width:100%;max-width:440px;background:#14161C;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:30px 30px 24px;color:#F2F3F7;box-shadow:0 30px 80px rgba(0,0,0,.6);transform:translateY(14px) scale(.985);transition:transform .3s ease;}" +
    ".qg-veil.on .qg-card{transform:none;}" +
    ".qg-eyebrow{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(242,243,247,.6);margin:0 0 14px;}" +
    ".qg-dot{width:8px;height:8px;border-radius:50%;background:#EE7D1B;flex:none;}" +
    ".qg-h{margin:0 0 10px;font-family:'Rubik','Onest',sans-serif;font-weight:600;font-size:20px;line-height:1.32;color:#F2F3F7;}" +
    ".qg-sub{margin:0 0 22px;font-size:13px;line-height:1.55;color:rgba(242,243,247,.68);}" +
    ".qg-btns{display:flex;flex-direction:column;gap:10px;}" +
    ".qg-btns button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;font-family:inherit;font-size:15px;border-radius:12px;padding:13px 18px;cursor:pointer;transition:background .15s,border-color .15s,color .15s;}" +
    ".qg-yes{background:#EE7D1B;color:#0C0A08;font-weight:600;border:0;}" +
    ".qg-yes:hover{background:#F58E33;}" +
    ".qg-no{background:none;color:rgba(242,243,247,.85);font-weight:500;border:1px solid rgba(255,255,255,.18);}" +
    ".qg-no:hover{border-color:rgba(255,255,255,.36);color:#F2F3F7;}" +
    ".qg-note{margin:18px 0 0;font-size:11.5px;line-height:1.5;color:rgba(242,243,247,.55);text-align:center;}" +
    ".qg-lock,.qg-lock body{overflow:hidden!important;}" +
    "@media(max-width:480px){.qg-card{padding:26px 20px 20px;}.qg-h{font-size:18px;}}";

  function injectCss() {
    if (document.getElementById("qualgate-css")) return;
    var s = document.createElement("style");
    s.id = "qualgate-css";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function show() {
    injectCss();
    var root = document.documentElement;
    root.classList.add("qg-lock");

    var veil = document.createElement("div");
    veil.className = "qg-veil";
    veil.setAttribute("role", "dialog");
    veil.setAttribute("aria-modal", "true");
    veil.setAttribute("aria-labelledby", "qg-h");

    function focusFirst() {
      var b = veil.querySelector("button");
      if (b) { try { b.focus(); } catch (e) {} }
    }
    function onKey(e) {
      if (e.key !== "Tab") return;              // Escape намеренно не закрывает — обязательный гейт
      var fs = veil.querySelectorAll("button");
      if (!fs.length) return;
      var first = fs[0], last = fs[fs.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    function pass() {
      mark();
      document.removeEventListener("keydown", onKey, true);
      root.classList.remove("qg-lock");
      veil.classList.remove("on");
      setTimeout(function () { if (veil.parentNode) veil.remove(); }, 320);
    }
    function renderAsk() {
      veil.innerHTML =
        '<div class="qg-card">' +
          '<div class="qg-eyebrow"><span class="qg-dot"></span>Только для квалифицированных инвесторов</div>' +
          '<h2 class="qg-h" id="qg-h">Пожалуйста, подтвердите, что вы являетесь квалифицированным инвестором</h2>' +
          '<p class="qg-sub">Материалы сайта носят информационный характер и предназначены исключительно для квалифицированных инвесторов.</p>' +
          '<div class="qg-btns">' +
            '<button class="qg-yes" type="button">Да, являюсь</button>' +
            '<button class="qg-no" type="button">Нет, не являюсь</button>' +
          '</div>' +
          '<p class="qg-note">Не является индивидуальной инвестиционной рекомендацией.</p>' +
        '</div>';
      veil.querySelector(".qg-yes").addEventListener("click", pass);
      veil.querySelector(".qg-no").addEventListener("click", renderBlocked);
      focusFirst();
    }
    function renderBlocked() {
      veil.innerHTML =
        '<div class="qg-card">' +
          '<div class="qg-eyebrow"><span class="qg-dot" style="background:#E0705A"></span>Доступ ограничен</div>' +
          '<h2 class="qg-h" id="qg-h">Материалы доступны только квалифицированным инвесторам</h2>' +
          '<p class="qg-sub">К сожалению, мы не можем открыть содержимое сайта. Если вы квалифицированный инвестор — вернитесь к подтверждению статуса.</p>' +
          '<div class="qg-btns">' +
            '<button class="qg-yes qg-back" type="button">Я квалифицированный инвестор</button>' +
          '</div>' +
        '</div>';
      veil.querySelector(".qg-back").addEventListener("click", renderAsk);
      focusFirst();
    }

    document.body.appendChild(veil);         // сперва в DOM — иначе focus() не сработает
    renderAsk();
    document.addEventListener("keydown", onKey, true);
    requestAnimationFrame(function () { veil.classList.add("on"); });
  }

  /* На главной интро-ролик (.intro, body.intro-lock) — это «загрузка витрины».
     Ждём, пока он уйдёт, и только потом показываем гейт. На остальных страницах — сразу. */
  function splashActive() {
    return !!document.querySelector(".intro") ||
           (document.body && document.body.classList.contains("intro-lock"));
  }
  function whenClear(cb) {
    if (!splashActive()) { cb(); return; }
    var fired = false;
    function done() {
      if (fired || splashActive()) return;
      fired = true;
      obs.disconnect();
      clearTimeout(t);
      cb();
    }
    var obs = new MutationObserver(done);
    obs.observe(document.body, { childList: true, attributes: true, attributeFilter: ["class"] });
    var t = setTimeout(function () {           // подстраховка на случай сбоя ролика
      if (fired) return; fired = true; obs.disconnect(); cb();
    }, 9000);
  }

  function init() {
    if (seen()) return;
    whenClear(show);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.QualGate = {
    show: function () { whenClear(show); },
    reset: function () { try { sessionStorage.removeItem(KEY); } catch (e) {} }
  };
})();
