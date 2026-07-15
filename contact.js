// Модуль «Обсудить продукт»: основная CTA на карточке продукта — самый короткий путь к сделке.
// Форма-заявка уходит в Telegram через Cloudflare Worker (см. bot/). Плюс прямые кнопки Telegram/WhatsApp.
// Хосты тёмные — палитра светлая, акцент оранжевый. Использование: Contact.attach(host, { title, url, id }).
window.Contact = (function () {
  // ⚙️ НАСТРОЙКА (заполнить после создания бота и деплоя Worker'а):
  var CFG = {
    botUser: "Rumberb_Sales_Team_bot",                             // t.me/Rumberb_Sales_Team_bot
    waPhone: "",                                                   // WhatsApp менеджера (пусто → кнопка скрыта)
    endpoint: "https://so-leads.ruslan-sabirov.workers.dev/lead"   // Cloudflare Worker (приём заявок)
  };

  var IC = {
    chat: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0C0A08" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/></svg>',
    tg: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8FB4F0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3 2 10.5l6 2.2M22 3 15 21l-3.5-7.3M22 3 8 12.7v4.8l3.5-3.8"/></svg>',
    wa: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7FD3AC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 5.5 15.5A8 8 0 1 1 8.5 18.5z"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 6"/></svg>',
    warn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>'
  };

  var CSS =
    '.ct{position:relative;display:inline-flex}' +
    '.ct-btn{display:inline-flex;align-items:center;gap:8px;background:#EE7D1B;color:#0C0A08;border:none;border-radius:8px;padding:11px 18px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:background .2s}' +
    '.ct-btn:hover{background:#F58E33}' +
    '.ct-btn svg{display:block}' +
    '.ct-menu{position:absolute;left:0;top:calc(100% + 10px);z-index:70;width:302px;max-width:calc(100vw - 24px);background:#1B1D26;border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:14px;box-shadow:0 18px 46px rgba(0,0,0,0.55);opacity:0;transform:translateY(-6px);pointer-events:none;transition:opacity .18s ease,transform .18s cubic-bezier(0.16,1,0.3,1)}' +
    '.ct.open .ct-menu{opacity:1;transform:none;pointer-events:auto}' +
    '.ct-lead{font-size:12.5px;line-height:1.45;color:rgba(242,243,247,0.62);margin-bottom:11px}' +
    '.ct-mi{display:flex;align-items:center;gap:11px;width:100%;text-align:left;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:9px;padding:10px 12px;cursor:pointer;font-family:inherit;font-size:13.5px;color:#F2F3F7;text-decoration:none;margin-bottom:7px}' +
    '.ct-mi:hover{background:rgba(255,255,255,0.08)}' +
    '.ct-mi .ic{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;flex:none;background:rgba(255,255,255,0.06)}' +
    '.ct-mi .ic.tg{background:rgba(79,134,230,0.18)}.ct-mi .ic.wa{background:rgba(85,192,138,0.16)}' +
    '.ct-sep{display:flex;align-items:center;gap:10px;margin:12px 2px 10px;color:rgba(242,243,247,0.4);font-size:11.5px;white-space:nowrap}' +
    '.ct-sep::before,.ct-sep::after{content:"";height:1px;flex:1;background:rgba(255,255,255,0.1)}' +
    '.ct-form{display:flex;flex-direction:column;gap:8px}' +
    '.ct-inp{width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.14);border-radius:9px;padding:10px 12px;color:#F2F3F7;font-family:inherit;font-size:13.5px;outline:none}' +
    '.ct-inp::placeholder{color:rgba(242,243,247,0.4)}' +
    '.ct-inp:focus{border-color:rgba(238,125,27,0.6)}' +
    '.ct-send{margin-top:2px;background:#EE7D1B;color:#0C0A08;border:none;border-radius:9px;padding:11px;font-family:inherit;font-size:13.5px;font-weight:600;cursor:pointer;transition:background .2s}' +
    '.ct-send:hover{background:#F58E33}' +
    '.ct-send:disabled{opacity:.6;cursor:default}' +
    '.ct-note{margin-top:10px;font-size:11px;line-height:1.4;color:rgba(242,243,247,0.38)}' +
    '.ct-toast{position:absolute;left:0;top:calc(100% + 10px);z-index:71;max-width:302px;display:inline-flex;align-items:center;gap:8px;font-size:13px;line-height:1.35;color:#55C08A;background:rgba(85,192,138,0.14);border:1px solid rgba(85,192,138,0.35);border-radius:9px;padding:10px 14px;opacity:0;transform:translateY(-6px);pointer-events:none;transition:opacity .2s,transform .2s}' +
    '.ct-toast.on{opacity:1;transform:none}' +
    '.ct-toast.err{color:#E0705A;background:rgba(224,112,90,0.14);border-color:rgba(224,112,90,0.4)}' +
    '@media print{.ct{display:none !important}}';

  var injected = false;
  function injectCSS() {
    if (injected) return; injected = true;
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  }

  function attach(host, opts) {
    if (!host) return;
    injectCSS();
    opts = opts || {};
    var title = opts.title || document.title;
    var url = opts.url || location.href;
    var startPayload = String(opts.id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
    var msg = "Здравствуйте! Интересует продукт: " + title + ".\n" + url + "\nРасскажите, пожалуйста, подробнее об условиях и как оформить.";
    var m = encodeURIComponent(msg);

    var tgRow = CFG.botUser
      ? '<a class="ct-mi" target="_blank" rel="noopener" href="https://t.me/' + CFG.botUser + (startPayload ? "?start=" + startPayload : "") + '"><span class="ic tg">' + IC.tg + '</span><span>Написать в Telegram</span></a>'
      : "";
    var waRow = CFG.waPhone
      ? '<a class="ct-mi" target="_blank" rel="noopener" href="https://wa.me/' + CFG.waPhone + '?text=' + m + '"><span class="ic wa">' + IC.wa + '</span><span>Написать в WhatsApp</span></a>'
      : "";
    var sepText = (tgRow || waRow) ? "или оставьте заявку" : "оставьте заявку — свяжемся сами";

    var wrap = document.createElement("div");
    wrap.className = "ct";
    wrap.innerHTML =
      '<button class="ct-btn" type="button" aria-haspopup="dialog">' + IC.chat + 'Обсудить продукт</button>' +
      '<div class="ct-menu" role="dialog" aria-label="Обсудить продукт">' +
        '<div class="ct-lead">Задайте вопрос менеджеру или оставьте заявку — свяжемся в течение рабочего дня.</div>' +
        tgRow + waRow +
        '<div class="ct-sep"><span>' + sepText + '</span></div>' +
        '<form class="ct-form" novalidate>' +
          '<input class="ct-inp" name="name" placeholder="Ваше имя" autocomplete="name">' +
          '<input class="ct-inp" name="contact" placeholder="Телефон или @Telegram" autocomplete="tel">' +
          '<button class="ct-send" type="submit">Оставить заявку</button>' +
        '</form>' +
        (CFG.endpoint ? "" : '<div class="ct-note">Демо: подключите Telegram-бота (см. bot/README), чтобы заявки приходили менеджеру.</div>') +
      '</div>' +
      '<div class="ct-toast"><span class="ct-tic"></span><span class="ct-tmsg"></span></div>';
    host.innerHTML = "";
    host.appendChild(wrap);

    var btn = wrap.querySelector(".ct-btn"),
        toast = wrap.querySelector(".ct-toast"),
        tIcon = wrap.querySelector(".ct-tic"),
        tMsg = wrap.querySelector(".ct-tmsg"),
        form = wrap.querySelector(".ct-form"),
        sendBtn = wrap.querySelector(".ct-send");

    var toastTimer = null;
    function showToast(ok, text) {
      tIcon.innerHTML = ok ? IC.check : IC.warn;
      tMsg.textContent = text;
      toast.classList.toggle("err", !ok);
      toast.classList.add("on");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast.classList.remove("on"); }, 3600);
    }

    btn.addEventListener("click", function (e) { e.stopPropagation(); wrap.classList.toggle("open"); });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) wrap.classList.remove("open"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") wrap.classList.remove("open"); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var contactEl = form.querySelector('[name="contact"]'),
          nameEl = form.querySelector('[name="name"]');
      var contact = contactEl.value.trim();
      if (!contact) { contactEl.focus(); return; }

      // Демо-режим (бот ещё не подключён): показываем успех локально.
      if (!CFG.endpoint) {
        wrap.classList.remove("open");
        showToast(true, "Заявка принята — менеджер свяжется с вами");
        form.reset();
        return;
      }

      var payload = { name: nameEl.value.trim(), contact: contact, product: title, url: url };
      sendBtn.disabled = true;
      var oldLabel = sendBtn.textContent;
      sendBtn.textContent = "Отправляем…";

      fetch(CFG.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(function (r) {
        return r.ok;
      }).catch(function () {
        return false;
      }).then(function (ok) {
        sendBtn.disabled = false;
        sendBtn.textContent = oldLabel;
        if (ok) {
          wrap.classList.remove("open");
          showToast(true, "Заявка принята — менеджер свяжется с вами");
          form.reset();
        } else {
          showToast(false, "Не удалось отправить. Напишите нам в Telegram или WhatsApp.");
        }
      });
    });
  }

  return { attach: attach };
})();
