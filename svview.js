/*
  Сводка рынка — общая отрисовка для страницы /svodka и вкладки «Рынок → Сводка» на главной
  (09.10.2026, «давай сфокусируемся на мобильной версии»). До этого вид жил двумя копиями —
  svBody() в tabs.js и render() в svodka.html — и они уже разошлись. Теперь вид один:
  правишь сводку — правь здесь, обе страницы получат правку вместе.

  SvView.html(d, o) — разметка по данным live/svodka.json. Свежесть данных проверяет
  вызывающий (при данных старше трёх суток он показывает свою заглушку).
  o.share   — подпись под кнопкой «Поделиться сводкой» (нет — кнопки нет);
  o.prod(tickers) → [{name, n}] — продукты витрины на бумаги новости (только главная);
  o.divProd(t)    → {name, n}  — то же для строки дивидендов.
  Переход к продуктам — ссылка с data-pq: главная перехватывает её и открывает «Продукты».

  Стили модуль вставляет сам (классы .sv-*). Переключатель «Россия / Мир» обрабатывается
  здесь же, выбор помнится до конца визита (sessionStorage so_sv_nw).
*/
(function () {
  "use strict";
  if (window.SvView) return;

  var CSS = [
    ".sv { --sv-card:#14161C; --sv-card2:#1B1E25; --sv-ink:#F2F3F7; --sv-mut:rgba(242,243,247,.64); --sv-faint:rgba(242,243,247,.56);",
    "  --sv-line:rgba(255,255,255,.08); --sv-up:#55C08A; --sv-dn:#E0705A; --sv-or:#EE7D1B; color: var(--sv-ink); }",
    ".sv-meta { margin: 6px 0 14px; font-size: 13.5px; color: var(--sv-mut); }",
    ".sv-meta b { font-weight: 500; color: var(--sv-ink); }",
    ".sv-meta.sv-old, .sv-meta.sv-old b { color: #E0A24A; }",
    ".sv-card { background: var(--sv-card); border-radius: 18px; padding: 14px 16px; }",
    ".sv-rb { display: block; font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--sv-or); }",
    /* Настроение — спидометр (вариант D, выбор Руслана 09.10.2026) */
    ".sv-gw { display: flex; align-items: center; gap: 14px; margin-top: 4px; }",
    ".sv-gs { flex: none; width: 148px; height: 86px; }",
    ".sv-gs text { font-family: 'Rubik', sans-serif; font-weight: 600; }",
    ".sv-gl { min-width: 0; }",
    ".sv-gl em { display: block; font-style: normal; font-family: 'Rubik', sans-serif; font-weight: 600; font-size: 22px; line-height: 1.15; }",
    ".sv-gl small { display: block; margin-top: 4px; font-size: 13.5px; line-height: 1.35; color: var(--sv-faint); }",
    /* Из чего складывается */
    ".sv-parts { margin-top: 2px; }",
    ".sv-parts summary { display: flex; align-items: center; gap: 6px; min-height: 44px; font-size: 14px; font-weight: 500; color: var(--sv-or); cursor: pointer; list-style: none; -webkit-tap-highlight-color: transparent; }",
    ".sv-parts summary::-webkit-details-marker { display: none; }",
    ".sv-parts summary::after { content: ''; width: 7px; height: 7px; margin-top: -3px; border: solid currentColor; border-width: 0 1.8px 1.8px 0; transform: rotate(45deg); transition: transform .2s; }",
    ".sv-parts[open] summary::after { margin-top: 3px; transform: rotate(-135deg); }",
    ".sv-part { display: grid; grid-template-columns: minmax(0, 1fr) 72px 26px; align-items: center; column-gap: 10px; padding: 8px 0; border-top: 1px solid var(--sv-line); }",
    ".sv-part > span:first-child { font-size: 14px; }",
    ".sv-part .sv-pb { height: 4px; border-radius: 2px; background: var(--sv-card2); overflow: hidden; }",
    ".sv-part .sv-pb i { display: block; height: 100%; border-radius: 2px; }",
    ".sv-part b { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 500; text-align: right; }",
    ".sv-part small { grid-column: 1 / -1; margin-top: 2px; font-size: 12.5px; line-height: 1.35; color: var(--sv-mut); }",
    ".sv-parts p { margin: 4px 0 10px; font-size: 12px; line-height: 1.45; color: var(--sv-faint); }",
    /* Изменение за день — плашкой */
    ".sv-pl { display: inline-block; padding: 2px 7px; border-radius: 7px; background: rgba(242,243,247,.08); color: var(--sv-mut); font-style: normal; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; font-weight: 500; white-space: nowrap; }",
    ".sv-pl.up { background: rgba(85,192,138,.14); color: #7FD3A7; }",
    ".sv-pl.dn { background: rgba(224,112,90,.15); color: #EE9A87; }",
    /* Котировки плитками: IMOEX, доллар, S&P 500, Nasdaq; ключевая ставка — полосой под ними */
    ".sv-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }",
    ".sv-tile { position: relative; min-width: 0; background: var(--sv-card); border-radius: 16px; padding: 12px 14px 13px; }",
    ".sv-tile > span { display: block; font-size: 13px; color: var(--sv-mut); }",
    ".sv-tile > b { display: block; margin: 4px 0 6px; font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 500; white-space: nowrap; }",
    ".sv-sp { position: absolute; top: 12px; right: 12px; display: block; width: 52px; height: 20px; }",
    ".sv-tile small { margin-left: 6px; font-size: 12px; color: var(--sv-faint); white-space: nowrap; }",
    ".sv-key { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; margin-top: 8px; padding: 12px 14px; background: var(--sv-card); border-radius: 16px; font-size: 14px; color: var(--sv-mut); }",
    ".sv-key b { font-family: 'JetBrains Mono', monospace; font-size: 17px; font-weight: 500; color: var(--sv-ink); }",
    ".sv-key small { margin-left: auto; font-size: 12.5px; color: var(--sv-faint); white-space: nowrap; }",
    /* Поделиться */
    ".sv-shr { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 60px; margin: 12px 0 0; padding: 10px 14px; border: 1px solid rgba(238,125,27,.32); border-radius: 14px; background: rgba(238,125,27,.07); color: var(--sv-ink); font-family: inherit; text-align: left; cursor: pointer; -webkit-tap-highlight-color: transparent; }",
    ".sv-shr:active { background: rgba(238,125,27,.15); }",
    "@media (hover: hover) { .sv-shr:hover { background: rgba(238,125,27,.12); } }",
    ".sv-shr .sv-ic { flex: none; width: 38px; height: 38px; display: grid; place-items: center; border-radius: 11px; background: var(--sv-or); color: #0C0A08; }",
    ".sv-shr .sv-tx { flex: 1; min-width: 0; }",
    ".sv-shr b { display: block; font-size: 15.5px; font-weight: 600; }",
    ".sv-shr small { display: block; margin-top: 2px; font-size: 13px; color: var(--sv-mut); }",
    ".sv-shr > svg { flex: none; color: var(--sv-faint); }",
    /* Разделы */
    ".sv-h { margin: 30px 0 4px; font-family: 'Rubik', sans-serif; font-size: 20px; font-weight: 600; line-height: 1.25; color: var(--sv-ink); }",
    ".sv-hs { margin: 0 0 6px; font-size: 13.5px; color: var(--sv-faint); }",
    ".sv-sw { display: flex; gap: 8px; margin: 10px 0 4px; }",
    ".sv-sw button { position: relative; display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px; border: 0; border-radius: 18px; background: var(--sv-card2); color: var(--sv-ink); font-family: inherit; font-size: 14px; font-weight: 500; cursor: pointer; -webkit-tap-highlight-color: transparent; }",
    ".sv-sw button::before { content: ''; position: absolute; inset: -4px 0; }",
    ".sv-sw button span { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; color: var(--sv-faint); }",
    ".sv-sw button[aria-pressed='true'] { background: var(--sv-ink); color: #0B0C10; }",
    ".sv-sw button[aria-pressed='true'] span { color: rgba(11,12,16,.6); }",
    /* Новости */
    ".sv-news { margin: 0; padding: 0; list-style: none; }",
    ".sv-news[hidden] { display: none; }",
    ".sv-news > li { padding: 12px 0 13px; border-bottom: 1px solid var(--sv-line); }",
    ".sv-news > li:last-child { border-bottom: 0; }",
    ".sv-nm { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--sv-faint); }",
    ".sv-tkc { padding: 1px 6px; border: 1px solid rgba(242,243,247,.16); border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--sv-mut); }",
    ".sv-nt { margin: 4px 0 0; font-size: 16px; line-height: 1.4; }",
    ".sv-np { position: relative; display: inline-flex; align-items: center; gap: 6px; min-height: 32px; margin-top: 6px; padding: 0 12px; border-radius: 16px; background: var(--sv-card2); color: var(--sv-or) !important; font-size: 13.5px; font-weight: 500; -webkit-tap-highlight-color: transparent; }",
    ".sv-np::before { content: ''; position: absolute; inset: -6px 0; }",
    ".sv-np + .sv-np { margin-left: 6px; }",
    /* Дивиденды */
    ".sv-dg { margin: 16px 0 0; padding: 0 0 8px; border-bottom: 1px solid var(--sv-line); }",
    ".sv-dg b { font-size: 14px; font-weight: 600; }",
    ".sv-dg b.sv-now { color: var(--sv-or); }",
    ".sv-dg b.sv-now::before { content: ''; display: inline-block; width: 7px; height: 7px; margin: 0 7px 1px 0; border-radius: 50%; background: var(--sv-or); }",
    ".sv-dg span { display: block; margin-top: 2px; font-size: 12.5px; color: var(--sv-faint); }",
    ".sv-dg b.sv-now + span { padding-left: 14px; }",
    ".sv-divs { margin: 0; padding: 0; list-style: none; }",
    ".sv-dr { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 7px 0; border-bottom: 1px solid var(--sv-line); -webkit-tap-highlight-color: transparent; }",
    ".sv-divs > li:last-child > .sv-dr { border-bottom: 0; }",
    ".sv-dn { flex: 1; min-width: 0; font-size: 15.5px; font-weight: 600; }",
    ".sv-dn small { display: block; margin-top: 2px; font-size: 13px; font-weight: 500; color: var(--sv-or); }",
    ".sv-df { flex: none; text-align: right; }",
    ".sv-df b { display: block; font-family: 'JetBrains Mono', monospace; font-size: 15.5px; font-weight: 500; }",
    ".sv-df small { display: block; font-size: 12px; color: var(--sv-faint); }",
    /* Оговорка и источники */
    ".sv-note { margin: 26px 0 0; font-size: 12.5px; line-height: 1.5; color: var(--sv-faint); }",
    ".sv-src summary { display: inline-flex; align-items: center; min-height: 44px; font-size: 13px; color: var(--sv-mut); cursor: pointer; list-style: none; }",
    ".sv-src summary::-webkit-details-marker { display: none; }",
    ".sv-src summary::after { content: ''; width: 6px; height: 6px; margin: -3px 0 0 8px; border: solid currentColor; border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); }",
    ".sv-src[open] summary::after { margin-top: 3px; transform: rotate(-135deg); }",
    ".sv-src p { margin: 0 0 6px; font-size: 12.5px; line-height: 1.5; color: var(--sv-faint); }",
    /* 320 px: «85,36 ₽» и «27 346» в плитках */
    "@media (max-width: 350px) { .sv-tile > b { font-size: 19px; } .sv-sp { width: 44px; }",
    "  .sv-gw { gap: 10px; } .sv-gs { width: 120px; height: 70px; } .sv-gl em { font-size: 19px; } }"
  ].join("\n");

  function inject() {
    if (document.getElementById("sv-css")) return;
    var st = document.createElement("style");
    st.id = "sv-css"; st.textContent = CSS;
    document.head.appendChild(st);
  }

  // Время и числа — по Москве, как в остальной витрине
  var TODAY = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  var MON = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  var WD = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  var WS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  var WV = ["в воскресенье", "в понедельник", "во вторник", "в среду", "в четверг", "в пятницу", "в субботу"];
  var ARROW = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7 H12 M8 3 L12 7 L8 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CHEV = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var SHARE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7.5 8.5 12 4l4.5 4.5"/><path d="M5 13.5v5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-5"/></svg>';

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fq(v) { var n = Math.round(Number(v) * 100) / 100; return String(n).replace(".", ","); }
  function grp(v, d) { return Number(v).toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function pct(v) { var n = Number(v); return isFinite(n) ? (n > 0 ? "+" : n < 0 ? "−" : "") + fq(Math.abs(n)) + "%" : ""; }
  function dm(iso) { var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "." + m[2] : ""; }
  function isoOf(s) { var m = String(s || "").match(/^(\d{2})\.(\d{2})\.(\d{4})$/); return m ? m[3] + "-" + m[2] + "-" + m[1] : ""; }
  function wday(iso) { var t = Date.parse(String(iso).slice(0, 10) + "T00:00:00Z"); return isFinite(t) ? new Date(t).getUTCDay() : -1; }
  function moodC(v, bar) { return v < 40 ? "#E0705A" : v < 60 ? (bar ? "rgba(242,243,247,.5)" : "#F2F3F7") : "#55C08A"; }
  function when(iso) {
    var s = String(iso || ""), dd = s.slice(0, 10), hm = s.slice(11, 16);
    if (dd === TODAY) return hm;
    var y = new Date(Date.parse(TODAY) - 864e5).toISOString().slice(0, 10);
    return (dd === y ? "вчера " : dm(dd) + " ") + hm;
  }
  function age(iso) { var t = Date.parse(iso || ""); return isFinite(t) ? (Date.now() - t) / 36e5 : Infinity; }
  function pill(v, flat) {
    var n = Number(v);
    if (!isFinite(n)) return "";
    return '<i class="sv-pl' + (flat ? "" : n > 0 ? " up" : n < 0 ? " dn" : "") + '">' + pct(n) + "</i>";
  }

  // Линия IMOEX за месяц в углу плитки: ряд закрытий плюс текущее значение (top.imoex.s, сервер
  // отдаёт с 09.10.2026). Нет ряда — нет линии
  function spark(s) {
    var a = (s || []).map(Number).filter(isFinite);
    if (a.length < 5) return "";
    var W = 62, H = 26, mn = Math.min.apply(null, a), mx = Math.max.apply(null, a), r = mx - mn || 1;
    var pts = a.map(function (v, i) { return [i * W / (a.length - 1), 2 + (H - 4) * (1 - (v - mn) / r)]; });
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    var c = a[a.length - 1] >= a[0] ? "#55C08A" : "#E0705A", e = pts[pts.length - 1];
    return '<svg class="sv-sp" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="' + line + " L" + W + " " + H + " L0 " + H + ' Z" fill="' + c + '" fill-opacity=".12"/>' +
      '<path d="' + line + '" fill="none" stroke="' + c + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      '<circle cx="' + e[0].toFixed(1) + '" cy="' + e[1].toFixed(1) + '" r="2.2" fill="' + c + '"/></svg>';
  }

  function meta(d) {
    var a = age(d.updated), s = String(d.updated || ""), dd = s.slice(0, 10), w = wday(dd);
    if (a > 6) return '<p class="sv-meta sv-old">Данные от <b>' + esc(dm(dd)) + ", " + esc(s.slice(11, 16)) + "</b> — сводка давно не обновлялась</p>";
    var day = w >= 0 ? WD[w].charAt(0).toUpperCase() + WD[w].slice(1) + ", " + Number(dd.slice(8, 10)) + " " + MON[Number(dd.slice(5, 7)) - 1] : "";
    return '<p class="sv-meta"><b>' + esc(day) + "</b> · обновлено в " + esc(s.slice(11, 16)) + "</p>";
  }

  function mood(m) {
    if (!(m && isFinite(m.score))) return "";
    var c = moodC(m.score), sc = Math.max(0, Math.min(100, Math.round(m.score)));
    // Спидометр: дуга от «страха» к «жадности», метка на значении, число в центре
    var th = Math.PI * (1 - sc / 100), x = 74 + 60 * Math.cos(th), y = 78 - 60 * Math.sin(th);
    var top = '<div class="sv-gw"><svg class="sv-gs" viewBox="0 0 148 86" aria-hidden="true">' +
        '<defs><linearGradient id="sv-gg" x1="0" x2="1"><stop offset="0" stop-color="#E0705A"/><stop offset=".5" stop-color="#F2F3F7" stop-opacity=".32"/><stop offset="1" stop-color="#55C08A"/></linearGradient></defs>' +
        '<path d="M14 78 A60 60 0 0 1 134 78" fill="none" stroke="url(#sv-gg)" stroke-width="11" stroke-linecap="round"/>' +
        '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="8" fill="#F2F3F7" stroke="#14161C" stroke-width="3"/>' +
        '<text x="74" y="76" text-anchor="middle" font-size="34" fill="' + c + '">' + sc + "</text></svg>" +
        '<div class="sv-gl"><em style="color:' + c + '">' + esc(m.label) + "</em><small>" + sc + " из 100 — от страха к жадности</small></div></div>";
    return '<section class="sv-card sv-mood" aria-label="Настроение рынка: ' + sc + " из 100, " + esc(m.label) + '"><span class="sv-rb">Настроение рынка</span>' + top +
      '<details class="sv-parts"><summary>Из чего складывается</summary>' + (m.parts || []).map(function (p) {
        var v = Math.max(0, Math.min(100, Number(p.v) || 0));
        return '<div class="sv-part"><span>' + esc(p.k) + '</span><span class="sv-pb" aria-hidden="true"><i style="width:' + v + "%;background:" + moodC(v, 1) + '"></i></span><b>' + v + "</b><small>" + esc(p.d) + "</small></div>";
      }).join("") + "<p>Сводный индекс из пяти частей, пересчитывается автоматически. Это не прогноз и не рекомендация.</p></details></section>";
  }

  // Котировки: плитки IMOEX, доллар, S&P 500, Nasdaq и полоса ключевой ставки. Дата торгов в
  // Нью-Йорке не совпадает с московским «сегодня» — под изменением «закрытие ДД.ММ»
  function quotes(d) {
    var t = d.top || {}, w = d.world || {}, tl = [];
    function tile(n, v, ch, flat, sp, sub) {
      return '<div class="sv-tile"><span>' + esc(n) + "</span>" + (sp ? spark(sp) : "") + "<b>" + v + "</b>" + pill(ch, flat) +
        (sub ? "<small>" + esc(sub) + "</small>" : "") + "</div>";
    }
    if (t.imoex && t.imoex.v) tl.push(tile("IMOEX", grp(t.imoex.v, 0), t.imoex.d, 0, t.imoex.s));
    // Доллар — без цвета: рост курса не «хорошо» и не «плохо»
    if (t.usd && t.usd.v) tl.push(tile("Доллар", grp(t.usd.v, 2) + " ₽", t.usd.d, 1));
    (w.idx || []).forEach(function (x) {
      if (!x || !x.v) return;
      var dd = String(x.date || "");
      tl.push(tile(x.k, grp(x.v, 0), x.d, 0, null, dd && dd !== TODAY ? "закрытие " + dm(dd) : ""));
    });
    var key = t.key && t.key.rate ? '<div class="sv-key"><span>Ключевая ставка</span><b>' + fq(t.key.rate) + "%</b>" +
      (t.key.next ? "<small>заседание " + esc(dm(t.key.next)) + "</small>" : "") + "</div>" : "";
    return (tl.length ? '<div class="sv-tiles" role="group" aria-label="Котировки">' + tl.join("") + "</div>" : "") + key;
  }

  function newsItem(n, o, en) {
    var tk = en ? [] : (n.tickers || []).slice(0, 2);
    var links = !en && o.prod ? (o.prod(n.tickers || []) || []).slice(0, 2).map(function (x) {
      return '<a class="sv-np" href="board.html?q=' + encodeURIComponent(x.name) + '" data-pq="' + esc(x.name) + '">Продукты на ' + esc(x.name) + " · " + x.n + ARROW + "</a>";
    }).join("") : "";
    return '<li><div class="sv-nm"><span>' + esc(when(n.time)) + "</span>" + tk.map(function (t) { return '<span class="sv-tkc">' + esc(t) + "</span>"; }).join("") +
      '</div><p class="sv-nt"' + (en ? ' lang="en"' : "") + ">" + esc(n.t) + "</p>" + (links ? "<div>" + links + "</div>" : "") + "</li>";
  }

  function news(d, o) {
    var ru = (d.news || []).filter(function (n) { return n.t; });
    var w = d.world || {};
    var en = age(w.updated) < 24 ? (w.news || []).filter(function (n) { return n.t; }) : [];
    if (!ru.length && !en.length) return "";
    var cur = "ru";
    try { cur = sessionStorage.getItem("so_sv_nw") === "en" ? "en" : "ru"; } catch (e) {}
    if (!ru.length) cur = "en";
    if (!en.length) cur = "ru";
    var sw = ru.length && en.length ? '<div class="sv-sw" role="group" aria-label="Чьи новости">' +
      '<button type="button" data-svsw="ru" aria-pressed="' + (cur === "ru") + '">Россия <span>' + ru.length + "</span></button>" +
      '<button type="button" data-svsw="en" aria-pressed="' + (cur === "en") + '">Мир <span>' + en.length + "</span></button></div>" : "";
    return '<section class="sv-nw"><h2 class="sv-h">Главное за сутки</h2>' + sw +
      (ru.length ? '<ul class="sv-news" data-svl="ru"' + (cur === "ru" ? "" : " hidden") + ">" + ru.map(function (n) { return newsItem(n, o, false); }).join("") + "</ul>" : "") +
      (en.length ? '<ul class="sv-news" data-svl="en"' + (cur === "en" ? "" : " hidden") + ">" + en.map(function (n) { return newsItem(n, o, true); }).join("") + "</ul>" : "") +
      "</section>";
  }

  // Дивиденды по дням: последний день покупки под отсечку — заголовком группы, а не в каждой строке
  function divs(d, o) {
    var list = d.divs || [];
    if (!list.length) return "";
    var groups = [], by = {};
    list.forEach(function (v) {
      var k = String(v.buy || "") + "|" + String(v.cut || "");
      if (!by[k]) { by[k] = { buy: isoOf(v.buy), cut: isoOf(v.cut), raw: v, rows: [] }; groups.push(by[k]); }
      by[k].rows.push(v);
    });
    var out = '<section class="sv-dv"><h2 class="sv-h">Дивиденды</h2><p class="sv-hs">Ближайшие отсечки по календарю</p>';
    groups.forEach(function (g) {
      var bw = wday(g.buy), cw = wday(g.cut), head;
      if (g.buy === TODAY) head = '<b class="sv-now">Последний день покупки — сегодня</b>';
      else if (g.buy && g.buy < TODAY) head = "<b>Последний день покупки прошёл, " + esc(dm(g.buy)) + "</b>";
      else head = "<b>Последний день покупки — " + (bw >= 0 ? WS[bw] + ", " : "") + esc(dm(g.buy) || String(g.raw.buy || "").slice(0, 5)) + "</b>";
      out += '<div class="sv-dg">' + head + "<span>отсечка " + (cw >= 0 ? WV[cw] + ", " : "") + esc(dm(g.cut) || String(g.raw.cut || "").slice(0, 5)) + "</span></div>";
      out += '<ul class="sv-divs">' + g.rows.map(function (v) {
        var x = o.divProd ? o.divProd(v.t) : null;
        var inner = '<span class="sv-dn">' + esc(v.n) + (x && x.n ? "<small>Продукты на " + esc(x.name) + " · " + x.n + "</small>" : "") + "</span>" +
          '<span class="sv-df"><b>' + grp(v.d, 2) + " ₽</b><small>" + (v.y != null ? fq(v.y) + "% к цене" : "на акцию") + "</small></span>";
        return "<li>" + (x && x.n ? '<a class="sv-dr" href="board.html?q=' + encodeURIComponent(x.name) + '" data-pq="' + esc(x.name) + '">' + inner + "</a>"
          : '<div class="sv-dr">' + inner + "</div>") + "</li>";
      }).join("") + "</ul>";
    });
    return out + "</section>";
  }

  function html(d, o) {
    inject();
    d = d || {}; o = o || {};
    var w = d.world || {}, wIdx = (w.idx || []).some(function (x) { return x && x.v; });
    var wNews = age(w.updated) < 24 && (w.news || []).some(function (n) { return n.t; });
    var out = meta(d) + mood(d.mood) + quotes(d);
    if (o.share) out += '<button type="button" class="sv-shr" data-svshare><span class="sv-ic">' + SHARE + '</span><span class="sv-tx"><b>Поделиться сводкой</b><small>' + esc(o.share) + "</small></span>" + CHEV + "</button>";
    out += news(d, o) + divs(d, o);
    out += '<p class="sv-note">Не является индивидуальной инвестиционной рекомендацией. Котировки Мосбиржи — с задержкой до 15 минут.</p>' +
      '<details class="sv-src"><summary>Источники и как собрана сводка</summary><p>Источники: ' + esc((d.src || []).join(", ")) + ". " +
      (wIdx ? "Мировые индексы — CNBC. " : "") + "Новости — заголовки публичных Telegram-каналов" + (wNews ? " и англоязычных деловых СМИ" : "") +
      ", отобраны и пересказаны автоматически. Индекс настроения считается по тону новостей, ширине рынка, импульсу IMOEX, волатильности и облигациям.</p></details>";
    return '<div class="sv">' + out + "</div>";
  }

  // «Россия / Мир» — переключение без перерисовки
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("[data-svsw]");
    if (!b) return;
    var box = b.closest(".sv-nw"), k = b.getAttribute("data-svsw");
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll("[data-svsw]"), function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
    Array.prototype.forEach.call(box.querySelectorAll("[data-svl]"), function (l) { l.hidden = l.getAttribute("data-svl") !== k; });
    try { sessionStorage.setItem("so_sv_nw", k); } catch (er) {}
  });

  window.SvView = { html: html };

})();
