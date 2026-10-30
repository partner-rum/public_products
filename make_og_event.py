# -*- coding: utf-8 -*-
"""
Рисует og-events-7.png — обложку превью для events.html (1200x630).
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
OUT = os.path.join(ROOT, "og-events-7.png")
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
    # Тело ищем ОТ `window.EVENTS =`, а не по первой «{» в файле: в шапке
    # events.js есть комментарий с примером `[{url, label}, …]`, и поиск по
    # первой скобке ломался на нём (JSONDecodeError на первом же символе).
    m = re.search(r"window\.EVENTS\s*=\s*", s)
    if not m:
        raise SystemExit("в data/events.js не найдено `window.EVENTS =`")
    data = json.loads(s[m.end():].strip().rstrip(";"))
    today = datetime.date.today().isoformat()
    future = [e for e in data.get("items", []) if (e.get("date") or "") >= today]
    return min(future, key=lambda e: (e["date"], e.get("timeMsk") or "")) if future else None


def nb(s):
    """Короткие предлоги и союзы не оставляем в конце строки: «в», «и», «на» —
    неразрывный пробел после них (заголовок переносится браузером сам)."""
    return re.sub(r"(?<![\w-])([А-Яа-яЁёA-Za-z]{1,2}) ", "\\1\u00a0", str(s or ""))


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
        kicker = "Онлайн-встреча"
        title = ev.get("title", "События Rumberg")
        chips = [when]
        if ev.get("durationMin"):
            chips.append("%d минут" % ev["durationMin"])
        chips.append("вход свободный")
        # ogSub — своя строка под заголовком (спикер с регалией); без неё — имя спикера
        sub = ev.get("ogSub") or ev.get("speaker") or ""
    else:
        # Все встречи прошли — превью не должно обещать несуществующий эфир
        kicker = "События"
        title = "Встречи для агентов и партнёров"
        chips = ["расписание", "записи прошедших"]
        sub = ""
    chip_html = "".join(
        '<span class="chip%s">%s</span>' % (" hot" if i == 0 else "", esc(c))
        for i, c in enumerate(chips))
    return TEMPLATE.replace("{{KICKER}}", esc(kicker)) \
                   .replace("{{TITLE}}", esc(nb(title))) \
                   .replace("{{SIZE}}", str(fit_size(title))) \
                   .replace("{{SUB}}", esc(sub)) \
                   .replace("{{CHIPS}}", chip_html)


TEMPLATE = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<link href="fonts/fonts.css?v=2" rel="stylesheet">
<link href="brand/brand.css?v=1" rel="stylesheet">
<style>
  /* Палитра и гарнитура — по брендбуку Rumberg Capital (как на сайте с 29.10.2026):
     фон #191A2F, оранжевый #F06E08 только на главном, заголовок Montserrat,
     прямые углы 2px, без свечений */
  :root{--bg:#191A2F;--card:#22243B;--ink:#F2F3F7;--mut:rgba(242,243,247,.70);
    --mut2:rgba(242,243,247,.46);--bd:rgba(255,255,255,.12);--or:#F06E08;
    --f:'Onest',sans-serif;--m:'JetBrains Mono',monospace;--d:'Montserrat',sans-serif;}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#2a2c44}
  body{display:flex;align-items:center;justify-content:center;min-height:100vh;
       color:var(--ink);font-family:var(--f);-webkit-font-smoothing:antialiased}
  .og{position:relative;width:1200px;height:630px;overflow:hidden;
      background:linear-gradient(135deg,#191A2F 0%,#1B1C35 55%,#22244A 100%);
      display:flex;flex-direction:column;padding:56px 64px}
  .grid{position:absolute;inset:0;
    background:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px) 0 0/48px 48px,
               linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px) 0 0/48px 48px;
    -webkit-mask:linear-gradient(110deg,transparent 35%,#000 100%);mask:linear-gradient(110deg,transparent 35%,#000 100%)}
  .top{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center}
  .logo{height:38px;width:150px;background:url(brand/logo.svg) left center/contain no-repeat}
  .qual{font-size:15px;color:var(--mut2)}
  .mid{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;justify-content:center}
  .kick{font-size:22px;color:var(--mut);margin-bottom:20px;display:flex;align-items:center;gap:12px}
  .kick .sq{width:10px;height:10px;background:var(--or)}
  h1{font-family:var(--d);font-weight:600;line-height:1.1;letter-spacing:-.01em;
     font-size:{{SIZE}}px;max-width:1040px}
  .sub{font-size:23px;line-height:1.4;color:var(--mut);margin-top:20px;max-width:920px}
  .bot{position:relative;z-index:2;display:flex;align-items:center;gap:12px}
  .chip{border:1px solid var(--bd);background:rgba(34,36,59,.85);border-radius:2px;
        padding:11px 18px;font-size:19px;color:var(--ink);white-space:nowrap}
  .chip.hot{background:var(--or);border-color:var(--or);color:#191A2F;font-weight:600}
  .site{margin-left:auto;font-family:var(--m);font-size:21px;color:var(--mut);letter-spacing:.01em}
</style>
</head>
<body>
<div class="og">
  <div class="grid"></div>
  <div class="top">
    <span class="logo" role="img" aria-label="Rumberg Capital"></span>
    <span class="qual">только для квалифицированных инвесторов</span>
  </div>
  <div class="mid">
    <div class="kick"><span class="sq"></span>{{KICKER}}</div>
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
