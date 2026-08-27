# -*- coding: utf-8 -*-
"""
Рисует og-ideas.png — обложку превью для ideas.html (1200x630).

Зачем отдельная: по ссылке на разборы в мессенджер уходила общая обложка витрины
(«Структурные продукты · можем запустить сейчас»), и человек не понимал, что его
зовут читать разбор компаний. Теперь в превью — тема выпуска и тикеры разобранных
компаний, окрашенные по слою стека.

Проценты потенциала в превью НЕ выводим намеренно: у картинки в мессенджере нет
мелкого шрифта под цифрой, и «+40%» без даты расчёта и оговорки «не ИИР» читается
как обещание доходности. На самой странице цифра стоит рядом с базой расчёта и
дисклеймерами — там это корректно.

Данные берутся из data/ideas.js: текущий (нулевой) выпуск.

Формат — JPEG: PNG на 87 КБ Telegram в превью не брал, хотя файл отдавался
корректно. JPEG весит вдвое меньше и принимается всеми клиентами.

ВАЖНО: превью кэшируется по URL картинки, и query-строку (?v=) скрейпер Telegram
не понимает. Перерисовал обложку — ПЕРЕИМЕНУЙ файл (og-ideas-2.jpg) и поправь
og:image в ideas.html.

Запуск: python make_og_ideas.py [путь-к-репозиторию]
"""
import datetime
import functools
import http.server
import json
import os
import shutil
import socket
import subprocess
import sys
import threading

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "og-ideas-2.jpg")
# Chrome умеет снимать только PNG — снимаем во временный файл и сжимаем.
RAW = os.path.join(ROOT, "_og_ideas_raw.png")
TPL_NAME = "_og_ideas_tmp.html"
# Целевой вес превью. PNG на 87 КБ Telegram не забирал; JPEG вдвое легче,
# и такие обложки принимают все клиенты.
TARGET_KB = 60

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]
MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня",
          "июля", "августа", "сентября", "октября", "ноября", "декабря"]

# Цвета слоёв стека повторяют ideas.html: в данных лежит только ключ слоя.
LAYER_COLOR = {"chips": "#EE7D1B", "iron": "#4F86E6", "cloud": "#55C08A",
               "fin": "#4F86E6", "domestic": "#EE7D1B", "export": "#55C08A"}


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


def current_issue():
    with open(os.path.join(ROOT, "data", "ideas.js"), encoding="utf-8") as f:
        s = f.read()
    data = json.loads(s[s.index("{"):s.rindex("}") + 1])
    issues = data.get("issues") or []
    if not issues:
        raise SystemExit("В data/ideas.js нет выпусков — нечего рисовать")
    return issues[0]


def esc(s):
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def plural(n, one, few, many):
    m10, m100 = n % 10, n % 100
    if m10 == 1 and m100 != 11:
        return "%d %s" % (n, one)
    if 2 <= m10 <= 4 and not (12 <= m100 <= 14):
        return "%d %s" % (n, few)
    return "%d %s" % (n, many)


def fit_size(title):
    """Темы бывают длинные («Электрификация и накопители энергии») — подбираем кегль."""
    n = len(title)
    return 84 if n <= 20 else 72 if n <= 30 else 60 if n <= 42 else 50


def human(iso):
    try:
        d = datetime.date.fromisoformat(str(iso))
    except ValueError:
        return ""
    return "%d %s" % (d.day, MONTHS[d.month - 1])


def build_html(iss):
    items = iss.get("items") or []
    title = iss.get("title") or "Разборы"

    tickers = "".join(
        '<span class="tk" style="--c:%s">%s</span>'
        % (LAYER_COLOR.get(x.get("layer"), "#EE7D1B"), esc(x.get("ticker", "")))
        for x in items)

    layers = len({x.get("layer") for x in items if x.get("layer")})
    chips = [plural(len(items), "компания", "компании", "компаний"),
             plural(layers, "группа", "группы", "групп"),
             "целевые цены на 12 месяцев"]
    chip_html = "".join(
        '<span class="chip%s">%s</span>' % (" hot" if i == 0 else "", esc(c))
        for i, c in enumerate(chips))

    kicker = "разбор темы"
    when = human(iss.get("date"))
    if when:
        kicker += " · " + when

    return (TEMPLATE
            .replace("{{KICKER}}", esc(kicker))
            .replace("{{TITLE}}", esc(title))
            .replace("{{SIZE}}", str(fit_size(title)))
            .replace("{{SUB}}", esc(iss.get("ogSub") or
                                    "Компании по всей цепочке — от памяти и ускорителей "
                                    "до дата-центров"))
            .replace("{{TICKERS}}", tickers)
            .replace("{{CHIPS}}", chip_html))


