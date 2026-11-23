# -*- coding: utf-8 -*-
"""
Собирает страницы статей Библиотеки: lib-<id>.html — по странице на статью.

Зачем. Все статьи жили на одном адресе about.html и переключались якорем
(about.html#autocall). Одна страница не может стоять в поиске по двадцати темам
сразу, а якорь поисковик не считает отдельным адресом. Теперь у каждой статьи
свой адрес, свои <title>, описание, canonical и свой текст в исходнике страницы.

Как устроено.
  about.html    — оглавление и ЗАГОТОВКА для страниц статей (правится руками);
  library.js    — тексты статей (LIB), графики и переходы; library.css — стили.
                  Оба файла общие для всех страниц Библиотеки;
  lib-<id>.html — about.html с подменёнными <title>, описанием, canonical,
                  og-тегами, пометкой <html data-article="<id>"> и текстом статьи
                  в слоте <article id="article">. СОБИРАЮТСЯ, руками не править.

Список статей и их заголовки для поиска — таблица SEO_TITLE в library.js.
Текст в слоте — подмножество того, что рисует страница (название, суть, как
устроена, риск, когда уместна): скрипт заменяет слот до того, как его увидит
человек. Класть туда то, чего на странице нет, нельзя.

Скрипт также:
  • ставит в about.html и страницах статей метку версии library.css / library.js
    по содержимому файлов — после правки стилей или скрипта достаточно прогона,
    руками ?v= не поднимается;
  • обновляет в about.html текст оглавления для поиска (список статей со ссылками);
  • ведёт блок адресов статей в sitemap.xml (между метками lib:start / lib:end);
  • удаляет страницы статей, которых больше нет в SEO_TITLE.

Запуск: python make_library.py        (после ЛЮБОЙ правки about.html,
                                        library.js, library.css, market-lib.js)
        python make_library.py --check (ничего не пишет; код 1, если страницы устарели)
"""
import glob
import hashlib
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
BASE = "https://invest.rumberg.ru"
SRC = "about.html"
SUFFIX = " — Библиотека Rumberg"
S_START, S_END = "<!-- seo:article:start -->", "<!-- seo:article:end -->"
SM_START, SM_END = "<!-- lib:start -->", "<!-- lib:end -->"


def read(name):
    return io.open(os.path.join(ROOT, name), encoding="utf-8", newline="").read()


def lf(s):
    return s.replace("\r\n", "\n")


def write_if_changed(name, text, check):
    """Пишет файл, только если изменилось содержимое (переводы строк не в счёт):
    git на Windows отдаёт CRLF, и побайтное сравнение пометило бы всё изменённым."""
    path = os.path.join(ROOT, name)
    if os.path.exists(path) and lf(read(name)) == lf(text):
        return 0
    if not check:
        io.open(path, "w", encoding="utf-8", newline="").write(text)
    return 1


