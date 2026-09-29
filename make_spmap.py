"""Собирает map.html — «Российскую карту структурных продуктов» — из docx.

Запуск:  python make_spmap.py <путь к .docx> [--out map.html]

Страница статическая целиком: текст, формулы и графики лежат прямо в HTML,
поэтому поисковик видит всё без исполнения JS, а новая редакция документа
пересобирается одним прогоном.

Что делает сборщик сверх переноса текста:
  • формулы редактора Word (OMML) переводит в HTML; САМИ ФОРМУЛЫ НЕ ПРАВИТ —
    решение Руслана 29.09.2026: их проверяют отдельно, на странице они ровно
    как в документе;
  • графики документа (картинки из европейской карты) НЕ переносит: это чужие
    изображения с английскими подписями. Каждый рисуется заново своим SVG по
    спецификации в CHARTS — ключ спецификации = имя картинки в docx, поэтому
    продукты с одной картинкой получают один график;
  • чинит опечатки и оговорки по таблице FIXES — правки текста видны списком,
    а не размазаны по коду;
  • связывает коды карты с нашими статьями Библиотеки (OURS).
"""
import html
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
M = "{http://schemas.openxmlformats.org/officeDocument/2006/math}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"

# ── Правки текста (не формул) ──
FIXES = [
    ("в контесте", "в контексте"),
    ("(ПФИ, страховок, ЦФА, етс)", "(ПФИ, страховок, ЦФА и т. п.)"),
    ("Написана людьми для людей😊", "Написана людьми для людей."),
    ("период етс – что применимо", "период и т. п. — что применимо"),
    ("Задается в документации. как % от Начальной цены", "Задаётся в документации как % от начальной цены."),
    ("кредитным продукта.", "кредитным продуктам."),
    ("«неплатеж», банкротство»", "«неплатёж», «банкротство»"),
    ("Как привило", "Как правило"),
    ("это приводи к", "это приводит к"),
    ("вариция", "вариация"),
    ("деньги о продажи", "деньги от продажи"),
    ("у который структурных доход", "у которых структурный доход"),
    ("Жаргонное названия", "Жаргонное название"),
    ("передают, динамику", "передают динамику"),
    ("в котором структурных", "в котором структурный"),
    # Витрина не пишет «гарантированно» о возврате: у защиты капитала остаётся
    # кредитный риск эмитента (он назван в разделе «Термины» — «Эмитент»)
    ("вам гарантированно возвращают не менее", "вам возвращают не менее"),
    ("плюс привлекательный купон", "плюс купон"),
    # Фраза в документе оборвана на полуслове
    ("Вторая важная вариация – диджитал спред, аналог", "Вторая важная вариация — диджитал-спред."),
    # Незакрытые и разнородные кавычки в условиях барьера
    ("(«Барьер пробит)", "(«Барьер пробит»)"),
    ("(«Любой барьер пробит)", "(«Любой барьер пробит»)"),
    ("(“Оба барьера не пробиты»)", "(«Оба барьера не пробиты»)"),
    ("чаще - европейский", "чаще — европейский"),
    # 1260: описание в документе — от автоколла (экспресс-сертификата европейской
    # карты), а название и формулы — барьерный RC с условным купоном без досрочного
    # погашения. Текст переписан под формулы (решение Руслана 29.09.2026)
    ("В заранее назначенные даты проверяется, находится ли цена актива выше стартового уровня. Если да — продукт завершается досрочно, и вам платят вложенную сумму плюс купон. Если нет — проверка переносится на следующую дату. Риск ниже, чем при прямом владении активом, благодаря условной защите капитала.",
     "Купон условный: за период он выплачивается, если на дату наблюдения цена актива не ниже купонного барьера, и не выплачивается, если ниже. В варианте «с памятью» пропущенные купоны не сгорают, а выплачиваются вместе со следующим, как только условие выполнено. В конце срока: если цена актива на страйке или выше — вам возвращают номинал; если ниже — выплата снижается вместе с активом. В варианте с барьером погашения номинал возвращается целиком, пока этот барьер не пробит. Досрочного погашения здесь нет."),
    # Пробелы, попавшие внутрь адресов при вёрстке таблицы
    ("quote/X NYS:CCJ", "quote/XNYS:CCJ"),
    ("ru/is sue.aspx?board=TQOB&code =SU26248RMFS3", "ru/issue.aspx?board=TQOB&code=SU26248RMFS3"),
]
# Английские названия, скопированные в документе от соседнего раздела
EN_FIX = {"1399": "Miscellaneous Participation"}

# Наши продукты: код карты → статья Библиотеки и фильтр доски
OURS = {
    "1100": ("protection", "Защита капитала", "board.html?type=protection"),
    "1220": ("revconv", "Реверс-конвертибл", "board.html?type=revconv"),
    "1240": ("booster", "Бустер", "board.html?type=booster"),
    "1260": ("autocall", "Автоколл", "board.html?type=autocall"),
    "1300": ("preipo", "Pre-IPO", None),
    "1440": ("discount", "Дисконтная облигация", "board.html?type=discount"),
    "2100": ("call", "Варранты CALL и PUT", "board.html?type=warrant"),
    "2110": ("callspread", "Колл-спред и пут-спред", "board.html?type=warrant"),
    "2199": ("digital", "Купонный варрант", "board.html?type=digital"),
    "2200": ("callko", "Варранты с барьером KO", "board.html?type=warrant"),
}

# Цвет — по классу, не по группе: семь цветов без легенды не читались (фидбек
# Алексея 29.09.2026). Синий — инвестиционные продукты, бирюзовый — с плечом;
# легенда стоит в лиде карты. Янтарный для класса 2 отвергнут Русланом: на тёмном
# фоне сливался с оранжевым акцентом, которым помечены наши продукты
CLASS_COLOR = {"1": "#4F86E6", "2": "#4FA3A0"}
GROUP_COLOR = {g: CLASS_COLOR[g[0]] for g in ("11", "12", "13", "14", "21", "22", "23")}
BEAR = "#E0705A"

esc = lambda s: html.escape(s, quote=False)


def fix(s):
    for a, b in FIXES:
        s = s.replace(a, b)
    return s


# ── Формулы: OMML → HTML ──
def math_plain(el):
    """Текст формулы без разметки (для строк системы, где нужен разрез по «&»)."""
    out = ""
    for ch in el.iter():
        if ch.tag == M + "t":
            out += ch.text or ""
    return out


def pretty(s):
    """Типографика формулы: знаки операций с воздухом, настоящий минус."""
    s = s.replace("*", "·")
    s = re.sub(r"\s*([=≥≤<>+·/-])\s*", r" \1 ", s)
    s = s.replace(" - ", " − ").replace("( ", "(").replace(" )", ")")
    s = re.sub(r"\s+", " ", s).strip()
    # Кусок формулы, оканчивающийся знаком операции, продолжается следующим узлом
    # (∏, дробь, индекс) — воздух после знака сохраняем
    if s and s[-1] in "=·+−<>≥≤(":
        s += " "
    s = esc(s)
    # Sc — уровень ограничения, в тексте документа именно так; подстрочник для чтения
    s = re.sub(r"\bSc\b", "S<sub>c</sub>", s)
    s = re.sub(r"\b(Perf|Haircut|Return|Max)\b", r"<i>\1</i>", s)
    return s


def cases_html(rows):
    """Система «значение — условие» строками; фигурная скобка рисуется рамкой в CSS."""
    return '<span class="cases">%s</span>' % "".join(
        '<span class="cr"><span class="cv">%s</span><span class="cc">%s</span></span>' % (pretty(v), pretty(c)) for v, c in rows)


