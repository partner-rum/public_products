# -*- coding: utf-8 -*-
"""
Обновление данных сайта из Python.

Использование:
  python update_site.py           — перезаписать data/instruments.js локально
  python update_site.py --push    — то же + сразу залить на GitHub (сайт обновится сам)

Для --push нужны переменные окружения:
  GITHUB_TOKEN  — fine-grained токен только на этот репозиторий, права Contents: RW
  GITHUB_REPO   — репозиторий, например "login/products"
  GITHUB_BRANCH — ветка (по умолчанию "main")

Один раз перед первым --push:  pip install requests
"""

import base64
import datetime
import json
import os
import sys

# ============================================================
# ВАШИ ДАННЫЕ.
#
# Поля по типам:
#   discount   — id, type, name, underlying, cls, expiry, quote, chg, minNom
#   protection — + spot, strike (нач. уровень S0), participation (0..1), protectionPct,
#                опц. cap (потолок = макс. учитываемый рост БА, %; нет поля = без потолка)
#   warrant    — собирается сеткой ниже: структура (call / call105 / cs) × БА × срок.
#                Страйки варрантов — в % от начального уровня БА:
#                100 = уровень в день покупки, 105 = +5%, 150 = потолок колл-спреда.
# quote — котировка (премия) в % от номинала; chg — изм. за день, п.п.;
# currency — валюта продукта (RUB / USD), показывается меткой; расчёты на сайте в ₽.
# ============================================================

INSTRUMENTS_BASE = []  # дисконтные/защита капитала сейчас не публикуются

# --- Сетка варрантов: структура × базовый актив × срок ----------------------
# Добавить базовый актив — строка в WARRANT_UNDERLYINGS + котировки в WARRANT_QUOTES.

WARRANT_UNDERLYINGS = {
    "OFZ238": dict(short="ОФЗ 26238", underlying="ОФЗ 26238",           cls="Облигации",  currency="RUB", uRef="52% ном."),
    "NBIS":   dict(short="NBIS",      underlying="Nebius Group (NBIS)", cls="Акции США",  currency="USD", uRef="$205"),
    "NVDA":   dict(short="NVDA",      underlying="NVIDIA (NVDA)",       cls="Акции США",  currency="USD", uRef="$206"),
    "SPY":    dict(short="SPY",       underlying="S&P 500 (SPY)",       cls="Индекс",     currency="USD", uRef="$747"),
    "GLD":    dict(short="GLD",       underlying="Золото (GLD)",        cls="Товары",     currency="USD", uRef="$374"),
    "IBIT":   dict(short="IBIT",      underlying="Bitcoin (IBIT)",      cls="Крипто",     currency="USD", uRef="$37"),
    "CSI300": dict(short="CSI 300",   underlying="CSI 300",             cls="Индекс",     currency="USD", uRef="4 739 пт"),
    "HSI":    dict(short="Hang Seng", underlying="Hang Seng",           cls="Индекс",     currency="USD", uRef="25 132 пт"),
}

# структура -> страйк / потолок / подпись / кусок id
STRUCT_META = {
    "call":    dict(structure="call", strike=100,             prefix="CALL 100 · ",   idpart="C100"),
    "call105": dict(structure="call", strike=105,             prefix="CALL 105 · ",   idpart="C105"),
    "cs":      dict(structure="cs",   strike=100, strike2=150, prefix="CS 100–150 · ", idpart="CS150"),
}

# срок (лет) -> (подпись, дата экспирации, ММГГ для id)
TENOR_META = {
    2: ("2 года", "21.07.2028", "0728"),
    3: ("3 года", "20.07.2029", "0729"),
}

# Котировки из прайсера: (БА, структура, срок) -> (quote, chg). chg=0 — свежий прайс-лист.
WARRANT_QUOTES = {
    ("OFZ238", "call", 2): (15.00, 0), ("OFZ238", "call", 3): (16.00, 0),
    ("OFZ238", "call105", 2): (10.00, 0), ("OFZ238", "call105", 3): (12.00, 0),

    ("NBIS", "call", 2): (70.50, 0), ("NBIS", "call", 3): (86.50, 0),
    ("NBIS", "cs", 2): (14.25, 0),   ("NBIS", "cs", 3): (22.25, 0),

    ("NVDA", "call", 2): (35.25, 0), ("NVDA", "call", 3): (44.00, 0),
    ("NVDA", "cs", 2): (21.75, 0),   ("NVDA", "cs", 3): (25.75, 0),

    ("SPY", "call", 2): (18.25, 0),  ("SPY", "call", 3): (24.25, 0),

    ("GLD", "call", 2): (21.00, 0),  ("GLD", "call", 3): (30.50, 0),

    ("IBIT", "call", 2): (40.00, 0), ("IBIT", "call", 3): (57.00, 0),
    ("IBIT", "cs", 2): (20.00, 0),   ("IBIT", "cs", 3): (24.25, 0),

    ("CSI300", "call", 2): (11.50, 0), ("CSI300", "call", 3): (13.00, 0),

    ("HSI", "call", 2): (17.00, 0),  ("HSI", "call", 3): (20.25, 0),
}


