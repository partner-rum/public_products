# -*- coding: utf-8 -*-
"""
Перегенерирует og-cover.png — ОБЩУЮ обложку превью (1200x630). Она уходит в мессенджер
для всех страниц без персональной картинки: главная, доска, дайджест, размещения,
выпуски, Библиотека, путеводитель, «О компании», карточка, one-pager, 404.

Зачем понадобилось: на прежней обложке (20.07.2026) был чип «Барьерная нота» —
слово «Нота» на витрине запрещено, а зачистка 22.07 обложку не задела: она рисуется
отдельным скриптом, которого не было в репозитории.

Дизайн повторяет продуктовые карточки (make_og_products.py): та же палитра, сетка,
свечение, бренд-строка. Чипы — типы, которые реально есть на доске.

Запуск: python make_og_cover.py [путь-к-репозиторию]
"""
import os, sys, socket, subprocess, threading, functools, http.server, shutil

ROOT = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\ruslan.sabirov\Documents\сайт\сайт СО\pythonProject1"
OUT = os.path.join(ROOT, "og-cover.png")
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


def serve(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


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
  h1{font-family:var(--d);font-weight:800;line-height:1.02;letter-spacing:-.025em;font-size:78px}
  .sub{font-size:24px;color:var(--mut);margin-top:20px}
  .bot{position:relative;z-index:2;display:flex;align-items:center;gap:12px}
  .chip{background:var(--card);border:1px solid var(--bd);border-radius:10px;
        padding:11px 20px;font-size:19px;color:var(--ink)}
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
    else:
        raise SystemExit("рендер не удался")


if __name__ == "__main__":
    main()