# ── Исправления формул документа — решение Руслана 29.09.2026 («ок, правь ошибки») ──
# Ключ — формула из docx, текст всех m:t без пробелов; значение — строка или
# (левая часть, [(значение, условие), …]). Что и почему:
#   • погашение при падении: N·(S−Perf)/S и N·(1−Perf) — это убыток, а не выплата
#     (актив 80% → 20% номинала, на страйке провал с N до нуля); верно N·Perf/S и
#     N·Perf. Встречается у 1200, 1210, 1220, 1230, 1240, 1250, 1260 и в ветке
#     «барьер пробит» у 1320, 1330, 1340;
#   • 2210: N·K·Perf при K > 100% на старте даёт K номиналов; верно
#     N·(1 + K·(Perf − 100%)). В досрочном погашении Haircut (в %) вычитался из
#     суммы в валюте — теперь внутри скобки, в долях номинала.
# Ветка «барьер пробит» у 1320 (доход без условия по барьеру) правится в
# BLOCK_FIXES ниже. Автору документа список ошибок передан отдельно.
FORMULA_FIXES = {
    "P=N*(S-Perf)/S,&Perf<SN,&Perf≥S": ("P=", [("N*Perf/S", "Perf<S"), ("N", "Perf≥S")]),
    "P=N*(1-Perf),&Perf<100%N,&Perf≥100%": ("P=", [("N*Perf", "Perf<100%"), ("N", "Perf≥100%")]),
    "P=N*K*Perf": "P=N*(1+K*(Perf-100%))",
    "P=Max(N*K*Perf-Haircut,0)": "P=Max(N*(1+K*(Perf-100%)-Haircut); 0)",
}


def formula_html(el):
    """Формула документа с учётом FORMULA_FIXES."""
    key = re.sub(r"\s+", "", math_plain(el))
    fx = FORMULA_FIXES.get(key)
    if fx is None:
        return math_html(el)
    if isinstance(fx, str):
        return pretty(fx)
    return pretty(fx[0]) + cases_html(fx[1])


def math_html(el):
    tag = el.tag
    if tag == M + "r":
        return pretty("".join(t.text or "" for t in el.iter(M + "t")))
    if tag == M + "d":
        pr = el.find(M + "dPr")
        beg = pr.find(M + "begChr") if pr is not None else None
        end = pr.find(M + "endChr") if pr is not None else None
        b = beg.get(M + "val") if beg is not None else "("
        e = end.get(M + "val") if end is not None else ")"
        arr = el.find(".//" + M + "eqArr")
        if arr is not None and b == "{":
            rows = []
            for row in arr.findall(M + "e"):
                t = math_plain(row)
                if "&" in t:
                    v, c = t.split("&", 1)
                else:
                    v, _, c = t.partition(",")
                rows.append((v.strip().rstrip(","), c.strip()))
            return cases_html(rows)
        return esc(b) + "".join(math_html(c) for c in el.findall(M + "e")) + esc(e)
    if tag == M + "nary":
        pr = el.find(M + "naryPr")
        chx = pr.find(M + "chr") if pr is not None else None
        sym = chx.get(M + "val") if chx is not None else "∫"
        return '<span class="nary">%s</span>(%s)' % (esc(sym), "".join(math_html(c) for c in el.find(M + "e")))
    if tag == M + "sSub":
        return "".join(math_html(c) for c in el.find(M + "e")) + "<sub>%s</sub>" % "".join(math_html(c) for c in el.find(M + "sub"))
    if tag.endswith("Pr"):
        return ""
    # Контейнер: соседние текстовые куски склеиваются ДО типографики — Word режет
    # формулу на произвольные куски («1+» и «m)»), и по отдельности вокруг знака
    # терялся воздух
    out, buf = "", ""
    for c in el:
        if c.tag == M + "r":
            buf += "".join(t.text or "" for t in c.iter(M + "t"))
            continue
        if buf:
            out += pretty(buf); buf = ""
        out += math_html(c)
    return out + (pretty(buf) if buf else "")


def segments(p, rid):
    """Абзац → последовательность ('t', текст) | ('m', html) | ('img', имя) | ('br',)."""
    out = []

    def walk(el):
        for ch in el:
            if ch.tag == M + "oMath":
                if math_plain(ch).strip() not in ("", "Где"):  # слово «Где» в документе местами набрано формулой
                    out.append(("m", formula_html(ch)))
            elif ch.tag == M + "oMathPara":
                for om in ch.iter(M + "oMath"):
                    if math_plain(om).strip() not in ("", "Где"):
                        out.append(("m", formula_html(om)))
            elif ch.tag == W + "r":
                for x in ch:
                    if x.tag == W + "t":
                        out.append(("t", x.text or ""))
                    elif x.tag == W + "br":
                        out.append(("br",))
                    elif x.tag == W + "tab":
                        out.append(("t", " "))
                    elif x.tag == W + "drawing":
                        for bl in x.iter(A + "blip"):
                            out.append(("img", rid.get(bl.get(R + "embed"), "").split("/")[-1]))
            elif ch.tag.endswith("Pr"):
                continue
            else:
                walk(ch)
    walk(p)
    return out


def lines_of(segs):
    """Сегменты абзаца → строки: текст склеен, формулы и переносы режут строку."""
    lines, cur = [], ""
    for s in segs:
        if s[0] == "t":
            cur += s[1]
        else:
            if cur.strip():
                lines.append(("t", fix(re.sub(r"\s+", " ", cur).strip())))
            cur = ""
            if s[0] in ("m", "img"):
                lines.append(s)
    if cur.strip():
        lines.append(("t", fix(re.sub(r"\s+", " ", cur).strip())))
    return lines


def style_of(p):
    s = p.find(W + "pPr/" + W + "pStyle")
    return s.get(W + "val") if s is not None else ""


def table_rows(tbl):
    rows = []
    for tr in tbl.findall(W + "tr"):
        cells = []
        for tc in tr.findall(W + "tc"):
            parts = []
            for p in tc.findall(".//" + W + "p"):
                t = "".join(x.text or "" for x in p.iter(W + "t")).strip()
                if t:
                    parts.append(fix(re.sub(r"\s+", " ", t)))
            cells.append(parts)
        rows.append(cells)
    return rows