def esc(s):
    return (str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def attr(s):
    return esc(s).replace('"', "&quot;")


def stamp(name):
    """Метка версии файла: первые 8 знаков sha1 от содержимого с переводами строк LF."""
    return hashlib.sha1(lf(read(name)).encode("utf-8")).hexdigest()[:8]


def js_string(src, key):
    """Строковое поле `key: "…"` объекта в JS-файле (одна строка, двойные кавычки)."""
    m = re.search(r'^\s*' + re.escape(key) + r':\s*("(?:[^"\\]|\\.)*")\s*,?\s*$', src, re.M)
    return json.loads(m.group(1)) if m else ""


def load():
    js = read("library.js")
    # Статьи: строки вида «    ключ: {…}» со строгим JSON в значении. Соседний объект
    # FAM (ключи без кавычек) на json.loads отваливается — это не статьи.
    lib = {}
    for key, raw in re.findall(r"^\s{4}(\w+):\s*(\{.*?\}),?\s*$", js, re.M):
        try:
            d = json.loads(raw)
        except ValueError:
            continue
        if d.get("name"):
            lib[key] = d
    m = re.search(r"var SEO_TITLE = (\{.*?\n\s*\});", js, re.S)
    if not m:
        raise SystemExit("в library.js не найдена таблица SEO_TITLE")
    titles = json.loads(m.group(1))
    m = re.search(r'var INDEX_TITLE = ("(?:[^"\\]|\\.)*");', js)
    index_title = json.loads(m.group(1)) if m else ""

    # Статья о рынке: тексты живут в market-lib.js (их же берёт market.html)
    mk = read("market-lib.js")
    lib["market"] = {k: js_string(mk, k) for k in ("name", "tagline", "how", "whenToUse")}
    # «Варранты» — обзор шести типов; вводная фраза зашита в вызове headHTML
    m = re.search(r'headHTML\("[^"]*",\s*"Варранты",\s*("(?:[^"\\]|\\.)*"),\s*"warrants"\)', js)
    lib["warrants"] = {"name": "Варранты", "tagline": json.loads(m.group(1)) if m else ""}
    wtypes = json.loads(re.search(r"var WTYPES = (\[.*?\]);", js).group(1))

    missing = [i for i in titles if i not in lib or not lib[i].get("name")]
    if missing:
        raise SystemExit("нет текста для статей: " + ", ".join(missing))
    return lib, titles, index_title, wtypes


def url(aid):
    return "lib-%s.html" % aid


def desc_of(d):
    """Описание страницы — суть статьи одной-двумя фразами (до ~230 знаков)."""
    t = re.sub(r"\s+", " ", d.get("tagline") or d.get("how") or "").strip()
    if len(t) <= 230:
        return t
    cut = t[:230]
    dot = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return cut[:dot + 1] if dot > 90 else cut[:cut.rfind(" ")] + "…"


def others(lib, titles, cur=None):
    rows = ['<li><a href="%s">%s</a></li>' % (url(i), esc(lib[i]["name"])) for i in titles if i != cur]
    return "<ul>" + "".join(rows) + "</ul>"


def article_block(aid, lib, titles, wtypes):
    d = lib[aid]
    h = ['<div class="seo-pre"><h1>' + esc(d["name"]) + "</h1>"]
    for f in ("tagline", "how", "risk", "whenToUse"):
        if d.get(f):
            h.append("<p>" + esc(d[f]) + "</p>")
    if aid == "warrants":
        h.append("<ul>" + "".join(
            '<li><a href="%s">%s</a> — %s</li>' % (url(w), esc(lib[w]["name"]), esc(lib[w].get("tagline", "")))
            for w in wtypes) + "</ul>")
    h.append('<h2>Другие статьи библиотеки</h2>' + others(lib, titles, aid))
    h.append('<p><a href="about.html">Все статьи — оглавление библиотеки</a></p></div>')
    return "".join(h)


def index_block(src, lib, titles):
    # Вводная — ДОСЛОВНО лид самой страницы, не сочинённая
    m = re.search(r"<h1>[^<]*</h1>\s*<p>([^<]+)</p>", src)
    h = ['<div class="seo-pre">']
    if m:
        h.append("<p>" + esc(m.group(1).strip()) + "</p>")
    h.append("<ul>" + "".join(
        '<li><a href="%s">%s</a> — %s</li>' % (url(i), esc(lib[i]["name"]), esc(desc_of(lib[i])))
        for i in titles) + "</ul></div>")
    return "".join(h)


def sub1(pattern, repl, text, what):
    new, n = re.subn(pattern, lambda m: repl, text, count=1, flags=re.S)
    if n != 1:
        raise SystemExit("в about.html не найдено: " + what)
    return new


def set_slot(text, body):
    return sub1(re.escape(S_START) + ".*?" + re.escape(S_END), S_START + body + S_END, text, "слот статьи (seo:article)")


def build_page(src, aid, lib, titles, wtypes):
    d = lib[aid]
    title = titles[aid]
    desc = desc_of(d)
    p = src
    p = sub1(r'<html lang="ru">', '<html lang="ru" data-article="%s">' % aid, p, "<html lang>")
    p = sub1(r"<title>[^<]*</title>", "<title>%s</title>" % esc(title + SUFFIX), p, "<title>")
    p = sub1(r'<meta name="description" content="[^"]*">',
             '<meta name="description" content="%s">' % attr(desc), p, "description")
    p = sub1(r'<meta property="og:title" content="[^"]*">',
             '<meta property="og:title" content="%s">' % attr(title), p, "og:title")
    p = sub1(r'<meta property="og:description" content="[^"]*">',
             '<meta property="og:description" content="%s">' % attr(desc), p, "og:description")
    p = sub1(r'<meta property="og:url" content="[^"]*">',
             '<meta property="og:url" content="%s/%s">' % (BASE, url(aid)), p, "og:url")
    p = sub1(r'<link rel="canonical" href="[^"]*">',
             '<link rel="canonical" href="%s/%s">' % (BASE, url(aid)), p, "canonical")
    # Главный заголовок страницы статьи — название статьи (его ставит скрипт и
    # блок для поиска); название раздела остаётся на месте обычным блоком
    p, n = re.subn(r"<h1>([^<]*)</h1>", r'<div class="ph-t">\1</div>', p, count=1)
    if n != 1:
        raise SystemExit("в about.html не найдено: <h1> раздела")
    return set_slot(p, article_block(aid, lib, titles, wtypes))


def sitemap(titles, check):
    name = "sitemap.xml"
    s = read(name)
    nl = "\r\n" if "\r\n" in s else "\n"
    rows = ["  " + SM_START] + [
        "  <url><loc>%s/%s</loc><priority>0.7</priority></url>" % (BASE, url(i)) for i in titles
    ] + ["  " + SM_END]
    block = nl.join(rows)
    if SM_START in s:
        new = re.sub(r"[ \t]*" + re.escape(SM_START) + ".*?" + re.escape(SM_END), lambda m: block, s, flags=re.S)
    else:
        new = s.replace("</urlset>", block + nl + "</urlset>")
    return write_if_changed(name, new, check)


def main():
    check = "--check" in sys.argv
    lib, titles, index_title, wtypes = load()

    src = read(SRC)
    if S_START not in src:
        raise SystemExit("в about.html нет слота <!-- seo:article:start -->…<!-- seo:article:end -->")
    m = re.search(r"<title>([^<]*)</title>", src)
    if index_title and m and m.group(1) != index_title:
        print("! <title> в about.html и INDEX_TITLE в library.js различаются — поправь одно из двух")

    # Версии общих файлов — по содержимому: правка стилей или скрипта доезжает до
    # людей без ручного ?v= (браузер держит .js и .css неделю)
    for f in ("library.css", "library.js"):
        # все вхождения: у скрипта их два — предзагрузка в <head> и сам тег
        src, n = re.subn(re.escape(f) + r'\?v=[\w.-]+"', '%s?v=%s"' % (f, stamp(f)), src)
        if not n:
            raise SystemExit("в about.html не найдено: " + f + "?v=")
    src = set_slot(src, index_block(src, lib, titles))

    changed = write_if_changed(SRC, src, check)
    for aid in titles:
        changed += write_if_changed(url(aid), build_page(src, aid, lib, titles, wtypes), check)

    removed = 0
    keep = set(url(i) for i in titles)
    for path in glob.glob(os.path.join(ROOT, "lib-*.html")):
        if os.path.basename(path) not in keep:
            removed += 1
            if not check:
                os.remove(path)
    changed += sitemap(titles, check)

    print("статей: %d | изменено файлов: %d | удалено лишних: %d%s" % (
        len(titles), changed, removed, " (проверка, ничего не записано)" if check else ""))
    if check and (changed or removed):
        sys.exit(1)


if __name__ == "__main__":
    main()
