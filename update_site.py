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
# Заполняйте этот список из своего прайсера: руками, из Excel/CSV
# или прямо расчётом — это обычные питоновские словари.
#
# Поля по типам:
#   discount   — id, type, name, underlying, cls, expiry, quote, chg, minNom
#   protection — + spot, strike (нач. уровень S0), participation (0..1), protectionPct
#   warrant    — + strike, spot
# quote — котировка в % от номинала; chg — изм. за день, п.п.
# ============================================================

INSTRUMENTS = [
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
    dict(
        id="W-SBER-310-0327", type="warrant",
        name="Варрант · Сбербанк CALL 310",
        underlying="Сбербанк", cls="Акции",
        strike=310, spot=296.4,
        expiry="19.03.2027", quote=6.80, chg=0.3, minNom=1_000_000,
    ),
]

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
