# -*- coding: utf-8 -*-
"""Генератор печатного дайджеста: A4-страницы -> digest-print.html -> PDF.

ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ — data/digest.js (issues[0]). Сейлзы наполняют его через админку,
а этот скрипт собирает и печатную вёрстку, и порядок страниц ровно из тех же данных, что
показывает сайт: цифры и состав дайджеста не могут расойтись с витриной.

Каждая идея рисуется одинаковым макетом: шапка, гипотеза, «Рыночная ситуация» + факторы,
параметры, профиль выплаты по типу payoff и две карточки «Как заработать» / «Риск».
Порядок страниц = порядок секций в data/digest.js.

Запуск:  python make_digest.py            (нужен segno для QR: pip install segno)
Дальше:  открыть digest-print.html -> «Скачать PDF» / «Печать» -> A4, поля «нет».
Авто:    .github/workflows/digest-pdf.yml рендерит PDF на каждый пуш data/digest.js."""
import re, json, os, sys, io
from string import Template

try:
    import segno
except ImportError:
    sys.exit("Нужен модуль segno для генерации QR: pip install segno")

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(ROOT, "digest-print.html")
SITE = "https://invest.rumberg.ru"

# ── данные: единственный источник — data/digest.js ───────────────────────────
def load(fn, glob):
    t = open(os.path.join(ROOT, "data", fn), encoding="utf-8").read()
    return json.loads(re.search(r"window\.%s\s*=\s*(\{.*\})\s*;" % glob, t, re.S).group(1))

ARCHIVE = load("digest.js", "DIGEST_ARCHIVE")
ISSUE   = ARCHIVE["issues"][0]
ISSUE_ID = ISSUE["id"]
SECTIONS = ARCHIVE["sections"]

# идеи в порядке секций — так же, как раскладывает сайт
ORDERED = []
for s in SECTIONS:
    ORDERED += [i for i in ISSUE["ideas"] if i.get("family") == s["key"]]
for i in ISSUE["ideas"]:            # подстраховка: идея с неизвестной секцией не теряется
    if i not in ORDERED:
        ORDERED.append(i)

MONTHS = {1: "января", 2: "февраля", 3: "марта", 4: "апреля", 5: "мая", 6: "июня",
          7: "июля", 8: "августа", 9: "сентября", 10: "октября", 11: "ноября", 12: "декабря"}
def human_date(dmy):
    d, m, y = (dmy.split(".") + ["", "", ""])[:3]
    try: return "%d %s %s" % (int(d), MONTHS[int(m)], y)
    except (ValueError, KeyError): return dmy
DATE = human_date(ISSUE.get("date", ""))
PDF  = "docs/digest/rumberg-digest-%s.pdf" % ISSUE_ID   # куда ведёт кнопка «Скачать PDF»

FAM_BADGE = {"warrant": "Варрант", "booster": "Бустер", "coupon": "Купон",
             "discount": "Дисконт", "protection": "Защита капитала", "portfolio": "Портфель"}
FAM_TOC   = {"warrant": "Варрант", "booster": "Бустер", "coupon": "Купон",
             "discount": "Дисконт", "protection": "Защита", "portfolio": "Портфель"}

def qr_svg(url):
    buf = io.BytesIO()
    segno.make(url, error="m").save(buf, kind="svg", border=1, dark="#101231", light=None,
                                    xmldecl=False, svgns=True, unit="", omitsize=True)
    return buf.getvalue().decode("utf-8").strip()

def T(tpl, **kw):
    return Template(tpl).substitute(**kw)

