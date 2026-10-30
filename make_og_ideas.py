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
import re
import shutil
import socket
import subprocess
import sys
import threading

_argv = sys.argv[1:]
# --out <файл>: снять обложку в другое место — посмотреть, не трогая боевую
if "--out" in _argv:
    _i = _argv.index("--out")
    OUT_ARG = _argv[_i + 1]
    _argv = _argv[:_i] + _argv[_i + 2:]
else:
    OUT_ARG = None
ROOT = _argv[0] if _argv else os.path.dirname(os.path.abspath(__file__))
OUT = OUT_ARG or os.path.join(ROOT, "og-ideas-6.jpg")
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


def nb(s):
    """Короткие предлоги и союзы не оставляем в конце строки: «в», «и», «на» —
    неразрывный пробел после них (заголовок переносится браузером сам)."""
    return re.sub(r"(?<![\w-])([А-Яа-яЁёA-Za-z]{1,2}) ", "\\1\u00a0", str(s or ""))


def fit_size(title):
    """Темы бывают длинные («Электрификация и накопители энергии») — подбираем кегль."""
    n = len(title)
    return 80 if n <= 20 else 68 if n <= 30 else 58 if n <= 42 else 48


def human(iso):
    try:
        d = datetime.date.fromisoformat(str(iso))
    except ValueError:
        return ""
    return "%d %s" % (d.day, MONTHS[d.month - 1])


def build_html(iss):
    items = iss.get("items") or []
    title = iss.get("title") or "Разборы"

    theme = iss.get("kind") == "theme"
    if theme:
        # Материал вебинара: тикеров нет — имена компаний из карты «кто следующий»,
        # цвет по группе из самого выпуска; ни цен, ни целей на обложке не обещаем
        gcol = {g.get("k"): g.get("c", "#EE7D1B") for g in iss.get("groups") or []}
        tickers = "".join(
            '<span class="tk co" style="--c:%s">%s</span>'
            % (gcol.get(x.get("layer"), "#EE7D1B"), esc(x.get("company", "")))
            for x in items)
        chips = [plural(len(items), "компания", "компании", "компаний"),
                 plural(len(gcol), "направление", "направления", "направлений"),
                 "материал вебинара"]
    else:
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

    # Своя тройка плашек у выпуска (ogChips): у карты кейсов группы — статусы
    # компаний, а не «направления», и общая подпись читалась бы неверно
    if iss.get("ogChips"):
        chip_html = "".join(
            '<span class="chip%s">%s</span>' % (" hot" if i == 0 else "", esc(c))
            for i, c in enumerate(iss["ogChips"]))
    kicker = "Материал вебинара" if theme else "Разбор темы"
    when = human(iss.get("date"))
    if when:
        kicker += " · " + when

    return (TEMPLATE
            .replace("{{KICKER}}", esc(kicker))
            .replace("{{TITLE}}", esc(nb(title)))
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
      display:flex;flex-direction:column;padding:52px 64px}
  .grid{position:absolute;inset:0;
    background:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px) 0 0/48px 48px,
               linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px) 0 0/48px 48px;
    -webkit-mask:linear-gradient(110deg,transparent 35%,#000 100%);mask:linear-gradient(110deg,transparent 35%,#000 100%)}
  .top{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center}
  .logo{height:38px;width:150px;background:url(brand/logo.svg) left center/contain no-repeat}
  .qual{font-size:15px;color:var(--mut2)}
  .mid{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;justify-content:center}
  .kick{font-size:21px;color:var(--mut);margin-bottom:18px;display:flex;align-items:center;gap:12px}
  .kick .sq{width:10px;height:10px;background:var(--or)}
  h1{font-family:var(--d);font-weight:600;line-height:1.08;letter-spacing:-.01em;
     font-size:{{SIZE}}px;max-width:1040px}
  .sub{font-size:22px;line-height:1.45;color:var(--mut);margin-top:16px;max-width:900px}
  .tks{display:flex;gap:8px;margin-top:28px;flex-wrap:wrap;max-width:1060px}
  .tk{position:relative;background:rgba(34,36,59,.85);border:1px solid var(--bd);border-radius:2px;
      padding:9px 13px 9px 16px;font-family:var(--m);font-weight:600;font-size:18px;overflow:hidden}
  .tk::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--c)}
  .tk.co{font-family:var(--f);font-weight:600;font-size:18px}
  .bot{position:relative;z-index:2;display:flex;align-items:center;gap:10px}
  .chip{border:1px solid var(--bd);background:rgba(34,36,59,.85);border-radius:2px;
        padding:10px 17px;font-size:18px;color:var(--ink);white-space:nowrap}
  .chip.hot{background:var(--or);border-color:var(--or);color:#191A2F;font-weight:600}
  .site{margin-left:auto;font-family:var(--m);font-size:20px;color:var(--mut);letter-spacing:.01em}
</style>
</head>
<body>
<div class="og">
  <div class="grid"></div>
  <div class="top">
    <span class="logo" role="img" aria-label="Rumberg Capital"></span>
    <span class="qual">только для квалифицированных инвесторов · не ИИР</span>
  </div>
  <div class="mid">
    <div class="kick"><span class="sq"></span>{{KICKER}}</div>
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