# ── Разбор документа в модель ──
def parse(path):
    z = zipfile.ZipFile(path)
    rels = ET.fromstring(z.read("word/_rels/document.xml.rels"))
    rid = {r.get("Id"): r.get("Target") for r in rels}
    body = ET.fromstring(z.read("word/document.xml")).find(W + "body")

    doc = {"title": "", "sub": "", "terms": [], "mech_intro": "", "mechs": [],
           "groups": [], "assets_intro": "", "assets": [], "products_note": ""}
    sec = None
    term = mech = group = prod = block = asset = None
    pending_barrier = None

    def new_block(label):
        nonlocal block
        block = {"label": label, "items": [], "vars": [], "barriers": []}
        prod["blocks"].append(block)

    for el in body:
        if el.tag == W + "tbl":
            rows = table_rows(el)
            if sec == "products" and prod is not None:
                hdr = [" ".join(c) for c in rows[0]]
                vals = [" ".join(c) for c in rows[1]] if len(rows) > 1 else []
                (block or prod)["barriers"].append({"label": pending_barrier or "Барьер",
                                                    "pairs": list(zip(hdr, vals))})
                pending_barrier = None
            elif sec == "assets" and asset is not None:
                asset["table"] = rows
            continue
        if el.tag != W + "p":
            continue
        st = style_of(el)
        ls = lines_of(segments(el, rid))
        text = " ".join(l[1] for l in ls if l[0] == "t")
        if st == "Title":
            doc["title"] = text; continue
        if st == "Subtitle":
            doc["sub"] = text; continue
        if st == "Heading1":
            h = text.strip()
            sec = {"Термины": "terms", "Механизмы": "mechs", "Продукты и группы продуктов": "products",
                   "Базовые активы": "assets"}.get(h, h)
            continue
        if not ls:
            continue

        if sec == "terms":
            if st == "Termname":
                term = {"t": text.strip(), "d": []}; doc["terms"].append(term)
            elif term:
                term["d"].append(text)
            continue

        if sec == "mechs":
            if st == "Heading2":
                mech = {"t": text.strip(), "d": [], "list": []}; doc["mechs"].append(mech)
            elif mech is None:
                doc["mech_intro"] = text
            elif st == "ListParagraph":
                mech["list"].append(text)
            else:
                mech["d"].append(text)
            continue

        if sec == "assets":
            if st == "Heading2":
                asset = {"t": text.strip(), "d": [], "table": None}; doc["assets"].append(asset)
            elif asset is None:
                doc["assets_intro"] = text
            else:
                asset["d"].append(text)
            continue

        if sec != "products":
            continue
        if st == "Heading2":
            m = re.match(r"Группа\s+(\d+)\s+(.*)", text.strip())
            code, rest = m.group(1), m.group(2)
            jar = re.findall(r"«([^»]+)»", rest)
            name = re.sub(r"\s*\(.*\)\s*$", "", rest).strip()
            group = {"code": code, "name": name, "jargon": jar, "lead": "", "products": []}
            doc["groups"].append(group); prod = None; block = None
            continue
        if st == "Heading3":
            m = re.match(r"(\d{4})\s+(.*)", text.strip())
            code, rest = m.group(1), m.group(2)
            paren = re.search(r"\(([^()]*)\)\s*$", rest)
            jar, note = [], ""
            if paren:
                inner = paren.group(1)
                jar = re.findall(r"«([^»]+)»", inner)
                if not jar and "«" not in inner:
                    if "жаргон" in inner:
                        note = inner.strip()
                    else:
                        # «(Single-name и Basket)», «(в т.ч. FTD)» — уточнение
                        # названия, остаётся в нём; жаргон в документе всегда в «»
                        paren = None
                if paren:
                    rest = rest[:paren.start()].strip()
            if note:
                doc["products_note"] = note
            prod = {"code": code, "name": rest, "jargon": jar, "en": "", "desc": [], "img": None,
                    "blocks": [], "barriers": [], "notes": []}
            group["products"].append(prod); block = None; pending_barrier = None
            continue
        if prod is None:
            if st == "Grouplead" and group is not None:
                group["lead"] = text
            continue
        if st == "ProductENname":
            prod["en"] = EN_FIX.get(prod["code"], text.strip()); continue
        if st == "Figure":
            for l in ls:
                if l[0] == "img":
                    prod["img"] = l[1]
            continue
        if st == "Formulalabel":
            t = text.strip()
            if t.startswith("Барьер"):
                pending_barrier = t.rstrip(":")
            elif "погашени" in t:
                new_block("Погашение")
            elif "структурного дохода" in t:
                new_block("Структурный доход")
            continue
        # Описание: всё, что идёт до первой формулы. В части продуктов описание
        # набрано стилем Condition — отличаем по длине и отсутствию формулы
        if block is None:
            if all(l[0] == "t" for l in ls):
                if text.strip() == "TBD":
                    pass  # заглушек на странице нет — фидбек Алексея 29.09.2026
                elif st == "ListParagraph":
                    prod["desc"].append(("li", text))
                else:
                    prod["desc"].append(text)
            continue
        for l in ls:
            if l[0] == "m":
                block["items"].append(("f", l[1]))
                continue
            if l[0] != "t":
                continue
            t = l[1]
            if st == "Variabledefinition":
                v, _, d = t.partition(" – ") if " – " in t else t.partition(" - ")
                block["vars"].append((v.strip(), d.strip()))
            elif t == "Где":
                continue
            elif re.match(r"^Барьер( В\d)?:$", t):
                pending_barrier = t.rstrip(":")
            elif st == "Condition" or t.startswith("Если") or t.startswith("Купон "):
                block["items"].append(("c", t))
            else:
                block["items"].append(("n", t))
    for g in doc["groups"]:
        for prod in g["products"]:
            for block in prod["blocks"]:
                fx = BLOCK_FIXES.get((prod["code"], block["label"]))
                if fx:
                    block["items"] = fx(block["items"])
    return doc


# Правки структуры блоков. 1320: доход N·(Perf − 100%) в документе платится без
# условия по барьеру, и при пробитом барьере вместе с погашением N·Perf давал бы
# двойное участие в росте, тогда как по тексту продукт «превращается в обычный
# трекер». У соседней 1340 условие записано — здесь оно дописано так же.
BLOCK_FIXES = {
    ("1320", "Структурный доход"): lambda items: [("c", "Если B = 0 («Барьер не пробит»), то:")] + items +
        [("c", "Если B = 1 («Барьер пробит»),"), ("n", "Структурный доход не выплачивается")],
}


# ── Графики ──
# Координаты: x — уровень базового актива (0…10, старт на 5), y — результат
# (−4…4, ноль на оси). Тонкая диагональ «актив» y = x − 5 есть на каждом кадре:
# это та точка отсчёта, от которой продукт отличается. Остальное — ломаные.
CW, CH, PX, PT, PB = 340, 226, 30, 28, 28
GRID = "rgba(255,255,255,0.09)"; AX = "rgba(255,255,255,0.22)"; LAB = "rgba(255,255,255,0.68)"
MONO = 'font-family="JetBrains Mono, monospace"'


def cx(x): return PX + x / 10 * (CW - PX - 10)
def cy(y): return PT + (4 - y) / 8 * (CH - PT - PB)