# ══════════════════════════════════════════════════════════════════════════════
#  СТИЛИ
# ══════════════════════════════════════════════════════════════════════════════
CSS = """
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --ink:#101231; --ink-2:#2C3055; --ink-3:#5B6080; --hair:#D9DBE6;
  --paper:#fff; --tint:#F3F4F9;
  --accent:#EE7D1B; --accent-ink:#96490A;
  --up:#137048; --down:#A63025;
  --mono:'JetBrains Mono',ui-monospace,monospace;
}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Onest',system-ui,sans-serif;color:var(--ink);
     font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}
.sheet{position:relative;width:210mm;height:297mm;overflow:hidden;background:var(--paper);
       display:flex;flex-direction:column;page-break-after:always;break-after:page}
.sheet:last-child{page-break-after:auto}
@page{size:A4;margin:0}
@media screen{
  body{background:#DCDEE6;padding:0 0 26px}
  .sheet{margin:0 auto 26px;box-shadow:0 2px 4px rgba(16,18,49,.14),0 18px 50px rgba(16,18,49,.2)}
}
/* панель управления — только на экране, в печать не попадает */
.bar{position:sticky;top:0;z-index:20;background:#0B0C10;color:#F2F3F7;
     border-bottom:1px solid rgba(255,255,255,.11);margin-bottom:26px}
.bar-in{max-width:210mm;margin:0 auto;padding:12px 8px;display:flex;align-items:center;gap:14px;
     flex-wrap:wrap}
.bar a,.bar button{font-family:'Onest',system-ui,sans-serif;font-size:13.5px;cursor:pointer}
.bar .back{color:rgba(242,243,247,.7);text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.bar .back:hover{color:#F2F3F7}
.bar .ttl{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;
     color:rgba(242,243,247,.5);margin-left:auto}
.bar .act{display:inline-flex;align-items:center;gap:7px;border-radius:9px;padding:9px 15px;
     text-decoration:none;border:0;font-weight:600;background:#EE7D1B;color:#0C0A08}
.bar .act:hover{background:#F58E33}
.bar .ghost{background:none;color:#F2F3F7;border:1px solid rgba(255,255,255,.2);font-weight:500}
.bar .ghost:hover{border-color:rgba(255,255,255,.4)}
.bar .hint{flex-basis:100%;font-size:12px;line-height:1.5;color:rgba(242,243,247,.45)}
@media print{.bar{display:none!important}}
@media(max-width:620px){.bar .ttl{display:none}}
.lbl{font-family:var(--mono);font-size:7.4pt;font-weight:500;letter-spacing:.17em;
     text-transform:uppercase;color:var(--ink-3)}
h1,h2,h3{font-family:'Rubik','Onest',sans-serif;font-weight:600;letter-spacing:-.012em}
p{font-size:9.4pt;line-height:1.58;color:var(--ink-2)}
p+p{margin-top:2.4mm}

/* ─── ОБЛОЖКА ─── */
.cover{background:var(--ink);color:#fff;padding:16mm 16mm 12mm}
.cover .motif{position:absolute;right:-34mm;top:96mm;width:150mm;opacity:.09}
.cover .motif path{fill:var(--accent)}
.cov-top{display:flex;align-items:flex-start;justify-content:space-between;position:relative;z-index:1}
.cov-top img{width:36mm;display:block}
.cov-top .lbl{color:rgba(255,255,255,.62);text-align:right;line-height:1.7}
.cov-mid{margin-top:18mm;position:relative;z-index:1}
.cov-mid .issue{font-family:var(--mono);font-size:8.4pt;letter-spacing:.2em;text-transform:uppercase;
     color:var(--accent);margin-bottom:5mm}
.cov-word{font-family:'Rubik',sans-serif;font-weight:700;font-size:86pt;line-height:.92;
     letter-spacing:-.03em;color:#fff}
.cov-word span{color:var(--accent)}
.cov-sub{margin-top:6mm;font-size:11pt;line-height:1.5;color:rgba(255,255,255,.72);max-width:120mm}
.toc{margin-top:auto;position:relative;z-index:1;border-top:1px solid rgba(255,255,255,.18)}
.toc-row{display:grid;grid-template-columns:26mm 1fr 10mm;gap:5mm;align-items:baseline;
     padding:3.1mm 0;border-bottom:1px solid rgba(255,255,255,.1)}
.toc-row .fam{font-family:var(--mono);font-size:7.6pt;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)}
.toc-row .idea{font-size:10pt;color:rgba(255,255,255,.92);line-height:1.35}
.toc-row .pg{font-family:var(--mono);font-size:9pt;color:rgba(255,255,255,.5);text-align:right}
.cov-foot{margin-top:9mm;display:flex;align-items:flex-end;justify-content:space-between;gap:8mm;
     position:relative;z-index:1}
.cov-foot .disc{font-size:7.4pt;line-height:1.5;color:rgba(255,255,255,.46);max-width:112mm}
.qr{background:#fff;padding:2mm;border-radius:1.6mm;width:20mm;height:20mm;flex:none}
.qr svg{width:100%;height:100%;display:block;shape-rendering:crispEdges}
.qr-cap{font-family:var(--mono);font-size:7pt;letter-spacing:.08em;color:rgba(255,255,255,.55);
     text-align:center;margin-top:1.4mm;line-height:1.35}

/* ─── ПОСТОЯННЫЙ КАРКАС ПРОДУКТОВОЙ СТРАНИЦЫ ─── */
.head{background:var(--ink);color:#fff;height:44mm;flex:none;padding:11mm 16mm 0;
      display:flex;align-items:flex-start;justify-content:space-between;gap:8mm}
.head .fam{display:inline-block;font-family:var(--mono);font-size:7.2pt;font-weight:500;
      letter-spacing:.16em;text-transform:uppercase;color:#0C0A08;background:var(--accent);
      padding:1.5mm 2.6mm;border-radius:1mm;margin-bottom:3.4mm}
.head h1{font-size:23pt;line-height:1.12;color:#fff;max-width:130mm}
.head img{width:32mm;flex:none;opacity:.9}
.body{flex:1;padding:8mm 16mm 0;display:flex;flex-direction:column;min-height:0}
.foot{flex:none;height:20mm;padding:0 16mm;border-top:1px solid var(--hair);
      display:flex;align-items:center;justify-content:space-between;gap:6mm}
.foot .pg{font-family:var(--mono);font-size:9pt;font-weight:500}
.foot .disc{font-size:7pt;line-height:1.45;color:var(--ink-3);max-width:104mm}
.foot .lnk{display:flex;align-items:center;gap:3mm}
.foot .qr{background:none;padding:0;width:18mm;height:18mm}
.foot .lnk .t{font-family:var(--mono);font-size:7pt;letter-spacing:.05em;color:var(--ink-3);
      text-align:right;line-height:1.5}
.foot .lnk .t b{display:block;color:var(--accent-ink);font-weight:500}

/* гипотеза */
.hypo{border-left:2.2mm solid var(--accent);padding-left:6mm;margin-bottom:7mm;min-height:21.5mm}
.hypo .lbl{color:var(--accent-ink);margin-bottom:2.2mm;display:block}
.hypo h2{font-size:17.5pt;line-height:1.26;font-weight:500}

/* рынок + параметры */
.cols{display:grid;grid-template-columns:1fr 66mm;gap:8mm;margin-bottom:7mm;min-height:62mm}
.cols h3{font-size:10pt;margin-bottom:2.6mm}
.cols .concl{margin-top:2.6mm;color:var(--ink)}
.facts{margin-top:4mm}
.facts .lbl{display:block;margin-bottom:2.2mm}
.facts ul{list-style:none;font-size:9pt;line-height:1.5;color:var(--ink-2)}
.facts li{padding-left:4.4mm;position:relative;margin-bottom:1.5mm}
.facts li::before{content:"";position:absolute;left:0;top:1.7mm;width:1.6mm;height:1.6mm;
      border-radius:50%;background:var(--accent)}
.spec{background:var(--tint);border-radius:2mm;padding:5mm;align-self:start}
.spec .lbl{display:block;margin-bottom:3.4mm}
.spec dl{display:grid;grid-template-columns:1fr auto;gap:0 3mm}
.spec dt{font-size:8.4pt;color:var(--ink-3);padding:1.6mm 0;border-bottom:1px solid var(--hair)}
.spec dd{font-family:var(--mono);font-size:8.4pt;font-weight:500;text-align:right;
      padding:1.6mm 0;border-bottom:1px solid var(--hair);white-space:nowrap}
.spec dd.t{font-family:'Onest',sans-serif;font-size:8.8pt;font-weight:500}
.spec dl>:nth-last-child(1),.spec dl>:nth-last-child(2){border-bottom:0}
.spec .hl{color:var(--accent-ink)}

/* профиль выплаты */
.scen{margin-bottom:5mm}
.scen-top{display:flex;align-items:baseline;justify-content:space-between;gap:6mm;margin-bottom:3mm}
.scen-top .be{font-family:var(--mono);font-size:8pt;color:var(--ink-3);text-align:right}
.scen-top .be b{color:var(--ink);font-weight:500}
.scen-grid{display:grid;grid-template-columns:96mm 1fr;gap:8mm;align-items:center}
.chart{background:var(--tint);border-radius:2mm;padding:4.5mm 5mm}
.chart svg{width:100%;height:auto;display:block}
.scen-note{font-size:8.6pt;line-height:1.55;color:var(--ink-2);margin:0}

/* две карточки */
.cards{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:auto;padding-bottom:5mm}
.card{border:1px solid var(--hair);border-radius:2mm;padding:4.6mm}
.card.risk{border-left:2.2mm solid #E0705A}
.card .lbl{display:block;margin-bottom:2.4mm;color:var(--accent-ink)}
.card.risk .lbl{color:#B4402F}
.card p{font-size:8.8pt;line-height:1.52;color:var(--ink-2)}

/* правовая страница */
.legal{padding:10mm 16mm 0;flex:1;display:flex;flex-direction:column}
.legal p{font-size:9pt;line-height:1.62;max-width:162mm}
.legal .band{margin-top:auto;margin-bottom:8mm;background:var(--tint);border-radius:2mm;padding:6mm;
     display:grid;grid-template-columns:1fr auto;gap:8mm;align-items:center}
.legal .band h3{font-size:11pt;margin-bottom:1.6mm}
.legal .band p{font-size:8.6pt}
.legal .band .qr{background:#fff}
.legal .band .qr-cap{color:var(--ink-3)}
"""