TEMPLATE = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Rubik:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  :root{--bg:#0B0C10;--card:#14161C;--ink:#F2F3F7;--mut:rgba(242,243,247,.64);
    --mut2:rgba(242,243,247,.40);--bd:rgba(255,255,255,.11);--or:#EE7D1B;
    --f:'Onest',sans-serif;--m:'JetBrains Mono',monospace;--d:'Rubik',sans-serif;}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#22242b}
  body{display:flex;align-items:center;justify-content:center;min-height:100vh;
       color:var(--ink);font-family:var(--f);-webkit-font-smoothing:antialiased}
  .og{position:relative;width:1200px;height:630px;background:var(--bg);overflow:hidden;
      display:flex;flex-direction:column;padding:50px 58px;border-left:10px solid var(--or)}
  .grid{position:absolute;inset:0;opacity:.55;
    background:linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px) 0 0/100% 42px}
  .glow{position:absolute;right:-160px;top:-180px;width:700px;height:700px;border-radius:50%;
    background:radial-gradient(circle,rgba(238,125,27,.20),transparent 62%);filter:blur(6px)}
  /* Полоса-«стек» справа: три цвета слоёв, тот же порядок, что на странице */
  .spine{position:absolute;right:0;top:0;bottom:0;width:6px;
    background:linear-gradient(180deg,#EE7D1B 0 34%,#4F86E6 34% 60%,#55C08A 60% 100%);opacity:.75}
  .top{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center}
  .wm{display:inline-flex;align-items:center;gap:12px;font-family:var(--d);font-weight:700;
      font-size:23px;letter-spacing:.16em}
  .dot{width:11px;height:11px;border-radius:50%;background:var(--or);box-shadow:0 0 16px var(--or)}
  .qual{font-family:var(--m);font-size:12px;letter-spacing:.1em;color:var(--mut2);text-transform:uppercase}
  .mid{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;justify-content:center}
  .kick{font-family:var(--m);font-size:15px;letter-spacing:.2em;text-transform:uppercase;
        color:var(--or);margin-bottom:20px}
  h1{font-family:var(--d);font-weight:800;line-height:1.04;letter-spacing:-.03em;
     font-size:{{SIZE}}px;max-width:1000px}
  .sub{font-size:21px;line-height:1.5;color:var(--mut);margin-top:18px;max-width:830px}
  .tks{display:flex;gap:9px;margin-top:30px;flex-wrap:wrap}
  .tk{position:relative;background:var(--card);border:1px solid var(--bd);border-radius:9px;
      padding:9px 13px 9px 15px;font-family:var(--m);font-weight:700;font-size:18px;
      letter-spacing:.02em;overflow:hidden}
  .tk::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--c)}
  .bot{position:relative;z-index:2;display:flex;align-items:center;gap:11px}
  .chip{background:var(--card);border:1px solid var(--bd);border-radius:10px;
        padding:10px 18px;font-size:18px;color:var(--ink);white-space:nowrap}
  .chip.hot{background:var(--or);border-color:var(--or);color:#0C0A08;font-weight:600}
  .site{margin-left:auto;font-family:var(--m);font-size:15px;color:var(--mut2);letter-spacing:.02em}
</style>
</head>
<body>
<div class="og">
  <div class="grid"></div><div class="glow"></div><div class="spine"></div>
  <div class="top">
    <span class="wm"><span class="dot"></span>RUMBERG</span>
    <span class="qual">только для квалифицированных инвесторов · не ИИР</span>
  </div>
  <div class="mid">
    <div class="kick">{{KICKER}}</div>
    <h1>{{TITLE}}</h1>
    <div class="sub">{{SUB}}</div>
    <div class="tks">{{TICKERS}}</div>
  </div>
  <div class="bot">
    {{CHIPS}}
    <span class="site">invest.rumberg.ru</span>
  </div>
</div>
</body>
</html>
"""


def to_jpeg(src, dst):
    """PNG со снимка -> JPEG не тяжелее TARGET_KB. Качество снижаем шагами:
    у тёмного фона JPEG склонен к полосам, поэтому ниже 72 не опускаемся —
    лучше отдать чуть больший файл, чем грязный градиент."""
    from PIL import Image
    im = Image.open(src).convert("RGB")
    for q in (88, 84, 80, 76, 72):
        im.save(dst, "JPEG", quality=q, optimize=True, progressive=True, subsampling=1)
        kb = os.path.getsize(dst) / 1024
        print("  качество %d -> %.0f КБ" % (q, kb))
        if kb <= TARGET_KB:
            return
    print("  ниже %d КБ не ужалось без потери качества — оставляю как есть" % TARGET_KB)


def main():
    iss = current_issue()
    items = iss.get("items") or []
    print("выпуск: %s (%s), компаний: %d" % (iss.get("title"), iss.get("date"), len(items)))
    chrome = find_chrome()
    tpl_path = os.path.join(ROOT, TPL_NAME)
    with open(tpl_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(build_html(iss))
    port = free_port()
    srv = serve(port)
    profile = os.path.join(os.environ.get("TEMP", "/tmp"), "chr-og-ideas")
    try:
        cmd = [chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
               "--force-device-scale-factor=1", "--window-size=1200,630",
               "--virtual-time-budget=5000", "--user-data-dir=" + profile,
               "--screenshot=" + RAW, "http://127.0.0.1:%d/%s" % (port, TPL_NAME)]
        subprocess.run(cmd, capture_output=True)
    finally:
        srv.shutdown()
        try:
            os.remove(tpl_path)
        except OSError:
            pass
    if not (os.path.exists(RAW) and os.path.getsize(RAW) > 8000):
        raise SystemExit("рендер не удался")
    to_jpeg(RAW, OUT)
    os.remove(RAW)
    print("готово: %s (%.0f КБ)" % (OUT, os.path.getsize(OUT) / 1024))
    print("превью кэшируется по URL картинки: изменил обложку — ПЕРЕИМЕНУЙ файл "
          "и поправь og:image в ideas.html (?v= скрейпер Telegram не берёт)")


if __name__ == "__main__":
    main()
