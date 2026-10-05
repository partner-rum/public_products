/* AI-ассистент (консьерж по сайту). Плавающая кнопка-«звезда» + панель, тёмная тема.
   Дизайн-язык ИИ: фирменная 4-лучевая звезда + искры, градиент оранжевый→синий, бейдж AI,
   подсказки-вопросы, пометка «может ошибаться» (не колл-центр: без зелёной точки «онлайн»).
   Бэкенд: Cloudflare Worker /chat → YandexGPT (ключи — секреты Cloudflare, не в репо).
   Подключение: <script src="chat.js?v=3"></script> перед </body>. Без зависимостей. */
(function () {
  "use strict";

  var CFG = {
    endpoint: (location.hostname === "invest.rumberg.ru" ? "/api" : "https://so-leads.ruslan-sabirov.workers.dev") + "/chat",
    botUser: "Rumberb_Sales_Team_bot",
    metrikaId: 110759242,
    msgLimit: 10,   // максимум вопросов за сессию, дальше — кнопка «Написать в Telegram»
    // Стриминг ответа ВЫКЛЮЧЕН: в бою поток DeepSeek через Cloudflare Workers обрывался
    // на середине ответа (клиент видел обрезанный текст) — воспроизводилось и при
    // трансформации потока в воркере, и при прямом пробросе, и в браузере, и вне него.
    // Причина в связке провайдер↔Workers, не во фронте. Код чтения потока ниже рабочий
    // и протестирован — когда причина будет устранена, достаточно вернуть true.
    stream: false,
    greeting: "Здравствуйте! Я AI-ассистент Rumberg: объясню, как устроены структурные продукты, и подскажу, где что на сайте.",
    suggestions: [
      "Чем автоколл отличается от облигации с защитой капитала?",
      "Где посмотреть уже размещённые выпуски?",
      "Как читать доску прайсинга?"
    ]
  };

  // Настройка со страницы: window.CHAT_SETUP задаётся ДО подключения chat.js.
  // partner:true — прикладывать к /chat пару ID+ключ рабочего стола партнёра
  // (localStorage so_me/so_me_key): воркер по ней добавит в промпт его выпуски.
  // Пара уходит только нашему воркеру — тому же, куда стол шлёт /stats.
  // Поле partner читается при КАЖДОЙ отправке (страница может выключить его позже,
  // например в демо-режиме стола). greeting/suggestions — свои тексты страницы.
  // desk:true — статичная метка рабочего стола: у диалога СВОЙ ключ истории
  // (иначе партнёрский разговор переезжал бы через sessionStorage на витринные
  // страницы, где воркер уже считает собеседника клиентом, и ассистент менял бы
  // персону посреди диалога) и НЕТ кнопки-заявки «Обсудить с Румбергом» (партнёр
  // и так на связи с менеджером, а заявка ушла бы сейлзам с подписью «Клиент:»).
  // greeting читается ЛЕНИВО при открытии панели — страница может поменять его
  // после загрузки chat.js (демо-режим стола, протухший ключ).
  var SETUP = window.CHAT_SETUP || {};
  var OWN_SUG = Array.isArray(SETUP.suggestions) && SETUP.suggestions.length;
  if (OWN_SUG) CFG.suggestions = SETUP.suggestions.slice(0, 4);

  // Гейт квалинвестора пройден — те же три места, что у seen() в qualgate.js. Расчёт цены
  // опциона в чате работает только после гейта (воркер смотрит на qual), поэтому и
  // обещание «посчитаю» показываем только тогда — иначе оно было бы неправдой.
  function qualOk() {
    if (document.cookie.indexOf("so_qual_v1=1") !== -1) return true;
    try { if (localStorage.getItem("so_qual_v1") === "1") return true; } catch (e) {}
    try { if (sessionStorage.getItem("so_qual_v1") === "1") return true; } catch (e) {}
    return false;
  }

  // СТЕНД расположения ассистента (локально, до выбора Руслана): ?ailook=0|d|e|f, выбор
  // помнится в sessionStorage. 0 — как сейчас на сайте; d — строка-вопрос внизу по центру;
  // e — язычок на правом краю и шторка во всю высоту; f — полоса под шапкой. После выбора
  // стенд убрать, оставить один вариант.
  var LOOK = (function () {
    var m = location.search.match(/[?&]ailook=([0def])/);
    try {
      if (m) sessionStorage.setItem("ca_look", m[1]);
      return (m && m[1]) || sessionStorage.getItem("ca_look") || "0";
    } catch (e) { return m ? m[1] : "0"; }
  })();

  // Что умеет ассистент — ТРИ вещи, везде в одном порядке: объяснить продукт, посчитать цену
  // опциона, подсказать, где что на сайте. На заставке (кнопка, строка, полоса, подсказка)
  // ассистент НЕ сужается до CALL/PUT — оговорка «считаю только CALL и PUT на один актив»
  // появляется уже внутри открытого чата, второй репликой после приветствия (решение
  // Руслана 05.10.2026: «пусть этот дисклеймер будет, когда его уже откроет клиент»).
  var PRICE_GREETING = "Здравствуйте! Я AI-ассистент Rumberg. Объясню, как устроены структурные продукты, " +
    "подскажу, где что на сайте, и посчитаю индикативную цену опциона на ваш срок и страйк.";
  var PRICE_NOTE = "Цену пока считаю только для CALL и PUT на один актив — акцию, индекс или фонд. " +
    "Остальные структуры посчитает менеджер: кнопка «Обсудить с Румбергом» внизу.";
  var EXAMPLES = [
    "Чем автоколл отличается от облигации с защитой капитала?",
    "Посчитай колл на Сбербанк на 2 года",
    "Где посмотреть уже размещённые выпуски?"
  ];
  var CAN_LIST = "о продуктах, ценах и сайте";   // подпись под «Спросить AI» на заставке
  function greeting() {
    if (typeof SETUP.greeting === "string" && SETUP.greeting) return SETUP.greeting;
    return (LOOK !== "0" && qualOk()) ? PRICE_GREETING : CFG.greeting;
  }
  // Оговорка про CALL/PUT: только когда расчёт действительно доступен (гейт пройден) и
  // приветствие не задано страницей (рабочий стол партнёра говорит своё).
  function priceNote() {
    return (LOOK !== "0" && qualOk() && !(typeof SETUP.greeting === "string" && SETUP.greeting)) ? PRICE_NOTE : "";
  }
  function suggestions() {
    if (OWN_SUG || LOOK === "0" || !qualOk()) return CFG.suggestions;
    return EXAMPLES;
  }
  function examples() { return qualOk() ? EXAMPLES : CFG.suggestions; }
  var STORE = SETUP.desk ? "so_chat_desk" : "so_chat";

  var css = "" +
    /* — кнопка: тёмный круг с тонкой линией и фирменной звездой; без свечений и вращений — */
    ".ca-btn{position:fixed;right:20px;bottom:20px;z-index:300;width:56px;height:56px;border:1px solid rgba(255,255,255,.18);border-radius:50%;background:#101114;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 28px rgba(0,0,0,.5);transition:border-color .18s;}" +
    ".ca-btn:hover{border-color:rgba(238,125,27,.65);}" +
    ".ca-btn svg{display:block;}" +
    ".ca-btn .ca-ai{position:absolute;top:-5px;right:-5px;background:#0B0C10;color:#8FB3F0;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:500;letter-spacing:.06em;padding:2px 5px;border-radius:4px;border:1px solid rgba(79,134,230,.5);}" +
    ".ca-btn.hide{display:none;}" +
    /* — панель — */
    // visibility:hidden в закрытом состоянии убирает содержимое панели из табуляции
    // и из дерева скринридера (opacity+pointer-events этого не делали — A.6).
    ".ca-panel{position:fixed;right:20px;bottom:20px;z-index:301;width:376px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100dvh - 40px);background:#14161C;border:1px solid rgba(255,255,255,.12);border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden;font-family:'Onest',system-ui,sans-serif;opacity:0;visibility:hidden;transform:translateY(14px) scale(.98);transition:opacity .2s,transform .2s,visibility 0s linear .2s;pointer-events:none;}" +
    ".ca-panel.on{opacity:1;visibility:visible;transform:none;pointer-events:auto;transition:opacity .2s,transform .2s,visibility 0s;}" +
    ".ca-head{display:flex;align-items:center;gap:11px;padding:13px 16px;border-bottom:1px solid rgba(255,255,255,.09);flex:none;background:#14161C;}" +
    ".ca-ava{width:38px;height:38px;border-radius:10px;background:#0B0C10;border:1px solid rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;flex:none;}" +
    ".ca-ttl-row{display:flex;align-items:center;gap:7px;}" +
    ".ca-ttl{font-family:'Rubik','Onest',sans-serif;font-weight:600;font-size:14.5px;color:#F2F3F7;}" +
    ".ca-chip{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#8FB3F0;background:rgba(79,134,230,.14);border:1px solid rgba(79,134,230,.42);border-radius:5px;padding:2px 6px;}" +
    ".ca-sub{font-size:12px;color:rgba(242,243,247,.62);margin-top:1px;}" +
    ".ca-x{margin-left:auto;width:44px;height:44px;border:0;background:none;color:rgba(242,243,247,.55);font-size:20px;line-height:1;cursor:pointer;border-radius:8px;flex:none;}" +
    ".ca-x:hover{color:#F2F3F7;background:rgba(255,255,255,.06);}" +
    /* Клавиатурный фокус: у кнопок виджета его не было вовсе (outline:none на
       полях, ни одного правила :focus-visible), а страницы объявляют рамку
       только на <a> — виджет выпадал из обхода незаметно для глаза. */
    ".ca-btn:focus-visible,.ca-x:focus-visible,.ca-send:focus-visible,.ca-discuss:focus-visible,.ca-sug button:focus-visible{outline:2px solid #EE7D1B;outline-offset:3px;}" +
    ".ca-in:focus-visible,.ca-lead input:focus-visible{outline:2px solid #EE7D1B;outline-offset:1px;}" +
    /* — лента сообщений — */
    ".ca-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;}" +
    ".ca-msg{max-width:86%;font-size:13.5px;line-height:1.55;padding:9px 13px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word;}" +
    ".ca-msg.u{align-self:flex-end;background:#EE7D1B;color:#0C0A08;border-bottom-right-radius:5px;}" +
    ".ca-msg.a{align-self:flex-start;background:rgba(255,255,255,.05);color:#F2F3F7;border:1px solid rgba(255,255,255,.08);border-bottom-left-radius:5px;}" +
    ".ca-msg.a a{color:#F58E33;}" +
    ".ca-msg.a b{color:#F2F3F7;font-weight:600;}" +
    /* — подсказки-вопросы — */
    ".ca-sug{display:flex;flex-direction:column;gap:8px;align-items:flex-start;}" +
    ".ca-sug button{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.03);color:rgba(242,243,247,.85);border-radius:12px;padding:12px 14px;font-family:inherit;font-size:12.5px;line-height:1.4;cursor:pointer;text-align:left;transition:border-color .15s,color .15s,background .15s;}" +
    ".ca-sug button:hover{border-color:rgba(238,125,27,.6);color:#fff;background:rgba(238,125,27,.06);}" +
    ".ca-sug button svg{flex:none;margin-right:8px;vertical-align:-1px;}" +
    /* — «думает»: мигающий блок-курсор терминала + бегущая полоса; фразы меняются
         по мере ожидания (ответ провайдера может идти до ~15 c) — */
    ".ca-typing{align-self:flex-start;display:flex;flex-direction:column;align-items:flex-start;gap:7px;min-width:168px;padding:10px 14px;background:rgba(255,255,255,.05);border-radius:14px;border-bottom-left-radius:5px;font-size:12px;color:rgba(242,243,247,.55);font-family:'JetBrains Mono',monospace;}" +
    ".ca-typing .tl{display:flex;align-items:center;gap:2px;}" +
    ".ca-typing .tx{transition:opacity .16s ease;}" +
    ".ca-typing .cur{color:#EE7D1B;animation:caCaret 1s steps(1) infinite;}" +
    ".ca-typing .tb{position:relative;width:100%;height:2px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden;}" +
    ".ca-typing .tb::after{content:'';position:absolute;top:0;bottom:0;left:0;width:38%;border-radius:2px;background:linear-gradient(90deg,transparent,#EE7D1B,transparent);animation:caScan 1.5s ease-in-out infinite;}" +
    "@keyframes caCaret{50%{opacity:0;}}" +
    "@keyframes caScan{0%{transform:translateX(-100%);}100%{transform:translateX(265%);}}" +
    "@media(prefers-reduced-motion:reduce){.ca-typing .cur,.ca-typing .tb::after{animation:none;}.ca-typing .tb::after{width:100%;opacity:.5;}}" +
    /* — низ — */
    ".ca-foot{flex:none;border-top:1px solid rgba(255,255,255,.09);padding:10px 12px;}" +
    ".ca-row{display:flex;gap:8px;align-items:flex-end;}" +
    ".ca-in{flex:1;resize:none;max-height:96px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:12px;color:#F2F3F7;font-family:inherit;font-size:16px;line-height:1.4;padding:9px 12px;outline:none;}" +
    ".ca-in:focus{border-color:rgba(238,125,27,.6);}" +
    ".ca-send{flex:none;width:44px;height:44px;border:0;border-radius:11px;background:#EE7D1B;color:#0C0A08;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;}" +
    ".ca-send:hover{background:#F58E33;}.ca-send:disabled{opacity:.4;cursor:default;}" +
    ".ca-send svg{width:17px;height:17px;}" +
    ".ca-note{margin:7px 2px 0;font-size:12px;line-height:1.45;color:rgba(242,243,247,.62);text-align:center;}" +
    /* — кнопка и форма «Обсудить с Румбергом» — */
    ".ca-discuss{width:100%;margin-bottom:8px;background:none;border:1px solid rgba(238,125,27,.4);color:#F58E33;border-radius:11px;padding:14px;font-family:inherit;font-size:13px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;transition:background .15s,border-color .15s;}" +
    ".ca-discuss:hover{background:rgba(238,125,27,.08);border-color:rgba(238,125,27,.7);}" +
    ".ca-discuss svg{width:15px;height:15px;}" +
    ".ca-lead{align-self:stretch;background:rgba(238,125,27,.06);border:1px solid rgba(238,125,27,.3);border-radius:14px;padding:13px 14px;display:flex;flex-direction:column;gap:8px;}" +
    ".ca-lead-t{font-size:13px;line-height:1.5;color:#F2F3F7;}" +
    ".ca-lead input{background:#0B0C10;border:1px solid rgba(255,255,255,.14);border-radius:10px;color:#F2F3F7;font-family:inherit;font-size:16px;padding:9px 11px;outline:none;}" +
    ".ca-lead input:focus{border-color:rgba(238,125,27,.6);}" +
    ".ca-lead-send{background:#EE7D1B;color:#0C0A08;border:0;border-radius:10px;padding:9px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;}" +
    ".ca-lead-send:hover{background:#F58E33;}.ca-lead-send:disabled{opacity:.5;cursor:default;}" +
    ".ca-lead-ok{font-size:13px;line-height:1.55;color:#F2F3F7;}.ca-lead-ok a{color:#F58E33;}" +
    "@media(max-width:480px){.ca-panel{right:8px;bottom:8px;height:calc(100dvh - 16px);}}" +
    /* ===== Расположение ассистента (варианты D/E/F на стенде, ?ailook=) ===== */
    /* — общее: кнопка с подписью (F), вход в шапке (D/E/F), оговорка внутри чата — */
    ".ca-btn.lab{width:auto;height:54px;padding:0 20px 0 15px;border-radius:999px;gap:11px;border-color:rgba(238,125,27,.55);background:#14161C;box-shadow:0 12px 30px rgba(0,0,0,.55);}" +
    ".ca-btn.lab:hover{border-color:#EE7D1B;background:#181A21;}" +
    ".ca-btn.lab .ca-ai{display:none;}" +
    ".ca-btn .lt{display:flex;flex-direction:column;align-items:flex-start;gap:2px;font-family:'Onest',system-ui,sans-serif;text-align:left;}" +
    ".ca-btn .l1{font-size:14.5px;font-weight:600;color:#F2F3F7;line-height:1.15;}" +
    ".ca-btn .l2{font-size:12px;color:rgba(242,243,247,.68);line-height:1.2;white-space:nowrap;}" +
    // Оговорка про CALL/PUT внутри чата — тише обычной реплики: пунктирная рамка без заливки.
    ".ca-msg.a.n{max-width:92%;background:none;border:1px dashed rgba(255,255,255,.18);color:rgba(242,243,247,.66);font-size:12.5px;line-height:1.5;}" +
    /* — вход в шапке — */
    ".ca-hdr{display:inline-flex;align-items:center;gap:7px;height:30px;margin-left:10px;padding:0 13px 0 10px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:#14161C;color:#F2F3F7;font-family:'Onest',system-ui,sans-serif;font-size:13px;font-weight:500;white-space:nowrap;cursor:pointer;flex:none;transition:border-color .2s,background .2s;}" +
    ".ca-hdr:hover{border-color:rgba(238,125,27,.7);background:rgba(238,125,27,.08);}" +
    ".ca-hdr:focus-visible,.ca-tab:focus-visible,.ca-dock-go:focus-visible,.ca-tz button:focus-visible,.ca-strip button:focus-visible,.ca-stand a:focus-visible{outline:2px solid #EE7D1B;outline-offset:3px;}" +
    ".ca-hdr svg{flex:none;}" +
    // Шапка заполнена до предела: у контейнера 1280px свободно ~99px (их сейчас берёт поле
    // поиска), на 901–1199 — ноль. Полное «AI-ассистент» (128px) выталкивало «Доску» за
    // край, поэтому в шапке — компактное «✦ AI», и только от 1200px.
    "@media(max-width:1199px){.ca-hdr{display:none;}}" +
    /* — D: строка-вопрос внизу по центру (на телефоне — пилюля без поля) — */
    ".ca-dock{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:300;display:flex;align-items:center;gap:10px;width:600px;max-width:calc(100vw - 32px);height:56px;margin:0;padding:0 8px 0 18px;box-sizing:border-box;border-radius:999px;background:#14161C;border:1px solid rgba(255,255,255,.16);box-shadow:0 14px 40px rgba(0,0,0,.55);font-family:'Onest',system-ui,sans-serif;color:#F2F3F7;transition:border-color .2s;}" +
    ".ca-dock:hover,.ca-dock:focus-within{border-color:rgba(238,125,27,.7);}" +
    ".ca-dock.hide{display:none;}" +
    ".ca-dock>svg{flex:none;}" +
    ".ca-dock-tag{flex:none;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:500;letter-spacing:.08em;color:#8FB3F0;border:1px solid rgba(79,134,230,.42);border-radius:5px;padding:2px 5px;}" +
    ".ca-dock-in{flex:1;min-width:0;background:none;border:0;outline:none;color:#F2F3F7;font-family:inherit;font-size:15px;line-height:1.3;padding:0;}" +
    ".ca-dock-in::placeholder{color:rgba(242,243,247,.56);}" +
    ".ca-dock-go{flex:none;display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 16px;border:0;border-radius:999px;background:#EE7D1B;color:#0C0A08;font-family:inherit;font-size:13.5px;font-weight:600;cursor:pointer;transition:background .15s;}" +
    ".ca-dock-go:hover{background:#F58E33;}.ca-dock-go svg{width:14px;height:14px;}" +
    ".ca-dock-lbl{display:none;}" +
    ".ca-panel.dock{right:auto;left:50%;bottom:20px;transform:translate(-50%,14px) scale(.98);}" +
    ".ca-panel.dock.on{transform:translate(-50%,0);}" +
    // Строка закрывает низ страницы — отодвигаем подвал, чтобы последние строки читались.
    "@media(min-width:861px){html.ca-dock-pad body{padding-bottom:88px;}}" +
    "@media(max-width:860px){.ca-dock{width:auto;max-width:none;height:50px;padding:0 18px 0 14px;gap:9px;cursor:pointer;}" +
    ".ca-dock-in,.ca-dock-go,.ca-dock-tag{display:none;}" +
    ".ca-dock-lbl{display:block;font-size:14.5px;font-weight:600;line-height:1.15;white-space:nowrap;text-align:left;}" +
    ".ca-dock-lbl small{display:block;margin-top:2px;font-size:11.5px;font-weight:400;line-height:1.2;color:rgba(242,243,247,.66);}}" +
    "@media(max-width:480px){.ca-panel.dock,.ca-panel.dock.on{left:8px;right:8px;bottom:8px;transform:none;}}" +
    /* — E: язычок на правом краю + шторка во всю высоту — */
    ".ca-tab{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:300;display:flex;flex-direction:column;align-items:center;gap:9px;width:42px;padding:14px 0 13px;border:1px solid rgba(255,255,255,.16);border-right:0;border-radius:12px 0 0 12px;background:#14161C;color:#F2F3F7;box-shadow:-8px 0 28px rgba(0,0,0,.45);cursor:pointer;font-family:'Onest',system-ui,sans-serif;transition:border-color .2s,transform .2s,background .2s;}" +
    ".ca-tab:hover{border-color:rgba(238,125,27,.7);background:#181A21;transform:translateY(-50%) translateX(-2px);}" +
    ".ca-tab.hide{display:none;}" +
    ".ca-tab svg{flex:none;}" +
    ".ca-tab .vt,.ca-tab .vs{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;}" +
    ".ca-tab .vt{font-size:13px;font-weight:500;letter-spacing:.03em;}" +
    ".ca-tab .vs{display:none;font-size:12px;font-weight:600;letter-spacing:.06em;}" +
    ".ca-panel.drawer{top:0;right:0;bottom:0;height:auto;max-height:none;width:420px;max-width:100vw;border-radius:0;border:0;border-left:1px solid rgba(255,255,255,.12);box-shadow:-24px 0 70px rgba(0,0,0,.55);transform:translateX(28px);}" +
    ".ca-panel.drawer.on{transform:none;}" +
    "@media(max-width:860px){.ca-tab{top:auto;bottom:112px;transform:none;width:38px;padding:12px 0 10px;}" +
    ".ca-tab:hover{transform:translateX(-2px);}.ca-tab .vt{display:none;}.ca-tab .vs{display:block;}}" +
    "@media(max-width:480px){.ca-panel.drawer,.ca-panel.drawer.on{left:0;right:0;bottom:0;width:100vw;height:auto;border-left:0;}}" +
    /* — подсказка-выноска у язычка (E): появляется через ~3,5 с, уходит сама — */
    ".ca-tz{position:fixed;z-index:299;background:#14161C;border:1px solid rgba(238,125,27,.45);border-radius:14px;box-shadow:0 18px 48px rgba(0,0,0,.55);font-family:'Onest',system-ui,sans-serif;color:#F2F3F7;opacity:0;transition:opacity .35s cubic-bezier(.16,1,.3,1),transform .5s cubic-bezier(.16,1,.3,1);}" +
    ".ca-tz.on{opacity:1;}" +
    ".ca-tz-x{position:absolute;top:4px;right:4px;width:40px;height:40px;border:0;background:none;color:rgba(242,243,247,.55);font-size:19px;line-height:1;cursor:pointer;border-radius:10px;}" +
    ".ca-tz-x:hover{color:#F2F3F7;background:rgba(255,255,255,.06);}" +
    ".ca-tz.e{right:54px;top:50%;transform:translate(10px,-50%);width:310px;max-width:calc(100vw - 70px);padding:14px 40px 14px 16px;}" +
    ".ca-tz.e.on{transform:translate(0,-50%);}" +
    ".ca-tz.e::after{content:'';position:absolute;right:-6px;top:50%;width:10px;height:10px;margin-top:-5px;background:#14161C;border-top:1px solid rgba(238,125,27,.45);border-right:1px solid rgba(238,125,27,.45);transform:rotate(45deg);}" +
    ".ca-tz .say{display:flex;gap:9px;align-items:flex-start;font-size:13.5px;line-height:1.5;}" +
    ".ca-tz .say svg{flex:none;margin-top:3px;}" +
    ".ca-tz .say b{font-weight:500;color:#F0AE72;}" +
    ".ca-tz .go{margin:11px 0 0 27px;height:36px;padding:0 15px;border:0;border-radius:999px;background:#EE7D1B;color:#0C0A08;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s;}" +
    ".ca-tz .go:hover{background:#F58E33;}" +
    "@media(max-width:860px){.ca-tz.e{top:auto;bottom:112px;right:50px;transform:translate(10px,0);}.ca-tz.e.on{transform:none;}.ca-tz.e::after{top:auto;bottom:24px;margin-top:0;}}" +
    /* — F: полоса под шапкой (в потоке, уезжает со страницей; крестик — до конца визита) — */
    ".ca-strip{position:relative;z-index:2;background:rgba(238,125,27,.08);border-bottom:1px solid rgba(238,125,27,.25);font-family:'Onest',system-ui,sans-serif;color:#F2F3F7;}" +
    ".ca-strip-in{max-width:1280px;margin:0 auto;padding:8px 56px 8px 20px;box-sizing:border-box;display:flex;align-items:center;gap:12px;min-height:44px;position:relative;}" +
    ".ca-strip svg{flex:none;}" +
    ".ca-strip .t{font-size:13.5px;line-height:1.4;}.ca-strip .t b{font-weight:600;}" +
    ".ca-strip .go{flex:none;height:32px;padding:0 14px;border:0;border-radius:999px;background:#EE7D1B;color:#0C0A08;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s;}" +
    ".ca-strip .go:hover{background:#F58E33;}" +
    ".ca-strip .x{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:40px;height:40px;border:0;background:none;color:rgba(242,243,247,.6);font-size:19px;line-height:1;cursor:pointer;border-radius:10px;}" +
    ".ca-strip .x:hover{color:#F2F3F7;background:rgba(255,255,255,.06);}" +
    // На телефоне кнопке «Спросить» места нет (текст уходил в три строки) — тапается вся полоса,
    // приглашение стоит в конце фразы.
    ".ca-strip .t .m,.ca-strip .t .xs{display:none;}" +
    "@media(max-width:860px){.ca-strip-in{padding:10px 44px 10px 16px;gap:10px;cursor:pointer;}.ca-strip .t{font-size:13px;}.ca-strip .go,.ca-strip .t .xl{display:none;}.ca-strip .t .xs{display:inline;}.ca-strip .t .m{display:inline;color:#F58E33;font-weight:600;white-space:nowrap;}}" +
    "@media(max-width:480px){.ca-btn.lab{right:12px;bottom:12px;height:50px;padding:0 17px 0 13px;}}" +
    "@media(prefers-reduced-motion:reduce){.ca-tz,.ca-panel.dock,.ca-panel.drawer,.ca-tab{transition:none;}}" +
    /* — переключатель стенда (только localhost) — */
    ".ca-stand{position:fixed;left:12px;bottom:12px;z-index:100001;display:flex;align-items:center;gap:3px;padding:4px;border-radius:12px;background:#0B0C10;border:1px solid rgba(255,255,255,.2);font:500 12px 'JetBrains Mono',monospace;box-shadow:0 8px 24px rgba(0,0,0,.5);}" +
    ".ca-stand span{color:rgba(242,243,247,.55);padding:0 6px;}" +
    ".ca-stand a{color:rgba(242,243,247,.8);text-decoration:none;padding:8px 10px;border-radius:8px;}" +
    ".ca-stand a.on{background:#EE7D1B;color:#0C0A08;}";

  function inject() {
    if (document.getElementById("ca-css")) return;
    var s = document.createElement("style"); s.id = "ca-css"; s.textContent = css;
    document.head.appendChild(s);
  }

  /* фирменная 4-лучевая звезда (одна, без «искр-компаньонов» — это знак дома, не спарклы) */
  var ICON_STARS =
    '<svg width="24" height="24" viewBox="0 0 26 26" fill="none" aria-hidden="true">' +
    '<path d="M13 1 L15.6 10.4 L25 13 L15.6 15.6 L13 25 L10.4 15.6 L1 13 L10.4 10.4 Z" fill="#EE7D1B"/></svg>';
  var ICON_STAR_SM =
    '<svg width="18" height="18" viewBox="0 0 26 26" fill="none" aria-hidden="true">' +
    '<path d="M13 1 L15.6 10.4 L25 13 L15.6 15.6 L13 25 L10.4 15.6 L1 13 L10.4 10.4 Z" fill="#EE7D1B"/></svg>';
  var ICON_STAR_XS =
    '<svg width="9" height="9" viewBox="0 0 26 26" fill="none" aria-hidden="true">' +
    '<path d="M13 1 L15.6 10.4 L25 13 L15.6 15.6 L13 25 L10.4 15.6 L1 13 L10.4 10.4 Z" fill="#EE7D1B"/></svg>';
  var ICON_SEND = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
  var ICON_CHAT = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6A8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z"/></svg>';

  var msgs = [];         // {role, content}; живёт в sessionStorage — диалог не теряется при переходах
  try {
    var saved = JSON.parse(sessionStorage.getItem(STORE) || "[]");
    if (Array.isArray(saved)) msgs = saved.filter(function (m) { return m && m.content && (m.role === "user" || m.role === "assistant"); });
  } catch (e) {}
  function saveChat() { try { sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-30))); } catch (e) {} }
  var busy = false;
  var locked = false;    // достигнут лимит вопросов
  var els = {};

  function goal(name) {
    if (typeof window.ym === "function") { try { window.ym(CFG.metrikaId, "reachGoal", name); } catch (e) {} }
  }

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  /* ИИ любит markdown-жирный — рендерим **…** как <b>, остальное экранируем */
  function fmt(s) { return esc(s).replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>"); }

  function addMsg(role, text) {
    var d = document.createElement("div");
    d.className = "ca-msg " + (role === "user" ? "u" : "a");
    d.innerHTML = role === "user" ? esc(text) : fmt(text);
    els.log.appendChild(d);
    els.log.scrollTop = els.log.scrollHeight;
    return d;
  }

  function showSuggestions() {
    var box = document.createElement("div");
    box.className = "ca-sug";
    suggestions().forEach(function (q) {
      var b = document.createElement("button");
      b.type = "button";
      b.innerHTML = ICON_STAR_XS + esc(q);
      b.addEventListener("click", function () { els.input.value = q; send(); });
      box.appendChild(b);
    });
    els.log.appendChild(box);
    els.sug = box;
    els.log.scrollTop = els.log.scrollHeight;
  }

  // Фразы ожидания: ответ провайдера идёт от ~2 до ~15 c, и статичное «думаю» на такой
  // паузе читается как «зависло». Тексты честные — агент действительно получает каталог
  // продуктов в промпте и отвечает по нему.
  var TYPING_PHASES = [
    { at: 0, text: "думаю" },
    { at: 1800, text: "читаю каталог продуктов" },
    { at: 4500, text: "сверяю параметры выпусков" },
    { at: 8000, text: "формулирую ответ" },
    { at: 12000, text: "почти готово" }
  ];

  function showTyping() {
    var t = document.createElement("div");
    t.className = "ca-typing";
    t.innerHTML = '<span class="tl"><span class="tx">' + TYPING_PHASES[0].text +
                  '</span><span class="cur">▍</span></span><span class="tb"></span>';
    els.log.appendChild(t); els.log.scrollTop = els.log.scrollHeight;

    var tx = t.querySelector(".tx"), t0 = Date.now(), i = 0;
    var timer = setInterval(function () {
      // индикатор убрали (пришёл ответ/ошибка) — сами гасим таймер, без правок в вызовах
      if (!t.parentNode) { clearInterval(timer); return; }
      var next = i + 1;
      if (next >= TYPING_PHASES.length) return;
      if (Date.now() - t0 < TYPING_PHASES[next].at) return;
      i = next;
      tx.style.opacity = "0";
      setTimeout(function () {
        if (!t.parentNode) return;
        tx.textContent = TYPING_PHASES[i].text;
        tx.style.opacity = "1";
      }, 160);
    }, 400);
    return t;
  }

  function fallbackReply() {
    return 'Извините, ассистент сейчас недоступен. Напишите нам в Telegram: ' +
      '<a href="https://t.me/' + CFG.botUser + '" target="_blank" rel="noopener">@' + CFG.botUser + '</a> — менеджер ответит.';
  }

  function regionReply() {
    return 'Чат-ассистент пока доступен не во всех регионах. Но я подключу вас к менеджеру — ' +
      'напишите в Telegram: <a href="https://t.me/' + CFG.botUser + '" target="_blank" rel="noopener">@' + CFG.botUser +
      '</a>, ответим на любой вопрос по продуктам.';
  }

  function showLeadForm() {
    var existing = els.log.querySelector(".ca-lead-contact");
    if (existing) { existing.focus(); els.log.scrollTop = els.log.scrollHeight; return; }
    var box = document.createElement("div");
    box.className = "ca-lead";
    box.innerHTML =
      '<div class="ca-lead-t">Оставьте контакт — менеджер Rumberg свяжется и ответит детально. Диалог с ассистентом приложим.</div>' +
      '<input class="ca-lead-name" placeholder="Имя (необязательно)" aria-label="Имя">' +
      '<input class="ca-lead-contact" placeholder="Telegram, телефон или email" aria-label="Контакт">' +
      '<button class="ca-lead-send" type="button">Отправить заявку</button>';
    els.log.appendChild(box);
    els.log.scrollTop = els.log.scrollHeight;
    var contactEl = box.querySelector(".ca-lead-contact");
    var nameEl = box.querySelector(".ca-lead-name");
    var btn = box.querySelector(".ca-lead-send");
    contactEl.focus();
    btn.addEventListener("click", function () {
      var contact = contactEl.value.trim();
      if (!contact) { contactEl.focus(); return; }
      btn.disabled = true; btn.textContent = "Отправляем…";
      var transcript = msgs.slice(-8).map(function (m) {
        return (m.role === "user" ? "Клиент" : "Ассистент") + ": " + m.content;
      }).join("\n");
      var ref = ""; try { ref = localStorage.getItem("so_ref") || ""; } catch (e) {}
      fetch(CFG.endpoint.replace(/\/chat$/, "/lead"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameEl.value.trim(), contact: contact, product: "Вопрос из AI-чата", url: location.href, chat: transcript, ref: ref })
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function (d) {
          if (!d || !d.ok) throw 0;
          box.innerHTML = '<div class="ca-lead-ok">Готово! Менеджер Rumberg свяжется с вами. Можно и сразу написать: <a href="https://t.me/' + CFG.botUser + '" target="_blank" rel="noopener">@' + CFG.botUser + '</a></div>';
          goal("chat_lead");
        })
        .catch(function () {
          box.innerHTML = '<div class="ca-lead-ok">Не получилось отправить. Напишите напрямую: <a href="https://t.me/' + CFG.botUser + '" target="_blank" rel="noopener">@' + CFG.botUser + '</a></div>';
        });
    });
  }

  function lockChat() {
    if (locked) return;
    locked = true;
    els.input.disabled = true;
    els.input.placeholder = "Лимит вопросов достигнут";
    els.send.disabled = true;
    var box = document.createElement("div");
    box.className = "ca-lead";
    box.innerHTML =
      '<div class="ca-lead-t">Вы задали максимум вопросов в этом чате. Чтобы продолжить и обсудить детали — свяжитесь с менеджером Rumberg в Telegram.</div>' +
      '<a class="ca-lead-send" style="text-decoration:none;text-align:center;display:block" href="https://t.me/' + CFG.botUser + '" target="_blank" rel="noopener">Написать в Telegram</a>';
    els.log.appendChild(box);
    els.log.scrollTop = els.log.scrollHeight;
    goal("chat_limit");
  }

  function send() {
    if (busy || locked) return;
    var text = els.input.value.trim();
    if (!text) return;
    els.input.value = ""; els.input.style.height = "auto";
    if (els.sug) { els.sug.remove(); els.sug = null; }
    msgs.push({ role: "user", content: text });
    saveChat();
    addMsg("user", text);
    goal("chat_send");
    var qCount = msgs.filter(function (m) { return m.role === "user"; }).length;
    busy = true; els.send.disabled = true;
    var typing = showTyping();

    // Демо-режим (только локально): ?chatdemo=blocked — вид для заблокированного региона;
    // ?chatdemo=ok — обычный ответ. Реального обращения к бэкенду не делает.
    var demo = (location.search.match(/[?&]chatdemo=(\w+)/) || [])[1];
    if (demo) {
      setTimeout(function () {
        typing.remove();
        if (demo === "blocked") {
          addMsg("assistant", "").innerHTML = regionReply();
        } else {
          var r = "Кратко: **облигация с защитой капитала** гарантирует возврат не менее заданной доли номинала на погашении и добавляет участие в росте базового актива — риск ограничен. **Автоколл** платит повышенный купон и может досрочно погаситься при росте актива, но защиты номинала обычно нет — риск выше. (демо-ответ)";
          msgs.push({ role: "assistant", content: r }); saveChat(); addMsg("assistant", r);
        }
        busy = false; els.send.disabled = false; els.input.focus();
        if (qCount >= CFG.msgLimit) lockChat();
      }, 700);
      return;
    }

    // stream — печатать ответ по мере генерации (см. CFG.stream; сейчас выключено).
    // Воркер при stream:false отвечает обычным JSON; различаем ниже по Content-Type.
    var payload = { messages: msgs.slice(-20), stream: !!CFG.stream, page: { title: document.title, url: location.href } };
    // Рабочий стол партнёра (CHAT_SETUP.partner): прикладываем пару входа — воркер
    // проверит её и покажет ассистенту выпуски партнёра. Без пары чат работает как
    // обычно, поэтому отказ localStorage молча игнорируем.
    if (SETUP.partner) {
      try {
        var pid = localStorage.getItem("so_me"), pkey = localStorage.getItem("so_me_key");
        if (pid && pkey) payload.partner = { id: pid, key: pkey };
      } catch (e) {}
    }
    // Гейт квалинвестора пройден — воркер разрешит расчёт CALL/PUT в чате (см. qualOk).
    if (qualOk()) payload.qual = true;
    fetch(CFG.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        if (!r.ok) return Promise.reject(r.status);
        var ct = r.headers.get("content-type") || "";
        var canStream = r.body && typeof r.body.getReader === "function" && typeof window.TextDecoder === "function";
        if (ct.indexOf("text/event-stream") >= 0 && canStream) return readStream(r, typing);
        return r.json().then(function (data) { handleReply(data, typing); });
      })
      .catch(function () {
        if (typing.parentNode) typing.remove();
        var d = addMsg("assistant", ""); d.innerHTML = fallbackReply();
      })
      .finally(function () { busy = false; els.send.disabled = false; els.input.focus(); if (qCount >= CFG.msgLimit) lockChat(); });
  }

  /* Обычный (нестримовый) ответ — как было */
  function handleReply(data, typing) {
    if (typing.parentNode) typing.remove();
    var reply = (data && data.reply) ? data.reply : "";
    if (reply) { msgs.push({ role: "assistant", content: reply }); saveChat(); addMsg("assistant", reply); }
    else if (data && data.error === "region_unavailable") { addMsg("assistant", "").innerHTML = regionReply(); }
    else { addMsg("assistant", "").innerHTML = fallbackReply(); }
  }

  /* Достаём кусок текста из события SSE. Воркер пробрасывает поток провайдера как есть
     (без своего JS в петле — так надёжнее), поэтому формат зависит от провайдера:
     deepseek (OpenAI-совместимый) → choices[0].delta.content, Anthropic → delta.text.
     Плюс поддерживаем прежний протокол воркера {"t":…} — на случай другой версии. */
  function sseText(j) {
    if (typeof j.t === "string") return j.t;                                  // прежний протокол
    if (j.delta && typeof j.delta.text === "string") return j.delta.text;     // anthropic
    var c = j.choices && j.choices[0];                                        // openai-совместимый
    if (c && c.delta && typeof c.delta.content === "string") return c.delta.content;
    return "";
  }

  /* Стрим: текст дописываем в пузырь по мере поступления. **жирный** может прийти
     разорванным по кускам, поэтому каждый раз перерисовываем весь накопленный текст. */
  function readStream(r, typing) {
    var reader = r.body.getReader(), dec = new TextDecoder();
    var buf = "", acc = "", bubble = null, errCode = "";

    function handleLine(raw) {
      var line = raw.trim();
      if (line.indexOf("data:") !== 0) return;
      var payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") return;   // конец потока у OpenAI-совместимых
      var j;
      try { j = JSON.parse(payload); } catch (e) { return; }
      if (j.error) { errCode = typeof j.error === "string" ? j.error : "upstream"; return; }
      var piece = sseText(j);
      if (piece) {
        if (!bubble) { if (typing.parentNode) typing.remove(); bubble = addMsg("assistant", ""); }
        acc += piece;
        bubble.innerHTML = fmt(acc);
        els.log.scrollTop = els.log.scrollHeight;
      }
    }

    function finish() {
      if (typing.parentNode) typing.remove();
      if (acc) { msgs.push({ role: "assistant", content: acc }); saveChat(); }
      else if (errCode === "region_unavailable") { addMsg("assistant", "").innerHTML = regionReply(); }
      else { addMsg("assistant", "").innerHTML = fallbackReply(); }
    }

    function pump() {
      return reader.read().then(function (res) {
        if (res.done) { if (buf) handleLine(buf); finish(); return; }
        buf += dec.decode(res.value, { stream: true });
        var lines = buf.split("\n");
        buf = lines.pop();
        lines.forEach(handleLine);
        return pump();
      });
    }
    return pump();
  }

  function build() {
    inject();
    var limOv = parseInt(((location.search.match(/[?&]chatlimit=(\d+)/) || [])[1]) || "0", 10);
    if (limOv > 0) CFG.msgLimit = limOv;  // локальное демо: ?chatlimit=2

    var ICON_STAR_HDR = '<svg width="13" height="13" viewBox="0 0 26 26" aria-hidden="true">' +
      '<path d="M13 1 L15.6 10.4 L25 13 L15.6 15.6 L13 25 L10.4 15.6 L1 13 L10.4 10.4 Z" fill="#EE7D1B"/></svg>';
    var ICON_STAR_20 = '<svg width="20" height="20" viewBox="0 0 26 26" aria-hidden="true">' +
      '<path d="M13 1 L15.6 10.4 L25 13 L15.6 15.6 L13 25 L10.4 15.6 L1 13 L10.4 10.4 Z" fill="#EE7D1B"/></svg>';
    var ICON_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
    var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var MOBILE = window.matchMedia && window.matchMedia("(max-width: 860px)").matches;

    // Вход в ассистента — по варианту стенда: 0 и F — кнопка в углу (F — с подписью),
    // D — строка-вопрос внизу по центру, E — язычок на правом краю. Пока панель открыта,
    // вход спрятан (класс hide), как раньше пряталась кнопка.
    var entry, dockIn = null;
    if (LOOK === "d") {
      entry = document.createElement("form");
      entry.className = "ca-dock";
      entry.setAttribute("aria-label", "Вопрос AI-ассистенту");
      entry.innerHTML = ICON_STAR_20 + '<span class="ca-dock-tag">AI</span>' +
        '<input class="ca-dock-in" type="text" autocomplete="off" aria-label="Вопрос AI-ассистенту" placeholder="Спросите о продукте, цене или сайте…">' +
        '<span class="ca-dock-lbl">Спросить AI<small>' + CAN_LIST + '</small></span>' +
        '<button class="ca-dock-go" type="submit">Спросить' + ICON_ARROW + '</button>';
      dockIn = entry.querySelector(".ca-dock-in");
      document.documentElement.classList.add("ca-dock-pad");
    } else if (LOOK === "e") {
      entry = document.createElement("button");
      entry.type = "button"; entry.className = "ca-tab";
      entry.setAttribute("aria-label", "Открыть AI-ассистента");
      entry.innerHTML = ICON_STAR_SM + '<span class="vt">AI-ассистент</span><span class="vs">AI</span>';
    } else {
      entry = document.createElement("button");
      entry.type = "button"; entry.className = "ca-btn";
      entry.setAttribute("aria-label", "Открыть AI-ассистента");
      if (LOOK === "0") entry.innerHTML = ICON_STARS + '<span class="ca-ai">AI</span>';
      else {
        entry.classList.add("lab");
        entry.innerHTML = ICON_STARS + '<span class="lt"><span class="l1">Спросить AI</span><span class="l2">' + CAN_LIST + '</span></span>';
      }
    }

    var panel = document.createElement("div");
    panel.className = "ca-panel" + (LOOK === "d" ? " dock" : LOOK === "e" ? " drawer" : "");
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "AI-ассистент");
    panel.innerHTML =
      '<div class="ca-head">' +
        '<span class="ca-ava">' + ICON_STAR_SM + '</span>' +
        '<div><div class="ca-ttl-row"><span class="ca-ttl">AI-ассистент</span><span class="ca-chip">beta</span></div>' +
        '<div class="ca-sub">Rumberg · структурные продукты</div></div>' +
        '<button class="ca-x" aria-label="Закрыть">&times;</button></div>' +
      '<div class="ca-log" role="log" aria-live="polite" aria-label="Диалог с ассистентом"></div>' +
      '<div class="ca-foot">' +
        (SETUP.desk ? "" : '<button class="ca-discuss" type="button">' + ICON_CHAT + 'Обсудить с Румбергом</button>') +
        '<div class="ca-row">' +
        '<textarea class="ca-in" rows="1" placeholder="Спросите про продукт…" aria-label="Сообщение"></textarea>' +
        '<button class="ca-send" aria-label="Отправить">' + ICON_SEND + '</button>' +
      '</div><div class="ca-note">Отвечает ИИ — может ошибаться · Не является индивидуальной инвестиционной рекомендацией</div></div>';

    document.body.appendChild(entry);
    document.body.appendChild(panel);

    els.log = panel.querySelector(".ca-log");
    els.input = panel.querySelector(".ca-in");
    els.send = panel.querySelector(".ca-send");

    var opened = false;
    function open() {
      panel.classList.add("on"); entry.classList.add("hide");
      hideTeaser(true);   // чат открыт — подсказка и полоса своё дело сделали, до конца визита не нужны
      hideStrip(true);
      if (LOOK !== "0" && qualOk()) els.input.placeholder = "Спросите про продукт, цену или сайт…";
      if (!opened) {
        opened = true;
        addMsg("assistant", greeting());
        // Оговорка про CALL/PUT — ЗДЕСЬ, а не на заставке: второй репликой, тише первой.
        var note = priceNote();
        if (note) addMsg("assistant", note).classList.add("n");
        if (msgs.length) {
          // Восстанавливаем диалог, начатый на другой странице (sessionStorage)
          msgs.forEach(function (m) { addMsg(m.role, m.content); });
          if (msgs.filter(function (m) { return m.role === "user"; }).length >= CFG.msgLimit) lockChat();
        } else {
          showSuggestions();
        }
        goal("chat_open");
      }
      setTimeout(function () { els.input.focus(); }, 150);
    }
    function close() { panel.classList.remove("on"); entry.classList.remove("hide"); }

    // Открыть чат и сразу задать вопрос: примеры на заставке показывают работу делом.
    function ask(text) {
      open();
      if (busy || locked) return;
      els.input.value = text;
      send();
    }

    if (LOOK === "d") {
      entry.addEventListener("submit", function (e) {
        e.preventDefault();
        var t = dockIn.value.trim();
        dockIn.value = "";
        goal(t ? "chat_dock_ask" : "chat_dock_open");
        if (t) ask(t); else open();
      });
      // На телефоне строка — пилюля без поля: тап по ней открывает чат.
      entry.addEventListener("click", function (e) {
        if (e.target === dockIn || (e.target.closest && e.target.closest(".ca-dock-go"))) return;
        if (getComputedStyle(dockIn).display === "none") { goal("chat_dock_open"); open(); }
        else dockIn.focus();
      });
    } else {
      entry.addEventListener("click", open);
    }
    panel.querySelector(".ca-x").addEventListener("click", close);
    var disc = panel.querySelector(".ca-discuss");
    if (disc) disc.addEventListener("click", showLeadForm);
    els.send.addEventListener("click", send);
    els.input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });
    els.input.addEventListener("input", function () {
      els.input.style.height = "auto";
      els.input.style.height = Math.min(els.input.scrollHeight, 96) + "px";
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("on")) close(); });

    window.Chat = { open: open, close: close, ask: ask };

    // ---------- Заставка: вход в шапке, бегущие примеры в строке (D), выноска у язычка (E), полоса (F) ----------
    function mountHeader() {
      if (LOOK === "0" || SETUP.desk) return;
      var navIn = document.querySelector(".nav-in");
      if (!navIn || navIn.querySelector(".ca-hdr")) return;
      var after = navIn.querySelector(".nav-about");
      if (!after) {
        after = navIn.querySelector(".brand") || navIn.querySelector(".name");
        var tag = after && after.nextElementSibling;
        if (tag && tag.classList && tag.classList.contains("brand-tag")) after = tag;
      }
      if (!after) return;
      var h = document.createElement("button");
      h.type = "button";
      h.className = "ca-hdr";
      h.setAttribute("aria-label", "Спросить AI-ассистента");
      h.title = "AI-ассистент: продукты, цены, навигация по сайту";
      h.innerHTML = ICON_STAR_HDR + "<span>AI</span>";
      h.addEventListener("click", function () { goal("chat_header"); open(); });
      after.insertAdjacentElement("afterend", h);
    }

    // D: примеры вопросов «печатаются» в подсказке поля — три умения подряд, два круга,
    // потом поле успокаивается. Пока поле в фокусе или в нём текст — не трогаем. При
    // reduced-motion — статичная подсказка.
    function runDockPrompts() {
      if (!dockIn || REDUCED) return;
      var list = examples(), round = 0, idx = 0, stopped = false;
      var STATIC = dockIn.placeholder;
      function idle() { return document.activeElement === dockIn || dockIn.value; }
      function next() {
        if (stopped || !dockIn.isConnected) return;
        if (getComputedStyle(dockIn).display === "none") { setTimeout(next, 1500); return; }
        if (idle()) { setTimeout(next, 1200); return; }
        if (round >= 2) { dockIn.placeholder = STATIC; return; }
        var text = list[idx], i = 0;
        (function step() {
          if (stopped || !dockIn.isConnected) return;
          if (idle()) { dockIn.placeholder = STATIC; setTimeout(next, 1200); return; }
          dockIn.placeholder = text.slice(0, ++i);
          if (i < text.length) setTimeout(step, 34 + Math.random() * 30);
          else setTimeout(function () {
            idx = (idx + 1) % list.length; if (idx === 0) round++;
            next();
          }, 2300);
        })();
      }
      setTimeout(next, 1400);
    }

    var tz = null;
    function tzOff() { try { return sessionStorage.getItem("ca_tz_off") === "1"; } catch (e) { return false; } }
    function hideTeaser(forVisit) {
      if (forVisit) { try { sessionStorage.setItem("ca_tz_off", "1"); } catch (e) {} }
      if (!tz) return;
      var node = tz; tz = null;
      node.classList.remove("on");
      setTimeout(function () { node.remove(); }, REDUCED ? 0 : 400);
    }

    // E: выноска от язычка — одна реплика о трёх умениях и кнопка. Уходит сама через
    // 12 с (крестик — до конца визита, кнопка — открывает чат).
    function showTeaser() {
      if (tz || panel.classList.contains("on")) return;
      tz = document.createElement("div");
      tz.className = "ca-tz e";
      tz.setAttribute("role", "complementary");
      tz.setAttribute("aria-label", "AI-ассистент");
      tz.innerHTML = '<button class="ca-tz-x" type="button" aria-label="Скрыть подсказку">&times;</button>' +
        '<div class="say">' + ICON_STAR_HDR + '<span>Я AI-ассистент Rumberg: объясню продукт, ' +
        (qualOk() ? 'посчитаю цену опциона' : 'сориентирую по ценам') + ' и подскажу, где что на сайте.</span></div>' +
        '<button class="go" type="button">Спросить</button>';
      document.body.appendChild(tz);
      tz.querySelector(".ca-tz-x").addEventListener("click", function () { goal("chat_teaser_close"); hideTeaser(true); });
      tz.querySelector(".go").addEventListener("click", function () { goal("chat_teaser_open"); open(); });
      // Проявление: пересчёт раскладки фиксирует стартовое состояние, класс — на таймере.
      // Двойной requestAnimationFrame тут не годится: в фоновой вкладке кадры придерживаются,
      // и подсказка оставалась прозрачной до возврата на вкладку.
      void tz.offsetWidth;
      setTimeout(function () { if (tz) tz.classList.add("on"); }, 30);
      setTimeout(function () { hideTeaser(false); }, 12000);
      goal("chat_teaser_show");
    }

    // Выноска — на каждой странице, через ~3,5 с. Не всплывает поверх гейта, интро-ролика
    // и открытого чата; закрыли крестиком или уже пользовались чатом — больше не показываем.
    function scheduleTeaser() {
      if (LOOK !== "e" || SETUP.desk || tzOff()) return;
      if (msgs.some(function (m) { return m.role === "user"; })) return;
      var t0 = Date.now();
      (function wait() {
        if (tz || tzOff()) return;
        var blocked = document.querySelector(".qg-veil") || document.querySelector(".intro") ||
          document.body.classList.contains("intro-lock") || panel.classList.contains("on");
        if (blocked || Date.now() - t0 < 3500) {
          if (Date.now() - t0 < 180000) setTimeout(wait, 600);
          return;
        }
        showTeaser();
      })();
    }

    // F: полоса под шапкой — в потоке страницы, уезжает с прокруткой. Ширина и поля — как у
    // контейнера шапки, чтобы текст стоял на той же вертикали. На телефонной главной
    // (экраны-«рилсы» по высоте окна) полосу не ставим — она сбила бы высоту первого экрана.
    var strip = null;
    function stripOff() { try { return sessionStorage.getItem("ca_strip_off") === "1"; } catch (e) { return false; } }
    function hideStrip(forVisit) {
      if (forVisit) { try { sessionStorage.setItem("ca_strip_off", "1"); } catch (e) {} }
      if (strip) { strip.remove(); strip = null; }
    }
    function mountStrip() {
      if (LOOK !== "f" || SETUP.desk || stripOff()) return;
      if (msgs.some(function (m) { return m.role === "user"; })) return;
      var nav = document.querySelector("header.nav, .nav");
      if (!nav || !nav.parentNode) return;
      if (MOBILE && document.querySelector(".mx-root")) return;
      strip = document.createElement("div");
      strip.className = "ca-strip";
      strip.setAttribute("role", "complementary");
      strip.setAttribute("aria-label", "AI-ассистент");
      strip.innerHTML = '<div class="ca-strip-in">' + ICON_STAR_HDR +
        '<span class="t"><b>AI-ассистент<span class="xl"> Rumberg</span></b><span class="xl"> — объяснит продукт, ' +
        (qualOk() ? 'посчитает цену опциона' : 'сориентирует по ценам') + ' и подскажет, где что на сайте.</span>' +
        '<span class="xs">: продукты, ' + (qualOk() ? 'цена опциона' : 'цены') + ', где что на сайте.</span> <b class="m">Спросить →</b></span>' +
        '<button class="go" type="button">Спросить</button>' +
        '<button class="x" type="button" aria-label="Скрыть">&times;</button></div>';
      var navIn = nav.querySelector(".nav-in");
      if (navIn) {
        var cs = getComputedStyle(navIn), inn = strip.firstChild;
        if (cs.maxWidth && cs.maxWidth !== "none") inn.style.maxWidth = cs.maxWidth;
        if (!MOBILE) { inn.style.paddingLeft = cs.paddingLeft; inn.style.paddingRight = "calc(" + cs.paddingRight + " + 36px)"; }
      }
      strip.querySelector(".go").addEventListener("click", function () { goal("chat_strip_open"); open(); });
      strip.querySelector(".ca-strip-in").addEventListener("click", function (e) {
        if (e.target.closest && (e.target.closest(".x") || e.target.closest(".go"))) return;
        if (MOBILE) { goal("chat_strip_open"); open(); }
      });
      strip.querySelector(".x").addEventListener("click", function () { goal("chat_strip_close"); hideStrip(true); });
      nav.insertAdjacentElement("afterend", strip);
    }

    // Переключатель вариантов — ТОЛЬКО на локальном стенде.
    function mountStand() {
      if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
      if (!/[?&]ailook=/.test(location.search) && LOOK === "0") return;
      var bar = document.createElement("div");
      bar.className = "ca-stand";
      bar.innerHTML = "<span>AI:</span>" + [["0", "сейчас"], ["d", "D"], ["e", "E"], ["f", "F"]].map(function (v) {
        return '<a href="?ailook=' + v[0] + '"' + (LOOK === v[0] ? ' class="on"' : "") + ">" + v[1] + "</a>";
      }).join("");
      [].forEach.call(bar.querySelectorAll("a"), function (a) {
        a.addEventListener("click", function () {
          try { sessionStorage.removeItem("ca_tz_off"); sessionStorage.removeItem("ca_strip_off"); } catch (e) {}
        });
      });
      document.body.appendChild(bar);
    }

    mountHeader();
    // nav-about.js может вставить «Сотрудничество» уже после нас — порядок в шапке от этого
    // не зависит (его пилюля встаёт сразу за логотипом, наша — следом).
    mountStrip();
    runDockPrompts();
    scheduleTeaser();
    mountStand();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
