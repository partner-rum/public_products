/* Главная на телефоне — вкладки «как в Telegram» (07.10.2026, решение Руслана
   после превью preview-tg.html: «это мне уже нравится», «переноси сразу на главную»).
   Снизу выбираешь раздел — сверху на той же странице открывается он, без перезагрузки:
   Продукты · Рынок (Утро / Ставки / Идеи) · AI · Выпуски (На размещении / Размещённые) · Ещё.

   Как устроено:
   — режим включает скрипт в <head> index.html: класс html.tg-on и window.SO_TG ставятся
     только на ширине ≤860px и НЕ для поисковых роботов (им остаётся прежняя страница
     с героем и экранами — та же, что видел Googlebot до этого);
   — каркас (строка «✦ Rumberg», заголовок «Продукты», поиск, панель вкладок) стоит в
     index.html статической разметкой: первая отрисовка не ждёт данных и скриптов;
   — цифра и имя продукта — те же функции, что у колонок главной (window.soFigure,
     window.soPname), своей копии нет;
   — размещённые выпуски, дайджест и разборы (300+ КБ) грузятся при первом открытии
     своего раздела;
   — вкладка, переключатели, фильтр, поиск и прокрутка каждой вкладки живут в
     sessionStorage: «Назад» из карточки продукта возвращает туда же;
   — истории (stories.js) переезжают из героя в «Продукты», под заголовок. */
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
      more: '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',
      search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
      book: '<path d="M5 4.5h5.5a2 2 0 0 1 2 2V20a1.5 1.5 0 0 0-1.5-1.5H5zM19 4.5h-5.5a2 2 0 0 0-2 2V20a1.5 1.5 0 0 1 1.5-1.5H19z"/>',
      hand: '<path d="M7 12.5 10 9.5l3 1 4-4 3 3-6 6-4-1-2 2z"/><path d="M3.5 12l3.5 3.5"/>',
      user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1-3.5 3.8-5 7-5s6 1.5 7 5"/>',
      bld: '<path d="M4.5 20.5h15M6.5 20.5v-12l5.5-4 5.5 4v12M10 20.5v-5h4v5"/>',
      help: '<circle cx="12" cy="12" r="8"/><path d="M9.8 9.5a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.5v.4M12 16.8v.2"/>',
      tg: '<path d="m20 5-16 6.2 5 1.8 1.8 5.5 2.8-3.2 4.4 3.2z"/><path d="m9 13 7-5"/>'
    };
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
    function prodRow(r) {
      var f = figure(r), nm = pname(r), c = CLS[r.cls] || ["#5A6070", "#3C4150"], tk = tick(r);
      return '<li><a class="tg-row" href="instrument.html?id=' + encodeURIComponent(r.id) + '"><span class="tg-av" aria-hidden="true" style="background:linear-gradient(160deg,' + c[0] + "," + c[1] + ")" + (tk.length > 3 ? ";font-size:11.5px" : "") + '">' + esc(tk) + "</span>" +
        '<span class="tg-tx"><span class="tg-nm">' + esc(nm.head) + '</span><span class="tg-sb">' + esc(nm.rest) + "</span></span>" +
        '<span class="tg-fig"><b>' + esc(f.v) + "</b><small>" + esc(f.n) + "</small></span></a></li>";
    }

    // ── Состояние: живёт в sessionStorage, «Назад» из карточки возвращает туда же ──
    var KEY = "so_tabs_v1";
    var S = { cur: "prod", prod: { type: "all", q: "" }, mkt: { seg: "morning" }, iss: { seg: "live" }, y: {} };
    try { var saved = JSON.parse(sessionStorage.getItem(KEY) || "null"); if (saved && saved.prod) S = Object.assign(S, saved); } catch (e) {}
    function save() { try { S.y[S.cur] = window.scrollY; sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

    function frame(title, ctl, extra) {
      return '<div class="tg-nav"><span class="tg-brand"><i aria-hidden="true">✦</i>Rumberg</span><span class="tg-mini" aria-hidden="true">' + esc(title) + "</span></div>" +
        '<div class="tg-hero"><h1>' + esc(title) + "</h1>" + (extra || "") + "</div>" +
        '<div class="tg-ctl">' + (ctl || "") + "</div>";
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
      var list = INSTR.filter(function (r) {
        return (S.prod.type === "all" || r.type === S.prod.type) && (!q || (r.name + " " + r.underlying + " " + r.cls).toLowerCase().indexOf(q) >= 0);
      });
      lastCount = list.length;
      if (!INSTR.length) return '<p class="tg-note">Не удалось загрузить продукты — обновите страницу.</p>';
      if (!list.length) return '<p class="tg-note">Ничего не нашлось. Попробуйте «Сбер», «ОФЗ» или «защита».</p>';
      var out = "";
      if (S.prod.type === "all" && !q) {
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
    function viewProd() {
      var counts = {}; INSTR.forEach(function (r) { counts[r.type] = (counts[r.type] || 0) + 1; });
      var chips = '<div class="tg-chips" role="group" aria-label="Тип продукта">' + [["all", "Все", INSTR.length]].concat(ORDER.filter(function (t) { return counts[t]; }).map(function (t) { return [t, TYPE[t], counts[t]]; }))
        .map(function (c) { return '<button type="button" data-type="' + c[0] + '" aria-pressed="' + (S.prod.type === c[0]) + '">' + esc(c[1]) + "<em>" + c[2] + "</em></button>"; }).join("") + "</div>";
      return frame("Продукты", '<label class="tg-srch">' + svg("search", 18) + '<input id="tg-q" type="search" placeholder="Сбер, ОФЗ, золото…" value="' + esc(S.prod.q) + '" enterkeyhint="search" aria-label="Поиск продуктов"></label>' + chips,
        '<div class="tg-stories" id="tg-stories"></div>') +
        '<div class="tg-pad" id="tg-plist">' + prodList(LIMIT) + "</div>";
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
      return frame("Выпуски", seg("iss", "Какие выпуски", [["live", "На размещении"], ["done", "Размещённые"]])) + '<div class="tg-pad">' + body + "</div>";
    }

    function viewMore() {
      function g(items) {
        return '<div class="tg-grp">' + items.map(function (it) {
          var ext = /^https?:/.test(it[0]) ? ' target="_blank" rel="noopener"' : "";
          return '<a href="' + it[0] + '"' + ext + '><span class="tg-ic" aria-hidden="true" style="background:' + it[3] + '">' + svg(it[2], 18) + '</span><span class="tg-tt"><span>' + esc(it[1]) + "</span>" + CHEV + "</span></a>";
        }).join("") + "</div>";
      }
      return frame("Ещё") + '<div class="tg-pad">' +
        g([["about.html", "Библиотека", "book", "#E07B3A"], ["guide.html", "Как пользоваться", "help", "#5A6070"]]) +
        g([["partners.html", "Сотрудничество", "hand", "#D9A23A"], ["me.html", "Кабинет партнёра", "user", "#3D6FD8"], ["company.html", "О компании", "bld", "#5A6070"]]) +
        g([["https://t.me/+NHbVOoUI5IBkN2Uy", "Telegram-группа", "tg", "#2AABEE"]]) +
        '<p class="tg-note">Для квалифицированных инвесторов. Не является индивидуальной инвестиционной рекомендацией.</p></div>';
    }

    var VIEWS = { prod: viewProd, mkt: viewMkt, iss: viewIss, more: viewMore };
    var TABS = [["prod", "Продукты", "grid"], ["mkt", "Рынок", "pulse"], ["ai", "AI", "star"], ["iss", "Выпуски", "rocket"], ["more", "Ещё", "more"]];
    var aiOn = false;

    function tabs() {
      nav.innerHTML = TABS.map(function (t) {
        var on = aiOn ? t[0] === "ai" : t[0] === S.cur;
        return '<button type="button" data-t="' + t[0] + '"' + (on ? ' aria-current="page"' : "") + ">" + svg(t[2], 25) + "<span>" + t[1] + "</span></button>";
      }).join("");
    }
    var heroObs = null, LIMIT = 0, first = true;
    function idle(fn) { if ("requestIdleCallback" in window) requestIdleCallback(fn, { timeout: 400 }); else setTimeout(fn, 60); }
    function render(keepScroll, y) {
      var y0 = window.scrollY, target = keepScroll ? y0 : (y || 0);
      // Поле поиска в каркасе живое с первой секунды: если человек успел начать
      // набирать до запуска скрипта, набранное и фокус переезжают в настоящее поле
      var qs = first && app.querySelector(".tg-ctl input"), qFocus = qs && document.activeElement === qs;
      if (qs && qs.value && S.cur === "prod") S.prod.q = qs.value;
      // Неполный список — только когда смотрим сверху весь каталог: при возврате
      // на сохранённую прокрутку нужен целиком, иначе некуда встать
      var partial = S.cur === "prod" && !target && !S.prod.q && S.prod.type === "all";
      LIMIT = partial ? 22 : 0;
      var html = VIEWS[S.cur]();
      LIMIT = 0;
      var v0 = app.firstChild, hero0 = first && S.cur === "prod" && v0 && v0.querySelector(".tg-hero");
      if (hero0 && hero0.querySelector(".tg-h1")) {
        // Первая отрисовка поверх каркаса из index.html: строку навигации и заголовок
        // оставляем теми же узлами, меняем только то, что ниже. Заголовок — самый
        // крупный текст первого экрана, и пересозданный (уже с загруженным шрифтом)
        // браузер засчитывал как новую главную отрисовку: 4,5 с вместо 0,8 с на
        // медленном телефоне, хотя человек видел его с первой секунды
        var tmp = document.createElement("div"); tmp.innerHTML = html;
        var src = tmp.querySelector(".tg-hero");
        hero0.querySelector(".tg-stories").id = "tg-stories";
        while (hero0.nextSibling) v0.removeChild(hero0.nextSibling);
        while (src.nextSibling) v0.appendChild(src.nextSibling);
      } else {
        app.innerHTML = '<div class="tg-v' + (first ? "" : " tg-anim") + '">' + html + "</div>";
      }
      first = false;
      if (qFocus) { var nq = document.getElementById("tg-q"); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } }
      if (window.scrollY !== target) window.scrollTo(0, target);
      if (partial) idle(function () {
        var el = document.getElementById("tg-plist");
        if (el && S.cur === "prod") el.innerHTML = prodList(0);
      });
      // Истории живут в «Продуктах», под заголовком: переносим ряд stories.js узлом
      // (с его обработчиками), а не копией
      var slot = document.getElementById("tg-stories"), row = document.querySelector(".st-row");
      if (slot && row) slot.appendChild(row);
      if (slot && (!row || row.hidden)) slot.classList.add("tg-empty");
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
      if ("IntersectionObserver" in window && h && nv) requestAnimationFrame(function () {
        if (app.firstChild !== v) return;
        heroObs = new IntersectionObserver(function (es) { v.classList.toggle("tg-sc", !es[0].isIntersecting); }, { rootMargin: "-" + (nv.offsetHeight + 1) + "px 0px 0px 0px" });
        heroObs.observe(h.querySelector("h1, .tg-h1"));
      });
    }
    function go(t) {
      if (t === "ai") { if (window.Chat && Chat.open) { Chat.open(); aiOn = true; tabs(); } return; }
      if (aiOn && window.Chat && Chat.close) { Chat.close(); aiOn = false; }
      if (t === S.cur) { window.scrollTo({ top: 0, behavior: "smooth" }); tabs(); return; }   // повторный тап — наверх, как в Telegram
      save();
      S.cur = t;
      render(false, S.y[t] || 0); tabs(); save();
    }
    app.addEventListener("click", function (e) {
      var b = e.target.closest("[data-seg]");
      if (b) { var p = b.getAttribute("data-seg").split(":"); S[p[0]].seg = p[1]; render(true); save(); return; }
      var c = e.target.closest("[data-type]");
      if (c) { S.prod.type = c.getAttribute("data-type"); render(true); save(); }
    });
    nav.addEventListener("click", function (e) { var b = e.target.closest("button[data-t]"); if (b) go(b.getAttribute("data-t")); });
    window.addEventListener("pagehide", save);

    // Закрыли ассистента крестиком — подсветка возвращается к разделу
    function watchChat() {
      var p = document.querySelector(".ca-panel"); if (!p) return;
      new MutationObserver(function () { var on = p.classList.contains("ca-on") || p.classList.contains("on"); if (on !== aiOn) { aiOn = on; tabs(); } })
        .observe(p, { attributes: true, attributeFilter: ["class"] });
    }
    if (document.readyState === "complete") watchChat(); else window.addEventListener("load", watchChat);

    var h0 = (location.hash || "").slice(1);
    if (VIEWS[h0]) S.cur = h0;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    render(false, S.y[S.cur] || 0); tabs();
  }
})();