def chart_svg(spec, color):
    o = ['<svg viewBox="0 0 %d %d" role="img" aria-label="%s">' % (CW, CH, esc(spec.get("alt", "график выплаты")))]
    o.append('<line x1="%g" y1="%g" x2="%g" y2="%g" stroke="%s"/>' % (PX, cy(0), CW - 10, cy(0), AX))
    o.append('<line x1="%g" y1="%g" x2="%g" y2="%g" stroke="%s"/>' % (PX, PT - 4, PX, CH - PB + 4, AX))
    # Подписи осей: по вертикали результат инвестора, по горизонтали цена актива
    o.append('<text x="%g" y="%g" font-size="10.5" %s fill="%s">результат инвестора ↑</text>' % (PX - 6, 12, MONO, LAB))
    o.append('<text x="%g" y="%g" font-size="10.5" %s fill="%s" text-anchor="end">цена актива на дату расчёта →</text>' % (CW - 10, CH - 5, MONO, LAB))
    o.append('<text x="%g" y="%g" font-size="11" %s fill="%s" text-anchor="end">+</text>' % (PX - 7, PT + 8, MONO, LAB))
    o.append('<text x="%g" y="%g" font-size="11" %s fill="%s" text-anchor="end">−</text>' % (PX - 7, CH - PB, MONO, LAB))
    o.append('<text x="%g" y="%g" font-size="11" %s fill="%s" text-anchor="end">0</text>' % (PX - 7, cy(0) + 4, MONO, LAB))
    if not spec.get("noasset"):
        o.append('<line x1="%g" y1="%g" x2="%g" y2="%g" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>' % (cx(1), cy(-4), cx(9), cy(4)))
        ax_, ay_ = cx(2.3) + 7, cy(-2.7) + 11  # чуть ниже и правее линии: над ней обычно идёт сам продукт
        o.append('<text x="%g" y="%g" font-size="11" %s fill="%s" transform="rotate(-39 %g %g)">актив</text>' % (ax_, ay_, MONO, LAB, ax_, ay_))
    for v in spec.get("v", []):  # вертикальные пунктиры (барьеры)
        x, y1, y2 = v[0], v[1], v[2]
        o.append('<line x1="%g" y1="%g" x2="%g" y2="%g" stroke="%s" stroke-dasharray="3 3"/>' % (cx(x), cy(y1), cx(x), cy(y2), LAB))
    for ln in spec["lines"]:
        pts = " ".join("%g,%g" % (cx(x), cy(y)) for x, y in ln["p"])
        col = BEAR if ln.get("bear") else color
        dash = ' stroke-dasharray="4 4"' if ln.get("dash") else ""
        w = 2 if ln.get("dash") else 2.6
        o.append('<polyline points="%s" fill="none" stroke="%s" stroke-width="%g" stroke-linejoin="round" stroke-linecap="round"%s/>' % (pts, col, w, dash))
    for t in spec.get("t", []):  # подписи: x, y, текст, [выравнивание], [цвет «c»]
        x, y, s = t[0], t[1], t[2]
        anc = t[3] if len(t) > 3 else "middle"
        fill = color if (len(t) > 4 and t[4] == "c") else BEAR if (len(t) > 4 and t[4] == "b") else LAB
        o.append('<text x="%g" y="%g" font-size="11" %s fill="%s" text-anchor="%s">%s</text>' % (cx(x), cy(y), MONO, fill, anc, esc(s)))
    o.append("</svg>")
    return "".join(o)


CHARTS = {
    # 1100 — защита с участием без потолка
    "image1.png": {"lines": [{"p": [[0.3, 0], [5, 0], [9.6, 3.2]]}], "t": [[5, -0.55, "страйк"], [0.4, 0.35, "защита", "start"]],
                   "alt": "Выплата не ниже защищённого уровня, выше страйка — доля роста без потолка"},
    # 1110 — конвертируемая: защита и участие с дальнего страйка
    "image2.png": {"lines": [{"p": [[0.3, 0], [6.5, 0], [9.6, 3.1]]}], "t": [[6.5, -0.55, "страйк"]],
                   "alt": "Защита номинала, участие в росте выше страйка"},
    # 1120 — защита с участием и потолком
    "image3.png": {"lines": [{"p": [[0.3, 0], [5, 0], [7.8, 1.9], [9.7, 1.9]]}], "t": [[5, -0.55, "страйк"], [9.6, 2.3, "потолок", "end", "c"]],
                   "alt": "Защита, участие в росте до потолка"},
    # 1130 — «плавник акулы»
    "image4.png": {"lines": [{"p": [[0.3, 0], [5, 0], [7.6, 2.6]]}, {"p": [[7.6, 0.03], [9.7, 0.03]]},
                             {"p": [[7.6, 0.75], [9.7, 0.75]], "dash": True}],
                   "v": [[7.6, 0, 2.6]], "t": [[5, -0.55, "страйк"], [9.6, 1.1, "ребейт", "end", "c"], [7.6, 3.05, "барьер"], [9.6, -0.55, "нокаут", "end"]],
                   "alt": "Участие в росте до барьера; после касания — защита и ребейт"},
    # 1140, 2299 — купон при выполнении условия
    "image5.png": {"lines": [{"p": [[0.3, 0], [5, 0]]}, {"p": [[5, 0], [5.6, 0], [5.6, 0.9], [6.4, 0.9], [6.4, 1.8], [7.2, 1.8], [7.2, 2.6]], "dash": True},
                             {"p": [[7.2, 2.6], [9.7, 2.6]]}],
                   "t": [[9.6, 3.0, "купон", "end", "c"], [5, -0.55, "барьер"]],
                   "alt": "Купон выплачивается при выполнении условия по базовому активу"},
    # 1200, 1220 — дисконт / реверс-конвертибл
    "image6.png": {"lines": [{"p": [[0.4, -3.6], [5.5, 1.5], [9.7, 1.5]]}], "v": [[5.5, -0.2, 1.5]],
                   "t": [[5.5, -0.6, "страйк"], [9.6, 1.9, "потолок", "end", "c"]],
                   "alt": "Выше страйка — фиксированный максимум, ниже — вместе с активом"},
    # 1210, 1230 — то же с барьером погашения
    "image7.png": {"lines": [{"p": [[0.4, -3.6], [3, -1]]}, {"p": [[3, -1], [5.5, 1.5]], "dash": True}, {"p": [[3, 1.5], [9.7, 1.5]]}],
                   "v": [[3, -1, 1.5]], "t": [[3, 1.95, "барьер"], [5.5, -0.6, "страйк"], [9.6, 1.9, "потолок", "end", "c"]],
                   "alt": "Пока барьер не пробит — максимум выплаты; после пробития — вместе с активом"},
    # 1240 — бустер
    "image8.png": {"lines": [{"p": [[0.5, -4], [5, 0], [6.4, 2.6], [9.7, 2.6]]}],
                   "t": [[5.3, -0.55, "старт", "start"], [9.6, 3.0, "потолок", "end", "c"]],
                   "alt": "Падение один к одному, рост с повышенным участием до потолка"},
    # 1250 — барьерный бустер (бонус с потолком)
    "image9.png": {"lines": [{"p": [[0.5, -4], [3, -2]]}, {"p": [[3, -2], [6, 1]], "dash": True}, {"p": [[3, 1], [6, 1], [7.5, 2.5], [9.7, 2.5]]}],
                   "v": [[3, -2, 1]], "t": [[3, 1.45, "барьер"], [6, 0.45, "страйк", "start"], [9.6, 2.9, "потолок", "end", "c"]],
                   "alt": "Бонусный уровень, пока барьер не пробит; сверху — потолок"},
    # 1260 — автоколл / экспресс
    "image10.png": {"lines": [{"p": [[0.5, -4], [3.5, -1.5]]}, {"p": [[3.5, -1.5], [5, 0]], "dash": True}, {"p": [[3.5, 0], [5.6, 0]]},
                              {"p": [[5.9, 0.8], [7.4, 0.8]]}, {"p": [[5.9, 1.6], [7.4, 1.6]]}, {"p": [[5.9, 2.4], [7.4, 2.4]]}, {"p": [[5.9, 3.2], [7.4, 3.2]]}],
                    "v": [[3.5, -1.5, 0], [5.9, 0, 3.2]],
                    "t": [[3.5, 0.4, "барьер"], [7.6, 0.65, "1-е", "start"], [7.6, 1.45, "2-е", "start"], [7.6, 2.25, "n-е", "start"],
                          [7.6, 3.05, "последнее", "start"], [6.65, -0.55, "наблюдения"]],
                    "alt": "Досрочное погашение с купоном, растущим от наблюдения к наблюдению"},
    # 1300 — трекер
    "image11.png": {"lines": [{"p": [[1, -3.9], [9, 3.9]]}, {"p": [[1, 3.9], [9, -3.9]], "bear": True}], "noasset": True,
                    "t": [[7.3, 3.7, "на рост", "end", "c"], [2.7, 3.7, "на падение", "start", "b"]],
                    "alt": "Результат повторяет движение актива один к одному"},
    # 1310 — увеличенное участие
    "image12.png": {"lines": [{"p": [[0.5, -4], [5, 0], [7.4, 4]]}], "t": [[5.3, -0.55, "страйк", "start"]],
                    "alt": "Падение один к одному, рост с повышенным участием без потолка"},
    # 1320 — бонусная
    "image13.png": {"lines": [{"p": [[0.5, -4], [3, -2]]}, {"p": [[3, -2], [6, 1]], "dash": True}, {"p": [[3, 1], [6, 1], [9, 4]]}],
                    "v": [[3, -2, 1]], "t": [[3, 1.45, "барьер"], [6, 0.45, "бонус", "start"]],
                    "alt": "Бонусный уровень, пока барьер не пробит; рост без потолка"},
    # 1330 — бонусная с увеличенным участием
    "image14.png": {"lines": [{"p": [[0.5, -4], [3, -2]]}, {"p": [[3, -2], [5, 0]], "dash": True}, {"p": [[3, 0], [5, 0], [7.4, 4]]}],
                    "v": [[3, -2, 0]], "t": [[3, 0.45, "барьер"], [5.3, -0.55, "страйк", "start"]],
                    "alt": "Защита старта, пока барьер не пробит; рост с повышенным участием"},
    # 1340 — твин-вин
    "image15.png": {"lines": [{"p": [[0.5, -4], [3, -2]]}, {"p": [[3, -2], [5, 0]], "dash": True}, {"p": [[3, 2], [5, 0], [9, 4]]}],
                    "v": [[3, -2, 2]], "t": [[3, 2.45, "барьер"], [5, -0.55, "страйк"]],
                    "alt": "Заработок и на росте, и на падении до барьера"},
    # 2100 — варранты
    "image16.png": {"lines": [{"p": [[0.3, -0.8], [5, -0.8], [8.6, 3.6]]}, {"p": [[1.4, 3.6], [5, -0.8], [9.7, -0.8]], "bear": True}],
                    "t": [[8.4, 3.5, "колл", "end", "c"], [1.6, 3.5, "пут", "start", "b"], [5, -1.35, "страйк"]],
                    "alt": "Колл растёт с активом, пут — при его падении; убыток ограничен премией"},
    # 2110 — спред-варранты
    "image17.png": {"lines": [{"p": [[0.3, -0.8], [5, -0.8], [7, 1.8], [9.7, 1.8]]}, {"p": [[0.3, 1.8], [3, 1.8], [5, -0.8], [9.7, -0.8]], "bear": True}],
                    "t": [[9.6, 2.2, "колл-спред", "end", "c"], [0.4, 2.2, "пут-спред", "start", "b"], [5, -1.35, "страйк"]],
                    "alt": "Варранты с ограниченной выплатой"},
    # 2200 — нокаут-варранты
    "image18.png": {"lines": [{"p": [[4.3, -0.6], [8.3, 3.6]]}, {"p": [[1.7, 3.6], [5.7, -0.6]], "bear": True}],
                    "v": [[4.3, -0.6, -1.4], [5.7, -0.6, -1.4]],
                    "t": [[8.1, 3.5, "колл", "end", "c"], [1.9, 3.5, "пут", "start", "b"], [4.3, -1.9, "нокаут", "end"], [5.7, -1.9, "нокаут", "start"]],
                    "alt": "Касание барьера обнуляет варрант"},
    # 2205 — бессрочные нокаут-варранты
    "image19.png": {"lines": [{"p": [[4.3, -0.6], [8.3, 3.6]]}, {"p": [[1.7, 3.6], [5.7, -0.6]], "bear": True}],
                    "v": [[4.3, -0.6, -1.4], [5.7, -0.6, -1.4]],
                    "t": [[8.1, 3.5, "колл", "end", "c"], [1.9, 3.5, "пут", "start", "b"], [6.6, -2.3, "барьер сдвигается каждый день"]],
                    "alt": "Бессрочный варрант, касание барьера обнуляет"},
    # 2210 — мини-фьючерс
    "image20.png": {"lines": [{"p": [[3.4, -1.1], [8.6, 4]]}, {"p": [[3.4, -1.1], [3.4, -2.1]], "dash": True}],
                    "v": [[3.0, -2.1, -3.2]],
                    "t": [[3.3, -0.5, "стоп-лосс", "end"], [3.7, -3.7, "уровень финансирования", "start"]],
                    "alt": "Линейное участие с плечом, досрочное погашение на стоп-лоссе"},
    # 2230 — двойной нокаут
    "image21.png": {"lines": [{"p": [[2.8, 2], [8, 2]]}, {"p": [[0.3, -0.6], [2.8, -0.6]], "dash": True}, {"p": [[8, -0.6], [9.7, -0.6]], "dash": True}],
                    "v": [[2.8, -0.6, 2], [8, -0.6, 2]],
                    "t": [[5.4, 2.45, "выплата внутри коридора"], [1.5, -1.15, "нокаут"], [8.9, -1.15, "нокаут"]],
                    "alt": "Выплата, пока цена остаётся между двумя барьерами"},
    # 2300 — постоянное плечо
    "image22.png": {"lines": [{"p": [[2.6, -3.9], [7.4, 3.9]]}, {"p": [[2.6, 3.9], [7.4, -3.9]], "bear": True}],
                    "t": [[7.6, 3.4, "на рост", "start", "c"], [2.4, 3.4, "на падение", "end", "b"]],
                    "alt": "Дневное движение актива с постоянным плечом"},
}


