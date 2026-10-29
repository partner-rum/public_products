/* Гейт квалифицированного инвестора.
   Раз в календарный день (по Москве) поверх витрины: подтверждение статуса до доступа к материалам.
   Подключение: <script src="qualgate.js?v=1"></script> перед </body>. Без зависимостей.
   На главной гейт встаёт ВНУТРЬ входного экрана (QualGate.embed, 13.10.2026); если входного
   экрана нет или он ушёл без гейта — ждёт снятия .intro / body.intro-lock и показывает свою вуаль. Демо: ?qual=1 — принудительно показать (без записи в хранилище).
   Поисковым роботам гейт не показывается — см. isBot(). */
(function () {
  "use strict";

  var KEY  = "so_qual_v1";                       // подтверждение статуса: дата по Москве, ГГГГ-ММ-ДД
  var demo = /[?&]qual=1(?:&|$)/.test(location.search);

  // Цели Метрики. Без них после платной кампании нельзя отличить слабый креатив
  // от «холодный трафик упёрся в гейт»: проходимость = qual_yes / qual_shown.
  function goal(name) {
    try { if (typeof window.ym === "function") window.ym(110759242, "reachGoal", name); } catch (e) {}
  }

  // Подтверждение действует до конца текущих суток по Москве (решение Руслана
  // 13.10.2026: юристы просят спрашивать как можно чаще). В хранилище лежит ДАТА
  // подтверждения, а не «1»: отметка вчерашнего дня — уже не отметка.
  //
  // История: до 28.08.2026 ключ жил в sessionStorage, и каждая новая вкладка
  // спрашивала заново (42% показов не заканчивались ничем); с 28.08 по 13.10
  // хранилось «1» — и из-за localStorage без срока это было фактически навсегда.
  // Раз в день — середина: агент, заходящий ежедневно, отвечает один раз за день,
  // а не в каждой вкладке. Старые отметки «1» датой не являются — после выкладки
  // гейт один раз спросит всех заново.
  //
  // localStorage с двумя откатами: в приватном Safari он кидает, тогда работает
  // cookie до полуночи по Москве, а если и её нет — сессионное хранилище.
  // Та же проверка продублирована в chat.js (qualOk) — правишь одну, правь вторую.
  function today() {
    var d = new Date(Date.now() + 3 * 3600000);             // МСК = UTC+3, без перехода на летнее
    return d.toISOString().slice(0, 10);
  }
  function seen() {
    if (demo) return false;
    var t = today();
    try { if (localStorage.getItem(KEY) === t) return true; } catch (e) {}
    if (document.cookie.indexOf(KEY + "=" + t) !== -1) return true;
    try { if (sessionStorage.getItem(KEY) === t) return true; } catch (e) {}
    return false;
  }
  function mark() {
    if (demo) return;
    var t = today();
    var left = 86400 - Math.floor(((Date.now() + 3 * 3600000) % 86400000) / 1000);   // секунд до полуночи МСК
    try { localStorage.setItem(KEY, t); } catch (e) {}
    try { document.cookie = KEY + "=" + t + ";path=/;max-age=" + left + ";samesite=lax"; } catch (e) {}
    try { sessionStorage.setItem(KEY, t); } catch (e) {}
  }

  var css = "" +
    ".qg-veil{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(23,24,44,.86);backdrop-filter:none;-webkit-backdrop-filter:none;opacity:0;transition:opacity .3s ease;font-family:'Onest',system-ui,sans-serif;}" +
    ".qg-veil.on{opacity:1;}" +
    ".qg-card{position:relative;width:100%;max-width:440px;background:#22243B;border:1px solid rgba(255,255,255,.12);border-radius:2px;padding:30px 30px 24px;color:#F2F3F7;box-shadow:0 30px 80px rgba(0,0,0,.6);transform:translateY(14px) scale(.985);transition:transform .3s ease;}" +
    ".qg-veil.on .qg-card{transform:none;}" +
    ".qg-eyebrow{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:normal;text-transform:none;color:rgba(242,243,247,.6);margin:0 0 14px;}" +
    ".qg-dot{width:8px;height:8px;border-radius:50%;background:#F06E08;flex:none;}" +
    ".qg-h{margin:0 0 10px;font-family:Montserrat,'Onest',sans-serif;font-weight:500;font-size:18.8px;line-height:1.32;color:#F2F3F7;}" +
    ".qg-sub{margin:0 0 22px;font-size:13px;line-height:1.55;color:rgba(242,243,247,.68);}" +
    ".qg-btns{display:flex;flex-direction:column;gap:10px;}" +
    ".qg-btns button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;font-family:inherit;font-size:15px;border-radius:2px;padding:13px 18px;cursor:pointer;transition:background .15s,border-color .15s,color .15s;}" +
    ".qg-yes{background:#F06E08;color:#191A2F;font-weight:600;border:0;}" +
    ".qg-yes:hover{background:#F48834;}" +
    ".qg-no{background:none;color:rgba(242,243,247,.85);font-weight:500;border:1px solid rgba(255,255,255,.18);}" +
    ".qg-no:hover{border-color:rgba(255,255,255,.36);color:#F2F3F7;}" +
    ".qg-note{margin:18px 0 0;font-size:11.5px;line-height:1.5;color:rgba(242,243,247,.55);text-align:center;}" +
    ".qg-links{margin:18px 0 0;font-size:12.5px;line-height:1.6;color:rgba(242,243,247,.68);text-align:center;}" +
    ".qg-links a{color:#F48834;text-decoration:none;}" +
    ".qg-links a:hover{text-decoration:underline;}" +
    ".qg-links .sep{opacity:.5;margin:0 6px;}" +
    ".qg-lock,.qg-lock body{overflow:hidden!important;}" +
    ".qg-in .qg-card{transform:none;}" +
    "@media(max-width:480px){.qg-card{padding:26px 20px 20px;}.qg-h{font-size:18px;}}";

  function injectCss() {
    if (document.getElementById("qualgate-css")) return;
    var s = document.createElement("style");
    s.id = "qualgate-css";
    s.textContent = css;
    document.head.appendChild(s);
  }

  // Карточка гейта: вопрос → «Нет» → объяснение → «Я квалифицированный инвестор» → вопрос.
  // Рисуется в любой контейнер — в свою вуаль (show) или внутрь входного экрана главной
  // (embed): тексты, переходы, цели и запись подтверждения живут только здесь.
  function card(host, onPass, onChange) {
    function focusFirst() {
      var b = host.querySelector("button");
      if (b) { try { b.focus({ preventScroll: true }); } catch (e) {} }
    }
    function renderAsk() {
      host.innerHTML =
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
      host.querySelector(".qg-yes").addEventListener("click", onPass);
      host.querySelector(".qg-no").addEventListener("click", renderBlocked);
      if (onChange) onChange();
      focusFirst();
    }
    function renderBlocked() {
      goal("qual_no");
      // Раньше единственной кнопкой была «Я квалифицированный инвестор» — тупик,
      // где честно ответивший «Нет» мог только вернуться и передумать. Добавляем
      // объяснение статуса и реальные выходы (сайт компании, контакт). Саму логику
      // гейта и текст вопроса не меняем.
      host.innerHTML =
        '<div class="qg-card">' +
          '<div class="qg-eyebrow"><span class="qg-dot" style="background:#E0705A"></span>Доступ ограничен</div>' +
          '<h2 class="qg-h" id="qg-h">Материалы доступны только квалифицированным инвесторам</h2>' +
          '<p class="qg-sub">Статус квалифицированного инвестора присваивает брокер или управляющая компания — при соответствии критериям Банка России (по размеру активов, опыту сделок, образованию или квалификации). Если вы уже получили статус — вернитесь к подтверждению.</p>' +
          '<div class="qg-btns">' +
            '<button class="qg-yes qg-back" type="button">Я квалифицированный инвестор</button>' +
          '</div>' +
          '<p class="qg-links"><a href="https://rumbergcapital.com" target="_blank" rel="noopener">О компании Rumberg</a>' +
            '<span class="sep">·</span><a href="https://t.me/Rumberb_Sales_Team_bot" target="_blank" rel="noopener">Задать вопрос</a></p>' +
        '</div>';
      host.querySelector(".qg-back").addEventListener("click", renderAsk);
      if (onChange) onChange();
      focusFirst();
    }
    renderAsk();
  }

  // Фокус не выходит из гейта: Tab ходит по его кнопкам и ссылкам, остальная страница —
  // inert (убирает 81 фокусируемый элемент из Tab-порядка и из кликов; раньше Tab/клик
  // уводили фокус за вуаль на BODY). keep — элемент тела, который не трогаем.
  function trap(box, keep) {
    function onKey(e) {
      if (e.key !== "Tab") return;              // Escape намеренно не закрывает — обязательный гейт
      var fs = box.querySelectorAll("button, a[href]");   // на блок-экране есть ссылки — их тоже держим в трапе
      if (!fs.length) return;
      var first = fs[0], last = fs[fs.length - 1];
      if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    var inerted = [];
    [].slice.call(document.body.children).forEach(function (el) {
      if (el === keep || el === box) return;
      if (!el.hasAttribute("inert")) { el.setAttribute("inert", ""); inerted.push(el); }
    });
    document.addEventListener("keydown", onKey, true);
    return function release() {
      document.removeEventListener("keydown", onKey, true);
      inerted.forEach(function (el) { el.removeAttribute("inert"); });
      inerted = [];
    };
  }

  var open = false;     // гейт на экране — своей вуалью или внутри входного экрана главной
  var passed = false;   // на этой странице уже ответили «Да» (в демо ?qual=1 запись не ведётся)

  function show() {
    if (open) return;
    open = true;
    injectCss();
    var root = document.documentElement;
    root.classList.add("qg-lock");

    var veil = document.createElement("div");
    veil.className = "qg-veil";
    veil.setAttribute("role", "dialog");
    veil.setAttribute("aria-modal", "true");
    veil.setAttribute("aria-labelledby", "qg-h");
    // Клик по подложке (не по карточке) не должен уводить фокус на BODY.
    veil.addEventListener("mousedown", function (e) { if (e.target === veil) e.preventDefault(); });

    document.body.appendChild(veil);         // сперва в DOM — иначе focus() не сработает
    var release = trap(veil, veil);          // фон недоступен, пока висит гейт
    card(veil, function pass() {
      goal("qual_yes");
      mark();
      passed = true; open = false;
      release();
      root.classList.remove("qg-lock");
      veil.classList.remove("on");
      setTimeout(function () { if (veil.parentNode) veil.remove(); }, 320);
    });
    goal("qual_shown");   // один раз за показ: кнопка «назад» его не удваивает
    requestAnimationFrame(function () { veil.classList.add("on"); });
  }

  // Гейт ВНУТРИ входного экрана главной (index.html, 13.10.2026): экран «звезда → Rumberg →
  // кто мы» сам превращается в вопрос — одним движением, без второй вуали поверх.
  // host — пустой контейнер на входном экране, keep — сам входной экран (его не делаем inert),
  // onPass — после «Да» и записи подтверждения, onChange — карточка сменилась (пересчитать
  // раскладку). false — гейт не нужен (статус уже подтверждён) или уже на экране.
  function embed(host, o) {
    o = o || {};
    if (open || passed || seen()) return false;
    open = true;
    injectCss();
    host.classList.add("qg-in");
    host.setAttribute("role", "dialog");
    host.setAttribute("aria-modal", "true");
    host.setAttribute("aria-labelledby", "qg-h");
    var release = trap(host, o.keep || host);
    card(host, function () {
      goal("qual_yes");
      mark();
      passed = true; open = false;
      release();
      if (o.onPass) o.onPass();
    }, o.onChange);
    goal("qual_shown");
    return true;
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

  // Поисковым роботам гейт не показываем. «Да» они не нажимают, и отрисованная
  // страница для них — одна и та же модалка поверх размытого фона на всех адресах
  // (28.09.2026: в Google и Bing ноль страниц витрины при живых ссылках на неё).
  // Для обязательного гейта Google сам советует пускать робота без него (Search
  // Central, «Interstitials and dialogs»). Содержимое то же, что человек видит
  // после «Да», — это не клоакинг. Защита не слабеет: подменить user-agent сложнее,
  // чем нажать кнопку. Google-InspectionTool — это «Проверка URL» в Search Console.
  var BOT = /googlebot|google-inspectiontool|bingbot|yandex(?:bot|mobilebot|renderresourcesbot)|duckduckbot|applebot/i;
  function isBot() {
    try { return BOT.test(navigator.userAgent || ""); } catch (e) { return false; }
  }

  function init() {
    if (seen() || (!demo && isBot())) return;
    whenClear(function () { if (!open && !passed && !seen()) show(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.QualGate = {
    show: function () { whenClear(show); },
    need: function () { return !passed && !seen() && (demo || !isBot()); },   // нужен ли гейт этому посетителю
    embed: embed,
    reset: function () {                       // ручной сброс для проверки гейта
      try { localStorage.removeItem(KEY); } catch (e) {}
      try { sessionStorage.removeItem(KEY); } catch (e) {}
      try { document.cookie = KEY + "=;path=/;max-age=0"; } catch (e) {}
    }
  };
})();
