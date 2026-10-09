/* Карточка дня для клиента — картинка со сводкой рынка и ссылка на /svodka (09.10.2026).

   Повод: после MarketTwits пришло 366 новых людей, а сами вернулись трое — у человека нет
   повода зайти снова. Карточка даёт сейлзу этот повод каждый день: картинка со сводкой
   (настроение, IMOEX, доллар, ключевая, S&P 500, Nasdaq, три заголовка) и ссылка с его
   меткой ?ref=. Продуктов на карточке нет — слово Руслана: «пусть эта страница будет
   посвящена исключительно рынку».

   Модуль общий: его зовут вкладка «Рынок» главной (tabs.js) и страница svodka.html.
   SvCard.open(сводка, кнопка) — сводка = объект live/svodka.json, кнопка — куда вернуть фокус.

   — картинка 1080 px шириной рисуется прямо в телефоне (canvas), высота — по содержимому;
     на сервер ничего не уходит;
   — ссылка ведёт на /svodka (работает и на компьютере, без ролика и вопроса о статусе
     инвестора — там только рынок) с меткой и отметкой времени данных: по новой отметке
     Telegram строит свежее превью, а не берёт вчерашнее из кэша;
   — «Отправить»: сначала ссылка в буфер (в том же касании — иначе iOS не даёт), потом
     системное «Поделиться» с файлом. Многие приложения при отправке файла выбрасывают
     текст, поэтому ссылку можно вставить следующим сообщением;
   — метка: своя (поле на листе, so_card_ref) → партнёр в рабочем столе (so_me) → та, с
     которой пришли (so_ref). О метке лист говорит только тем, у кого она своя, — клиенту,
     пересылающему карточку дальше, про «вашу метку» знать незачем. */
