# -*- coding: utf-8 -*-
"""
Перегенерирует ОБЩУЮ обложку превью (1200x630) — og-cover-2.jpg. Она уходит в мессенджер
для всех страниц без персональной картинки: главная, доска, дайджест, размещения,
выпуски, Библиотека, путеводитель, «О компании», карточка, one-pager, 404.

Имя с номером: Telegram кэширует превью по URL картинки и ?v= не понимает, поэтому
новая обложка = новое имя файла и правка og:image на страницах (OUT ниже, тег
og:image в *.html, запасная обложка в make_product_pages.py и в productShell воркера).
Прежняя og-cover.png оставлена в репозитории: по ней разосланы ссылки.

Вид — по брендбуку Rumberg Capital, как у обложек событий и разборов
(make_og_event.py): логотип из brand/logo.svg, Montserrat, фон #191A2F, оранжевый
#F06E08 только на главном, углы 2px, без свечений. Чипы — типы, которые есть на доске.

Запуск: python make_og_cover.py [путь-к-репозиторию]
"""
import os, sys, socket, subprocess, threading, functools, http.server, shutil

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "og-cover-2.jpg")
RAW = os.path.join(ROOT, "_og_cover_raw.png")
TPL_NAME = "_og_cover_tmp.html"

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]


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


# Целевой вес превью. Chrome снимает только PNG, а PNG с градиентом весит ~225 КБ
# (и PNG под 90 КБ Telegram однажды не взял вовсе — см. make_og_ideas.py), поэтому
# снимок сжимается в JPEG. Ниже качества 72 не опускаемся: тёмный фон начинает полосить.
TARGET_KB = 70


def to_jpeg(src, dst):
    from PIL import Image
    im = Image.open(src).convert("RGB")
    for q in (88, 84, 80, 76, 72):
        im.save(dst, "JPEG", quality=q, optimize=True, progressive=True, subsampling=1)
        if os.path.getsize(dst) / 1024 <= TARGET_KB:
            break
    return os.path.getsize(dst) / 1024


def serve(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a, **k: None
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


TEMPLATE = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<link href="fonts/fonts.css?v=2" rel="stylesheet">
<link href="brand/brand.css?v=1" rel="stylesheet">
<style>
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
  h1{font-family:var(--d);font-weight:600;line-height:1.06;letter-spacing:-.01em;font-size:76px}
  .sub{font-size:24px;line-height:1.4;color:var(--mut);margin-top:22px;max-width:920px}
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
    <h1>Структурные<br>продукты</h1>
    <div class="sub">Можем запустить сейчас · текущие идеи</div>
  </div>
  <div class="bot">
    <span class="chip hot">Автоколл</span>
    <span class="chip">Защита капитала</span>
    <span class="chip">Call-spread</span>
    <span class="site">invest.rumberg.ru</span>
  </div>
</div>
</body>
</html>
"""


def main():
    chrome = find_chrome()
    tpl_path = os.path.join(ROOT, TPL_NAME)
    with open(tpl_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(TEMPLATE)
    port = free_port()
    srv = serve(port)
    profile = os.path.join(os.environ.get("TEMP", "/tmp"), "chr-og-cover")
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
    kb = to_jpeg(RAW, OUT)
    os.remove(RAW)
    print("готово: %s (%.0f КБ)" % (OUT, kb))


if __name__ == "__main__":
    main()
