# -*- coding: utf-8 -*-
"""
Генерирует p/<id>.html — лёгкие страницы под каждый продукт доски с ПЕРСОНАЛЬНЫМИ
og-тегами (название + суть + актив) и мгновенным редиректом на instrument.html?id=X.
Нужно потому, что скрапер превью (Telegram и пр.) НЕ исполняет JS: динамические
og в instrument.html он не видит, поэтому все ссылки давали одинаковый превью.

Запуск: python make_product_pages.py   (офлайн, читает уже готовый data/instruments.js)
Гонять после update_site.py / после добавления продуктов. Worker создаёт шелл сам
при публикации через админку — этот скрипт для массовой регенерации.
"""
import json, os, re, glob

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "data", "instruments.js")
OUTDIR = os.path.join(ROOT, "p")
BASE = "https://invest.rumberg.ru"

TYPE_LABEL = {
    "discount": "Дисконтная облигация",
    "protection": "Облигация с защитой капитала",
    "warrant": "Варрант",
    "booster": "Бустер",
}


def esc(s):
    return (str(s).replace("&", "&amp;").replace('"', "&quot;")
            .replace("<", "&lt;").replace(">", "&gt;"))


def num(v):
    # 96.8 -> "96,8"
    return ("%g" % v).replace(".", ",")


def describe(inst):
    tl = TYPE_LABEL.get(inst.get("type"), "Структурный продукт")
    ua = inst.get("underlying", "")
    q = inst.get("quote")
    parts = [tl + (" на " + ua if ua else "")]
    if q is not None:
        if inst.get("type") == "booster":
            # у бустера quote = коэффициент участия, не цена
            parts.append("коэффициент участия " + num(q) + "%")
        else:
            parts.append("котировка " + num(q) + "% от номинала")
    parts.append("Rumberg — структурные продукты для квалифицированных инвесторов")
    return " · ".join(parts)


TEMPLATE = """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — Rumberg</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Rumberg">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{base}/p/{id}.html">
<meta property="og:image" content="{base}/og-cover.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Rumberg — структурные продукты">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0B0C10">
<link rel="canonical" href="{base}/p/{id}.html">
<script>location.replace("/instrument.html?id={id}");</script>
<style>html,body{{margin:0;height:100%}}body{{background:#0B0C10;color:rgba(242,243,247,.6);font-family:'Onest',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;gap:8px}}a{{color:#EE7D1B}}</style>
</head>
<body>Открываем продукт… <a href="/instrument.html?id={id}">перейти вручную</a></body>
</html>
"""


def load_instruments():
    t = open(SRC, encoding="utf-8").read()
    obj = json.loads(t[t.index("{"):t.rindex("}") + 1])
    return obj["instruments"]


def load_offerings():
    # «На размещении»: шеллы с редиректом на offerings.html#<id> — превью ссылок
    # с названием выпуска (включая скрытые hidden-выпуски: сам шелл нигде не листится)
    path = os.path.join(ROOT, "data", "offerings.js")
    t = open(path, encoding="utf-8").read()
    obj = json.loads(t[t.index("{"):t.rindex("}") + 1])
    return obj.get("items", [])


def describe_offering(o):
    kind = o.get("kind") or "Выпуск на размещении"
    parts = [kind]
    if o.get("protection") and o["protection"] not in kind:
        parts.append("защита капитала " + o["protection"])
    if o.get("participation"):
        parts.append("участие в росте " + o["participation"])
    if o.get("tenor"):
        parts.append(o["tenor"])
    parts.append("Rumberg — структурные продукты для квалифицированных инвесторов")
    return " · ".join(parts)


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    instruments = load_instruments()
    wanted = set()
    for inst in instruments:
        pid = inst["id"]
        wanted.add(pid)
        html = TEMPLATE.format(title=esc(inst.get("name", pid)), desc=esc(describe(inst)),
                               base=BASE, id=pid)
        with open(os.path.join(OUTDIR, pid + ".html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(html)
    for o in load_offerings():
        pid = o["id"]
        wanted.add(pid)
        html = TEMPLATE.format(title=esc(o.get("name", pid)), desc=esc(describe_offering(o)),
                               base=BASE, id=pid)
        html = html.replace('/instrument.html?id=' + pid, '/offerings.html#' + pid)
        with open(os.path.join(OUTDIR, pid + ".html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(html)
    # чистим шеллы снятых продуктов
    removed = 0
    for path in glob.glob(os.path.join(OUTDIR, "*.html")):
        pid = os.path.splitext(os.path.basename(path))[0]
        if pid not in wanted:
            os.remove(path); removed += 1
    print("страниц продуктов:", len(wanted), "| удалено устаревших:", removed)


if __name__ == "__main__":
    main()
