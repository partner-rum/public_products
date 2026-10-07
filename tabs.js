/* Главная на телефоне — вкладки «как в Telegram» (07.10.2026, решение Руслана
   после превью preview-tg.html: «это мне уже нравится», «переноси сразу на главную»).
   Снизу выбираешь раздел — сверху на той же странице открывается он, без перезагрузки:
   Главная (вводная) · Продукты · Рынок (Утро / Ставки / Идеи) · AI · Выпуски
   (На размещении / Размещённые). Бывшая вкладка «Ещё» — внизу вводной.

   Как устроено:
   — режим включает скрипт в <head> index.html: класс html.tg-on и window.SO_TG ставятся
     только на ширине ≤860px и НЕ для поисковых роботов (им остаётся прежняя страница
     с героем и экранами — та же, что видел Googlebot до этого);
   — каркас (строка «✦ Rumberg», вводная, панель вкладок) стоит в index.html
     статической разметкой: первая отрисовка не ждёт данных и скриптов;
   — цифра и имя продукта — те же функции, что у колонок главной (window.soFigure,
     window.soPname), своей копии нет;
   — размещённые выпуски, дайджест и разборы (300+ КБ) грузятся при первом открытии
     своего раздела;
   — вкладка, переключатели, фильтр, поиск и прокрутка каждой вкладки живут в
     sessionStorage: «Назад» из карточки продукта возвращает туда же;
   — ВВОДНАЯ (07.10.2026, Руслан: «заходишь — нет вводной, сразу продукты; вводную
     оставить, а дальше человек решает сам»): по ссылке или набранному адресу главная
     открывается экраном «кто мы» (тот же текст, что был первым экраном до вкладок),
     с него — кнопка в продукты и строки разделов; «Назад» и обновление страницы
     возвращают туда, где человек был. Туда же переехали истории (stories.js) —
     до вкладок они тоже стояли над заголовком первого экрана;
   — вводная — первая вкладка «Главная» (вариант A из двух показанных; B — вводная
     без своей вкладки — отклонён), туда же уехали пункты прежней вкладки «Ещё»;
     тап по «✦ Rumberg» в любой вкладке тоже возвращает на неё;
   — «НАЗАД» (07.10.2026, Руслан: «заходишь куда-то, хочешь вернуться обратно —
     показываешь тап назад»): каждая смена раздела — запись в истории браузера
     (раздел, глубина, откуда пришли). В строке навигации раздела слева «‹ Главная»
     (или имя раздела, откуда пришли) — шаг назад; системный «назад» (жест iOS,
     кнопка Android) идёт по тем же записям и с сайта не уводит, пока есть куда
     вернуться внутри главной. Открытый чат — тоже запись: «назад» его закрывает. */
