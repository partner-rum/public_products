// Яндекс.Метрика — общий счётчик на все страницы сайта. Номер: 110759242.
// При смене домена код НЕ меняется: счётчик привязан к аккаунту, новый адрес
// добавляется в настройках счётчика (Метрика → Настройка → Дополнительные адреса).
(function (m, e, t, r, i, k, a) {
  m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
  m[i].l = 1 * new Date();
  for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
  k = e.createElement(t), a = e.getElementsByTagName(t)[0], k.async = 1, k.src = r, a.parentNode.insertBefore(k, a);
})(window, document, "script", "https://mc.yandex.ru/metrika/tag.js?id=110759242", "ym");

// СТРАНИЦЫ БЕЗ ЗАПИСИ ЭКРАНА.
// Вебвизор пишет DOM страницы и отправляет его в Яндекс. На рабочем столе агента
// видны название партнёра, ИНН, ОГРН, номер договора и вознаграждение по каждой
// сделке; в админке и сводном кабинете — то же самое по всем сразу. Отправлять
// коммерческие условия контрагентов на сторону нельзя, поэтому на этих страницах
// счётчик работает БЕЗ вебвизора и кликмапа: посещаемость и цели считаются,
// запись экрана не ведётся.
// Список по адресу, а не по флагу на странице: флаг у новой закрытой страницы
// однажды забудут поставить, и утечка случится молча. Флаг оставлен вторым
// путём — для страниц, которые не подпадают под шаблон имени.
var MET_PRIVATE = /\/(me|me-test|admin|boss)\.html$/.test(location.pathname) ||
                  window.METRIKA_NO_RECORD === true;

ym(110759242, "init", {
  ssr: true,
  webvisor: !MET_PRIVATE,
  clickmap: !MET_PRIVATE,
  ecommerce: "dataLayer",
  accurateTrackBounce: true,
  trackLinks: true
});

// Ref-метка сейлза: ссылка вида ?ref=andrey. Запоминаем в браузере клиента (живёт между
// страницами и визитами), отдаём в Метрику параметром визита; формы заявок читают so_ref
// и передают в Telegram строкой «Сейлз: …».
(function () {
  try {
    // Метка канала: свой ?ref= в приоритете, иначе utm_source. Без фолбэка заявка
    // уезжала в Telegram без источника: Метрика UTM разбирает сама, а форма /lead
    // читает только so_ref, и сейлз в чате не видел, из какого канала человек.
    //
    // РАЗНЫЕ ПРАВА У ДВУХ ИСТОЧНИКОВ (правка 28.08.2026):
    // ?ref= — это ЧЕЛОВЕК (сейлз, партнёр), он перезаписывает метку всегда.
    // utm_source — это КАНАЛ, и он проставляется, только если метки ещё нет.
    // Раньше перезаписывали оба, и любой переход по ссылке с utm затирал агенту
    // его собственную метку: дальше он копировал персональные ссылки с чужой,
    // а в его кабинете открытия переставали считаться. Похоже, так и появились
    // 9 человек с меткой chatgpt.com в отчётах за квартал.
    var byRef = location.search.match(/[?&]ref=([\w.-]{1,40})/);
    var byUtm = location.search.match(/[?&]utm_source=([\w.-]{1,40})/);
    if (byRef) localStorage.setItem("so_ref", byRef[1].toLowerCase());
    else if (byUtm && !localStorage.getItem("so_ref")) localStorage.setItem("so_ref", byUtm[1].toLowerCase());
    var ref = localStorage.getItem("so_ref");
    if (ref) ym(110759242, "params", { ref: ref });
  } catch (e) {}
})();


// --- Маячок открытия персональной ссылки → кабинет агента (me.html) ---
// Зачем: агент не видел, что происходит с его ссылками. Здесь считается только
// «ссылку открыли» и «посмотрели такой-то продукт» — ни кто именно, ни откуда.
//
// Считаем ВИЗИТ, а не браузер. Метка so_ref живёт в браузере вечно (она нужна
// заявкам), поэтому «есть метка — считай» накручивало бы открытия самому агенту
// при каждом заходе на витрину. Открытием считается визит, НАЧАВШИЙСЯ по ссылке
// с ?ref= в адресе; дальнейшие страницы того же визита — просмотры.
(function () {
  var ENDPOINT = "https://so-leads.ruslan-sabirov.workers.dev/hit";

  // Ключ продукта. ТО ЖЕ правило, что productFromUrl() в bot/worker.js — иначе
  // открытия и заявки лягут под разными ключами и в кабинете не сойдутся в строку.
  function productKey() {
    var byId = location.search.match(/[?&]id=([\w.-]{1,60})/);
    if (byId) return byId[1];
    var shell = location.pathname.match(/\/p\/([\w.-]{1,60})\.html$/);
    if (shell) return shell[1];
    if (/offerings\.html$/.test(location.pathname) && location.hash.length > 1) {
      return location.hash.slice(1).slice(0, 60);
    }
    var page = (location.pathname.split("/").pop() || "").replace(/\.html$/, "");
    return page || "index";
  }

  try {
    var ref = localStorage.getItem("so_ref");
    if (!ref) return;

    // Служебные страницы клиент не открывает — считать их незачем.
    var page = productKey();
    if (page === "admin" || page === "me") return;

    // Свои заходы не считаем: агент, вошедший в кабинет на этом браузере.
    if ((localStorage.getItem("so_me") || "") === ref) return;

    // Визит начался по ссылке с меткой? Только такой визит и учитываем.
    if (/[?&](ref|utm_source)=/.test(location.search)) sessionStorage.setItem("so_hit_ses", ref);
    if (sessionStorage.getItem("so_hit_ses") !== ref) return;

    // Каждый продукт — один раз за визит: перезагрузка страницы не открытие.
    if (sessionStorage.getItem("so_hit_" + page)) return;
    sessionStorage.setItem("so_hit_" + page, "1");

    var kind = sessionStorage.getItem("so_hit_first") ? "view" : "open";
    sessionStorage.setItem("so_hit_first", "1");

    var payload = JSON.stringify({ ref: ref, p: page, t: kind });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, payload);
    } else {
      fetch(ENDPOINT, { method: "POST", body: payload, keepalive: true,
                        headers: { "Content-Type": "text/plain" } });
    }
  } catch (e) {}
})();

// Отбивка в Telegram при клике по кнопке «Telegram-группа» в шапке (a.btn-tg).
// sendBeacon переживает переход по ссылке; шлём максимум один раз за сессию, чтобы
// повторные клики одного посетителя не спамили. Ошибки глушим — на навигацию не влияем.
(function () {
  var ENDPOINT = "https://so-leads.ruslan-sabirov.workers.dev/click";
  function wire() {
    var btn = document.querySelector("a.btn-tg");
    if (!btn) return;
    btn.addEventListener("click", function () {
      try {
        if (sessionStorage.getItem("tg_click_sent")) return;
        sessionStorage.setItem("tg_click_sent", "1");
      } catch (e) {}
      try {
        var ref = "";
        try { ref = localStorage.getItem("so_ref") || ""; } catch (e) {}
        var payload = JSON.stringify({
          label: (btn.textContent || "Telegram-группа").trim().slice(0, 80),
          ref: ref,
          url: location.href.slice(0, 300),
          ua: (navigator.userAgent || "").slice(0, 200)
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(ENDPOINT, payload);
        } else {
          fetch(ENDPOINT, { method: "POST", body: payload, keepalive: true, headers: { "Content-Type": "text/plain" } });
        }
      } catch (e) {}
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
