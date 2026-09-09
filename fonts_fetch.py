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

Запуск:  python fonts_fetch.py
Файлы перезаписываются только при изменении содержимого — иначе git видел бы
десятки «правок» и авто-обновляторы ставок отменяли бы публикацию.
"""
import io, os, re, sys

try:
    import requests
except ImportError:
    sys.exit("нужен requests: pip install requests")

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
   Веса и unicode-range взяты у Google как есть, чтобы отрисовка не изменилась.
   latin-ext нужен из-за знака рубля U+20BD — он только там. */
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


def main():
    os.makedirs(DST, exist_ok=True)
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
        name = "%s-%s-%s.woff2" % (fam.lower().replace(" ", ""), wgt, subset)
        data = requests.get(src, headers={"User-Agent": UA}, timeout=30).content
        if data[:4] != b"wOF2":
            sys.exit("не woff2: %s" % name)
        written += write_if_changed(os.path.join(DST, name), data, binary=True)
        total += len(data)
        faces.append((fam, sty, wgt, name, rng))

    out = [HEAD]
    for fam, sty, wgt, name, rng in faces:
        out.append(u"\n@font-face {\n"
                   u"  font-family: '%s';\n"
                   u"  font-style: %s;\n"
                   u"  font-weight: %s;\n"
                   u"  font-display: swap;\n"
                   u"  src: url(%s) format('woff2');\n"
                   u"  unicode-range: %s;\n"
                   u"}\n" % (fam, sty, wgt, name, rng))
    css_changed = write_if_changed(os.path.join(DST, "fonts.css"), u"".join(out))

    known = set(n for _, _, _, n, _ in faces) | {"fonts.css", "LICENSE.md"}
    extra = [f for f in sorted(os.listdir(DST)) if f not in known]
    print("шрифтов в наборе: %d, вес %.0f КБ" % (len(faces), total / 1024.0))
    print("перезаписано файлов: %d, fonts.css %s"
          % (written, "обновлён" if css_changed else "без изменений"))
    if extra:
        print("ЛИШНЕЕ в fonts/ (удали руками, если не нужно): %s" % ", ".join(extra))


if __name__ == "__main__":
    main()
