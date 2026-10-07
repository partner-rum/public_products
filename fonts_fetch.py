# -*- coding: utf-8 -*-
"""Скачивает шрифты витрины с Google Fonts в локальную папку fonts/.

Зачем локально: fonts.googleapis.com у части провайдеров РФ отдаётся с таймаутом,
а <link rel=stylesheet> из <head> блокирует первую отрисовку — страница висела
белым экраном (домашний Wi-Fi, потом и мобильные сети). Теперь шрифты раздаёт
свой nginx, внешних зависимостей у первой отрисовки нет.

Набор весов = объединение того, что просят страницы витрины и генераторы
обложек (Rubik 800 нужен только обложкам). Подмножества: cyrillic, latin,
latin-ext — последний ОБЯЗАТЕЛЕН: знак рубля U+20BD лежит только в нём.
cyrillic-ext не берём: ни одного символа сайта в его диапазоне нет.

ВСЕ ТРИ СЕМЕЙСТВА — ВАРИАТИВНЫЕ (ось толщины): на запрос каждого веса Google
отдаёт ОДИН И ТОТ ЖЕ файл (md5 совпадает). Пока fonts.css объявлял его под
своим именем на каждый вес, браузер качал одни и те же байты 3–5 раз —
12–18 файлов и 250–420 КБ на страницу (замер 07.10.2026, телефон). Теперь
одинаковые по содержимому веса сводятся в одно правило с диапазоном
`font-weight: 400 700` — файл один, отрисовка та же (браузер ставит ось
толщины по запрошенному весу). Если Google однажды отдаст разные файлы на
разные веса, правила останутся раздельными — сведение идёт по содержимому.

Запуск:  python fonts_fetch.py            — скачать с Google и собрать fonts.css
         python fonts_fetch.py --css-only — пересобрать fonts.css из уже лежащих
                                            файлов, без сети
Файлы перезаписываются только при изменении содержимого — иначе git видел бы
десятки «правок» и авто-обновляторы ставок отменяли бы публикацию.
Правишь набор — бампни fonts/fonts.css?v=N во всех страницах (файл кэшируется на год).
"""
import hashlib, io, os, re, sys

DST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
# Веса: витрина просит 400-700 у всех трёх, обложкам нужен ещё Rubik 800.
URL = ("https://fonts.googleapis.com/css2"
       "?family=Onest:wght@400;500;600;700"
       "&family=JetBrains+Mono:wght@400;500;600;700"
       "&family=Rubik:wght@400;500;600;700;800"
       "&display=swap")
KEEP = ("cyrillic", "latin", "latin-ext")
HEAD = u"""/* Шрифты витрины — локальные копии Google Fonts (Onest, JetBrains Mono, Rubik).
   Собрано fonts_fetch.py, руками не править. Лицензии — fonts/LICENSE.md.
   unicode-range взяты у Google как есть, чтобы отрисовка не изменилась.
   latin-ext нужен из-за знака рубля U+20BD — он только там.
   Семейства вариативные: один файл на набор символов покрывает все толщины. */
"""


def write_if_changed(path, data, binary=False):
    """Пишет файл только при отличии — не «трогает» неизменившиеся."""
    if os.path.exists(path):
        old = open(path, "rb").read()
        new = data if binary else data.encode("utf-8")
        if old == new:
            return False
    if binary:
        open(path, "wb").write(data)
    else:
        io.open(path, "w", encoding="utf-8", newline="\n").write(data)
    return True


def slug(fam):
    return fam.lower().replace(" ", "")


def build_css(faces):
    """faces: [(family, style, weight, subset, file, unicode_range)].
    Веса одного семейства и подмножества с одинаковым файлом по содержимому
    сводятся в одно правило с диапазоном толщин."""
    digest = {}
    def md5(name):
        if name not in digest:
            digest[name] = hashlib.md5(open(os.path.join(DST, name), "rb").read()).hexdigest()
        return digest[name]

    groups = {}
    for fam, sty, wgt, subset, name, rng in faces:
        groups.setdefault((fam, sty, subset, rng), []).append((int(wgt), name))
    order = []   # порядок правил — как у Google: по семейству, затем по подмножеству
    for fam, sty, wgt, subset, name, rng in faces:
        k = (fam, sty, subset, rng)
        if k not in order:
            order.append(k)

    out, n_rules, files = [HEAD], 0, set()
    for k in order:
        fam, sty, subset, rng = k
        ws = sorted(groups[k])
        same = len(set(md5(n) for _, n in ws)) == 1
        rules = [("%d %d" % (ws[0][0], ws[-1][0]) if len(ws) > 1 else str(ws[0][0]), ws[0][1])] if same \
            else [(str(w), n) for w, n in ws]
        for weight, name in rules:
            files.add(name)
            n_rules += 1
            out.append(u"\n@font-face {\n"
                       u"  font-family: '%s';\n"
                       u"  font-style: %s;\n"
                       u"  font-weight: %s;\n"
                       u"  font-display: swap;\n"
                       u"  src: url(%s) format('woff2');\n"
                       u"  unicode-range: %s;\n"
                       u"}\n" % (fam, sty, weight, name, rng))
    return u"".join(out), n_rules, files


