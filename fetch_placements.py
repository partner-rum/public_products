# -*- coding: utf-8 -*-
"""
Выгрузка размещённых выпусков (RSP) из бэкофиса api.bo → data/placements.js

Паттерн API (см. api.bo: DRF + JWT):
  1) POST {BASE}token/                                — JWT access-токен
  2) GET  {BASE}v2/bond-short-info/?only_structured=true — резолв ISIN → id
  3) GET  {BASE}bond/{id}/                            — полная карточка выпуска
     (autocalls[].autocall — корзина/купоны/нок-ауты, autocalls[].rumberg_json — пэйофф)

Креды (в git не попадают): файл .bo_creds в папке проекта — логин первой строкой,
пароль второй; либо переменные окружения BO_USERNAME / BO_PASSWORD.

Запуск:  python fetch_placements.py            — выгрузить сырьё в placements_raw.json
         python fetch_placements.py --emit     — только пересобрать data/placements.js из сырья
"""
import json
import os
import re
import sys
import time

import requests

BASE_URLS = ["https://api.bo.rumberg.ru/", "https://api.bo.rumberg.tech/"]
HERE = os.path.dirname(os.path.abspath(__file__))
RAW_PATH = os.path.join(HERE, "placements_raw.json")

# Название \t ISIN — выпуски RSP без TRS (источник: список от 10.07.2026)
ISSUES = """
RSP СП-2-73-ЦБ-RUB\tRU000A10CVC6
RSP СП-1-52-ЦБ-RUB\tRU000A10CBH7
RSP СП-2-76-ЦБ-RUB\tRU000A10CVF9
RSP СП-1-9\tRU000A10A9F3
RSP СП-1-29-ЦБ-FX-RUB\tRU000A10B9W7
RSP СП-1-4\tRU000A108F97
RSP СП-1-55-ЦБ-RUB\tRU000A10CBL9
RSP СП-2-74-ЦБ-RUB\tRU000A10CVD4
RSP СП-2-78-ЦБ-RUB\tRU000A10CVH5
RSP СП-2-72-ЦБ-RUB\tRU000A10CVB8
RSP СП-2-75-ЦБ-RUB\tRU000A10CVE2
RSP СП-1-35-FX-RUB\tRU000A10BA19
RSP СП-1-5\tRU000A108FA6
RSP СП-2-84-ЦБ-FX-RUB\tRU000A10DER8
RSP СП-2-85-ЦБ-FX-RUB\tRU000A10DES6
RSP СП-2-69\tRU000A10CV88
RSP СП-1-1\tRU000A1087H2
RSP СП-1-37-ЦБ-RUB\tRU000A10BUD8
RSP СП-1-38-ЦБ-RUB\tRU000A10BUE6
RSP СП-1-39-ЦБ-RUB\tRU000A10BUF3
RSP СП-1-40-ЦБ-RUB\tRU000A10BUG1
RSP СП-1-11\tRU000A10A9H9
RSP СП-1-36-FX-RUB\tRU000A10BA27
RSP СП-1-54-ЦБ-RUB\tRU000A10CBK1
RSP СП-1-13\tRU000A109EJ8
RSP СП-1-21\tRU000A10ASH5
RSP СП-1-22\tRU000A10ASJ1
RSP СП-1-41-ЦБ-RUB\tRU000A10BUH9
RSP СП-1-47-ЦБ-RUB\tRU000A10CBC8
RSP СП-1-23\tRU000A10ASK9
RSP СП-1-48-ЦБ-RUB\tRU000A10CBD6
RSP СП-1-15\tRU000A10A9B2
RSP СП-1-2\tRU000A108F71
RSP СП-1-49-ЦБ-RUB\tRU000A10CBE4
RSP СП-1-50-ЦБ-RUB\tRU000A10CBF1
RSP СП-2-83-ЦБ-FX-RUB\tRU000A10DEK3
RSP СП-1-51-ЦБ-RUB\tRU000A10CBG9
RSP СП-1-24\tRU000A10ASL7
RSP СП-1-53-ЦБ-RUB\tRU000A10CBJ3
RSP СП-2-77-ЦБ-RUB\tRU000A10CVG7
RSP СП-1-3\tRU000A108F89
RSP-СП-1-6\tRU000A108FB4
RSP-СП-1-8\tRU000A10A9E6
RSP СП-1-30-ЦБ-FX-RUB\tRU000A10B9X5
RSP РСП-1-58\tRU000A10CRT8
RSP СП-1-16\tRU000A10A9C0
RSP СП-2-67\tRU000A10CV62
RSP СП-2-68\tRU000A10CV70
RSP СП-1-33-FX-RUB\tRU000A10B9Z0
RSP СП-1-27-ЦБ-FX-RUB\tRU000A10B9U1
RSP СП-1-34-FX-RUB\tRU000A10BA01
RSP СП-1-12\tRU000A109EH2
RSP СП-1-28-ЦБ-FX-RUB\tRU000A10B9V9
RSP СП-1-10\tRU000A10A9G1
"""


