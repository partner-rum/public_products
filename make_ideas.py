# -*- coding: utf-8 -*-
"""Сборка data/ideas.js — разборы темы для ideas.html («Разборы»).

Источник — папка с ресерчем (лежит ВНЕ репозитория): .docx от аналитика либо .md,
когда разбор собираем сами по публичным источникам. Один прогон = один выпуск:
тема, компании, целевые цены, драйверы, риски. Новый набор под тему вебинара —
прогнать скрипт заново, старый выпуск уедет в архив на странице.

Структура файла, на которую опирается разбор (одинаковая у docx и md; абзацы
в md разделяются пустой строкой):
  абзац 0  — «Тикер/Компания: тезис»
  абзац 1  — лид
  абзац 2  — «...целевая цена по акциям X — 399 ₽.» (валюта — из конфига темы)
  далее    — тело; последние абзацы, начинающиеся со слова о рисках, — блок рисков

Темы описаны в CONFIGS. Валюта задаётся темой: у рублёвых выпусков цены закрытия
тянутся с МосБиржи автоматически, у долларовых лежат в конфиге руками.

Запуск:  python make_ideas.py [id-темы]     (по умолчанию — ru-market)
"""
import glob
import html
import io
import json
import os
import re
import sys
import math
import zipfile
from datetime import datetime

# Папка с ресерчем лежит РЯДОМ с репозиторием, а не внутри: черновики в публичный
# репозиторий не попадают. Путь переопределяется переменной окружения RESEARCH_DIR.
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "ideas.js")


def _res(*parts):
    return os.path.join(HERE, os.pardir, "ресерч", *parts)


# ── Темы ─────────────────────────────────────────────────────────────────────
# Каждая тема самодостаточна: папка-источник, валюта, слои, META и способ
# получения цены. Прошлые темы остаются рабочими — архив пересобирается тем же
# скриптом, а не переписыванием файла руками.
CONFIGS = {
    "ru-market": {
        "src": _res("ru-market-2026-08"),
        "currency": "RUB",
        # Цены закрытия тянем с МосБиржи: рублёвый выпуск обновляется чаще
        # долларового, а ручная таблица цен — главный источник расхождений.
        "spotSource": "закрытие торгов, МосБиржа (ISS)",
        "issue": {
            "id": "ru-market",
            "title": "Российский рынок: десять историй",
            "sub": "Разбор по тому, что реально двигает бизнес: банки живут ключевой ставкой, "
                   "внутренний рынок — спросом внутри страны, экспортёры — мировыми ценами "
                   "и курсом рубля. Один и тот же рынок платит этим трём группам за разное.",
            # Оговорка идёт ПЕРВОЙ строкой в блоке о методике расчёта. Без неё
            # потенциалы в 35–90% читаются как обещание доходности, хотя они
            # получены в основном падением котировок, а не ростом целевых цен.
            "context": "Почему проценты такие большие. С начала 2026 года индекс МосБиржи "
                       "потерял около четверти стоимости, а целевые цены аналитиков "
                       "пересматриваются медленнее котировок. Разрыв между ценой и целью "
                       "отражает глубину падения рынка, а не обещание заработка: сначала "
                       "должно измениться то, из-за чего рынок падал.",
            "eventId": "",
            "eventTitle": "",
            "eventDate": "",
        },
        "layers": ["fin", "domestic", "export"],
        "meta": {
            "Сбербанк":      ("SBER",  "Сбербанк",             "fin"),
            "Т-Технологии":  ("T",     "Т-Технологии",         "fin"),
            "ДОМ.РФ":        ("DOMRF", "ДОМ.РФ",               "fin"),
            "Яндекс":        ("YDEX",  "Яндекс",               "domestic"),
            "Хэдхантер":     ("HEAD",  "Хэдхантер",            "domestic"),
            "Ростелеком":    ("RTKM",  "Ростелеком",           "domestic"),
            "Озон Фарма":    ("OZPH",  "Озон Фармацевтика",    "domestic"),
            "Татнефть":      ("TATN",  "Татнефть",             "export"),
            "Новатэк":       ("NVTK",  "Новатэк",              "export"),
            "Норникель":     ("GMKN",  "Норникель",            "export"),
        },
    },
    "ai-infra": {
        "src": _res("20082026"),
        "currency": "USD",
        # Дата — ПОСЛЕДНЯЯ ЗАВЕРШЁННАЯ сессия США: внутри дня считать нельзя,
        # к вечеру цифра уже другая. Проверено вручную 18.08.2026.
        "spotDate": "2026-08-17",
        "spotSource": "закрытие торгов, stockanalysis.com",
        "spot": {
            "AMD": 506.00, "INTC": 103.49, "MU": 1011.75, "NVDA": 225.01,
            "QCOM": 162.18, "DELL": 479.81, "SMCI": 38.28, "AMZN": 261.31,
            "NBIS": 268.85, "ORCL": 146.65,
        },
        "issue": {
            "id": "ai-infra",
            "title": "ИИ-инфраструктура",
            "sub": "Разбор по всей цепочке: от памяти и ускорителей — через серверную сборку — "
                   "к дата-центрам, которые сдают вычисление в аренду. Спрос на ИИ проходит "
                   "по этой цепочке сверху вниз, и на каждом слое зарабатывают по-своему.",
            "eventId": "intl-tech-2026-08-20",
            "eventTitle": "Доступ к международным технологическим компаниям",
            "eventDate": "2026-08-20",
        },
        "layers": ["chips", "iron", "cloud"],
        "meta": {
            "AMD": ("AMD", "AMD", "chips"),
            "Intel": ("INTC", "Intel", "chips"),
            "Micron": ("MU", "Micron Technology", "chips"),
            "NVIDIA": ("NVDA", "NVIDIA", "chips"),
            "QCOM": ("QCOM", "Qualcomm", "chips"),
            "DELL": ("DELL", "Dell Technologies", "iron"),
            "Microcomputer": ("SMCI", "Super Micro Computer", "iron"),
            "Amazon": ("AMZN", "Amazon", "cloud"),
            "Oracle": ("ORCL", "Oracle", "cloud"),
            "Nebius": ("NBIS", "Nebius Group", "cloud"),
        },
    },
}

