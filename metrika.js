// Яндекс.Метрика — общий счётчик на все страницы сайта. Номер: 110759242.
// При смене домена код НЕ меняется: счётчик привязан к аккаунту, новый адрес
// добавляется в настройках счётчика (Метрика → Настройка → Дополнительные адреса).
(function (m, e, t, r, i, k, a) {
  m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
  m[i].l = 1 * new Date();
  for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
  k = e.createElement(t), a = e.getElementsByTagName(t)[0], k.async = 1, k.src = r, a.parentNode.insertBefore(k, a);
})(window, document, "script", "https://mc.yandex.ru/metrika/tag.js?id=110759242", "ym");

ym(110759242, "init", {
  ssr: true,
  webvisor: true,
  clickmap: true,
  ecommerce: "dataLayer",
  accurateTrackBounce: true,
  trackLinks: true
});

// Ref-метка сейлза: ссылка вида ?ref=andrey. Запоминаем в браузере клиента (живёт между
// страницами и визитами), отдаём в Метрику параметром визита; формы заявок читают so_ref
// и передают в Telegram строкой «Сейлз: …».
(function () {
  try {
    var m = location.search.match(/[?&]ref=([\w.-]{1,40})/);
    if (m) localStorage.setItem("so_ref", m[1].toLowerCase());
    var ref = localStorage.getItem("so_ref");
    if (ref) ym(110759242, "params", { ref: ref });
  } catch (e) {}
})();