def load_creds():
    user = os.environ.get("BO_USERNAME")
    pwd = os.environ.get("BO_PASSWORD")
    if user and pwd:
        return user, pwd
    creds_path = os.path.join(HERE, ".bo_creds")
    if os.path.exists(creds_path):
        with open(creds_path, encoding="utf-8") as f:
            lines = [l.strip() for l in f if l.strip()]
        if len(lines) >= 2:
            return lines[0], lines[1]
    print("Нет кредов: задайте BO_USERNAME/BO_PASSWORD или создайте файл .bo_creds "
          "(логин первой строкой, пароль второй).")
    sys.exit(1)


def get_session():
    user, pwd = load_creds()
    last_err = None
    for base in BASE_URLS:
        try:
            r = requests.post(base + "token/", data={"username": user, "password": pwd}, timeout=20)
            if r.status_code == 200:
                s = requests.Session()
                s.headers["Authorization"] = "Bearer " + r.json()["access"]
                print(f"Авторизация OK: {base}")
                return s, base
            last_err = f"{base}: HTTP {r.status_code} {r.text[:200]}"
        except requests.RequestException as e:
            last_err = f"{base}: {e}"
    print("Не удалось авторизоваться:", last_err)
    sys.exit(1)


def parse_issues():
    out = []
    for line in ISSUES.strip().splitlines():
        name, isin = line.split("\t")
        out.append({"name": name.strip(), "isin": isin.strip()})
    return out


def fetch():
    issues = parse_issues()
    s, base = get_session()

    # ISIN → bond id (короткий справочник; сначала структурные, потом все — на случай пропусков)
    isin2id = {}
    for qs in ("?only_structured=true", ""):
        r = s.get(base + "v2/bond-short-info/" + qs, timeout=60)
        r.raise_for_status()
        payload = r.json()
        rows = payload.get("data", payload) if isinstance(payload, dict) else payload
        for row in rows:
            if row.get("isin"):
                isin2id.setdefault(row["isin"].strip(), row["id"])
        if all(i["isin"] in isin2id for i in issues):
            break

    found, missing = [], []
    for i in issues:
        bond_id = isin2id.get(i["isin"])
        if bond_id is None:
            missing.append(i)
            continue
        r = s.get(f"{base}bond/{bond_id}/", timeout=60)
        if r.status_code != 200:
            print(f"  ! {i['isin']}: HTTP {r.status_code}")
            missing.append(i)
            continue
        found.append({**i, "bond_id": bond_id, "bond": r.json()})
        print(f"  + {i['isin']} → id {bond_id}")
        time.sleep(0.15)  # не душим прод

    # Текущие цены базовых активов — реалтайм-снимок одним запросом (только чтение)
    rt_prices = []
    r = s.get(base + "rt-price-equity/", timeout=60)
    if r.status_code == 200:
        payload = r.json()
        rt_prices = payload.get("results", payload) if isinstance(payload, dict) else payload
        print(f"rt-price-equity: {len(rt_prices)} цен")
    else:
        print(f"  ! rt-price-equity: HTTP {r.status_code} — цены не обновлены")

    with open(RAW_PATH, "w", encoding="utf-8") as f:
        json.dump({"fetched_at": time.strftime("%Y-%m-%d %H:%M"), "found": found,
                   "missing": missing, "rt_prices": rt_prices}, f, ensure_ascii=False, indent=1)
    print(f"\nИтого: {len(found)} выгружено, {len(missing)} не найдено → {RAW_PATH}")
    if missing:
        for m in missing:
            print("  нет в БО:", m["name"], m["isin"])