# Графики ПО КОДУ продукта — там, где картинка документа расходилась с его же
# описанием (решение Руслана 29.09.2026: «графики меняй, чтобы билось с текстом»).
# Имеют приоритет над CHARTS; ключ — код. Что и почему:
#   1140 и 2299 в документе делят одну картинку (ступеньки, растущие с ценой), а
#        по тексту купон один и тот же и зависит только от барьера — ступень одна;
#        у 1140 слева защита (0), у 2299 слева потеряна премия;
#   1220/1230 — та же форма, что у дисконтных 1200/1210, но полка это «номинал +
#        купон», а не потолок дисконта;
#   1240 — уровень назван страйком, как в тексте и формуле, а не «старт»;
#   1300 и 2300 — в тексте только участие в росте, «медвежьей» линии картинки нет;
#        у 2300 линия выпуклая: база пересчитывается каждый период;
#   2110 — формула и текст описывают только ограниченный колл, пут-спреда нет;
#   2199 — картинки в документе нет, по тексту это ступень: колл и пут;
#   1260 — картинка документа (наблюдения автоколла) не про этот продукт: по
#        формулам это барьерный RC с условным купоном — ниже барьера вместе с
#        активом и без купона, выше — номинал и купон.
def _lev(K=2.0):
    """Постоянное плечо K при ежепериодном пересчёте: (1+r)^K − 1, обрезано по кадру."""
    pts = []
    for i in range(0, 101):
        x = i / 10.0
        r = (x - 5) / 5 * 0.4
        y = 12.5 * ((1 + r) ** K - 1)
        if -4 <= y <= 4:
            pts.append([round(x, 2), round(y, 2)])
    return pts