def build_warrants():
    out = []
    for (code, struct, years), (quote, chg) in WARRANT_QUOTES.items():
        u = WARRANT_UNDERLYINGS[code]
        sm = STRUCT_META[struct]
        tenor, expiry, mmyy = TENOR_META[years]
        d = dict(
            id="W-%s-%s-%s" % (code, sm["idpart"], mmyy),
            type="warrant", structure=sm["structure"],
            name=sm["prefix"] + u["short"] + " · " + tenor,
            underlying=u["underlying"], cls=u["cls"], currency=u["currency"],
            strike=sm["strike"],
        )
        if "strike2" in sm:
            d["strike2"] = sm["strike2"]
        if u.get("uRef"):
            d["uRef"] = u["uRef"]
        d.update(spot=100, tenor=tenor, expiry=expiry, quote=quote, chg=chg, minNom=1_000_000)
        out.append(d)
    return out


INSTRUMENTS = INSTRUMENTS_BASE + build_warrants()

# Показывать ли график динамики базового актива в карточке. Пока данные демонстрационные —
# держим ВЫКЛ, чтобы на боевом не было ложной динамики (диаграмма выплаты не зависит от этого).
# Ставить True, когда в UNDERLYINGS_INFO.history появятся РЕАЛЬНЫЕ ряды (см. fetch_underlyings.py).
EMIT_UNDERLYINGS = False

# --- Базовые активы: описание и динамика для карточки инструмента ------------
# history — 12 значений за последние 12 месяцев, последнее = текущий уровень.
# Значения демонстрационные (для линии динамики). IBIT добавится, когда придёт уровень.
UNDERLYINGS_INFO = {
    "ОФЗ 26238": dict(
        unit="% ном.",
        desc="Длинная ОФЗ с постоянным купоном, погашение в 2041 году. Цена растёт при снижении ключевой ставки Банка России.",
        history=[44.8, 45.6, 46.9, 47.7, 48.6, 49.3, 50.1, 50.6, 51.0, 51.4, 51.7, 52.0],
    ),
    "Nebius Group (NBIS)": dict(
        unit="$",
        desc="Nebius Group — облачная AI-инфраструктура: GPU-мощности для обучения и работы моделей. Акции торгуются на NASDAQ.",
        history=[96, 112, 128, 140, 133, 150, 168, 175, 188, 199, 202, 205],
    ),
    "NVIDIA (NVDA)": dict(
        unit="$",
        desc="NVIDIA — разработчик графических и AI-процессоров, ключевой поставщик вычислений для искусственного интеллекта.",
        history=[128, 134, 142, 150, 158, 150, 168, 178, 186, 195, 201, 206],
    ),
    "S&P 500 (SPY)": dict(
        unit="$",
        desc="SPDR S&P 500 ETF (SPY) — биржевой фонд на индекс 500 крупнейших компаний США, самый ликвидный ETF мира. Торгуется на NYSE Arca в долларах.",
        history=[615, 628, 640, 655, 668, 660, 685, 702, 715, 728, 738, 747],
    ),
    "Золото (GLD)": dict(
        unit="$",
        desc="SPDR Gold Shares (GLD) — крупнейший биржевой фонд на физическое золото; акция обеспечена слитковым золотом на хранении. Ставка на защитный актив. Торгуется на NYSE Arca в долларах.",
        history=[300, 308, 318, 326, 335, 342, 350, 356, 362, 367, 371, 374],
    ),
    "CSI 300": dict(
        unit="пт",
        desc="Индекс 300 крупнейших компаний бирж Шанхая и Шэньчжэня — основной барометр материкового рынка акций Китая (акции класса A).",
        history=[3980, 4060, 4180, 4260, 4350, 4290, 4420, 4520, 4600, 4680, 4710, 4739],
    ),
    "Hang Seng": dict(
        unit="пт",
        desc="Гонконгский фондовый индекс крупнейших компаний Hong Kong Stock Exchange, включая ведущих китайских технологических и финансовых эмитентов. Ключевой ориентир азиатского рынка.",
        history=[20800, 21400, 22100, 22700, 23400, 22900, 23800, 24300, 24700, 24950, 25040, 25132],
    ),
    "Bitcoin (IBIT)": dict(
        unit="$",
        desc="iShares Bitcoin Trust (IBIT) от BlackRock — спотовый биржевой фонд на биткоин; цена акции следует за курсом BTC за вычетом комиссии фонда. Экспозиция на крупнейшую криптовалюту через биржевую оболочку. Торгуется на NASDAQ в долларах.",
        history=[24, 27, 30, 33, 29, 32, 35, 34, 36, 35, 36, 37],
    ),
}

