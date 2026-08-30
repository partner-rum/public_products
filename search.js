/* Поиск в шапке — один на все страницы витрины.

   Зачем. Замер 28.08.2026: самая частая работа сейлза — «клиент назвал бумагу,
   дай ссылку» — стоила 4 клика плюс набор (главная → доска → поиск → продукт →
   копировать), и кнопка копирования была только у пяти продуктов дня из 104.
   Поиска на главной не было вовсе, хотя это пятый гайдлайн NN/g по юзабилити
   главных страниц. Теперь: набрал «Сбер» → в выдаче сразу кнопка «Ссылка» →
   готово. Один клик после набора вместо четырёх.

   Устройство. Самодостаточный IIFE со своими стилями, монтируется в .nav-in
   (она есть на всех страницах). Данные подтягиваются ЛЕНИВО, по первому фокусу:
   иначе каждая страница витрины тащила бы data/instruments.js (75 КБ) и
   data/placements.js (51 КБ) ради поля, в которое обычно не пишут.

   Подключение: <script src="search.js?v=1"></script> перед </body>.
   Демо: ?findemo=1 — открыть выдачу сразу, без набора. */
(function () {
  "use strict";

  var LIMIT = 8;                       // строк в выдаче; больше — уже список, а не подсказка
  var MINQ = 2;                        // короче двух знаков ищет всё подряд
  var loaded = false, loading = null;
  var items = [], issues = [];

  // ── Данные ────────────────────────────────────────────────────────────────
  function loadScript(src) {
    return new Promise(function (res) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { res(true); };
      s.onerror = function () { res(false); };   // файл не доехал — ищем по тому, что есть
      document.head.appendChild(s);
    });
  }

  function ensureData() {
    if (loaded) return Promise.resolve();
    if (loading) return loading;
    var need = [];
    if (!window.SITE_DATA) need.push(loadScript("data/instruments.js"));
    if (!window.PLACEMENTS_DATA) need.push(loadScript("data/placements.js"));
    loading = Promise.all(need).then(function () {
      items = ((window.SITE_DATA || {}).instruments) || [];
      issues = ((window.PLACEMENTS_DATA || {}).issues) || [];
      loaded = true;
    });
    return loading;
  }

  // ── Нормализация: регистр и «ё» — иначе «Сбер» не найдёт «сбербанк»,
  //    а «Северсталь» не найдётся по «северсталь» с ё в другом месте ────────
  function norm(s) { return String(s || "").toLowerCase().replace(/ё/g, "е"); }

  // Совпадение внутри поля: в начале ценнее, чем после разделителя, а то —
  // ценнее, чем в середине слова. 0 — не нашли
  function hit(field, q) {
    var h = norm(field), at = h.indexOf(q);
    if (at < 0) return 0;
    if (at === 0) return 3;
    return /[\s·(/,-]/.test(h.charAt(at - 1)) ? 2 : 1;
  }

  // Вес поля важнее веса позиции. Иначе по запросу «сбер» наверх выходили
  // корзины worst-of, где Сбербанк — одна из трёх бумаг, а прямой продукт
  // «CALL 100 · Сбербанк» падал на пятое место: сейлзу нужно ровно наоборот.
  // Совпадение в названии × 10, в базовом активе × 4, в остальном × 1.
  function scoreProduct(r, q) {
    var nm = hit(r.name, q) * 10;
    var un = hit(r.underlying, q) * 4;
    // Корзина worst-of: имя актива есть, но продукт не «про эту бумагу» —
    // такое совпадение засчитываем как обычное поле, без множителя
    if (un && /\//.test(String(r.underlying || ""))) un = hit(r.underlying, q);
    var rest = Math.max(hit(r.cls, q), hit(r.tenor, q), hit(r.id, q));
    return nm + un + rest;
  }
  function scoreIssue(i, q) {
    var nm = Math.max(hit(i.serial, q), hit(i.name, q)) * 10;
    var is = hit(i.isin, q) * 6;
    var bk = (i.basket || []).reduce(function (m, x) { return Math.max(m, hit(x.n, q)); }, 0) * 2;
    return nm + is + bk;
  }

  function find(q) {
    q = norm(q).trim();
    if (q.length < MINQ) return { prod: [], iss: [], total: 0, prodTotal: 0, issTotal: 0 };
    var prod = [], iss = [];
    items.forEach(function (r) {
      var s = scoreProduct(r, q);
      if (s > 0) prod.push({ r: r, s: s });
    });
    issues.forEach(function (i) {
      var s = scoreIssue(i, q);
      if (s > 0) iss.push({ r: i, s: s });
    });
    prod.sort(function (a, b) { return b.s - a.s; });
    iss.sort(function (a, b) { return b.s - a.s; });
    var total = prod.length + iss.length;
    // Места делим, а не отдаём первому: иначе продукты забирали все восемь строк
    // и размещённые выпуски не показывались вообще, хотя нашлись
    var pn = prod.length, inum = iss.length;
    var pTake = inum ? Math.min(pn, Math.max(LIMIT - Math.min(inum, 3), 5)) : Math.min(pn, LIMIT);
    var iTake = Math.min(inum, LIMIT - pTake);
    return { prod: prod.slice(0, pTake), iss: iss.slice(0, iTake),
             total: total, prodTotal: pn, issTotal: inum };
  }

  // ── Персональная ссылка: та же механика, что в колонке «Актуальные продукты»
  //    на главной. Метку кладёт metrika.js, когда сейлз входит по своей ссылке ──
  function refTag() {
    try {
      var v = localStorage.getItem("so_ref");
      return v && /^[\w.-]{1,40}$/.test(v) ? v : "";
    } catch (e) { return ""; }
  }
  function linkFor(id) {
    var base = location.origin + location.pathname.replace(/[^/]*$/, "");
    var u = base + "p/" + encodeURIComponent(id) + ".html";
    var r = refTag();
    return r ? u + "?ref=" + encodeURIComponent(r) : u;
  }
  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  function toast(text, isLink) {
    var old = document.querySelector(".sf-said");
    if (old) old.remove();
    var el = document.createElement("div");
    el.className = "sf-said";
    el.setAttribute("role", "status");
    el.textContent = isLink ? "Скопировать не удалось, ссылка: " + text : text;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, isLink ? 9000 : 1800);
  }
  // Отказ буфера обрабатываем тремя уровнями: clipboard отклоняет запись, если
  // вкладка не в фокусе, и молчащая кнопка заставила бы отправить клиенту пустоту
  function copyLink(id, btn) {
    var url = linkFor(id);
    function ok() {
      btn.classList.add("done");
      setTimeout(function () { btn.classList.remove("done"); }, 1500);
      toast("Ссылка скопирована", false);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(ok, function () {
        if (legacyCopy(url)) ok(); else toast(url, true);
      });
    } else if (legacyCopy(url)) { ok(); } else { toast(url, true); }
  }

  // ── Разметка выдачи ───────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(v, cur) {
    if (v == null) return "";
    var s = (Math.round(v * 100) / 100).toString().replace(".", ",");
    return s + (cur === "%" ? "%" : "");
  }

  function rowProduct(x) {
    var r = x.r;
    return '<div class="sf-row" role="option" data-go="instrument.html?id=' + esc(encodeURIComponent(r.id)) + '">' +
      '<a class="sf-main" href="instrument.html?id=' + esc(encodeURIComponent(r.id)) + '" tabindex="-1">' +
        '<span class="sf-nm">' + esc(r.name) + '</span>' +
        '<span class="sf-sub">' + esc([r.underlying, r.cls].filter(Boolean).join(" · ")) + '</span>' +
      '</a>' +
      (r.quote != null ? '<span class="sf-q">' + esc(money(r.quote, "%")) + '</span>' : '') +
      '<button class="sf-copy" type="button" data-copy="' + esc(r.id) + '" ' +
        'title="Скопировать ссылку для клиента" aria-label="Скопировать ссылку на продукт ' + esc(r.name) + '">Ссылка</button>' +
    '</div>';
  }

  function rowIssue(x) {
    var i = x.r;
    return '<div class="sf-row" role="option" data-go="placements.html#' + esc(i.isin) + '">' +
      '<a class="sf-main" href="placements.html#' + esc(i.isin) + '" tabindex="-1">' +
        '<span class="sf-nm">' + esc(i.serial || i.name) + '</span>' +
        '<span class="sf-sub">' + esc(i.isin) + '</span>' +
      '</a>' +
      (i.bid != null ? '<span class="sf-q sf-bid">' + esc(money(i.bid, "%")) + '</span>' : '') +
    '</div>';
  }

  function render(panel, q, res) {
    if (norm(q).trim().length < MINQ) {
      panel.innerHTML = '<div class="sf-hint">Название, тикер, базовый актив или ISIN — от двух знаков</div>';
      return;
    }
    if (!res.total) {
      panel.innerHTML = '<div class="sf-hint">Ничего не нашлось. ' +
        'Попробуйте тикер или базовый актив — например «Сбер», «NVDA», «ОФЗ».</div>';
      return;
    }
    var html = "";
    if (res.prod.length) {
      html += '<div class="sf-cap">Продукты доски</div>' + res.prod.map(rowProduct).join("");
    }
    if (res.iss.length) {
      html += '<div class="sf-cap">Размещённые выпуски</div>' + res.iss.map(rowIssue).join("");
    }
    // Два счёта, а не один общий: доска знает только продукты, размещённые
    // выпуски живут на своей странице. Ссылка «показать все 34 на доске»
    // обещала бы 34 позиции, а отдавала 7 — ровно тот класс вранья,
    // из-за которого на главной переделывали счётчик «104 шт.»
    if (res.prodTotal > res.prod.length) {
      html += '<a class="sf-all" href="board.html?q=' + encodeURIComponent(q.trim()) + '">' +
        'Ещё ' + (res.prodTotal - res.prod.length) + ' на доске →</a>';
    }
    if (res.issTotal > res.iss.length) {
      html += '<a class="sf-all" href="placements.html?q=' + encodeURIComponent(q.trim()) + '">' +
        'Ещё ' + (res.issTotal - res.iss.length) + ' в размещённых выпусках →</a>';
    }
    panel.innerHTML = html;
  }

  // ── Сборка ────────────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById("sf-css")) return;
    var s = document.createElement("style");
    s.id = "sf-css";
    s.textContent = [
      ".sf{position:relative;flex:1 1 220px;max-width:340px;min-width:0;margin-left:14px;}",
      ".sf-in{width:100%;height:36px;box-sizing:border-box;background:rgba(255,255,255,.05);",
      "  border:1px solid rgba(255,255,255,.13);border-radius:9px;color:#F2F3F7;",
      "  font-family:'Onest',system-ui,sans-serif;font-size:13.5px;padding:0 12px 0 34px;",
      "  transition:border-color .18s,background .18s;}",
      ".sf-in::placeholder{color:rgba(242,243,247,.45);}",
      ".sf-in:focus{outline:none;border-color:rgba(238,125,27,.55);background:rgba(255,255,255,.07);}",
      ".sf-ic{position:absolute;left:11px;top:50%;transform:translateY(-50%);pointer-events:none;opacity:.5;}",
      ".sf-panel{position:absolute;top:calc(100% + 7px);left:0;right:0;min-width:330px;z-index:90;",
      "  background:#14161C;border:1px solid rgba(255,255,255,.13);border-radius:12px;",
      "  box-shadow:0 18px 48px rgba(0,0,0,.55);overflow:hidden;display:none;",
      "  max-height:min(70vh,520px);overflow-y:auto;}",
      ".sf.open .sf-panel{display:block;}",
      ".sf-cap{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.13em;",
      "  text-transform:uppercase;color:rgba(242,243,247,.45);padding:11px 14px 6px;}",
      ".sf-row{display:flex;align-items:center;gap:10px;padding:7px 10px 7px 14px;",
      "  border-top:1px solid rgba(255,255,255,.05);}",
      ".sf-cap + .sf-row{border-top:0;}",
      ".sf-row:hover,.sf-row.on{background:rgba(255,255,255,.055);}",
      ".sf-main{flex:1 1 auto;min-width:0;display:block;text-decoration:none;color:inherit;padding:3px 0;}",
      ".sf-nm{display:block;font-size:13.5px;font-weight:500;color:#F2F3F7;line-height:1.3;",
      "  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      ".sf-sub{display:block;font-family:'JetBrains Mono',monospace;font-size:11px;",
      "  color:rgba(242,243,247,.5);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      ".sf-q{flex:none;font-family:'JetBrains Mono',monospace;font-size:12.5px;color:rgba(242,243,247,.68);}",
      ".sf-bid{color:#55C08A;}",
      ".sf-copy{flex:none;background:rgba(238,125,27,.14);border:1px solid rgba(238,125,27,.34);",
      "  color:#F58E33;border-radius:7px;font-family:'Onest',system-ui,sans-serif;font-size:12px;",
      "  padding:6px 10px;cursor:pointer;transition:background .15s,color .15s;}",
      ".sf-copy:hover{background:rgba(238,125,27,.24);}",
      ".sf-copy.done{background:#EE7D1B;color:#0C0A08;border-color:#EE7D1B;}",
      ".sf-copy.done::after{content:' ✓';}",
      ".sf-all{display:block;padding:11px 14px;border-top:1px solid rgba(255,255,255,.09);",
      "  font-size:12.5px;color:#F58E33;text-decoration:none;}",
      ".sf-all:hover{background:rgba(255,255,255,.05);}",
      ".sf-hint{padding:14px;font-size:12.5px;line-height:1.5;color:rgba(242,243,247,.55);}",
      ".sf-said{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:100001;",
      "  background:#14161C;border:1px solid rgba(255,255,255,.16);border-radius:10px;",
      "  padding:11px 16px;font-family:'Onest',system-ui,sans-serif;font-size:13px;color:#F2F3F7;",
      "  box-shadow:0 12px 34px rgba(0,0,0,.5);max-width:min(92vw,560px);word-break:break-all;}",
      // Тач-цель ≥44px и панель во всю ширину экрана: на телефоне выпадашка
      // шириной с поле (220px) была бы нечитаемой, а имена продуктов длинные
      "@media (max-width:900px){",
      // Шапке нужен перенос, иначе поле делит строку с логотипом и кнопкой
      // «Доска» и получает 99px из 375 — замер на iPhone-ширине. Часть страниц
      // (доска, библиотека) переносит шапку сама с 860px; здесь поднимаем порог
      // до 900 и снимаем фиксированную высоту, иначе вторая строка вылезает
      "  .nav-in{flex-wrap:wrap!important;height:auto!important;padding-top:10px;padding-bottom:10px;}",
      "  .sf{order:9;flex:1 1 100%;max-width:none;margin:8px 0 0;}",
      "  .sf-in{height:44px;font-size:15px;}",     // 16px не ставим: iOS зумит поле, но 15 уже не зумит на нашей вёрстке
      "  .sf-panel{min-width:0;}",
      "  .sf-copy{padding:11px 12px;}",
      "  .sf-row{padding:9px 10px 9px 14px;}",
      "}",
      "@media (prefers-reduced-motion:reduce){.sf-in,.sf-copy{transition:none;}}"
    ].join("");
    document.head.appendChild(s);
  }

  function mount() {
    var navIn = document.querySelector(".nav-in");
    if (!navIn || navIn.querySelector(".sf")) return;
    injectCSS();

    var box = document.createElement("div");
    box.className = "sf";
    box.innerHTML =
      '<svg class="sf-ic" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
        '<circle cx="7" cy="7" r="5" stroke="#F2F3F7" stroke-width="1.6"/>' +
        '<path d="M11 11 L14.5 14.5" stroke="#F2F3F7" stroke-width="1.6" stroke-linecap="round"/></svg>' +
      '<input class="sf-in" type="search" autocomplete="off" role="combobox" aria-expanded="false" ' +
        'aria-controls="sf-panel" aria-label="Поиск продукта, выпуска или базового актива" ' +
        'placeholder="Продукт, тикер, ISIN…">' +
      '<div class="sf-panel" id="sf-panel" role="listbox" aria-label="Результаты поиска"></div>';

    // Ставим сразу после логотипа: слева от пунктов меню, а не в их конце —
    // так поле не уезжает за бургер на промежуточных ширинах
    var brand = navIn.querySelector(".brand") || navIn.firstElementChild;
    var after = navIn.querySelector(".nav-about") || brand;
    if (after && after.parentNode === navIn) after.insertAdjacentElement("afterend", box);
    else navIn.appendChild(box);

    var input = box.querySelector(".sf-in");
    var panel = box.querySelector(".sf-panel");
    var cur = -1;

    function open() { box.classList.add("open"); input.setAttribute("aria-expanded", "true"); }
    function close() { box.classList.remove("open"); input.setAttribute("aria-expanded", "false"); cur = -1; }

    function refresh() {
      var q = input.value;
      render(panel, q, loaded ? find(q) : { prod: [], iss: [], total: 0 });
      cur = -1;
      open();
    }

    input.addEventListener("focus", function () {
      open();
      ensureData().then(function () { if (box.classList.contains("open")) refresh(); });
    });
    input.addEventListener("input", function () {
      if (!loaded) { ensureData().then(refresh); return; }
      refresh();
    });

    input.addEventListener("keydown", function (e) {
      var rows = [].slice.call(panel.querySelectorAll(".sf-row"));
      if (e.key === "Escape") { close(); input.blur(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!rows.length) return;
        e.preventDefault();
        rows.forEach(function (r) { r.classList.remove("on"); });
        cur = e.key === "ArrowDown"
          ? (cur + 1) % rows.length
          : (cur <= 0 ? rows.length - 1 : cur - 1);
        rows[cur].classList.add("on");
        rows[cur].scrollIntoView({ block: "nearest" });
        return;
      }
      if (e.key === "Enter") {
        // Выбранная строка — туда; ничего не выбрано — на доску с этим запросом,
        // чтобы Enter никогда не был «ничего не произошло»
        if (cur >= 0 && rows[cur]) { location.href = rows[cur].getAttribute("data-go"); return; }
        var q = input.value.trim();
        if (q.length >= MINQ) location.href = "board.html?q=" + encodeURIComponent(q);
      }
    });

    panel.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".sf-copy") : null;
      if (btn) { e.preventDefault(); e.stopPropagation(); copyLink(btn.getAttribute("data-copy"), btn); return; }
      var row = e.target.closest ? e.target.closest(".sf-row") : null;
      if (row && !e.target.closest(".sf-main")) location.href = row.getAttribute("data-go");
    });

    document.addEventListener("click", function (e) { if (!box.contains(e.target)) close(); });

    if (/[?&]findemo=1/.test(location.search)) {
      ensureData().then(function () { input.value = "Сбер"; refresh(); });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