CODE_CHARTS = {
    "1140": {"lines": [{"p": [[0.3, 0], [4.6, 0]]}, {"p": [[4.6, 0], [4.6, 2.2]], "dash": True}, {"p": [[4.6, 2.2], [9.7, 2.2]]}],
             "t": [[4.6, -0.55, "барьер"], [9.6, 2.6, "купон", "end", "c"], [0.4, 0.35, "защита", "start"]],
             "alt": "Купон, пока актив на дату наблюдения не ниже барьера; ниже барьера — только защита капитала"},
    "2299": {"lines": [{"p": [[0.3, -0.8], [4.6, -0.8]]}, {"p": [[4.6, -0.8], [4.6, 2.2]], "dash": True}, {"p": [[4.6, 2.2], [9.7, 2.2]]}],
             "t": [[4.6, -1.35, "барьер"], [9.6, 2.6, "купон", "end", "c"], [0.4, -0.45, "−премия", "start"]],
             "alt": "Купон при активе не ниже барьера на дату наблюдения; ниже — потеряна премия, номинал не погашается"},
    "1220": {"lines": [{"p": [[0.4, -3.6], [5.5, 1.5], [9.7, 1.5]]}], "v": [[5.5, -0.2, 1.5]],
             "t": [[5.5, -0.6, "страйк"], [9.6, 1.9, "номинал + купон", "end", "c"]],
             "alt": "На страйке и выше — номинал и купон; ниже — вместе с активом, купон смягчает снижение"},
    "1230": {"lines": [{"p": [[0.4, -3.6], [3, -1]]}, {"p": [[3, -1], [5.5, 1.5]], "dash": True}, {"p": [[3, 1.5], [9.7, 1.5]]}],
             "v": [[3, -1, 1.5]], "t": [[3, 1.95, "барьер"], [5.5, -0.6, "страйк"], [9.6, 1.9, "номинал + купон", "end", "c"]],
             "alt": "Пока барьер не пробит — номинал и купон; после пробития — вместе с активом, как 1220"},
    "1240": {"lines": [{"p": [[0.5, -4], [5, 0], [6.4, 2.6], [9.7, 2.6]]}],
             "t": [[5.3, -0.55, "страйк", "start"], [9.6, 3.0, "потолок", "end", "c"]],
             "alt": "До страйка один к одному с активом, выше — рост с повышенным участием до потолка"},
    "1300": {"lines": [{"p": [[1, -3.9], [9, 3.9]]}], "noasset": True,
             "t": [[6.2, -1.6, "повторяет актив 1:1", "start", "c"]],
             "alt": "Результат повторяет движение актива один к одному"},
    "2110": {"lines": [{"p": [[0.3, -0.8], [5, -0.8], [7, 1.8], [9.7, 1.8]]}],
             "t": [[9.6, 2.2, "потолок", "end", "c"], [5, -1.35, "страйк"], [0.4, -0.45, "−премия", "start"]],
             "alt": "Рост выше страйка с плечом, но не выше потолка; ниже страйка потеряна премия"},
    "2199": {"lines": [{"p": [[0.3, -0.8], [5, -0.8]]}, {"p": [[5, 2.2], [9.7, 2.2]]},
                       {"p": [[0.3, 2.2], [5, 2.2]], "bear": True}, {"p": [[5, -0.8], [9.7, -0.8]], "bear": True}],
             "v": [[5, -0.8, 2.2]],
             "t": [[8.9, 2.6, "колл", "end", "c"], [1.1, 2.6, "пут", "start", "b"], [5, -1.35, "страйк"]],
             "alt": "Диджитал-варрант: фиксированная выплата, если актив выше (колл) или ниже (пут) страйка, иначе потеряна премия"},
    "1260": {"lines": [{"p": [[1.2, -3.8], [3, -2]]}, {"p": [[3, -2], [3, 1.5]], "dash": True}, {"p": [[3, 1.5], [9.7, 1.5]]}],
             "v": [[5.5, -0.2, 1.5]],
             "t": [[3, 1.95, "барьер"], [5.5, -0.6, "страйк"], [9.6, 1.9, "номинал + купон", "end", "c"], [2.7, -1.3, "без купона", "end"]],
             "alt": "Ниже барьера — вместе с активом и без купона; выше — номинал и условный купон"},
    "2300": {"lines": [{"p": _lev()}], "t": [[7.4, 3.2, "плечо ×K", "start", "c"], [7.4, -2.6, "база пересчитывается", "middle"]],
             "alt": "Участие с постоянным плечом: результат периода применяется к пересчитанной базе, кривая выпуклая"},
}


def chart_for(p):
    return CODE_CHARTS.get(p["code"]) or (CHARTS.get(p["img"]) if p["img"] else None)


# ── Вёрстка ──
def para(t):
    return "<p>%s</p>" % esc(t)


def desc_html(items):
    """Абзацы описания; подряд идущие пункты списка — одним <ul>."""
    o, li = [], []
    for d in items + [None]:
        if isinstance(d, tuple):
            li.append("<li>%s</li>" % esc(d[1])); continue
        if li:
            o.append("<ul>%s</ul>" % "".join(li)); li = []
        if d is not None:
            o.append(para(d))
    return "".join(o)


def bars_html(bars):
    return "".join('<div class="bar"><span class="bar-k lbl">%s</span><span class="chips">%s</span></div>' % (esc(br["label"]), "".join(
        '<span class="chip"><span class="ck">%s</span>%s</span>' % (esc(k.lower()), esc(v)) for k, v in br["pairs"])) for br in bars)


def prod_html(p, gcode):
    color = GROUP_COLOR.get(gcode, "#8A93A6")
    o = ['<article class="pd" id="p%s" style="--fc:%s">' % (p["code"], color)]
    o.append('<header class="pd-h"><span class="pd-code">%s</span><div class="pd-t"><h3>%s</h3>' % (p["code"], esc(p["name"])))
    meta = []
    if p["jargon"]:
        meta.append('<span class="jar">%s</span>' % " · ".join("«%s»" % esc(j) for j in p["jargon"]))
    if p["en"]:
        meta.append('<span class="en" lang="en">%s</span>' % esc(p["en"]))
    if meta:
        o.append('<div class="pd-meta">%s</div>' % "".join(meta))
    o.append("</div></header>")
    ours = OURS.get(p["code"])
    if ours:
        lk = '<a href="about.html#%s">Статья «%s» в Библиотеке<span class="ar" aria-hidden="true">→</span></a>' % (ours[0], esc(ours[1]))
        if ours[2]:
            lk += '<a href="%s">Продукты на доске<span class="ar" aria-hidden="true">→</span></a>' % ours[2]
        o.append('<div class="ours"><span class="k lbl">есть на витрине</span>%s</div>' % lk)
    spec = chart_for(p)
    has_body = spec or p["blocks"] or p["barriers"]
    # Порядок в разметке — описание, график, формулы: на телефоне это одна
    # колонка, и график должен идти сразу за описанием, а не после всех формул.
    # На широком экране сетка ставит график справа на обе строки
    o.append('<div class="pd-g%s">' % ("" if has_body else " solo"))
    o.append('<div class="pd-d">%s' % desc_html(p["desc"]))
    for n in p["notes"]:
        o.append('<p class="tbd">%s</p>' % esc(n))
    o.append("</div>")
    if spec:
        cap = "Схема выплаты, без масштаба." + ("" if spec.get("noasset") else " Тонкая диагональ — сам базовый актив.")
        o.append('<figure class="viz">%s<figcaption>%s</figcaption></figure>' % (chart_svg(spec, color), cap))
    o.append('<div class="pd-f">')
    for b in p["blocks"]:
        o.append('<div class="fb"><div class="fb-k lbl">%s</div>' % b["label"])
        for kind, v in b["items"]:
            if kind == "f":
                o.append('<div class="fx">%s</div>' % v)
            elif kind == "c":
                o.append('<div class="fc">%s</div>' % esc(v))
            else:
                o.append('<div class="fn">%s</div>' % esc(v))
        if b["vars"]:
            o.append('<details class="vars"><summary><span class="lbl">Обозначения</span></summary><dl>%s</dl></details>' % "".join(
                "<dt>%s</dt><dd>%s</dd>" % (pretty(v) if len(v) < 12 else esc(v), esc(d)) for v, d in b["vars"]))
        o.append(bars_html(b["barriers"]) + "</div>")
    o.append(bars_html(p["barriers"]))
    o.append("</div>")
    o.append("</div></article>")
    return "".join(o)


