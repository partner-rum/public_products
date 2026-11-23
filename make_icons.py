# -*- coding: utf-8 -*-
"""
Рисует иконки сайта (папка icons/) из знака Rumberg Capital: фавикон, иконку для
экрана «Домой» и иконки веб-приложения из manifest.json.

Знак берётся из brand/logo.svg — первый контур файла (шестигранник), пути не
перерисовываются: брендбук запрещает менять пропорции. Фон — #191A2F, знак белый,
как логотип в шапке сайта.

Как работает: headless-Chrome снимает знак крупно (1024 px) в трёх кадрировках,
Pillow уменьшает до нужных размеров. Мелкие размеры (16, 32) кадрируются плотнее,
иначе знак в них превращается в пятно; у maskable-иконки знак занимает меньше
половины стороны — систему Android обрезает её кругом.

Запуск: python make_icons.py [путь-к-репозиторию]
"""
import os, re, sys, socket, subprocess, threading, functools, http.server, shutil

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "icons")
TPL_NAME = "_icons_tmp.html"
BG = "#191A2F"
MASTER = 1024

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

# имя файла -> (размер, кадрировка: доля стороны, которую занимает знак)
ICONS = [
    ("favicon-16.png", 16, "tight"),
    ("favicon-32.png", 32, "tight"),
    ("apple-touch-icon.png", 180, "normal"),
    ("icon-192.png", 192, "normal"),
    ("icon-512.png", 512, "normal"),
    ("icon-512-maskable.png", 512, "mask"),
]
FRAMES = {"tight": 0.80, "normal": 0.58, "mask": 0.44}


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
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k):
            pass
    handler = functools.partial(Quiet, directory=ROOT)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def sign_path():
    with open(os.path.join(ROOT, "brand", "logo.svg"), encoding="utf-8") as f:
        m = re.search(r'<path d="([^"]+)"', f.read())
    if not m:
        raise SystemExit("в brand/logo.svg не найден контур знака")
    return m.group(1)


TEMPLATE = """<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;height:100%;background:{{BG}};overflow:hidden}svg{display:block;width:100vw;height:100vh}</style>
</head><body>
<svg id="s" xmlns="http://www.w3.org/2000/svg"><path id="p" fill="#fff" d="{{D}}"/></svg>
<script>
  // Знак ставится по центру и занимает долю k стороны (по большей из сторон контура)
  var k = parseFloat(new URLSearchParams(location.search).get("k")) || 0.58;
  var b = document.getElementById("p").getBBox();
  var side = Math.max(b.width, b.height) / k;
  document.getElementById("s").setAttribute("viewBox",
    [b.x + b.width / 2 - side / 2, b.y + b.height / 2 - side / 2, side, side].join(" "));
  document.title = "bbox " + [b.x, b.y, b.width, b.height].map(function (v) { return v.toFixed(2); }).join(" ");
</script>
</body></html>
"""


def main():
    from PIL import Image
    chrome = find_chrome()
    d = sign_path()
    tpl_path = os.path.join(ROOT, TPL_NAME)
    with open(tpl_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(TEMPLATE.replace("{{BG}}", BG).replace("{{D}}", d))
    port = free_port()
    srv = serve(port)
    profile = os.path.join(os.environ.get("TEMP", "/tmp"), "chr-icons")
    masters, bbox = {}, None
    try:
        for name, k in FRAMES.items():
            raw = os.path.join(OUT, "_raw_%s.png" % name)
            url = "http://127.0.0.1:%d/%s?k=%s" % (port, TPL_NAME, k)
            cmd = [chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
                   "--force-device-scale-factor=1", "--window-size=%d,%d" % (MASTER, MASTER),
                   "--virtual-time-budget=2000", "--user-data-dir=" + profile,
                   "--screenshot=" + raw, url]
            subprocess.run(cmd, capture_output=True)
            if not (os.path.exists(raw) and os.path.getsize(raw) > 2000):
                raise SystemExit("рендер не удался: " + name)
            masters[name] = raw
        # контур для favicon.svg — размеры знака снимаем из того же шаблона
        dom = subprocess.run([chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
                              "--virtual-time-budget=2000", "--user-data-dir=" + profile, "--dump-dom",
                              "http://127.0.0.1:%d/%s" % (port, TPL_NAME)],
                             capture_output=True).stdout.decode("utf-8", "replace")
        m = re.search(r"<title>bbox ([\d.\- ]+)</title>", dom)
        if m:
            bbox = [float(v) for v in m.group(1).split()]
    finally:
        srv.shutdown()
        try:
            os.remove(tpl_path)
        except OSError:
            pass

    for fname, size, frame in ICONS:
        im = Image.open(masters[frame]).convert("RGBA").resize((size, size), Image.LANCZOS)
        im.save(os.path.join(OUT, fname), "PNG", optimize=True)
        print("  %s — %d px" % (fname, size))
    for raw in masters.values():
        os.remove(raw)

    if bbox:
        # Векторный фавикон: скруглённый квадрат 26×26 и знак в 72% стороны
        x, y, w, h = bbox
        s = 26 * 0.72 / max(w, h)
        tx, ty = 13 - (x + w / 2) * s, 13 - (y + h / 2) * s
        svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26"><rect width="26" height="26" rx="5" fill="%s"/>'
               '<path transform="translate(%.3f %.3f) scale(%.5f)" fill="#fff" d="%s"/></svg>') % (BG, tx, ty, s, d)
        with open(os.path.join(OUT, "favicon.svg"), "w", encoding="utf-8", newline="\n") as f:
            f.write(svg)
        print("  favicon.svg")
    else:
        print("  favicon.svg НЕ обновлён: не удалось снять размеры знака")
    print("готово: icons/")


if __name__ == "__main__":
    main()