# ══════════════════════════════════════════════════════════════════════════════
#  ОБЩИЕ ЭЛЕМЕНТЫ
# ══════════════════════════════════════════════════════════════════════════════
ARROW = ('<svg class="motif" viewBox="0 0 72 71" xmlns="http://www.w3.org/2000/svg"><path d="M6.47949 '
         '7.05467e-06 6.47949 15.415 44.6846 15.415 3.75889e-06 60.0986 10.9004 70.999 55.6426 26.2568 '
         '55.6426 64.5771 71.0576 64.5771 71.0576 4.23187e-06 6.47949 7.05467e-06Z"/></svg>')
LOGO = '<img src="media/logo-rumberg-white.png" alt="Rumberg">'
DISC = ("Только для квалифицированных инвесторов. Материал носит информационный характер, "
        "не является индивидуальной инвестиционной рекомендацией и не является офертой. "
        "Котировки индикативны.")

NUMERIC = re.compile(r"^[\d\s.,%₽·×+\-–—≥&;a-z]+$")   # чисто числовое значение -> моношрифт

def foot(pg, qr, label):
    return T("""
  <div class="foot">
    <div class="pg">$pg</div>
    <div class="disc">$disc</div>
    <div class="lnk"><div class="t">$label<b>invest.rumberg.ru</b></div>
      <div class="qr">$qr</div></div>
  </div>""", pg="%02d" % pg, disc=DISC, label=label, qr=qr)

