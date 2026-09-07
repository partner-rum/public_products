# -*- coding: utf-8 -*-
"""Обложка выступления, собранная нами, а не вырезанная из записи.

Повод. У презентации на IR-платформе Московской биржи запись — вебинар, и любой
её кадр это слайд с сеткой участников в углу. Среди трёх остальных обложек
(живые кадры студий) он выглядел браком.

Подход тот же, что у make_og_*.py: верстаем HTML в палитре сайта, снимаем
headless-хромом, дожимаем в JPEG. Свои шрифты не нужны — их отдаёт Google Fonts.

ЧТО НА ОБЛОЖКЕ И ЧЕГО НА НЕЙ НЕТ. Заголовок записи у биржи звучит «Варрант
„Ультрадоходный“ — как заработать на структурных облигациях». В списке мы
приводим его дословно (цитата чужого материала), но обложка — НАША графика, и
обещание дохода на неё не попадает: берём только название продукта. Логотип
биржи не рисуем и не имитируем — только её имя текстом.

Запуск:  python make_talk_cover.py [A|B|C]      без аргумента — все три
Выход:   media/talk-moex.jpg  (выбранный вариант) и
         .impeccable/variants/cover-<X>.jpg (для просмотра, в git не идут)
"""
import io
import os
import shutil
import subprocess
import sys
import threading
import http.server
import socketserver

from PIL import Image

W, H = 1280, 720                      # снимаем вдвое крупнее и уменьшаем — резче
OUT = os.path.join("media", "talk-moex-card.jpg")
LAB = os.path.join(".impeccable", "variants")

CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


def find_chrome():
    for p in CHROME_PATHS:
        if os.path.exists(p):
            return p
    for name in ("chrome", "msedge", "chromium"):
        p = shutil.which(name)
        if p:
            return p
    raise SystemExit("Chrome/Edge не найден — обложку снять нечем")


# ── содержание обложки ──────────────────────────────────────────────────────
ORG = "Московская биржа"
KICK = "презентация на IR-платформе"
TITLE = "Варрант<br>«Ультрадоходный»"
DATE = "25 марта 2025"

HEAD = """<!doctype html><html lang="ru"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;600;700;800&family=Onest:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{--bg:#0B0C10;--card:#14161C;--ink:#F2F3F7;--mut:rgba(242,243,247,.68);
        --faint:rgba(242,243,247,.52);--line:rgba(255,255,255,.11);
        --or:#EE7D1B;--or-l:#F58E33;--blue:#4F86E6;--up:#55C08A;
        --f:'Onest',sans-serif;--m:'JetBrains Mono',monospace;--d:'Rubik','Onest',sans-serif}
  *{box-sizing:border-box;margin:0}
  html,body{width:%dpx;height:%dpx;overflow:hidden}
  body{background:var(--bg);color:var(--ink);font-family:var(--f);
       -webkit-font-smoothing:antialiased}
  .c{position:relative;width:%dpx;height:%dpx;overflow:hidden;display:flex;
     flex-direction:column;justify-content:space-between;padding:64px 72px}
  .kick{font-family:var(--m);font-size:26px;letter-spacing:.16em;text-transform:uppercase;
        color:var(--or);display:flex;align-items:center;gap:18px}
  .kick i{width:13px;height:13px;border-radius:50%%;background:var(--or);flex:none}
  h1{font-family:var(--d);font-weight:700;font-size:82px;line-height:1.03;
     letter-spacing:-.032em}
  .foot{display:flex;align-items:flex-end;justify-content:space-between;gap:24px}
  .org{font-family:var(--d);font-weight:600;font-size:40px;letter-spacing:-.02em}
  .sub{font-family:var(--m);font-size:24px;color:var(--faint);margin-top:10px;
       letter-spacing:.02em}
  .wm{display:inline-flex;align-items:center;gap:14px;font-family:var(--d);
      font-weight:700;font-size:27px;letter-spacing:.14em;white-space:nowrap}
</style></head><body>""" % (W, H, W, H)

