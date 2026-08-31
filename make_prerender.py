# -*- coding: utf-8 -*-
"""Пререндер списков в HTML: текст для поисковых роботов.

Зачем. Доска, размещённые выпуски, первичка и разборы рисуются целиком на
клиенте из data/*.js. В исходнике страницы при этом остаётся 300-400 знаков: заголовок,
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
        ("revconv", "Реверс-конвертиблы"),
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


def index_blocks():
    """Главная. У неё не один список, а четыре колонки, каждая со своим
    контейнером, поэтому возвращаем словарь «имя слота -> текст». Скрипт
    страницы затирает innerHTML каждого из них, так что человек видит обычные
    колонки, а робот — тот же текст в исходнике."""
    out = {}

    inst = load("instruments.js")
    plc = load("placements.js")
    ofr = load("offerings.js")
    out["rail"] = (
        "<p>Разделы витрины: дайджест инвестиционных идей; разборы тем и компаний; "
        "текущие продукты — доска прайсинга, %s; "
        "размещённые выпуски, %s; библиотека типов продуктов; события; о компании.</p>"
        % (plural(len(inst["instruments"]), "инструмент", "инструмента", "инструментов"),
           plural(len(plc["issues"]), "выпуск", "выпуска", "выпусков")))

    m = load("morning.js")
    rows = []
    for n in m.get("news", []):
        bits = [b for b in (n.get("rubric"), n.get("title")) if b]
        line = ". ".join(bits)
        if n.get("body"):
            line += ". " + n["body"]
        rows.append(esc(line))
    if rows:
        out["news"] = ("<p>Утро на рынках, обзор от %s.</p><ul>%s</ul>"
                       % (ru_date(m.get("date", "")), "".join("<li>%s</li>" % r for r in rows)))
    # Актуальные продукты — отдельный список под новостями, не привязан к ним
    names = []
    by_id = {x["id"]: x for x in inst["instruments"]}
    for pid in m.get("products", []):
        it = by_id.get(pid)
        if it:
            names.append(esc(it.get("name", "")))
    if names:
        out["mprod"] = ("<p>Актуальные продукты: %s.</p>" % ", ".join(names))

    try:
        r = load("rates.js")
        bits = []
        if r.get("cbr", {}).get("key"):
            bits.append("ключевая ставка %s%%" % str(r["cbr"]["key"]["rate"]).replace(".", ","))
        if r.get("cbr", {}).get("ruonia"):
            bits.append("RUONIA %s%%" % str(r["cbr"]["ruonia"]["rate"]).replace(".", ","))
        if bits:
            out["rates"] = ("<p>Лучшие ставки на срок до года: вклады, фонды денежного "
                            "рынка и короткие ОФЗ. Ориентиры — %s.</p>" % ", ".join(bits))
    except Exception:
        pass  # rates.js собирается локальным скриптом и может отсутствовать

    rows = []
    for x in ofr.get("items", []):
        bits = [x.get("name", "")]
        for k in ("kind", "tenor", "statusLabel"):
            if x.get(k):
                bits.append(x[k])
        rows.append(esc(", ".join(bits)) + ".")
    if rows:
        out["offers"] = "<p>Текущие размещения.</p><ul>%s</ul>" % "".join("<li>%s</li>" % r for r in rows)

    return out



def ideas_block():
    """Разборы. Один слот, но содержимое — не список названий, а текст: тема
    выпуска, компании со слоем стека, тезис, лид, потенциал и риски. Это
    единственная страница витрины, у которой контент и есть текст, поэтому
    робот должен видеть его, а не перечисление тикеров.

    Развёрнутое тело разборов в пререндер НЕ идёт: это ещё 25 КБ, которые
    скрипт всё равно затирает при первой отрисовке. Тезис, лид и риски дают
    уникальный текст с названиями компаний — этого достаточно, чтобы страница
    перестала быть пустой для Google.
    """
    d = load("ideas.js")
    iss = (d.get("issues") or [{}])[0]
    items = iss.get("items") or []

    # Названия слоёв повторяют ideas.html: в данных лежит только ключ слоя.
    # Здесь перечислены слои ВСЕХ тем; в выпуск попадают только непустые.
    LAYERS = [("chips", "Кремний"), ("iron", "Железо и сборка"),
              ("cloud", "Мощности и облако"),
              ("fin", "Финансы"), ("domestic", "Внутренний рынок"),
              ("export", "Сырьё и экспорт")]

    sign = iss.get("currency") or "USD"

    def money(v):
        if v is None:
            return ""
        whole = float(v) == int(v)
        head = "{:,}".format(int(abs(v))).replace(",", " ")
        cents = "" if whole else ",%02d" % round((abs(v) - int(abs(v))) * 100)
        n = head + cents
        return (n + " ₽") if sign == "RUB" else ("$" + n)

    groups = []
    for key, title in LAYERS:
        rows = []
        for x in items:
            if x.get("layer") != key:
                continue
            bits = ["%s (%s) — %s" % (x.get("company", ""), x.get("ticker", ""),
                                      (x.get("thesis") or "").rstrip("."))]
            if x.get("upside5") is not None:
                bits.append("Потенциал к цели +%d%% (расчёт +%s%%), %s к %s"
                            % (x["upside5"], str(x.get("upside")).replace(".", ","),
                               money(x.get("spot")), money(x.get("targetNum"))))
            row = ". ".join(bits) + "."
            if x.get("lead"):
                row += " " + x["lead"]
            # Показатели дают роботу проверяемые цифры компании — самый ценный
            # уникальный текст страницы после лида
            if x.get("facts"):
                row += " Показатели: " + "; ".join(
                    "%s — %s" % (f.get("k", ""), f.get("v", "")) for f in x["facts"]) + "."
            # Риски теперь разбиты на пункты — в пререндер идут все
            if x.get("risks"):
                row += " Риски: " + " ".join(x["risks"])
            rows.append(row)
        groups.append((title, rows))

    ngroups = len([g for g in groups if g[1]])
    intro = ("Разборы Rumberg: %s — %s, %s. Потенциал к целевым ценам "
             "аналитиков на 12 месяцев посчитан от цен закрытия %s и округлён до кратного 5. "
             "Материал носит информационный характер и не является индивидуальной "
             "инвестиционной рекомендацией."
             % (iss.get("title", ""),
                plural(len(items), "компания", "компании", "компаний"),
                plural(ngroups, "группа", "группы", "групп"),
                ru_date(iss.get("spotDate") or iss.get("date"))))
    return {"ideas": block_body(intro, groups)}


def block_body(intro, groups):
    """То же, что block(), но без маркеров: у слотов свои именованные маркеры."""
    h = ['<div class="seo-pre"><p>' + esc(intro) + "</p>"]
    for title, rows in groups:
        if not rows:
            continue
        h.append("<h2>" + esc(title) + "</h2><ul>")
        h += ["<li>" + esc(r) + "</li>" for r in rows]
        h.append("</ul>")
    h.append("</div>")
    return "".join(h)


# Контейнеры слотов: имя слота -> открывающий тег на странице
INDEX_SLOTS = {
    "rail": '<nav id="rail-list" aria-label="Разделы">',
    "ideas": '<main id="issue">',
    # ВАЖНО: только открывающие теги. С полным '<div id="news"></div>' текст
    # вставлялся ПОСЛЕ закрывающего тега, скрипт его не затирал, и пререндер
    # дублировался на экране под колонкой.
    "news": '<div id="news">',
    "mprod": '<div id="mprod">',
    "rates": '<div id="rates">',
    "offers": '<div id="offers">',
}

PAGES = [("board.html", board_block), ("placements.html", placements_block),
         ("offerings.html", offerings_block), ("index.html", index_blocks),
         ("ideas.html", ideas_block)]


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

        # Главная — особый случай: не один список, а четыре слота со своими
        # маркерами. Каждый слот перерисовывается независимо и идемпотентно.
        if isinstance(blk, dict):
            new, total = html, 0
            for slot, body in blk.items():
                s, e = "<!-- seo:%s:start -->" % slot, "<!-- seo:%s:end -->" % slot
                wrapped = s + body + e
                if s in new:
                    new = re.sub(re.escape(s) + ".*?" + re.escape(e), lambda m: wrapped, new, flags=re.S)
                elif INDEX_SLOTS[slot] in new:
                    new = new.replace(INDEX_SLOTS[slot], INDEX_SLOTS[slot] + wrapped, 1)
                else:
                    print("  ! %s: слот %s не найден — пропускаю" % (fname, slot))
                    continue
                total += len(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", body)).strip())
            print("  %-18s %5d знаков текста%s" % (fname, total, "" if not dry else " (не записано)"))
            if not dry and new != html:
                io.open(path, "w", encoding="utf-8", newline="").write(new)
            continue

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
