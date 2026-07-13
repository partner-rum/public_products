// Общий модуль «Поделиться»: кнопка + меню (ссылка / Telegram / WhatsApp / PDF) + тост.
// Подключается на дайджест, доску и one-pager. Хосты тёмные — палитра светлая.
// Использование: Share.attach(hostEl, { url, pdf, title, name, pitch, params }).
// url — ссылка (всегда на сайт). name — заголовок, pitch — суть в одну фразу,
// params — [[label, value], ...]; текст сообщения собирается с эмодзи и переносами.
// Можно передать готовый text — тогда он используется как есть.
window.Share = (function () {
  var IC = {
    share: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5"/></svg>',
    link: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F2F3F7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
    tg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8FB4F0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3 2 10.5l6 2.2M22 3 15 21l-3.5-7.3M22 3 8 12.7v4.8l3.5-3.8"/></svg>',
    wa: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7FD3AC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 5.5 15.5A8 8 0 1 1 8.5 18.5z"/></svg>',
    pdf: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F2A661" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M12 15l-4-4M12 15l4-4M4 21h16"/></svg>',
    check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 6"/></svg>'
  };

  var CSS =
    '.sh{position:relative;display:inline-flex}' +
    '.sh-btn{display:inline-flex;align-items:center;gap:7px;background:transparent;border:1px solid rgba(255,255,255,0.14);color:#F2F3F7;border-radius:8px;padding:8px 13px;font-family:inherit;font-size:13px;cursor:pointer;transition:border-color .2s,background .2s}' +
    '.sh-btn:hover{border-color:rgba(255,255,255,0.28);background:rgba(255,255,255,0.05)}' +
    '.sh-btn svg{display:block}' +
    '.sh-menu{position:absolute;right:0;top:calc(100% + 8px);z-index:60;width:238px;max-width:calc(100vw - 24px);background:#1B1D26;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:6px;box-shadow:0 16px 40px rgba(0,0,0,0.55);opacity:0;transform:translateY(-4px);pointer-events:none;transition:opacity .18s ease,transform .18s cubic-bezier(0.16,1,0.3,1)}' +
    '.sh.open .sh-menu{opacity:1;transform:none;pointer-events:auto}' +
    '.sh.align-left .sh-menu,.sh.align-left .sh-toast{right:auto;left:0}' +
    '.sh-mi{display:flex;align-items:center;gap:11px;width:100%;text-align:left;background:none;border:none;border-radius:8px;padding:10px 11px;cursor:pointer;font-family:inherit;font-size:13.5px;color:#F2F3F7;text-decoration:none}' +
    '.sh-mi:hover{background:rgba(255,255,255,0.06)}' +
    '.sh-mi .ic{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;flex:none;background:rgba(255,255,255,0.06)}' +
    '.sh-mi .ic.tg{background:rgba(79,134,230,0.18)}.sh-mi .ic.wa{background:rgba(85,192,138,0.16)}.sh-mi .ic.pdf{background:rgba(238,125,27,0.16)}' +
    '.sh-mi small{display:block;color:rgba(242,243,247,0.42);font-size:11px;margin-top:1px}' +
    '.sh-sep{height:1px;background:rgba(255,255,255,0.07);margin:5px 8px}' +
    '.sh-toast{position:absolute;right:0;top:calc(100% + 8px);z-index:61;white-space:nowrap;display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:#55C08A;background:rgba(85,192,138,0.14);border:1px solid rgba(85,192,138,0.35);border-radius:8px;padding:7px 12px;opacity:0;transform:translateY(-4px);pointer-events:none;transition:opacity .2s,transform .2s}' +
    '.sh-toast.on{opacity:1;transform:none}' +
    '@media print{.sh{display:none !important}}';

  var injected = false;
  function injectCSS() {
    if (injected) return; injected = true;
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function emojiFor(label) {
    var l = (label || "").toLowerCase();
    if (l.indexOf("цена") >= 0 || l.indexOf("премия") >= 0) return "💰";
    if (l.indexOf("срок") >= 0) return "⏳";
    if (l.indexOf("страйк") >= 0) return "🎯";
    if (l.indexOf("потолок") >= 0) return "🚧";
    if (l.indexOf("убыток") >= 0 || l.indexOf("риск") >= 0) return "⚠️";
    if (l.indexOf("экспозиц") >= 0) return "📊";
    if (l.indexOf("доходност") >= 0) return "📈";
    if (l.indexOf("выплата") >= 0) return "💵";
    if (l.indexOf("защита") >= 0) return "🛡️";
    if (l.indexOf("участие") >= 0) return "📈";
    if (l.indexOf("потенциал") >= 0) return "🚀";
    if (l.indexOf("дисконт") >= 0) return "🏷️";
    if (l.indexOf("привязк") >= 0) return "🔗";
    if (l.indexOf("погашени") >= 0) return "📅";
    if (l.indexOf("купон") >= 0) return "🎟️";
    return "🔹";
  }
  function buildText(opts, title) {
    var rows = (opts.params || []).filter(function (p) { return p && p[1]; })
      .map(function (p) { return emojiFor(p[0]) + " " + cap(p[0]) + ": " + p[1]; });
    return (opts.name || title) + (opts.pitch ? "\n\n" + opts.pitch : "") + (rows.length ? "\n\n" + rows.join("\n") : "");
  }

  function attach(host, opts) {
    if (!host) return;
    injectCSS();
    var url = opts.url || location.href;
    var pdf = opts.pdf || null;
    var title = opts.title || document.title;
    var text = opts.text || buildText(opts, title);
    var u = encodeURIComponent(url), t = encodeURIComponent(text);
    var wrap = document.createElement("div");
    wrap.className = "sh";
    wrap.innerHTML =
      '<button class="sh-btn" type="button" aria-haspopup="true" aria-label="Поделиться">' + IC.share + 'Поделиться</button>' +
      '<div class="sh-menu" role="menu">' +
        '<button class="sh-mi" type="button" data-copy role="menuitem"><span class="ic">' + IC.link + '</span><span>Скопировать ссылку<small>на сайт</small></span></button>' +
        '<a class="sh-mi" role="menuitem" target="_blank" rel="noopener" href="https://t.me/share/url?url=' + u + '&text=' + t + '"><span class="ic tg">' + IC.tg + '</span><span>Отправить в Telegram</span></a>' +
        '<a class="sh-mi" role="menuitem" target="_blank" rel="noopener" href="https://wa.me/?text=' + t + '%20' + u + '"><span class="ic wa">' + IC.wa + '</span><span>Отправить в WhatsApp</span></a>' +
        (pdf ? '<div class="sh-sep"></div><a class="sh-mi" role="menuitem" target="_blank" rel="noopener" href="' + pdf + '"><span class="ic pdf">' + IC.pdf + '</span><span>One-pager (PDF)</span></a>' : "") +
      '</div>' +
      '<div class="sh-toast">' + IC.check + 'Ссылка скопирована</div>';
    host.innerHTML = "";
    host.appendChild(wrap);

    var btn = wrap.querySelector(".sh-btn"), toast = wrap.querySelector(".sh-toast");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!wrap.classList.contains("open")) {
        var r = btn.getBoundingClientRect();
        // открываем меню в ту сторону, где больше места (иначе уезжает за край на телефоне)
        wrap.classList.toggle("align-left", r.left < window.innerWidth / 2);
      }
      wrap.classList.toggle("open");
    });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) wrap.classList.remove("open"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") wrap.classList.remove("open"); });
    wrap.querySelector("[data-copy]").addEventListener("click", function () {
      var done = function () { wrap.classList.remove("open"); toast.classList.add("on"); setTimeout(function () { toast.classList.remove("on"); }, 2200); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
      else done();
    });
  }

  return { attach: attach };
})();