def td(parts):
    """Ячейка таблицы активов: коды и веса не переносятся, адреса — где угодно."""
    cls = ""
    if any(x.startswith("http") or "://" in x for x in parts):
        cls = ' class="u"'
    elif parts and all(" " not in x for x in parts):
        cls = ' class="nw"'
    return "<td%s>%s</td>" % (cls, "<br>".join(esc(x) for x in parts))


CLASSES = [("1", "Инвестиционные продукты", "группы 11–14"), ("2", "Продукты с плечом", "группы 21–23")]

# Подписи полей паспорта базового актива — по заголовкам таблиц документа
FIELD_LABELS = {
    "наименование эмитента актива": "Эмитент",
    "категория (тип) ценной бумаги": "Тип бумаги",
    "тикер": "Тикер",
    "isin": "ISIN",
    "валюта базового актива": "Валюта",
    "вес": "Вес в корзине",
    "1. биржа 2. источник информации о котировке базового актива": "Биржа и источник котировки",
    "биржа срочных контрактов": "Биржа срочных контрактов",
    "полное наименование ценной бумаги": "Полное наименование",
    "тип цены": "Тип цены",
    "источник информации о котировке базового актива": "Источник котировки",
    "наименование (описание) индекса": "Индекс",
    "страница индекса": "Страница индекса",
    "администратор индекса": "Администратор",
}
MONO_FIELDS = {"Тикер", "ISIN", "Вес в корзине"}


def _norm(s):
    return re.sub(r"\s+", " ", s).strip().lower()


def pval(parts, mono):
    """Значение поля паспорта: адреса — ссылками, пояснение в скобках — мелко под ними."""
    out = []
    for x in parts:
        m = re.match(r"(https?://\S+)\s*(\(.*\))?$", x)
        if m:
            url, note = m.group(1), m.group(2)
            out.append('<a href="%s" target="_blank" rel="noopener">%s</a>%s' % (
                esc(url), esc(re.sub(r"^https?://(www\.)?", "", url)),
                ('<small>%s</small>' % esc(note.strip("()"))) if note else ""))
        else:
            out.append(esc(x))
    return '<div class="pv%s">%s</div>' % (" m" if mono else "", "<br>".join(out))


def asset_html(a):
    title = esc(a["t"])
    if not a["table"]:
        return ""  # валюты и товары в документе — TBD; на странице их нет (фидбек Алексея)
    hdr = [FIELD_LABELS.get(_norm(" ".join(c)), " ".join(c)) for c in a["table"][0]]
    desc = "".join('<p class="ad">%s</p>' % esc(d) for d in a["d"] if d.strip() != "TBD")
    fields = "".join("<li>%s</li>" % esc(h) for h in hdr)
    passes = []
    for row in a["table"][1:]:
        cells = dict(zip(hdr, row))
        name = " ".join(cells.get(hdr[0], []))
        w = " ".join(cells.get("Вес в корзине", []))
        rows = ""
        for h, c in zip(hdr, row):
            if h == hdr[0] or h == "Вес в корзине" or not c:
                continue
            rows += '<div class="prow"><div class="pk">%s</div>%s</div>' % (esc(h), pval(c, h in MONO_FIELDS))
        passes.append('<div class="pass"><div class="pt">%s%s</div>%s</div>' % (
            esc(name), ('<span class="w">вес %s</span>' % esc(w)) if w else "", rows))
    n = len(passes)
    ex = "Пример: корзина из двух бумаг" if n == 2 else "Пример заполнения"
    return ('<div class="asset"><h3>%s</h3>%s<div class="asset-g">'
            '<div><div class="lbl">Что указывается</div><ul class="fields">%s</ul></div>'
            '<div><div class="lbl">%s</div><div class="passes">%s</div></div></div></div>' % (
                title, desc, fields, ex, "".join(passes)))


def anatomy_html(groups):
    """Как читать код — на живом примере 1220: три строки, в каждой подсвечена
    своя часть кода (класс → группа → тип), чтобы вложенность была видна."""
    g12 = next(g for g in groups if g["code"] == "12")
    p = next(p for p in g12["products"] if p["code"] == "1220")
    gc = GROUP_COLOR["12"]

    def code(n, color):
        return '<span class="ac" style="--hc:%s">%s</span>' % (color, "".join(
            '<b%s>%s</b>' % (' class="on"' if i < n else "", d) for i, d in enumerate("1220")))
    jar = ("«%s»" % p["jargon"][0].lower()) if p["jargon"] else ""
    return ('<div class="anat" aria-label="Как читать код продукта"><div class="lbl">Как читать код продукта</div>'
            '<div class="anat-rows">'
            '<div class="ar">%s<span class="at"><b>Класс 1</b>первая цифра: 1&nbsp;— инвестиционные продукты, 2&nbsp;— продукты с&nbsp;плечом</span></div>'
            '<div class="ar">%s<span class="at"><b>Группа 12</b>первые две цифры: %s</span></div>'
            '<div class="ar">%s<span class="at"><b>Тип 1220</b>все четыре: %s&nbsp;%s</span></div>'
            '</div>'
            '<div class="anat-note">Тип с последними цифрами 99 — прочие продукты группы, не вошедшие в остальные типы.</div>'
            '</div>' % (code(1, "#F2F3F7"), code(2, gc), esc(g12["name"].lower()), code(4, gc), esc(p["name"].lower()), esc(jar)))


# Группы словаря (фидбек Алексея: «термины в две колонки хаотично — группировать»).
# Порядок внутри группы — как в документе; термин вне списка попадёт в «Прочее»
TERM_GROUPS = [
    ("Актив и его цена", ["Базовый актив", "Начальная цена", "Показатель базового актива", "Наблюдение (фиксинг)", "Страйк", "Барьер"]),
    ("Выплаты и обязанное лицо", ["Выплата", "Структурный доход", "Погашение", "Защита капитала", "Плечо (рычаг)", "Эмитент"]),
    ("Кредитные продукты (группа 14)", ["Контрольное лицо", "Контрольное обязательство", "Кредитное событие", "Ставка возмещения"]),
]


def dict_html(sections, prefix):
    """Справочник: слева плашки по группам, справа панель с ОДНИМ описанием —
    наведение показывает, клик закрепляет. Все описания лежат в DOM (поиск и
    без-JS видят их), показывается только активное — класс .on. Одна разметка
    для терминов и механизмов; prefix делает id уникальными на странице."""
    chips, defs, i = [], [], 0
    pid = "tdef-" + prefix
    for gname, items in sections:
        if not items:
            continue
        chips.append('<div class="tg"><div class="tg-h lbl">%s</div><div class="tchips">' % esc(gname))
        for label, title, body in items:
            tid = "%s%d" % (prefix, i); on = " on" if i == 0 else ""
            chips.append('<button type="button" class="tchip%s" data-t="%s" aria-controls="%s" aria-expanded="%s">%s</button>'
                         % (on, tid, pid, "true" if i == 0 else "false", esc(label)))
            defs.append('<div class="td%s" id="%s"><div class="lbl">%s</div><h3>%s</h3>%s</div>'
                        % (on, tid, esc(gname), esc(title), body))
            i += 1
        chips.append("</div></div>")
    return ('<div class="tlist">%s</div><div class="tdef" id="%s" aria-live="polite">%s</div>'
            % ("".join(chips), pid, "".join(defs)))