def spec_block(title, rows):
    """Моношрифт держим для цифр; словесные значения — Onest-ом (в мономе «ОФЗ» = «0Ф3»)."""
    dl = ""
    for k, v, hl in rows:
        cls = [] if NUMERIC.match(str(v)) else ["t"]
        if hl: cls.append("hl")
        dl += '<dt>%s</dt><dd%s>%s</dd>' % (k, ' class="%s"' % " ".join(cls) if cls else "", v)
    return T('<div class="spec"><span class="lbl">$t</span><dl>$dl</dl></div>', t=title, dl=dl)

def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            if s is not None else "")

# ── профиль выплаты по типу payoff (светлая палитра для печати) ───────────────
CURVE, AX, LAB, INK = "#EE7D1B", "#C3C6D6", "#5B6080", "#101231"
_W, _H, _PAD = 300.0, 130.0, 16.0
def _x(t): return _PAD + t * (_W - 2 * _PAD)
def _y(t): return _PAD + t * (_H - 2 * _PAD)
def _num(v): return str(v).replace(".", ",")

def _txt(x, y, s, anchor="start", fill=LAB, size="10.5"):
    return ('<text x="%.1f" y="%.1f" text-anchor="%s" fill="%s" font-size="%s" '
            'font-family="JetBrains Mono, monospace">%s</text>' % (x, y, anchor, fill, size, s))