STAR = ('<svg width="40" height="40" viewBox="0 0 26 26" fill="none">'
        '<path d="M13 1 L15.6 10.4 L25 13 L15.6 15.6 L13 25 L10.4 15.6 L1 13 L10.4 10.4 Z" '
        'fill="#EE7D1B"/></svg>')

# ── А. тихий титул: воздух, оранжевая планка слева ──────────────────────────
A = HEAD + """
<style>
  .c{padding-left:96px}
  .c::before{content:"";position:absolute;left:0;top:0;bottom:0;width:10px;background:var(--or)}
</style>
<div class="c">
  <div class="kick"><i></i>%s</div>
  <h1>%s</h1>
  <div class="foot">
    <div><div class="org">%s</div><div class="sub">%s</div></div>
    <div class="wm">%s RUMBERG</div>
  </div>
</div></body></html>""" % (KICK, TITLE, ORG, DATE, STAR)

# ── B. свечной фон, как в айдентике сайта ───────────────────────────────────
def candles():
    """Свечной фон из DESIGN.md: ряд свечей за текстом, очень приглушённый."""
    import random
    random.seed(25032025)                       # дата записи — чтобы кадр был стабилен
    out, x, base = [], 40, 470
    for i in range(30):
        h = random.randint(28, 150)
        top = base - random.randint(-70, 70) - h // 2
        up = random.random() > 0.42
        col = "#55C08A" if up else "#E0705A"
        out.append('<i style="left:%dpx;top:%dpx;height:%dpx;background:%s"></i>'
                   % (x, top, h, col))
        x += 42
    return "".join(out)

B = HEAD + """
<style>
  .bg{position:absolute;inset:0;opacity:.16}
  .bg i{position:absolute;width:13px;border-radius:3px;display:block}
  .c::after{content:"";position:absolute;inset:0;
    background:linear-gradient(90deg,#0B0C10 0 46%%,rgba(11,12,16,.55) 74%%,rgba(11,12,16,.2) 100%%)}
  .c > *{position:relative;z-index:2}
  h1{font-size:78px;max-width:820px}
</style>
<div class="c">
  <div class="bg">%s</div>
  <div class="kick"><i></i>%s</div>
  <h1>%s</h1>
  <div class="foot">
    <div><div class="org">%s</div><div class="sub">%s</div></div>
    <div class="wm">%s RUMBERG</div>
  </div>
</div></body></html>""" % (candles(), KICK, TITLE, ORG, DATE, STAR)

# ── C. имя площадки героем, как в списке выступлений ────────────────────────
C = HEAD + """
<style>
  .c{justify-content:center;gap:30px;padding:64px 80px}
  .big{font-family:var(--d);font-weight:800;font-size:96px;line-height:1;letter-spacing:-.038em}
  h1{font-size:46px;font-weight:500;color:var(--mut);line-height:1.2;letter-spacing:-.018em}
  .rule{width:104px;height:6px;background:var(--or);border-radius:3px}
  .strip{position:absolute;right:0;top:0;bottom:0;width:20px;
    background:linear-gradient(180deg,var(--or) 0 40%%,var(--blue) 40%% 72%%,var(--up) 72%% 100%%);opacity:.85}
  .top{position:absolute;top:56px;left:80px;right:80px;display:flex;
       align-items:center;justify-content:space-between}
</style>
<div class="c">
  <div class="strip"></div>
  <div class="top"><div class="kick"><i></i>%s</div><div class="wm">%s RUMBERG</div></div>
  <div class="big">%s</div>
  <div class="rule"></div>
  <h1>%s</h1>
  <div class="sub">%s</div>
</div></body></html>""" % (KICK, STAR, ORG, TITLE.replace("<br>", " "), DATE)

