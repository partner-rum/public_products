# -*- coding: utf-8 -*-
"""
Рисует og-events-3.png — обложку превью для events.html (1200x630).
Имя с номером: Telegram кэширует превью по URL картинки и ?v= не понимает,
поэтому сброс кэша — только переименованием файла (и правкой тега в events.html).

Зачем отдельная: по ссылке на события в мессенджер уходила общая обложка витрины
(«Структурные продукты · можем запустить сейчас»), и человек не понимал, что его
зовут на встречу. Теперь в превью — тема ближайшего вебинара, дата и время.

Данные берутся из data/events.js: ближайшая ПРЕДСТОЯЩАЯ встреча. Прошли все —
рисуется нейтральная обложка раздела, без даты.

ВАЖНО: перерисовывать после каждой правки data/events.js и поднимать ?v= у
og:image в events.html — Telegram кэширует превью по URL картинки и сам за
изменениями не следит.

Запуск: python make_og_event.py [путь-к-репозиторию]
"""
import os, sys, re, json, socket, subprocess, threading, functools, http.server, shutil, datetime

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "og-events-3.png")
TPL_NAME = "_og_event_tmp.html"

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]
MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня",
          "июля", "августа", "сентября", "октября", "ноября", "декабря"]


def find_chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    for name in ("chrome", "msedge", "chromium"):
        p = shutil.which(name)
        if p:
            return p
    raise SystemExit("Chrome/Edge не найден — нужен для рендера PNG")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def serve(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def nearest_event():
    """Ближайшая встреча, которая ещё не прошла. Нет таких — None."""
    with open(os.path.join(ROOT, "data", "events.js"), encoding="utf-8") as f:
        s = f.read()
    data = json.loads(s[s.index("{"):s.rindex("}") + 1])
    today = datetime.date.today().isoformat()
    future = [e for e in data.get("items", []) if (e.get("date") or "") >= today]
    return min(future, key=lambda e: (e["date"], e.get("timeMsk") or "")) if future else None


def esc(s):
    return (str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def fit_size(title):
    """Заголовки встреч длинные — подбираем кегль, чтобы не выехать за 630px."""
    n = len(title)
    return 66 if n <= 34 else 56 if n <= 52 else 48 if n <= 74 else 42


def build_html(ev):
    if ev:
        d = datetime.date.fromisoformat(ev["date"])
        when = "%d %s · %s МСК" % (d.day, MONTHS[d.month - 1], ev.get("timeMsk", ""))
        kicker = "онлайн-встреча"
        title = ev.get("title", "События Rumberg")
        chips = [when]
        if ev.get("durationMin"):
            chips.append("%d минут" % ev["durationMin"])
        chips.append("вход свободный")
        sub = ev.get("speaker") or ""
    else:
        # Все встречи прошли — превью не должно обещать несуществующий эфир
        kicker = "события"
        title = "Встречи для агентов и партнёров"
        chips = ["расписание", "записи прошедших"]
        sub = ""
    chip_html = "".join(
        '<span class="chip%s">%s</span>' % (" hot" if i == 0 else "", esc(c))
        for i, c in enumerate(chips))
    return TEMPLATE.replace("{{KICKER}}", esc(kicker)) \
                   .replace("{{TITLE}}", esc(title)) \
                   .replace("{{SIZE}}", str(fit_size(title))) \
                   .replace("{{SUB}}", esc(sub)) \
                   .replace("{{CHIPS}}", chip_html)


TEMPLATE = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Rubik:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  :root{--bg:#0B0C10;--card:#14161C;--ink:#F2F3F7;--mut:rgba(242,243,247,.64);
    --mut2:rgba(242,243,247,.40);--bd:rgba(255,255,255,.11);--or:#EE7D1B;
    --f:'Onest',sans-serif;--m:'JetBrains Mono',monospace;--d:'Rubik',sans-serif;}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#22242b}
  body{display:flex;align-items:center;justify-content:center;min-height:100vh;
       color:var(--ink);font-family:var(--f);-webkit-font-smoothing:antialiased}
  .og{position:relative;width:1200px;height:630px;background:var(--bg);overflow:hidden;
      display:flex;flex-direction:column;padding:52px 60px;border-left:10px solid var(--or)}
  .grid{position:absolute;inset:0;opacity:.55;
    background:linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px) 0 0/100% 42px}
  .glow{position:absolute;right:-140px;bottom:-200px;width:660px;height:660px;border-radius:50%;
    background:radial-gradient(circle,rgba(238,125,27,.22),transparent 62%);filter:blur(6px)}
  .top{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center}
  .wm{display:inline-flex;align-items:center;gap:12px;font-family:var(--d);font-weight:700;
      font-size:23px;letter-spacing:.16em}
  .dot{width:11px;height:11px;border-radius:50%;background:var(--or);box-shadow:0 0 16px var(--or)}
  .qual{font-family:var(--m);font-size:12px;letter-spacing:.1em;color:var(--mut2);text-transform:uppercase}
  .mid{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;justify-content:center}
  .kick{font-family:var(--m);font-size:15px;letter-spacing:.2em;text-transform:uppercase;
        color:var(--or);margin-bottom:22px;display:flex;align-items:center;gap:11px}
  .kick .live{width:9px;height:9px;border-radius:50%;background:var(--or);box-shadow:0 0 0 5px rgba(238,125,27,.18)}
  h1{font-family:var(--d);font-weight:800;line-height:1.06;letter-spacing:-.025em;
     font-size:{{SIZE}}px;max-width:1010px}
  .sub{font-size:22px;color:var(--mut);margin-top:20px}
  .bot{position:relative;z-index:2;display:flex;align-items:center;gap:12px}
  .chip{background:var(--card);border:1px solid var(--bd);border-radius:10px;
        padding:11px 20px;font-size:19px;color:var(--ink);white-space:nowrap}
  .chip.hot{background:var(--or);border-color:var(--or);color:#0C0A08;font-weight:600}
  .site{margin-left:auto;font-family:var(--m);font-size:15px;color:var(--mut2);letter-spacing:.02em}
</style>
</head>
<body>
<div class="og">
  <div class="grid"></div><div class="glow"></div>
  <div class="top">
    <span class="wm"><span class="dot"></span>RUMBERG</span>
    <span class="qual">только для квалифицированных инвесторов</span>
  </div>
  <div class="mid">
    <div class="kick"><span class="live"></span>{{KICKER}}</div>
    <h1>{{TITLE}}</h1>
    <div class="sub">{{SUB}}</div>
  </div>
  <div class="bot">
    {{CHIPS}}
    <span class="site">invest.rumberg.ru</span>
  </div>
</div>
</body>
</html>
"""


def main():
    ev = nearest_event()
    print("ближайшая встреча: " + (ev["title"] + " (" + ev["date"] + ")" if ev else "нет — рисую обложку раздела"))
    chrome = find_chrome()
    tpl_path = os.path.join(ROOT, TPL_NAME)
    with open(tpl_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(build_html(ev))
    port = free_port()
    srv = serve(port)
    profile = os.path.join(os.environ.get("TEMP", "/tmp"), "chr-og-event")
    try:
        cmd = [chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
               "--force-device-scale-factor=1", "--window-size=1200,630",
               "--virtual-time-budget=5000", "--user-data-dir=" + profile,
               "--screenshot=" + OUT, "http://127.0.0.1:%d/%s" % (port, TPL_NAME)]
        subprocess.run(cmd, capture_output=True)
    finally:
        srv.shutdown()
        try:
            os.remove(tpl_path)
        except OSError:
            pass
    if os.path.exists(OUT) and os.path.getsize(OUT) > 8000:
        print("готово: %s (%.0f КБ)" % (OUT, os.path.getsize(OUT) / 1024))
        print("превью кэшируется по URL картинки: изменил обложку — ПЕРЕИМЕНУЙ файл и поправь og:image в events.html (?v= скрейпер Telegram не берёт)")
    else:
        raise SystemExit("рендер не удался")


if __name__ == "__main__":
    main()
