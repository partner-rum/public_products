/* Чат-ассистент (консьерж по сайту). Плавающая кнопка + панель, тёмная тема.
   Бэкенд: Cloudflare Worker /chat → Claude API (ключ — секрет Cloudflare, не в репо).
   Подключение: <script src="chat.js?v=1"></script> перед </body>. Без зависимостей. */
(function () {
  "use strict";

  var CFG = {
    endpoint: "https://so-leads.ruslan-sabirov.workers.dev/chat",
    botUser: "Rumberb_Sales_Team_bot",
    greeting: "Здравствуйте! Я помогу разобраться в продуктах и подскажу, где что на сайте. Спросите что угодно — например: «чем нота с защитой капитала отличается от автоколла?»"
  };

  var css = "" +
    ".ca-btn{position:fixed;right:20px;bottom:20px;z-index:300;width:56px;height:56px;border:0;border-radius:50%;background:#EE7D1B;color:#0C0A08;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;transition:transform .18s,background .18s;}" +
    ".ca-btn:hover{background:#F58E33;transform:translateY(-2px);}" +
    ".ca-btn svg{width:26px;height:26px;display:block;}" +
    ".ca-btn.hide{display:none;}" +
    ".ca-panel{position:fixed;right:20px;bottom:20px;z-index:301;width:370px;max-width:calc(100vw - 32px);height:540px;max-height:calc(100dvh - 40px);background:#14161C;border:1px solid rgba(255,255,255,.12);border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden;font-family:'Onest',system-ui,sans-serif;opacity:0;transform:translateY(14px) scale(.98);transition:opacity .2s,transform .2s;pointer-events:none;}" +
    ".ca-panel.on{opacity:1;transform:none;pointer-events:auto;}" +
    ".ca-head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.09);flex:none;}" +
    ".ca-dot{width:8px;height:8px;border-radius:50%;background:#55C08A;flex:none;box-shadow:0 0 0 3px rgba(85,192,138,.18);}" +
    ".ca-ttl{font-family:'Rubik','Onest',sans-serif;font-weight:600;font-size:14.5px;color:#F2F3F7;}" +
    ".ca-sub{font-size:11px;color:rgba(242,243,247,.5);}" +
    ".ca-x{margin-left:auto;width:30px;height:30px;border:0;background:none;color:rgba(242,243,247,.55);font-size:20px;line-height:1;cursor:pointer;border-radius:8px;}" +
    ".ca-x:hover{color:#F2F3F7;background:rgba(255,255,255,.06);}" +
    ".ca-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;}" +
    ".ca-msg{max-width:86%;font-size:13.5px;line-height:1.55;padding:9px 13px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word;}" +
    ".ca-msg.u{align-self:flex-end;background:#EE7D1B;color:#0C0A08;border-bottom-right-radius:5px;}" +
    ".ca-msg.a{align-self:flex-start;background:rgba(255,255,255,.05);color:#F2F3F7;border:1px solid rgba(255,255,255,.08);border-bottom-left-radius:5px;}" +
    ".ca-msg.a a{color:#F58E33;}" +
    ".ca-typing{align-self:flex-start;display:flex;gap:4px;padding:11px 14px;background:rgba(255,255,255,.05);border-radius:14px;border-bottom-left-radius:5px;}" +
    ".ca-typing i{width:6px;height:6px;border-radius:50%;background:rgba(242,243,247,.5);animation:caBlink 1.2s infinite;}" +
    ".ca-typing i:nth-child(2){animation-delay:.2s;}.ca-typing i:nth-child(3){animation-delay:.4s;}" +
    "@keyframes caBlink{0%,60%,100%{opacity:.25;}30%{opacity:1;}}" +
    ".ca-foot{flex:none;border-top:1px solid rgba(255,255,255,.09);padding:10px 12px;}" +
    ".ca-row{display:flex;gap:8px;align-items:flex-end;}" +
    ".ca-in{flex:1;resize:none;max-height:96px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:12px;color:#F2F3F7;font-family:inherit;font-size:13.5px;line-height:1.4;padding:9px 12px;outline:none;}" +
    ".ca-in:focus{border-color:rgba(238,125,27,.6);}" +
    ".ca-send{flex:none;width:38px;height:38px;border:0;border-radius:11px;background:#EE7D1B;color:#0C0A08;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;}" +
    ".ca-send:hover{background:#F58E33;}.ca-send:disabled{opacity:.4;cursor:default;}" +
    ".ca-send svg{width:17px;height:17px;}" +
    ".ca-note{margin:7px 2px 0;font-size:10px;line-height:1.35;color:rgba(242,243,247,.38);text-align:center;}" +
    "@media(max-width:480px){.ca-panel{right:8px;bottom:8px;height:calc(100dvh - 16px);}}";

  function inject() {
    if (document.getElementById("ca-css")) return;
    var s = document.createElement("style"); s.id = "ca-css"; s.textContent = css;
    document.head.appendChild(s);
  }

  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6A8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';

  var msgs = [];         // {role, content}
  var busy = false;
  var els = {};

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function addMsg(role, text) {
    var d = document.createElement("div");
    d.className = "ca-msg " + (role === "user" ? "u" : "a");
    d.innerHTML = esc(text);
    els.log.appendChild(d);
    els.log.scrollTop = els.log.scrollHeight;
    return d;
  }

  function showTyping() {
    var t = document.createElement("div");
    t.className = "ca-typing"; t.innerHTML = "<i></i><i></i><i></i>";
    els.log.appendChild(t); els.log.scrollTop = els.log.scrollHeight;
    return t;
  }

  function fallbackReply() {
    return 'Извините, ассистент сейчас недоступен. Напишите нам в Telegram: ' +
      '<a href="https://t.me/' + CFG.botUser + '" target="_blank" rel="noopener">@' + CFG.botUser + '</a> — менеджер ответит.';
  }

  function regionReply() {
    return 'Чат-ассистент пока доступен не во всех регионах. Но я подключу вас к менеджеру — ' +
      'напишите в Telegram: <a href="https://t.me/' + CFG.botUser + '" target="_blank" rel="noopener">@' + CFG.botUser +
      '</a>, ответим на любой вопрос по продуктам.';
  }

  function send() {
    if (busy) return;
    var text = els.input.value.trim();
    if (!text) return;
    els.input.value = ""; els.input.style.height = "auto";
    msgs.push({ role: "user", content: text });
    addMsg("user", text);
    busy = true; els.send.disabled = true;
    var typing = showTyping();

    // Демо-режим (только локально): ?chatdemo=blocked — вид для заблокированного региона;
    // ?chatdemo=ok — обычный ответ. Реального обращения к бэкенду не делает.
    var demo = (location.search.match(/[?&]chatdemo=(\w+)/) || [])[1];
    if (demo) {
      setTimeout(function () {
        typing.remove();
        if (demo === "blocked") {
          addMsg("assistant", "").innerHTML = regionReply();
        } else {
          var r = "Кратко: нота с защитой капитала гарантирует возврат не менее заданной доли номинала на погашении и добавляет участие в росте базового актива — риск ограничен. Автоколл платит повышенный купон и может досрочно погаситься при росте актива, но защиты номинала обычно нет — риск выше. (демо-ответ)";
          msgs.push({ role: "assistant", content: r }); addMsg("assistant", r);
        }
        busy = false; els.send.disabled = false; els.input.focus();
      }, 700);
      return;
    }

    fetch(CFG.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: msgs.slice(-20), page: { title: document.title, url: location.href } })
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (data) {
        typing.remove();
        var reply = (data && data.reply) ? data.reply : "";
        if (reply) { msgs.push({ role: "assistant", content: reply }); addMsg("assistant", reply); }
        else if (data && data.error === "region_unavailable") { addMsg("assistant", "").innerHTML = regionReply(); }
        else { addMsg("assistant", "").innerHTML = fallbackReply(); }
      })
      .catch(function () {
        typing.remove();
        var d = addMsg("assistant", ""); d.innerHTML = fallbackReply();
      })
      .finally(function () { busy = false; els.send.disabled = false; els.input.focus(); });
  }

  function build() {
    inject();
    var btn = document.createElement("button");
    btn.className = "ca-btn"; btn.setAttribute("aria-label", "Открыть чат с ассистентом");
    btn.innerHTML = ICON_CHAT;

    var panel = document.createElement("div");
    panel.className = "ca-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Чат-ассистент");
    panel.innerHTML =
      '<div class="ca-head"><span class="ca-dot"></span>' +
        '<div><div class="ca-ttl">Ассистент</div><div class="ca-sub">Rumberg · структурные продукты</div></div>' +
        '<button class="ca-x" aria-label="Закрыть">&times;</button></div>' +
      '<div class="ca-log"></div>' +
      '<div class="ca-foot"><div class="ca-row">' +
        '<textarea class="ca-in" rows="1" placeholder="Спросите про продукт…" aria-label="Сообщение"></textarea>' +
        '<button class="ca-send" aria-label="Отправить">' + ICON_SEND + '</button>' +
      '</div><div class="ca-note">Не является индивидуальной инвестиционной рекомендацией</div></div>';

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    els.log = panel.querySelector(".ca-log");
    els.input = panel.querySelector(".ca-in");
    els.send = panel.querySelector(".ca-send");

    var opened = false;
    function open() {
      panel.classList.add("on"); btn.classList.add("hide");
      if (!opened) { opened = true; addMsg("assistant", CFG.greeting); }
      setTimeout(function () { els.input.focus(); }, 150);
    }
    function close() { panel.classList.remove("on"); btn.classList.remove("hide"); }

    btn.addEventListener("click", open);
    panel.querySelector(".ca-x").addEventListener("click", close);
    els.send.addEventListener("click", send);
    els.input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });
    els.input.addEventListener("input", function () {
      els.input.style.height = "auto";
      els.input.style.height = Math.min(els.input.scrollHeight, 96) + "px";
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("on")) close(); });

    window.Chat = { open: open, close: close };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