# ============================================================

DATA_REL_PATH = "data/instruments.js"
DATA_LOCAL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), *DATA_REL_PATH.split("/"))


def extract_sales_items(js_text: str) -> list:
    """Достаёт из текущего instruments.js продукты, добавленные сейлзами через админку
    (помечены "src": "sales"). Дописываются в конец при перегенерации, чтобы не затирались."""
    try:
        body = js_text[js_text.index("{"): js_text.rindex("}") + 1]
        data = json.loads(body)
    except (ValueError, KeyError):
        return []
    return [i for i in data.get("instruments", []) if i.get("src") == "sales"]


def render_js(sales_items: list) -> str:
    """Собирает содержимое data/instruments.js: сгенерированные + сейлзовые."""
    gen_ids = {i["id"] for i in INSTRUMENTS}
    extra = [i for i in sales_items if i.get("id") not in gen_ids]
    payload = {
        "updated": datetime.date.today().isoformat(),
        "instruments": INSTRUMENTS + extra,
        "underlyings": UNDERLYINGS_INFO if EMIT_UNDERLYINGS else {},
    }
    return (
        "// Файл сгенерирован update_site.py — руками не править (перезапишется при следующем запуске).\n"
        "// Продукты с \"src\": \"sales\" добавлены через админку и сохраняются при перегенерации.\n"
        "// Обновлено: " + payload["updated"] + "\n"
        "window.SITE_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n"
    )


def write_local() -> None:
    os.makedirs(os.path.dirname(DATA_LOCAL_PATH), exist_ok=True)
    sales = []
    if os.path.exists(DATA_LOCAL_PATH):
        with open(DATA_LOCAL_PATH, encoding="utf-8") as f:
            sales = extract_sales_items(f.read())
    with open(DATA_LOCAL_PATH, "w", encoding="utf-8") as f:
        f.write(render_js(sales))
    print("OK: записан", DATA_LOCAL_PATH, f"(+{len(sales)} от сейлзов)" if sales else "")
    print("Проверьте локально: откройте index.html в браузере.")


def push_to_github() -> None:
    import requests  # pip install requests

    token = os.environ["GITHUB_TOKEN"]
    repo = os.environ["GITHUB_REPO"]
    branch = os.environ.get("GITHUB_BRANCH", "main")

    api = f"https://api.github.com/repos/{repo}/contents/{DATA_REL_PATH}"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}

    r = requests.get(api, headers=headers, params={"ref": branch})
    sha, sales = None, []
    if r.status_code == 200:
        sha = r.json().get("sha")
        try:
            remote_text = base64.b64decode(r.json()["content"]).decode("utf-8")
            sales = extract_sales_items(remote_text)
        except Exception:
            sales = []

    body = {
        "message": "Обновление котировок " + datetime.datetime.now().strftime("%d.%m.%Y %H:%M"),
        "content": base64.b64encode(render_js(sales).encode("utf-8")).decode("ascii"),
        "branch": branch,
    }
    if sha:
        body["sha"] = sha

    r = requests.put(api, headers=headers, json=body)
    r.raise_for_status()
    print(f"OK: запушено в {repo} ({branch}) — сайт обновится через 1–2 минуты."
          + (f" Сохранено продуктов от сейлзов: {len(sales)}." if sales else ""))


if __name__ == "__main__":
    write_local()
    if "--push" in sys.argv:
        push_to_github()