def _line(d, w="2.5"):
    return ('<path d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-linejoin="round" '
            'stroke-linecap="round"/>' % (d, CURVE, w))
def _base(y, label):
    return ('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1" '
            'stroke-dasharray="2 4"/>' % (_PAD, y, _W - _PAD, y, AX)) + _txt(_PAD, y + 14, label)
def _diamond(x, y):
    return ('<rect x="%.1f" y="%.1f" width="7" height="7" transform="rotate(45 %.1f %.1f)" '
            'fill="%s"/>' % (x - 3.5, y - 3.5, x, y, CURVE))

def payoff_svg(p):
    p = p or {}
    t = p.get("type", "")
    e = ""
    if t == "callcap":
        e = (_base(_y(.15), "потолок") +
             _line("M%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f" %
                   (_x(0), _y(.85), _x(.38), _y(.85), _x(.74), _y(.15), _x(1), _y(.15))) +
             _diamond(_x(.74), _y(.15)) +
             _txt(_W - _PAD, _y(.15) - 8, "макс. +%s%%" % p.get("capPct", ""), "end") +
             (_txt(_x(.19), _y(.85) + 14, "премия %s%%" % _num(p["premiumPct"]), "middle") if p.get("premiumPct") is not None else ""))
    elif t == "call":
        e = (_line("M%.1f %.1f L%.1f %.1f L%.1f %.1f" %
                   (_x(0), _y(.85), _x(.38), _y(.85), _x(.97), _y(.14))) +
             _txt(_W - _PAD, _y(.14) + 2, "рост без потолка", "end") +
             (_txt(_x(.19), _y(.85) + 14, "премия %s%%" % _num(p["premiumPct"]), "middle") if p.get("premiumPct") is not None else ""))
    elif t == "digital":
        base, up, bx = _y(.62), _y(.18), _x(.56)
        e = (_base(base, "номинал 100%") +
             _line("M%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f" % (_PAD, base, bx, base, bx, up, _W - _PAD, up)) +
             _diamond(bx, up) +
             _txt(_W - _PAD, up - 8, ("барьер +%s%% → " % p["barrierPct"] if p.get("barrierPct") else "") +
                  "купон %s%%" % p.get("couponPct", ""), "end"))
    elif t == "protected":
        floor, up, bx = _y(.6), _y(.18), _x(.5)
        e = (_base(floor, "защита %s%%" % p.get("floorPct", 100)) +
             _line("M%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f" % (_PAD, floor, bx, floor, _x(.86), up, _W - _PAD, up)) +
             (_txt(_W - _PAD, up - 8, "участие до +%s%%" % p["capPct"], "end") if p.get("capPct") else
              _txt(_W - _PAD, up - 8, "участие в росте", "end")))
    elif t == "booster":
        zero, cap, x0, xc = _y(.58), _y(.16), _x(.42), _x(.7)
        e = (_base(zero, "номинал 100%") +
             _line("M%.1f %.1f L%.1f %.1f L%.1f %.1f L%.1f %.1f" % (_PAD, _y(.95), x0, zero, xc, cap, _W - _PAD, cap)) +
             _diamond(xc, cap) +
             _txt(_W - _PAD, cap - 8, "макс. +%s%%" % p.get("capPct", ""), "end") +
             (_txt(_x(.55), _y(.44), "×%s%%" % p["kuPct"], "start") if p.get("kuPct") else "") +
             _txt(_PAD, _y(.95) + 13, "падение 1:1"))
    elif t == "fixed":
        inY, outY, mid = _y(.72), _y(.2), _x(.52)
        e = ('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1" stroke-dasharray="2 4"/>' %
             (_PAD, inY, _W - _PAD, inY, AX) + _txt(_PAD, inY + 14, "вход %s%%" % p.get("entryPct", "")) +
             '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="2.5" stroke-linecap="round"/>' %
             (_PAD, outY, _W - _PAD, outY, CURVE) + _txt(_W - _PAD, outY - 8, "погашение 100%", "end") +
             '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1.6" stroke-dasharray="3 3"/>' %
             (mid, inY - 4, mid, outY + 6, CURVE) +
             '<path d="M%.1f %.1f L%.1f %.1f L%.1f %.1f" fill="none" stroke="%s" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>' %
             (mid - 4.5, outY + 11, mid, outY + 4, mid + 4.5, outY + 11, CURVE) +
             _txt(mid + 10, (inY + outY) / 2 + 4, "+%s%%" % p.get("gainPct", ""), "start", INK, "11.5"))
    else:
        e = (_line("M%.1f %.1f C%.1f %.1f %.1f %.1f %.1f %.1f" %
                   (_PAD, _y(.8), _x(.35), _y(.72), _x(.6), _y(.42), _W - _PAD, _y(.2))) +
             _txt(_W - _PAD, _y(.2) - 8, "стоимость портфеля", "end"))
    return '<svg viewBox="0 0 300 130" width="100%%" xmlns="http://www.w3.org/2000/svg">%s</svg>' % e