# ─── Нормализация сырья → data/placements.js ────────────────────────────────

def _live(links):
    """Актуальная версия из версионируемых связок: LIVE с максимальным version_id."""
    lives = [l for l in (links or []) if l.get("status") == "LIVE"]
    return max(lives, key=lambda l: l.get("version_id") or 0) if lives else None


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _asset_name(ticker, name):
    n = (name or ticker or "").strip()
    if n.lower().startswith("dummy "):
        n = n[6:]
    return n.replace("OFZ", "ОФЗ").replace("_", " ").strip()


def _pct(v):
    """Ставки в БО местами хранятся долей (0.51), местами процентом (51.06) —
    значения ≤ 5 считаем долей и переводим в проценты."""
    if v is None:
        return None
    return round(v * 100, 2) if 0 < v <= 5 else round(v, 2)


def _norm_autocall(link):
    ac = link.get("autocall") or {}
    rj = link.get("rumberg_json_internal")
    if isinstance(rj, str):
        try:
            rj = json.loads(rj)
        except ValueError:
            rj = {}
    prod = (rj or {}).get("product") or {}

    # Начальные фиксинги: ref_spots из rumberg_json, фолбэк — fixings_initial по fixing_source
    ref_spots = prod.get("ref_spots") or {}
    init_by_src = {fx.get("fixing_source"): _f(fx.get("fixing_value"))
                   for fx in (ac.get("fixings_initial") or [])}
    basket = [{"t": u.get("equity_ticker"), "n": _asset_name(u.get("equity_ticker"), u.get("equity_name")),
               "w": _f(u.get("weight")),
               "f0": _f(ref_spots.get(u.get("equity_ticker"))) or init_by_src.get(u.get("fixing_source"))}
              for u in (ac.get("basket") or [])]

    coupon_pa = prod.get("cpn_amt_pa")
    coupon_period = prod.get("fixed_cpn_amt")
    cpn_strikes = prod.get("cpn_strikes") or []
    cpn_barrier = cpn_strikes[0] * 100 if cpn_strikes else _f(ac.get("coupon_barrier"))
    ac_strikes = prod.get("ac_strikes") or []
    # Барьер >= 500% — технически отключённый автоотзыв
    ac_barrier = ac_strikes[0] * 100 if ac_strikes and ac_strikes[0] < 5 else None

    protection = None
    if prod.get("payoff_type") in ("EKI", "GP", "MULTI") or ac.get("ki_strike") or ac.get("gp_strike"):
        strike = prod.get("strike")
        barrier = prod.get("barrier")
        protection = {
            "type": prod.get("payoff_type") or "PUT",
            "strikePct": round(strike * 100, 2) if strike else None,
            "barrierPct": round(barrier * 100, 2) if barrier else None,
        }

    return {
        "kind": "coupon",
        "wrapper": ac.get("wrapper"),
        "basket": basket,
        "dates": {
            "initialFixing": ac.get("initial_fixing_date"),
            "expiry": ac.get("expir_date"),
            "settlement": ac.get("final_settlement_date"),
        },
        "payoff": {
            "couponPa": round(coupon_pa * 100, 2) if coupon_pa else None,
            "couponPeriodPct": round(coupon_period * 100, 2) if coupon_period else None,
            "couponBarrierPct": round(cpn_barrier, 2) if cpn_barrier else None,
            "memory": bool(prod.get("is_memory")),
            "obsCount": len(prod.get("fixing_dates") or []),
            "acBarrierPct": round(ac_barrier, 2) if ac_barrier else None,
            "protection": protection,
        },
    }


