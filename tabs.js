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
     вернуться внутри главной. Открытый чат — тоже запись: «назад» его закрывает;
   — ПОИСК ПО ISIN (08.10.2026, Руслан: «не могу вбить в поиске ISIN размещённых
     выпусков и найти выпуск»): во вкладке «Выпуски» своя строка поиска — ISIN, серия,
     название или актив, ищет сразу в обоих списках (на размещении и размещённые);
     поиск «Продуктов» тоже находит выпуски — по ISIN, серии и названию. ISIN с
     кириллическими буквами-двойниками (А, В, Е, К, М…) приводится к латинице;
   — ПРИЁМЫ С DRIBBBLE (09.10.2026, Руслан: «делай 1-10, покажи локально» — из разбора
     ленты dribbble.com/tags/mobile-app-design): опрос «Подобрать за 3 вопроса» на вводной
     (срок → цель → активы, ответы выставляют фильтр в «Продуктах»); у строки продукта
     вместо кружка с тикером — форма выплаты; «Избранное» (☆ в карточке продукта); у
     выпусков — полоса жизненного цикла, обложки размещений и срок до погашения вместо
     пустой колонки Bid; AI — оранжевой плиткой в центре нижней панели; заголовок вводной
     в два тона. Откуда какой приём — в комментариях у кода. */
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
      home: '<path d="M4 11 12 4.5l8 6.5"/><path d="M6.5 9.5v10h11v-10"/><path d="M10 19.5v-5h4v5"/>',
      sliders: '<path d="M5 7h9M18 7h1M5 17h3M12 17h7"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
      share: '<path d="M12 4v11M7.5 8.5 12 4l4.5 4.5"/><path d="M5 13.5v5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-5"/>'
    };
    // Фирменная звезда — залитая, для плитки AI в центре нижней панели
    var STAR_FILL = '<svg viewBox="0 0 26 26" width="19" height="19" aria-hidden="true"><path d="M13 1 L15.6 10.4 L25 13 L15.6 15.6 L13 25 L10.4 15.6 L1 13 L10.4 10.4 Z" fill="currentColor"/></svg>';
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
    // Значок строки — ФОРМА ВЫПЛАТЫ продукта (Dribbble: Crypto Trading от Nixtio и Upstream от
    // Ramotion — мини-график в строке списка). Раньше здесь стоял кружок с тикером — он повторял
    // актив, написанный рядом, а тип продукта был только словами. Линия строится той же функцией
    // выплат, что большие графики (SITE.calc.pct из data/lib.js), поэтому картинка не врёт:
    // «клюшка» у CALL, полка у колл-спреда, ступенька у купонного варранта, пол у защиты.
    // Пунктир — цена входа: что под ним, то убыток. Цвет — семейства, как в Библиотеке (FAM в about.html)
    var FAMC = { warrant: "#E0A24A", digital: "#E0A24A", protection: "#4F86E6", discount: "#5E9B82",
      autocall: "#46A9A0", revconv: "#C77FA1", rcdigital: "#C77FA1", booster: "#E0705A" };
    var GLC = {};
    function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")"; }
    function glyphSvg(r) {
      var SI = window.SITE, rg = SI && SI.calc && SI.calc.move(r);
      // Дисконтная облигация: выплата от актива не зависит — цена тянется к номиналу
      if (!rg) return '<path d="M8 29.5C16 28.5 25 22 34 13" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
        '<path d="M7 13H35" stroke="currentColor" stroke-opacity=".38" stroke-width="1.4" stroke-dasharray="2 3"/>';
      var n = 40, v = [];
      for (var i = 0; i <= n; i++) v.push(SI.calc.pct(r, rg.min + (rg.max - rg.min) * i / n));
      var cost = SI.isAtPar && SI.isAtPar(r) ? 100 : Number(r.quote) || 0;
      var lo = Math.min.apply(null, v.concat([cost])), hi = Math.max.apply(null, v.concat([cost])), sp = hi - lo || 1;
      function yy(val) { return (30 - 17 * (val - lo) / sp).toFixed(1); }
      return '<path d="M7 ' + yy(cost) + 'H35" stroke="currentColor" stroke-opacity=".38" stroke-width="1.4" stroke-dasharray="2 3"/>' +
        '<path d="' + v.map(function (y, i) { return (i ? "L" : "M") + (8 + 26 * i / n).toFixed(1) + " " + yy(y); }).join("") +
        '" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    function glyph(r) {
      if (!GLC[r.id]) {
        var c = FAMC[r.type] || "#8A93A6";
        GLC[r.id] = '<span class="tg-gl" aria-hidden="true" style="color:' + c + ";background:" + rgba(c, 0.13) + '"><svg viewBox="0 0 42 42" width="42" height="42" fill="none">' + glyphSvg(r) + "</svg></span>";
      }
      return GLC[r.id];
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
    var ROWS_B = document.documentElement.getAttribute("data-rows") === "b";
    function prodRow(r) {
      var f = figure(r), nm = pname(r), sum = fromRub(entryRub(r));
      if (ROWS_B) return '<li><a class="tg-row" href="instrument.html?id=' + encodeURIComponent(r.id) + '">' + glyph(r) +
        '<span class="tg-tx"><span class="tg-nm">' + esc(nm.head) + '</span><span class="tg-sb">' + esc(nm.rest) + "</span></span>" +
        '<span class="tg-fig"><b>' + esc(f.v) + "</b><small>" + esc(f.n) + "</small>" + (sum ? '<small class="tg-in2">' + sum + "</small>" : "") + "</span></a></li>";
      return '<li><a class="tg-row" href="instrument.html?id=' + encodeURIComponent(r.id) + '">' + glyph(r) +
        '<span class="tg-tx"><span class="tg-nm">' + esc(nm.head) + '</span><span class="tg-sb">' + esc(nm.rest) + (sum ? '<span class="tg-in">' + sum + "</span>" : "") + "</span></span>" +
        '<span class="tg-fig"><b>' + esc(f.v) + "</b><small>" + esc(f.n) + "</small></span></a></li>";
    }
    // Избранное: ☆ в карточке продукта кладёт id в localStorage (so_fav) — список наверху «Продуктов»
    function favList() {
      try { var a = JSON.parse(localStorage.getItem("so_fav") || "[]"); return Array.isArray(a) ? a.map(function (id) { return BY[id]; }).filter(Boolean) : []; }
      catch (e) { return []; }
    }
    function plural(n, a, b, c) { var d = n % 10, h = n % 100; return d === 1 && h !== 11 ? a : d >= 2 && d <= 4 && (h < 10 || h >= 20) ? b : c; }
    function nProd(n) { return n + " " + plural(n, "продукт", "продукта", "продуктов"); }

    // ── Подбор за 3 вопроса (Dribbble: VibeMove — карточка «Не знаете, что выбрать?» на
    // главной и один вопрос на экран; PowerPeak — выбор крупной цифрой с пояснением; Passion
    // Finder — темы пузырями, размер по числу вариантов). Ответы не «советуют», а ВЫСТАВЛЯЮТ
    // ФИЛЬТР по условиям: срок, тип выплаты, класс актива. Это не профиль риска — иначе подбор
    // был бы похож на индивидуальную инвестиционную рекомендацию. У каждого ответа — сколько
    // продуктов он оставит; ответ, после которого ничего не останется, выбрать нельзя
    var GOALS = { keep: ["protection", "discount"], grow: ["warrant", "digital", "booster"], coupon: ["autocall", "revconv", "rcdigital"] };
    var QY = [["1", "1", "до года"], ["2", "2", "около 2 лет"], ["3", "3+", "от 3 лет"]];
    var QG = [["keep", "Сохранить вложенное", "Номинал возвращается на погашении; доход — участие в росте актива или дисконт"],
      ["grow", "Заработать на росте", "Сильнее участвовать в росте актива; если роста нет, вложенное можно потерять"],
      ["coupon", "Получать купон", "Регулярный или разовый купон за риск по активу; при сильном падении номинал не защищён"]];
    var YTXT = { "1": "до года", "2": "около двух лет", "3": "от трёх лет" };
    var GTXT = { keep: "сохранить вложенное", grow: "заработать на росте", coupon: "получать купон" };
    function yb(r) {
      var y = window.SITE && SITE.tenorYears ? SITE.tenorYears(r) : parseFloat(String(r.tenor || "").replace(",", ".")) || 0;
      return y <= 1 ? "1" : y <= 2 ? "2" : "3";
    }
    function goalOf(r) { for (var g in GOALS) if (GOALS[g].indexOf(r.type) >= 0) return g; return ""; }
    function pickHit(r, p) {
      return (!p.y || p.y === "any" || yb(r) === p.y) && (!p.g || p.g === "any" || goalOf(r) === p.g) && (!p.c || !p.c.length || p.c.indexOf(r.cls) >= 0);
    }
    function pickN(p) { return INSTR.filter(function (r) { return pickHit(r, p); }).length; }
    function pickText(p) {
      var t = [];
      if (YTXT[p.y]) t.push(YTXT[p.y]);
      if (GTXT[p.g]) t.push(GTXT[p.g]);
      t.push(p.c && p.c.length ? p.c.map(clsLabel).join(", ") : "любые активы");
      return t.join(" · ");
    }
    // Значки целей — та же «форма выплаты», что у строк продуктов: пол с ростом, клюшка, полка с купонами
    var GICON = {
      keep: ['#4F86E6', '<path d="M6 21H15L24 10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 21H25" stroke="currentColor" stroke-opacity=".38" stroke-width="1.4" stroke-dasharray="2 3"/>'],
      grow: ['#E0A24A', '<path d="M6 23H13L24 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 18H25" stroke="currentColor" stroke-opacity=".38" stroke-width="1.4" stroke-dasharray="2 3"/>'],
      coupon: ['#46A9A0', '<path d="M6 22L13 15H24" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="9" r="1.7" fill="currentColor"/><circle cx="21" cy="9" r="1.7" fill="currentColor"/><path d="M5 15H25" stroke="currentColor" stroke-opacity=".38" stroke-width="1.4" stroke-dasharray="2 3"/>']
    };
    function gIcon(k) { var g = GICON[k]; return '<span class="tg-qz-gi" aria-hidden="true" style="color:' + g[0] + ";background:" + rgba(g[0], 0.14) + '"><svg viewBox="0 0 30 30" width="30" height="30" fill="none">' + g[1] + "</svg></span>"; }

    var QZ = null;   // открытый опрос: { step, a: { y, g, c } }
    function openQuiz() {
      if (QZ) return;
      var cur = S.prod.pick || {};
      QZ = { step: 0, a: { y: cur.y && cur.y !== "any" ? cur.y : "", g: cur.g && cur.g !== "any" ? cur.g : "", c: (cur.c || []).slice() } };
      var el = document.createElement("div");
      el.className = "tg-qz"; el.id = "tg-qz";
      el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Подбор продуктов за 3 вопроса");
      el.addEventListener("click", qzClick);
      document.getElementById("tg-app").appendChild(el);
      document.documentElement.classList.add("tg-qz-on");
      // Опрос — запись в истории: системный «назад» его закрывает
      hist({ tg: S.cur, d: H.d + 1, from: S.cur, qz: 1 });
      qzRender();
    }
    function closeQuiz(viaHistory) {
      var el = document.getElementById("tg-qz"); if (el) el.remove();
      document.documentElement.classList.remove("tg-qz-on");
      var was = !!QZ; QZ = null;
      if (was && !viaHistory && (history.state || {}).qz) history.back();
    }
    function qzRender() {
      var el = document.getElementById("tg-qz"); if (!el || !QZ) return;
      var a = QZ.a, st = QZ.step, body;
      var head = '<div class="tg-qz-top"><button type="button" class="tg-qz-b" data-qz="back" aria-label="' + (st ? "Предыдущий вопрос" : "Закрыть подбор") + '">' +
        (st ? CHEV_L : '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>') +
        '</button><span class="tg-qz-n">Вопрос ' + (st + 1) + " из 3</span></div>" +
        '<div class="tg-qz-bar" aria-hidden="true"><i class="on"></i><i' + (st > 0 ? ' class="on"' : "") + "></i><i" + (st > 1 ? ' class="on"' : "") + "></i></div>";
      if (st === 0) {
        body = '<h2 class="tg-qz-q">На какой срок готовы вложить?</h2><p class="tg-qz-h">Продукт работает до погашения — срок стоит решить первым.</p>' +
          '<div class="tg-qz-ys">' + QY.map(function (o) {
            var n = pickN({ y: o[0] });
            return '<button type="button" class="tg-qz-y" data-qz="y:' + o[0] + '" aria-pressed="' + (a.y === o[0]) + '"' + (n ? "" : " disabled") + "><b>" + o[1] + "</b><span>" + o[2] + "</span><small>" + nProd(n) + "</small></button>";
          }).join("") + '</div><button type="button" class="tg-qz-skip" data-qz="y:any">Срок не важен</button>';
      } else if (st === 1) {
        body = '<h2 class="tg-qz-q">Что для вас важнее?</h2><p class="tg-qz-h">От этого зависит, как продукт платит и чем вы рискуете.</p>' +
          '<div class="tg-qz-gs">' + QG.map(function (o) {
            var n = pickN({ y: a.y, g: o[0] });
            return '<button type="button" class="tg-qz-g" data-qz="g:' + o[0] + '" aria-pressed="' + (a.g === o[0]) + '"' + (n ? "" : " disabled") + ">" + gIcon(o[0]) +
              '<span class="t"><b>' + o[1] + "</b><small>" + (n ? o[2] : "На выбранный срок таких продуктов сейчас нет") + "</small></span><em>" + n + "</em></button>";
          }).join("") + '</div><button type="button" class="tg-qz-skip" data-qz="g:any">Не важно — покажите всё</button>';
      } else {
        // Пузыри — классы активов; площадь круга — сколько продуктов откроет выбор
        var cnt = {};
        INSTR.forEach(function (r) { if (pickHit(r, { y: a.y, g: a.g })) cnt[r.cls] = (cnt[r.cls] || 0) + 1; });
        var ks = Object.keys(cnt).sort(function (x, y) { return cnt[y] - cnt[x]; });
        var mx = Math.max.apply(null, ks.map(function (k) { return cnt[k]; }).concat([1]));
        var total = pickN({ y: a.y, g: a.g, c: a.c });
        body = '<h2 class="tg-qz-q">Какие активы интересны?</h2><p class="tg-qz-h">Можно несколько. Размер круга — сколько продуктов.</p>' +
          '<div class="tg-qz-bub">' + ks.map(function (k) {
            var d = Math.round(76 + 44 * Math.sqrt(cnt[k] / mx));
            return '<button type="button" class="tg-qz-c" data-qz="c:' + esc(k) + '" aria-pressed="' + (a.c.indexOf(k) >= 0) + '" style="width:' + d + "px;height:" + d + 'px"><b>' + esc(clsLabel(k)) + "</b><small>" + cnt[k] + "</small></button>";
          }).join("") + "</div>" +
          '<div class="tg-qz-foot"><button type="button" class="tg-qz-go" data-qz="done">' + (a.c.length ? "Показать " + nProd(total) : "Любые активы · " + nProd(total)) + ARROW + "</button>" +
          '<p class="tg-qz-legal">Подбор — фильтр по условиям, которые вы выбрали, а не рекомендация. Не является индивидуальной инвестиционной рекомендацией.</p></div>';
      }
      var crumbs = "";
      if (st >= 1) crumbs += '<button type="button" data-qz="step:0">' + esc(a.y ? YTXT[a.y] : "срок не важен") + "</button>";
      if (st >= 2) crumbs += '<button type="button" data-qz="step:1">' + esc(a.g ? GTXT[a.g] : "любая цель") + "</button>";
      if (crumbs) crumbs = '<div class="tg-qz-crumb" aria-label="Выбрано">' + crumbs + "</div>";
      el.innerHTML = '<div class="tg-qz-in">' + head + crumbs + '<div class="tg-qz-body">' + body + "</div></div>";
      var f = el.querySelector('.tg-qz-body [aria-pressed="true"]') || el.querySelector(".tg-qz-body button:not([disabled])");
      if (f && f.focus) try { f.focus({ preventScroll: true }); } catch (e) {}
    }
    function qzClick(e) {
      var b = e.target.closest("[data-qz]");
      if (!b || b.disabled || !QZ) return;
      var v = b.getAttribute("data-qz"), a = QZ.a;
      if (v === "back") { if (QZ.step) { QZ.step--; qzRender(); } else closeQuiz(false); return; }
      if (v === "done") { finishQuiz(); return; }
      if (v.indexOf("step:") === 0) { QZ.step = +v.slice(5); qzRender(); return; }
      var k = v.charAt(0), val = v.slice(2);
      function next() { b.setAttribute("aria-pressed", "true"); setTimeout(function () { if (QZ) { QZ.step++; qzRender(); } }, 170); }
      if (k === "y") { a.y = val === "any" ? "" : val; if (a.g && !pickN({ y: a.y, g: a.g })) a.g = ""; next(); }
      else if (k === "g") { a.g = val === "any" ? "" : val; a.c = a.c.filter(function (c) { return pickN({ y: a.y, g: a.g, c: [c] }) > 0; }); next(); }
      else if (k === "c") { var i = a.c.indexOf(val); if (i >= 0) a.c.splice(i, 1); else a.c.push(val); qzRender(); }
    }
    function finishQuiz() {
      var a = QZ.a, from = S.cur;
      S.prod.pick = { y: a.y || "any", g: a.g || "any", c: a.c.slice() };
      S.prod.q = ""; S.prod.type = "all"; S.prod.cls = "all";
      closeQuiz(true);
      save();
      // Запись опроса заменяем разделом «Продукты»: «назад» с выдачи ведёт туда, откуда открыли опрос
      hist({ tg: "prod", d: H.d, from: from }, true);
      S.cur = "prod"; S.y.prod = 0;
      render(false, 0, true); tabs(); save();
    }

    // ── Выпуски: на размещении и размещённые ──
    function liveOffers() { return ((window.OFFERINGS || {}).items || []).filter(function (o) { return !o.hidden && (o.status === "live" || o.status === "upcoming"); }); }
    function plReady() { return !!window.PLACEMENTS_DATA; }
    function low(s) { return String(s || "").toLowerCase().replace(/ё/g, "е"); }
    // ISIN копируют из документов, где латиница бывает набрана русскими буквами-двойниками
    // («RU000А10ВZ51» с кириллическими А и В): двойников приводим к латинице, пробелы убираем
    var LAT = { "а": "a", "в": "b", "е": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p", "с": "c", "т": "t", "у": "y", "х": "x" };
    function isinKey(s) { return low(s).replace(/\s+/g, "").replace(/[авекмнорстух]/g, function (c) { return LAT[c]; }); }
    // Активы размещённых выпусков приходят из бэкофиса как есть («SPDR Gold Shares (GLD)»):
    // ищем и по человеческому имени. Та же таблица, что NICE в placements.html, — правишь
    // одну, правь вторую
    var NICE = {
      "Currency Pair CNY/RUB": "Юань (CNY/RUB)", "Currency Pair USD/RUB": "Доллар (USD/RUB)",
      "CSI 300 Index": "Индекс CSI 300", "iShares Bitcoin Trust ETF": "Биткоин (фонд IBIT)",
      "SPDR S&P 500 ETF Trust": "S&P 500 (фонд SPY)", "SPDR Gold Shares (GLD)": "Золото (фонд GLD)",
      "Global X Uranium ETF": "Уран (фонд URA)", "Index RSP 42 Enregy AI": "Индекс RSP 42 Energy AI",
      "Index AI RSP 30": "Индекс AI RSP 30", "Rumberg Pre-IPO Index 1": "Индекс Rumberg Pre-IPO",
      "Rumberg Natural Gas": "Индекс Rumberg Natural Gas", "Денежное обязательство Контрольного лица": "Кредитный риск контрольного лица",
      "МКПАО \"Хэдхантер\"": "HeadHunter", "Татнефть (ао)": "Татнефть", "Корпоративный центр ИКС 5": "X5", "МосБиржа": "Мосбиржа"
    };
    // q — как набрали. full — ещё и по активам корзины (вкладка «Выпуски»); в «Продуктах» —
    // только ISIN, серия и название, иначе «26238» дописывал бы к продуктам на эту ОФЗ ещё и
    // все размещённые выпуски на неё (на 08.10.2026 их 18). По ISIN ищем, когда в запросе
    // есть и буквы, и цифры, от четырёх знаков: «26238» — номер ОФЗ, а не кусок ISIN
    function issFind(q, full) {
      var t = low(q).trim(), k = isinKey(q);
      if (t.length < 2) return { off: [], pl: [], n: 0 };
      var byIsin = k.length >= 4 && /^[a-z0-9]+$/.test(k) && /\d/.test(k) && /[a-z]/.test(k);
      function hit(isin, words) { return (byIsin && isinKey(isin).indexOf(k) >= 0) || low(words.join(" ")).indexOf(t) >= 0; }
      var off = liveOffers().filter(function (o) {
        return hit(o.isin, [o.serial, o.name].concat(full ? [o.reference].concat((o.basket || []).map(function (b) { return [b.name, b.full, b.ticker].join(" "); })) : []));
      });
      var pl = ((window.PLACEMENTS_DATA || {}).issues || []).filter(function (x) {
        return hit(x.isin, [x.serial, x.name].concat(full ? (x.basket || []).map(function (b) { return b.n + " " + (NICE[b.n] || ""); }) : []));
      }).sort(function (a, b) { return a.issueStart < b.issueStart ? 1 : -1; });
      return { off: off, pl: pl, n: off.length + pl.length };
    }
    // Срок до погашения словами: «2 г 9 мес», «11 мес», «18 дн»
    function termLeft(iso) {
      var a = new Date(TODAY + "T00:00:00Z"), b = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
      var m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth() - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
      if (m < 1) return Math.max(0, Math.round((b - a) / 864e5)) + " дн";
      var y = Math.floor(m / 12), mm = m % 12;
      return (y ? y + " г" : "") + (y && mm ? " " : "") + (mm ? mm + " мес" : "");
    }
    // Справа у строки — Bid, если он опубликован; иначе срок до погашения (Dribbble: Packsy —
    // полоса маршрута посылки). С 09.10.2026 Bid не публикуется, и колонка состояла из одних
    // прочерков «нет котировки» — теперь там то, что есть у каждого выпуска: сколько осталось
    // до погашения, а под строкой — тонкая полоса прошедшей части срока
    function plRow(x) {
      var live = x.maturity >= TODAY, bid = live && x.bid != null;
      var fig = bid ? '<span class="tg-fig tg-g"><b>' + fq(x.bid) + "%</b><small>Bid</small></span>"
        : live ? '<span class="tg-fig tg-tm"><b>' + termLeft(x.maturity) + "</b><small>до погашения</small></span>"
        : '<span class="tg-fig"><b>—</b><small>погашен</small></span>';
      var prog = "";
      if (live && x.issueStart) {
        var t0 = Date.parse(x.issueStart), t1 = Date.parse(x.maturity), f = (Date.parse(TODAY) - t0) / (t1 - t0);
        if (isFinite(f)) prog = '<span class="tg-term" aria-hidden="true"><i style="width:' + Math.round(Math.max(0.02, Math.min(1, f)) * 100) + '%"></i></span>';
      }
      return '<li><a class="tg-row" href="placements.html#' + esc(x.isin) + '"><span class="tg-tx"><span class="tg-nm">' + esc(x.name) + '</span><span class="tg-sb"><span class="tg-isn">' + esc(x.isin) + "</span> · " + (live ? "до " + dmy(x.maturity) : "погашен") + "</span>" + prog + "</span>" + fig + "</a></li>";
    }
    function anyBid() { return ((window.PLACEMENTS_DATA || {}).issues || []).some(function (x) { return x.bid != null && x.maturity >= TODAY; }); }
    // Жизненный цикл размещения полосой (Dribbble: Packsy — «Варшава ●—◎—○ Париж» с датами на
    // концах). Точки — события из timeline выпуска с равным шагом (по времени приём заявок занял
    // бы долю пикселя из трёх лет), отметка «сейчас» — между прошедшим и следующим событием.
    // Только даты, без «осталось N дней»: метки срочности на размещениях Руслан отклонял
    function isoD(d) { var m = String(d || "").match(/^(\d{2})\.(\d{2})\.(\d{4})$/); return m ? m[3] + "-" + m[2] + "-" + m[1] : ""; }
    function lifeBar(o) {
      var T = (o.timeline || []).map(function (p) { return { d: isoD(p.d), s: p.d, t: String(p.t || "") }; }).filter(function (p) { return p.d; });
      if (T.length < 2) return "";
      var n = T.length, i = 0;
      while (i < n && T[i].d <= TODAY) i++;                        // i — первое событие впереди
      var X = function (k) { return 7 + k * (286 / (n - 1)); };
      var xn = i === 0 ? X(0) : i >= n ? X(n - 1) : X(i - 1) + (X(i) - X(i - 1)) * Math.max(0.08, Math.min(0.92, (Date.parse(TODAY) - Date.parse(T[i - 1].d)) / (Date.parse(T[i].d) - Date.parse(T[i - 1].d))));
      var svgp = '<svg class="tg-life-l" viewBox="0 0 300 16" preserveAspectRatio="none" aria-hidden="true"><path d="M7 8H293" stroke="rgba(255,255,255,.14)" stroke-width="2"/>' +
        '<path d="M7 8H' + xn.toFixed(1) + '" stroke="#EE7D1B" stroke-width="2"/></svg>';
      var dots = T.map(function (p, k) { return '<i class="' + (k < i ? "d" : "") + '" style="left:' + (X(k) / 3).toFixed(2) + '%"></i>'; }).join("") +
        '<b style="left:' + (xn / 3).toFixed(2) + '%"></b>';
      var nx = T[Math.min(i, n - 1)], now;
      if (i === 0) now = "Скоро · " + nx.t.toLowerCase() + " " + nx.s;
      else if (i >= n) now = "Выпуск погашен";
      else if (/приём|прием/i.test(nx.t)) now = "Приём заявок до " + nx.s;
      else now = "Далее: " + nx.t.toLowerCase().replace(/ корзины$/, "") + " " + nx.s;
      var last = T[n - 1];
      return '<div class="tg-life"><div class="tg-life-t">' + svgp + dots + '</div><div class="tg-life-k"><span class="now">' + esc(now) + "</span><span>Погашение " + esc(last.s) + "</span></div></div>";
    }
    function offRow(o) {
      return '<li><a class="tg-row" href="offerings.html#' + esc(o.id) + '"><span class="tg-tx"><span class="tg-nm">' + esc(o.name) + '</span><span class="tg-sb">' + (o.isin ? '<span class="tg-isn">' + esc(o.isin) + "</span>" : esc(o.serial || "")) + (o.statusLabel ? '<span class="tg-in">' + esc(o.statusLabel) + "</span>" : "") + "</span></span>" +
        (o.price != null ? '<span class="tg-fig"><b>' + fq(o.price) + "%</b><small>цена</small></span>" : "") + "</a></li>";
    }
    function issGroups(f) {
      return (f.off.length ? '<h2 class="tg-cap">На размещении · ' + f.off.length + '</h2><ul class="tg-list">' + f.off.map(offRow).join("") + "</ul>" : "") +
        (f.pl.length ? '<h2 class="tg-cap">Размещённые выпуски · ' + f.pl.length + '</h2><ul class="tg-list">' + f.pl.map(plRow).join("") + "</ul>" : "");
    }

    // ── Состояние: живёт в sessionStorage, «Назад» из карточки возвращает туда же ──
    var KEY = "so_tabs_v1";
    var S = { cur: "home", prod: { type: "all", q: "" }, mkt: { seg: "sum" }, iss: { seg: "live", q: "" }, y: {} };
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
      var cl = S.prod.cls || "all", pk = S.prod.pick;
      var list = INSTR.filter(function (r) {
        return (pk ? pickHit(r, pk) : (S.prod.type === "all" || r.type === S.prod.type) && (cl === "all" || r.cls === cl)) &&
          (!q || (r.name + " " + r.underlying + " " + r.cls + " " + clsLabel(r.cls)).toLowerCase().indexOf(q) >= 0);
      });
      // Выпуски — по ISIN, серии и названию: клиент присылает ISIN, и набрать его в этом же
      // поиске так же естественно, как «Сбер». Фильтры актива и типа — про продукты доски
      var iss = q.length >= 2 ? issFind(S.prod.q, false) : { off: [], pl: [], n: 0 };
      var plWait = q.length >= 2 && !need("pl", ["data/placements.js"], plReady, issRefresh) && LAZY.pl !== 2;
      lastCount = list.length + iss.n;
      if (!INSTR.length && !iss.n) return '<p class="tg-note">Не удалось загрузить продукты — обновите страницу.</p>';
      if (!list.length && !iss.n) {
        if (pk && !q) return '<p class="tg-note">По этим условиям сейчас продуктов нет — каталог обновляется. <a href="#" data-quiz>Изменить ответы</a> или <a href="#" data-unpick>показать все продукты</a>.</p>';
        return plWait ? '<p class="tg-wait">Ищу среди выпусков…</p>' : '<p class="tg-note">Ничего не нашлось. Попробуйте «Сбер», «ОФЗ», «защита» или ISIN выпуска.</p>';
      }
      var out = "";
      if (S.prod.type === "all" && cl === "all" && !q && !pk) {
        // Избранное — наверху, раньше продуктов дня: это то, что человек отметил сам
        var fav = favList();
        if (fav.length) { out += '<h2 class="tg-cap">Избранное · ' + fav.length + '</h2><ul class="tg-list">' + fav.map(prodRow).join("") + "</ul>"; used += fav.length; }
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
      return out + issGroups(iss) + '<p class="tg-note">' + (pk ? "Подбор — фильтр по условиям, которые вы выбрали, а не рекомендация. " : "") +
        'Котировки индикативные. Сравнение и фильтры — на <a href="board.html">полной доске</a>.</p>';
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
      // После опроса вместо рядов фильтров — строка подбора: что выбрано, сколько нашлось
      if (S.prod.pick) {
        assets = '<div class="tg-pickbar"><span class="t"><b>Ваш подбор · ' + nProd(pickN(S.prod.pick)) + "</b><small>" + esc(pickText(S.prod.pick)) + "</small></span>" +
          '<button type="button" class="tg-pickbtn" data-quiz>Изменить</button>' +
          '<button type="button" class="tg-pickx" data-unpick aria-label="Сбросить подбор"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>';
        types = "";
      }
      return frame("Продукты", '<label class="tg-srch">' + svg("search", 18) + '<input id="tg-q" type="search" placeholder="Сбер, ОФЗ, золото, ISIN…" value="' + esc(S.prod.q) + '" enterkeyhint="search" aria-label="Поиск продуктов и выпусков"></label>' + assets,
        '<p class="tg-sub">Оформляем под клиента через менеджера. Сумма входа — в\u00a0каждой строке.</p>') +
        '<div class="tg-pad"><div class="tg-types">' + types + '</div><div id="tg-plist">' + prodList(LIMIT) + "</div></div>";
    }

    // Подгрузка файлов данных, которых на главной нет: один раз, по первому открытию раздела.
    // done — обновить только список, а не весь вид: иначе поле поиска пересоздавалось бы
    // посреди набора, и клавиатура телефона закрывалась
    var LAZY = {};
    function need(key, srcs, ready, done) {
      if (ready()) return true;
      if (!LAZY[key]) {
        LAZY[key] = 1;
        var left = srcs.length;
        srcs.forEach(function (src) {
          var s = document.createElement("script"); s.src = src;
          s.onload = s.onerror = function () { if (--left === 0) { LAZY[key] = 2; if (done) done(); else render(true); } };
          document.body.appendChild(s);
        });
      }
      return false;
    }

    // ── Сводка рынка (09.10.2026): настроение, главное за сутки, ближайшие дивиденды ──
    // Файл live/svodka.json (~3 КБ) собирает сервер из монитора рынка раз в 10 минут.
    // Он лежит вне git: ежеминутная синхронизация сайта стёрла бы его из каталога витрины,
    // поэтому у него свой адрес /live/. Сигналов «покупать / продавать», текстов постов
    // целиком и целей брокеров в файле нет намеренно: витрина эмитента не даёт
    // рекомендаций по чужим бумагам. Новости — заголовок одной фразой и время, без канала и ссылок
    var SV = null, SVST = 0;            // 0 — не грузили, 1 — грузим, 2 — не вышло, 3 — есть
    // Сводка на сервере пересобирается раз в 5 минут. Главную держат открытой часами, и раньше вкладка
    // показывала ту, что загрузилась при открытии (12.10.2026: «почему imoex старый?»). Теперь старше
    // пяти минут — тихо перезагружаем, на экране остаётся прежняя, пока новая не придёт
    var SVT = 0, SVRE = false, SV_TTL = 5 * 60e3;
    function svRefresh(done) {
      if (SVRE || !window.fetch || Date.now() - SVT < SV_TTL) return;
      SVRE = true;
      fetch("live/svodka.json", { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then(function (d) { SV = d; SVT = Date.now(); if (done) done(); }, function () { SVT = Date.now() - SV_TTL + 60e3; })
        .then(function () { SVRE = false; });
    }
    function needSv(done) {
      if (SVST === 3) { svRefresh(done); return true; }
      if (!SVST && window.fetch && window.Promise) {
        SVST = 1;
        // Вид сводки — общий модуль svview.js (тот же, что у страницы /svodka); грузится вместе с данными
        var js = window.SvView ? Promise.resolve() : new Promise(function (ok, no) {
          var sc = document.createElement("script");
          sc.src = "svview.js?v=3"; sc.onload = ok; sc.onerror = no;
          document.head.appendChild(sc);
        });
        Promise.all([fetch("live/svodka.json", { cache: "no-cache" })
          .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); }), js])
          .then(function (r) { SV = r[0]; SVST = 3; SVT = Date.now(); }, function () { SVST = 2; })
          .then(function () { if (done) done(); });
      }
      if (!window.fetch || !window.Promise) SVST = 2;
      return false;
    }
    // Файл доехал: перерисовываем только тело раздела и подпись строки «Рынок» на вводной
    function svDone() {
      var b = S.cur === "mkt" && S.mkt.seg === "sum" && document.getElementById("tg-mbody");
      if (b) {
        // раскрытое «Из чего складывается» после перерисовки остаётся раскрытым
        var open = !!b.querySelector("details.sv-parts[open]");
        b.innerHTML = mktBody();
        var det = open && b.querySelector("details.sv-parts");
        if (det) det.open = true;
      }
      var sub = S.cur === "home" && app.querySelector('a[data-go="mkt"] small');
      if (sub) sub.textContent = mktSub();
    }
    function svWatch() { if (!document.hidden && S.cur === "mkt" && S.mkt.seg === "sum" && SVST === 3) svRefresh(svDone); }
    setInterval(svWatch, 60e3);
    document.addEventListener("visibilitychange", svWatch);
    function svAge() { var t = Date.parse((SV || {}).updated || ""); return isFinite(t) ? (Date.now() - t) / 36e5 : Infinity; }
    function mktSub() {
      var M = window.MORNING || {}, fresh = daysAgo(M.date) <= 3;
      var mood = SV && SV.mood && SV.mood.label && svAge() < 72 ? "Настроение: " + SV.mood.label.toLowerCase() + " · " : "";
      return mood + (mood ? "обзор утра" : "Обзор утра") + (fresh ? " " + dmy(M.date).slice(0, 5) : "") + ", ставки, идеи";
    }
    // Тикер Мосбиржи → продукты доски на эту бумагу (акции РФ, включая корзины).
    // Число на кнопке совпадает с тем, что откроет «Продукты»: тот же класс и то же имя в поиске
    var TK = null;
    function tkMap() {
      if (TK) return TK;
      TK = {};
      INSTR.forEach(function (r) {
        var m = /^(.+?)\s*\(([A-Z]{1,6})\)$/.exec(r.underlying || "");
        if (m && r.cls === "Акции РФ") TK[m[2]] = { name: m[1], n: 0 };
      });
      Object.keys(TK).forEach(function (t) {
        var q = TK[t].name.toLowerCase();
        TK[t].n = INSTR.filter(function (r) {
          return r.cls === "Акции РФ" && (r.name + " " + r.underlying + " " + r.cls).toLowerCase().indexOf(q) >= 0;
        }).length;
      });
      return TK;
    }
    function svBody() {
      if (!needSv(svDone)) {
        return SVST === 2 ? '<p class="tg-note">Сводка сейчас недоступна. Обзор утра и ставки — в соседних разделах.</p>'
          : '<p class="tg-wait">Загружаю сводку…</p>';
      }
      if (!(svAge() < 72)) return '<p class="tg-note">Сводка временно не обновляется. Обзор утра и ставки — в соседних разделах.</p>';
      // Отрисовка — svview.js. Отсюда — только то, что есть у главной: переходы к продуктам на бумаги
      // из новостей и дивидендов. Ни ссылок на посты, ни названий каналов — решение Руслана 09.10.2026
      return SvView.html(SV, {
        share: "Картинка и ссылка для клиента",
        prod: function (tks) {
          var seen = {};
          return tks.map(function (k) { return tkMap()[k]; })
            .filter(function (x) { if (!x || !x.n || seen[x.name]) return false; seen[x.name] = 1; return true; });
        },
        divProd: function (t) { return tkMap()[t] || null; }
      });
    }

    // Карточка дня для клиента — модуль svcard.js, общий со страницей /svodka (09.10.2026).
    // Грузится по первому нажатию: главной он не нужен, пока карточку не открыли
    function openCard(btn) {
      if (!SV) return;
      if (window.SvCard) { SvCard.open(SV, btn); return; }
      var sc = document.createElement("script");
      sc.src = "svcard.js?v=2";
      sc.onload = function () { if (window.SvCard) SvCard.open(SV, btn); };
      document.head.appendChild(sc);
    }

    // >>> am
    // ── Утро (12.10.2026, Руслан: «вкладку „Утро“ в рынке сейчас читать тяжеловато» → вариант A
    // со стенда → «слишком много текста, чуть более интерактивней») ──
    // Было: три серые карточки сплошным текстом и ссылка «Разбор →» на другую страницу.
    // Стало: на экране одна тема — карточки листаются вбок (родная прокрутка с прилипанием,
    // без скрипта под пальцем: своё листание на айфоне лагало), над ними вкладки тем; полный
    // разбор открывается читалкой во весь экран с «Дальше: следующая тема» (тексты из
    // data/research.js — их пишет тот же бот из той же статьи аналитика); под темой — продукты
    // на активы из текста — в конце разбора; «почему эти продукты» — по кнопке; прошлые обзоры — строкой дат.
    // Первая отрисовка — из data/morning.js (он уже на странице), разборы (~150 КБ)
    // подгружаются при открытии «Утра»
    var WDN = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
    var WDZ = ["воскресенье", "понедельник", "вторник", "среду", "четверг", "пятницу", "субботу"];
    var WDS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
    var MONG = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    function isoDate(iso) { var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; }
    function rsReady() { return !!(window.RESEARCH && RESEARCH.issues); }
    // Выпуски обзора: из разборов (там полный текст и «почему сейчас» у продуктов), а если
    // утренний обзор свежее разборов — он первым, с коротким текстом
    function amIssues() {
      var M = window.MORNING || {}, out = [];
      (rsReady() ? RESEARCH.issues : []).forEach(function (is) {
        if (!is || !is.date || !is.items || !is.items.length) return;
        out.push({ date: String(is.date).slice(0, 10), items: is.items.map(function (it) {
          return { rubric: it.rubric, title: it.title, lead: it.lead || "", body: it.body && it.body.length ? it.body : null, link: "research.html?i=" + encodeURIComponent(is.id || is.date) + (it.id ? "#" + encodeURIComponent(it.id) : "") };
        }), products: (is.products || []).map(function (p) { return typeof p === "string" ? { id: p } : p; }) });
      });
      out.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      if (M.date && (M.news || []).length && (!out.length || M.date > out[0].date)) {
        out.unshift({ date: M.date, items: M.news.map(function (n) { return { rubric: n.rubric, title: n.title, lead: n.body || "", body: null, link: n.link || "research.html" }; }),
          products: (M.products || []).map(function (id) { return { id: id }; }) });
      }
      return out;
    }
    // Цифры с единицами — светлым и плотнее: по ним и читают обзор («Brent $103», «+2,86%»)
    var AM_NUM = /(\$\s?\d[\d ]*(?:[.,]\d+)?|[+−-]?\d[\d  ]*(?:[.,]\d+)?\s?(?:%|б\.\s?п\.|п\.\s?п\.|п\.(?=[\s,;:)]|$)|млрд|млн|трлн|тыс\.|₽)|\d+,\d+)/g;
    function amText(s) { return esc(s).replace(AM_NUM, '<b class="am-n">$1</b>'); }
    function amMin(it) { return Math.max(1, Math.round((it.body ? it.body.join(" ") : it.lead).split(/\s+/).length / 170)); }
    // Активы доски, названные в тексте → продукты на них. Число на кнопке = сколько откроет
    // «Продукты» (тот же поиск и класс, что в prodList)
    var AM_ALIAS = { "Сбербанк": "сбер(?!инвест)", "Газпром": "газпром(?![\\s-]*нефт)", "Т-Банк": "т-банк|тинькофф", "ДОМ.РФ": "дом\\.рф",
      "USDRUB": "usdrub|доллар (?:слабеет|дешевеет|укрепля|дорожает|растёт|растет|подешев|подорож)|курс доллара", "CNYRUB": "cnyrub|юан",
      "Золото": "золот", "Super Micro Computer": "super\\s?micro|smci", "Bitcoin": "биткоин|bitcoin", "S&P 500": "s&p\\s?500", "ОФЗ": "офз" };
    var AM_SHOW = { "USDRUB": "Доллар", "CNYRUB": "Юань" };
    var AMA = null;
    function amAssets() {
      if (AMA) return AMA;
      var seen = {};
      AMA = [];
      function add(name, cls, q, re) {
        if (seen[q + "|" + cls]) return;
        var lq = q.toLowerCase();
        var n = INSTR.filter(function (r) { return r.cls === cls && (r.name + " " + r.underlying + " " + r.cls + " " + clsLabel(r.cls)).toLowerCase().indexOf(lq) >= 0; }).length;
        if (!n) return;
        seen[q + "|" + cls] = 1;
        AMA.push({ name: name, cls: cls, q: q, n: n, re: new RegExp("(^|[^а-яёa-z])(?:" + re + ")", "i") });
      }
      INSTR.forEach(function (r) {
        var u = String(r.underlying || "");
        if (/[\/]/.test(u)) return;                              // корзины — по своим бумагам
        var m = /^(.+?)\s*\(([A-Z.]{1,6})\)$/.exec(u), name = (m ? m[1] : u).trim();
        if (/^ОФЗ/.test(name)) { add("ОФЗ", r.cls, "ОФЗ", AM_ALIAS["ОФЗ"]); return; }
        var re = AM_ALIAS[name];
        if (!re) {
          var w = name.split(/\s+/)[0];
          if (/^[A-Za-z]/.test(name)) re = /^(CSI|Hang|S&P)/.test(name) ? name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          else re = (name.length > 5 ? name.replace(/[ьаяйоеы]$/i, "") : name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        }
        add(name, r.cls, name, re);
      });
      AMA.sort(function (a, b) { return b.name.length - a.name.length; });
      return AMA;
    }
    function amChips(it, cap) {
      var t = " " + [it.title, it.lead].concat(it.body || []).join(" ") + " ";
      var hit = amAssets().filter(function (a) { return a.re.test(t); }).slice(0, 4);
      if (!hit.length) return "";
      return '<div class="am-tks"><span>' + (cap || "Продукты на активы из этой темы") + '</span>' + hit.map(function (a) {
        return '<a href="board.html?q=' + encodeURIComponent(a.q) + '" data-pq="' + esc(a.q) + '" data-pc="' + esc(a.cls) + '">' + esc(AM_SHOW[a.name] || a.name) + "<em>" + a.n + "</em></a>";
      }).join("") + "</div>";
    }
    // Позиция каждой карусели (Утро — am, идеи дайджеста — id, разборы — rv) и открытая читалка
    var AM_DAY = null, AM_WHY = false, RD = null, CAR = { am: 0, id: 0, rv: 0 };
    var CHEV_D = '<svg class="am-cv" width="14" height="9" viewBox="0 0 14 9" fill="none" aria-hidden="true"><path d="M1.5 1.5 7 7l5.5-5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    function amCur() {
      var all = amIssues(), k = 0;
      if (AM_DAY) for (var i = 0; i < all.length; i++) if (all[i].date === AM_DAY) { k = i; break; }
      return { all: all, k: k, cur: all[k] || null };
    }
    function amBody() {
      var rs = need("rs", ["data/research.js?v=7"], rsReady, amDone);
      var o = amCur(), cur = o.cur, k = o.k;
      if (!cur) return '<p class="tg-note">Утренний обзор выходит по будням — здесь появится первый.</p>';
      var n = cur.items.length, d = isoDate(cur.date), age = daysAgo(cur.date), mins = 0;
      if (CAR.am >= n) CAR.am = 0;
      cur.items.forEach(function (it) { mins += amMin(it); });
      var out = '<div class="am">';
      out += '<p class="am-day">' + (k === 0 && age === 0 && d ? esc(WDN[d.getDay()].charAt(0).toUpperCase() + WDN[d.getDay()].slice(1) + ", " + d.getDate() + " " + MONG[d.getMonth()])
        : "Обзор за " + esc(d ? WDZ[d.getDay()] + ", " + d.getDate() + " " + MONG[d.getMonth()] : dmy(cur.date))) +
        '<span> · ' + n + " " + plural(n, "тема", "темы", "тем") + " · " + mins + " мин чтения</span></p>";
      if (k === 0 && age > 3) out += '<p class="tg-note am-old">Свежего обзора пока нет — это последний вышедший.</p>';
      // Прошлые обзоры — строкой дат: сегодня первым
      if (o.all.length > 1) {
        out += '<div class="am-dates" role="group" aria-label="Обзоры по дням">' + o.all.slice(0, 8).map(function (x, j) {
          var xd = isoDate(x.date);
          return '<button type="button" data-amday="' + (j ? esc(x.date) : "") + '" aria-pressed="' + (j === k) + '" aria-label="Обзор за ' + esc(dmy(x.date)) + '"><small>' +
            (j === 0 && daysAgo(x.date) === 0 ? "сегодня" : xd ? WDS[xd.getDay()] : "") + "</small><b>" + (xd ? xd.getDate() : "") + "</b></button>";
        }).join("") + "</div>";
      }
      // Темы: вкладки и карточки, листаются вбок
      out += '<div class="am-tabs" role="tablist" aria-label="Темы обзора">' + cur.items.map(function (it, i) {
        return '<button type="button" role="tab" data-amto="' + i + '" aria-selected="' + (i === CAR.am) + '" aria-controls="am-c' + i + '">' + esc(it.rubric) + "</button>";
      }).join("") + "</div>";
      out += '<div class="am-car" id="am-car" data-car="am">' + cur.items.map(function (it, i) {
        return '<article class="am-cd" id="am-c' + i + '" role="tabpanel" aria-label="' + esc(it.rubric) + ", " + (i + 1) + " из " + n + '">' +
          '<div class="am-cdt"><span class="am-rb">' + esc(it.rubric) + '</span><span class="am-k">' + (i + 1) + " / " + n + "</span></div>" +
          '<h2 class="am-h">' + esc(it.title) + "</h2>" +
          '<p class="am-ld">' + amText(it.lead) + "</p>" +
          '<div class="am-ft"><button type="button" class="am-more" data-amrd="' + i + '">Читать разбор<small>' + amMin(it) + " мин</small>" + ARROW + "</button></div></article>";
      }).join("") + "</div>";
      // Продукты дня — только у последнего обзора: «почему сейчас» в прошлых выпусках
      // ссылается на тогдашние цены
      if (k === 0) {
        var day = cur.products.map(function (p) { return BY[p.id] ? { r: BY[p.id], why: p.why } : null; }).filter(Boolean);
        var hasWhy = day.some(function (x) { return x.why; });
        if (day.length) {
          out += '<div class="am-ph" id="am-ph"><h2 class="tg-cap">Продукты под темы утра</h2>' +
            (hasWhy ? '<button type="button" class="am-wbtn" data-amwhy aria-pressed="' + AM_WHY + '" aria-controls="am-pl">Почему они' + CHEV_D + "</button>" : "") + "</div>" +
            '<ul class="tg-list am-pl' + (AM_WHY ? " am-wy" : "") + '" id="am-pl">' + day.map(function (x) {
              return prodRow(x.r).replace(/<\/li>$/, (x.why ? '<p class="am-why">' + amText(x.why) + "</p>" : "") + "</li>");
            }).join("") + '</ul><p class="tg-note">Подборка аналитика под темы обзора — не индивидуальная рекомендация. Котировки индикативные.</p>';
        }
      } else out += '<p class="tg-note am-pastn">Продукты под темы утра — у последнего обзора: в прошлых выпусках цены уже другие.</p>';
      if (!rs && LAZY.rs !== 2 && o.all.length < 2) out += '<p class="am-wait">Загружаю прошлые обзоры…</p>';
      if (window.requestAnimationFrame) requestAnimationFrame(carPlace);
      return out + "</div>";
    }
    function carStep(car) { var c = car.children; return c.length > 1 ? c[1].offsetLeft - c[0].offsetLeft : car.clientWidth || 1; }
    // После перерисовки карточки стоят там, где человек был
    function carPlace() {
      [].forEach.call(document.querySelectorAll("[data-car]"), function (car) {
        car.style.scrollBehavior = "auto"; car.scrollLeft = (CAR[car.getAttribute("data-car")] || 0) * carStep(car); car.style.scrollBehavior = "";
      });
    }
    function amTabs() {
      [].forEach.call(document.querySelectorAll(".am-tabs [data-amto]"), function (b) { b.setAttribute("aria-selected", +b.getAttribute("data-amto") === CAR.am); });
    }
    // Листают карточки пальцем — запоминаем позицию, в «Утре» подсвечиваем вкладку темы
    // (scroll не всплывает, слушаем на захвате)
    document.addEventListener("scroll", function (e) {
      var car = e.target, k = car && car.getAttribute && car.getAttribute("data-car");
      if (!k) return;
      var i = Math.round(car.scrollLeft / carStep(car));
      if (i !== CAR[k] && i >= 0 && i < car.children.length) { CAR[k] = i; if (k === "am") amTabs(); else if (k === "rt") rtTabs(); }
    }, { capture: true, passive: true });
    function amTo(i) {
      var car = document.getElementById("am-car"); if (!car) return;
      CAR.am = i; amTabs();
      var x = i * carStep(car);
      if (car.scrollTo) car.scrollTo({ left: x, behavior: "smooth" }); else car.scrollLeft = x;
    }
    function amDone() {
      var b = S.cur === "mkt" && S.mkt.seg === "morning" && document.getElementById("tg-mbody");
      if (b) b.innerHTML = mktBody();
      if (RD) rdRender();
    }
    function amWhy(btn) {
      AM_WHY = !AM_WHY;
      btn.setAttribute("aria-pressed", AM_WHY);
      var l = document.getElementById("am-pl"); if (l) l.classList.toggle("am-wy", AM_WHY);
    }

    // Читалка: во весь экран, тема за темой (Утро) или идея за идеей (Идеи). Запись в истории —
    // «назад» её закрывает
    function openRd(k, i) {
      if (RD || (k === "am" ? !amCur().cur : k === "id" ? !idCur().list.length : !rtPool().length)) return;
      RD = { k: k, i: i };
      var el = document.createElement("div");
      el.className = "tg-qz am-rd"; el.id = "am-rd";
      el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", k === "am" ? "Разбор утреннего обзора" : k === "id" ? "Идея недели" : "Ставки на срок");
      el.addEventListener("click", rdClick);
      document.getElementById("tg-app").appendChild(el);
      document.documentElement.classList.add("tg-qz-on");
      hist({ tg: S.cur, d: H.d + 1, from: S.cur, rd: 1 });
      rdRender();
    }
    function closeRd(viaHistory) {
      var el = document.getElementById("am-rd"); if (el) el.remove();
      document.documentElement.classList.remove("tg-qz-on");
      var was = !!RD; if (RD) CAR[RD.k] = RD.i; RD = null;
      amTabs(); carPlace();
      if (was && !viaHistory && (history.state || {}).rd) history.back();
    }
    function rdRender() {
      var el = document.getElementById("am-rd");
      if (el && RD && RD.k === "id") { idRd(el); return; }
      if (el && RD && RD.k === "rt") { rtRd(el); return; }
      var o = amCur();
      if (!el || !RD || !o.cur) return;
      var items = o.cur.items, n = items.length, i = Math.min(RD.i, n - 1), it = items[i];
      var bar = items.map(function (x, j) { return "<i" + (j <= i ? ' class="on"' : "") + "></i>"; }).join("");
      var text = it.body ? it.body.map(function (p) { return "<p>" + amText(p) + "</p>"; }).join("")
        : "<p>" + amText(it.lead) + "</p>" + (rsReady() || LAZY.rs === 2 ? '<p class="am-link"><a href="' + esc(it.link) + '">Разбор целиком — на отдельной странице</a></p>' : '<p class="am-wait">Загружаю разбор…</p>');
      var nx = items[i + 1], hasProd = o.k === 0 && o.cur.products.some(function (p) { return BY[p.id]; });
      var next = nx ? '<button type="button" class="am-nx" data-rd="next"><small>Дальше · ' + esc(nx.rubric) + "</small><b>" + esc(nx.title) + "</b>" + ARROW + "</button>"
        : '<button type="button" class="am-nx am-nx-end" data-rd="' + (hasProd ? "prod" : "close") + '"><b>' + (hasProd ? "Продукты под темы утра" : "Готово") + "</b>" + ARROW + "</button>";
      el.innerHTML = '<div class="tg-qz-in"><div class="tg-qz-top"><button type="button" class="tg-qz-b" data-rd="close" aria-label="Закрыть разбор">' +
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
        '<span class="tg-qz-n">' + esc(it.rubric) + " · " + (i + 1) + " из " + n + "</span>" +
        (i > 0 ? '<button type="button" class="am-pv" data-rd="prev">' + CHEV_L + "<span>" + esc(items[i - 1].rubric) + "</span></button>" : "") + "</div>" +
        '<div class="tg-qz-bar" aria-hidden="true">' + bar + "</div>" +
        '<div class="tg-qz-body am-rdb"><h2 class="am-rh">' + esc(it.title) + '</h2><div class="am-rt">' + text + "</div>" + amChips(it) + next + "</div></div>";
      el.scrollTop = 0;
    }
    function rdClick(e) {
      var pq = e.target.closest("[data-pq]");
      if (pq) {
        // Из читалки — сразу в «Продукты»: запись читалки заменяем разделом, «назад» вернёт в «Рынок»
        e.preventDefault();
        closeRd(true); save();
        S.prod.q = pq.getAttribute("data-pq"); S.prod.cls = pq.getAttribute("data-pc") || "all"; S.prod.type = "all"; S.prod.pick = null; S.y.prod = 0;
        hist({ tg: "prod", d: H.d, from: "mkt" }, true);
        S.cur = "prod"; render(false, 0, true); tabs(); save();
        return;
      }
      var b = e.target.closest("[data-rd]"); if (!b || !RD) return;
      var v = b.getAttribute("data-rd");
      if (v === "close") closeRd(false);
      else if (v === "next") { RD.i++; rdRender(); }
      else if (v === "tolist") closeRd(false);
      else if (v.indexOf("sum:") === 0) { RT_SUM = +v.slice(4); try { sessionStorage.setItem("so_rt_sum", RT_SUM); } catch (er) {} rtDone(); }
      else if (v === "our") { closeRd(false); carTo("rt", RT_B.length); }
      else if (v === "prev") { RD.i = Math.max(0, RD.i - 1); rdRender(); }
      else if (v === "prod") {
        closeRd(false);
        setTimeout(function () {
          var ph = document.getElementById("am-ph"), ctl = document.querySelector(".tg-v .tg-ctl");
          if (ph) window.scrollTo({ top: ph.getBoundingClientRect().top + window.pageYOffset - (ctl ? ctl.getBoundingClientRect().bottom : 100) - 8, behavior: "smooth" });
        }, 60);
      }
    }
    // <<< am
    // >>> id
    // ── Идеи (12.10.2026, Руслан: «теперь сделаем так же „Идеи“ в рынке») ──
    // Тот же приём, что у «Утра»: идеи дайджеста — карточками вбок (график выплаты, главная
    // цифра, вход), над ними строка дат (прошлые выпуски) и фильтр по типу продукта; «Подробнее»
    // открывает читалку идеи (гипотеза, график, параметры, как заработать, риск, логика) с
    // переходом к продукту. Ниже — разборы к вебинарам карточками, сверху — ближайший вебинар.
    // Графики, «риск» и параметры — функции data/digest-lib.js (DF), те же, что на странице
    // дайджеста: правишь там — меняется и здесь
    var ID_DAY = null, ID_FAM = "all";
    function idReady() { return !!(window.DIGEST_ARCHIVE && window.IDEAS); }
    function dfReady() { return !!window.DF; }
    function idIssueDate(x) { return isoDate(x.id) || isoDate(String(x.date || "").replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, "$3-$2-$1")); }
    function idCur() {
      var A = window.DIGEST_ARCHIVE || {}, all = (A.issues || []).filter(function (x) { return x && x.ideas && x.ideas.length; }), k = 0;
      if (ID_DAY) for (var i = 0; i < all.length; i++) if (all[i].id === ID_DAY) { k = i; break; }
      var cur = all[k] || null;
      if (cur && ID_FAM !== "all" && !cur.ideas.some(function (it) { return it.family === ID_FAM; })) ID_FAM = "all";
      var list = cur ? cur.ideas.filter(function (it) { return ID_FAM === "all" || it.family === ID_FAM; }) : [];
      return { all: all, k: k, cur: cur, list: list };
    }
    function idSec(f) { return (window.DF && DF.sectionOf(f)) || { label: f || "Идея", color: "#8A93A6" }; }
    // Идея ↔ продукт: по точному имени на доске или в размещениях (идеи заводят из них же)
    var IDNM = null;
    function idProd(it) {
      if (!IDNM) {
        IDNM = {};
        INSTR.forEach(function (r) { IDNM[r.name] = "instrument.html?id=" + encodeURIComponent(r.id); });
        ((window.OFFERINGS || {}).items || []).forEach(function (o) { if (!o.hidden && !IDNM[o.name]) IDNM[o.name] = "offerings.html#" + encodeURIComponent(o.id); });
      }
      return IDNM[it.name] || null;
    }
    function idChart(it) { return window.DF ? '<div class="id-ch" aria-hidden="true">' + DF.payoffSvg(it.payoff, idSec(it.family).color) + "</div>" : ""; }
    function idCard(it, i, n) {
      var sc = idSec(it.family), m = it.metric || {}, price = it.p && it.p.price;
      return '<article class="am-cd id-cd" style="--fc:' + esc(sc.color) + '" aria-label="' + esc(sc.label) + ", " + (i + 1) + " из " + n + '">' +
        '<div class="am-cdt"><span class="id-fam"><i></i>' + esc(sc.label) + '</span><span class="am-k">' + (i + 1) + " / " + n + "</span></div>" +
        '<h2 class="am-h id-h">' + esc(it.name) + "</h2>" +
        '<p class="id-sub">' + esc([it.underlying, it.tenor].filter(Boolean).join(" · ")) + "</p>" +
        idChart(it) +
        '<div class="id-ms">' + (m.v ? "<div><b>" + esc(m.v) + "</b><span>" + esc(m.k || "") + "</span></div>" : "") +
        (price ? '<div><b class="id-pz">' + esc(price) + "</b><span>вход</span></div>" : "") + "</div>" +
        '<div class="am-ft"><button type="button" class="am-more" data-idrd="' + i + '">Подробнее об идее' + ARROW + "</button></div></article>";
    }
    function idDone() {
      var b = S.cur === "mkt" && S.mkt.seg === "ideas" && document.getElementById("tg-mbody");
      if (b) b.innerHTML = mktBody();
      if (RD) rdRender();
    }
    function idWeb(e, past) {
      var d = isoDate(e.date);
      return '<a class="id-web" href="events.html"><span class="id-wd">' + (d ? "<small>" + WDS[d.getDay()] + "</small><b>" + d.getDate() + "</b><small>" + MONG[d.getMonth()].slice(0, 3) + "</small>" : "") + "</span>" +
        '<span class="id-wt"><small>' + (past ? (e.recordingUrl ? "Запись вебинара" : "Прошедший вебинар") : "Вебинар" + (e.timeMsk ? " · " + esc(e.timeMsk) + " МСК" : "")) + "</small><b>" + esc(e.title) + "</b>" +
        '<em>' + (past ? (e.recordingUrl ? "Смотреть запись" : "Подробнее") : "Записаться") + "</em></span>" + CHEV + "</a>";
    }
    function idBody() {
      var out = '<div class="am">';
      var E = (window.EVENTS && EVENTS.items) || [];
      var nx = E.filter(function (e) { return e.date >= TODAY; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
      if (nx) out += idWeb(nx, false);
      // Дайджест и разборы — 460 КБ: грузим только здесь, теми же адресами, что и главная
      if (!need("ideas", ["data/digest.js?v=srv6", "data/ideas.js?v=1"], idReady, idDone)) {
        return out + (LAZY.ideas === 2 ? '<p class="tg-note">Не удалось загрузить идеи и разборы. Обновите страницу.</p>' : '<p class="tg-wait">Загружаю идеи недели…</p>') + "</div>";
      }
      need("dfl", ["data/digest-lib.js?v=10"], dfReady, idDone);       // графики — после дайджеста: DF читает его при загрузке
      var o = idCur(), cur = o.cur;
      if (cur) {
        var d = idIssueDate(cur), n = cur.ideas.length;
        if (CAR.id >= o.list.length) CAR.id = 0;
        out += '<p class="am-day">Идеи недели' + (d ? " · " + d.getDate() + " " + MONG[d.getMonth()] : "") + "<span> · " + n + " " + plural(n, "идея", "идеи", "идей") + "</span></p>";
        if (o.all.length > 1) {
          out += '<div class="am-dates" role="group" aria-label="Выпуски дайджеста">' + o.all.slice(0, 8).map(function (x, j) {
            var xd = idIssueDate(x);
            return '<button type="button" data-idday="' + (j ? esc(x.id) : "") + '" aria-pressed="' + (j === o.k) + '" aria-label="Выпуск от ' + esc(x.date) + '"><small>' +
              (xd ? MONG[xd.getMonth()].slice(0, 3) : "") + "</small><b>" + (xd ? xd.getDate() : "") + "</b></button>";
          }).join("") + "</div>";
        }
        // Фильтр по типу продукта — разделы дайджеста, только те, что есть в выпуске
        var cnt = {};
        cur.ideas.forEach(function (it) { cnt[it.family] = (cnt[it.family] || 0) + 1; });
        var secs = ((window.DIGEST_ARCHIVE || {}).sections || []).filter(function (s) { return cnt[s.key]; });
        if (secs.length > 1) {
          out += '<div class="tg-chips id-fams" role="group" aria-label="Тип продукта">' +
            '<button type="button" data-idfam="all" aria-pressed="' + (ID_FAM === "all") + '">Все<em>' + n + "</em></button>" +
            secs.map(function (s) { return '<button type="button" data-idfam="' + esc(s.key) + '" aria-pressed="' + (ID_FAM === s.key) + '" style="--fc:' + esc(s.color) + '"><i></i>' + esc(s.label) + "<em>" + cnt[s.key] + "</em></button>"; }).join("") + "</div>";
        }
        out += '<div class="am-car id-car" id="id-car" data-car="id">' + o.list.map(function (it, i) { return idCard(it, i, o.list.length); }).join("") + "</div>";
        out += '<p class="tg-note">Идеи недели — подборка аналитика, а не индивидуальная рекомендация. Котировки индикативные.</p>';
      }
      // Разборы к вебинарам — карточками, открываются страницей разбора
      var R = ((window.IDEAS || {}).issues || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      if (R.length) {
        out += '<h2 class="tg-cap am-cap">Разборы к вебинарам</h2><div class="am-car rv-car" id="rv-car" data-car="rv">' + R.map(function (x) {
          var f = (x.facts || [])[0], k = x.kind === "theme" ? 0 : (x.items || []).length;
          return '<a class="am-cd rv-cd" href="ideas.html?i=' + encodeURIComponent(x.id) + '" style="--fc:' + esc(x.color || "#EE7D1B") + '">' +
            '<div class="am-cdt"><span class="am-rb">' + esc(x.kick || "Разбор") + '</span><span class="am-k">' + esc(dmy(x.date).slice(0, 5)) + "</span></div>" +
            '<h2 class="am-h">' + esc(x.title) + "</h2>" +
            (f ? '<div class="rv-f"><b>' + esc(f.v) + "</b><span>" + esc(f.k) + "</span></div>" : '<p class="am-ld rv-sub">' + esc(x.sub || "") + "</p>") +
            '<span class="rv-go">' + (k ? k + " " + plural(k, "компания", "компании", "компаний") + " · " : "") + "Открыть разбор" + ARROW + "</span></a>";
        }).join("") + "</div>";
      }
      if (!nx) {
        var last = E.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
        if (last) out += '<h2 class="tg-cap am-cap">Вебинары</h2>' + idWeb(last, true);
      }
      if (window.requestAnimationFrame) requestAnimationFrame(function () {
        carPlace();
        // выбранный тип — в видимую часть ряда фильтров
        var f = document.querySelector('.id-fams [aria-pressed="true"]');
        if (f) f.parentNode.scrollLeft = ID_FAM === "all" ? 0 : f.offsetLeft - 16;
      });
      return out + "</div>";
    }
    // Читалка идеи
    function idRd(el) {
      var o = idCur(), list = o.list, n = list.length;
      if (!n) { closeRd(false); return; }
      var i = Math.min(RD.i, n - 1); RD.i = i;
      var it = list[i], sc = idSec(it.family), c = sc.color;
      var bar = list.map(function (x, j) { return "<i" + (j <= i ? ' class="on"' : "") + "></i>"; }).join("");
      var rows = window.DF && DF.paramRows ? DF.paramRows(it) : [];
      var risk = window.DF && DF.riskOf ? DF.riskOf(it) : "";
      var factors = (it.factors || []).map(function (f) { return String(f).replace(/^[^0-9A-Za-zА-Яа-яЁё«"$+−(]+/, ""); }).filter(Boolean);
      var prod = idProd(it), nx = list[i + 1];
      var sec = function (k, html) { return html ? '<h3 class="id-k">' + k + "</h3>" + html : ""; };
      var next = nx ? '<button type="button" class="am-nx" data-rd="next"><small>Дальше · ' + esc(idSec(nx.family).label) + "</small><b>" + esc(nx.name) + "</b>" + ARROW + "</button>"
        : '<button type="button" class="am-nx am-nx-end" data-rd="tolist"><b>К идеям недели</b>' + ARROW + "</button>";
      el.innerHTML = '<div class="tg-qz-in" style="--fc:' + esc(c) + '"><div class="tg-qz-top"><button type="button" class="tg-qz-b" data-rd="close" aria-label="Закрыть идею">' +
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
        '<span class="tg-qz-n">' + esc(sc.label) + " · " + (i + 1) + " из " + n + "</span>" +
        (i > 0 ? '<button type="button" class="am-pv" data-rd="prev">' + CHEV_L + "<span>Назад</span></button>" : "") + "</div>" +
        '<div class="tg-qz-bar" aria-hidden="true">' + bar + "</div>" +
        '<div class="tg-qz-body am-rdb"><h2 class="am-rh">' + esc(it.name) + '</h2><p class="id-rsub">' + esc([it.underlying, it.tenor].filter(Boolean).join(" · ")) + "</p>" +
        (it.hypothesis ? '<p class="id-hyp">' + amText(it.hypothesis) + "</p>" : "") +
        (window.DF ? '<div class="id-rch">' + DF.payoffSvg(it.payoff, c) + (it.payout ? "<p>" + amText(it.payout) + "</p>" : "") + "</div>" : "") +
        (rows.length ? '<dl class="id-pr">' + rows.map(function (r) { return "<div><dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>"; }).join("") + "</dl>" : "") +
        '<div class="am-rt">' + sec("Как заработать", it.how ? "<p>" + amText(it.how) + "</p>" : "") +
        sec("Риск", risk ? "<p>" + amText(risk) + "</p>" : "") +
        sec("Логика идеи", (it.situation ? "<p>" + amText(it.situation) + "</p>" : "") +
          (factors.length ? '<ul class="id-fs">' + factors.map(function (f) { return "<li>" + amText(f) + "</li>"; }).join("") + "</ul>" : "") +
          (it.conclusion ? "<p>" + amText(it.conclusion) + "</p>" : "")) + "</div>" +
        (it.fx && window.SITE && SITE.LEGAL && SITE.LEGAL.fx ? '<p class="id-fx">' + esc(SITE.LEGAL.fx) + "</p>" : "") +
        (prod ? '<a class="am-more id-prod" href="' + esc(prod) + '">Открыть продукт' + ARROW + "</a>"
          : amChips({ title: it.name, lead: [it.underlying, it.p && it.p.asset].join(" "), body: null }, "Продукты на этот актив")) +
        '<p class="am-link id-dg"><a href="digest.html#' + encodeURIComponent(o.cur.id) + "/" + encodeURIComponent(it.id) + '">Идея в дайджесте — PDF выпуска и ссылка для клиента</a></p>' +
        next + "</div></div>";
      el.scrollTop = 0;
    }
    // <<< id
    // >>> rt
    // ── Ставки (12.10.2026, Руслан: «теперь сделаем так же „Ставки“ в рынке») ──
    // Тот же приём, что у «Утра» и «Идей»: сроки вкладками и карточками вбок (лестница
    // страницы «Лучшие ставки»: любой день / до 3 / 3–6 / 6–12 месяцев), в карточке — лучшая
    // ставка крупно и ещё пара предложений; «Все предложения» открывает читалку со всем, что
    // есть на этот срок; последняя карточка — срок больше года, наши продукты (без процентов:
    // страница про чужие ставки, наши продукты ими не меряются). Сверху — ориентиры (ключевая,
    // RUONIA, RUSFAR) и сумма: доход считается в рублях, простыми процентами, как на странице.
    // Отбор в карточке — тот же, что на screener.html (лучшее каждого типа, одна организация —
    // один раз, промо — одно и последним): правишь там — сверь здесь
    var RT_SUMS = [[1e5, "100 тыс"], [5e5, "500 тыс"], [1e6, "1 млн"], [5e6, "5 млн"]];
    var RT_SUM = 1e6;
    try { var rts = +sessionStorage.getItem("so_rt_sum"); if (rts > 0) RT_SUM = rts; } catch (e) {}
    var RT_B = [
      { k: "Любой день", t: "Снять в любой день", test: function (p) { return p.days <= 1; } },
      { k: "До 3 мес", t: "До 3 месяцев", test: function (p) { return p.days > 1 && p.days <= 95; } },
      { k: "3–6 мес", t: "3–6 месяцев", test: function (p) { return p.days > 95 && p.days <= 185; } },
      { k: "6–12 мес", t: "6–12 месяцев", test: function (p) { return p.days > 185; } }
    ];
    var RT_TAG = { dep: "Вклад", sav: "Накопительный счёт", fund: "Фонд денежного рынка", ofz: "ОФЗ" };
    function rtMoney(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₽"; }
    var RTP = null;
    function rtPool() {
      if (RTP) return RTP;
      var R = window.RATES || {}, rows = [];
      (R.deposits || []).forEach(function (d) {
        var cond = [];
        if (d.minAmount >= 1000) cond.push("от " + rtMoney(d.minAmount));
        if (d.refill) cond.push("пополняемый");
        if (d.capitalization) cond.push("капитализация");
        if (d.feature && !(d.floating && /ключев/i.test(d.feature))) cond.push(d.feature);
        rows.push({ kind: d.kind === "saving" ? "sav" : "dep", prod: d.name, org: d.bank, cond: cond, rate: d.rate,
          days: d.termMonths > 0 ? Math.round(d.termMonths * 30.44) : 1, term: d.termMonths > 0 ? d.termMonths + " мес" : "",
          promo: !!d.promo, floating: !!d.floating, url: d.url });
      });
      (R.funds || []).forEach(function (f) {
        rows.push({ kind: "fund", prod: f.name, cond: ["БПИФ " + f.id, "продать можно в любой день"], rate: f.rate, days: 1, term: "",
          url: "https://www.moex.com/ru/issue.aspx?code=" + f.id });
      });
      (R.ofz || []).forEach(function (o) {
        rows.push({ kind: "ofz", prod: o.name, cond: ["доходность к погашению"], rate: o.rate, days: Math.round(o.years * 365),
          term: o.years < 1 ? Math.round(o.years * 12) + " мес" : fq(o.years) + " г.", url: "https://www.moex.com/ru/issue.aspx?code=" + o.id });
      });
      RTP = rows.filter(function (p) { return p.days <= 370 && isFinite(p.rate); });
      return RTP;
    }
    function rtList(b) { return rtPool().filter(b.test).sort(function (x, y) { return y.rate - x.rate; }); }
    function rtPick(list) {
      var plain = list.filter(function (p) { return !p.promo; }), picked = [], seen = {};
      function take(p) { if (!p || picked.length >= 4) return; var o = p.org || p.prod; if (seen[o]) return; seen[o] = 1; picked.push(p); }
      ["sav", "dep", "fund", "ofz"].forEach(function (k) { take(plain.filter(function (p) { return p.kind === k; })[0]); });
      plain.forEach(take);
      return picked.sort(function (x, y) { return y.rate - x.rate; });
    }
    // Доход за срок вклада, у «любого дня» — за месяц. Простые проценты, без налога
    function rtInc(p) { return RT_SUM * p.rate / 100 * (p.days <= 1 ? 30 : p.days) / 365; }
    function rtPer(p) { return p.days <= 1 ? "за месяц" : "за " + (p.term || Math.round(p.days / 30.44) + " мес"); }
    function rtFlags(p) { return (p.promo ? '<span class="rt-fl">★ промо</span>' : "") + (p.floating ? '<span class="rt-fl rt-fv">плав.</span>' : ""); }
    function rtSumTxt() { for (var i = 0; i < RT_SUMS.length; i++) if (RT_SUMS[i][0] === RT_SUM) return RT_SUMS[i][1]; return rtMoney(RT_SUM); }
    function rtTabs() {
      [].forEach.call(document.querySelectorAll(".rt-tabs [data-rtto]"), function (b) {
        var on = +b.getAttribute("data-rtto") === CAR.rt;
        b.setAttribute("aria-selected", on);
        if (on && b.parentNode.scrollTo) b.parentNode.scrollTo({ left: Math.max(0, b.offsetLeft - 40), behavior: "smooth" });
      });
    }
    function carTo(k, i) {
      var car = document.querySelector('[data-car="' + k + '"]'); if (!car) return;
      CAR[k] = i;
      if (k === "am") amTabs(); else if (k === "rt") rtTabs();
      var x = i * carStep(car);
      if (car.scrollTo) car.scrollTo({ left: x, behavior: "smooth" }); else car.scrollLeft = x;
    }
    function rtDone() {
      var b = S.cur === "mkt" && S.mkt.seg === "rates" && document.getElementById("tg-mbody");
      if (b) b.innerHTML = mktBody();
      if (RD) rdRender();
    }
    function rtOur() {
      var G = [["discount", "Дисконтные облигации", "Цена входа ниже номинала, на погашении — 100%", ["выпуск", "выпуска", "выпусков"]],
        ["protection", "Защита капитала", "Возврат номинала плюс участие в росте актива", ["продукт", "продукта", "продуктов"]],
        ["warrant", "Варранты", "Ставка на рост, риск ограничен уплаченной премией", ["инструмент", "инструмента", "инструментов"]]];
      return G.map(function (g) {
        var n = INSTR.filter(function (r) { return r.type === g[0]; }).length;
        return n ? '<a class="rt-our" href="board.html?type=' + g[0] + '" data-pt="' + g[0] + '"><span><b>' + esc(g[1]) + "</b></span><em>" + n + " " + plural(n, g[3][0], g[3][1], g[3][2]) + "</em></a>" : "";
      }).join("");
    }
    function rtBody() {
      var R = window.RATES, c = (R && R.cbr) || {};
      if (!R) return '<p class="tg-note">Не удалось загрузить ставки — обновите страницу.</p>';
      var pool = rtPool();
      if (!pool.length) return '<p class="tg-note">Ставки ещё обновляются — загляните чуть позже.</p>';
      var on = (R.rusfar || []).filter(function (x) { return x.days === 1; })[0];
      var key = SV && SV.top && SV.top.key, nxt = key && key.next ? dmy(key.next).slice(0, 5) : "";
      var upd = String(R.updated || "").replace(/^(\d{4})-(\d{2})-(\d{2})/, "$3.$2");
      var out = '<div class="am">';
      out += '<p class="am-day">Ставки на срок до года<span> · обновлено ' + esc(upd) + "</span></p>";
      out += '<div class="rt-marks">' +
        (c.key ? "<div><b>" + fq(c.key.rate) + "%</b><span>ключевая" + (nxt ? " · заседание " + esc(nxt) : "") + "</span></div>" : "") +
        (c.ruonia ? "<div><b>" + fq(c.ruonia.rate) + "%</b><span>RUONIA</span></div>" : "") +
        (on ? "<div><b>" + fq(on.rate) + "%</b><span>RUSFAR овернайт</span></div>" : "") + "</div>";
      out += '<div class="rt-sum" role="group" aria-label="Сумма для расчёта дохода"><span>Сумма</span>' + RT_SUMS.map(function (s) {
        return '<button type="button" data-rtsum="' + s[0] + '" aria-pressed="' + (s[0] === RT_SUM) + '">' + s[1] + "</button>";
      }).join("") + "</div>";
      var n = RT_B.length + 1;
      if (CAR.rt >= n) CAR.rt = 0;
      out += '<div class="am-tabs rt-tabs" role="tablist" aria-label="Срок">' + RT_B.map(function (b, i) { return [b.k, i]; }).concat([["1–5 лет", RT_B.length]]).map(function (x) {
        return '<button type="button" role="tab" data-rtto="' + x[1] + '" aria-selected="' + (x[1] === CAR.rt) + '" aria-controls="rt-c' + x[1] + '">' + x[0] + "</button>";
      }).join("") + "</div>";
      out += '<div class="am-car rt-car" id="rt-car" data-car="rt">' + RT_B.map(function (b, i) {
        var list = rtList(b), pick = rtPick(list), best = pick[0];
        if (!best) return '<article class="am-cd rt-cd" id="rt-c' + i + '"><div class="am-cdt"><span class="am-rb">' + esc(b.t) + '</span><span class="am-k">' + (i + 1) + " / " + n + '</span></div><p class="am-wait">Предложений на этот срок сейчас нет.</p></article>';
        return '<article class="am-cd rt-cd" id="rt-c' + i + '" role="tabpanel" aria-label="' + esc(b.t) + '">' +
          '<div class="am-cdt"><span class="am-rb">' + esc(b.t) + '</span><span class="am-k">' + (i + 1) + " / " + n + "</span></div>" +
          '<a class="rt-best" href="' + esc(best.url) + '" target="_blank" rel="noopener"><b>' + fq(best.rate) + "%</b>" + rtFlags(best) +
          "<span><strong>" + esc(best.prod) + "</strong>" + (best.org ? " · " + esc(best.org) : "") + "</span>" +
          '<em class="rt-inc">' + esc(rtSumTxt()) + " → <b>+" + rtMoney(rtInc(best)) + "</b> " + rtPer(best) + "</em></a>" +
          '<ul class="rt-mini">' + pick.slice(1, 3).map(function (p) {
            return '<li><a href="' + esc(p.url) + '" target="_blank" rel="noopener"><b>' + fq(p.rate) + "%</b><span>" + esc(p.prod) + (p.org ? " · " + esc(p.org) : "") + "</span></a></li>";
          }).join("") + "</ul>" +
          '<div class="am-ft"><button type="button" class="am-more" data-rtrd="' + i + '">Все предложения<small>' + list.length + "</small>" + ARROW + "</button></div></article>";
      }).join("") +
        '<article class="am-cd rt-cd rt-ourcd" id="rt-c' + RT_B.length + '" role="tabpanel" aria-label="Срок больше года">' +
        '<div class="am-cdt"><span class="am-rb">Срок больше года</span><span class="am-k">' + n + " / " + n + "</span></div>" +
        '<h2 class="am-h">Наши продукты на 1–5 лет</h2><p class="id-sub">Ставок здесь нет: результат зависит от актива и формулы выплаты</p>' + rtOur() +
        '<div class="am-ft"><a class="am-more" href="board.html" data-go="prod">Все продукты<small>' + INSTR.length + "</small>" + ARROW + "</a></div></article></div>";
      out += '<p class="tg-note">Простые проценты годовых, без капитализации и налогов. ★ — промо-ставка при условиях банка, «плав.» — привязана к ключевой. Источники: ЦБ, Мосбиржа, Финуслуги.</p>';
      out += '<a class="tg-more" href="screener.html">Лестница сроков целиком</a>';
      if (window.requestAnimationFrame) requestAnimationFrame(function () { carPlace(); rtTabs(); });
      return out + "</div>";
    }
    // Читалка срока: все предложения, доход на выбранную сумму
    function rtRd(el) {
      var n = RT_B.length, i = Math.min(RD.i, n - 1); RD.i = i;
      var b = RT_B[i], list = rtList(b), plain = list.filter(function (p) { return !p.promo; }), promo = list.filter(function (p) { return p.promo; });
      var bar = RT_B.map(function (x, j) { return "<i" + (j <= i ? ' class="on"' : "") + "></i>"; }).join("");
      function row(p, j) {
        return '<a class="rt-row' + (j === 0 && !p.promo ? " rt-top" : "") + '" href="' + esc(p.url) + '" target="_blank" rel="noopener">' +
          '<span class="rt-r1"><b>' + fq(p.rate) + "%</b>" + rtFlags(p) + '<em>+' + rtMoney(rtInc(p)) + " " + rtPer(p) + "</em></span>" +
          '<span class="rt-r2"><strong>' + esc(p.prod) + "</strong>" + (p.org ? " · " + esc(p.org) : "") + "</span>" +
          '<span class="rt-r3">' + esc([RT_TAG[p.kind] + (p.term ? " · " + p.term : "")].concat(p.cond || []).join(" · ")) + "</span></a>";
      }
      var nx = RT_B[i + 1];
      var next = nx ? '<button type="button" class="am-nx" data-rd="next"><small>Дальше</small><b>' + esc(nx.t) + "</b>" + ARROW + "</button>"
        : '<button type="button" class="am-nx am-nx-end" data-rd="our"><b>Срок больше года — наши продукты</b>' + ARROW + "</button>";
      el.innerHTML = '<div class="tg-qz-in"><div class="tg-qz-top"><button type="button" class="tg-qz-b" data-rd="close" aria-label="Закрыть">' +
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
        '<span class="tg-qz-n">Ставки · ' + (i + 1) + " из " + n + "</span>" +
        (i > 0 ? '<button type="button" class="am-pv" data-rd="prev">' + CHEV_L + "<span>" + esc(RT_B[i - 1].k) + "</span></button>" : "") + "</div>" +
        '<div class="tg-qz-bar" aria-hidden="true">' + bar + "</div>" +
        '<div class="tg-qz-body am-rdb"><h2 class="am-rh">' + esc(b.t) + "</h2>" +
        '<p class="id-rsub">' + list.length + " " + plural(list.length, "предложение", "предложения", "предложений") + " · доход на " + esc(rtSumTxt()) + " ₽ — простыми процентами, без налога</p>" +
        '<div class="rt-sum rt-sum-rd" role="group" aria-label="Сумма для расчёта дохода"><span>Сумма</span>' + RT_SUMS.map(function (s) {
          return '<button type="button" data-rd="sum:' + s[0] + '" aria-pressed="' + (s[0] === RT_SUM) + '">' + s[1] + "</button>";
        }).join("") + "</div>" +
        '<div class="rt-rows">' + plain.map(row).join("") + "</div>" +
        (promo.length ? '<h3 class="id-k">Промо-ставки</h3><p class="rt-pn">Действуют при условиях банка: новые деньги, подписка, ограниченный период.</p><div class="rt-rows">' + promo.map(row).join("") + "</div>" : "") +
        '<p class="rt-pn">Вклады и счета открываются на Финуслугах по ссылке, фонды и ОФЗ покупаются у брокера. Ставки не гарантированы и могут измениться.</p>' +
        next + "</div></div>";
      el.scrollTop = 0;
    }
    // <<< rt
    function mktBody() {
      var body = "";
      if (S.mkt.seg === "sum") body = svBody();
      else if (S.mkt.seg === "morning") body = amBody();
      else if (S.mkt.seg === "rates") body = rtBody();
      else body = idBody();
      return body;
    }
    function viewMkt() {
      return frame("Рынок", seg("mkt", "Раздел рынка", [["sum", "Сводка"], ["morning", "Утро"], ["rates", "Ставки"], ["ideas", "Идеи"]])) +
        '<div class="tg-pad" id="tg-mbody">' + mktBody() + "</div>";
    }

    // Выпуски: строка поиска над переключателем. С набранным запросом ищем сразу в обоих
    // списках (ISIN приходит без пометки «на размещении» или «уже выпущен»), а переключатель
    // и подпись под заголовком прячем: к выдаче они не относятся
    var lastIss = -1;
    function issBody() {
      var q = (S.iss.q || "").trim();
      if (q) {
        lastIss = -1;
        if (low(q).length < 2) return '<p class="tg-note">Наберите хотя бы два знака: ISIN, серию выпуска или актив.</p>';
        var f = issFind(q, true), out = issGroups(f);
        lastIss = f.n;
        if (f.pl.length) out += '<p class="tg-note">' + (anyBid() ? "Bid индикативный. " : "") + "Документы КУВ и КИД — в карточке выпуска.</p>";
        if (!plReady()) out += LAZY.pl === 2 ? '<p class="tg-note">Не удалось загрузить размещённые выпуски — обновите страницу.</p>' : '<p class="tg-wait">Ищу среди размещённых выпусков…</p>';
        return out || '<p class="tg-note">Ничего не нашлось. ISIN — 12 знаков, начинается с RU. Ещё можно искать по серии («СП-2-90») или активу («ОФЗ 26238», «золото»).</p>';
      }
      if (S.iss.seg === "live") {
        var O = liveOffers(), body = O.length ? "" : '<p class="tg-note">Сейчас открытых размещений нет.</p>';
        // Обложка — та же картинка, что у героя страницы выпуска (Dribbble: Travel от Ronas IT и
        // Furniture от Nixtio — крупные карточки с изображением). У ролика кадр вертикальный —
        // кадрируем выше середины, где спутник
        O.forEach(function (o) {
          var hp = o.hero && o.hero.poster;
          var cov = hp ? '<span class="tg-cov"><img src="' + esc(hp) + '" alt="" loading="lazy" decoding="async"' + (o.hero.wide ? "" : ' style="object-position:50% 34%"') + "></span>" : "";
          body += '<a class="tg-card tg-off' + (cov ? " tg-hasc" : "") + '" href="offerings.html#' + esc(o.id) + '">' + cov + '<span class="tg-stat">' + esc(o.statusLabel || "") + "</span><h2><span>" + esc(o.name) + "</span>" + CHEV + "</h2>" + (o.isin ? '<p class="tg-isin">ISIN ' + esc(o.isin) + "</p>" : "") + "<p>" + esc(o.lead || o.kind || "") + "</p>" +
            '<div class="tg-nums">' + (o.price != null ? "<div><b>" + fq(o.price) + "%</b><span>цена</span></div>" : "") + (o.tenor ? "<div><b>" + esc(o.tenor) + "</b><span>срок</span></div>" : "") + (o.nominal ? "<div><b>" + Number(o.nominal).toLocaleString("ru-RU") + " ₽</b><span>номинал</span></div>" : "") + "</div>" +
            lifeBar(o) + "</a>";
        });
        return body;
      }
      if (!plReady()) return LAZY.pl === 2 ? '<p class="tg-note">Не удалось загрузить выпуски. Обновите страницу.</p>' : '<p class="tg-wait">Загружаю выпуски…</p>';
      var P = (PLACEMENTS_DATA.issues || []).slice().sort(function (a, b) { return a.issueStart < b.issueStart ? 1 : -1; });
      return '<ul class="tg-list">' + P.map(plRow).join("") + '</ul><p class="tg-note">' + (anyBid() ? "Bid индикативный. " : "Полоса под строкой — прошедшая часть срока. ") + "Документы КУВ и КИД — в карточке выпуска.</p>";
    }
    function viewIss() {
      // Размещённые грузим сразу при открытии вкладки, а не по второму переключателю: поиск
      // ищет в обоих списках, и файл должен быть на месте к первому набранному знаку
      need("pl", ["data/placements.js"], plReady, issRefresh);
      var on = !!(S.iss.q || "").trim();
      var sub = S.iss.seg === "live"
        ? "Уже на Мосбирже: покупка у вашего брокера по ISIN."
        : anyBid() ? "Выпущенные облигации: индикативный Bid и документы — в карточке."
        : "Выпущенные облигации: срок до погашения, документы — в карточке.";
      var ctl = '<label class="tg-srch">' + svg("search", 18) + '<input id="tg-iq" type="search" placeholder="ISIN, серия или актив…" value="' + esc(S.iss.q || "") + '" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Поиск выпусков: ISIN, серия или актив"></label>' +
        '<div id="tg-isg"' + (on ? " hidden" : "") + ">" + seg("iss", "Какие выпуски", [["live", "На размещении"], ["done", "Размещённые"]]) + "</div>";
      return frame("Выпуски", ctl, '<p class="tg-sub" id="tg-isub"' + (on ? " hidden" : "") + ">" + sub + "</p>") + '<div class="tg-pad" id="tg-ilist">' + issBody() + "</div>";
    }
    // Размещённые доехали — обновляем только списки, поля поиска не трогаем
    function issRefresh() {
      var il = document.getElementById("tg-ilist"), pl = document.getElementById("tg-plist");
      if (il) il.innerHTML = issBody();
      if (pl && S.prod.q.trim()) pl.innerHTML = prodList();
    }

    // Группа строк-ссылок как в настройках iOS: [адрес, заголовок, иконка, цвет, подпись?, вкладка?, картинка?]
    // Картинка вместо иконки (it[6]) — поддерживается, но на вводной не используется: среди
    // одинаковых оранжевых знаков тёмная миниатюра обложки читалась пятном (09.10.2026)
    function g(items) {
      return '<div class="tg-grp">' + items.map(function (it) {
        var ext = /^https?:/.test(it[0]) ? ' target="_blank" rel="noopener"' : "";
        var go = it[5] ? ' data-go="' + it[5] + '"' : "";
        var tt = it[4] ? '<span class="tg-t2"><b>' + esc(it[1]) + "</b><small>" + esc(it[4]) + "</small></span>" : "<span>" + esc(it[1]) + "</span>";
        var ic = it[6] ? '<span class="tg-ic tg-ici" aria-hidden="true"><img src="' + esc(it[6]) + '" alt="" loading="lazy" decoding="async"></span>'
          : '<span class="tg-ic" aria-hidden="true">' + svg(it[2], 18) + "</span>";
        return '<a href="' + it[0] + '"' + ext + go + ">" + ic + '<span class="tg-tt">' + tt + CHEV + "</span></a>";
      }).join("") + "</div>";
    }
    var NOTE = '<p class="tg-note">Для квалифицированных инвесторов. Не является индивидуальной инвестиционной рекомендацией.</p>';

    // ── Вводная: кто мы → в продукты одной кнопкой → остальные разделы строками ──
    // Текст — тот же, что стоял первым экраном главной до вкладок (решение 28.09.2026)
    // Заголовок в два тона (Dribbble: Furniture от Nixtio — ключевые слова яркие, связки тише):
    // кто мы и что делаем — ярко, для кого — приглушённо. Текст прежний, слово в слово.
    // Та же разметка стоит в каркасе index.html — первая отрисовка берёт заголовок оттуда
    var H1 = 'Rumberg выпускает структурные облигации <span class="tg-h1b">для квалифицированных инвесторов.</span>';
    // Вход в подбор (Dribbble: VibeMove — «Не знаете, что выбрать?» на главной). Тоже стоит в каркасе
    var PICK = '<button type="button" class="tg-pick" data-quiz><span class="tg-pick-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h9M18 7h1M5 17h3M12 17h7"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></span>' +
      '<span class="tg-pick-t"><b>Не знаете, что выбрать?</b><small>Подберём продукты за 3 вопроса</small></span>' + CHEV + "</button>";
    var LEAD = "Формула выплаты известна до сделки\u00a0— её можно посчитать на\u00a0своей сумме заранее.";
    function daysAgo(iso) { var a = Date.parse(String(iso || "").slice(0, 10)), b = Date.parse(TODAY); return isFinite(a) ? Math.round((b - a) / 864e5) : 99; }
    function viewHome() {
      var M = window.MORNING || {}, fresh = daysAgo(M.date) <= 3;
      var live = ((window.OFFERINGS || {}).items || []).filter(function (o) { return o.status === "live" || o.status === "upcoming"; });
      var rows = [
        ["index.html#mkt", "Рынок", "pulse", "#3D6FD8", mktSub(), "mkt"],
        live.length ? ["index.html#iss", "На размещении", "rocket", "#3FA67A", live[0].name + (live.length > 1 ? " и ещё " + (live.length - 1) : ""), "iss"]
                    : ["index.html#iss", "Выпуски", "rocket", "#3FA67A", "Размещённые выпуски и их документы", "iss"],
        ["index.html#ai", "AI-ассистент", "star", "#8E7CC3", "Объяснит продукт, посчитает цену опциона", "ai"],
        ["about.html", "Библиотека", "book", "#E07B3A", "Как устроены структурные продукты"]
      ];
      // Пункты прежней вкладки «Ещё» (Библиотека и Сотрудничество уже выше)
      var more = g([["guide.html", "Как пользоваться", "help", "#5A6070"], ["company.html", "О компании", "bld", "#5A6070"]]) +
        g([["me.html", "Кабинет партнёра", "user", "#3D6FD8"], ["https://t.me/+NHbVOoUI5IBkN2Uy", "Telegram-группа", "tg", "#2AABEE"]]);
      return navRow("") +
        '<div class="tg-hero"><div class="tg-stories" id="tg-stories"></div><h1>' + H1 + '</h1><p class="tg-lead">' + esc(LEAD) + "</p>" +
        '<a class="tg-cta" href="board.html" data-go="prod">Смотреть продукты<span class="n" id="tg-n">' + (INSTR.length ? " · " + INSTR.length : "") + "</span>" + ARROW + "</a>" + PICK +
        '<a class="tg-co" href="partners.html"><span class="t">Сотрудничество' + ARROW + '</span><span class="s">для финансовых институтов и агентов</span></a></div>' +
        '<div class="tg-pad"><h2 class="tg-cap">С чего начать</h2>' + g(rows) + more + NOTE + "</div>";
    }

    var VIEWS = { home: viewHome, prod: viewProd, mkt: viewMkt, iss: viewIss };
    // AI — в центре панели оранжевой плиткой (Dribbble: Food Tracking от Nixtio — главное
    // AI-действие в центре нижней панели; VibeMove — активная вкладка залитой плиткой).
    // Ассистент был четвёртой из пяти равных вкладок, а его просили сделать заметнее (05.10.2026)
    var TABS = [["home", "Главная", "home"], ["prod", "Продукты", "grid"], ["ai", "AI", "star"], ["mkt", "Рынок", "pulse"], ["iss", "Выпуски", "rocket"]];

    var aiOn = false;

    function tabs() {
      nav.innerHTML = TABS.map(function (t) {
        var on = aiOn ? t[0] === "ai" : t[0] === S.cur;
        var ic = t[0] === "ai" ? '<span class="tg-aic">' + STAR_FILL + "</span>" : svg(t[2], 25);
        return '<button type="button" data-t="' + t[0] + '"' + (on ? ' aria-current="page"' : "") + ">" + ic + "<span>" + t[1] + "</span></button>";
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
      var iq = document.getElementById("tg-iq");
      if (iq) iq.addEventListener("input", function () {
        S.iss.q = iq.value; save();
        var on = !!iq.value.trim();
        document.getElementById("tg-isg").hidden = on;
        document.getElementById("tg-isub").hidden = on;
        document.getElementById("tg-ilist").innerHTML = issBody();
        document.getElementById("tg-live").textContent = !on ? "" : lastIss > 0 ? "Найдено: " + lastIss : lastIss === 0 ? "Ничего не нашлось" : "";
      });
      // «Найти» на клавиатуре телефона прячет клавиатуру: иначе выдачу закрывает она сама
      [q, iq].forEach(function (el) {
        if (el) el.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
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
      if (QZ && !(st && st.qz)) closeQuiz(true);           // «назад» из опроса — закрыть опрос
      if (RD && !(st && st.rd)) closeRd(true);             // «назад» из читалки разбора — закрыть её
      if (!st || !st.tg || !VIEWS[st.tg]) return;          // чужие записи (истории stories.js) — не наши
      if (!st.ai && aiOn && window.Chat && Chat.close) { aiOn = false; Chat.close(); tabs(); }
      if (st.ai && !aiOn && window.Chat && Chat.open) { aiOn = true; Chat.open(); tabs(); }
      H.d = st.d || 0; H.from = st.from || null;
      if (st.tg !== S.cur) { save(); S.cur = st.tg; render(false, S.y[st.tg] || 0, true); tabs(); save(); }
    });
    app.addEventListener("click", function (e) {
      if (e.target.closest("[data-tgback]")) { back(); return; }
      if (e.target.closest("[data-quiz]")) { e.preventDefault(); openQuiz(); return; }
      var shr = e.target.closest("[data-svshare]");
      if (shr) { e.preventDefault(); openCard(shr); return; }
      // Утро: тема (вкладка), читалка разбора, день обзора, «почему эти продукты»
      var amt = e.target.closest("[data-amto]");
      if (amt) { amTo(+amt.getAttribute("data-amto")); return; }
      var amr = e.target.closest("[data-amrd]");
      if (amr) { openRd("am", +amr.getAttribute("data-amrd")); return; }
      var idr = e.target.closest("[data-idrd]");
      if (idr) { openRd("id", +idr.getAttribute("data-idrd")); return; }
      var idd = e.target.closest("[data-idday]");
      if (idd) { ID_DAY = idd.getAttribute("data-idday") || null; CAR.id = 0; idDone(); return; }
      var idf = e.target.closest("[data-idfam]");
      if (idf) { ID_FAM = idf.getAttribute("data-idfam"); CAR.id = 0; idDone(); return; }
      // Ставки: срок (вкладка), читалка срока, сумма; продукты по типу — из карточки «больше года»
      var rtt = e.target.closest("[data-rtto]");
      if (rtt) { carTo("rt", +rtt.getAttribute("data-rtto")); return; }
      var rtr = e.target.closest("[data-rtrd]");
      if (rtr) { openRd("rt", +rtr.getAttribute("data-rtrd")); return; }
      var rtm = e.target.closest("[data-rtsum]");
      if (rtm) { RT_SUM = +rtm.getAttribute("data-rtsum"); try { sessionStorage.setItem("so_rt_sum", RT_SUM); } catch (er) {} rtDone(); return; }
      var ptp = e.target.closest("[data-pt]");
      if (ptp) { e.preventDefault(); S.prod.type = ptp.getAttribute("data-pt"); S.prod.cls = "all"; S.prod.q = ""; S.prod.pick = null; S.y.prod = 0; go("prod"); return; }
      var amd = e.target.closest("[data-amday]");
      if (amd) { AM_DAY = amd.getAttribute("data-amday") || null; CAR.am = 0; amDone(); return; }
      var amw = e.target.closest("[data-amwhy]");
      if (amw) { amWhy(amw); return; }
      if (e.target.closest("[data-unpick]")) { e.preventDefault(); S.prod.pick = null; render(true); save(); return; }
      // Продукты на бумагу из сводки: открываем «Продукты» с поиском по ней
      var pq = e.target.closest("[data-pq]");
      if (pq) { e.preventDefault(); S.prod.q = pq.getAttribute("data-pq"); S.prod.cls = pq.getAttribute("data-pc") || "Акции РФ"; S.prod.type = "all"; S.prod.pick = null; S.y.prod = 0; go("prod"); return; }
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
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && QZ) closeQuiz(false); if (e.key === "Escape" && RD) closeRd(false); });

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
    // Сводка (~3 КБ) — после первой отрисовки: на вводной она дописывает настроение в строку «Рынок»
    idle(function () { needSv(svDone); });
  }
})();