# ── D. одно крупно ──────────────────────────────────────────────────────────
# Вывод из замера в НАСТОЯЩЕМ размере: на странице обложка 190px шириной, на
# телефоне 132px, и кикер, дата, вордмарк там не читаются — остаётся текстура.
# А организатор, формат и дата и так напечатаны текстом рядом с карточкой, то
# есть обложка их дублировала. Оставляем ровно то, чего в тексте рядом нет, —
# название продукта, — и набираем его во всю плашку.
D = HEAD + """
<style>
  .c{justify-content:center;padding:70px 84px;gap:0}
  .c::before{content:"";position:absolute;left:0;top:0;bottom:0;width:14px;background:var(--or)}
  h1{font-size:104px;line-height:1.0;font-weight:700;letter-spacing:-.036em}
  .star{position:absolute;right:60px;bottom:52px;opacity:.9}
  .glow{position:absolute;left:-140px;top:-160px;width:620px;height:620px;border-radius:50%%;
    background:radial-gradient(circle,rgba(238,125,27,.16) 0%%,rgba(238,125,27,0) 68%%)}
</style>
<div class="c">
  <div class="glow"></div>
  <h1>%s</h1>
  <div class="star"><svg width="54" height="54" viewBox="0 0 26 26" fill="none">
    <path d="M13 1 L15.6 10.4 L25 13 L15.6 15.6 L13 25 L10.4 15.6 L1 13 L10.4 10.4 Z" fill="#EE7D1B"/>
  </svg></div>
</div></body></html>""" % TITLE

VARIANTS = {"A": A, "B": B, "C": C, "D": D}


def shoot(html, dest):
    """Снимаем кадр headless-хромом и дожимаем в JPEG до 60 КБ."""
    os.makedirs(LAB, exist_ok=True)
    tpl = os.path.join(LAB, "_cover_tpl.html")
    io.open(tpl, "w", encoding="utf-8").write(html)

    # локальный сервер: Google Fonts не грузятся с file://
    srv = socketserver.TCPServer(("127.0.0.1", 0), http.server.SimpleHTTPRequestHandler)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    # ПУТЬ СНИМКА — ТОЛЬКО АБСОЛЮТНЫЙ, со слэшами: относительный хром разрешает
    # от СВОЕГО рабочего каталога и кладёт файл неизвестно куда, молча выходя с 0.
    raw = os.path.abspath(os.path.join(LAB, "_cover_raw.png")).replace("\\", "/")
    if os.path.exists(raw):
        os.remove(raw)
    subprocess.run([find_chrome(), "--headless=new", "--disable-gpu", "--no-sandbox",
                    "--hide-scrollbars", "--force-device-scale-factor=1",
                    "--window-size=%d,%d" % (W, H), "--default-background-color=0B0C10FF",
                    "--virtual-time-budget=5000",
                    "--screenshot=" + raw,
                    "http://127.0.0.1:%d/%s" % (port, tpl.replace(os.sep, "/"))],
                   capture_output=True, timeout=120)
    srv.shutdown()
    if not os.path.exists(raw):
        raise SystemExit("хром не отдал кадр")

    im = Image.open(raw).convert("RGB").resize((640, 360), Image.LANCZOS)
    q = 88
    while True:
        im.save(dest, "JPEG", quality=q, optimize=True, progressive=True)
        kb = os.path.getsize(dest) / 1024
        if kb <= 60 or q <= 72:
            break
        q -= 4
    os.remove(raw); os.remove(tpl)
    return q, kb


if __name__ == "__main__":
    pick = (sys.argv[1].upper() if len(sys.argv) > 1 else "")
    if pick in VARIANTS:
        q, kb = shoot(VARIANTS[pick], OUT)
        print("вариант %s -> %s  q=%d  %.0f КБ" % (pick, OUT, q, kb))
    else:
        for name, html in VARIANTS.items():
            dest = os.path.join(LAB, "cover-%s.jpg" % name)
            q, kb = shoot(html, dest)
            print("вариант %s -> %s  q=%d  %.0f КБ" % (name, dest, q, kb))
        print("\nвыбрать:  python make_talk_cover.py A")