def _norm_pp(link):
    pp = link.get("protected_participation") or {}
    ticker = pp.get("underlying_equity_ticker")
    f0 = _f((pp.get("initial_fixing") or {}).get("fixing_value"))
    basket = [{"t": ticker, "n": _asset_name(ticker, pp.get("underlying_equity_name")), "w": 1.0, "f0": f0}]
    lev = _f(pp.get("leverage_rate"))
    prot = _f(pp.get("protection_rate"))
    s1 = _f(pp.get("strike_pct1"))
    s2 = _f(pp.get("strike_pct2"))
    return {
        "kind": "participation",
        "wrapper": None,
        "basket": basket,
        "dates": {
            "initialFixing": pp.get("initial_fixing_date"),
            "expiry": pp.get("expir_date"),
            "settlement": pp.get("settlement_date"),
        },
        "payoff": {
            "optType": pp.get("payoff_type"),
            "style": pp.get("style"),
            "strikePct": _pct(s1),
            "strike2Pct": _pct(s2),
            "participationPct": _pct(lev),
            "protectionPct": _pct(prot),
        },
    }


def normalize(raw):
    # Текущие цены: тикер → {price, time, ccy}
    prices = {}
    for row in raw.get("rt_prices") or []:
        t = row.get("ticker") or ((row.get("equity") or {}).get("ticker") if isinstance(row.get("equity"), dict) else None)
        if t and _f(row.get("price")):
            prices[t] = {"px": _f(row.get("price")),
                         "time": (row.get("update_time") or "")[:10],
                         "ccy": row.get("price_currency_code") or ""}

    issues = []
    for item in raw["found"]:
        b = item["bond"]
        attrs = b.get("attributes") or {}
        ac_link = _live(b.get("autocalls"))
        pp_link = _live(b.get("protected_participation"))
        if ac_link:
            struct = _norm_autocall(ac_link)
        elif pp_link:
            struct = _norm_pp(pp_link)
        else:
            print("  ! нет LIVE структуры:", item["isin"])
            continue

        # Обогащение корзины текущей ценой и динамикой от начального фиксинга
        perfs = []
        for u in struct["basket"]:
            p = prices.get(u["t"])
            if p:
                u["px"] = p["px"]
                u["pxTime"] = p["time"]
            if u.get("f0") and u.get("px"):
                u["perfPct"] = round((u["px"] / u["f0"] - 1) * 100, 1)
                perfs.append(u["perfPct"])
        struct["perfPct"] = min(perfs) if perfs else None  # worst-of для корзин

        # Серия — из полного имени: serial_number в БО местами обрезан («16», «3»)
        serial = re.sub(r"^RSP[\s-]*", "", " ".join((b.get("name") or "").split())) or item["isin"]
        issues.append({
            "isin": item["isin"],
            "name": " ".join((b.get("name") or "").split()),
            "serial": serial,
            "secid": b.get("moex_secid"),
            "issuer": b.get("issuer"),
            "currency": b.get("currency"),
            "notional": _f(b.get("notional")),
            "regNumber": " ".join((attrs.get("reg_number") or "").split()) or None,
            "issueStart": attrs.get("issue_start"),
            "maturity": b.get("maturity_date"),
            "fx": "FX" in (b.get("name") or ""),
            **struct,
        })
    issues.sort(key=lambda i: i.get("issueStart") or "", reverse=True)
    return issues


def emit():
    with open(RAW_PATH, encoding="utf-8") as f:
        raw = json.load(f)
    issues = normalize(raw)
    js = ("// Файл сгенерирован fetch_placements.py — руками не править.\n"
          "// Источник: бэкофис api.bo (только чтение). Обновлено: " + time.strftime("%Y-%m-%d") + "\n"
          "window.PLACEMENTS_DATA = " +
          json.dumps({"updated": time.strftime("%Y-%m-%d"), "issues": issues},
                     ensure_ascii=False, indent=1) + ";\n")
    out = os.path.join(HERE, "data", "placements.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write(js)
    kinds = {}
    for i in issues:
        kinds[i["kind"]] = kinds.get(i["kind"], 0) + 1
    print(f"placements.js: {len(issues)} выпусков, по типам: {kinds}")


if __name__ == "__main__":
    if "--emit" not in sys.argv:
        fetch()
    emit()