# ── риск: явное поле идеи или запасной текст по семейству ─────────────────────
def risk_of(idea):
    if idea.get("risk"):
        return esc(idea["risk"])
    fam = idea.get("family")
    prot = "100" in ((idea.get("p") or {}).get("protection") or "")
    if fam == "warrant":
        return ("Риск ограничен премией: если базовый актив не вырос к погашению, премия "
                "теряется полностью, вложенные средства не возвращаются.")
    if fam == "booster":
        return ("Защиты капитала нет: при снижении базового актива убыток начисляется один к одному. "
                "Сверху доход ограничен потолком. Дополнительно — кредитный риск эмитента облигации.")
    if fam == "coupon":
        return ("Капитал защищён на 100% — при любом сценарии возвращается номинал. Основной риск — "
                "кредитное качество эмитента облигации." if prot else
                "Если базовый актив снизится, выплата номинала уменьшается пропорционально падению. "
                "Дополнительно — кредитный риск эмитента облигации.")
    if fam == "discount":
        return ("Рыночного риска по базовому активу нет — выплата не зависит от котировок. Остаётся "
                "кредитный риск эмитента и риск ликвидности при досрочном выходе.")
    if fam == "protection":
        floor = (idea.get("payoff") or {}).get("floorPct") or (idea.get("p") or {}).get("protection") or "100"
        return ("Защита капитала %s: при падении возвращается защищённая часть номинала. Основной риск — "
                "кредитное качество эмитента облигации." % (str(floor) + "%" if "%" not in str(floor) else str(floor)))
    return "Стоимость портфеля колеблется вместе с рынком облигаций — итоговый доход не гарантирован."

def cap_first(s):
    s = str(s or "").strip()
    return s[:1].upper() + s[1:] if s else s

def param_rows(idea):
    p = idea.get("p") or {}
    m = idea.get("metric") or {}
    rows = []
    if m.get("v"):
        rows.append((cap_first(m.get("k", "Ключевая цифра")), esc(m["v"]), 1))
    rows.append(("Срок", esc(idea.get("tenor", "—")), 0))
    rows.append(("Базовый актив", esc(p.get("asset") or idea.get("underlying", "—")), 0))
    if p.get("price"):
        rows.append(("Цена входа", esc(p["price"]), 0))
    rows.append(("Номинал", esc(p.get("nominal", "1 000 ₽")), 0))
    rows.append(("Защита капитала", esc(p.get("protection", "нет")), 0))
    return rows[:6]

def logic_block(idea):
    situation = idea.get("situation")
    factors = idea.get("factors") or []
    conclusion = idea.get("conclusion")
    ps = ("<p>%s</p>" % esc(situation)) if situation else ""
    fs = ""
    if factors:
        fs = ('<div class="facts"><span class="lbl">Факторы</span><ul>%s</ul></div>'
              % "".join("<li>%s</li>" % esc(f) for f in factors))
    cc = ('<p class="concl">%s</p>' % esc(conclusion)) if conclusion else ""
    return '<div><h3>Рыночная ситуация</h3>%s%s%s</div>' % (ps, fs, cc)