CUR_SIGN = {"RUB": "₽", "USD": "$"}


def moex_spot(tickers):
    """Цены закрытия последней ЗАВЕРШЁННОЙ сессии МосБиржи (TQBR).

    Внутридневную цену не берём намеренно: потенциал на странице подписан датой,
    и база расчёта должна быть той же, что у любого проверяющего.
    """
    import requests  # только для рублёвых тем — доллары лежат в конфиге
    from datetime import timedelta
    base = ("https://iss.moex.com/iss/history/engines/stock/markets/shares"
            "/boards/TQBR/securities/%s.json")
    # ДИАПАЗОН ОБЯЗАТЕЛЕН: без него ISS отдаёт ПЕРВУЮ страницу истории — торги
    # 2013 года. Окно в две недели перекрывает праздники и приостановки.
    today = datetime.now().date()
    window = {"from": (today - timedelta(days=14)).isoformat(),
              "till": today.isoformat(), "iss.meta": "off"}
    out, date = {}, None
    for t in tickers:
        r = requests.get(base % t, params=window, timeout=30).json()
        cols = {c: i for i, c in enumerate(r["history"]["columns"])}
        rows = [x for x in r["history"]["data"] if x[cols["CLOSE"]]]
        if not rows:
            print("ВНИМАНИЕ: МосБиржа не отдала цену по", t)
            continue
        last = rows[-1]
        out[t] = float(last[cols["CLOSE"]])
        d = last[cols["TRADEDATE"]]
        # Дата расчёта одна на выпуск: если бумаги закрылись в разные дни
        # (приостановка торгов), берём САМУЮ РАННЮЮ — подпись не должна обещать
        # свежесть, которой у части цен нет.
        date = d if date is None else min(date, d)
    return out, date

RISK_START = re.compile(r"^(Риски|Риск|Главный риск|Главные риски|Основные риски|Ключевые риски)\b")
# Врезка-подзаголовок внутри абзаца («Ставка на Intel Foundry.», «Почему важен Intel 18A?»).
# Порог 38 знаков подобран по факту: берёт настоящие врезки и не цепляет обычные
# первые предложения (40+ знаков) — иначе выделение расставляет чужие акценты.
LEADIN = re.compile(r"^([А-ЯA-Z][^.?!]{4,36}[.?])\s+(?=[А-ЯA-Z])")