(function () {
  "use strict";
  var MQ = window.matchMedia && window.matchMedia("(max-width: 860px)");
  if (!MQ || !window.SO_TG) return;
  var started = false;
  if (MQ.matches) start();
  if (MQ.addEventListener) MQ.addEventListener("change", function () { if (MQ.matches) { document.documentElement.classList.add("tg-on"); start(); } });

  function start() {
    if (started) return;
    var app = document.getElementById("tg-main"), nav = document.getElementById("tg-tb");
    if (!app || !nav) return;
    started = true;
    document.documentElement.classList.add("tg-on");

    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
    function fq(v) { var n = Math.round(Number(v) * 100) / 100; return String(n).replace(".", ","); }
    function dmy(iso) { var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "." + m[2] + "." + m[1] : String(iso || ""); }
    // «Сегодня» — по Москве: по UTC с полуночи до трёх ночи вебинар дня числился бы вчерашним
    var TODAY = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);

    var IC = {
      grid: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M4 9.5h16M9.5 9.5V20"/>',
      pulse: '<path d="M3.5 12.5h4l2.5-6 4 11 2.5-5h4"/>',
      star: '<path d="M12 3.5l1.9 5.6L19.5 11l-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9z"/>',
      rocket: '<path d="M12 3c3 2 4.5 5.5 4.5 9.5L12 17l-4.5-4.5C7.5 8.5 9 5 12 3z"/><path d="M7.5 12.5 5 15l2 2M16.5 12.5 19 15l-2 2M10 20h4"/>',
      search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
      book: '<path d="M5 4.5h5.5a2 2 0 0 1 2 2V20a1.5 1.5 0 0 0-1.5-1.5H5zM19 4.5h-5.5a2 2 0 0 0-2 2V20a1.5 1.5 0 0 1 1.5-1.5H19z"/>',
      hand: '<path d="M7 12.5 10 9.5l3 1 4-4 3 3-6 6-4-1-2 2z"/><path d="M3.5 12l3.5 3.5"/>',
      user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1-3.5 3.8-5 7-5s6 1.5 7 5"/>',
      bld: '<path d="M4.5 20.5h15M6.5 20.5v-12l5.5-4 5.5 4v12M10 20.5v-5h4v5"/>',
      help: '<circle cx="12" cy="12" r="8"/><path d="M9.8 9.5a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.5v.4M12 16.8v.2"/>',
      tg: '<path d="m20 5-16 6.2 5 1.8 1.8 5.5 2.8-3.2 4.4 3.2z"/><path d="m9 13 7-5"/>',
      home: '<path d="M4 11 12 4.5l8 6.5"/><path d="M6.5 9.5v10h11v-10"/><path d="M10 19.5v-5h4v5"/>'
    };
    var ARROW = '<svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7 H12 M8 3 L12 7 L8 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function svg(k, w) { return '<svg viewBox="0 0 24 24" width="' + (w || 24) + '" height="' + (w || 24) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[k] + '</svg>'; }
    var CHEV = '<svg class="tg-chev" width="8" height="13" viewBox="0 0 8 13" fill="none" aria-hidden="true"><path d="M1.5 1.5 6.5 6.5 1.5 11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    // ── Продукты: цифра и имя — функции главной ──
    var INSTR = (window.SITE_DATA && SITE_DATA.instruments) || [];
    var BY = {}; INSTR.forEach(function (r) { BY[r.id] = r; });
    function figure(r) { return window.soFigure ? window.soFigure(r) : { v: r.quote != null ? fq(r.quote) + "%" : "—", n: "" }; }
    function pname(r) { return window.soPname ? window.soPname(r) : { head: r.name || "", rest: "" }; }
    var TYPE = { warrant: "Варранты", protection: "Защита капитала", digital: "Купонные варранты", autocall: "Автоколлы",
      discount: "Дисконтные", booster: "Бустеры", revconv: "Реверс-конвертиблы", rcdigital: "RC с условным купоном" };
    var ORDER = ["warrant", "protection", "digital", "autocall", "booster", "discount", "revconv", "rcdigital"];
    var CLS = { "Акции РФ": ["#3D6FD8", "#2A4FA6"], "Акции США": ["#7B86F2", "#525DC4"], "Облигации": ["#3FA67A", "#2B7A58"],
      "Валюта": ["#D9A23A", "#A8771F"], "Крипто": ["#E07B3A", "#B0551E"], "Товары": ["#C9A23B", "#94731F"], "Индексы": ["#8E7CC3", "#64559A"] };
    function tick(r) {
      var u = String(r.underlying || ""), m = u.match(/\(([A-Z0-9.]{1,6})\)/);
      if (m) return m[1].slice(0, 4);
      if (/^ОФЗ/.test(u)) return "ОФЗ";
      if (/корзин/i.test(u + r.name)) return "◇";
      return (u.replace(/[^A-Za-zА-Яа-яЁё0-9 ]/g, "").split(" ")[0] || "?").slice(0, 4).toUpperCase();
    }
    // Сумма входа — сколько денег нужно, чтобы купить минимальный номинал. У варранта
    // и купонного варранта платится премия (котировка — % от номинала), у дисконтной —
    // цена; остальные покупаются по номиналу. Округляем ВВЕРХ: «от» не должно занижать
    function entryRub(r) {
      var nom = Number(r.minNom);
      if (!(nom > 0)) return 0;
      var pct = r.type === "warrant" || r.type === "digital" || r.type === "discount" ? Number(r.quote) : 100;
      return pct > 0 ? nom * pct / 100 : 0;
    }
    function fromRub(v) {
      if (!(v > 0)) return "";
      if (v >= 1e6) return "от\u00a0" + String(Math.ceil(v / 1e5) / 10).replace(".", ",") + "\u00a0млн\u00a0₽";
      return "от\u00a0" + Math.ceil(v / 1000) + "\u00a0тыс\u00a0₽";
    }
    // Сумма входа — всегда своей строкой под активом и сроком: в одном месте у каждой
    // строки, список читается столбиком (в строку с активом она то влезала, то переносилась)
    function prodRow(r) {
      var f = figure(r), nm = pname(r), c = CLS[r.cls] || ["#5A6070", "#3C4150"], tk = tick(r), sum = fromRub(entryRub(r));
      return '<li><a class="tg-row" href="instrument.html?id=' + encodeURIComponent(r.id) + '"><span class="tg-av" aria-hidden="true" style="background:linear-gradient(160deg,' + c[0] + "," + c[1] + ")" + (tk.length > 3 ? ";font-size:11.5px" : "") + '">' + esc(tk) + "</span>" +
        '<span class="tg-tx"><span class="tg-nm">' + esc(nm.head) + '</span><span class="tg-sb">' + esc(nm.rest) + (sum ? '<span class="tg-in">' + sum + "</span>" : "") + "</span></span>" +
        '<span class="tg-fig"><b>' + esc(f.v) + "</b><small>" + esc(f.n) + "</small></span></a></li>";
    }

    // ── Состояние: живёт в sessionStorage, «Назад» из карточки возвращает туда же ──
    var KEY = "so_tabs_v1";
    var S = { cur: "home", prod: { type: "all", q: "" }, mkt: { seg: "morning" }, iss: { seg: "live" }, y: {} };
    try { var saved = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (saved && saved.prod) S = Object.assign(S, saved); } catch (e) {}
    // Пришли по ссылке или набрали адрес — вводная. «Назад» из карточки и обновление
    // страницы (back_forward / reload) возвращают в ту вкладку и на то место, где был
    var NAVT = "";
    try { NAVT = ((performance.getEntriesByType && performance.getEntriesByType("navigation")[0]) || {}).type || ""; } catch (e) {}
    if (NAVT === "navigate" || !S.cur) { S.cur = "home"; S.y.home = 0; }
    function save() { try { S.y[S.cur] = window.scrollY; sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
    // Запись истории, на которой стоим: глубина внутри главной и раздел, откуда пришли
    var H = { d: 0, from: null };
    var TITLE = { home: "Главная", prod: "Продукты", mkt: "Рынок", iss: "Выпуски" };
    function hist(st, replace) {
      try { history[replace ? "replaceState" : "pushState"](st, "", location.pathname + location.search + (st.tg === "home" ? "" : "#" + st.tg)); } catch (e) {}
      H.d = st.d || 0; H.from = st.from || null;
    }

    function frame(title, ctl, extra) {
      return navRow(title) +
        '<div class="tg-hero"><h1>' + esc(title) + "</h1>" + (extra || "") + "</div>" +
        '<div class="tg-ctl">' + (ctl || "") + "</div>";
    }
    var CHEV_L = '<svg width="11" height="18" viewBox="0 0 11 18" fill="none" aria-hidden="true"><path d="M9 1.5 1.8 9 9 16.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    function navRow(mini) {
      var left;
      if (S.cur === "home") left = '<a class="tg-brand" href="index.html" data-go="home" aria-label="Rumberg — на вводную"><i aria-hidden="true">✦</i>Rumberg</a>';
      else {
        // Пришли сюда внутри главной — подписываем, куда вернёт; открыли раздел
        // по ссылке (#iss) — возвращаем на вводную
        var to = H.d > 0 && TITLE[H.from] && H.from !== S.cur ? TITLE[H.from] : "Главная";
        left = '<button type="button" class="tg-back" data-tgback aria-label="Назад: ' + to + '">' + CHEV_L + "<span>" + to + "</span></button>";
      }
      return '<div class="tg-nav">' + left + '<span class="tg-mini" aria-hidden="true">' + esc(mini || "") + "</span></div>";
    }
    function seg(key, label, opts) {
      return '<div class="tg-seg" role="group" aria-label="' + esc(label) + '">' + opts.map(function (o) {
        return '<button type="button" data-seg="' + key + ":" + o[0] + '" aria-pressed="' + (S[key].seg === o[0]) + '">' + o[1] + "</button>";
      }).join("") + "</div>";
    }

    var lastCount = null;
    // limit — сколько строк отрисовать сразу. Первый экран «Продуктов» не ждёт все
    // 120 строк: сначала около двух экранов, остальное — в паузе после отрисовки
    // (весь список разом занимал поток ~0,15 с на среднем телефоне)
    function prodList(limit) {
      var budget = limit || Infinity, used = 0;
      var q = S.prod.q.trim().toLowerCase();
      var cl = S.prod.cls || "all";
      var list = INSTR.filter(function (r) {
        return (S.prod.type === "all" || r.type === S.prod.type) && (cl === "all" || r.cls === cl) &&
          (!q || (r.name + " " + r.underlying + " " + r.cls + " " + clsLabel(r.cls)).toLowerCase().indexOf(q) >= 0);
      });
      lastCount = list.length;
      if (!INSTR.length) return '<p class="tg-note">Не удалось загрузить продукты — обновите страницу.</p>';
      if (!list.length) return '<p class="tg-note">Ничего не нашлось. Попробуйте «Сбер», «ОФЗ» или «защита».</p>';
      var out = "";
      if (S.prod.type === "all" && cl === "all" && !q) {
        var day = ((window.MORNING || {}).products || []).map(function (id) { return BY[id]; }).filter(Boolean);
        if (day.length) { out += '<h2 class="tg-cap">Продукты дня</h2><ul class="tg-list">' + day.map(prodRow).join("") + "</ul>"; used += day.length; }
      }
      ORDER.forEach(function (t) {
        if (used >= budget) return;
        var g = list.filter(function (r) { return r.type === t; });
        if (!g.length) return;
        var part = g.slice(0, budget - used); used += part.length;
        out += '<h2 class="tg-cap">' + esc(TYPE[t]) + " · " + g.length + '</h2><ul class="tg-list">' + part.map(prodRow).join("") + "</ul>";
      });
      if (used >= budget && budget < list.length) return out;
      return out + '<p class="tg-note">Котировки индикативные. Сравнение и фильтры — на <a href="board.html">полной доске</a>.</p>';
    }
    // Класс базового актива — так клиент и ищет: «на Сбер», «на золото», «на Китай».
    // Тип выплаты (варрант, автоколл) — наш язык, он вторым рядом и группами списка
    var CLS_ORDER = ["Акции РФ", "Акции США", "Облигации", "Индекс", "Товары", "Крипто", "Валюта"];
    function clsLabel(k) {
      if (k === "Индекс") return "Индексы";
      if (k === "Товары") return INSTR.every(function (r) { return r.cls !== "Товары" || /золот/i.test(r.underlying || ""); }) ? "Золото" : "Сырьё";
      return k || "";
    }
    function chipRow(label, attr, cur, items) {
      return '<div class="tg-chips" role="group" aria-label="' + label + '">' + items.filter(function (c) { return c[2] || c[0] === cur || c[0] === "all"; })
        .map(function (c) { return '<button type="button" ' + attr + '="' + esc(c[0]) + '" aria-pressed="' + (cur === c[0]) + '">' + esc(c[1]) + "<em>" + c[2] + "</em></button>"; }).join("") + "</div>";
    }
    function viewProd() {
      var cl = S.prod.cls || "all";
      // Счётчики одного ряда — с учётом выбора в другом: число на кнопке = сколько откроется
      var byCls = {}, byType = {}, nType = 0, nCls = 0;
      INSTR.forEach(function (r) {
        if (S.prod.type === "all" || r.type === S.prod.type) { byCls[r.cls] = (byCls[r.cls] || 0) + 1; nType++; }
        if (cl === "all" || r.cls === cl) { byType[r.type] = (byType[r.type] || 0) + 1; nCls++; }
      });
      var classes = CLS_ORDER.concat(Object.keys(byCls).filter(function (k) { return CLS_ORDER.indexOf(k) < 0; }));
      var assets = chipRow("Базовый актив", "data-cls", cl, [["all", "Все активы", nType]].concat(classes.map(function (k) { return [k, clsLabel(k), byCls[k] || 0]; })));
      var types = chipRow("Тип продукта", "data-type", S.prod.type, [["all", "Все типы", nCls]].concat(ORDER.map(function (t) { return [t, TYPE[t], byType[t] || 0]; })));
      return frame("Продукты", '<label class="tg-srch">' + svg("search", 18) + '<input id="tg-q" type="search" placeholder="Сбер, ОФЗ, золото…" value="' + esc(S.prod.q) + '" enterkeyhint="search" aria-label="Поиск продуктов"></label>' + assets,
        '<p class="tg-sub">Оформляем под клиента через менеджера. Сумма входа — в\u00a0каждой строке.</p>') +
        '<div class="tg-pad"><div class="tg-types">' + types + '</div><div id="tg-plist">' + prodList(LIMIT) + "</div></div>";
    }

    // Подгрузка файлов данных, которых на главной нет: один раз, по первому открытию раздела
    var LAZY = {};
    function need(key, srcs, ready) {
      if (ready()) return true;
      if (!LAZY[key]) {
        LAZY[key] = 1;
        var left = srcs.length;
        srcs.forEach(function (src) {
          var s = document.createElement("script"); s.src = src;
          s.onload = s.onerror = function () { if (--left === 0) { LAZY[key] = 2; render(true); } };
          document.body.appendChild(s);
        });
      }
      return false;
    }

    function viewMkt() {
      var body = "";
      if (S.mkt.seg === "morning") {
        var M = window.MORNING || {};
        body += '<p class="tg-meta">Обзор от ' + esc(dmy(M.date)) + "</p>";
        (M.news || []).forEach(function (n) {
          body += '<a class="tg-card" href="' + esc(n.link || "research.html") + '"><span class="tg-rb">' + esc(n.rubric) + "</span><h2>" + esc(n.title) + "</h2><p>" + esc(n.body) + '</p><span class="tg-go" aria-hidden="true">Разбор →</span></a>';
        });
        var day = (M.products || []).map(function (id) { return BY[id]; }).filter(Boolean);
        if (day.length) body += '<h2 class="tg-cap">Продукты под обзор</h2><ul class="tg-list">' + day.map(prodRow).join("") + "</ul>";
      } else if (S.mkt.seg === "rates") {
        var R = window.RATES || {}, c = R.cbr || {};
        var rows = window.soRates ? window.soRates() : [];
        body += '<div class="tg-tiles"><div class="tg-tile"><b>' + fq(c.key && c.key.rate) + '%</b><span>ключевая ставка</span></div><div class="tg-tile"><b>' + fq(c.ruonia && c.ruonia.rate) + "%</b><span>RUONIA</span></div></div>";
        body += '<h2 class="tg-cap">Лучшее на срок до года</h2><ul class="tg-list">' + rows.map(function (r) {
          var k = String(r.k || ""); k = k.charAt(0).toUpperCase() + k.slice(1);
          return '<li><a class="tg-row" href="' + esc(r.href) + '" target="_blank" rel="noopener"><span class="tg-tx"><span class="tg-nm">' + esc(k) + '</span><span class="tg-sb">' + esc(r.n) + '</span></span><span class="tg-fig tg-g"><b>' + fq(r.v) + "%</b><small>годовых</small></span></a></li>";
        }).join("") + "</ul>";
        body += '<a class="tg-more" href="screener.html">Все ставки по срокам</a><p class="tg-note">Обновлено ' + esc(String(R.updated || "").replace(/^(\d{4})-(\d{2})-(\d{2})/, "$3.$2")) + ". Источники: ЦБ, Мосбиржа, Финуслуги.</p>";
      } else {
        var E = (window.EVENTS && EVENTS.items) || [];
        var nx = E.filter(function (e) { return e.date >= TODAY; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
        if (nx) body += '<a class="tg-card" href="events.html"><span class="tg-rb">Вебинар · ' + esc(dmy(nx.date)) + (nx.timeMsk ? " · " + esc(nx.timeMsk) + " МСК" : "") + "</span><h2>" + esc(nx.title) + '</h2><span class="tg-go" aria-hidden="true">Записаться →</span></a>';
        // Дайджест и разборы — 460 КБ: грузим только здесь, теми же адресами, что и главная
        if (!need("ideas", ["data/digest.js?v=srv6", "data/ideas.js?v=1"], function () { return !!(window.DIGEST_ARCHIVE && window.IDEAS); })) {
          body += LAZY.ideas === 2 ? '<p class="tg-note">Не удалось загрузить дайджест и разборы. Обновите страницу.</p>' : '<p class="tg-wait">Загружаю дайджест и разборы…</p>';
        } else {
          var D = DIGEST_ARCHIVE.issues && DIGEST_ARCHIVE.issues[0];
          var I = IDEAS.issues && IDEAS.issues[0];
          if (D) body += '<a class="tg-card" href="digest.html"><span class="tg-rb">Дайджест · ' + esc(D.date) + "</span><h2>Идеи недели</h2><p>" + esc(String(D.summary || "").split(", ").slice(0, 4).join(", ")) + '</p><span class="tg-go" aria-hidden="true">Открыть →</span></a>';
          if (I) body += '<a class="tg-card" href="ideas.html"><span class="tg-rb">Разбор · ' + esc(dmy(I.date)) + "</span><h2>" + esc(I.title) + "</h2><p>" + esc(String(I.sub || "").slice(0, 180)) + '…</p><span class="tg-go" aria-hidden="true">Читать →</span></a>';
        }
        if (!nx) { var last = E.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0]; if (last) body += '<a class="tg-card" href="events.html"><span class="tg-rb">Прошедший вебинар</span><h2>' + esc(last.title) + '</h2><span class="tg-go" aria-hidden="true">' + (last.recordingUrl ? "Смотреть запись →" : "Подробнее →") + "</span></a>"; }
      }
      return frame("Рынок", seg("mkt", "Раздел рынка", [["morning", "Утро"], ["rates", "Ставки"], ["ideas", "Идеи"]])) + '<div class="tg-pad">' + body + "</div>";
    }

    function viewIss() {
      var body = "";
      if (S.iss.seg === "live") {
        var O = ((window.OFFERINGS || {}).items || []).filter(function (o) { return o.status === "live" || o.status === "upcoming"; });
        if (!O.length) body = '<p class="tg-note">Сейчас открытых размещений нет.</p>';
        O.forEach(function (o) {
          body += '<a class="tg-card tg-off" href="offerings.html#' + esc(o.id) + '"><span class="tg-stat">' + esc(o.statusLabel || "") + "</span><h2>" + esc(o.name) + "</h2><p>" + esc(o.lead || o.kind || "") + "</p>" +
            '<div class="tg-nums">' + (o.price != null ? "<div><b>" + fq(o.price) + "%</b><span>цена</span></div>" : "") + (o.tenor ? "<div><b>" + esc(o.tenor) + "</b><span>срок</span></div>" : "") + (o.nominal ? "<div><b>" + Number(o.nominal).toLocaleString("ru-RU") + " ₽</b><span>номинал</span></div>" : "") + '</div><span class="tg-go" aria-hidden="true">Подробнее →</span></a>';
        });
      } else if (!need("pl", ["data/placements.js"], function () { return !!window.PLACEMENTS_DATA; })) {
        body = LAZY.pl === 2 ? '<p class="tg-note">Не удалось загрузить выпуски. Обновите страницу.</p>' : '<p class="tg-wait">Загружаю выпуски…</p>';
      } else {
        var P = (PLACEMENTS_DATA.issues || []).slice().sort(function (a, b) { return a.issueStart < b.issueStart ? 1 : -1; });
        body = '<ul class="tg-list">' + P.map(function (p) {
          var live = p.maturity >= TODAY, bid = live && p.bid != null;
          return '<li><a class="tg-row" href="placements.html#' + esc(p.isin) + '"><span class="tg-tx"><span class="tg-nm">' + esc(p.name) + '</span><span class="tg-sb">' + esc(p.isin) + " · " + (live ? "до " + dmy(p.maturity) : "погашен") + '</span></span><span class="tg-fig' + (bid ? " tg-g" : "") + '"><b>' + (bid ? fq(p.bid) + "%" : "—") + "</b><small>" + (bid ? "Bid" : "нет котировки") + "</small></span></a></li>";
        }).join("") + '</ul><p class="tg-note">Bid индикативный. Документы КУВ и КИД — в карточке выпуска.</p>';
      }
      var sub = S.iss.seg === "live"
        ? "Уже на Мосбирже: покупка у\u00a0вашего брокера по\u00a0ISIN."
        : "Выпущенные облигации: индикативный Bid и\u00a0документы — в\u00a0карточке.";
      return frame("Выпуски", seg("iss", "Какие выпуски", [["live", "На размещении"], ["done", "Размещённые"]]), '<p class="tg-sub">' + sub + "</p>") + '<div class="tg-pad">' + body + "</div>";
    }

    // Группа строк-ссылок как в настройках iOS: [адрес, заголовок, иконка, цвет, подпись?, вкладка?]
    function g(items) {
      return '<div class="tg-grp">' + items.map(function (it) {
        var ext = /^https?:/.test(it[0]) ? ' target="_blank" rel="noopener"' : "";
        var go = it[5] ? ' data-go="' + it[5] + '"' : "";
        var tt = it[4] ? '<span class="tg-t2"><b>' + esc(it[1]) + "</b><small>" + esc(it[4]) + "</small></span>" : "<span>" + esc(it[1]) + "</span>";
        return '<a href="' + it[0] + '"' + ext + go + '><span class="tg-ic" aria-hidden="true" style="background:' + it[3] + '">' + svg(it[2], 18) + '</span><span class="tg-tt">' + tt + CHEV + "</span></a>";
      }).join("") + "</div>";
    }
    var NOTE = '<p class="tg-note">Для квалифицированных инвесторов. Не является индивидуальной инвестиционной рекомендацией.</p>';

    // ── Вводная: кто мы → в продукты одной кнопкой → остальные разделы строками ──
    // Текст — тот же, что стоял первым экраном главной до вкладок (решение 28.09.2026)
    var H1 = "Rumberg выпускает структурные облигации для квалифицированных инвесторов.";
    var LEAD = "Формула выплаты известна до сделки\u00a0— её можно посчитать на\u00a0своей сумме заранее.";
    function daysAgo(iso) { var a = Date.parse(String(iso || "").slice(0, 10)), b = Date.parse(TODAY); return isFinite(a) ? Math.round((b - a) / 864e5) : 99; }
    function viewHome() {
      var M = window.MORNING || {}, fresh = daysAgo(M.date) <= 3;
      var live = ((window.OFFERINGS || {}).items || []).filter(function (o) { return o.status === "live" || o.status === "upcoming"; });
      var rows = [
        ["index.html#mkt", "Рынок", "pulse", "#3D6FD8", "Обзор утра" + (fresh ? " " + dmy(M.date).slice(0, 5) : "") + ", ставки, идеи недели", "mkt"],
        live.length ? ["index.html#iss", "На размещении", "rocket", "#3FA67A", live[0].name + (live.length > 1 ? " и ещё " + (live.length - 1) : ""), "iss"]
                    : ["index.html#iss", "Выпуски", "rocket", "#3FA67A", "Размещённые выпуски с котировкой Bid", "iss"],
        ["index.html#ai", "AI-ассистент", "star", "#8E7CC3", "Объяснит продукт, посчитает цену опциона", "ai"],
        ["about.html", "Библиотека", "book", "#E07B3A", "Как устроены структурные продукты"]
      ];
      // Пункты прежней вкладки «Ещё» (Библиотека и Сотрудничество уже выше)
      var more = g([["guide.html", "Как пользоваться", "help", "#5A6070"], ["company.html", "О компании", "bld", "#5A6070"]]) +
        g([["me.html", "Кабинет партнёра", "user", "#3D6FD8"], ["https://t.me/+NHbVOoUI5IBkN2Uy", "Telegram-группа", "tg", "#2AABEE"]]);
      return navRow("") +
        '<div class="tg-hero"><div class="tg-stories" id="tg-stories"></div><h1>' + esc(H1) + '</h1><p class="tg-lead">' + esc(LEAD) + "</p>" +
        '<a class="tg-cta" href="board.html" data-go="prod">Смотреть продукты<span class="n" id="tg-n">' + (INSTR.length ? " · " + INSTR.length : "") + "</span>" + ARROW + "</a>" +
        '<a class="tg-co" href="partners.html"><span class="t">Сотрудничество' + ARROW + '</span><span class="s">для финансовых институтов и агентов</span></a></div>' +
        '<div class="tg-pad"><h2 class="tg-cap">С чего начать</h2>' + g(rows) + more + NOTE + "</div>";
    }

    var VIEWS = { home: viewHome, prod: viewProd, mkt: viewMkt, iss: viewIss };
    var TABS = [["home", "Главная", "home"], ["prod", "Продукты", "grid"], ["mkt", "Рынок", "pulse"], ["ai", "AI", "star"], ["iss", "Выпуски", "rocket"]];

    var aiOn = false;

    function tabs() {
      nav.innerHTML = TABS.map(function (t) {
        var on = aiOn ? t[0] === "ai" : t[0] === S.cur;
        return '<button type="button" data-t="' + t[0] + '"' + (on ? ' aria-current="page"' : "") + ">" + svg(t[2], 25) + "<span>" + t[1] + "</span></button>";
      }).join("");
    }
    var heroObs = null, LIMIT = 0, first = true, storyRow = null;
    function idle(fn) { if ("requestIdleCallback" in window) requestIdleCallback(fn, { timeout: 400 }); else setTimeout(fn, 60); }
    function render(keepScroll, y, anim) {
      var y0 = window.scrollY, target = keepScroll ? y0 : (y || 0);
      // Неполный список — только когда смотрим сверху весь каталог: при возврате
      // на сохранённую прокрутку нужен целиком, иначе некуда встать
      var partial = S.cur === "prod" && !target && !S.prod.q && S.prod.type === "all" && (S.prod.cls || "all") === "all";
      LIMIT = partial ? 22 : 0;
      var html = VIEWS[S.cur]();
      LIMIT = 0;
      // Ряд историй держим ссылкой: при смене вкладки старый вид удаляется целиком,
      // и без ссылки ряд пропадал бы насовсем (возвращались — историй нет)
      storyRow = storyRow || document.querySelector(".st-row");
      var v0 = app.firstChild, hero0 = first && v0 && v0.getAttribute && v0.getAttribute("data-v") === S.cur && v0.querySelector(".tg-hero");
      if (hero0) {
        // Первая отрисовка поверх каркаса из index.html: строку навигации и героя
        // оставляем теми же узлами, меняем только то, что ниже. Заголовок — самый
        // крупный текст первого экрана, и пересозданный (уже с загруженным шрифтом)
        // браузер засчитывал как новую главную отрисовку: 4,5 с вместо 0,8 с на
        // медленном телефоне, хотя человек видел его с первой секунды
        var tmp = document.createElement("div"); tmp.innerHTML = html;
        var src = tmp.querySelector(".tg-hero");
        var n0 = hero0.querySelector("#tg-n"), n1 = src.querySelector("#tg-n");
        if (n0 && n1) n0.textContent = n1.textContent;          // число продуктов — из данных
        var st0 = hero0.querySelector(".tg-stories"); if (st0) st0.id = "tg-stories";
        while (hero0.nextSibling) v0.removeChild(hero0.nextSibling);
        while (src.nextSibling) v0.appendChild(src.nextSibling);
      } else {
        app.innerHTML = '<div class="tg-v' + (S.cur === "home" ? " tg-home" : "") + (anim ? " tg-anim" : "") + '" data-v="' + S.cur + '">' + html + "</div>";
      }
      first = false;
      if (window.scrollY !== target) window.scrollTo(0, target);
      if (partial) idle(function () {
        var el = document.getElementById("tg-plist");
        if (el && S.cur === "prod") el.innerHTML = prodList(0);
      });
      // Истории живут на вводной, над заголовком: переносим ряд stories.js узлом
      // (с его обработчиками), а не копией
      var slot = document.getElementById("tg-stories");
      if (slot && storyRow) slot.appendChild(storyRow);
      if (slot && (!storyRow || storyRow.hidden)) slot.classList.add("tg-empty");
      var q = document.getElementById("tg-q");
      if (q) q.addEventListener("input", function () {
        S.prod.q = q.value; document.getElementById("tg-plist").innerHTML = prodList(); save();
        document.getElementById("tg-live").textContent = lastCount ? "Найдено: " + lastCount : "Ничего не нашлось";
      });
      // Крупный заголовок ушёл под строку навигации — показываем мелкое имя раздела
      var v = app.firstChild, h = v.querySelector(".tg-hero"), nv = v.querySelector(".tg-nav");
      if (heroObs) heroObs.disconnect();
      // Высоту строки навигации читаем в следующем кадре: чтение сразу после вставки
      // заставляло браузер рассчитать всю страницу посреди скрипта
      // Выбранная кнопка в ряду фильтров — всегда на виду: ряд листается вбок, и выбор
      // «Золото» иначе оставался за правым краем. Читаем раскладку в кадре, не посреди скрипта
      requestAnimationFrame(function () {
        [].forEach.call(app.querySelectorAll(".tg-chips"), function (row) {
          var on = row.querySelector('[aria-pressed="true"]');
          if (on && on.offsetLeft + on.offsetWidth > row.clientWidth + row.scrollLeft) row.scrollLeft = on.offsetLeft - 16;
        });
      });
      // На вводной имя раздела в строку не выводим — там и так «✦ Rumberg»
      if ("IntersectionObserver" in window && h && nv && S.cur !== "home") requestAnimationFrame(function () {
        if (app.firstChild !== v) return;
        heroObs = new IntersectionObserver(function (es) { v.classList.toggle("tg-sc", !es[0].isIntersecting); }, { rootMargin: "-" + (nv.offsetHeight + 1) + "px 0px 0px 0px" });
        heroObs.observe(h.querySelector("h1, .tg-h1"));
      });
    }
    function go(t) {
      if (t === "ai") {
        if (window.Chat && Chat.open) { Chat.open(); aiOn = true; tabs(); if (!(history.state || {}).ai) hist({ tg: S.cur, d: H.d + 1, from: S.cur, ai: 1 }); }
        return;
      }
      var inAi = aiOn && !!(history.state || {}).ai;
      if (aiOn && window.Chat && Chat.close) { aiOn = false; Chat.close(); }
      if (t === S.cur) {                                   // повторный тап — наверх, как в Telegram
        if (inAi) history.back();                          // чат закрыли своей же вкладкой — его запись снимаем
        window.scrollTo({ top: 0, behavior: "smooth" }); tabs(); return;
      }
      save();
      // Из открытого чата запись чата ЗАМЕНЯЕМ разделом: иначе «назад» из раздела снова открывал бы чат
      hist({ tg: t, d: inAi ? H.d : H.d + 1, from: S.cur }, inAi);
      S.cur = t;
      render(false, S.y[t] || 0, true); tabs(); save();
    }
    // Шаг назад: есть запись внутри главной — по истории, иначе (раздел открыт по ссылке) — на вводную
    function back() { if (H.d > 0) history.back(); else go("home"); }
    window.addEventListener("popstate", function (e) {
      var st = e.state;
      if (!st || !st.tg || !VIEWS[st.tg]) return;          // чужие записи (истории stories.js) — не наши
      if (!st.ai && aiOn && window.Chat && Chat.close) { aiOn = false; Chat.close(); tabs(); }
      if (st.ai && !aiOn && window.Chat && Chat.open) { aiOn = true; Chat.open(); tabs(); }
      H.d = st.d || 0; H.from = st.from || null;
      if (st.tg !== S.cur) { save(); S.cur = st.tg; render(false, S.y[st.tg] || 0, true); tabs(); save(); }
    });
    app.addEventListener("click", function (e) {
      if (e.target.closest("[data-tgback]")) { back(); return; }
      var to = e.target.closest("[data-go]");
      if (to) { e.preventDefault(); go(to.getAttribute("data-go")); return; }
      var b = e.target.closest("[data-seg]");
      if (b) { var p = b.getAttribute("data-seg").split(":"); S[p[0]].seg = p[1]; render(true); save(); return; }
      var c = e.target.closest("[data-type]");
      if (c) { S.prod.type = c.getAttribute("data-type"); render(true); save(); return; }
      var k = e.target.closest("[data-cls]");
      if (k) { S.prod.cls = k.getAttribute("data-cls"); render(true); save(); }
    });
    nav.addEventListener("click", function (e) { var b = e.target.closest("button[data-t]"); if (b) go(b.getAttribute("data-t")); });
    window.addEventListener("pagehide", save);

    // Закрыли ассистента крестиком — подсветка возвращается к разделу
    function watchChat() {
      var p = document.querySelector(".ca-panel"); if (!p) return;
      new MutationObserver(function () {
        var on = p.classList.contains("ca-on") || p.classList.contains("on");
        if (on === aiOn) return;
        aiOn = on; tabs();
        var inAi = !!(history.state || {}).ai;
        if (on && !inAi) hist({ tg: S.cur, d: H.d + 1, from: S.cur, ai: 1 });   // открыли не вкладкой — «назад» закроет
        if (!on && inAi) history.back();                                           // закрыли крестиком — запись чата снимаем
      })
        .observe(p, { attributes: true, attributeFilter: ["class"] });
    }
    if (document.readyState === "complete") watchChat(); else window.addEventListener("load", watchChat);

    // «Назад»/«вперёд» на страницу главной — раздел и глубина берутся из записи истории
    // (она точнее сохранённой вкладки: человек мог уйти с главной из другого раздела)
    var st0 = history.state;
    if (st0 && st0.tg && VIEWS[st0.tg] && NAVT !== "navigate") { S.cur = st0.tg; H.d = st0.d || 0; H.from = st0.from || null; }
    else {
      var h0 = (location.hash || "").slice(1);
      if (VIEWS[h0]) S.cur = h0;
      if (S.cur === "more") S.cur = "home";   // «Ещё» теперь внизу вводной: старые ссылки #more и сохранённое состояние
      if (!VIEWS[S.cur]) S.cur = "home";
    }
    // Адрес не трогаем (якорь #story= истории читают позже), меняем только данные записи
    try { history.replaceState({ tg: S.cur, d: H.d, from: H.from }, ""); } catch (e) {}
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    render(false, S.y[S.cur] || 0); tabs();
  }
})();