def terms_html(terms):
    by = {t["t"].strip(): t for t in terms}
    used, sections = set(), []
    for gname, names in TERM_GROUPS + [("Прочее", [])]:
        items = [by[n] for n in names if n in by] if names else [t for t in terms if t["t"].strip() not in used]
        used.update(t["t"].strip() for t in items)
        sections.append((gname, [(t["t"], t["t"], "".join(para(d) for d in t["d"])) for t in items]))
    return dict_html(sections, "t")


# Механизмы: короткие имена для плашек (заголовки документа длиной в строку) и
# две группы — по тому, к каким продуктам механизм применяется (так сказано в
# тексте каждого). Заголовок вне списка попадёт в первую группу как есть
MECH_SHORT = {
    "Способ расчета цены базового актива в зависимости от числа базовых активов": "Корзина: чья цена считается",
    "Способ наблюдения цены (способ фиксинга)": "Способ фиксинга",
    "Выплата в валюте, отличной от валюты номинала": "Выплата в другой валюте",
    "Автоколл (отзыв)": "Автоколл (отзыв)",
    "Определение ставки возмещения": "Ставка возмещения",
    "Риск на структурный доход": "Риск на структурный доход",
    "Момент погашения при кредитном событии": "Момент погашения",
}
MECH_CREDIT = {"Определение ставки возмещения", "Риск на структурный доход", "Момент погашения при кредитном событии"}


def mechs_html(mechs):
    def body(m):
        return "".join(para(d) for d in m["d"]) + (("<ul>%s</ul>" % "".join("<li>%s</li>" % esc(x) for x in m["list"])) if m["list"] else "")
    price = [(MECH_SHORT.get(m["t"], m["t"]), m["t"], body(m)) for m in mechs if m["t"] not in MECH_CREDIT]
    credit = [(MECH_SHORT.get(m["t"], m["t"]), m["t"], body(m)) for m in mechs if m["t"] in MECH_CREDIT]
    return dict_html([("Для продуктов на цену актива", price), ("Для кредитных продуктов (группа 14)", credit)], "m")


def render(doc):
    groups = doc["groups"]
    n_codes = sum(len(g["products"]) for g in groups)
    codes = {p["code"] for g in groups for p in g["products"]}
    n_ours = len([c for c in OURS if c in codes])
    toc = ['<a href="#overview">Карта</a>', '<a href="#terms">Термины</a>', '<a href="#mechs">Механизмы</a>']
    for g in groups:
        toc.append('<a class="g" href="#g%s" style="--fc:%s"><span class="gc">%s</span>%s</a>' % (g["code"], GROUP_COLOR[g["code"]], g["code"], esc(g["name"])))
    toc.append('<a href="#assets">Базовые активы</a>')

    ov = []
    for ccode, cname, csub in CLASSES:
        ov.append('<div class="cls"><div class="cls-h"><span class="n">%s</span><span class="t">%s</span><span class="s lbl">%s</span></div><div class="ov">' % (ccode, cname, csub))
        for g in [g for g in groups if g["code"][0] == ccode]:
            ov.append('<div class="ovg" style="--fc:%s"><a class="ovh" href="#g%s"><span class="gc">%s</span>%s</a><ul>' % (GROUP_COLOR[g["code"]], g["code"], g["code"], esc(g["name"])))
            for p in g["products"]:
                mark = '<span class="dot" title="есть на витрине" aria-label="есть на витрине"></span>' if p["code"] in OURS else ""
                ov.append('<li><a href="#p%s"><span class="c">%s</span><span class="n">%s</span>%s</a></li>' % (p["code"], p["code"], esc(p["name"]), mark))
            ov.append("</ul></div>")
        ov.append("</div></div>")

    terms = terms_html(doc["terms"])
    mechs = mechs_html(doc["mechs"])

    gsec = []
    for g in groups:
        jar = (' <span class="jar">%s</span>' % " · ".join("«%s»" % esc(j) for j in g["jargon"])) if g["jargon"] else ""
        gsec.append('<section class="grp" id="g%s" style="--fc:%s"><div class="grp-h"><span class="gc lbl">Группа %s</span><h2>%s%s</h2>%s</div>%s</section>' % (
            g["code"], GROUP_COLOR[g["code"]], g["code"], esc(g["name"]), jar, para(g["lead"]) if g["lead"] else "",
            "".join(prod_html(p, g["code"]) for p in g["products"])))

    assets = "".join(asset_html(a) for a in doc["assets"])
    note = ('<p class="pnote">%s.</p>' % esc(doc["products_note"][0].upper() + doc["products_note"][1:])) if doc["products_note"] else ""
    lead = ("%d типа продуктов в семи группах: что каждый обещает, как считается выплата и где проходит риск. "
            "Классификация повторяет европейскую EUSIPA; названия, термины и формулы — российские." % n_codes)
    return fill(TEMPLATE,
        ed=doc.get("ed", ""), title=esc(doc["title"]), sub=esc(doc["sub"]), lead=esc(lead), n=n_codes, ng=len(groups),
        nt=len(doc["terms"]), nours=n_ours, anatomy=anatomy_html(groups),
        toc="".join(toc), overview="".join(ov), terms=terms, mech_intro=para(doc["mech_intro"]) if doc["mech_intro"] else "",
        mechs=mechs, groups="".join(gsec), assets=assets, pnote=note,
        desc=esc("Классификация структурных продуктов по экономическому смыслу: "
                 "%d типов в семи группах — защита капитала, повышение доходности, участие, "
                 "кредитные продукты и продукты с плечом. Графики выплат, формулы, "
                 "термины и механизмы. На основе европейской классификации EUSIPA." % n_codes))


def fill(tpl, **kw):
    for k, v in kw.items():
        tpl = tpl.replace("@@%s@@" % k, str(v))
    return tpl


TEMPLATE = None  # читается в main() из make_spmap_tpl.html рядом со скриптом


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit("python make_spmap.py <файл.docx> [--out map.html]")
    out = "map.html"
    if "--out" in args:
        out = args[args.index("--out") + 1]
    global TEMPLATE
    import os
    TEMPLATE = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "make_spmap_tpl.html"), encoding="utf-8").read()
    doc = parse(args[0])
    # Редакция — из имени файла (…_23092026.docx), иначе из даты правки документа
    m = re.search(r"(\d{2})(\d{2})(20\d{2})", os.path.basename(args[0]))
    doc["ed"] = "%s.%s.%s" % m.groups() if m else ""
    page = render(doc)
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(page)
    n = sum(len(g["products"]) for g in doc["groups"])
    nf = sum(1 for g in doc["groups"] for p in g["products"] for b in p["blocks"] for k, _ in b["items"] if k == "f")
    miss = [p["code"] for g in doc["groups"] for p in g["products"] if p["img"] and not chart_for(p)]
    print("групп %d, кодов %d, формул %d, терминов %d, механизмов %d, активов %d; без графика-спеки: %s -> %s"
          % (len(doc["groups"]), n, nf, len(doc["terms"]), len(doc["mechs"]), len(doc["assets"]), miss or "нет", out))


if __name__ == "__main__":
    main()