def paragraphs(path):
    if path.lower().endswith(".md"):
        txt = io.open(path, encoding="utf-8").read()
        # Абзац = блок между пустыми строками; внутри блока переносы схлопываем,
        # чтобы исходник можно было переносить по ширине без следов в данных.
        return [re.sub(r"\s*\n\s*", " ", b).strip()
                for b in re.split(r"\n\s*\n", txt) if b.strip()]
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8")
    xml = re.sub(r"</w:p>", "\n", xml)
    txt = html.unescape(re.sub(r"<[^>]+>", "", xml))
    return [s.strip() for s in txt.split("\n") if s.strip()]


def parse(path, cfg, spot_map):
    p = paragraphs(path)
    stem = os.path.splitext(os.path.basename(path))[0]
    meta, layers = cfg["meta"], cfg["layers"]
    if stem not in meta:
        raise SystemExit(
            "Нет записи в meta темы для файла %s. Добавь тикер, название и слой (%s)."
            % (os.path.basename(path), "/".join(layers)))
    ticker, company, layer = meta[stem]

    head = p[0]
    thesis = head.split(":", 1)[1].strip() if ":" in head else head
    thesis = thesis[:1].upper() + thesis[1:]

    sign = CUR_SIGN[cfg["currency"]]
    # Рубли пишутся ПОСЛЕ числа («399 ₽»), доллары — перед («$665»): ищем оба
    # порядка, иначе смена валюты молча оставляет выпуск без целевых цен.
    m = (re.search(r"(\d[\d\s.,]*)\s*" + re.escape(sign), p[2]) or
         re.search(re.escape(sign) + r"\s?(\d[\d\s.,]*)", p[2]))
    raw = m.group(1).strip().rstrip(".,") if m else ""
    if raw:
        num = raw.replace(" ", "").replace(" ", "")
        # «736,50» — десятичная запятая; «1 410,70» — она же при разряде пробелом.
        # Запятая-разделитель тысяч в наших исходниках не встречается.
        target_num = float(num.replace(",", "."))
        pretty = raw.replace(" ", " ")
        target = (pretty + " " + sign) if cfg["currency"] == "RUB" else (sign + pretty)
    else:
        target, target_num = "", None
    spot = spot_map.get(ticker)
    # Потенциал считаем здесь, а не на странице: цифра должна быть одна и та же
    # в сводке, в схеме и в разборе.
    upside = round((target_num / spot - 1) * 100, 1) if (target_num and spot) else None
    # На витрину идёт округление до БЛИЖАЙШЕГО кратного 5 (решение Руслана 18.08.2026):
    # круглая цифра читается лучше. Сначала округляли вверх — отказались: 25,4 → 30
    # и 30,2 → 35 приписывали до 4,8 п.п. потенциала, которого целевая цена не даёт.
    # Точный процент остаётся в данных и печатается на странице рядом: без него
    # округлённая цифра не сходится с парой «цена → цель».
    upside5 = int(math.floor(upside / 5.0 + 0.5) * 5) if upside is not None else None

    rest = p[3:]

    # «Показатели: метка = значение; метка = значение» — плитка ключевых цифр
    # над телом разбора. Без неё все числа тонули в прозе и текст читался стеной.
    facts = []
    fi = next((i for i, s in enumerate(rest) if s.startswith("Показатели:")), None)
    if fi is not None:
        raw_f = rest.pop(fi)[len("Показатели:"):]
        for chunk in raw_f.split(";"):
            if "=" not in chunk:
                continue
            k, v = chunk.split("=", 1)
            facts.append({"k": k.strip(), "v": v.strip()})

    # «Что проверять дальше: A; B; C» — это список, а не абзац; разбираем в пункты
    watch = []
    wi = next((i for i, s in enumerate(rest) if s.startswith("Что проверять")), None)
    if wi is not None:
        raw_w = rest.pop(wi)
        tail = raw_w.split(":", 1)[1] if ":" in raw_w else ""
        for chunk in tail.split(";"):
            t = chunk.strip().rstrip(".").lstrip()
            t = re.sub(r"^и\s+", "", t)          # «и подтвердит ли…» — остаток перечисления
            if t:
                watch.append(t[:1].upper() + t[1:])

    ri = next((i for i, s in enumerate(rest) if RISK_START.match(s)), len(rest))
    body_src, risks = rest[:ri], rest[ri:]
    risks = [re.sub(r"^Риски[.:]\s*", "", s) for s in risks]

    body = []
    for s in body_src:
        mm = LEADIN.match(s)
        if mm:
            body.append({"head": mm.group(1), "text": s[mm.end():].strip()})
        else:
            body.append({"text": s})

    return {
        "ticker": ticker, "company": company, "layer": layer,
        "thesis": thesis, "lead": p[1],
        "target": target, "targetNum": target_num,
        "spot": spot, "upside": upside, "upside5": upside5,
        "facts": facts, "body": body, "watch": watch, "risks": risks,
    }


