/* Рынок структурных облигаций — дашборд для статьи «Рынок» в библиотеке (about.html).
   Данные — data/market.js (window.MARKET_STATS), генерируются make_market_stats.py.
   Модуль самодостаточный: сам внедряет стили, отдаёт HTML статьи и вешает обработчики.
   Графики — HTML/CSS столбики, не SVG: на 375px подписи остаются 11px, а не ужимаются
   вместе с viewBox. Анимация роста — через класс .grown на обёртке .pf, его ставит
   animate() страницы (тот же механизм, что у графиков выплат). */
(function () {
  "use strict";
  var D = window.MARKET_STATS || null;
  // Цвета групп: у банков близкие к фирменным (Сбер зелёный, ВТБ синий, Т-Банк
  // жёлтый), Румберг — акцентный оранжевый витрины; «прочие» и оценка ВПФИ —
  // нейтральные, чтобы не спорить с брендами
  var COLORS = { sber: "#5E9B82", vtb: "#4F86E6", alfa: "#E0705A", aton: "#46A9A0", tbank: "#E0A24A",
    rum: "#EE7D1B", other: "rgba(255,255,255,0.22)", vpfi: "rgba(255,255,255,0.35)" };
  // Срочность: один тон, шесть ступеней прозрачности — короткие светлее
  var TERM_ALPHA = [0.95, 0.78, 0.6, 0.44, 0.3, 0.18];
  var MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  var MONTHS_FULL = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  var MONTHS_IN = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];
  var MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  // Срез данных — из D.as_of: год со звёздочкой, число месяцев с данными и дата
  // словами. Раньше «2026», «9» и «по 8 сентября» были зашиты в семи местах и
  // разошлись бы с данными при следующем прогоне генератора
  var AS = (function () {
    var q = ((D && D.as_of) || "2026-09-08").split("-").map(Number);
    return { y: q[0], m: q[1], d: q[2], human: q[2] + " " + MONTHS_GEN[q[1] - 1], months: q[1] - 1 };
  })();
  // Тексты статьи — здесь, а не в about.html: их читают и Библиотека, и market.html
  var TEXT = {
    name: "Рынок структурных облигаций",
    tagline: "Сколько таких бумаг выпускается в России, кто их выпускает и как это менялось с 2020 года. Российское право, рубли по курсу ЦБ на дату размещения, открытые источники.",
    whenToUse: "Клиент спрашивает: «а это вообще большой рынок — и кто ещё так делает?» Здесь ответ цифрами: объём по годам, доли эмитентов и где среди них мы.",
    how: "В основе — открытые и доступные данные о российских выпусках с признаком структурного продукта: облигации банков и специализированных финансовых обществ (СФО) в российском праве. Год выпуска — по дате окончания размещения, объём — фактически размещённый номинал; валютные выпуски переведены в рубли по курсу ЦБ на дату размещения. Рынок разделён на две части: <b>розничные</b> выпуски — то, что продаётся клиентам через банки и брокеров (эмитент с узнаваемым брендом либо фабрика структурных продуктов), и <b>институциональные</b> — остаток до общего объёма рынка; в основном это единичные сделки СФО на десятки и сотни миллиардов, размещённые одному держателю. Общий объём рынка за 2022–2025 взят из сводной оценки, за остальные годы посчитан по выпускам.",
    risk: "Три оговорки. Данные за " + AS.y + " год — по " + AS.human + ", и в них есть выпуски, размещение которых ещё идёт: они учтены нулём. Объём внебиржевых производных (ВПФИ), в которых те же продукты оформляются вместо облигаций, никто не публикует — на графиках это оценка: пунктиром на объёмах, штриховкой в долях, от 3–5% рынка в 2024–2026 до 8–12% в 2020–2021. Разделение на розничные и институциональные — наша классификация."
  };

  var S = { mode: "market", vp: "mid", year: D ? D.years[D.years.length - 1].y : 2026, hl: null };

  var CSS = "\
.mk-nums{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin:4px 0 26px;border-top:1px solid var(--border-soft);padding-top:16px}\
.mk-nums .k{font-family:var(--f-mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}\
.mk-nums .v{font-family:var(--display);font-size:27px;font-weight:500;letter-spacing:-.02em;margin-top:6px;line-height:1.1}\
.mk-nums .v small{font-family:var(--f-mono);font-size:12px;font-weight:400;color:var(--faint);letter-spacing:0;margin-left:4px}\
.mk-nums .d{font-size:12.5px;line-height:1.5;color:var(--hushed);margin-top:6px;text-wrap:pretty}\
.mk-wide{margin-bottom:22px}\
.mk-wide .prot-ctrls{margin-bottom:10px;justify-content:space-between;align-items:flex-end}\
.mk-h{font-family:var(--f-mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin-bottom:10px}\
.mk-h b{color:var(--ink);font-weight:500;letter-spacing:0;text-transform:none;font-family:var(--f-body);font-size:14px;margin-left:8px}\
.mch{margin-top:6px}\
.mch-cols{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;align-items:end}\
.mch-col{display:flex;flex-direction:column;min-width:0;border-radius:8px;padding:4px 3px 6px;transition:background .18s}\
.mch-col.pick{cursor:pointer}\
.mch-col.pick:hover{background:rgba(255,255,255,.04)}\
.mch-col.on{background:rgba(238,125,27,.1);box-shadow:inset 0 0 0 1px rgba(238,125,27,.35)}\
.mch-val{font-family:var(--f-mono);font-size:11px;color:var(--ink);text-align:center;white-space:nowrap;margin-bottom:5px}\
.mch-val small{color:var(--faint);font-size:11px}\
.mch-stack{height:176px;display:flex;flex-direction:column;justify-content:flex-end;gap:1px}\
.mch-stack .bs{display:block;width:100%;border-radius:3px;transform-origin:bottom;transform:scaleY(0);transition:transform .8s var(--ease),opacity .2s}\
.pf.grown .mch-stack .bs{transform:scaleY(1)}\
.mch-stack .mk{background:#E7E9F0}\
.mch-stack .nm{background:rgba(255,255,255,.22)}\
.mch-stack .vp{border:1px dashed rgba(255,255,255,.5);box-sizing:border-box}\
.mch-x{font-family:var(--f-mono);font-size:11px;color:var(--faint);text-align:center;margin-top:7px;white-space:nowrap}\
.mch-x b{color:var(--hushed);font-weight:500}\
.mch-col.on .mch-x{color:var(--solar)}\
.mch-share .mch-stack{height:196px;gap:2px}\
.mch-share .bs{background:var(--gc)}\
.mch-share[data-hl] .bs{opacity:.18}\
.mch-share[data-hl] .bs.hl{opacity:1}\
.mch-share .bs.est{background:repeating-linear-gradient(135deg,rgba(255,255,255,.55) 0 2px,transparent 2px 6px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}\
.lgi .sw.est{background:repeating-linear-gradient(135deg,rgba(255,255,255,.6) 0 2px,transparent 2px 5px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}\
.lgnd.mk{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 18px;margin-top:14px}\
.lgnd.mk .lgi{cursor:default;padding:3px 6px;margin:0 -6px;border-radius:6px;transition:background .15s}\
.lgnd.mk .lgi:hover,.lgnd.mk .lgi.on{background:rgba(255,255,255,.06)}\
.lgi .sw{flex:none;width:10px;height:10px;border-radius:3px;background:var(--lc);position:relative;top:1px}\
.lgi .pc{font-family:var(--f-mono);font-size:11px;color:var(--faint);margin-left:auto;white-space:nowrap}\
.mk-year{display:grid;grid-template-columns:1.1fr 1fr;gap:28px;align-items:start;margin-top:14px}\
.mk-chips{display:flex;flex-wrap:wrap;gap:6px}\
.mk-chips button{font-family:var(--f-mono);font-size:12.5px;color:var(--hushed);background:rgba(255,255,255,.06);border:1px solid transparent;border-radius:8px;padding:6px 11px;cursor:pointer;transition:background .15s,color .15s}\
.mk-chips button:hover{background:rgba(255,255,255,.1);color:var(--ink)}\
.mk-chips button.on{background:rgba(238,125,27,.16);color:var(--solar);border-color:rgba(238,125,27,.4);font-weight:600}\
.mk-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:12px 14px;margin:16px 0 4px}\
.mk-kpi .k{font-family:var(--f-mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}\
.mk-kpi .v{font-family:var(--f-mono);font-size:17px;color:var(--ink);margin-top:3px}\
.mk-kpi .v small{font-size:11px;color:var(--faint);margin-left:3px}\
.mch-m .mch-cols{grid-template-columns:repeat(12,minmax(0,1fr));gap:4px}\
.mch-m .mch-stack{height:120px}\
.mch-m .mch-val{font-size:11px;color:var(--hushed)}\
.mch-m .mch-x{font-size:11px;margin-top:5px;letter-spacing:-.02em}\
.hb{display:grid;gap:7px}\
.hb-row{display:grid;grid-template-columns:minmax(0,150px) 1fr 62px;gap:10px;align-items:center;font-size:12.5px;color:var(--hushed)}\
.hb-row .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.hb-row .nm.ours{color:var(--solar);font-weight:600}\
.hb-row .tr{height:12px;background:rgba(255,255,255,.05);border-radius:3px;overflow:hidden}\
.hb-row .tr i{display:block;height:100%;border-radius:3px;background:var(--gc);transform-origin:left;transform:scaleX(0);transition:transform .8s var(--ease)}\
.pf.grown .hb-row .tr i{transform:scaleX(1)}\
.hb-row .vl{font-family:var(--f-mono);font-size:11.5px;color:var(--ink);text-align:right;white-space:nowrap}\
.hb-row .vl small{color:var(--faint);font-size:11px}\
.sb{margin-top:18px}\
.sb .k{font-family:var(--f-mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin-bottom:7px;display:flex;justify-content:space-between}\
.sb .k span{letter-spacing:0;text-transform:none;font-family:var(--f-body);font-size:12px}\
.sb-bar{display:flex;height:14px;border-radius:4px;overflow:hidden;background:rgba(255,255,255,.05);gap:1px}\
.sb-bar i{display:block;height:100%;background:var(--gc)}\
.sb-lg{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:7px;font-size:12px;color:var(--hushed)}\
.sb-lg span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}\
.sb-lg i{width:9px;height:9px;border-radius:2px;background:var(--gc)}\
.sb-lg b{font-family:var(--f-mono);font-weight:400;color:var(--faint);font-size:11px}\
.tl{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin-top:6px}\
.tl-y{min-width:0}\
.tl-bars{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:1px;height:130px;align-items:end;border-bottom:1px solid var(--border);padding:0 1px}\
.tl-bars i{display:block;background:#E7E9F0;border-radius:1px 1px 0 0;min-height:1px;transform-origin:bottom;transform:scaleY(0);transition:transform .8s var(--ease)}\
.tl-bars i.na{background:transparent;border:1px dashed rgba(255,255,255,.16);border-bottom:none;min-height:0;height:30%!important}\
.tl-bars i:hover{background:var(--solar)}\
.pf.grown .tl-bars i{transform:scaleY(1)}\
.tl-x{font-family:var(--f-mono);font-size:11px;color:var(--faint);text-align:center;margin-top:6px}\
.tl-x b{color:var(--hushed);font-weight:500}\
.mk-tbl{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}\
.mk-tbl td{padding:8px 0;border-bottom:1px solid var(--border-soft);color:var(--hushed);vertical-align:top;line-height:1.4}\
.mk-tbl td.y{font-family:var(--f-mono);font-size:11.5px;color:var(--faint);width:44px;padding-top:10px}\
.mk-tbl td.v{font-family:var(--f-mono);color:var(--ink);text-align:right;white-space:nowrap;width:86px}\
.mk-tbl td.v small{color:var(--faint);font-size:11px}\
.mk-tbl .rb{display:block;height:3px;background:rgba(255,255,255,.14);border-radius:2px;margin-top:6px}\
.mk-tbl .rb i{display:block;height:100%;background:rgba(255,255,255,.55);border-radius:2px;transform-origin:left;transform:scaleX(0);transition:transform .8s var(--ease)}\
.pf.grown .mk-tbl .rb i{transform:scaleX(1)}\
.mk-red{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:6px}\
.mk-red .v{font-family:var(--f-mono);font-size:17px;color:var(--ink)}\
.mk-red .k{font-size:12px;color:var(--hushed);line-height:1.45;margin-top:3px}\
.mk-vp{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-end}\
@media (max-width:960px){.mk-nums{grid-template-columns:1fr 1fr}.mk-year{grid-template-columns:1fr}.lgnd.mk{grid-template-columns:1fr 1fr}.mk-kpi{grid-template-columns:1fr 1fr}.tl{grid-template-columns:repeat(4,minmax(0,1fr))}.tl-bars{height:90px}.hb-row{grid-template-columns:minmax(0,120px) 1fr 62px}}\
@media (max-width:520px){.mch-cols{gap:5px}#mk-vol .mch-val small{display:none}.mch-val{font-size:11px}.mk-nums .v{font-size:23px}.lgnd.mk{grid-template-columns:1fr}.tl{grid-template-columns:repeat(2,minmax(0,1fr))}.mch-m .mch-val{display:none}.mk-red{grid-template-columns:1fr}}\
.mk-shifts{margin:2px 0 24px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:18px 0 8px}\
.mk-shifts .sh-head{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 16px;margin:0}\
.mk-shifts .sh-title{margin:0;font-family:var(--display);font-size:22px;font-weight:500;letter-spacing:-.024em;line-height:1.14;color:var(--ink)}\
.mk-shifts .sh-note{margin:0;font-family:var(--f-mono);font-size:11.5px;line-height:1.45;color:var(--faint)}\
.mk-shifts .sh-list{list-style:none;counter-reset:sh;margin:12px 0 0;padding:0}\
.mk-shifts .sh-row{counter-increment:sh;display:grid;grid-template-columns:64px minmax(0,.72fr) minmax(0,1.68fr);gap:0 26px;padding:18px 0 20px}\
.mk-shifts .sh-row+.sh-row{border-top:1px solid var(--border-soft)}\
.mk-shifts .sh-row::before{content:counter(sh,decimal-leading-zero);grid-column:1;grid-row:1;align-self:start;margin-top:1px;width:42px;padding-bottom:8px;border-bottom:2px solid var(--fc);font-family:var(--f-mono);font-size:30px;font-weight:500;line-height:1;letter-spacing:-.03em;color:var(--ink);font-variant-numeric:tabular-nums}\
.mk-shifts .sh-say{grid-column:2;grid-row:1;min-width:0}\
.mk-shifts .sh-t{margin:0;font-family:var(--display);font-size:17.5px;font-weight:600;line-height:1.26;letter-spacing:-.018em;color:var(--ink);text-wrap:balance}\
.mk-shifts .sh-kick{margin:7px 0 0;font-family:var(--f-mono);font-size:11.5px;line-height:1.4;color:var(--fc)}\
.mk-shifts .sh-d{grid-column:3;grid-row:1;margin:0;font-size:14px;line-height:1.58;color:var(--hushed);text-wrap:pretty;min-width:0}\
@media (max-width:960px){.mk-shifts .sh-row{grid-template-columns:52px minmax(0,1fr);gap:0 18px;padding:16px 0 18px}.mk-shifts .sh-d{grid-column:2;grid-row:2;margin-top:10px}.mk-shifts .sh-row::before{font-size:25px;width:36px;padding-bottom:7px;margin-top:2px}.mk-shifts .sh-title{font-size:21px}}\
@media (max-width:520px){.mk-shifts{padding-top:16px}.mk-shifts .sh-row{grid-template-columns:38px minmax(0,1fr);gap:0 14px;padding:15px 0 17px}.mk-shifts .sh-row::before{font-size:21px;width:28px;padding-bottom:6px;margin-top:2px}.mk-shifts .sh-t{font-size:16px}.mk-shifts .sh-kick{font-size:11px;margin-top:6px}.mk-shifts .sh-d{grid-column:1/-1;font-size:13.5px;margin-top:11px}.mk-shifts .sh-title{font-size:19.5px}.mk-shifts .sh-note{font-size:11px}}\
";
  function injectCSS() {
    if (document.getElementById("mk-css")) return;
    var st = document.createElement("style"); st.id = "mk-css"; st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ── форматирование ──
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function grp(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function dec(v, d) { return v.toFixed(d).replace(".", ","); }
  // млрд ₽ с разрядным пробелом; от тысячи — триллионы
  function fmtB(v) {
    if (v >= 1000) return dec(v / 1000, 1) + " трлн";
    if (v >= 100) return grp(Math.round(v)) + " млрд";
    if (v >= 10) return dec(v, 1) + " млрд";
    if (v >= 1) return dec(v, 2) + " млрд";
    return grp(Math.round(v * 1000)) + " млн";
  }
  function fmtPc(p) { return (p < 10 ? dec(p, 1) : Math.round(p)) + "%"; }
  function fmtTerm(days) {
    if (days == null) return "—";
    if (days < 365) return Math.round(days / 30.4) + " мес";
    return dec(days / 365.25, 1) + " г.";
  }
  function yl(y) { return y === AS.y ? "<b>" + y + "</b>*" : String(y); }
  function last() { return D.years[D.years.length - 1]; }
  function yearOf(y) { for (var i = 0; i < D.years.length; i++) if (D.years[i].y === y) return D.years[i]; return last(); }
  function vpOf(r) { return S.vp === "none" ? 0 : S.vp === "low" ? r.vpfi[0] : S.vp === "high" ? r.vpfi[1] : (r.vpfi[0] + r.vpfi[1]) / 2; }
  function segBtns(id, opts, cur, label) {
    return '<div class="ctrl"><div class="k">' + label + '</div><div class="seg" id="' + id + '" role="group" aria-label="' + label + '">' +
      opts.map(function (o) { var on = o[0] === cur; return '<button data-v="' + o[0] + '" aria-pressed="' + on + '"' + (on ? ' class="on"' : '') + '>' + o[1] + '</button>'; }).join("") +
    '</div></div>';
  }

  // ── A. четыре числа ──
  function numsHTML() {
    var ys = D.years, n = 0, tot = 0, mk = 0;
    ys.forEach(function (r) { n += r.n; tot += r.total; mk += r.market; });
    var L = last(), P = ys[ys.length - 2], sum = 0;
    D.groups.forEach(function (g) { sum += L.groups[g.key] || 0; });
    // именованные группы по убыванию — тройка и место Румберга считаются, не зашиты
    var named = D.groups.filter(function (g) { return g.key !== "other" && g.key !== "vpfi"; })
      .map(function (g) { return { g: g, v: L.groups[g.key] || 0 }; })
      .sort(function (a, b) { return b.v - a.v; });
    var top3 = named.slice(0, 3), top3v = top3.reduce(function (a, x) { return a + x.v; }, 0);
    var rum = L.groups.rum || 0, rank = named.filter(function (x) { return x.v > rum; }).length + 1;
    return '<div class="mk-nums">' +
      '<div><div class="k">Выпусков за ' + ys[0].y + '–' + L.y + '</div><div class="v">' + grp(n) + '</div><div class="d">' + fmtB(tot) + ' ₽ номинала, из них розничных ' + fmtB(mk) + ' ₽</div></div>' +
      '<div><div class="k">Розничных в ' + L.y + '</div><div class="v">' + fmtB(L.market) + '<small>₽</small></div><div class="d">' + grp(L.n_market) + ' выпусков за ' + AS.months + ' месяцев — ' + Math.round(L.n_market / P.n_market * 100) + '% от числа выпусков за весь ' + P.y + ' год</div></div>' +
      '<div><div class="k">Три крупнейших</div><div class="v">' + Math.round(top3v / sum * 100) + '<small>%</small></div><div class="d">' + top3.map(function (x) { return x.g.label; }).join(", ") + ' — доля в розничном сегменте ' + L.y + ' года вместе с оценкой ВПФИ</div></div>' +
      '<div><div class="k">Румберг в ' + L.y + '</div><div class="v">' + fmtB(rum) + '<small>₽</small></div><div class="d">' + dec(rum / sum * 100, 1) + '% розничного сегмента, ' + rank + '-е место среди эмитентов</div></div>' +
    '</div>';
  }

  // ── B. объём по годам ──
  function volBarsHTML() {
    var ys = D.years, all = S.mode === "all";
    var max = Math.max.apply(null, ys.map(function (r) { return (all ? r.total : r.market) + vpOf(r); })) || 1;
    return '<div class="mch"><div class="mch-cols">' + ys.map(function (r) {
      var vp = vpOf(r), mk = r.market / max * 100, nm = all ? r.nonmarket / max * 100 : 0, vh = vp / max * 100;
      var head = all ? r.total : r.market;
      var title = r.y + ": розничные " + fmtB(r.market) + " ₽" + (all ? ", институциональные " + fmtB(r.nonmarket) + " ₽" : "") +
        "; ВПФИ (оценка) " + fmtB(r.vpfi[0]) + "–" + fmtB(r.vpfi[1]) + " ₽. Нажмите — год крупным планом";
      return '<div class="mch-col pick' + (r.y === S.year ? ' on' : '') + '" data-y="' + r.y + '" role="button" tabindex="0" title="' + esc(title) + '">' +
        '<div class="mch-val">' + grp(Math.round(head)) + (vp ? '<small> +' + Math.round(vp) + '</small>' : '') + '</div>' +
        '<div class="mch-stack">' +
          (vh > 0 ? '<i class="bs vp" style="height:' + vh.toFixed(2) + '%"></i>' : '') +
          (nm > 0 ? '<i class="bs nm" style="height:' + nm.toFixed(2) + '%"></i>' : '') +
          '<i class="bs mk" style="height:' + mk.toFixed(2) + '%"></i>' +
        '</div><div class="mch-x">' + yl(r.y) + '</div></div>';
    }).join("") + '</div></div>';
  }
  function volCap() {
    var ys = D.years, L = last();
    var low = ys.reduce(function (a, r) { return r.market < a.market ? r : a; }, ys[0]);
    var hi = ys.filter(function (r) { return r.y < L.y; }).reduce(function (a, r) { return r.market > a.market ? r : a; }, ys[0]);
    var vpTxt = S.vp === "none" ? "" : " Пунктиром сверху — оценка того же продукта в форме внебиржевых производных (ВПФИ, " +
      (S.vp === "low" ? "нижняя граница вилки" : S.vp === "high" ? "верхняя граница вилки" : "середина вилки") + "): статистики по ним нет, доля взята " +
      L.vpfi_share[0] + "–" + L.vpfi_share[1] + "% для последних лет и до " + ys[0].vpfi_share[1] + "% для 2020–2021, когда такие сделки шли через иностранные банки.";
    if (S.mode === "all") {
      var big = ys.reduce(function (a, r) { return (r.nonmarket / r.total) > (a.nonmarket / a.total) ? r : a; }, ys[0]);
      return "Светлое — розничные выпуски, тёмное — институциональные: остаток до общего объёма рынка, в основном единичные сделки СФО, размещённые одному держателю. С розничными выпусками они не конкурируют, зато по объёму несопоставимы: в " +
        big.y + " году на них пришлось " + fmtPc(big.nonmarket / big.total * 100) + " всего рынка. Динамику розницы читают по светлой части. Общий объём за 2022–2025 — по сводной оценке рынка, за остальные годы — по выпускам." + vpTxt;
    }
    return "Только то, что продаётся клиентам через банки и брокеров, в российском праве. Дно — " + low.y + " год, " + fmtB(low.market) + " ₽; к " + hi.y + " году объём вырос в " +
      dec(hi.market / low.market, 1) + " раза. За неполный " + L.y + " год (по " + AS.human + ") уже " + fmtB(L.market) + " ₽." + vpTxt;
  }
  function volHTML(fc) {
    return '<div class="viz mk-wide" style="--fc:' + fc + '">' +
      '<div class="prot-ctrls">' +
        segBtns("seg-mkt", [["market", "розничные"], ["all", "весь рынок"]], S.mode, "Объём выпусков, млрд ₽") +
        segBtns("seg-vp", [["none", "скрыть"], ["low", "ниже"], ["mid", "база"], ["high", "выше"]], S.vp, "Оценка ВПФИ") +
      '</div>' +
      '<div class="pf" id="mk-vol">' + volBarsHTML() + '</div>' +
      '<div class="pf-cap" id="mk-volcap">' + volCap() + '</div>' +
    '</div>';
  }

  // ── C. год крупным планом ──
  function chipsHTML() {
    return '<div class="mk-chips" id="mk-chips" role="tablist" aria-label="Год">' + D.years.map(function (r) {
      return '<button role="tab" data-y="' + r.y + '" aria-selected="' + (r.y === S.year) + '"' + (r.y === S.year ? ' class="on"' : '') + '>' + r.y + (r.y === AS.y ? "*" : "") + '</button>';
    }).join("") + '</div>';
  }
  function monthsHTML(r) {
    var max = Math.max.apply(null, r.months) || 1, lastM = r.y === AS.y ? AS.m : 12;
    return '<div class="mch mch-m"><div class="mch-cols">' + r.months.map(function (v, i) {
      var na = i >= lastM;
      return '<div class="mch-col" title="' + MONTHS[i] + " " + r.y + ": " + (na ? "нет данных" : fmtB(v) + " ₽, " + r.months_n[i] + " вып.") + '">' +
        '<div class="mch-val">' + (na ? "" : v >= 1 ? Math.round(v) : dec(v, 1)) + '</div>' +
        '<div class="mch-stack"><i class="bs mk" style="height:' + (na ? 0 : Math.max(v / max * 100, v > 0 ? 1.5 : 0)).toFixed(2) + '%"></i></div>' +
        '<div class="mch-x">' + MONTHS[i] + '</div></div>';
    }).join("") + '</div></div>';
  }
  function kpiHTML(r) {
    var kp = function (k, v, s) { return '<div><div class="k">' + k + '</div><div class="v">' + v + (s ? '<small> ' + s + '</small>' : '') + '</div></div>'; };
    return '<div class="mk-kpi">' +
      kp("Выпусков", grp(r.n_market)) +
      kp("Эмитентов", r.issuers) +
      kp("Медиана срока", fmtTerm(r.median_term)) +
      kp("Средний выпуск", grp(r.avg_size), "млн ₽") +
      kp("Доля топ-3", fmtPc(r.top3)) +
      kp("Для неквалов", fmtPc(r.n_market ? r.unqual_n / r.n_market * 100 : 0), "выпусков") +
      kp("Дисконтных", fmtPc(r.n_market ? r.zero_n / r.n_market * 100 : 0), "выпусков") +
      kp("С листингом", fmtPc(r.n_market ? r.listed_n / r.n_market * 100 : 0), "выпусков") +
    '</div>';
  }
  function rankHTML(r) {
    var rows = r.ranking.slice(0, 10), max = rows.length ? rows[0].vol : 1;
    return '<div class="hb">' + rows.map(function (x) {
      var ours = x.group === "rum";
      return '<div class="hb-row" title="' + esc(x.name) + ": " + fmtB(x.vol) + " ₽, " + x.n + " вып." + '">' +
        '<span class="nm' + (ours ? ' ours' : '') + '">' + esc(x.name) + '</span>' +
        '<span class="tr"><i style="--gc:' + (COLORS[x.group] || COLORS.other) + ';width:' + (x.vol / max * 100).toFixed(1) + '%"></i></span>' +
        '<span class="vl">' + (x.vol >= 10 ? Math.round(x.vol) : dec(x.vol, 1)) + '<small> · ' + x.n + '</small></span></div>';
    }).join("") + '</div>';
  }
  function stackHTML(title, note, parts) {
    // parts: [{label, v, color}] → полоса долей + легенда
    var sum = parts.reduce(function (a, p) { return a + p.v; }, 0) || 1;
    var vis = parts.filter(function (p) { return p.v > 0; });
    return '<div class="sb"><div class="k">' + title + (note ? '<span>' + note + '</span>' : '') + '</div>' +
      '<div class="sb-bar">' + vis.map(function (p) { return '<i style="--gc:' + p.color + ';width:' + (p.v / sum * 100).toFixed(2) + '%" title="' + esc(p.label) + ": " + fmtPc(p.v / sum * 100) + '"></i>'; }).join("") + '</div>' +
      '<div class="sb-lg">' + vis.map(function (p) { return '<span><i style="--gc:' + p.color + '"></i>' + esc(p.label) + ' <b>' + fmtPc(p.v / sum * 100) + '</b></span>'; }).join("") + '</div></div>';
  }
  var CUR_COLORS = { RUB: "#E7E9F0", CNY: "#E0705A", USD: "#5E9B82", EUR: "#4F86E6", GBP: "#8E7CC3" };
  function yearPanelHTML(r) {
    var terms = D.term_buckets.map(function (b, i) { return { label: b, v: r.terms[b] || 0, color: "rgba(231,233,240," + TERM_ALPHA[i] + ")" }; });
    var curs = r.currencies.map(function (c) { return { label: c.cur + " · " + c.n + " вып.", v: c.vol, color: CUR_COLORS[c.cur] || "#8A93A6" }; });
    return '<div class="mk-year">' +
      '<div><div class="mk-h">По месяцам <b>' + fmtB(r.market) + ' ₽ розничных' + (r.y === AS.y ? ' · по ' + AS.human : '') + '</b></div>' +
        '<div class="pf">' + monthsHTML(r) + '</div>' + kpiHTML(r) + '</div>' +
      '<div><div class="mk-h">Эмитенты розничного сегмента <b>млрд ₽ · выпусков</b></div>' +
        '<div class="pf">' + rankHTML(r) + '</div>' +
        stackHTML("Валюта номинала", "по объёму", curs) +
        stackHTML("Срок до погашения", "по объёму", terms) +
      '</div>' +
    '</div>';
  }
  function yearHTML(fc) {
    return '<div class="viz mk-wide" style="--fc:' + fc + '">' +
      '<div class="prot-ctrls"><div class="ctrl"><div class="k">Год крупным планом</div>' + chipsHTML() + '</div></div>' +
      '<div id="mk-year">' + yearPanelHTML(yearOf(S.year)) + '</div>' +
    '</div>';
  }

  // ── D. доли эмитентов ──
  function shareBarsHTML() {
    var keys = D.groups.map(function (g) { return g.key; }), label = {}, est = {};
    D.groups.forEach(function (g) { label[g.key] = g.label; est[g.key] = !!g.estimate; });
    return '<div class="mch mch-share" id="mk-share"><div class="mch-cols">' + D.years.map(function (r) {
      var sum = 0; keys.forEach(function (k) { sum += r.groups[k] || 0; });
      var segs = keys.slice().reverse().map(function (k) {
        var v = r.groups[k] || 0; if (v <= 0) return "";
        var pc = v / sum * 100;
        return '<i class="bs g-' + k + (est[k] ? ' est' : '') + '" style="--gc:' + COLORS[k] + ';height:' + pc.toFixed(2) + '%" title="' + esc(label[k]) + " · " + r.y + ": " + fmtB(v) + " ₽ · " + fmtPc(pc) + '"></i>';
      }).join("");
      return '<div class="mch-col"><div class="mch-val" data-y="' + r.y + '">&nbsp;</div><div class="mch-stack">' + segs + '</div><div class="mch-x">' + yl(r.y) + '</div></div>';
    }).join("") + '</div></div>';
  }
  function shareLegendHTML() {
    var L = last(), sum = 0;
    D.groups.forEach(function (g) { sum += L.groups[g.key] || 0; });
    return '<div class="lgnd mk" id="mk-lg">' + D.groups.map(function (g) {
      var v = L.groups[g.key] || 0;
      return '<div class="lgi" data-g="' + g.key + '" style="--lc:' + COLORS[g.key] + '" tabindex="0"><i class="sw' + (g.estimate ? ' est' : '') + '" aria-hidden="true"></i><span><b>' + esc(g.label) + '</b></span>' +
        '<span class="pc">' + (v > 0 ? fmtPc(v / sum * 100) : "—") + '</span></div>';
    }).join("") + '</div>';
  }
  function shareHTML(fc) {
    return '<div class="viz mk-wide" style="--fc:' + fc + '">' +
      '<div class="mk-h">Доли эмитентов в розничном сегменте <b>каждый столбик — 100% года, включая оценку ВПФИ</b></div>' +
      '<div class="pf">' + shareBarsHTML() + '</div>' + shareLegendHTML() +
      '<div class="pf-cap">В легенде — доля за ' + last().y + ' год. Наведите на группу, чтобы увидеть её долю в каждом году. Штриховкой — оценка ВПФИ: она входит в знаменатель каждого года. Румберг учтён вместе с выпусками СФО Теллуриум.</div>' +
    '</div>';
  }

  // ── E. месяц за месяцем ──
  function timelineHTML(fc) {
    var max = 0;
    D.years.forEach(function (r) { r.months.forEach(function (v) { if (v > max) max = v; }); });
    var peak = null;
    D.years.forEach(function (r) { r.months.forEach(function (v, i) { if (!peak || v > peak.v) peak = { v: v, y: r.y, i: i }; }); });
    var zero = [];
    D.years.forEach(function (r) { r.months.forEach(function (v, i) { if (v < 1 && !(r.y === AS.y && i >= AS.m)) zero.push(MONTHS[i] + " " + r.y); }); });
    return '<div class="viz mk-wide" style="--fc:' + fc + '">' +
      '<div class="mk-h">Месяц за месяцем <b>розничные выпуски, млрд ₽</b></div>' +
      '<div class="pf"><div class="tl">' + D.years.map(function (r) {
        return '<div class="tl-y"><div class="tl-bars">' + r.months.map(function (v, i) {
          var na = r.y === AS.y && i >= AS.m;
          return '<i' + (na ? ' class="na"' : '') + ' style="height:' + (na ? 0 : Math.max(v / max * 100, v > 0 ? 1 : 0)).toFixed(2) + '%" title="' + MONTHS[i] + " " + r.y + ": " + (na ? "нет данных" : fmtB(v) + " ₽, " + r.months_n[i] + " вып.") + '"></i>';
        }).join("") + '</div><div class="tl-x">' + yl(r.y) + '</div></div>';
      }).join("") + '</div></div>' +
      '<div class="pf-cap">Все месяцы с января ' + D.years[0].y + ' года на одной шкале. Пик — ' + MONTHS[peak.i] + ' ' + peak.y + ', ' + fmtB(peak.v) + ' ₽.' +
        (zero.length ? ' Месяцы почти без выпусков: ' + zero.join(", ") + '.' : '') +
        ' Пунктир — месяцы, по которым данных ещё нет.</div>' +
    '</div>';
  }

  // ── F. срочность по годам ──
  function termsHTML(fc) {
    var B = D.term_buckets;
    return '<div class="viz mk-wide" style="--fc:' + fc + '">' +
      '<div class="mk-h">Срок до погашения <b>доля объёма по срокам, медиана под столбиком</b></div>' +
      '<div class="pf"><div class="mch mch-share"><div class="mch-cols">' + D.years.map(function (r) {
        var sum = 0; B.forEach(function (b) { sum += r.terms[b] || 0; });
        var segs = B.map(function (b, i) {
          var v = r.terms[b] || 0; if (v <= 0 || !sum) return "";
          return '<i class="bs" style="--gc:rgba(231,233,240,' + TERM_ALPHA[i] + ');height:' + (v / sum * 100).toFixed(2) + '%" title="' + b + " · " + r.y + ": " + fmtPc(v / sum * 100) + '"></i>';
        }).reverse().join("");   // первый элемент flex-колонки оказывается сверху — разворачиваем, чтобы короткие были внизу
        return '<div class="mch-col"><div class="mch-val">' + fmtTerm(r.median_term) + '</div><div class="mch-stack">' + segs + '</div><div class="mch-x">' + yl(r.y) + '</div></div>';
      }).join("") + '</div></div></div>' +
      '<div class="sb-lg" style="margin-top:12px">' + B.map(function (b, i) { return '<span><i style="--gc:rgba(231,233,240,' + TERM_ALPHA[i] + ')"></i>' + b + '</span>'; }).join("") + '</div>' +
      '<div class="pf-cap">Светлое снизу — короткие выпуски. Медиана срока сжалась с ' + fmtTerm(D.years[0].median_term) + ' в ' + D.years[0].y + ' году до ' + fmtTerm(last().median_term) + ' в ' + last().y + ': рынок перешёл от пятилетних бумаг к продуктам на год-два, а заметная часть гасится в год выпуска.</div>' +
    '</div>';
  }

  // ── G. погашения 2026 ──
  function redeemHTML() {
    var r = D.redeem2026; if (!r) return "";
    var L = last();
    return '<div class="mk-h">Размещено в ' + L.y + ' — уже погашено <b>по ' + AS.human + '</b></div>' +
      '<div class="mk-red">' +
        '<div><div class="v">' + fmtB(r.redeemed) + '</div><div class="k">' + r.redeemed_n + ' выпусков, ' + fmtPc(r.redeemed / L.market * 100) + ' размещённого</div></div>' +
        '<div><div class="v">' + fmtB(r.early) + '</div><div class="k">из них досрочно — автоколл или оферта, ' + r.early_n + ' выпусков</div></div>' +
        '<div><div class="v">' + r.median_life_days + ' дн.</div><div class="k">медианный срок жизни погашенных выпусков</div></div>' +
      '</div>' +
      '<div class="pf-cap">До конца года срок наступит ещё у бумаг на ' + fmtB(Math.max(0, r.due_in_year - (r.redeemed - r.early))) + ' ₽ — не считая новых досрочных погашений.</div>';
  }

  // ── сборка ──
  // ── три сдвига: тезисы страницы ──
  // Стоят СРАЗУ под полосой цифр и ВЫШЕ графиков: это вывод, а графики под ними —
  // доказательства. Раньше блок висел вторым с конца, то есть выводы читались
  // после доказательств. Номера рисует счётчик CSS, индекс в данные не
  // протаскивается; <ol> сообщает порядок скринридеру, ::before — только оформление.
  // Планка под номером — цвет --fc («статистика, не продукт»), тот же, что у .art-bar:
  // оранжевый здесь означал бы «наше» или «активно» и врал бы.
  // SHIFTS_NOTE — единственный текст блока, который НЕ считается из данных;
  // цифр в нём нет намеренно, иначе он разошёлся бы с расчётом.
  var SHIFTS_NOTE = "что изменилось · доказательства — на графиках ниже";
  function shiftsHTML() {
    return '<section class="mk-shifts" aria-labelledby="mk-sh-t">' +
      '<div class="sh-head"><h2 class="sh-title" id="mk-sh-t">Три сдвига за семь лет</h2>' +
      '<p class="sh-note">' + SHIFTS_NOTE + '</p></div>' +
      '<ol class="sh-list">' + trio().map(function (r) {
        return '<li class="sh-row"><div class="sh-say"><h3 class="sh-t">' + r.t + '</h3>' +
          (r.en ? '<p class="sh-kick">' + r.en + '</p>' : '') +
          '</div><p class="sh-d">' + r.d + '</p></li>';
      }).join("") + '</ol></section>';
  }
  function html(fam, lib, usecaseHTML) {
    injectCSS();
    var fc = fam.color;
    var left = usecaseHTML(lib, "Зачем это знать") +
      '<div class="kv"><div class="k">Как считали</div><div class="v">' + lib.how + '</div></div>' +
      '<div class="plaque"><div class="k">Оговорки</div>' + lib.risk + '</div>';
    return numsHTML() + shiftsHTML() + volHTML(fc) + yearHTML(fc) + shareHTML(fc) + timelineHTML(fc) + termsHTML(fc) +
      '<div class="art-grid"><div>' + left + '</div><div class="viz pf" style="--fc:' + fc + '">' + redeemHTML() + '</div></div>' +
      '<div class="pf-cap" style="margin-top:14px">* ' + last().y + ' год — по ' + AS.human + ', выпуски, размещение которых ещё идёт, учтены нулём. Расчёты Rumberg по открытым и доступным источникам; общий объём рынка за 2022–2025 — сводная оценка.</div>';
  }
  function trio() {
    var r = D.redeem2026, L = last(), y20 = yearOf(2020), y22 = yearOf(2022), y23 = yearOf(2023), z = -1;
    for (var i = 0; i < y22.months.length; i++) if (y22.months[i] < 0.5) { z = i; break; }
    // ИОС Сбербанка в рейтинге 2020 и 2022 — на них приходится почти всё падение
    var ios = function (yr) { var x = (yr.ranking || []).filter(function (q) { return /ИОС/.test(q.name); })[0]; return x ? x.vol : 0; };
    var i20 = ios(y20), i22 = ios(y22);
    return [
      { t: "2022: рынок остановился и пересобрался", en: z >= 0 ? MONTHS_FULL[z] + " 2022 — ноль выпусков" : "падение в " + dec(y20.market / y22.market, 1) + " раза",
        d: "Весной 2022 года выпуски почти остановились" + (z >= 0 ? " — в " + MONTHS_IN[z] + " ни одного" : "") + ". За год розничный сегмент дал " + fmtB(y22.market) + " ₽ против " + fmtB(y20.market) + " ₽ в 2020 году" +
           (i20 && i22 ? "; ИОС Сбербанка, главный продукт 2020 года, сжались с " + fmtB(i20) + " до " + fmtB(i22) + " ₽" : "") + ". Восстановление началось с трёх банков, к " + yearOf(2025).y + " году эмитентов в розничном сегменте стало " + yearOf(2025).issuers + "." },
      { t: "2024–2026: СФО как конвейер", en: "от банков к платформам",
        d: "Специализированное финансовое общество раньше означало единичную сделку. С 2024 года это способ выпускать десятки бумаг в год для брокерских клиентов — так работают Атон и Румберг; через своё СФО вышел на рынок и Т-Банк. Эмитентов в розничном сегменте стало " + L.issuers + " против " + y23.issuers + " в 2023 году." },
      { t: "Короткие выпуски гасятся в год размещения", en: "медиана срока " + fmtTerm(D.years[0].median_term) + " → " + fmtTerm(L.median_term),
        d: r ? "Из размещённого в " + L.y + " году к " + AS.human + " погашено " + fmtB(r.redeemed) + " ₽ (" + r.redeemed_n + " выпусков), из них " + fmtB(r.early) + " ₽ досрочно. Медианный срок жизни уже погашенных — " + r.median_life_days + " дней при медиане срока по всему году " + fmtTerm(L.median_term) + ": короткие бумаги успевают погаситься в год выпуска." : "Заметная часть выпусков гасится в год размещения." }
    ];
  }
  var GLOSS = [
    { t: "Структурная облигация", en: "СО", d: "Облигация, у которой выплата зависит от формулы на базовый актив, а не от фиксированного купона. По форме это облигация с ISIN, номиналом и датой погашения, по сути — продукты из остальных разделов библиотеки." },
    { t: "СФО", en: "специализированное финансовое общество", d: "Компания, созданная только для выпуска облигаций под конкретные активы или деривативы. Это не банк: других операций у неё нет. Так выпускают и единичные крупные сделки, и конвейерные выпуски для брокерских клиентов." },
    { t: "ИОС", en: "инвестиционные облигации Сбербанка", d: "Структурные выпуски Сбербанка для широкой аудитории, торгуются на бирже. В 2020 году это было почти три четверти розничного сегмента; с 2022 года основной объём Сбера идёт через Sber CIB." },
    { t: "Институциональный выпуск", d: "Облигация, размещённая одному или нескольким заранее известным держателям без предложения рынку. Здесь это остаток: общий объём рынка минус розничные выпуски — сотни миллиардов рублей в единичных сделках СФО. Покупатель в открытых данных не раскрывается: по ним виден размер и адресный характер сделки, а не держатель." },
    { t: "ВПФИ", en: "внебиржевой производный финансовый инструмент", d: "Тот же структурный продукт, оформленный двусторонним контрактом с банком — опционом, форвардом, свопом — а не облигацией. Доступен только квалифицированным инвесторам, статистики по объёмам нет — на графиках это оценка." },
    { t: "Для неквалов", d: "Выпуск без ограничения «только для квалифицированных инвесторов». С 2021 года таких мало: сложные продукты неквалифицированным инвесторам продавать нельзя, и почти весь рынок помечен как квальный." },
    { t: "Объём размещения", d: "Сколько номинала реально купили; заявленный объём не учитывается — у выпуска может быть заявлено в разы больше, чем куплено." },
    { t: "Окончание размещения", d: "Дата, по которой выпуск относят к году: бумага, размещение которой началось в декабре и закончилось в январе, попадает в следующий год." }
  ];

  // ── обработчики ──
  function setYear(root, y, animate) {
    S.year = y;
    root.querySelectorAll("#mk-vol .mch-col").forEach(function (c) { c.classList.toggle("on", +c.getAttribute("data-y") === y); });
    root.querySelectorAll("#mk-chips button").forEach(function (b) { var on = +b.getAttribute("data-y") === y; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    var box = root.querySelector("#mk-year");
    box.innerHTML = yearPanelHTML(yearOf(y));
    animate(box);
    var ann = document.getElementById("announce");
    if (ann) ann.textContent = "Год крупным планом: " + y;
  }
  function bind(root, animate) {
    var seg = function (id, fn) {
      var el = root.querySelector("#" + id); if (!el) return;
      el.addEventListener("click", function (e) {
        var b = e.target.closest("button"); if (!b) return;
        fn(b.getAttribute("data-v"));
        el.querySelectorAll("button").forEach(function (x) { var on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on ? "true" : "false"); });
        var pf = root.querySelector("#mk-vol"); pf.innerHTML = volBarsHTML();
        root.querySelector("#mk-volcap").textContent = volCap();
        animate(pf.parentNode);
      });
    };
    seg("seg-mkt", function (v) { S.mode = v; });
    seg("seg-vp", function (v) { S.vp = v; });
    // клик по столбику года и по чипу — одно и то же действие
    root.querySelector("#mk-vol").addEventListener("click", function (e) {
      var c = e.target.closest(".mch-col"); if (c) setYear(root, +c.getAttribute("data-y"), animate);
    });
    root.querySelector("#mk-vol").addEventListener("keydown", function (e) {
      var c = e.target.closest(".mch-col");
      if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setYear(root, +c.getAttribute("data-y"), animate); }
    });
    root.querySelector("#mk-chips").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (b) setYear(root, +b.getAttribute("data-y"), animate);
    });
    // подсветка группы в долях: наведение или фокус на пункт легенды
    var share = root.querySelector("#mk-share"), lg = root.querySelector("#mk-lg");
    function hl(key) {
      if (key) share.setAttribute("data-hl", key); else share.removeAttribute("data-hl");
      share.querySelectorAll(".bs").forEach(function (b) { b.classList.toggle("hl", !!key && b.classList.contains("g-" + key)); });
      lg.querySelectorAll(".lgi").forEach(function (l) { l.classList.toggle("on", l.getAttribute("data-g") === key); });
      // над столбиками — доля группы в каждом году
      share.querySelectorAll(".mch-val").forEach(function (v) {
        if (!key) { v.innerHTML = "&nbsp;"; return; }
        var r = yearOf(+v.getAttribute("data-y")), sum = 0;
        D.groups.forEach(function (g) { sum += r.groups[g.key] || 0; });
        var x = r.groups[key] || 0;
        v.textContent = x > 0 ? fmtPc(x / sum * 100) : "—";
      });
    }
    lg.addEventListener("mouseover", function (e) { var l = e.target.closest(".lgi"); if (l) hl(l.getAttribute("data-g")); });
    lg.addEventListener("mouseleave", function () { hl(null); });
    lg.addEventListener("focusin", function (e) { var l = e.target.closest(".lgi"); if (l) hl(l.getAttribute("data-g")); });
    lg.addEventListener("focusout", function () { hl(null); });
    lg.addEventListener("click", function (e) { var l = e.target.closest(".lgi"); if (!l) return; var k = l.getAttribute("data-g"); hl(share.getAttribute("data-hl") === k ? null : k); });
  }

  window.MARKET_LIB = { ready: !!D, text: TEXT, html: html, bind: bind, trio: trio, gloss: GLOSS };
})();
