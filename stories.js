/* Истории на телефоне (06.10.2026).

   Что это. Ряд кружков в герое главной (только ≤860px) и полноэкранный просмотр
   «как в Telegram»: полоски прогресса сверху, кадр листается сам, тап справа —
   дальше, слева — назад, удержание — пауза, свайп вниз — закрыть, свайп вбок —
   к соседней истории, «Назад» на телефоне — закрыть.

   Состав — три истории (решение Руслана 06.10.2026: «Новое, Утро, Ставки;
   остальное оставляем как есть» — экраны-«рилсы» главной не тронуты): новые
   продукты доски (с прошлого визита), утренний обзор (MORNING, не старше трёх
   дней — как у колонки десктопа), лучшие ставки (RATES через window.soRates).
   Ничего не заводится руками. Цифры — теми же функциями, что колонки главной
   (window.soFigure), с пометкой «индикативно». Размещения, продукты дня,
   вебинар и дайджест историями НЕ показываются — у них свои экраны и строки
   главной (код их историй убран 06.10.2026, вернуть — по данным OFFERINGS /
   MORNING.products / EVENTS / DIGEST_ARCHIVE).

   Просмотрено. Ключ истории включает дату/версию данных (утро за 06.10 и за
   07.10 — разные истории), просмотренные лежат в localStorage so_st_seen.
   Непросмотренные — с оранжевым кольцом и идут первыми. «Новое на доске»: id
   продуктов, которые браузер уже видел, — в so_st_known; первый визит ничего
   новым не считает.

   Ссылка на историю: index.html#story=<promo|new|news|rates> — откроет
   её после входного ролика и гейта квалинвестора (не поверх них).
   Служебное: ?stories=reset — забыть просмотренное. */
