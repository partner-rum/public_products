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
    function needSv(done) {
      if (SVST === 3) return true;
      if (!SVST && window.fetch) {
        SVST = 1;
        fetch("live/svodka.json", { cache: "no-cache" })
          .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
          .then(function (d) { SV = d; SVST = 3; }, function () { SVST = 2; })
          .then(function () { if (done) done(); });
      }
      if (!window.fetch) SVST = 2;
      return false;
    }
    // Файл доехал: перерисовываем только тело раздела и подпись строки «Рынок» на вводной
    function svDone() {
      var b = S.cur === "mkt" && S.mkt.seg === "sum" && document.getElementById("tg-mbody");
      if (b) b.innerHTML = mktBody();
      var sub = S.cur === "home" && app.querySelector('a[data-go="mkt"] small');
      if (sub) sub.textContent = mktSub();
    }
    function svAge() { var t = Date.parse((SV || {}).updated || ""); return isFinite(t) ? (Date.now() - t) / 36e5 : Infinity; }
    function mktSub() {
      var M = window.MORNING || {}, fresh = daysAgo(M.date) <= 3;
      var mood = SV && SV.mood && SV.mood.label && svAge() < 72 ? "Настроение: " + SV.mood.label.toLowerCase() + " · " : "";
      return mood + (mood ? "обзор утра" : "Обзор утра") + (fresh ? " " + dmy(M.date).slice(0, 5) : "") + ", ставки, идеи";
    }
    // Время по Москве из строки ISO: сегодня — «09:50», вчера — «вчера 22:56», раньше — «07.10 18:25»
    function when(iso) {
      var s = String(iso || ""), dd = s.slice(0, 10), hm = s.slice(11, 16);
      if (dd === TODAY) return hm;
      var y = new Date(Date.parse(TODAY) - 864e5).toISOString().slice(0, 10);
      return (dd === y ? "вчера " : dmy(dd).slice(0, 5) + " ") + hm;
    }
    function grp(v, d) { return Number(v).toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d }); }
    function pct(v) { var n = Number(v); return isFinite(n) ? (n > 0 ? "+" : n < 0 ? "−" : "") + fq(Math.abs(n)) + "%" : ""; }
    function moodC(v, bar) { return v < 40 ? "#E0705A" : v < 60 ? (bar ? "rgba(242,243,247,.5)" : "#F2F3F7") : "#55C08A"; }
    // «12.10.2026» → «12.10» и → «2026-10-12»
    function ddm(s) { return String(s || "").slice(0, 5); }
    function isoOf(s) { var m = String(s || "").match(/^(\d{2})\.(\d{2})\.(\d{4})$/); return m ? m[3] + "-" + m[2] + "-" + m[1] : ""; }

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
    function prodLink(x, cls) {
      return '<a class="' + cls + '" href="board.html?q=' + encodeURIComponent(x.name) + '" data-pq="' + esc(x.name) + '">Продукты на ' + esc(x.name) + " · " + x.n + ARROW + "</a>";
    }

    function svBody() {
      if (!needSv(svDone)) {
        return SVST === 2 ? '<p class="tg-note">Сводка сейчас недоступна. Обзор утра и ставки — в соседних разделах.</p>'
          : '<p class="tg-wait">Загружаю сводку…</p>';
      }
      var d = SV || {}, age = svAge(), out = "";
      if (!(age < 72)) return '<p class="tg-note">Сводка временно не обновляется. Обзор утра и ставки — в соседних разделах.</p>';
      out += '<p class="tg-meta' + (age > 6 ? " tg-old" : "") + '">' + (age > 6 ? "Данные от " : "Обновлено ") + esc(when(d.updated)) + "</p>";

      // Настроение: число, слово, шкала; из чего сложилось — по тапу
      var m = d.mood;
      if (m && isFinite(m.score)) {
        var c = moodC(m.score), sc = Math.max(0, Math.min(100, m.score));
        out += '<div class="tg-card tg-mood"><span class="tg-rb">Настроение рынка</span>' +
          '<div class="tg-mv"><b style="color:' + c + '">' + sc + '</b><small>из 100</small><em style="color:' + c + '">' + esc(m.label) + "</em></div>" +
          '<div class="tg-scale" aria-hidden="true"><i style="left:' + sc + '%"></i></div>' +
          '<div class="tg-scl" aria-hidden="true"><span>страх</span><span>жадность</span></div>' +
          '<details class="tg-parts"><summary>Из чего складывается</summary>' + (m.parts || []).map(function (p) {
            var v = Math.max(0, Math.min(100, Number(p.v) || 0));
            return '<div class="tg-part"><span class="k">' + esc(p.k) + '</span><span class="bar" aria-hidden="true"><i style="width:' + v + "%;background:" + moodC(v, 1) + '"></i></span><b>' + v + "</b><small>" + esc(p.d) + "</small></div>";
          }).join("") + "<p>Сводный индекс из пяти частей, пересчитывается автоматически. Это не прогноз и не рекомендация.</p></details></div>";
      }

      // Три цифры дня
      var t = d.top || {}, tl = [];
      function tile(v, k, sub, dir) {
        var cl = dir > 0 ? " up" : dir < 0 ? " dn" : "";
        return '<div class="tg-tile"><b>' + v + "</b><span>" + k + '</span><span class="tg-ch' + cl + '">' + sub + "</span></div>";
      }
      if (t.imoex && t.imoex.v) tl.push(tile(grp(t.imoex.v, 0), "IMOEX", pct(t.imoex.d) + " за день", Number(t.imoex.d)));
      if (t.usd && t.usd.v) tl.push(tile(grp(t.usd.v, 2) + " ₽", "доллар", pct(t.usd.d) + " за день", 0));
      if (t.key && t.key.rate) tl.push(tile(fq(t.key.rate) + "%", "ключевая", t.key.next ? "заседание " + dmy(t.key.next).slice(0, 5) : "", 0));
      if (tl.length) out += '<div class="tg-tiles tg-t3">' + tl.join("") + "</div>";

      // Мировые индексы (слово Руслана 09.10.2026). Дата — день торгов в Нью-Йорке: пока он
      // совпадает с московским «сегодня», пишем «за день», иначе — дату закрытия
      var w = d.world || {}, wl = [];
      (w.idx || []).forEach(function (x) {
        if (!x || !x.v) return;
        var dd = String(x.date || "");
        wl.push(tile(grp(x.v, 0), esc(x.k), pct(x.d) + (dd === TODAY ? " за день" : dd ? " · " + dmy(dd).slice(0, 5) : ""), Number(x.d)));
      });
      if (wl.length) out += '<div class="tg-tiles tg-t2">' + wl.join("") + "</div>";

      // Карточка дня: картинка со сводкой и ссылка с меткой — сейлзу отправить клиенту
      out += '<button type="button" class="tg-shr" data-svshare><span class="ic">' + svg("share", 20) + '</span><span class="tx"><b>Поделиться сводкой</b>' +
        "<small>Картинка и ссылка для клиента</small></span>" + CHEV + "</button>";

      // Главное за сутки: время и заголовок. Ни ссылок на посты, ни названий каналов — решение Руслана 09.10.2026.
      // Названа бумага, на которую у нас есть продукты, — под новостью переход к ним
      var news = (d.news || []).filter(function (n) { return n.t; });
      if (news.length) out += '<h2 class="tg-cap">Главное за сутки</h2><ul class="tg-list tg-news">' + news.map(function (n) {
        var seen = {}, links = (n.tickers || []).map(function (k) { return tkMap()[k]; })
          .filter(function (x) { if (!x || !x.n || seen[x.name]) return false; seen[x.name] = 1; return true; })
          .slice(0, 2).map(function (x) { return prodLink(x, "tg-np"); }).join("");
        return '<li><div class="tg-nw"><span class="m">' + esc(when(n.time)) +
          '</span><span class="t">' + esc(n.t) + "</span></div>" + (links ? '<div class="tg-nps">' + links + "</div>" : "") + "</li>";
      }).join("") + "</ul>";

      // Заголовки мировых деловых СМИ по-английски, пересказанные своими словами. Сборщик молчит
      // больше суток — список не показываем: вчерашние «главные» новости хуже пустого места
      var wAge = (Date.now() - Date.parse(w.updated || "")) / 36e5;
      var wn = wAge < 24 ? (w.news || []).filter(function (n) { return n.t; }) : [];
      if (wn.length) out += '<h2 class="tg-cap">Global headlines</h2><ul class="tg-list tg-news">' + wn.map(function (n) {
        return '<li><div class="tg-nw"><span class="m">' + esc(when(n.time)) + '</span><span class="t" lang="en">' + esc(n.t) + "</span></div></li>";
      }).join("") + "</ul>";

      // Ближайшие дивиденды: факт из календаря отсечек, без оценок
      var divs = d.divs || [];
      if (divs.length) out += '<h2 class="tg-cap">Ближайшие дивиденды</h2><ul class="tg-list">' + divs.map(function (v) {
        var x = tkMap()[v.t], buy = isoOf(v.buy);
        var sub = "Отсечка " + ddm(v.cut) + ", последний день покупки — " + (buy === TODAY ? "сегодня" : ddm(v.buy));
        var inner = '<span class="tg-tx"><span class="tg-nm">' + esc(v.n) + '</span><span class="tg-sb">' + esc(sub) + "</span>" +
          (x && x.n ? '<span class="tg-dp">Продукты на ' + esc(x.name) + " · " + x.n + "</span>" : "") + "</span>" +
          '<span class="tg-fig"><b>' + grp(v.d, 2) + " ₽</b><small>" + (v.y != null ? fq(v.y) + "% к цене" : "на акцию") + "</small></span>";
        return "<li>" + (x && x.n ? '<a class="tg-row" href="board.html?q=' + encodeURIComponent(x.name) + '" data-pq="' + esc(x.name) + '">' + inner + "</a>"
          : '<div class="tg-row">' + inner + "</div>") + "</li>";
      }).join("") + "</ul>";

      return out + '<p class="tg-note">Источники: ' + esc((d.src || []).join(", ")) + ". Котировки Мосбиржи — с задержкой до 15 минут. " +
        (wl.length ? "Мировые индексы — CNBC. " : "") +
        "Новости — заголовки публичных Telegram-каналов" + (wn.length ? " и англоязычных деловых СМИ" : "") +
        ", отобраны и пересказаны автоматически. " +
        "Не является индивидуальной инвестиционной рекомендацией.</p>";
    }

    // ── Карточка дня для клиента (09.10.2026, Руслан: «покажи локально» на идею «Карточка дня») ──
    // Повод: после MarketTwits пришло 366 новых людей, а сами вернулись трое — у человека нет
    // повода зайти снова. Карточка даёт сейлзу этот повод каждый день: картинка со сводкой
    // (настроение, IMOEX, доллар, ключевая, S&P 500, Nasdaq, три заголовка, продукт дня) и
    // ссылка с его меткой ?ref= — переход клиента по ней подписан его именем.
    // Картинка рисуется прямо в телефоне из той же сводки, что на экране; на сервер ничего не
    // уходит. Ширина 1080, высота — по содержимому (заголовки бывают в две и три строки).
    // Отправка — системное «Поделиться» с файлом; нет его — картинка сохраняется файлом.
    var CARD = null;   // { url, file, link, text } — собранная карточка, пока открыт лист
    var MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    function goal(name) { if (window.ym) try { ym(110759242, "reachGoal", name); } catch (e) {} }
    // Метка: партнёр, вошедший в рабочий стол, — его метка; иначе та, с которой пришли на сайт
    function refLabel() {
      try {
        var v = localStorage.getItem("so_me") || localStorage.getItem("so_ref");
        return v && /^[\w.-]{1,40}$/.test(v) ? v.toLowerCase() : "";
      } catch (e) { return ""; }
    }
    // Ссылка ведёт сразу в «Рынок» (вкладка открывается по якорю), метка — перед якорем
    function cardLink(ref) { return "https://invest.rumberg.ru/" + (ref ? "?ref=" + encodeURIComponent(ref) : "") + "#mkt"; }

    function cardData() {
      var d = SV || {}, t = d.top || {}, w = d.world || {}, s = String(d.updated || "");
      var row1 = [], row2 = [];
      if (t.imoex && t.imoex.v) row1.push({ v: grp(t.imoex.v, 0), k: "IMOEX", s: pct(t.imoex.d) + " за день", dir: Number(t.imoex.d) });
      if (t.usd && t.usd.v) row1.push({ v: grp(t.usd.v, 2) + " ₽", k: "Доллар", s: pct(t.usd.d) + " за день", dir: 0 });
      if (t.key && t.key.rate) row1.push({ v: fq(t.key.rate) + "%", k: "Ключевая ставка", s: t.key.next ? "заседание " + dmy(t.key.next).slice(0, 5) : "", dir: 0 });
      (w.idx || []).forEach(function (x) {
        if (!x || !x.v) return;
        var dd = String(x.date || "");
        row2.push({ v: grp(x.v, 0), k: x.k, s: pct(x.d) + (dd === TODAY ? " за день" : dd ? " · " + dmy(dd).slice(0, 5) : ""), dir: Number(x.d) });
      });
      var prod = null, M = window.MORNING || {};
      if (daysAgo(M.date) === 0) {
        var r = BY[(M.products || [])[0]];
        if (r) { var f = figure(r), p = pname(r); prod = { head: p.head, rest: p.rest, v: f.v, n: f.n }; }
      }
      return {
        when: /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s) ? Number(s.slice(8, 10)) + " " + MONTHS[Number(s.slice(5, 7)) - 1] + " · данные на " + s.slice(11, 16) + " МСК" : "",
        mood: d.mood && isFinite(d.mood.score) ? d.mood : null,
        row1: row1, row2: row2,
        news: (d.news || []).filter(function (n) { return n.t; }).slice(0, 3),
        prod: prod,
        src: (d.src || []).join(", ")
      };
    }

    // Рисуем в два прохода: первый только считает высоту, второй рисует на холсте этой высоты
    function paintCard(cv, D) {
      var W = 1080, P = 72, IN = W - 2 * P;
      var INK = "#F2F3F7", MUT = "rgba(242,243,247,.64)", FAINT = "rgba(242,243,247,.44)", OR = "#EE7D1B", CARDC = "#14161C", LINE = "rgba(255,255,255,.10)";
      var R = "'Rubik', sans-serif", O = "'Onest', sans-serif", MO = "'JetBrains Mono', monospace";
      var c = cv.getContext("2d");
      function pass(draw) {
        var y = 0;
        function font(w, s, f) { c.font = w + " " + s + "px " + f; }
        function txt(s, x, yy, col, al) { if (!draw) return; c.fillStyle = col; c.textAlign = al || "left"; c.fillText(s, x, yy); }
        function box(x, yy, w, h, r, col) {
          if (!draw) return;
          c.fillStyle = col; c.beginPath(); c.moveTo(x + r, yy);
          c.arcTo(x + w, yy, x + w, yy + h, r); c.arcTo(x + w, yy + h, x, yy + h, r);
          c.arcTo(x, yy + h, x, yy, r); c.arcTo(x, yy, x + w, yy, r); c.closePath(); c.fill();
        }
        function star(cx, cy, s, col) {
          if (!draw) return;
          var k = s / 26, pts = [[13, 1], [15.6, 10.4], [25, 13], [15.6, 15.6], [13, 25], [10.4, 15.6], [1, 13], [10.4, 10.4]];
          c.fillStyle = col; c.beginPath();
          pts.forEach(function (p, i) { var px = cx + (p[0] - 13) * k, py = cy + (p[1] - 13) * k; if (i) c.lineTo(px, py); else c.moveTo(px, py); });
          c.closePath(); c.fill();
        }
        function hr(yy) { if (!draw) return; c.fillStyle = LINE; c.fillRect(P, yy, IN, 2); }
        // Перенос по словам; не влезло в maxL строк — последняя строка с многоточием
        function wrap(s, maxW, maxL) {
          var words = String(s).split(/\s+/), lines = [], cur = "";
          words.forEach(function (wd) {
            var t = cur ? cur + " " + wd : wd;
            if (c.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = wd; }
          });
          if (cur) lines.push(cur);
          if (lines.length > maxL) {
            lines = lines.slice(0, maxL);
            var last = lines[maxL - 1];
            while (last && c.measureText(last + "…").width > maxW) last = last.replace(/\s*\S+$/, "");
            lines[maxL - 1] = (last || lines[maxL - 1]) + "…";
          }
          return lines;
        }
        // Число не влезает в плитку — уменьшаем кегль, а не обрезаем
        function fit(s, w, size, f, maxW) { var z = size; font(w, z, f); while (z > 24 && c.measureText(s).width > maxW) { z -= 2; font(w, z, f); } return z; }

        if (draw) {
          c.fillStyle = "#0B0C10"; c.fillRect(0, 0, W, cv.height);
          var g = c.createRadialGradient(W * 0.86, 40, 0, W * 0.86, 40, 760);
          g.addColorStop(0, "rgba(238,125,27,.20)"); g.addColorStop(1, "rgba(238,125,27,0)");
          c.fillStyle = g; c.fillRect(0, 0, W, 900);
        }
        c.textBaseline = "alphabetic";

        // Шапка: звезда и Rumberg, справа адрес витрины
        y = 108;
        star(P + 19, y - 15, 38, OR);
        font(600, 42, R); txt("Rumberg", P + 52, y, INK);
        font(400, 27, MO); txt("invest.rumberg.ru", W - P, y - 2, MUT, "right");

        // Заголовок и время данных
        y += 122; font(600, 88, R); txt("Сводка рынка", P, y, INK);
        if (D.when) { y += 56; font(400, 32, O); txt(D.when, P, y, MUT); }

        // Настроение: число, слово, шкала страх — жадность
        if (D.mood) {
          var m = D.mood, sc = Math.max(0, Math.min(100, Number(m.score))), col = moodC(sc);
          y += 44; var top = y, h = 270;
          box(P, top, IN, h, 32, CARDC);
          font(600, 25, O); txt("НАСТРОЕНИЕ РЫНКА", P + 40, top + 62, OR);
          font(600, 124, R); txt(String(Math.round(sc)), P + 36, top + 172, col);
          var nw = draw ? c.measureText(String(Math.round(sc))).width : 0;
          font(400, 32, O); txt("из 100", P + 36 + nw + 18, top + 172, MUT);
          font(600, 52, R); txt(String(m.label || ""), W - P - 40, top + 166, col, "right");
          var bx = P + 40, bw = IN - 80, by = top + 198;
          if (draw) {
            var gb = c.createLinearGradient(bx, 0, bx + bw, 0);
            gb.addColorStop(0, "#E0705A"); gb.addColorStop(0.5, "rgba(242,243,247,.34)"); gb.addColorStop(1, "#55C08A");
            c.fillStyle = gb; box(bx, by, bw, 12, 6, gb);
            var mx = bx + bw * sc / 100;
            c.fillStyle = "#0B0C10"; c.beginPath(); c.arc(mx, by + 6, 19, 0, Math.PI * 2); c.fill();
            c.fillStyle = INK; c.beginPath(); c.arc(mx, by + 6, 14, 0, Math.PI * 2); c.fill();
          }
          font(400, 25, O); txt("страх", bx, top + h - 24, FAINT); txt("жадность", bx + bw, top + h - 24, FAINT, "right");
          y = top + h;
        }

        // Плитки: Россия в ряд по три, мир — по две
        function tiles(row) {
          if (!row.length) return;
          var gap = 16, n = row.length, tw = (IN - gap * (n - 1)) / n, th = 148;
          y += 18;
          row.forEach(function (t, i) {
            var x = P + i * (tw + gap);
            box(x, y, tw, th, 26, CARDC);
            fit(t.v, 500, 44, MO, tw - 56);
            txt(t.v, x + 28, y + 60, INK);
            font(400, 26, O); txt(t.k, x + 28, y + 97, MUT);
            if (t.s) { font(500, 26, O); txt(t.s, x + 28, y + 128, t.dir > 0 ? "#55C08A" : t.dir < 0 ? "#E0705A" : MUT); }
          });
          y += th;
        }
        tiles(D.row1); tiles(D.row2);

        // Главное за сутки — три заголовка, каждый до трёх строк
        if (D.news.length) {
          y += 72; font(600, 40, R); txt("Главное за сутки", P, y, INK);
          y += 16;
          D.news.forEach(function (n, i) {
            if (i) { y += 24; hr(y); }
            y += 48; font(500, 25, MO); txt(when(n.time), P, y, FAINT);
            font(500, 34, O);
            wrap(n.t, IN, 2).forEach(function (ln) { y += 46; txt(ln, P, y, INK); });
          });
        }

        // Продукт дня из утреннего обзора — цифра с меткой и «индикативно»
        if (D.prod) {
          y += 48; var pt = y, rw = 250, lw = IN - 80 - rw - 20;
          font(600, 34, R); var hl = wrap(D.prod.head, lw, 2);
          font(400, 28, O); var rl = D.prod.rest ? wrap(D.prod.rest, lw, 1) : [];
          var ph = Math.max(82 + hl.length * 44 + rl.length * 38 + 30, 200);
          box(P, pt, IN, ph, 28, CARDC);
          if (draw) { c.fillStyle = OR; c.fillRect(P, pt + 28, 6, ph - 56); }
          font(600, 24, O); txt("НА ВИТРИНЕ СЕГОДНЯ", P + 40, pt + 56, OR);
          var yy = pt + 56;
          font(600, 34, R); hl.forEach(function (ln) { yy += 44; txt(ln, P + 40, yy, INK); });
          font(400, 28, O); rl.forEach(function (ln) { yy += 38; txt(ln, P + 40, yy, MUT); });
          fit(D.prod.v, 600, 64, R, rw); txt(D.prod.v, W - P - 40, pt + 106, OR, "right");
          font(400, 25, O);
          if (D.prod.n) txt(D.prod.n, W - P - 40, pt + 144, MUT, "right");
          txt("индикативно", W - P - 40, pt + (D.prod.n ? 178 : 144), FAINT, "right");
          y = pt + ph;
        }

        // Подвал: куда идти и оговорки
        y += 52; hr(y);
        y += 78; font(600, 46, R); txt("invest.rumberg.ru", P, y, OR);
        font(400, 26, O); txt("обновляется каждые 5 минут", W - P, y - 4, MUT, "right");
        font(400, 22, O);
        var legal = (D.src ? "Данные: " + D.src + ". " : "") + "Заголовки отобраны и пересказаны автоматически. Котировки индикативные. " +
          "Не является индивидуальной инвестиционной рекомендацией.";
        y += 22;
        wrap(legal, IN, 4).forEach(function (ln) { y += 32; txt(ln, P, y, FAINT); });
        return y + 60;
      }
      cv.width = W; cv.height = 2400;
      var Hh = Math.ceil(pass(false));
      cv.height = Hh; pass(true);
    }

    function fontsReady() {
      if (!document.fonts || !document.fonts.load) return Promise.resolve();
      var all = Promise.all([
        document.fonts.load("600 88px Rubik", "Сводка рынка Rumberg 0123456789"),
        document.fonts.load("400 32px Onest", "Главное за сутки invest.rumberg.ru 0123456789"),
        document.fonts.load("500 36px Onest", "Сбербанк Nasdaq S&P −+%"),
        document.fonts.load("500 46px 'JetBrains Mono'", "0123456789 ₽%,.:")
      ]).catch(function () {});
      return Promise.race([all, new Promise(function (r) { setTimeout(r, 2500); })]);
    }

    function openCard() {
      if (document.getElementById("tg-svcard") || !SV) return;
      var ref = refLabel(), link = cardLink(ref), short = "invest.rumberg.ru" + (ref ? "/?ref=" + ref : "");
      var el = document.createElement("div");
      el.className = "tg-qz"; el.id = "tg-svcard";
      el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Сводка для клиента");
      el.innerHTML = '<div class="tg-qz-in"><div class="tg-qz-top"><button type="button" class="tg-qz-b" data-sc="close" aria-label="Закрыть">' +
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
        '</button><span class="tg-qz-n">Сводка для клиента</span></div>' +
        '<div class="tg-scp" id="tg-scp"><span class="w">Рисую карточку…</span></div>' +
        '<p class="tg-sclk">Ссылка: <b>' + esc(short) + "</b>" + (ref ? " — переходы по ней подписаны вашей меткой" : " — без метки: переходы не будут подписаны вашим именем") + ".</p>" +
        '<button type="button" class="tg-qz-go" data-sc="send" disabled>Отправить</button>' +
        '<button type="button" class="tg-scc" data-sc="copy">Скопировать ссылку</button>' +
        '<p class="tg-scs" id="tg-scs" role="status" aria-live="polite"></p>' +
        '<p class="tg-qz-legal">Картинка рисуется в телефоне из сводки на эту минуту, ссылка уходит вместе с ней. Можно и удержать картинку пальцем, чтобы сохранить.</p></div>';
      el.addEventListener("click", cardClick);
      document.getElementById("tg-app").appendChild(el);
      document.documentElement.classList.add("tg-sc-on");
      hist({ tg: S.cur, d: H.d + 1, from: S.cur, sc: 1 });
      goal("svodka_card_open");
      var D = cardData();
      CARD = { link: link, text: "Сводка рынка" + (D.when ? " на " + D.when.split(" · ")[0] : "") + " — настроение, индексы и главное за сутки. Обновляется каждые 5 минут: " + link };
      fontsReady().then(function () {
        if (!document.getElementById("tg-svcard")) return;
        var cv = document.createElement("canvas");
        paintCard(cv, D);
        cv.toBlob(function (b) {
          if (!b || !document.getElementById("tg-svcard")) return;
          var name = "rumberg-svodka-" + TODAY + ".png";
          CARD.url = URL.createObjectURL(b);
          try { CARD.file = new File([b], name, { type: "image/png" }); } catch (e) { CARD.file = null; }
          CARD.name = name;
          var box = document.getElementById("tg-scp");
          box.innerHTML = '<img src="' + CARD.url + '" alt="Сводка рынка Rumberg на сегодня">';
          var send = el.querySelector('[data-sc="send"]');
          var canFile = !!(CARD.file && navigator.canShare && navigator.canShare({ files: [CARD.file] }));
          send.textContent = canFile ? "Отправить" : "Сохранить картинку";
          send.disabled = false;
        }, "image/png");
      });
    }
    function closeCard(viaHistory) {
      var el = document.getElementById("tg-svcard"); if (el) el.remove();
      document.documentElement.classList.remove("tg-sc-on");
      if (CARD && CARD.url) URL.revokeObjectURL(CARD.url);
      var was = !!CARD; CARD = null;
      if (was && !viaHistory && (history.state || {}).sc) history.back();
    }
    function cardSay(s) { var n = document.getElementById("tg-scs"); if (n) n.textContent = s; }
    function cardSave() {
      var a = document.createElement("a");
      a.href = CARD.url; a.download = CARD.name; document.body.appendChild(a); a.click(); a.remove();
      cardSay("Картинка сохранена — ссылку скопируйте кнопкой ниже");
    }
    function cardCopy() {
      var t = CARD.link;
      function ok() { cardSay("Ссылка скопирована"); goal("svodka_card_copy"); }
      function manual() {
        var n = document.getElementById("tg-scs");
        if (n) { n.textContent = ""; var i = document.createElement("input"); i.value = t; i.readOnly = true; i.className = "tg-scu"; n.appendChild(i); i.select(); }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, function () { legacy() ? ok() : manual(); });
      else if (legacy()) ok(); else manual();
      function legacy() {
        try { var i = document.createElement("textarea"); i.value = t; i.style.position = "fixed"; i.style.opacity = "0"; document.body.appendChild(i); i.select(); var r = document.execCommand("copy"); i.remove(); return r; } catch (e) { return false; }
      }
    }
    function cardClick(e) {
      var b = e.target.closest("[data-sc]"); if (!b || !CARD) return;
      var a = b.getAttribute("data-sc");
      if (a === "close") { closeCard(false); return; }
      if (a === "copy") { cardCopy(); return; }
      if (a === "send" && CARD.url) {
        if (CARD.file && navigator.canShare && navigator.canShare({ files: [CARD.file] })) {
          navigator.share({ files: [CARD.file], text: CARD.text }).then(function () { goal("svodka_card_send"); cardSay("Отправлено"); },
            function (err) { if (!err || err.name !== "AbortError") cardSave(); });
        } else { cardSave(); goal("svodka_card_save"); }
      }
    }

    function mktBody() {
      var body = "";
      if (S.mkt.seg === "sum") body = svBody();
      else if (S.mkt.seg === "morning") {
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
      if (CARD && !(st && st.sc)) closeCard(true);         // «назад» из карточки дня — закрыть её
      if (!st || !st.tg || !VIEWS[st.tg]) return;          // чужие записи (истории stories.js) — не наши
      if (!st.ai && aiOn && window.Chat && Chat.close) { aiOn = false; Chat.close(); tabs(); }
      if (st.ai && !aiOn && window.Chat && Chat.open) { aiOn = true; Chat.open(); tabs(); }
      H.d = st.d || 0; H.from = st.from || null;
      if (st.tg !== S.cur) { save(); S.cur = st.tg; render(false, S.y[st.tg] || 0, true); tabs(); save(); }
    });
    app.addEventListener("click", function (e) {
      if (e.target.closest("[data-tgback]")) { back(); return; }
      if (e.target.closest("[data-quiz]")) { e.preventDefault(); openQuiz(); return; }
      if (e.target.closest("[data-svshare]")) { e.preventDefault(); openCard(); return; }
      if (e.target.closest("[data-unpick]")) { e.preventDefault(); S.prod.pick = null; render(true); save(); return; }
      // Продукты на бумагу из сводки: открываем «Продукты» с поиском по ней
      var pq = e.target.closest("[data-pq]");
      if (pq) { e.preventDefault(); S.prod.q = pq.getAttribute("data-pq"); S.prod.cls = "Акции РФ"; S.prod.type = "all"; S.prod.pick = null; S.y.prod = 0; go("prod"); return; }
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
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && QZ) closeQuiz(false); if (e.key === "Escape" && CARD) closeCard(false); });

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