# ══════════════════════════════════════════════════════════════════════════════
#  СТРАНИЦЫ
# ══════════════════════════════════════════════════════════════════════════════
def page_idea(idea, pg):
    fam = FAM_BADGE.get(idea.get("family"), esc(idea.get("kind", "")))
    m = idea.get("metric") or {}
    metric_line = ("<b>%s</b> · %s" % (esc(m.get("v", "")), esc(m.get("k", "")))) if m.get("v") else ""
    payout = esc(idea.get("payout", ""))
    if idea.get("fx"):
        payout += " Базовый актив в валюте — пример расчёта приведён без учёта изменения курса."
    body = T("""
    <div class="cols">$left$spec</div>
    <div class="scen">
      <div class="scen-top"><span class="lbl">Профиль выплаты</span><span class="be">$metric</span></div>
      <div class="scen-grid">
        <div class="chart">$svg</div>
        <p class="scen-note">$payout</p>
      </div>
    </div>
    <div class="cards">
      <div class="card"><span class="lbl">Как заработать</span><p>$how</p></div>
      <div class="card risk"><span class="lbl">Риск</span><p>$risk</p></div>
    </div>""", left=logic_block(idea), spec=spec_block("Параметры выпуска", param_rows(idea)),
             metric=metric_line, svg=payoff_svg(idea.get("payoff")), payout=payout,
             how=esc(idea.get("how", "")), risk=risk_of(idea))
    qr = qr_svg("%s/digest?view=client#%s/%s" % (SITE, ISSUE_ID, idea.get("id", "")))
    return T("""
<section class="sheet">
  <div class="head"><div><span class="fam">$fam</span><h1>$title</h1></div>$logo</div>
  <div class="body">
    <div class="hypo"><span class="lbl">Гипотеза</span><h2>$hypo</h2></div>$body
  </div>$foot
</section>""", fam=fam, title=esc(idea.get("name", "")), logo=LOGO, hypo=esc(idea.get("hypothesis", "")),
             body=body, foot=foot(pg, qr, "Идея на сайте:<br>смотреть онлайн"))

def cover():
    rows = ""
    for idx, idea in enumerate(ORDERED):
        rows += T('<div class="toc-row"><div class="fam">$f</div><div class="idea">$i</div>'
                  '<div class="pg">$p</div></div>',
                  f=FAM_TOC.get(idea.get("family"), ""), i=esc(idea.get("name", "")), p="%02d" % (idx + 2))
    return T("""
<section class="sheet cover">$arrow
  <div class="cov-top">$logo
    <div class="lbl">Структурные продукты<br>для квалифицированных инвесторов</div></div>
  <div class="cov-mid">
    <div class="issue">Выпуск от $date</div>
    <div class="cov-word">ДАЙДЖЕСТ<span>.</span></div>
    <div class="cov-sub">Идеи недели: по каждой — гипотеза, механика выплаты и полные параметры
      выпуска. Наведите камеру на QR, чтобы открыть идею на сайте.</div>
  </div>
  <div class="toc">$rows</div>
  <div class="cov-foot"><div class="disc">$disc</div>
    <div><div class="qr">$qr</div><div class="qr-cap">Цифровая<br>версия</div></div></div>
</section>""", arrow=ARROW, logo=LOGO, date=DATE, rows=rows, disc=DISC,
             qr=qr_svg("%s/digest" % SITE))

