# -*- coding: utf-8 -*-
"""Сборка data/ideas.js — разборы темы для ideas.html («Разборы»).

Источник — папка с docx-ресерчем аналитика (лежит ВНЕ репозитория). Один прогон =
один выпуск: тема, компании, целевые цены, драйверы, риски. Раз в две недели
приходит новый набор под тему вебинара — прогнать скрипт заново, старый выпуск
уедет в архив на странице.

Структура docx, на которую опирается разбор (у всех файлов одинаковая):
  абзац 0  — «Тикер/Компания: тезис»
  абзац 1  — лид
  абзац 2  — «Наша 12-месячная целевая цена по акциям X — $Y.»
  далее    — тело; последние абзацы, начинающиеся со слова о рисках, — блок рисков

Запуск:  python make_ideas.py
"""
import glob
import html
import io
import json
import os
import re
import math
import zipfile
from datetime import datetime

# Папка с docx лежит РЯДОМ с репозиторием, а не внутри: тексты аналитика в публичный
# репозиторий не попадают. Путь переопределяется переменной окружения RESEARCH_DIR.
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get("RESEARCH_DIR") or os.path.join(HERE, os.pardir, "ресерч")
OUT = os.path.join(HERE, "data", "ideas.js")

# Выпуск: тема, привязка к встрече, порядок слоёв стека.
ISSUE = {
    "id": "ai-infra",
    "title": "ИИ-инфраструктура",
    "sub": "Разбор по всей цепочке: от памяти и ускорителей — через серверную сборку — "
           "к дата-центрам, которые сдают вычисление в аренду. Спрос на ИИ проходит "
           "по этой цепочке сверху вниз, и на каждом слое зарабатывают по-своему.",
    "eventId": "intl-tech-2026-08-20",
    "eventTitle": "Доступ к международным технологическим компаниям",
    "eventDate": "2026-08-20",
}

# Тикер, название, слой стека — в текстах ресерча их нет, проставлено руками.
META = {
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
}

LAYER_ORDER = {"chips": 0, "iron": 1, "cloud": 2}

# Цены закрытия для расчёта потенциала. Дата — ПОСЛЕДНЯЯ ЗАВЕРШЁННАЯ сессия США:
# внутри дня считать нельзя, к вечеру цифра уже другая. Источник — stockanalysis.com
# (проверено вручную 18.08.2026). При новом выпуске ОБНОВИТЬ дату и цены, иначе
# страница покажет потенциал от устаревшей базы — она честно подписана датой,
# но смысла в старой базе нет.
SPOT_DATE = "2026-08-17"
SPOT_SOURCE = "закрытие торгов, stockanalysis.com"
SPOT = {
    "AMD": 506.00,
    "INTC": 103.49,
    "MU": 1011.75,
    "NVDA": 225.01,
    "QCOM": 162.18,
    "DELL": 479.81,
    "SMCI": 38.28,
    "AMZN": 261.31,
    "NBIS": 268.85,
    "ORCL": 146.65,
}

RISK_START = re.compile(r"^(Риски|Риск|Главный риск|Главные риски|Основные риски|Ключевые риски)\b")
# Врезка-подзаголовок внутри абзаца («Ставка на Intel Foundry.», «Почему важен Intel 18A?»).
# Порог 38 знаков подобран по факту: берёт настоящие врезки и не цепляет обычные
# первые предложения (40+ знаков) — иначе выделение расставляет чужие акценты.
LEADIN = re.compile(r"^([А-ЯA-Z][^.?!]{4,36}[.?])\s+(?=[А-ЯA-Z])")


def paragraphs(path):
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8")
    xml = re.sub(r"</w:p>", "\n", xml)
    txt = html.unescape(re.sub(r"<[^>]+>", "", xml))
    return [s.strip() for s in txt.split("\n") if s.strip()]


def parse(path):
    p = paragraphs(path)
    stem = os.path.splitext(os.path.basename(path))[0]
    if stem not in META:
        raise SystemExit(
            "Нет записи в META для файла %s. Добавь тикер, название и слой (chips/iron/cloud)."
            % os.path.basename(path))
    ticker, company, layer = META[stem]

    head = p[0]
    thesis = head.split(":", 1)[1].strip() if ":" in head else head
    thesis = thesis[:1].upper() + thesis[1:]

    m = re.search(r"\$\s?(\d[\d\s.,]*)", p[2])
    raw = m.group(1).strip().rstrip(".,") if m else ""
    target = "$" + raw.replace(",", " ") if raw else ""
    target_num = float(raw.replace(" ", "").replace(",", ".")) if raw else None
    spot = SPOT.get(ticker)
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
        "body": body, "risks": risks,
    }


def main():
    files = [f for f in sorted(glob.glob(os.path.join(SRC, "*.docx")))
             if "Скрипт" not in os.path.basename(f)]
    if not files:
        raise SystemExit("В папке %s не найдено docx-разборов." % SRC)

    items = [parse(f) for f in files]
    items.sort(key=lambda d: (LAYER_ORDER[d["layer"]], d["ticker"]))

    updated = datetime.fromtimestamp(max(os.path.getmtime(f) for f in files)).strftime("%Y-%m-%d")

    issue = dict(ISSUE)
    issue["date"] = updated
    issue["spotDate"] = SPOT_DATE
    issue["spotSource"] = SPOT_SOURCE

    missing = [d["ticker"] for d in items if d["spot"] is None]
    if missing:
        print("ВНИМАНИЕ: нет цены в SPOT для", ", ".join(missing),
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
        "// РАЗБОРЫ — тема раз в две недели под вебинар (страница ideas.html).\n"
        "// ФАЙЛ СОБИРАЕТСЯ СКРИПТОМ `make_ideas.py` из docx-ресерча аналитика,\n"
        "// руками не править: следующий прогон перезапишет текущий выпуск.\n"
        "// Выпуски за другие даты скрипт сохраняет — архив копится сам.\n"
        "// Тикеры, названия компаний и слой стека проставлены в META внутри скрипта:\n"
        "// в текстах аналитика их нет.\n"
    )
    body = "window.IDEAS = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n"
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(head + body)

    print("готово:", OUT)
    print("выпусков:", len(data["issues"]), "| компаний в текущем:", len(items))
    print("база расчёта: закрытие", SPOT_DATE)
    for d in items:
        print("  %-5s %-6s цена %-9s цель %-8s расчёт %-8s на витрину %s" %
              (d["ticker"], d["layer"],
               ("%.2f" % d["spot"]) if d["spot"] else "—",
               d["target"],
               ("+%.1f%%" % d["upside"]) if d["upside"] is not None else "—",
               ("+%d%%" % d["upside5"]) if d["upside5"] is not None else "—"))


if __name__ == "__main__":
    main()
