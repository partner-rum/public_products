# -*- coding: utf-8 -*-
"""Пререндер списков в HTML: текст для поисковых роботов.

Зачем. Доска, размещённые выпуски и первичка рисуются целиком на клиенте из
data/*.js. В исходнике страницы при этом остаётся 300-400 знаков: заголовок,
фильтры и пустой <div id="list">. Google такие страницы сканирует и не
индексирует — вердикт Search Console «Crawled - currently not indexed».
Яндекс терпимее и сайт взял, Google нет.

Что делает. Кладёт в тот же контейнер #list статический список: названия,
базовые активы, сроки, ISIN. Скрипт страницы идёт сразу за контейнером и
выполняется синхронно, поэтому браузер успевает заменить блок до первой
отрисовки — человек по-прежнему видит обычные карточки.

Это не клоакинг: и роботу, и человеку отдаётся ОДИН И ТОТ ЖЕ html, а текст в
нём — подмножество того, что страница показывает после отрисовки. Класть сюда
то, чего на странице нет, нельзя.

Запуск: python make_prerender.py        (после любого обновления data/*.js)
        python make_prerender.py --dry  (показать объём, ничего не писать)
"""
import io, os, re, sys, json

ROOT = os.path.dirname(os.path.abspath(__file__))
START, END = "<!-- seo:start -->", "<!-- seo:end -->"
# Контейнер один и тот же на всех трёх страницах — его наполняет render() каждой.
SLOT = '<div class="list" id="list">'


def load(name):
    p = os.path.join(ROOT, "data", name)
    s = io.open(p, encoding="utf-8").read()
    return json.loads(s[s.index("{"):s.rindex("}") + 1])


def esc(s):
    return (str(s if s is not None else "")
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def plural(n, one, few, many):
    m10, m100 = n % 10, n % 100
    if m10 == 1 and m100 != 11:
        return "%d %s" % (n, one)
    if 2 <= m10 <= 4 and not (12 <= m100 <= 14):
        return "%d %s" % (n, few)
    return "%d %s" % (n, many)


def add(bits, label, value, name):
    """Добавляет параметр, если его ещё нет в названии продукта.

    Без этой проверки строка выходила вида «Дисконтная облигация на ВЭБ.РФ ·
    3 года, базовый актив — ВЭБ.РФ, срок 3 года» — то есть повтор одного и того
    же трижды. Для поисковика это набивка ключевыми словами, а не текст.
    """
    if not value:
        return
    core = str(value).split(" (")[0].strip()
    if core and core in name:
        return
    bits.append(label + str(value))


def ru_date(iso):
    """2027-07-14 -> 14.07.2027. В ISO-виде дата на витрине не встречается."""
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})$", str(iso or ""))
    return "%s.%s.%s" % (m.group(3), m.group(2), m.group(1)) if m else iso


def block(intro, groups):
    """groups: [(заголовок, [строка, ...]), ...] -> html одного блока."""
    h = [START, '<div class="seo-pre"><p>' + esc(intro) + "</p>"]
    for title, rows in groups:
        if not rows:
            continue
        h.append("<h2>" + esc(title) + "</h2><ul>")
        h += ["<li>" + esc(r) + "</li>" for r in rows]
        h.append("</ul>")
    h.append("</div>")
    h.append(END)
    return "".join(h)


def board_block():
    d = load("instruments.js")
    TYPES = [
        ("discount", "Дисконтные облигации"),
        ("protection", "Облигации с защитой капитала"),
        ("warrant", "Варранты"),
        ("booster", "Бустеры"),
        ("autocall", "Автоколлы"),
    ]
    groups = []
    for key, title in TYPES:
        rows = []
        for x in d["instruments"]:
            if x.get("type") != key:
                continue
            name = x.get("name", "")
            bits = [name]
            add(bits, "базовый актив — ", x.get("underlying"), name)
            add(bits, "срок ", x.get("tenor"), name)
            if x.get("currency") and x["currency"] != "RUB":
                bits.append("валюта " + x["currency"])
            rows.append(", ".join(bits) + ".")
        groups.append((title, rows))
    intro = ("Доска инструментов Rumberg: %s для квалифицированных инвесторов. "
             "Котировки индикативные, обновляются по мере пересчёта прайсинга."
             % plural(len(d["instruments"]), "структурный продукт",
                      "структурных продукта", "структурных продуктов"))
    return block(intro, groups)


def placements_block():
    d = load("placements.js")
    KINDS = [("coupon", "Выпуски с условным купоном"),
             ("participation", "Выпуски с участием в росте")]
    groups = []
    for key, title in KINDS:
        rows = []
        for x in d["issues"]:
            if x.get("kind") != key:
                continue
            name = x.get("name") or x.get("serial", "")
            bits = [name]
            if x.get("isin"):
                bits.append("ISIN " + x["isin"])
            names = [b.get("n") for b in (x.get("basket") or []) if b.get("n")]
            if names:
                bits.append("базовый актив — " + ", ".join(names))
            if x.get("maturity"):
                bits.append("погашение " + ru_date(x["maturity"]))
            if x.get("currency") and x["currency"] != "RUB":
                bits.append("валюта " + x["currency"])
            rows.append(", ".join(bits) + ".")
        groups.append((title, rows))
    intro = ("Размещённые выпуски структурных облигаций Rumberg: %s на рынке. "
             "По каждому — базовые активы, начальные фиксинги, параметры выплат и "
             "документы выпуска." % plural(len(d["issues"]), "выпуск", "выпуска", "выпусков"))
    return block(intro, groups)


def offerings_block():
    d = load("offerings.js")
    rows = []
    for x in d["items"]:
        name = x.get("name", "")
        bits = [name]
        if x.get("kind"):
            bits.append(x["kind"])
        add(bits, "базовый актив — ", x.get("reference"), name)
        add(bits, "срок ", x.get("tenor"), name)
        if x.get("isin"):
            bits.append("ISIN " + x["isin"])
        if x.get("statusLabel"):
            bits.append(x["statusLabel"])
        rows.append(", ".join(bits) + ".")
    intro = ("Выпуски Rumberg на размещении: параметры, документы и порядок подачи заявок.")
    return block(intro, [("На размещении", rows)])


PAGES = [("board.html", board_block), ("placements.html", placements_block),
         ("offerings.html", offerings_block)]


def main():
    dry = "--dry" in sys.argv
    # Без аргументов пересобираются все страницы. Имя страницы в аргументах
    # ограничивает работу ею одной: авто-обновление котировок трогает только
    # placements.html, иначе оно утащило бы в коммит чужую правку доски.
    only = [a for a in sys.argv[1:] if a.endswith(".html")]
    for fname, builder in PAGES:
        if only and fname not in only:
            continue
        path = os.path.join(ROOT, fname)
        html = io.open(path, encoding="utf-8").read()
        blk = builder()
        if START in html:
            new = re.sub(re.escape(START) + ".*?" + re.escape(END), lambda m: blk, html, flags=re.S)
        elif SLOT in html:
            new = html.replace(SLOT, SLOT + blk, 1)
        else:
            print("  ! %s: контейнер %s не найден — пропускаю" % (fname, SLOT))
            continue
        text = re.sub(r"<[^>]+>", " ", blk)
        text = re.sub(r"\s+", " ", text).strip()
        print("  %-18s %5d знаков текста%s" % (fname, len(text), "" if not dry else " (не записано)"))
        if not dry and new != html:
            io.open(path, "w", encoding="utf-8", newline="").write(new)


if __name__ == "__main__":
    print("Пререндер списков для поисковых роботов")
    main()
