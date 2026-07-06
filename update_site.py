# -*- coding: utf-8 -*-
"""
Обновление данных сайта из Python.

Использование:
  python update_site.py           — перезаписать data/instruments.js локально
  python update_site.py --push    — то же + сразу залить на GitHub (сайт обновится сам)

Для --push нужны переменные окружения:
  GITHUB_TOKEN  — токен: github.com → Settings → Developer settings →
                  Fine-grained personal access tokens → New token →
                  доступ только к вашему репозиторию, права Contents: Read and write
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
#   protection — + spot, strike (нач. уровень S0), participation (0..1), protectionPct
#   warrant    — собирается сеткой ниже: структура (call / cs) × БА × срок.
#                Страйки варрантов — в % от начального уровня БА:
#                100 = уровень в день покупки, 150 = плюс 50%.
# quote — котировка (премия) в % от номинала; chg — изм. за день, п.п.
# ============================================================

INSTRUMENTS_BASE = [
    dict(
        id="D-OFZ-1226", type="discount",
        name="Дисконтная облигация · ОФЗ",
        underlying="ОФЗ", cls="Облигации",
        expiry="18.12.2026", quote=96.80, chg=0.1, minNom=1_000_000,
    ),
    dict(
        id="P-IMOEX-0627", type="protection",
        name="Защита капитала · Индекс МосБиржи",
        underlying="Индекс МосБиржи", cls="Индекс",
        spot=3285, strike=3285, participation=0.6, protectionPct=100,
        expiry="18.06.2027", quote=101.30, chg=0.2, minNom=1_000_000,
    ),
]

# --- Сетка варрантов: структура × базовый актив × срок ----------------------
# Добавить базовый актив — новая строка в WARRANT_UNDERLYINGS + котировки.
# Добавить срок — новая строка в WARRANT_TENORS + котировки.

WARRANT_UNDERLYINGS = {
    "SPX":    dict(short="S&P 500",   underlying="S&P 500",             cls="Индекс",    uRef="6 320 пт"),
    "OFZ238": dict(short="ОФЗ 26238", underlying="ОФЗ 26238",           cls="Облигации", uRef="64,1% ном."),
    "NBIS":   dict(short="NBIS",      underlying="Nebius Group (NBIS)", cls="Акции США", uRef="$54,80"),
    "NVDA":   dict(short="NVDA",      underlying="NVIDIA (NVDA)",       cls="Акции США", uRef="$176,40"),
}

# (лет, подпись, дата экспирации, ММГГ для id)
WARRANT_TENORS = [
    (1, "1 год",  "16.07.2027", "0727"),
    (2, "2 года", "21.07.2028", "0728"),
    (3, "3 года", "20.07.2029", "0729"),
]

# Котировки из прайсера: (БА, структура, срок в годах) -> (quote, chg).
#   call — CALL со страйком 100 (участие в росте без потолка);
#   cs   — колл-спред 100–150 (рост засчитывается до +50%, выплата ≤ 50% номинала).
# Нет пары в словаре — инструмент не публикуется.
WARRANT_QUOTES = {
    ("SPX", "call", 1): (7.60, 0.2),    ("SPX", "call", 2): (11.30, 0.3),   ("SPX", "call", 3): (14.30, 0.3),
    ("SPX", "cs", 1):   (7.45, 0.2),    ("SPX", "cs", 2):   (10.65, 0.2),   ("SPX", "cs", 3):   (12.50, 0.3),

    ("OFZ238", "call", 1): (3.80, 0.1), ("OFZ238", "call", 2): (5.30, 0.2), ("OFZ238", "call", 3): (6.20, 0.2),
    ("OFZ238", "cs", 1):   (3.75, 0.1), ("OFZ238", "cs", 2):   (5.20, 0.1), ("OFZ238", "cs", 3):   (6.10, 0.2),

    ("NBIS", "call", 1): (23.30, -0.6), ("NBIS", "call", 2): (33.10, -0.4), ("NBIS", "call", 3): (40.40, -0.3),
    ("NBIS", "cs", 1):   (13.45, -0.2), ("NBIS", "cs", 2):   (13.30, -0.1), ("NBIS", "cs", 3):   (12.60, -0.1),

    ("NVDA", "call", 1): (17.60, 0.4),  ("NVDA", "call", 2): (25.40, 0.5),  ("NVDA", "call", 3): (31.60, 0.5),
    ("NVDA", "cs", 1):   (12.90, 0.2),  ("NVDA", "cs", 2):   (13.95, 0.2),  ("NVDA", "cs", 3):   (14.20, 0.1),
}


def build_warrants():
    out = []
    for code, u in WARRANT_UNDERLYINGS.items():
        for struct in ("call", "cs"):
            for years, tenor, expiry, mmyy in WARRANT_TENORS:
                if (code, struct, years) not in WARRANT_QUOTES:
                    continue
                quote, chg = WARRANT_QUOTES[(code, struct, years)]
                d = dict(
                    id="W-%s-%s-%s" % (code, "C100" if struct == "call" else "CS150", mmyy),
                    type="warrant", structure=struct,
                    name=("CALL 100 · " if struct == "call" else "CS 100–150 · ") + u["short"] + " · " + tenor,
                    underlying=u["underlying"], cls=u["cls"], uRef=u["uRef"],
                    strike=100,
                )
                if struct == "cs":
                    d["strike2"] = 150
                d.update(spot=100, tenor=tenor, expiry=expiry,
                         quote=quote, chg=chg, minNom=1_000_000)
                out.append(d)
    return out


INSTRUMENTS = INSTRUMENTS_BASE + build_warrants()

# ============================================================

DATA_REL_PATH = "data/instruments.js"
DATA_LOCAL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), *DATA_REL_PATH.split("/"))


def render_js() -> str:
    """Собирает содержимое data/instruments.js."""
    payload = {
        "updated": datetime.date.today().isoformat(),
        "instruments": INSTRUMENTS,
    }
    return (
        "// Файл сгенерирован update_site.py — руками не править (перезапишется при следующем запуске).\n"
        "// Обновлено: " + payload["updated"] + "\n"
        "window.SITE_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n"
    )


def write_local() -> None:
    with open(DATA_LOCAL_PATH, "w", encoding="utf-8") as f:
        f.write(render_js())
    print("OK: записан", DATA_LOCAL_PATH)
    print("Проверьте локально: откройте index.html в браузере.")


def push_to_github() -> None:
    import requests  # pip install requests

    token = os.environ["GITHUB_TOKEN"]
    repo = os.environ["GITHUB_REPO"]
    branch = os.environ.get("GITHUB_BRANCH", "main")

    api = f"https://api.github.com/repos/{repo}/contents/{DATA_REL_PATH}"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}

    # sha текущей версии файла — нужен GitHub для обновления
    r = requests.get(api, headers=headers, params={"ref": branch})
    sha = r.json().get("sha") if r.status_code == 200 else None

    body = {
        "message": "Обновление котировок " + datetime.datetime.now().strftime("%d.%m.%Y %H:%M"),
        "content": base64.b64encode(render_js().encode("utf-8")).decode("ascii"),
        "branch": branch,
    }
    if sha:
        body["sha"] = sha

    r = requests.put(api, headers=headers, json=body)
    r.raise_for_status()
    print(f"OK: запушено в {repo} ({branch}) — сайт обновится через 1–2 минуты.")


if __name__ == "__main__":
    write_local()
    if "--push" in sys.argv:
        push_to_github()