(function () {
  "use strict";
  var MQ = window.matchMedia && window.matchMedia("(max-width: 860px)");
  if (!MQ) return;
  // Окно, открытое широким и потом суженным, тоже получает истории
  if (MQ.matches) init();
  else {
    var onCh = function () {
      if (!MQ.matches) return;
      if (MQ.removeEventListener) MQ.removeEventListener("change", onCh); else MQ.removeListener(onCh);
      init();
    };
    if (MQ.addEventListener) MQ.addEventListener("change", onCh); else MQ.addListener(onCh);
  }

  function init() {
  var hero = document.querySelector(".hero");
  if (!hero) return;

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var STANDALONE = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  var IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // Android/Chrome: системный диалог установки откладываем до кнопки в истории
  var installEv = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEv = e; });
  var SEEN_KEY = "so_st_seen", KNOWN_KEY = "so_st_known";
  var DAY = 864e5, NEW_TTL = 14 * DAY;
  var YM = 110759242;

  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function seenSet() { var s = load(SEEN_KEY, []); return Array.isArray(s) ? s : []; }
  function markSeen(key) { var s = seenSet(); if (s.indexOf(key) < 0) { s.push(key); store(SEEN_KEY, s.slice(-60)); } }
  function goal(name, p) { if (window.ym) try { ym(YM, "reachGoal", name, p || {}); } catch (e) {} }

  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  // В url() внутри style — своё экранирование: кавычка или скобка в имени файла сломала бы правило
  function cssUrl(u) { return "url(\"" + String(u).replace(/["\\)]/g, function (c) { return "\\" + c; }) + "\")"; }
  function dm(iso) { var p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "." + p[1] : ""; }
  var MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  function human(iso) { var p = String(iso || "").split("-"); return p.length === 3 ? (+p[2]) + " " + MONTHS[+p[1] - 1] : ""; }
  function cut(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1).replace(/[\s,.;:—-]+\S*$/, "") + "…" : s; }
  // ДД.ММ.ГГГГ → ISO (у размещений дата так)
  function dmyToIso(s) { var m = String(s || "").match(/^(\d{2})\.(\d{2})\.(\d{4})/); return m ? m[3] + "-" + m[2] + "-" + m[1] : ""; }
  // Сколько дней прошло от ISO-даты до сегодня (по локальному календарю)
  function ageDays(iso) {
    if (/^\d{2}\.\d{2}\.\d{4}/.test(iso)) iso = dmyToIso(iso);     // у дайджеста дата ДД.ММ.ГГГГ
    var p = String(iso || "").split("-").map(Number); if (p.length < 3 || !p[0]) return null;
    var t = new Date();
    return Math.round((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - Date.UTC(p[0], p[1] - 1, p[2])) / DAY);
  }
  // Подпись давности в шапке кадра: там, где у историй стоит «2 ч назад»
  function ago(iso) {
    if (/^\d{2}\.\d{2}\.\d{4}/.test(iso)) iso = dmyToIso(iso);
    var a = ageDays(iso);
    if (a == null) return "";
    if (a <= 0) return "сегодня";
    if (a === 1) return "вчера";
    return human(iso);
  }

  var ICON = {
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    rocket: '<path d="M12 3c3 2 4.5 5 4.5 8.5L14 15h-4l-2.5-3.5C7.5 8 9 5 12 3Z"/><circle cx="12" cy="9.5" r="1.6"/><path d="M10 15l-1.5 4L12 17.5 15.5 19 14 15"/>',
    chart: '<path d="M4 18h16"/><path d="M6 15l4-4 3 3 5-6"/><path d="M15 8h3v3"/>',
    sun: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6"/>',
    pct: '<path d="M6 18L18 6"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
    mic: '<rect x="9" y="3.5" width="6" height="10" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M10.5 5.5h3M11 18.5h2"/>',
    doc: '<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5V8h4M9.5 12h5M9.5 15.5h5"/>'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[n] + '</svg>'; }
  var IC_COPY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';

  // ── Сборка историй из данных сайта ─────────────────────────────────────────
  function productSlide(r, kicker, tone) {
    var S = window.SITE || {};
    var f = window.soFigure ? window.soFigure(r) : { v: (r.quote != null ? r.quote + "%" : "—"), n: "" };
    // Имя двумя строками, как в колонке: тип («Варрант CALL 100») и актив со сроком
    var nm = window.soPname ? window.soPname(r) : { head: r.name, rest: "" };
    var t = S.TYPES && S.TYPES[r.type] ? S.TYPES[r.type].title : "";
    return {
      tone: tone, kicker: kicker,
      title: nm.head, sub: nm.rest,
      figure: f.v, figureK: (f.n ? f.n + " · " : "") + "индикативно",
      text: [t, r.currency && r.currency !== "RUB" ? r.currency : "", r.minNom && r.minNom > 1000000 ? "от " + Math.round(r.minNom / 1e6) + " млн ₽" : ""].filter(Boolean).join(" · "),
      cta: ["Открыть карточку", "instrument.html?id=" + encodeURIComponent(r.id)],
      copyId: r.id
    };
  }

  function build() {
    var G = [];
    var cat = (window.SITE_DATA && window.SITE_DATA.instruments) || [];
    function byId(id) { for (var i = 0; i < cat.length; i++) if (cat[i].id === id) return cat[i]; return null; }
    var now = Date.now();

    // Яркая короткая история о телефонной версии (просьба Руслана 06.10.2026).
    // Текст написан руками и живёт здесь; показывается, пока не просмотрена,
    // первым кружком. Устареет — поменять ключ promo:*, и она загорится заново
    G.push({
      id: "promo", key: "promo:mobile-2026-10c", date: "2026-10-06",
      label: "С телефона", icon: "phone", tone: "bright",
      slides: [
        { tone: "bright", dur: 3800, kicker: "Новая версия для телефона",
          title: "Вся витрина — во вкладках внизу",
          text: "Продукты, рынок, AI-ассистент, выпуски и всё остальное — в один тап, как в Telegram." },
        { tone: "bright2", dur: 3800, kicker: "Истории",
          title: "Новое, утро и ставки — в кружках сверху",
          text: "Новые продукты доски, обзор рынков и лучшие ставки до года. Ссылку клиенту — в один тап." },
        { tone: "bright3", dur: 4200, kicker: "AI-ассистент и one-pager",
          title: "Спросите AI — объяснит продукт и посчитает цену",
          text: "One-pager по продукту собирается в PDF прямо с телефона.",
          cta: ["Смотреть продукты", "board.html"] }
      ].concat(STANDALONE ? [] : [
        // Кадр про установку — только если витрина ещё не открыта как приложение.
        // Android: кнопка вызывает системный диалог установки (beforeinstallprompt);
        // iPhone такого события не даёт — подсказываем путь через «Поделиться»
        { tone: "bright", dur: 6000, kicker: "Как приложение",
          title: "Добавьте витрину на экран телефона",
          text: IOS ? "Внизу Safari нажмите «Поделиться», затем «На экран Домой» — витрина откроется как приложение, без адресной строки."
                    : "Откроется как приложение, без адресной строки. Иконка — на главном экране.",
          install: true, cta: IOS ? null : ["Установить", "#install"] }
      ])
    });

    // Новое на доске: продукты, которых браузер раньше не видел. Первый визит
    // ничего новым не считает (иначе «новыми» были бы все 118). Снятые с доски
    // забываем, запись о «новом» живёт две недели
    if (cat.length) {
      var known = load(KNOWN_KEY, null), first = !known || typeof known !== "object";
      if (first) known = {};
      var next = {};
      cat.forEach(function (r) { next[r.id] = known[r.id] || now; });
      store(KNOWN_KEY, next);
      var fresh = first ? [] : cat.filter(function (r) { return !known[r.id] || now - known[r.id] < NEW_TTL; })
        .filter(function (r) { return now - next[r.id] < NEW_TTL; });
      if (fresh.length) {
        var ids = fresh.map(function (r) { return r.id; }).sort();
        var show = fresh.slice(0, 6);
        G.push({
          id: "new", key: "new:" + ids.join(","), date: new Date(Math.max.apply(null, fresh.map(function (r) { return next[r.id]; }))).toISOString().slice(0, 10),
          label: "Новое", icon: "spark", tone: "solar",
          slides: show.map(function (r, i) {
            return productSlide(r, "Новое на доске · " + (i + 1) + " из " + show.length + (fresh.length > show.length ? " · всего " + fresh.length : ""), "solar");
          }).concat(fresh.length > show.length ? [{
            tone: "solar", kicker: "Новое на доске", title: "Ещё " + (fresh.length - show.length) + " " + plural(fresh.length - show.length, ["продукт", "продукта", "продуктов"]),
            text: "Все новые позиции — на доске.", cta: ["Открыть доску", "board.html"]
          }] : [])
        });
      }
    }

    // Утренний обзор — не старше трёх дней, как у колонки «Утро» на десктопе
    var M = window.MORNING || {}, mAge = ageDays(M.date);
    if (M.date && mAge != null && mAge <= 3) {
      var news = M.news || [];
      if (news.length) G.push({
        id: "news", key: "news:" + M.date, date: M.date, label: "Утро", icon: "sun", tone: "dawn",
        slides: news.map(function (n) {
          return {
            tone: "dawn",
            kicker: (n.rubric || "Рынки") + " · утро " + dm(M.date),
            title: n.title, text: cut(n.body, 240),
            cta: n.link ? ["Читать разбор", n.link] : null
          };
        })
      });
    }

    // Лучшие ставки до года: те же строки, что показывала главная (без промо)
    var R = window.RATES || {}, rows = window.soRates ? window.soRates() : [];
    if (rows.length) {
      var rDate = String(R.updated || "").slice(0, 10), top = Math.max.apply(null, rows.map(function (x) { return x.v; }));
      G.push({
        id: "rates", key: "rates:" + (R.updated || ""), date: rDate, label: "Ставки", icon: "pct", tone: "green",
        slides: [{
          tone: "green", kicker: "Лучшие ставки до года · " + (R.updated ? String(R.updated).slice(11, 16) || dm(rDate) : ""),
          title: "до " + pct1(top), sub: "вклады, фонды и короткие ОФЗ",
          list: rows.slice(0, 4).map(function (x) { return pct1(x.v) + " — " + x.k + (x.n ? " · " + x.n : ""); }),
          cta: ["Весь скринер", "screener.html"]
        }]
      });
    }

    var ORDER = ["promo", "new", "news", "rates"];
    G.sort(function (a, b) { return ORDER.indexOf(a.id) - ORDER.indexOf(b.id); });
    var seen = seenSet();
    G.forEach(function (g) { g.seen = seen.indexOf(g.key) >= 0; });
    // Непросмотренные первыми, порядок внутри — как собрано
    return G.filter(function (g) { return !g.seen; }).concat(G.filter(function (g) { return g.seen; }));
  }
  function pct1(v) { return (Math.round(v * 10) / 10).toFixed(1).replace(".", ",").replace(/,0$/, "") + "%"; }
  function plural(n, f) { n = Math.abs(n) % 100; var n1 = n % 10; if (n > 10 && n < 20) return f[2]; if (n1 > 1 && n1 < 5) return f[1]; if (n1 === 1) return f[0]; return f[2]; }
  // Длительность кадра — по объёму текста: 4 с на короткий, до 12 на длинный
  function durOf(s) {
    if (s.dur) return s.dur;
    var n = [s.title, s.sub, s.text, (s.facts || []).map(function (f) { return f.join(" "); }).join(" "), (s.list || []).join(" ")].join(" ").length;
    return Math.min(12000, Math.max(4000, 3000 + n * 40));
  }

  // ── Стили ──────────────────────────────────────────────────────────────────
  var css = document.createElement("style");
  css.textContent = [
    ".st-row{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -20px auto;padding:2px 20px 18px;-webkit-overflow-scrolling:touch;}",
    ".st-row[hidden]{display:none;}",       // атрибут hidden слабее display:flex — явно
    ".st-row::-webkit-scrollbar{display:none;}",
    // По центру строки: auto-поля у крайних кружков, а не justify-content:center —
    // при переполнении (узкий экран) центровка срезала бы первый кружок за левый край
    ".st-row>.st-c:first-child{margin-left:auto;}.st-row>.st-c:last-child{margin-right:auto;}",
    ".st-c{flex:none;display:flex;flex-direction:column;align-items:center;gap:7px;width:64px;background:none;border:0;padding:0;color:#F2F3F7;font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;}",
    ".st-ring{width:60px;height:60px;border-radius:50%;padding:2.5px;box-sizing:border-box;background:conic-gradient(from 200deg,#EE7D1B,#F5B36A,#EE7D1B,#C9580E,#EE7D1B);}",
    ".st-c.seen .st-ring{background:rgba(255,255,255,.18);}",
    ".st-in{width:100%;height:100%;border-radius:50%;border:2.5px solid #0B0C10;box-sizing:border-box;display:flex;align-items:center;justify-content:center;background-size:cover;background-position:center;color:#F2F3F7;}",
    ".st-c .t{font-size:11px;line-height:1.2;color:rgba(242,243,247,.82);white-space:nowrap;}",
    ".st-c.seen .t{color:rgba(242,243,247,.56);}",
    ".st-c:focus-visible{outline:2px solid #EE7D1B;outline-offset:3px;border-radius:12px;}",
    ".tn-solar{background:radial-gradient(120% 90% at 30% 20%,#7A3A0C 0%,#2A160A 55%,#0B0C10 100%);}",
    ".tn-blue{background:radial-gradient(120% 90% at 70% 15%,#1E3C78 0%,#111A2E 55%,#0B0C10 100%);}",
    ".tn-dawn{background:radial-gradient(120% 90% at 80% 0%,#6B4A16 0%,#22180C 50%,#0B0C10 100%);}",
    ".tn-violet{background:radial-gradient(120% 90% at 20% 10%,#4B3A86 0%,#1A1630 55%,#0B0C10 100%);}",
    ".tn-green{background:radial-gradient(120% 90% at 75% 10%,#1F5A3E 0%,#10241B 55%,#0B0C10 100%);}",
    // Яркие кадры: сплошной оранжевый семейства витрины, текст тёмный — как на
    // оранжевых кнопках (#0C0A08); у затемняющего градиента снизу тут нет работы
    ".tn-bright{background:radial-gradient(130% 100% at 20% 0%,#FFB067 0%,#EE7D1B 45%,#C9580E 100%);}",
    ".tn-bright2{background:radial-gradient(130% 100% at 85% 10%,#F5B36A 0%,#EE7D1B 50%,#B04E0B 100%);}",
    ".tn-bright3{background:radial-gradient(130% 100% at 50% 100%,#FFC894 0%,#F58E33 40%,#C9580E 100%);}",
    ".st-in.tn-bright{color:#0C0A08;}",
    ".st-card.lit::after{background:linear-gradient(180deg,rgba(0,0,0,.18) 0%,rgba(0,0,0,0) 20%);}",
    ".st-card.lit,.st-card.lit .st-h,.st-card.lit .st-gn{color:#0C0A08;}",
    ".st-card.lit .st-k{color:rgba(12,10,8,.72);}",
    ".st-card.lit .st-p,.st-card.lit .st-sub{color:rgba(12,10,8,.84);}",
    ".st-card.lit .st-ago{color:rgba(12,10,8,.6);}",
    ".st-card.lit .st-x{color:#0C0A08;}",
    ".st-card.lit .st-ava{background:rgba(12,10,8,.9);}",
    ".st-card.lit .st-star path{fill:#fff;}.st-card.lit .st-star{opacity:.22;}",
    ".st-card.lit .st-bars i{background:rgba(12,10,8,.22);}.st-card.lit .st-bars b{background:#0C0A08;}",
    ".st-card.lit .st-cta{background:#0C0A08;color:#F2F3F7;}",
    ".st-card.lit .st-h{font-size:clamp(30px,9vw,40px);}",
    // просмотр — НИЖЕ гейта квалинвестора (100000) и интро, выше меню (400) и чата
    "html.st-lock,html.st-lock body{overflow:hidden!important;}",
    ".st-v{position:fixed;inset:0;z-index:99000;background:#000;display:flex;align-items:center;justify-content:center;touch-action:none;opacity:0;transition:opacity .2s;}",
    ".st-v.on{opacity:1;}",
    ".st-card{position:relative;width:100%;height:100%;max-width:480px;overflow:hidden;color:#F2F3F7;font-family:'Onest',system-ui,sans-serif;background-size:cover;background-position:center;transition:transform .25s;}",
    ".st-card::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 38%,rgba(11,12,16,.92) 72%,#0B0C10 100%);pointer-events:none;}",
    ".st-card.ph::after{background:linear-gradient(180deg,rgba(0,0,0,.35) 0%,rgba(0,0,0,0) 20%);}",
    ".st-star{position:absolute;right:-60px;top:18%;width:280px;height:280px;opacity:.08;}",
    ".st-bars{position:absolute;left:10px;right:10px;top:calc(10px + env(safe-area-inset-top));display:flex;gap:4px;z-index:3;}",
    ".st-bars i{flex:1;height:2.5px;border-radius:2px;background:rgba(255,255,255,.28);overflow:hidden;}",
    ".st-bars b{display:block;height:100%;width:0;background:#fff;}",
    ".st-bars i.done b{width:100%;}",
    ".st-bars i.cur b{animation:st-fill linear forwards;}",
    ".st-v.paused .st-bars i.cur b{animation-play-state:paused;}",
    "@keyframes st-fill{from{width:0}to{width:100%}}",
    ".st-top{position:absolute;left:14px;right:6px;top:calc(22px + env(safe-area-inset-top));display:flex;align-items:center;gap:9px;z-index:3;}",
    ".st-ava{width:30px;height:30px;border-radius:50%;background:#0B0C10;display:flex;align-items:center;justify-content:center;flex:none;}",
    ".st-gn{font-size:13.5px;font-weight:600;}",
    ".st-ago{font-size:12px;color:rgba(242,243,247,.6);}",
    ".st-x{margin-left:auto;width:44px;height:44px;border:0;background:none;color:#fff;font-size:28px;line-height:1;cursor:pointer;}",
    ".st-body{position:absolute;left:22px;right:22px;bottom:calc(104px + env(safe-area-inset-bottom));z-index:2;}",
    ".st-body.two{bottom:calc(166px + env(safe-area-inset-bottom));}",
    ".st-k{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#F5B36A;}",
    ".st-h{margin:12px 0 0;font-family:'Rubik',sans-serif;font-weight:600;font-size:clamp(26px,8vw,34px);line-height:1.1;letter-spacing:-.02em;text-wrap:balance;}",
    ".st-sub{margin:6px 0 0;font-size:17px;line-height:1.3;color:rgba(242,243,247,.78);}",
    ".st-f{margin-top:18px;font-family:'JetBrains Mono',monospace;font-size:clamp(44px,15vw,64px);font-weight:600;letter-spacing:-.03em;line-height:1;}",
    ".st-fk{margin-top:6px;font-size:13px;color:rgba(242,243,247,.66);}",
    ".st-p{margin:14px 0 0;font-size:15.5px;line-height:1.5;color:rgba(242,243,247,.86);}",
    ".st-facts{margin-top:16px;display:flex;flex-wrap:wrap;gap:8px;}",
    ".st-facts span{font-size:12.5px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:6px 11px;}",
    ".st-facts b{font-weight:600;color:#fff;}",
    ".st-list{margin:16px 0 0;padding:0;list-style:none;}",
    ".st-list li{padding:10px 0;border-top:1px solid rgba(255,255,255,.12);font-size:15px;line-height:1.35;}",
    ".st-acts{position:absolute;left:22px;right:22px;bottom:calc(30px + env(safe-area-inset-bottom));z-index:4;display:flex;flex-direction:column;gap:10px;}",
    ".st-cta,.st-copy{display:flex;align-items:center;justify-content:center;gap:8px;height:52px;border-radius:14px;font-family:inherit;font-weight:600;font-size:15.5px;text-decoration:none;cursor:pointer;}",
    ".st-cta{background:#EE7D1B;color:#0C0A08;border:0;}",
    ".st-copy{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);color:#F2F3F7;}",
    ".st-copy.done{background:rgba(85,192,138,.18);border-color:rgba(85,192,138,.5);color:#9ADDBB;}",
    ".st-toast{position:absolute;left:22px;right:22px;bottom:calc(150px + env(safe-area-inset-bottom));z-index:5;background:#14161C;border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.45;color:#F2F3F7;word-break:break-all;}",
    ".st-toast b{display:block;font-weight:600;margin-bottom:4px;word-break:normal;}",
    "@media (prefers-reduced-motion:reduce){.st-v,.st-card{transition:none;}}",
    // окно расширили обратно — ряд прячем, на десктопе героя он не трогает
    "@media (min-width:861px){.st-row,.st-sp{display:none;}}"
  ].join("");
  document.head.appendChild(css);

  var STAR = '<svg class="st-star" viewBox="0 0 26 26" aria-hidden="true"><path d="M13 1 L15.6 10.4 L25 13 L15.6 15.6 L13 25 L10.4 15.6 L1 13 L10.4 10.4 Z" fill="#EE7D1B"/></svg>';
  var STAR_SM = '<svg viewBox="0 0 26 26" width="16" height="16" aria-hidden="true"><path d="M13 1 L15.6 10.4 L25 13 L15.6 15.6 L13 25 L10.4 15.6 L1 13 L10.4 10.4 Z" fill="#EE7D1B"/></svg>';

  // ── Ряд кружков ────────────────────────────────────────────────────────────
  var row = document.createElement("div");
  row.className = "st-row";
  row.setAttribute("role", "list");
  row.setAttribute("aria-label", "Новое на витрине");
  hero.insertBefore(row, hero.firstChild);
  // Герой на телефоне — экран с содержимым по центру: ряд прижат к верху
  // (margin-bottom:auto), распорка в конце держит остальное по центру
  var sp = document.createElement("div");
  sp.className = "st-sp";
  sp.style.marginTop = "auto";
  hero.appendChild(sp);
  var groups = [];

  function paintRow() {
    groups = build();
    row.hidden = !groups.length;
    row.innerHTML = groups.map(function (g, i) {
      var inner = g.thumb
        ? '<span class="st-in" style="background-image:' + esc(cssUrl(g.thumb)) + '"></span>'
        : '<span class="st-in tn-' + g.tone + '">' + icon(g.icon) + '</span>';
      return '<button class="st-c' + (g.seen ? " seen" : "") + '" type="button" role="listitem" data-i="' + i + '" aria-label="История «' + esc(g.label) + '»' + (g.seen ? ", просмотрена" : "") + '">' +
        '<span class="st-ring">' + inner + '</span><span class="t">' + esc(g.short || g.label) + '</span></button>';
    }).join("");
  }
  paintRow();
  // Строки ставок и имя продукта главная отдаёт функциями ниже по странице (window.soRates,
  // window.soPname): этот файл стоит раньше, и при первой отрисовке их ещё нет. Раньше ряд
  // перерисовывало событие so-lazy (ленивая подгрузка дайджеста), но с 07.10.2026 на телефоне
  // её нет до прокрутки — и кружок «Ставки» пропадал. Перерисовываем, когда страница разобрана
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { if (!viewer) paintRow(); });
  window.addEventListener("so-lazy", function () { if (!viewer) paintRow(); });
  row.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest(".st-c") : null;
    if (b) open(+b.getAttribute("data-i"), b, true);
  });

  // ── Просмотр ───────────────────────────────────────────────────────────────
  var viewer = null, gi = 0, si = 0, opener = null, timer = null, startAt = 0, left = 0, paused = false, pushed = false;

  function refTag() {
    try { var v = localStorage.getItem("so_ref"); return v && /^[\w.-]{1,40}$/.test(v) ? v : ""; } catch (e) { return ""; }
  }
  function shareUrl(id) {
    var u = new URL("p/" + encodeURIComponent(id) + ".html", location.href);
    var ref = refTag(); if (ref) u.searchParams.set("ref", ref);
    return u.href;
  }

  function slideHTML(g, s) {
    var facts = (s.facts || []).map(function (f) { return '<span>' + esc(f[0]) + ': <b>' + esc(f[1]) + '</b></span>'; }).join("");
    var two = !!(s.cta && s.copyId);
    return '' +
      (s.bg ? "" : STAR) +
      '<div class="st-bars">' + g.slides.map(function (_, k) { return '<i class="' + (k < si ? "done" : k === si ? "cur" : "") + '"><b></b></i>'; }).join("") + '</div>' +
      '<div class="st-top"><span class="st-ava">' + STAR_SM + '</span><span class="st-gn">' + esc(g.label) + '</span><span class="st-ago">' + esc(ago(g.date)) + '</span>' +
        '<button class="st-x" type="button" aria-label="Закрыть">×</button></div>' +
      '<div class="st-body' + (two ? " two" : "") + '">' +
        '<div class="st-k">' + esc(s.kicker) + '</div>' +
        '<h2 class="st-h">' + esc(s.title) + '</h2>' +
        (s.sub ? '<p class="st-sub">' + esc(s.sub) + '</p>' : "") +
        (s.figure ? '<div class="st-f">' + esc(s.figure) + '</div><div class="st-fk">' + esc(s.figureK) + '</div>' : "") +
        (s.text ? '<p class="st-p">' + esc(s.text) + '</p>' : "") +
        (facts ? '<div class="st-facts">' + facts + '</div>' : "") +
        (s.list ? '<ul class="st-list">' + s.list.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join("") + '</ul>' : "") +
      '</div>' +
      (s.cta ? '<div class="st-acts">' +
        // «Отправить клиенту»: ссылка /p/<id>.html с меткой сейлза — главная работа
        // сейлза с витриной (PRODUCT.md, принцип №2), из истории в один тап
        (s.copyId ? '<button class="st-copy" type="button" data-copy="' + esc(shareUrl(s.copyId)) + '">' + IC_COPY + 'Ссылка клиенту</button>' : "") +
        '<a class="st-cta" href="' + esc(s.cta[1]) + '">' + esc(s.cta[0]) + ' →</a></div>' : "");
  }

  function preload(g, k) {
    var s = g && g.slides[k];
    if (s && s.bg) { var im = new Image(); im.src = s.bg; }
  }

  function render() {
    var g = groups[gi], s = g.slides[si];
    var card = viewer.querySelector(".st-card");
    var tone = s.tone || g.tone;
    card.className = "st-card" + (s.bg ? " ph" : " tn-" + tone) + (/^bright/.test(tone) ? " lit" : "");
    card.style.backgroundImage = s.bg ? "linear-gradient(rgba(0,0,0,.05),rgba(0,0,0,.05))," + cssUrl(s.bg) : "";
    card.innerHTML = slideHTML(g, s);
    left = durOf(s);
    var bar = card.querySelector(".st-bars i.cur b");
    if (bar) bar.style.animationDuration = left + "ms";
    if (si === g.slides.length - 1) markSeen(g.key);
    paused = false; viewer.classList.remove("paused");
    run();
    // следующий кадр с картинкой — заранее, чтобы не мигал пустым фоном
    if (si + 1 < g.slides.length) preload(g, si + 1); else if (groups[gi + 1]) preload(groups[gi + 1], 0);
    goal("story_view", { story: g.id, slide: si });
  }
  function run() {
    clearTimeout(timer);
    if (REDUCED) return;                         // без автолистания — только касаниями
    startAt = Date.now();
    timer = setTimeout(next, left);
  }
  function pause() { if (paused || !viewer) return; paused = true; clearTimeout(timer); left -= Date.now() - startAt; viewer.classList.add("paused"); }
  function resume() { if (!paused || !viewer) return; paused = false; viewer.classList.remove("paused"); run(); }
  function next() {
    var g = groups[gi];
    if (si < g.slides.length - 1) { si++; render(); }
    else if (gi < groups.length - 1) { gi++; si = 0; render(); }
    else close();
  }
  function prev() {
    if (si > 0) { si--; render(); }
    else if (gi > 0) { gi--; si = 0; render(); }
    else render();
  }

  function open(i, btn, byUser) {
    if (viewer || !groups[i]) return;
    opener = btn || null; gi = i; si = 0;
    viewer = document.createElement("div");
    viewer.className = "st-v";
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-modal", "true");
    viewer.setAttribute("aria-label", "Истории Rumberg");
    viewer.innerHTML = '<div class="st-card"></div>';
    document.body.appendChild(viewer);
    document.documentElement.classList.add("st-lock");
    requestAnimationFrame(function () { if (viewer) viewer.classList.add("on"); });
    // Запись в историю браузера: «Назад» на телефоне закрывает историю, а не
    // уводит с сайта. Открытие по ссылке #story= запись не добавляет — у неё
    // «Назад» и так ведёт туда, откуда пришли
    if (byUser) { try { history.pushState({ story: 1 }, "", location.pathname + location.search + "#story=" + groups[i].id); pushed = true; } catch (e) { pushed = false; } }
    render();
    bind();
    var x = viewer.querySelector(".st-x"); if (x) x.focus({ preventScroll: true });
    goal("story_open", { story: groups[i].id });
  }
  function teardown() {
    if (!viewer) return;
    clearTimeout(timer);
    var v = viewer; viewer = null;
    v.classList.remove("on");
    setTimeout(function () { v.remove(); }, REDUCED ? 0 : 200);
    document.documentElement.classList.remove("st-lock");
    document.removeEventListener("keydown", onKey, true);
    paintRow();
    if (opener) { var b = row.querySelector(".st-c"); try { (b || opener).focus({ preventScroll: true }); } catch (e) {} }
  }
  function close() {
    if (!viewer) return;
    if (pushed) { pushed = false; history.back(); }    // popstate → teardown
    else {
      // пришли по #story= — убираем якорь, чтобы обновление страницы не открыло историю снова
      if (/#story=/.test(location.hash)) try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      teardown();
    }
  }
  window.addEventListener("popstate", function () { if (viewer) { pushed = false; teardown(); } });

  function onKey(e) {
    if (!viewer) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "ArrowRight") { next(); return; }
    if (e.key === "ArrowLeft") { prev(); return; }
    // Фокус заперт в истории: Tab ходит только по её кнопкам
    if (e.key === "Tab") {
      var f = viewer.querySelectorAll("button,a[href]");
      if (!f.length) { e.preventDefault(); return; }
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!viewer.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  }

  function copyLink(btn) {
    var url = btn.getAttribute("data-copy");
    pause();                                      // пока человек читает подтверждение
    goal("story_copy");
    function done(ok) {
      var card = viewer && viewer.querySelector(".st-card"); if (!card) return;
      var old = card.querySelector(".st-toast"); if (old) old.remove();
      var t = document.createElement("div"); t.className = "st-toast";
      if (ok) { btn.classList.add("done"); btn.innerHTML = IC_COPY + "Скопировано"; t.innerHTML = "<b>Ссылка скопирована</b>" + esc(url); }
      else t.innerHTML = "<b>Скопируйте ссылку вручную</b>" + esc(url);   // буфер недоступен — показываем текстом
      card.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.remove(); }, ok ? 2600 : 8000);
    }
    // Три уровня, как на главной и в me.html: clipboard → execCommand → текст
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { done(true); }, function () { legacy(); });
    } else legacy();
    function legacy() {
      var ok = false;
      try { var ta = document.createElement("textarea"); ta.value = url; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px"; document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); ta.remove(); } catch (e) {}
      done(ok);
    }
  }

  function bind() {
    document.addEventListener("keydown", onKey, true);
    var x0 = 0, y0 = 0, t0 = 0, holdT = null, held = false, card = viewer.querySelector(".st-card");
    viewer.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".st-acts,.st-x,.st-toast")) return;
      x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); held = false;
      holdT = setTimeout(function () { held = true; pause(); }, 220);
    });
    viewer.addEventListener("pointermove", function (e) {
      if (!t0) return;
      var dy = e.clientY - y0;
      if (dy > 0) card.style.transform = "translateY(" + dy * 0.6 + "px) scale(" + (1 - Math.min(dy, 300) / 3000) + ")";
    });
    viewer.addEventListener("pointerup", function (e) {
      if (!t0) return;
      clearTimeout(holdT);
      var dx = e.clientX - x0, dy = e.clientY - y0; t0 = 0;
      card.style.transform = "";
      if (dy > 90 && Math.abs(dy) > Math.abs(dx)) { close(); return; }
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0 && gi < groups.length - 1) { gi++; si = 0; render(); }
        else if (dx > 0 && gi > 0) { gi--; si = 0; render(); }
        else resume();
        return;
      }
      if (held) { resume(); return; }
      // Тап: левая треть экрана — назад, остальное — дальше (по координате:
      // текст кадра лежит поверх зон касания)
      var r = card.getBoundingClientRect();
      if (e.clientX - r.left < r.width / 3) prev(); else next();
    });
    viewer.addEventListener("pointercancel", function () { clearTimeout(holdT); t0 = 0; card.style.transform = ""; resume(); });
    viewer.addEventListener("click", function (e) {
      if (e.target.closest(".st-x")) { e.preventDefault(); close(); return; }
      var c = e.target.closest(".st-copy"); if (c) { e.preventDefault(); copyLink(c); return; }
      var cta = e.target.closest(".st-cta");
      if (cta && cta.getAttribute("href") === "#install") {
        e.preventDefault(); goal("story_install");
        if (installEv) { pause(); installEv.prompt(); installEv.userChoice.then(function () { installEv = null; close(); }, function () { resume(); }); }
        else { cta.textContent = "Меню браузера → «Установить приложение»"; }   // Chrome не предложил — например, уже стояло
        return;
      }
      if (cta) goal("story_cta", { story: groups[gi].id, slide: si });
    });
  }
  // Один слушатель на модуль, а не на каждое открытие
  document.addEventListener("visibilitychange", function () { if (!viewer) return; document.hidden ? pause() : resume(); });

  // ── Служебное и ссылка на историю ───────────────────────────────────────────
  var q = new URLSearchParams(location.search);
  if (q.get("stories") === "reset") { try { localStorage.removeItem(SEEN_KEY); } catch (e) {} paintRow(); }

  // #story=<id>: открыть после входного ролика и гейта квалинвестора — поверх них
  // история не встаёт (z-index ниже), поэтому ждём, пока их не станет
  var m = location.hash.match(/^#story=([a-z]+)$/);
  if (m) {
    var want = m[1], tries = 0;
    (function waitFree() {
      var busy = document.querySelector(".qg-veil, .intro") || document.body.classList.contains("intro-lock") ||
        document.documentElement.classList.contains("qg-lock");
      if (!busy) {
        var i = -1; groups.forEach(function (g, k) { if (g.id === want) i = k; });
        if (i >= 0) open(i, row.children[i], false);
        else if (tries < 12) { tries++; setTimeout(waitFree, 500); }   // данные (дайджест) могли ещё не доехать
        return;
      }
      if (tries++ < 240) setTimeout(waitFree, 250);
    })();
  }
  }
})();