def main():
    key = next((a for a in sys.argv[1:] if not a.startswith("-")), "ru-market")
    if key not in CONFIGS:
        raise SystemExit("Неизвестная тема %r. Есть: %s" % (key, ", ".join(CONFIGS)))
    cfg = CONFIGS[key]
    src = os.environ.get("RESEARCH_DIR") or cfg["src"]

    files = [f for f in sorted(glob.glob(os.path.join(src, "*.docx")) +
                               glob.glob(os.path.join(src, "*.md")))
             if "Скрипт" not in os.path.basename(f)]
    if not files:
        raise SystemExit("В папке %s не найдено разборов (.docx/.md)." % src)

    layer_order = {k: i for i, k in enumerate(cfg["layers"])}

    if cfg["currency"] == "RUB":
        tickers = [t for t, _, _ in cfg["meta"].values()]
        spot_map, spot_date = moex_spot(tickers)
    else:
        spot_map, spot_date = cfg["spot"], cfg["spotDate"]

    items = [parse(f, cfg, spot_map) for f in files]
    items.sort(key=lambda d: (layer_order[d["layer"]], d["ticker"]))

    updated = datetime.fromtimestamp(max(os.path.getmtime(f) for f in files)).strftime("%Y-%m-%d")

    issue = dict(cfg["issue"])
    issue["date"] = updated
    issue["currency"] = cfg["currency"]
    issue["spotDate"] = spot_date
    issue["spotSource"] = cfg["spotSource"]

    missing = [d["ticker"] for d in items if d["spot"] is None]
    if missing:
        print("ВНИМАНИЕ: нет цены для", ", ".join(missing),
              "— потенциал у них не посчитается")
    issue["items"] = items

    data = {"updated": updated, "issues": [issue]}

    # Существующие выпуски за другие даты сохраняем: скрипт пересобирает ТОЛЬКО
    # текущую тему, архив прошлых разборов не трогаем.
    if os.path.exists(OUT):
        old = io.open(OUT, encoding="utf-8").read()
        m = re.search(r"window\.IDEAS\s*=\s*(\{.*\})\s*;\s*\Z", old, re.S)
        if m:
            try:
                prev = json.loads(m.group(1)).get("issues", [])
                keep = [x for x in prev if x.get("id") != issue["id"]]
                data["issues"] = [issue] + keep
            except ValueError:
                print("Прошлый data/ideas.js не разобрался как JSON — перезаписываю целиком.")

    head = (
        "// РАЗБОРЫ — тема под вебинар (страница ideas.html).\n"
        "// ФАЙЛ СОБИРАЕТСЯ СКРИПТОМ `make_ideas.py` из ресерча (.docx/.md),\n"
        "// руками не править: следующий прогон перезапишет текущий выпуск.\n"
        "// Выпуски за другие темы скрипт сохраняет — архив копится сам.\n"
        "// Тикеры, названия компаний и слой проставлены в CONFIGS внутри скрипта:\n"
        "// в текстах ресерча их нет.\n"
    )
    body = "window.IDEAS = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(head + body)

    print("готово:", OUT)
    print("выпусков:", len(data["issues"]), "| компаний в текущем:", len(items))
    print("тема:", key, "| валюта:", cfg["currency"])
    print("база расчёта: закрытие", spot_date)
    for d in items:
        print("  %-6s %-9s цена %-10s цель %-11s расчёт %-8s на витрину %s" %
              (d["ticker"], d["layer"],
               ("%.2f" % d["spot"]) if d["spot"] else "—",
               d["target"],
               ("+%.1f%%" % d["upside"]) if d["upside"] is not None else "—",
               ("+%d%%" % d["upside5"]) if d["upside5"] is not None else "—"))


if __name__ == "__main__":
    main()