def faces_from_local():
    """Без сети: список весов — по файлам в fonts/, unicode-range — из текущего fonts.css."""
    css = io.open(os.path.join(DST, "fonts.css"), encoding="utf-8").read()
    rng_of, fam_of = {}, {}
    for body in re.findall(r"@font-face\s*\{(.*?)\}", css, re.S):
        fam = re.search(r"font-family:\s*'([^']+)'", body).group(1)
        src = re.search(r"url\(([^)]+\.woff2)\)", body).group(1)
        rng = re.search(r"unicode-range:\s*([^;]+);", body).group(1).strip()
        m = re.match(r"([a-z]+)-\d+-([a-z\-]+)\.woff2$", src)
        rng_of[(m.group(1), m.group(2))] = rng
        fam_of[m.group(1)] = fam
    faces = []
    for f in sorted(os.listdir(DST)):
        m = re.match(r"([a-z]+)-(\d+)-([a-z\-]+)\.woff2$", f)
        if not m or (m.group(1), m.group(3)) not in rng_of:
            continue
        faces.append((fam_of[m.group(1)], "normal", m.group(2), m.group(3), f, rng_of[(m.group(1), m.group(3))]))
    return faces


def main():
    os.makedirs(DST, exist_ok=True)
    if "--css-only" in sys.argv:
        faces, written, total = faces_from_local(), 0, 0
    else:
        try:
            import requests
        except ImportError:
            sys.exit("нужен requests: pip install requests")
        css = requests.get(URL, headers={"User-Agent": UA}, timeout=30).text
        blocks = re.findall(r"/\*\s*([a-z\-]+)\s*\*/\s*@font-face\s*\{(.*?)\}", css, re.S)
        if not blocks:
            sys.exit("Google отдал CSS без @font-face — проверь URL")
        faces, written, total = [], 0, 0
        for subset, body in blocks:
            if subset not in KEEP:
                continue
            fam = re.search(r"font-family:\s*'([^']+)'", body).group(1)
            wgt = re.search(r"font-weight:\s*(\d+)", body).group(1)
            sty = re.search(r"font-style:\s*(\w+)", body).group(1)
            src = re.search(r"url\((https://[^)]+\.woff2)\)", body).group(1)
            rng = re.search(r"unicode-range:\s*([^;]+);", body).group(1).strip()
            name = "%s-%s-%s.woff2" % (slug(fam), wgt, subset)
            data = requests.get(src, headers={"User-Agent": UA}, timeout=30).content
            if data[:4] != b"wOF2":
                sys.exit("не woff2: %s" % name)
            written += write_if_changed(os.path.join(DST, name), data, binary=True)
            total += len(data)
            faces.append((fam, sty, wgt, subset, name, rng))

    css_text, n_rules, used = build_css(faces)
    css_changed = write_if_changed(os.path.join(DST, "fonts.css"), css_text)
    used_kb = sum(os.path.getsize(os.path.join(DST, n)) for n in used) / 1024.0

    # Файлы прочих весов остаются на месте: их может держать в кэше старый
    # fonts.css?v=1 у тех, кто заходил раньше, и на них ссылаются обложки
    known = set(f[4] for f in faces) | {"fonts.css", "LICENSE.md"}
    extra = [f for f in sorted(os.listdir(DST)) if f not in known]
    print("весов в наборе: %d, правил в fonts.css: %d, разных файлов: %d (%.0f КБ)"
          % (len(faces), n_rules, len(used), used_kb))
    if total:
        print("скачано %.0f КБ, перезаписано файлов: %d" % (total / 1024.0, written))
    print("fonts.css %s" % ("обновлён" if css_changed else "без изменений"))
    if extra:
        print("ЛИШНЕЕ в fonts/ (удали руками, если не нужно): %s" % ", ".join(extra))


if __name__ == "__main__":
    main()