def page_legal(pg):
    return T("""
<section class="sheet">
  <div class="head"><div><span class="fam">Правовая информация</span>
    <h1>Ограничение<br>ответственности</h1></div>$logo</div>
  <div class="legal">
    <p>Настоящий материал содержит информацию, предназначенную исключительно для квалифицированных
      инвесторов. Копирование, распространение, передача, пересылка настоящего материала или любой
      информации из него допускается только с предварительного письменного согласия
      ООО «Румберг Кэпитал».</p>
    <p>У читателя отсутствует обязанность получать статус квалифицированного инвестора при отсутствии
      у читателя потребности совершать действия, которые в соответствии с применимым законодательством,
      разъяснениями и рекомендациями Банка России могут совершаться только квалифицированными
      инвесторами. Решение получить статус квалифицированного инвестора должно быть принято читателем
      самостоятельно после ознакомления с правовыми последствиями признания инвестора квалифицированным
      инвестором. Подробности у вашего брокера.</p>
    <p>Материал не является индивидуальной инвестиционной рекомендацией, офертой или предложением
      совершить сделку. Приведённые котировки индикативны и не являются обязательством заключить договор
      на указанных условиях. Результаты инвестирования в прошлом не определяют доходов в будущем.</p>
    <div class="band">
      <div><h3>Все идеи выпуска — на витрине</h3>
        <p>Актуальные параметры, калькулятор результата и полные условия каждого выпуска.
          Витрина обновляется чаще, чем выходит дайджест.</p></div>
      <div><div class="qr">$qr</div><div class="qr-cap">invest<br>.rumberg.ru</div></div>
    </div>
  </div>$foot
</section>""", logo=LOGO, qr=qr_svg("%s/company" % SITE),
             foot=foot(pg, qr_svg("%s/digest" % SITE), "Цифровая версия<br>дайджеста"))

# ══════════════════════════════════════════════════════════════════════════════
#  СБОРКА
# ══════════════════════════════════════════════════════════════════════════════
BAR = T("""
<div class="bar"><div class="bar-in">
  <a class="back" href="digest.html">
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M12 7H2M6 3 2 7l4 4"
      stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    К дайджесту</a>
  <a class="act" href="$pdf" download>
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1v8M7 9 4 6M7 9l3-3"
      stroke="#0C0A08" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12h10"
      stroke="#0C0A08" stroke-width="1.6" stroke-linecap="round"/></svg>
    Скачать PDF</a>
  <button class="act ghost" type="button" onclick="window.print()">
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M4 5V1.5h6V5M4 10H2.5V5h9v5H10"
      stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 8h6v4.5H4z"
      stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
    Печать</button>
  <span class="ttl">Печатный выпуск · $date · $n стр.</span>
  <span class="hint">Кнопка «Печать» сохраняет свежую версию в PDF: выберите «Сохранить как PDF»,
    формат A4, поля «нет», включите печать фона. Файл обновляется автоматически при изменении дайджеста.</span>
</div></div>""", pdf=PDF, date=DATE, n=str(len(ORDERED) + 2))

PAGES = [cover()] + [page_idea(idea, idx + 2) for idx, idea in enumerate(ORDERED)]
PAGES.append(page_legal(len(ORDERED) + 2))

HTML = T("""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, follow">
<title>Дайджест $date — печатный выпуск</title>
<meta name="description" content="Печатный выпуск дайджеста: идеи недели с гипотезой, механикой выплаты и параметрами. Сохранение в PDF, A4.">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Rumberg">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="Дайджест $date — печатный выпуск">
<meta property="og:description" content="Идеи недели: гипотеза, механика выплаты и параметры каждого выпуска. A4, готово к печати и сохранению в PDF.">
<meta property="og:url" content="https://invest.rumberg.ru/digest-print.html">
<link rel="canonical" href="https://invest.rumberg.ru/digest-print.html">
<meta property="og:image" content="https://invest.rumberg.ru/og-cover.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Rumberg — структурные продукты">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0B0C10">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Rubik:wght@500;600;700&family=Onest:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>$css</style>
<script src="metrika.js?v=2"></script>
</head>
<body>$bar$pages</body>
</html>
""", date=DATE, css=CSS, bar=BAR, pages="".join(PAGES))

open(OUT, "w", encoding="utf-8", newline="\n").write(HTML)
print("готово: %s" % OUT)
print("выпуск: %s (%s) | идей: %d | листов: %d" % (ISSUE_ID, DATE, len(ORDERED), len(PAGES)))
print("PDF_OUT=%s" % PDF)   # стабильная строка для CI: workflow парсит её, чтобы знать путь PDF
for idx, idea in enumerate(ORDERED):
    print("   %02d  %-14s %-40s payoff=%s" % (idx + 2, idea.get("family"),
          idea.get("name", "")[:40], (idea.get("payoff") or {}).get("type")))
