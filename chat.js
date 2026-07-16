/* AI-ассистент (консьерж по сайту). Плавающая кнопка-«звезда» + панель, тёмная тема.
   Дизайн-язык ИИ: фирменная 4-лучевая звезда + искры, градиент оранжевый→синий, бейдж AI,
   подсказки-вопросы, пометка «может ошибаться» (не колл-центр: без зелёной точки «онлайн»).
   Бэкенд: Cloudflare Worker /chat → YandexGPT (ключи — секреты Cloudflare, не в репо).
   Подключение: <script src="chat.js?v=3"></script> перед </body>. Без зависимостей. */
(function () {
  "use strict";

  var CFG = {
    endpoint: "https://so-leads.ruslan-sabirov.workers.dev/chat",
    botUser: "Rumberb_Sales_Team_bot",
    metrikaId: 110759242,
    greeting: "Здравствуйте! Я AI-ассистент Rumberg: объясню, как устроены структурные продукты, и подскажу, где что на сайте.",
    suggestions: [
      "Чем автоколл отличается от ноты с защитой капитала?",
      "Где посмотреть уже размещённые выпуски?",
      "Как читать доску прайсинга?"
    ]
  };

  var css = "" +
    /* — кнопка-орб: тёмный круг, вращающееся градиентное кольцо, звёзды-искры, бейдж AI — */
    ".ca-btn{position:fixed;right:20px;bottom:20px;z-index:300;width:58px;height:58px;border:0;border-radius:50%;background:#101114;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 30px rgba(0,0,0,.5),0 0 22px rgba(238,125,27,.22);transition:transform .18s,box-shadow .18s;}" +
    ".ca-btn::before{content:\"\";position:absolute;inset:-2px;border-radius:50%;background:conic-gradient(from 0deg,#EE7D1B,#4F86E6,#EE7D1B);z-index:-1;animation:caSpin 7s linear infinite;}" +
    "@keyframes caSpin{to{transform:rotate(360deg);}}" +
    ".ca-btn:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(0,0,0,.55),0 0 30px rgba(238,125,27,.32);}" +
    ".ca-btn svg{display:block;}" +
    ".ca-btn .ca-ai{position:absolute;top:-4px;right:-4px;background:#4F86E6;color:#fff;font-family:'Onest',system-ui,sans-serif;font-size:9px;font-weight:700;letter-spacing:.05em;padding:2px 6px;border-radius:999px;border:2px solid #0B0C10;}" +
    ".ca-btn.hide{display:none;}" +
    "@media(prefers-reduced-motion:reduce){.ca-btn::before{animation:none;}}" +
    /* — панель — */
    ".ca-panel{position:fixed;right:20px;bottom:20px;z-index:301;width:376px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100dvh - 40px);background:#14161C;border:1px solid rgba(255,255,255,.12);border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden;font-family:'Onest',system-ui,sans-serif;opacity:0;transform:translateY(14px) scale(.98);transition:opacity .2s,transform .2s;pointer-events:none;}" +
    ".ca-panel.on{opacity:1;transform:none;pointer-events:auto;}" +
    ".ca-head{display:flex;align-items:center;gap:11px;padding:13px 16px;border-bottom:1px solid rgba(255,255,255,.09);flex:none;background:linear-gradient(180deg,rgba(238,125,27,.06),rgba(79,134,230,.04) 80%,transparent);}" +
    ".ca-ava{position:relative;width:38px;height:38px;border-radius:12px;background:#0B0C10;display:flex;align-items:center;justify-content:center;flex:none;}" +
    ".ca-ava::before{content:\"\";position:absolute;inset:-1.5px;border-radius:13px;background:conic-gradient(from 40deg,#EE7D1B,#4F86E6,#EE7D1B);z-index:-1;}" +
    ".ca-ttl-row{display:flex;align-items:center;gap:7px;}" +
    ".ca-ttl{font-family:'Rubik','Onest',sans-serif;font-weight:600;font-size:14.5px;color:#F2F3F7;}" +
    ".ca-chip{font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#8FB3F0;background:rgba(79,134,230,.14);border:1px solid rgba(79,134,230,.42);border-radius:5px;padding:2px 6px;}" +
    ".ca-sub{font-size:11px;color:rgba(242,243,247,.5);margin-top:1px;}" +
    ".ca-x{margin-left:auto;width:30px;height:30px;border:0;background:none;color:rgba(242,243,247,.55);font-size:20px;line-height:1;cursor:pointer;border-radius:8px;flex:none;}" +
    ".ca-x:hover{color:#F2F3F7;background:rgba(255,255,255,.06);}" +
    /* — лента сообщений — */
    ".ca-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;}" +
    ".ca-msg{max-width:86%;font-size:13.5px;line-height:1.55;padding:9px 13px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word;}" +
    ".ca-msg.u{align-self:flex-end;background:#EE7D1B;color:#0C0A08;border-bottom-right-radius:5px;}" +
    ".ca-msg.a{align-self:flex-start;background:rgba(255,255,255,.05);color:#F2F3F7;border:1px solid rgba(255,255,255,.08);border-bottom-left-radius:5px;}" +
    ".ca-msg.a a{color:#F58E33;}" +
    ".ca-msg.a b{color:#F2F3F7;font-weight:600;}" +
    /* — подсказки-вопросы — */
    ".ca-sug{display:flex;flex-direction:column;gap:8px;align-items:flex-start;}" +
    ".ca-sug button{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.03);color:rgba(242,243,247,.85);border-radius:12px;padding:8px 12px;font-family:inherit;font-size:12.5px;line-height:1.4;cursor:pointer;text-align:left;transition:border-color .15s,color .15s,background .15s;}" +
    ".ca-sug button:hover{border-color:rgba(238,125,27,.6);color:#fff;background:rgba(238,125,27,.06);}" +
    ".ca-sug button i{font-style:normal;color:#EE7D1B;margin-right:7px;}" +
    /* — «думает» — */
    ".ca-typing{align-self:flex-start;display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(255,255,255,.05);border-radius:14px;border-bottom-left-radius:5px;font-size:12px;color:rgba(242,243,247,.55);}" +
    ".ca-typing .st{color:#EE7D1B;animation:caPulse 1.1s ease-in-out infinite;}" +
    "@keyframes caPulse{0%,100%{opacity:.35;transform:scale(.9);}50%{opacity:1;transform:scale(1.08);}}" +
    /* — низ — */
    ".ca-foot{flex:none;border-top:1px solid rgba(255,255,255,.09);padding:10px 12px;}" +
    ".ca-row{display:flex;gap:8px;align-items:flex-end;}" +
    ".ca-in{flex:1;resize:none;max-height:96px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:12px;color:#F2F3F7;font-family:inherit;font-size:13.5px;line-height:1.4;padding:9px 12px;outline:none;}" +
    ".ca-in:focus{border-color:rgba(238,125,27,.6);}" +
    ".ca-send{flex:none;width:38px;height:38px;border:0;border-radius:11px;background:#EE7D1B;color:#0C0A08;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;}" +
    ".ca-send:hover{background:#F58E33;}.ca-send:disabled{opacity:.4;cursor:default;}" +
    ".ca-send svg{width:17px;height:17px;}" +
    ".ca-note{margin:7px 2px 0;font-size:10px;line-height:1.4;color:rgba(242,243,247,.38);text-align:center;}" +
    "@media(max-width:480px){.ca-panel{right:8px;bottom:8px;height:calc(100dvh - 16px);}}";

  function inject() {
    if (document.getElementById("ca-css")) return;
    var s = document.createElement("style"); s.id = "ca-css"; s.textContent = css;
    document.head.appendChild(s);
  }

  /* фирменная 4-лучевая звезда + малая искра (мотив ИИ, а не пузырь чата) */
  var ICON_STARS =
    '<svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">' +
    '<path d="M13 4 L15.4 12.6 L24 15 L15.4 17.4 L13 26 L10.6 17.4 L2 15 L10.6 12.6 Z" fill="#EE7D1B"/>' +
    '<path d="M23 3 L24.1 6.9 L28 8 L24.1 9.1 L23 13 L21.9 9.1 L18 8 L21.9 6.9 Z" fill="#4F86E6"/></svg>';
  var ICON_STAR_SM =
    '<svg width="18" height="18" viewBox="0 0 26 26" fill="none" aria-hidden="true">' +
    '<path d="M13 1 L15.6 10.4 L25 13 L15.6 15.6 L13 25 L10.4 15.6 L1 13 L10.4 10.4 Z" fill="#EE7D1B"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';

  var msgs = [];         // {role, content}
  var busy = false;
  var els = {};

  function goal(name) {
    if (typeof window.ym === "function") { try { window.ym(CFG.metrikaId, "reachGoal", name); } catch (e) {} }
  }

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  /* ИИ любит markdown-жирный — рендерим **…** как <b>, остальное экранируем */
  function fmt(s) { return esc(s).replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>"); }

  function addMsg(role, text) {
    var d = document.createElement("div");
    d.className = "ca-msg " + (role === "user" ? "u" : "a");
    d.innerHTML = role === "user" ? esc(text) : fmt(text);
    els.log.appendChild(d);
    els.log.scrollTop = els.log.scrollHeight;
    return d;
  }

  function showSuggestions() {
    var box = document.createElement("div");
    box.className = "ca-sug";
    CFG.suggestions.forEach(function (q) {
      var b = document.createElement("button");
      b.type = "button";
      b.innerHTML = "<i>✦</i>" + esc(q);
      b.addEventListener("click", function () { els.input.value = q; send(); });
      box.appendChild(b);
    });
    els.log.appendChild(box);
    els.sug = box;
    els.log.scrollTop = els.log.scrollHeight;
  }

  function showTyping() {
    var t = document.createElement("div");
    t.className = "ca-typing";
    t.innerHTML = '<span class="st">✦</span>думаю…';
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
    if (els.sug) { els.sug.remove(); els.sug = null; }
    msgs.push({ role: "user", content: text });
    addMsg("user", text);
    goal("chat_send");
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
          var r = "Кратко: **нота с защитой капитала** гарантирует возврат не менее заданной доли номинала на погашении и добавляет участие в росте базового актива — риск ограничен. **Автоколл** платит повышенный купон и может досрочно погаситься при росте актива, но защиты номинала обычно нет — риск выше. (демо-ответ)";
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
    btn.className = "ca-btn"; btn.setAttribute("aria-label", "Открыть AI-ассистента");
    btn.innerHTML = ICON_STARS + '<span class="ca-ai">AI</span>';

    var panel = document.createElement("div");
    panel.className = "ca-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "AI-ассистент");
    panel.innerHTML =
      '<div class="ca-head">' +
        '<span class="ca-ava">' + ICON_STAR_SM + '</span>' +
        '<div><div class="ca-ttl-row"><span class="ca-ttl">AI-ассистент</span><span class="ca-chip">beta</span></div>' +
        '<div class="ca-sub">Rumberg · структурные продукты</div></div>' +
        '<button class="ca-x" aria-label="Закрыть">&times;</button></div>' +
      '<div class="ca-log"></div>' +
      '<div class="ca-foot"><div class="ca-row">' +
        '<textarea class="ca-in" rows="1" placeholder="Спросите про продукт…" aria-label="Сообщение"></textarea>' +
        '<button class="ca-send" aria-label="Отправить">' + ICON_SEND + '</button>' +
      '</div><div class="ca-note">Отвечает ИИ — может ошибаться · Не является индивидуальной инвестиционной рекомендацией</div></div>';

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    els.log = panel.querySelector(".ca-log");
    els.input = panel.querySelector(".ca-in");
    els.send = panel.querySelector(".ca-send");

    var opened = false;
    function open() {
      panel.classList.add("on"); btn.classList.add("hide");
      if (!opened) { opened = true; addMsg("assistant", CFG.greeting); showSuggestions(); goal("chat_open"); }
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