(function () {
  "use strict";
  if (window.SvCard) return;
  var YM = 110759242;
  var MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  var TODAY = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  var CARD = null;   // открытый лист: { sv, url, file, name, link, text, opener }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fq(v) { var n = Math.round(Number(v) * 100) / 100; return String(n).replace(".", ","); }
  function grp(v, d) { return Number(v).toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function pct(v) { var n = Number(v); return isFinite(n) ? (n > 0 ? "+" : n < 0 ? "−" : "") + fq(Math.abs(n)) + "%" : ""; }
  function dm(iso) { var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "." + m[2] : String(iso || "").slice(0, 5); }
  function moodC(v) { return v < 40 ? "#E0705A" : v < 60 ? "#F2F3F7" : "#55C08A"; }
  // Время по Москве из ISO: сегодня — «09:50», вчера — «вчера 22:56», раньше — «07.10 18:25»
  function when(iso) {
    var s = String(iso || ""), dd = s.slice(0, 10), hm = s.slice(11, 16);
    if (dd === TODAY) return hm;
    var y = new Date(Date.parse(TODAY) - 864e5).toISOString().slice(0, 10);
    return (dd === y ? "вчера " : dm(dd) + " ") + hm;
  }
  function goal(name) { if (window.ym) try { ym(YM, "reachGoal", name); } catch (e) {} }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k) || ""; if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { return ""; } }
  var RE_REF = /^[a-z0-9._-]{1,40}$/;
  function okRef(v) { v = String(v || "").toLowerCase(); return RE_REF.test(v) ? v : ""; }
  // Своя метка (сейлз задал на листе или партнёр вошёл в рабочий стол) — о ней лист и говорит
  function ownRef() { return okRef(ls("so_card_ref")) || okRef(ls("so_me")); }
  function refLabel() { return ownRef() || okRef(ls("so_ref")); }
  function staff() { return !!(ownRef() || ls("so_admin_key")); }
  function link(sv) {
    var q = [], ref = refLabel(), s = String(sv.updated || "");
    if (ref) q.push("ref=" + encodeURIComponent(ref));
    if (/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s)) q.push("t=" + s.slice(5, 7) + s.slice(8, 10) + "-" + s.slice(11, 13) + s.slice(14, 16));
    return "https://invest.rumberg.ru/svodka" + (q.length ? "?" + q.join("&") : "");
  }

  function cardData(sv) {
    var d = sv || {}, t = d.top || {}, w = d.world || {}, s = String(d.updated || "");
    var row1 = [], row2 = [];
    if (t.imoex && t.imoex.v) row1.push({ v: grp(t.imoex.v, 0), k: "IMOEX", s: pct(t.imoex.d) + " за день", dir: Number(t.imoex.d) });
    if (t.usd && t.usd.v) row1.push({ v: grp(t.usd.v, 2) + " ₽", k: "Доллар", s: pct(t.usd.d) + " за день", dir: 0 });
    if (t.key && t.key.rate) row1.push({ v: fq(t.key.rate) + "%", k: "Ключевая ставка", s: t.key.next ? "заседание " + dm(t.key.next) : "", dir: 0 });
    (w.idx || []).forEach(function (x) {
      if (!x || !x.v) return;
      var dd = String(x.date || "");
      row2.push({ v: grp(x.v, 0), k: x.k, s: pct(x.d) + (dd === s.slice(0, 10) ? " за день" : dd ? " · " + dm(dd) : ""), dir: Number(x.d) });
    });
    return {
      when: /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(s) ? Number(s.slice(8, 10)) + " " + MONTHS[Number(s.slice(5, 7)) - 1] + " · данные на " + s.slice(11, 16) + " МСК" : "",
      mood: d.mood && isFinite(d.mood.score) ? d.mood : null,
      row1: row1, row2: row2,
      news: (d.news || []).filter(function (n) { return n.t; }).slice(0, 3),
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
          box(bx, by, bw, 12, 6, gb);
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

      // Главное за сутки — три заголовка, каждый до двух строк
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

      // Подвал: куда идти и оговорки — те же, что на экране сводки
      y += 52; hr(y);
      y += 78; font(600, 46, R); txt("invest.rumberg.ru", P, y, OR);
      font(400, 26, O); txt("обновляется каждые 5 минут", W - P, y - 4, MUT, "right");
      font(400, 22, O);
      var legal = (D.src ? "Данные: " + D.src + ". " : "") + "Котировки Мосбиржи — с задержкой до 15 минут. Заголовки отобраны и пересказаны автоматически. " +
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

  var CSS = [
    "html.svc-on, html.svc-on body { overflow: hidden; }",
    ".svc { position: fixed; inset: 0; z-index: 700; overflow-y: auto; background: #0B0C10; color: #F2F3F7; font-family: 'Onest', system-ui, sans-serif; -webkit-overflow-scrolling: touch; }",
    ".svc-in { max-width: 560px; min-height: 100%; margin: 0 auto; padding: calc(env(safe-area-inset-top) + 4px) 16px calc(env(safe-area-inset-bottom) + 20px); display: flex; flex-direction: column; }",
    ".svc-top { display: flex; align-items: center; gap: 8px; height: 52px; }",
    ".svc-x { width: 44px; height: 44px; margin-left: -10px; display: grid; place-items: center; border: 0; border-radius: 12px; background: none; color: #F2F3F7; cursor: pointer; }",
    ".svc-x:focus-visible, .svc button:focus-visible, .svc input:focus-visible { outline: 2px solid #EE7D1B; outline-offset: 2px; }",
    ".svc-t { font-size: 15px; color: rgba(242,243,247,.64); }",
    ".svc-p { display: grid; place-items: center; min-height: 260px; margin: 4px 0 14px; border-radius: 16px; background: #14161C; overflow: hidden; }",
    ".svc-p img { display: block; max-width: 100%; max-height: 56vh; width: auto; height: auto; -webkit-touch-callout: default; }",
    ".svc-w { font-size: 14px; color: rgba(242,243,247,.64); }",
    ".svc-l { margin: 0 0 12px; font-size: 14px; line-height: 1.45; color: rgba(242,243,247,.64); overflow-wrap: anywhere; }",
    ".svc-l b { color: #F2F3F7; font-weight: 500; }",
    ".svc-a { display: inline; padding: 0; border: 0; background: none; color: #EE7D1B; font: inherit; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }",
    ".svc-f { display: flex; gap: 8px; margin: 0 0 12px; }",
    ".svc-f input { flex: 1; min-width: 0; height: 44px; padding: 0 12px; border: 1px solid rgba(255,255,255,.14); border-radius: 12px; background: #14161C; color: #F2F3F7; font: 16px 'JetBrains Mono', monospace; }",
    ".svc-f button { flex: none; height: 44px; padding: 0 16px; border: 0; border-radius: 12px; background: #2A2E37; color: #F2F3F7; font: 500 15px 'Onest', sans-serif; cursor: pointer; }",
    ".svc-e { margin: -6px 0 12px; font-size: 13px; color: #E0705A; }",
    ".svc-go { display: flex; align-items: center; justify-content: center; width: 100%; height: 54px; border: 0; border-radius: 14px; background: #EE7D1B; color: #0C0A08; font: 600 16px 'Onest', sans-serif; cursor: pointer; }",
    ".svc-go[disabled] { opacity: .5; }",
    ".svc-c { width: 100%; height: 50px; margin-top: 10px; border: 1px solid rgba(255,255,255,.14); border-radius: 14px; background: none; color: #F2F3F7; font: 500 15px 'Onest', sans-serif; cursor: pointer; }",
    ".svc-s { min-height: 20px; margin: 12px 0 0; font-size: 14px; line-height: 1.45; color: #55C08A; text-align: center; }",
    ".svc-u { width: 100%; height: 40px; margin-top: 6px; padding: 0 10px; border: 1px solid rgba(255,255,255,.14); border-radius: 10px; background: #14161C; color: #F2F3F7; font: 14px 'JetBrains Mono', monospace; }",
    ".svc-n { margin: auto 0 0; padding-top: 16px; font-size: 12px; line-height: 1.5; color: rgba(242,243,247,.5); text-align: center; }"
  ].join("\n");
  function css() { if (document.getElementById("svc-css")) return; var s = document.createElement("style"); s.id = "svc-css"; s.textContent = CSS; document.head.appendChild(s); }

  // Строка о ссылке: своя метка — назвать её; сейлз без метки — поле; клиент — без слов о метке
  function refBlock(edit) {
    var own = ownRef(), shortL = "invest.rumberg.ru/svodka" + (refLabel() ? "?ref=" + refLabel() : "");
    if (edit || (staff() && !own)) {
      return '<p class="svc-l">Ваша метка — та, что стоит в ваших ссылках после <b>?ref=</b>. Переходы по карточке будут подписаны ею.</p>' +
        '<form class="svc-f" data-svc-form><input name="ref" value="' + esc(own) + '" placeholder="например, polina" autocapitalize="off" autocomplete="off" spellcheck="false" maxlength="40" aria-label="Ваша метка">' +
        '<button type="submit">Сохранить</button></form><p class="svc-e" id="svc-e" hidden></p>';
    }
    if (own) return '<p class="svc-l">Ссылка: <b>' + esc(shortL) + "</b> — переходы подписаны вашей меткой. " +
      '<button type="button" class="svc-a" data-svc="edit">Изменить</button></p>';
    return '<p class="svc-l">Вместе с картинкой уйдёт ссылка на сводку — она обновляется каждые 5 минут. ' +
      '<button type="button" class="svc-a" data-svc="edit">Я сейлз или партнёр</button></p>';
  }

  function open(sv, opener) {
    if (CARD || !sv) return;
    css();
    var el = document.createElement("div");
    el.className = "svc"; el.id = "svc";
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Сводка для клиента");
    el.innerHTML = '<div class="svc-in"><div class="svc-top"><button type="button" class="svc-x" data-svc="close" aria-label="Закрыть">' +
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
      '</button><span class="svc-t">Сводка для клиента</span></div>' +
      '<div class="svc-p" id="svc-p"><span class="svc-w">Рисую карточку…</span></div>' +
      '<div id="svc-r">' + refBlock(false) + "</div>" +
      '<button type="button" class="svc-go" data-svc="send" disabled>Отправить</button>' +
      '<button type="button" class="svc-c" data-svc="copy">Скопировать ссылку</button>' +
      '<p class="svc-s" id="svc-s" role="status" aria-live="polite"></p>' +
      '<p class="svc-n">Картинка рисуется в телефоне из сводки на эту минуту. Её можно и удержать пальцем, чтобы сохранить.</p></div>';
    el.addEventListener("click", onClick);
    el.addEventListener("submit", onSubmit);
    el.addEventListener("keydown", onKey);
    document.body.appendChild(el);
    document.documentElement.classList.add("svc-on");
    CARD = { sv: sv, opener: opener || document.activeElement };
    // Лист — запись в истории: системный «назад» его закрывает (вкладки главной чужие
    // записи пропускают — у них нет поля tg)
    try { history.pushState({ svc: 1 }, ""); } catch (e) {}
    var x = el.querySelector(".svc-x"); if (x) x.focus();
    goal("svodka_card_open");
    var D = cardData(sv);
    CARD.link = link(sv);
    CARD.text = "Сводка рынка" + (D.when ? " на " + D.when.split(" · ")[0] : "") + " — настроение, индексы и главное за сутки: " + CARD.link;
    fontsReady().then(function () {
      if (!CARD || !document.getElementById("svc")) return;
      var cv = document.createElement("canvas");
      paintCard(cv, D);
      cv.toBlob(function (b) {
        if (!b || !CARD) return;
        CARD.name = "rumberg-svodka-" + TODAY + ".png";
        CARD.url = URL.createObjectURL(b);
        try { CARD.file = new File([b], CARD.name, { type: "image/png" }); } catch (e) { CARD.file = null; }
        document.getElementById("svc-p").innerHTML = '<img src="' + CARD.url + '" alt="Сводка рынка Rumberg на сегодня">';
        var send = el.querySelector('[data-svc="send"]');
        send.textContent = canFile() ? "Отправить" : "Сохранить картинку";
        send.disabled = false;
      }, "image/png");
    });
  }
  function canFile() { return !!(CARD && CARD.file && navigator.canShare && navigator.canShare({ files: [CARD.file] })); }
  function close(viaHistory) {
    var el = document.getElementById("svc"); if (el) el.remove();
    document.documentElement.classList.remove("svc-on");
    if (!CARD) return;
    if (CARD.url) URL.revokeObjectURL(CARD.url);
    var op = CARD.opener; CARD = null;
    if (!viaHistory && (history.state || {}).svc) history.back();
    if (op && op.focus && document.contains(op)) try { op.focus({ preventScroll: true }); } catch (e) {}
  }
  window.addEventListener("popstate", function (e) { if (CARD && !(e.state && e.state.svc)) close(true); });

  function say(s) { var n = document.getElementById("svc-s"); if (n) n.textContent = s; }
  // Копирование: буфер обмена → старый execCommand → показать ссылку полем
  function copy(quiet) {
    var t = CARD.link;
    function legacy() {
      try { var i = document.createElement("textarea"); i.value = t; i.setAttribute("readonly", ""); i.style.position = "fixed"; i.style.opacity = "0"; document.body.appendChild(i); i.select(); var r = document.execCommand("copy"); i.remove(); return r; } catch (e) { return false; }
    }
    var p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t).then(function () { return true; }, function () { return legacy(); })
      : Promise.resolve(legacy());
    return p.then(function (ok) {
      if (quiet) return ok;
      if (ok) { say("Ссылка скопирована"); goal("svodka_card_copy"); }
      else {
        var n = document.getElementById("svc-s");
        if (n) { n.textContent = ""; var i = document.createElement("input"); i.className = "svc-u"; i.value = t; i.readOnly = true; i.setAttribute("aria-label", "Ссылка на сводку"); n.appendChild(i); i.select(); }
      }
      return ok;
    });
  }
  function save() {
    var a = document.createElement("a");
    a.href = CARD.url; a.download = CARD.name; document.body.appendChild(a); a.click(); a.remove();
    goal("svodka_card_save");
    copy(true).then(function (ok) { say(ok ? "Картинка сохранена, ссылка в буфере — вставьте её рядом с картинкой" : "Картинка сохранена — ссылку скопируйте кнопкой ниже"); });
  }
  function send() {
    if (!CARD || !CARD.url) return;
    if (!canFile()) { save(); return; }
    // Ссылка в буфер — в том же касании, до «Поделиться»: после него iOS буфер уже не даёт
    var copied = copy(true);
    navigator.share({ files: [CARD.file], text: CARD.text }).then(function () {
      goal("svodka_card_send");
      copied.then(function (ok) { say(ok ? "Готово. Ссылка в буфере: если подписи у картинки нет, вставьте её следующим сообщением" : "Готово"); });
    }, function (err) { if (!err || err.name !== "AbortError") save(); });
  }
  function onClick(e) {
    var b = e.target.closest("[data-svc]"); if (!b || !CARD) return;
    var a = b.getAttribute("data-svc");
    if (a === "close") close(false);
    else if (a === "copy") copy(false);
    else if (a === "send") send();
    else if (a === "edit") { document.getElementById("svc-r").innerHTML = refBlock(true); var i = document.querySelector("#svc-r input"); if (i) i.focus(); }
  }
  function onSubmit(e) {
    var f = e.target.closest("[data-svc-form]"); if (!f || !CARD) return;
    e.preventDefault();
    var raw = String(f.elements.ref.value || "").trim().toLowerCase().replace(/^.*[?&]ref=/, "");
    var er = document.getElementById("svc-e");
    if (raw && !RE_REF.test(raw)) { if (er) { er.hidden = false; er.textContent = "Латиница, цифры, точка, дефис или подчёркивание — до 40 знаков"; } return; }
    ls("so_card_ref", raw);
    CARD.link = link(CARD.sv);
    CARD.text = CARD.text.replace(/https:\/\/\S+$/, CARD.link);
    document.getElementById("svc-r").innerHTML = refBlock(false);
    say(raw ? "Метка сохранена" : "Метка убрана");
  }
  function onKey(e) {
    if (e.key === "Escape") { close(false); return; }
    if (e.key !== "Tab") return;   // фокус не уходит за лист
    var f = [].slice.call(document.querySelectorAll("#svc button:not([disabled]), #svc input"));
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  window.SvCard = { open: open, close: close, paint: function (cv, sv) { paintCard(cv, cardData(sv)); } };
})();
