/* AI-ассистент (консьерж по сайту). Строка-вопрос внизу по центру экрана + панель, тёмная тема.
   Дизайн-язык ИИ: фирменная 4-лучевая звезда, бейдж AI; в поле строки по буквам печатаются
   примеры вопросов — три умения ассистента в одном порядке (объяснить продукт, посчитать цену
   опциона, подсказать, где что на сайте); пометка «может ошибаться» (не колл-центр: без зелёной
   точки «онлайн»). Строка СВЕТЛАЯ на тёмном сайте — единственный светлый предмет на экране,
   чтобы ассистента было видно сразу (слово Руслана). На телефоне строка — пилюля «Спросить AI»
   без поля. Оговорка «считаю только CALL и PUT» — внутри открытого чата, не на заставке.
   Бэкенд: Cloudflare Worker /chat → DeepSeek (ключи — секреты Cloudflare, не в репо).
   Подключение: <script src="chat.js?v=21"></script> перед </body>. Без зависимостей. */
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

  // Что умеет ассистент — ТРИ вещи, везде в одном порядке: объяснить продукт, посчитать цену
  // опциона, подсказать, где что на сайте. На заставке (строка, её подпись, вход в шапке)
  // ассистент НЕ сужается до CALL/PUT — оговорка «считаю только CALL и PUT на один актив»
  // появляется уже внутри открытого чата, второй репликой после приветствия (решение Руслана
  // 05.10.2026: «пусть этот дисклеймер будет, когда его уже откроет клиент»).
  var PRICE_GREETING = "Здравствуйте! Я AI-ассистент Rumberg. Объясню, как устроены структурные продукты, " +
    "подскажу, где что на сайте, и посчитаю индикативную цену опциона на ваш срок и страйк.";
  var PRICE_NOTE = "Цену пока считаю только для CALL и PUT на один актив — акцию, индекс или фонд. " +
    "Остальные структуры посчитает менеджер: кнопка «Обсудить с Румбергом» внизу.";
  var EXAMPLES = [
    "Чем автоколл отличается от облигации с защитой капитала?",
    "Посчитай колл на Сбербанк на 2 года",
    "Где посмотреть уже размещённые выпуски?"
  ];
  var CAN_LIST = "о продуктах, ценах и сайте";   // подпись под «Спросить AI» на телефоне
  function greeting() {
    if (typeof SETUP.greeting === "string" && SETUP.greeting) return SETUP.greeting;
    return qualOk() ? PRICE_GREETING : CFG.greeting;
  }
  // Оговорка про CALL/PUT: только когда расчёт действительно доступен (гейт пройден) и
  // приветствие не задано страницей (рабочий стол партнёра говорит своё).
  function priceNote() {
    return (qualOk() && !(typeof SETUP.greeting === "string" && SETUP.greeting)) ? PRICE_NOTE : "";
  }
  function suggestions() {
    if (OWN_SUG || !qualOk()) return CFG.suggestions;
    return EXAMPLES;
  }
  var STORE = SETUP.desk ? "so_chat_desk" : "so_chat";

  var css = "" +
    /* — строка-вопрос внизу по центру (на телефоне — пилюля без поля) — */
        // Светлая на тёмном, но приглушённая (Руслан: «чуть более спокойный контраст»): фон — серо-
    // голубой #D3D7DF вместо белого #F2F3F7, текст — карточный #14161C. Рамка не нужна, предмет и так отделён; фокус/наведение — оранжевое кольцо.
    ".ca-dock{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:300;display:flex;align-items:center;gap:10px;width:600px;max-width:calc(100vw - 32px);height:56px;margin:0;padding:0 8px 0 18px;box-sizing:border-box;border-radius:999px;background:#D3D7DF;border:0;box-shadow:0 12px 32px rgba(0,0,0,.5),0 0 0 2px rgba(238,125,27,0);font-family:'Onest',system-ui,sans-serif;color:#14161C;transition:box-shadow .2s;}" +
    ".ca-dock:hover,.ca-dock:focus-within{box-shadow:0 12px 32px rgba(0,0,0,.5),0 0 0 2px rgba(238,125,27,.7);}" +
    ".ca-dock.hide{display:none;}" +
    ".ca-dock>svg{flex:none;}" +
    ".ca-dock-tag{flex:none;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.08em;color:#2A56B0;border:1px solid rgba(42,86,176,.45);border-radius:5px;padding:2px 5px;}" +
    ".ca-dock-in{flex:1;min-width:0;background:none;border:0;outline:none;color:#14161C;font-family:inherit;font-size:15px;line-height:1.3;padding:0;}" +
    ".ca-dock-in::placeholder{color:rgba(20,22,28,.66);}" +
    ".ca-dock-go{flex:none;display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 16px;border:0;border-radius:999px;background:#EE7D1B;color:#0C0A08;font-family:inherit;font-size:13.5px;font-weight:600;cursor:pointer;transition:background .15s;}" +
    ".ca-dock-go:hover{background:#F58E33;}.ca-dock-go svg{width:14px;height:14px;}" +
    ".ca-dock-lbl{display:none;}" +
    // Строка закрывает низ страницы — отодвигаем подвал, чтобы последние строки читались.
    "@media(min-width:861px){html.ca-dock-pad body{padding-bottom:88px;}}" +
    "@media(max-width:860px){.ca-dock{width:auto;max-width:none;height:50px;padding:0 18px 0 14px;gap:9px;cursor:pointer;}" +
    ".ca-dock-in,.ca-dock-go,.ca-dock-tag{display:none;}" +
    ".ca-dock-lbl{display:block;font-size:14.5px;font-weight:600;line-height:1.15;white-space:nowrap;text-align:left;}" +
    ".ca-dock-lbl small{display:block;margin-top:2px;font-size:11.5px;font-weight:400;line-height:1.2;color:rgba(20,22,28,.68);}}" +
    /* — панель: СВЕТЛАЯ, в тон строке («почему он чёрный открывается?»), и СБОКУ — небольшое
         окно справа внизу, не по центру («пусть открывается сбоку, иначе мешает смотреть»). — */
    // visibility:hidden в закрытом состоянии убирает содержимое панели из табуляции
    // и из дерева скринридера (opacity+pointer-events этого не делали — A.6).
    // Небольшое окно в правом нижнем углу (Руслан: «сделай маленькую, она всё мешает смотреть»):
    // 360×480, страница видна почти целиком.
    ".ca-panel{position:fixed;right:20px;bottom:20px;z-index:301;width:360px;max-width:calc(100vw - 32px);height:480px;max-height:calc(100dvh - 40px);background:#ECEEF2;color:#14161C;color-scheme:light;border:1px solid rgba(20,22,28,.12);border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden;font-family:'Onest',system-ui,sans-serif;opacity:0;visibility:hidden;transform:translateY(14px) scale(.98);transform-origin:bottom right;transition:opacity .2s,transform .22s cubic-bezier(.16,1,.3,1),visibility 0s linear .22s;pointer-events:none;}" +
    ".ca-panel.on{opacity:1;visibility:visible;transform:none;pointer-events:auto;transition:opacity .2s,transform .22s cubic-bezier(.16,1,.3,1),visibility 0s;}" +
    ".ca-head{display:flex;align-items:center;gap:10px;padding:9px 10px 9px 14px;border-bottom:1px solid rgba(20,22,28,.1);flex:none;background:#E3E6EC;}" +
    ".ca-ava{width:32px;height:32px;border-radius:9px;background:#14161C;display:flex;align-items:center;justify-content:center;flex:none;}" +
    ".ca-ttl-row{display:flex;align-items:center;gap:7px;}" +
    ".ca-ttl{font-family:'Rubik','Onest',sans-serif;font-weight:600;font-size:14.5px;color:#14161C;}" +
    ".ca-sub{font-size:12px;color:rgba(20,22,28,.62);margin-top:1px;}" +
    ".ca-x{margin-left:auto;width:44px;height:44px;border:0;background:none;color:rgba(20,22,28,.55);font-size:20px;line-height:1;cursor:pointer;border-radius:8px;flex:none;}" +
    ".ca-x:hover{color:#14161C;background:rgba(20,22,28,.07);}" +
    /* Клавиатурный фокус: у кнопок виджета его не было вовсе (outline:none на
       полях, ни одного правила :focus-visible), а страницы объявляют рамку
       только на <a> — виджет выпадал из обхода незаметно для глаза. */
    ".ca-dock-go:focus-visible,.ca-x:focus-visible,.ca-send:focus-visible,.ca-discuss:focus-visible,.ca-sug button:focus-visible{outline:2px solid #EE7D1B;outline-offset:3px;}" +
    ".ca-in:focus-visible,.ca-lead input:focus-visible{outline:2px solid #EE7D1B;outline-offset:1px;}" +
    /* — лента сообщений — */
    ".ca-log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;}" +
    ".ca-msg{max-width:88%;font-size:13px;line-height:1.55;padding:9px 13px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word;}" +
    ".ca-msg.u{align-self:flex-end;background:#EE7D1B;color:#0C0A08;border-bottom-right-radius:5px;}" +
    ".ca-msg.a{align-self:flex-start;background:#F8F9FB;color:#14161C;border:1px solid rgba(20,22,28,.08);border-bottom-left-radius:5px;}" +
    // оранжевый витрины на светлом не держит контраст для текста — ссылки темнее (4,6:1)
    ".ca-msg.a a{color:#B4580B;}" +
    ".ca-msg.a b{color:#14161C;font-weight:600;}" +
    /* — подсказки-вопросы — */
    ".ca-sug{display:flex;flex-direction:column;gap:8px;align-items:flex-start;}" +
    ".ca-sug button{border:1px solid rgba(20,22,28,.14);background:#F8F9FB;color:rgba(20,22,28,.86);border-radius:12px;padding:10px 12px;min-height:44px;font-family:inherit;font-size:12.5px;line-height:1.4;cursor:pointer;text-align:left;transition:border-color .15s,color .15s,background .15s;}" +
    ".ca-sug button:hover{border-color:rgba(238,125,27,.7);color:#14161C;background:#FFF6EE;}" +
    ".ca-sug button svg{flex:none;margin-right:8px;vertical-align:-1px;}" +
    /* — «думает»: мигающий блок-курсор терминала + бегущая полоса; фразы меняются
         по мере ожидания (ответ провайдера может идти до ~15 c) — */
    ".ca-typing{align-self:flex-start;display:flex;flex-direction:column;align-items:flex-start;gap:7px;min-width:168px;padding:10px 14px;background:#F8F9FB;border:1px solid rgba(20,22,28,.08);border-radius:14px;border-bottom-left-radius:5px;font-size:12px;color:rgba(20,22,28,.58);font-family:'JetBrains Mono',monospace;}" +
    ".ca-typing .tl{display:flex;align-items:center;gap:2px;}" +
    ".ca-typing .tx{transition:opacity .16s ease;}" +
    ".ca-typing .cur{color:#EE7D1B;animation:caCaret 1s steps(1) infinite;}" +
    ".ca-typing .tb{position:relative;width:100%;height:2px;border-radius:2px;background:rgba(20,22,28,.1);overflow:hidden;}" +
    ".ca-typing .tb::after{content:'';position:absolute;top:0;bottom:0;left:0;width:38%;border-radius:2px;background:linear-gradient(90deg,transparent,#EE7D1B,transparent);animation:caScan 1.5s ease-in-out infinite;}" +
    "@keyframes caCaret{50%{opacity:0;}}" +
    "@keyframes caScan{0%{transform:translateX(-100%);}100%{transform:translateX(265%);}}" +
    "@media(prefers-reduced-motion:reduce){.ca-typing .cur,.ca-typing .tb::after{animation:none;}.ca-typing .tb::after{width:100%;opacity:.5;}}" +
    /* — низ — */
    ".ca-foot{flex:none;border-top:1px solid rgba(20,22,28,.1);padding:8px 10px;background:#E3E6EC;}" +
    ".ca-row{display:flex;gap:8px;align-items:flex-end;}" +
    ".ca-in{flex:1;resize:none;max-height:96px;background:#F8F9FB;border:1px solid rgba(20,22,28,.16);border-radius:12px;color:#14161C;font-family:inherit;font-size:16px;line-height:1.4;padding:9px 12px;outline:none;}" +
    ".ca-in::placeholder{color:rgba(20,22,28,.52);}" +
    ".ca-in:focus{border-color:rgba(238,125,27,.7);}" +
    ".ca-in:disabled{opacity:.6;}" +
    ".ca-send{flex:none;width:44px;height:44px;border:0;border-radius:11px;background:#EE7D1B;color:#0C0A08;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;}" +
    ".ca-send:hover{background:#F58E33;}.ca-send:disabled{opacity:.4;cursor:default;}" +
    ".ca-send svg{width:17px;height:17px;}" +
    ".ca-note{margin:6px 2px 0;font-size:11px;line-height:1.45;color:rgba(20,22,28,.6);text-align:center;}" +
    /* — кнопка и форма «Обсудить с Румбергом» — */
    ".ca-discuss{width:100%;margin-bottom:8px;background:none;border:1px solid rgba(238,125,27,.6);color:#B4580B;border-radius:11px;padding:0 14px;min-height:44px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;transition:background .15s,border-color .15s;}" +
    ".ca-discuss:hover{background:#FFF1E4;border-color:#EE7D1B;}" +
    ".ca-discuss svg{width:15px;height:15px;}" +
    ".ca-lead{align-self:stretch;background:#FFF4EA;border:1px solid rgba(238,125,27,.4);border-radius:14px;padding:13px 14px;display:flex;flex-direction:column;gap:8px;}" +
    ".ca-lead-t{font-size:13px;line-height:1.5;color:#14161C;}" +
    ".ca-lead input{background:#FFFFFF;border:1px solid rgba(20,22,28,.18);border-radius:10px;color:#14161C;font-family:inherit;font-size:16px;padding:9px 11px;outline:none;}" +
    ".ca-lead input::placeholder{color:rgba(20,22,28,.5);}" +
    ".ca-lead input:focus{border-color:rgba(238,125,27,.7);}" +
    ".ca-lead-send{background:#EE7D1B;color:#0C0A08;border:0;border-radius:10px;padding:9px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;}" +
    ".ca-lead-send:hover{background:#F58E33;}.ca-lead-send:disabled{opacity:.5;cursor:default;}" +
    ".ca-lead-ok{font-size:13px;line-height:1.55;color:#14161C;}.ca-lead-ok a{color:#B4580B;}" +
    "@media(max-width:480px){.ca-panel{right:8px;left:8px;bottom:8px;width:auto;max-width:none;height:min(560px,calc(100dvh - 16px));}}" +
    /* — оговорка про CALL/PUT внутри чата — тише обычной реплики: пунктирная рамка без заливки — */
    ".ca-msg.a.n{max-width:92%;background:none;border:1px dashed rgba(20,22,28,.24);color:rgba(20,22,28,.68);font-size:12.5px;line-height:1.5;}" +
    "@media(prefers-reduced-motion:reduce){.ca-panel{transition:none;}}";

  function inject() {
    if (document.getElementById("ca-css")) return;
    var s = document.createElement("style"); s.id = "ca-css"; s.textContent = css;
    document.head.appendChild(s);
  }

  /* фирменная 4-лучевая звезда (одна, без «искр-компаньонов» — это знак дома, не спарклы) */
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

    var ICON_STAR_20 = '<svg width="20" height="20" viewBox="0 0 26 26" aria-hidden="true">' +
      '<path d="M13 1 L15.6 10.4 L25 13 L15.6 15.6 L13 25 L10.4 15.6 L1 13 L10.4 10.4 Z" fill="#EE7D1B"/></svg>';
    var ICON_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
    var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Вход — строка-вопрос внизу по центру: на десктопе поле с бегущими примерами и кнопка,
    // на телефоне пилюля «Спросить AI» (поле скрыто CSS). Пока панель открыта, строка спрятана.
    var dock = document.createElement("form");
    dock.className = "ca-dock";
    dock.setAttribute("aria-label", "Вопрос AI-ассистенту");
    dock.innerHTML = ICON_STAR_20 + '<span class="ca-dock-tag">AI</span>' +
      '<input class="ca-dock-in" type="text" autocomplete="off" aria-label="Вопрос AI-ассистенту" placeholder="Спросите о продукте, цене или сайте…">' +
      '<span class="ca-dock-lbl">Спросить AI<small>' + CAN_LIST + '</small></span>' +
      '<button class="ca-dock-go" type="submit">Спросить' + ICON_ARROW + '</button>';
    var dockIn = dock.querySelector(".ca-dock-in");
    document.documentElement.classList.add("ca-dock-pad");

    var panel = document.createElement("div");
    panel.className = "ca-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "AI-ассистент");
    panel.innerHTML =
      '<div class="ca-head">' +
        '<span class="ca-ava">' + ICON_STAR_SM + '</span>' +
        '<div><div class="ca-ttl-row"><span class="ca-ttl">AI-ассистент</span></div>' +
        '<div class="ca-sub">Rumberg · структурные продукты</div></div>' +
        '<button class="ca-x" aria-label="Закрыть">&times;</button></div>' +
      '<div class="ca-log" role="log" aria-live="polite" aria-label="Диалог с ассистентом"></div>' +
      '<div class="ca-foot">' +
        (SETUP.desk ? "" : '<button class="ca-discuss" type="button">' + ICON_CHAT + 'Обсудить с Румбергом</button>') +
        '<div class="ca-row">' +
        '<textarea class="ca-in" rows="1" placeholder="Спросите про продукт…" aria-label="Сообщение"></textarea>' +
        '<button class="ca-send" aria-label="Отправить">' + ICON_SEND + '</button>' +
      '</div><div class="ca-note">Отвечает ИИ — может ошибаться · Не является индивидуальной инвестиционной рекомендацией</div></div>';

    document.body.appendChild(dock);
    document.body.appendChild(panel);

    els.log = panel.querySelector(".ca-log");
    els.input = panel.querySelector(".ca-in");
    els.send = panel.querySelector(".ca-send");

    var opened = false;
    function open() {
      panel.classList.add("on"); dock.classList.add("hide");
      if (qualOk()) els.input.placeholder = "Ваш вопрос…";   // длинная подсказка на телефоне рвалась в две строки
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
    function close() { panel.classList.remove("on"); dock.classList.remove("hide"); }

    // Открыть чат и сразу задать вопрос (Enter в строке, кнопки-примеры): работа делом, не обещанием.
    function ask(text) {
      open();
      if (busy || locked) return;
      els.input.value = text;
      send();
    }

    dock.addEventListener("submit", function (e) {
      e.preventDefault();
      var t = dockIn.value.trim();
      dockIn.value = "";
      goal(t ? "chat_dock_ask" : "chat_dock_open");
      if (t) ask(t); else open();
    });
    // На телефоне строка — пилюля без поля: тап по ней открывает чат; на десктопе клик по
    // пустому месту строки ставит курсор в поле.
    dock.addEventListener("click", function (e) {
      if (e.target === dockIn || (e.target.closest && e.target.closest(".ca-dock-go"))) return;
      if (getComputedStyle(dockIn).display === "none") { goal("chat_dock_open"); open(); }
      else dockIn.focus();
    });
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

    // Примеры вопросов «печатаются» в подсказке поля — три умения подряд, два круга, потом
    // поле успокаивается. Пока поле в фокусе или в нём текст — не трогаем. При reduced-motion
    // и на телефоне (поле скрыто) — ничего не печатаем.
    function runDockPrompts() {
      if (REDUCED) return;
      var list = suggestions(), round = 0, idx = 0;
      var STATIC = dockIn.placeholder;
      function idle() { return document.activeElement === dockIn || dockIn.value; }
      function next() {
        if (!dockIn.isConnected) return;
        if (getComputedStyle(dockIn).display === "none") { setTimeout(next, 1500); return; }
        if (idle()) { setTimeout(next, 1200); return; }
        if (round >= 2) { dockIn.placeholder = STATIC; return; }
        var text = list[idx], i = 0;
        (function step() {
          if (!dockIn.isConnected) return;
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

    runDockPrompts();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
