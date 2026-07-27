# -*- coding: utf-8 -*-
"""Генератор печатного дайджеста: A4-страницы -> digest-print.html -> сохранение в PDF.

Параметры продуктов читаются из data/instruments.js и data/offerings.js, поэтому цифры
в дайджесте не могут расойтись с витриной. Каркас одинаков на всех листах: шапка 44 мм,
«Рыночная ситуация» 80,5 мм, блок сценариев 159,5 мм, подвал 277 мм.

Запуск: python make_digest.py   (нужен segno для QR: pip install segno)
Затем:  открыть digest-print.html -> «Скачать PDF» -> положить файл в docs/digest/
        и прописать pdf/pdfName у выпуска в data/digest.js."""
import re, json, os, sys, io
from string import Template

try:
    import segno
except ImportError:
    sys.exit("Нужен модуль segno для генерации QR: pip install segno")

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(ROOT, "digest-print.html")
DATE = "27 июля 2026"
PDF  = "docs/digest/rumberg-digest-2026-07-27.pdf"   # куда ведёт кнопка «Скачать PDF»

# QR ведут на короткие адреса витрины: меньше модулей — надёжнее скан с бумаги
QR_URLS = {
    "cover":   "https://invest.rumberg.ru/digest",
    "ofz":     "https://invest.rumberg.ru/p/W-OFZ238-C105-0728",
    "spy":     "https://invest.rumberg.ru/p/W-SPY-C100-0728",
    "lkoh":    "https://invest.rumberg.ru/p/B-LKOH-9M",
    "energy":  "https://invest.rumberg.ru/offerings",
    "board":   "https://invest.rumberg.ru/board",
    "veb":     "https://invest.rumberg.ru/p/D-VEB-5Y",
    "company": "https://invest.rumberg.ru/company",
}

def _qr(url):
    buf = io.BytesIO()
    segno.make(url, error="m").save(buf, kind="svg", border=1, dark="#101231", light=None,
                                    xmldecl=False, svgns=True, unit="", omitsize=True)
    return buf.getvalue().decode("utf-8").strip()

QR = {k: _qr(u) for k, u in QR_URLS.items()}

def load(fn, glob):
    t = open(os.path.join(ROOT, "data", fn), encoding="utf-8").read()
    return json.loads(re.search(r"window\.%s\s*=\s*(\{.*\})\s*;" % glob, t, re.S).group(1))

INSTR = {i["id"]: i for i in load("instruments.js", "SITE_DATA")["instruments"]}
OFFER = {o["id"]: o for o in load("offerings.js", "OFFERINGS")["items"]}

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
.cols{display:grid;grid-template-columns:1fr 66mm;gap:8mm;margin-bottom:7mm}
.cols h3{font-size:10pt;margin-bottom:2.6mm}
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

/* сценарии */
.scen{margin-bottom:5mm;margin-top:auto}
.scen-top{display:flex;align-items:baseline;justify-content:space-between;gap:6mm;margin-bottom:3mm}
.scen-top .be{font-family:var(--mono);font-size:8pt;color:var(--ink-3);text-align:right}
.scen-top .be b{color:var(--ink);font-weight:500}
.scen-grid{display:grid;grid-template-columns:1fr 92mm;gap:7mm;align-items:start}
table.lad{width:100%;border-collapse:collapse}
table.lad th{font-family:var(--mono);font-size:7.4pt;font-weight:500;letter-spacing:.1em;
      text-transform:uppercase;color:var(--ink-3);text-align:left;padding:0 0 2mm;
      border-bottom:1px solid var(--ink)}
table.lad th:nth-child(2),table.lad th:nth-child(3){text-align:right}
table.lad td{padding:2.1mm 0;border-bottom:1px solid var(--hair);font-size:9pt;vertical-align:middle}
table.lad tr:last-child td{border-bottom:0}
table.lad .s{font-family:var(--mono);font-weight:500}
table.lad .pay{font-family:var(--mono);text-align:right;color:var(--ink-3)}
table.lad .res{font-family:var(--mono);font-weight:500;text-align:right;font-size:10.5pt;white-space:nowrap}
table.lad .note{font-size:7.8pt;color:var(--ink-3);padding-left:3mm;font-family:'Onest',sans-serif}
.res.up{color:var(--up)} .res.dn{color:var(--down)} .res.ev{color:var(--ink)}
tr.be-row td{background:var(--tint)}
.chart{background:var(--tint);border-radius:2mm;padding:3.5mm 3.5mm 2.5mm}
.chart svg{width:100%;height:auto;display:block}
.chart .cap{font-family:var(--mono);font-size:7.2pt;letter-spacing:.05em;color:var(--ink-3);
      margin-top:2mm;display:flex;justify-content:space-between;gap:3mm}
.scen-note{font-size:7.6pt;line-height:1.45;color:var(--ink-3);margin-top:2.5mm}

/* две карточки */
.cards{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:auto;padding-bottom:5mm}
.card{border:1px solid var(--hair);border-radius:2mm;padding:4.6mm}
.card .lbl{display:block;margin-bottom:2.4mm;color:var(--accent-ink)}
.card h3{font-size:9.6pt;margin-bottom:2mm}
.card p{font-size:8.6pt;line-height:1.5}

/* корзина (страница защиты) */
.basket{margin-top:auto;padding-bottom:6mm}
.basket .lbl{display:block;margin-bottom:3mm}
.bk-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 10mm}
.bk{display:grid;grid-template-columns:9mm 1fr auto;gap:3mm;align-items:baseline;
     padding:1.7mm 0;border-bottom:1px solid var(--hair)}
.bk .w{font-family:var(--mono);font-size:9pt;font-weight:500;color:var(--accent-ink);text-align:right}
.bk .nm{font-size:8.6pt;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bk .nm i{font-family:var(--mono);font-size:7pt;font-style:normal;color:var(--ink-3);margin-left:2mm}
.bk .sec{font-family:var(--mono);font-size:7pt;letter-spacing:.06em;text-transform:uppercase;
     color:var(--ink-3);white-space:nowrap}

/* фиксированный результат (дисконтная облигация) */
.fixed{margin-bottom:6mm;margin-top:auto}
.fx-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6mm;margin-bottom:5mm}
.fx{background:var(--tint);border-radius:2mm;padding:5mm}
.fx.acc{background:var(--ink);color:#fff}
.fx .k{font-family:var(--mono);font-size:7.2pt;letter-spacing:.12em;text-transform:uppercase;
     color:var(--ink-3);margin-bottom:2.4mm}
.fx.acc .k{color:rgba(255,255,255,.6)}
.fx .v{font-family:var(--mono);font-size:22pt;font-weight:500;line-height:1;letter-spacing:-.02em}
.fx.acc .v{color:var(--accent)}
.fx .u{font-size:8.2pt;color:var(--ink-3);margin-top:2mm;line-height:1.4}
.fx.acc .u{color:rgba(255,255,255,.66)}
.flow{display:grid;grid-template-columns:1fr auto 1fr;gap:5mm;align-items:end;
     background:var(--tint);border-radius:2mm;padding:5mm;margin-bottom:5mm}
.flow .bar{height:11mm;border-radius:1mm;display:flex;align-items:center;padding:0 3mm;
     font-family:var(--mono);font-size:9pt;font-weight:500}
.flow .b1{background:var(--accent);color:#0C0A08;width:54%}
.flow .b2{background:var(--ink);color:#fff}
.flow .ar{color:var(--ink-3);height:11mm;display:flex;align-items:center}
.flow .cap{font-family:var(--mono);font-size:7.2pt;letter-spacing:.1em;text-transform:uppercase;
     color:var(--ink-3);margin-bottom:2mm}

/* источники дохода (портфель) */
.drivers{margin-bottom:6mm;margin-top:auto}
.dr-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5mm}
.dr{border-top:2px solid var(--accent);padding-top:3mm}
.dr .n{font-family:var(--mono);font-size:7.2pt;color:var(--accent-ink);margin-bottom:2mm}
.dr h3{font-size:9.4pt;margin-bottom:1.6mm;line-height:1.25}
.dr p{font-size:8.2pt;line-height:1.45}

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

def fmt(v):
    """Результат в проценты со знаком: -100 -> «−100%», 0 -> «0%», 64.4 -> «+64%»."""
    s = ("%+d" % round(v)) if round(v) != 0 else "0"
    return s.replace("-", "−") + "%"

def pct(v):
    """Уровень актива: 118.25 -> «118,25%»."""
    return ("%.2f" % v).rstrip("0").rstrip(".").replace(".", ",") + "%"

def foot(pg, qr_key, label):
    return T("""
  <div class="foot">
    <div class="pg">$pg</div>
    <div class="disc">$disc</div>
    <div class="lnk"><div class="t">$label<b>invest.rumberg.ru</b></div>
      <div class="qr">$qr</div></div>
  </div>""", pg="%02d" % pg, disc=DISC, label=label, qr=QR[qr_key])

NUMERIC = re.compile(r"^[\d\s.,%₽·×+\-–—≥&;a-z]+$")   # чисто числовое значение -> моношрифт

def spec_block(title, rows):
    """Моношрифт держим для цифр; словесные значения ставим Onest-ом — в мономе
       «ОФЗ 26238» рядом с цифрами читается как «0Ф3 26238»."""
    dl = ""
    for k, v, hl in rows:
        cls = [] if NUMERIC.match(str(v)) else ["t"]
        if hl: cls.append("hl")
        dl += '<dt>%s</dt><dd%s>%s</dd>' % (k, ' class="%s"' % " ".join(cls) if cls else "", v)
    return T('<div class="spec"><span class="lbl">$t</span><dl>$dl</dl></div>', t=title, dl=dl)

def market_block(paras, factors_label, factors):
    ps = "".join("<p>%s</p>" % p for p in paras)
    fs = ""
    if factors:
        fs = T('<div class="facts"><span class="lbl">$l</span><ul>$li</ul></div>',
               l=factors_label, li="".join("<li>%s</li>" % f for f in factors))
    return T('<div><h3>Рыночная ситуация</h3>$ps$fs</div>', ps=ps, fs=fs)

def cards_block(items):
    cs = "".join(T('<div class="card"><span class="lbl">$l</span><h3>$h</h3><p>$p</p></div>',
                   l=l, h=h, p=p) for l, h, p in items)
    return T('<div class="cards">$cs</div>', cs=cs)

def head_row(label, note):
    return T('<div class="scen-top"><span class="lbl">$l</span><span class="be">$n</span></div>',
             l=label, n=note)

# ── лестница сценариев + график ───────────────────────────────────────────────
def ladder_block(head, rows, be_note, chart, cap, note=""):
    tr = []
    for r in rows:
        res = r["res"]
        cls = "up" if res > 0 else ("dn" if res < 0 else "ev")
        tr.append(T('<tr$be><td class="s">$s<span class="note">$n</span></td>'
                    '<td class="pay">$p</td><td class="res $c">$r</td></tr>',
                    be=' class="be-row"' if res == 0 else "", s=r["s"], n=r.get("note", ""),
                    p=r["pay"], c=cls, r=fmt(res)))
    return T("""
    <div class="scen">$top
      <div class="scen-grid">
        <table class="lad"><tr><th>$h1</th><th>$h2</th><th>$h3</th></tr>$tr</table>
        <div class="chart">$chart<div class="cap">$cap</div></div>
      </div>$note
    </div>""", top=head_row("Возможные сценарии", be_note), h1=head[0], h2=head[1], h3=head[2],
             tr="".join(tr), chart=chart, cap=cap,
             note=('<p class="scen-note">%s</p>' % note) if note else "")

def chart_svg(pts, xr, yr, marks, be=None):
    """Профиль результата на вложенные: pts = [(x, res)] в единицах осей."""
    W, H, PB = 320.0, 152.0, 14.0
    x = lambda v: (v - xr[0]) * (W / (xr[1] - xr[0]))
    y = lambda v: (H - PB) - (v - yr[0]) * ((H - PB - 8) / (yr[1] - yr[0]))
    line = "M " + " L ".join("%.1f %.1f" % (x(a), y(b)) for a, b in pts)
    area = line + " L %.1f %.1f L %.1f %.1f Z" % (x(pts[-1][0]), y(0), x(pts[0][0]), y(0))
    vl = "".join('<line x1="%.1f" y1="6" x2="%.1f" y2="%.1f" stroke="#C3C6D6" stroke-width="1"/>'
                 '<text x="%.1f" y="%.1f" font-family="JetBrains Mono" font-size="10" fill="#5B6080" '
                 'text-anchor="middle">%s</text>'
                 % (x(m["x"]), x(m["x"]), H - PB, x(m["x"]), H - 3, m["label"]) for m in marks)
    dot = ""
    if be is not None:
        dot = ('<circle cx="%.1f" cy="%.1f" r="3.4" fill="#fff" stroke="#101231" stroke-width="1.8"/>'
               '<text x="%.1f" y="%.1f" font-family="JetBrains Mono" font-size="10" fill="#101231" '
               'text-anchor="middle">%s</text>' % (x(be["x"]), y(0), x(be["x"]), y(0) - 5, be["label"]))
    return T("""<svg viewBox="0 0 320 152" xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="$z" x2="320" y2="$z" stroke="#C3C6D6" stroke-width="1" stroke-dasharray="3 2"/>
      $vl<path d="$area" fill="#EE7D1B" fill-opacity=".13"/>
      <path d="$line" fill="none" stroke="#EE7D1B" stroke-width="2.4" stroke-linejoin="round"
            stroke-linecap="round"/>$dot</svg>""",
             z="%.1f" % y(0), vl=vl, area=area, line=line, dot=dot)

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
  <span class="ttl">Печатный выпуск · $date · 9 страниц</span>
  <span class="hint">Кнопка «Печать» позволяет сохранить свежую версию в PDF: выберите
    «Сохранить как PDF», формат A4, поля «нет», включите печать фона.</span>
</div></div>""", pdf=PDF, date=DATE)

def page(pg, fam, title, hypo, mid, tail, qr_key, foot_label="Цифровая версия<br>страницы"):
    return T("""
<section class="sheet">
  <div class="head"><div><span class="fam">$fam</span><h1>$title</h1></div>$logo</div>
  <div class="body">
    <div class="hypo"><span class="lbl">Гипотеза</span><h2>$hypo</h2></div>
    $mid$tail
  </div>$foot
</section>""", fam=fam, title=title, logo=LOGO, hypo=hypo, mid=mid, tail=tail,
             foot=foot(pg, qr_key, foot_label))

# ══════════════════════════════════════════════════════════════════════════════
#  ОБЛОЖКА
# ══════════════════════════════════════════════════════════════════════════════
CONTENTS = [
    ("Варрант",  "На рост ОФЗ 26238 со страйком 105%", 3),
    ("Варрант",  "На рост американского рынка с рычагом", 4),
    ("Бустер",   "Двойное участие в росте акций «Лукойла»", 5),
    ("Купон",    "19% при сохранении или росте цены ОФЗ 26248", 6),
    ("Дисконт",  "Дисконтная облигация на ВЭБ.РФ, 5 лет — 85% дохода", 7),
    ("Защита",   "Корзина американских акций на энергетику для ИИ", 8),
    ("Портфель", "Портфель ОФЗ с реинвестированием купонов", 9),
]

def cover():
    rows = "".join(T('<div class="toc-row"><div class="fam">$f</div><div class="idea">$i</div>'
                     '<div class="pg">$p</div></div>', f=f, i=i, p=str(p)) for f, i, p in CONTENTS)
    return T("""
<section class="sheet cover">$arrow
  <div class="cov-top">$logo
    <div class="lbl">Структурные продукты<br>для квалифицированных инвесторов</div></div>
  <div class="cov-mid">
    <div class="issue">Выпуск от $date</div>
    <div class="cov-word">ДАЙДЖЕСТ<span>.</span></div>
    <div class="cov-sub">Семь идей недели: гипотеза, механика выплаты и полные параметры
      каждого выпуска — в одном документе.</div>
  </div>
  <div class="toc">$rows</div>
  <div class="cov-foot"><div class="disc">$disc</div>
    <div><div class="qr">$qr</div><div class="qr-cap">Цифровая<br>версия</div></div></div>
</section>""", arrow=ARROW, logo=LOGO, date=DATE, rows=rows, disc=DISC, qr=QR["cover"])

# ══════════════════════════════════════════════════════════════════════════════
#  СТР. 3 — ВАРРАНТ НА ОФЗ 26238
# ══════════════════════════════════════════════════════════════════════════════
def page_ofz():
    w = INSTR["W-OFZ238-C105-0728"]
    K, P = w["strike"], w["quote"]
    BE = K + P
    rows = []
    for s in (K, K + 5, BE, BE + 5, BE + 10):
        pay = max(s - K, 0); res = pay / P * 100 - 100
        rows.append(dict(s=("&le; %d%%" % s) if pay == 0 else "%d%%" % s, pay="%d%%" % pay, res=res,
                         note="премия сгорает" if pay == 0 else "безубыток" if res == 0
                              else "частичный возврат" if res < 0 else ""))
    ch = chart_svg([(95, -100), (K, -100), (130, (130 - K) / P * 100 - 100)],
                   (95, 130), (-112, 165), [dict(x=K, label="страйк %d%%" % K)],
                   be=dict(x=BE, label="безубыток %d%%" % BE))
    mid = market_block(
        ["Цены по государственным облигациям находятся на уровне осени 2024 года. "
         "Консолидированный прогноз — снижение ключевой ставки до 12,2% к 2027 году."],
        "Факторы движения доходности",
        ["ключевая ставка и ожидания её изменения;",
         "предложение Минфина и объёмы размещений;",
         "спрос со стороны банков, НПФ и частных инвесторов;",
         "макроэкономика: цена нефти, динамика курса рубля."])
    sp = spec_block("Параметры выпуска", [
        ("Срок", w["tenor"], 0), ("Базовый актив", "ОФЗ 26238", 0), ("Страйк", "%d%%" % K, 0),
        ("Номинал", "1 000 ₽", 0), ("Цена бумаги", "%d ₽ · %d%%" % (P * 10, P), 0),
        ("Безубыток", "%d%%" % BE, 1)])
    lad = ladder_block(("ОФЗ 26238", "выплата", "результат"), rows,
                       "риск ограничен премией — <b>%d%% номинала</b>" % P, ch,
                       "<span>ОФЗ 95%</span><span>результат на вложенные</span><span>130%</span>")
    return page(3, "Варрант", "Варрант на ОФЗ 26238<br>со страйком %d%%" % K,
                "Цена ОФЗ 26238 вблизи исторического минимума",
                T('<div class="cols">$m$s</div>$l', m=mid, s=sp, l=lad),
                cards_block([
                    ("Как заработать", "Рычаг без маржин-коллов",
                     "Инвестор оплачивает только часть номинала и получает участие в росте ОФЗ "
                     "на весь номинал. Требований пополнить обеспечение не возникает."),
                    ("Структура выплаты", "Выплата = рост актива от номинала",
                     "Выплачивается рост базового актива выше страйка, рассчитанный от номинала. "
                     "Вложенные средства не возвращаются.")]), "ofz")

# ══════════════════════════════════════════════════════════════════════════════
#  СТР. 4 — ВАРРАНТ НА SPY
# ══════════════════════════════════════════════════════════════════════════════
def page_spy():
    w = INSTR["W-SPY-C100-0728"]
    K, P = w["strike"], w["quote"]
    BE = K + P
    rows = []
    for s in (K, 110, BE, 130, 150):
        pay = max(s - K, 0); res = pay / P * 100 - 100
        rows.append(dict(s=("&le; %d%%" % s) if pay == 0 else pct(s), pay=pct(pay), res=res,
                         note="премия сгорает" if pay == 0 else "безубыток" if abs(res) < .01
                              else "частичный возврат" if res < 0 else ""))
    ch = chart_svg([(90, -100), (K, -100), (150, (150 - K) / P * 100 - 100)],
                   (90, 150), (-112, 190), [dict(x=K, label="страйк %d%%" % K)],
                   be=dict(x=BE, label="безубыток 118%"))
    mid = market_block(
        ["Американский рынок продолжает обновлять исторические максимумы. Несмотря на высокий "
         "уровень индекса S&amp;P 500, дальнейший рост экономики и приток капитала в акции "
         "могут поддержать восходящий тренд."],
        "Факторы роста индекса SPY",
        ["снижение ключевой ставки ФРС;",
         "сохранение высоких темпов инвестиций в ИИ и технологии;",
         "устойчивый рост экономики США;",
         "приток капитала в американские акции."])
    sp = spec_block("Параметры выпуска", [
        ("Срок", w["tenor"], 0), ("Базовый актив", "SPY", 0), ("Страйк", "%d%%" % K, 0),
        ("Номинал", "1 000 ₽", 0), ("Цена бумаги", "182,5 ₽ · 18,25%", 0),
        ("Безубыток", "118,25%", 1)])
    lad = ladder_block(("SPY", "выплата", "результат"), rows,
                       "риск ограничен премией — <b>18,25% номинала</b>", ch,
                       "<span>SPY 90%</span><span>результат на вложенные</span><span>150%</span>",
                       note="Актив котируется в долларах: валютная экспозиция распространяется на весь номинал.")
    return page(4, "Варрант", "Варрант на рост<br>американского рынка",
                "Рост американского рынка продолжится",
                T('<div class="cols">$m$s</div>$l', m=mid, s=sp, l=lad),
                cards_block([
                    ("Как заработать", "Рычаг на индекс без маржин-коллов",
                     "Инвестор оплачивает часть номинала и получает участие в росте SPY на весь "
                     "номинал. Требований пополнить обеспечение не возникает."),
                    ("Структура выплаты", "Выплата = рост индекса от номинала",
                     "Выплачивается рост базового актива выше страйка, рассчитанный от номинала. "
                     "Вложенные средства не возвращаются.")]), "spy")

# ══════════════════════════════════════════════════════════════════════════════
#  СТР. 5 — БУСТЕР НА ЛУКОЙЛ
# ══════════════════════════════════════════════════════════════════════════════
def page_lkoh():
    b = INSTR["B-LKOH-9M"]
    K, K2, KU = b["strike"], b["strike2"], b["ku"]
    CAP = (K2 - K) * KU / 100
    rows = []
    for s in (80, 90, 100, 105, 110):
        res = (s - 100) if s < K else min((s - K) * KU / 100, CAP)
        rows.append(dict(s=("&ge; %d%%" % s) if s >= K2 else "%d%%" % s,
                         pay="%d%%" % (100 + res), res=res,
                         note="в размере падения" if s < K else "без потерь" if res == 0
                              else "максимум" if res == CAP else "участие ×%d%%" % KU))
    ch = chart_svg([(78, -22), (K, 0), (K2, CAP), (125, CAP)], (78, 125), (-26, 26),
                   [dict(x=K, label="100%"), dict(x=K2, label="барьер %d%%" % K2)],
                   be=dict(x=K, label="без потерь"))
    mid = market_block(
        ["Цена акции «Лукойл» находится на уровне осени 2022 года. На котировки продолжают давить "
         "геополитическая напряжённость, риск санкций и неопределённость вокруг экспорта нефти.",
         "<b>Вывод:</b> «Лукойл» способен восстановиться на 10–15% в ближайшие месяцы."],
        "Факторы движения доходности",
        ["ключевая ставка и ожидания её изменения;",
         "геополитика: деэскалация конфликтов на Ближнем Востоке и на Украине;",
         "макроэкономика: цена нефти, динамика курса рубля."])
    sp = spec_block("Параметры выпуска", [
        ("Срок", b["tenor"], 0), ("Базовый актив", "Лукойл", 0),
        ("Коэффициент участия", "%d%%" % KU, 0), ("Диапазон участия", "%d–%d%%" % (K, K2), 0),
        ("Барьер роста", "%d%%" % (K2 - K), 0), ("Максимум выплаты", fmt(CAP), 1)])
    lad = ladder_block(("Лукойл", "выплата", "результат"), rows,
                       "потолок роста — <b>%s за %s</b>" % (fmt(CAP), b["tenor"]), ch,
                       "<span>Лукойл 78%</span><span>результат на вложенные</span><span>125%</span>",
                       note="Ниже 100% выплата падает пропорционально акции — защиты капитала нет.")
    return page(5, "Бустер", "Бустер на акции<br>«Лукойла»",
                "Потенциал восстановления в ближайшие месяцы",
                T('<div class="cols">$m$s</div>$l', m=mid, s=sp, l=lad),
                cards_block([
                    ("Как заработать", "Удвоенный рост в диапазоне 100–110%",
                     "Рост внутри диапазона засчитывается с коэффициентом %d%%: подъём акции "
                     "на 10%% даёт %s к вложенным. Выше барьера выплата не растёт." % (KU, fmt(CAP))),
                    ("Структура выплаты", "Вверх с рычагом, вниз — как акция",
                     "При росте — усиленное участие в динамике, максимум %s. При снижении выплата "
                     "номинала уменьшается пропорционально падению." % fmt(CAP))]), "lkoh")

# ══════════════════════════════════════════════════════════════════════════════
#  СТР. 6 — ЗАЩИТА КАПИТАЛА, «ЭНЕРГЕТИКА БУДУЩЕГО»
# ══════════════════════════════════════════════════════════════════════════════
def page_energy():
    o = OFFER["energy-future"]
    FLOOR = int(o["chart"]["floor"])
    BE_G = 100 - FLOOR
    rows = []
    for g in (-30, 0, BE_G, 100):
        pay = FLOOR + max(g, 0); res = pay - 100
        rows.append(dict(s=("&le; %s" % fmt(g)) if g < 0 else fmt(g), pay="%d%%" % pay, res=res,
                         note="работает защита" if g <= 0 else "безубыток" if res == 0 else ""))
    ch = chart_svg([(-40, FLOOR - 100), (0, FLOOR - 100), (100, FLOOR)], (-40, 100), (-26, 90),
                   [dict(x=0, label="0%")], be=dict(x=BE_G, label="безубыток +20%"))
    mid = market_block(
        ["Искусственный интеллект — это прежде всего спрос на электроэнергию: по прогнозам, "
         "к 2030 году потребление дата-центров вырастет в разы. Идея даёт экспозицию на компании, "
         "которые этот рост обеспечивают."],
        "Что нужно знать о выпуске",
        ["биржевой выпуск, ISIN RU000A10BZ10 — покупается у любого брокера в стакане;",
         "приём заявок 12.08–31.08.2026;",
         "комиссий за управление и за успех нет;",
         "при погашении удерживаются транзакционные издержки 3% с ростовой части."])
    sp = spec_block("Параметры выпуска", [
        ("Срок", o["tenor"], 0), ("Базовый актив", "8 акций США", 0),
        ("Защита капитала", o["protection"], 1), ("Участие в росте", o["participation"], 0),
        ("Валюта актива", "USD", 0), ("Номинал", "1 000 ₽", 0)])
    lad = ladder_block(("Корзина", "выплата", "результат"), rows,
                       "максимальный убыток — <b>&minus;20%</b>, потолка роста нет", ch,
                       "<span>корзина &minus;40%</span><span>результат</span><span>+100%</span>",
                       note="Валютная переоценка применяется к ростовой части: ослабление доллара "
                            "к рублю её уменьшает. Верхнего предела по росту нет.")
    bk = "".join(T('<div class="bk"><div class="w">$w%</div><div class="nm">$n<i>$t</i></div>'
                   '<div class="sec">$s</div></div>', w=str(x["w"]), n=x["name"],
                   t=x["ticker"].split(": ")[-1],
                   s=x["sector"]) for x in o["basket"])
    tail = T('<div class="basket"><span class="lbl">Состав корзины</span>'
             '<div class="bk-grid">$bk</div></div>', bk=bk)
    return page(8, "Защита капитала", "Энергетика будущего",
                "Рост спроса на энергию для дата-центров",
                T('<div class="cols">$m$s</div>$l', m=mid, s=sp, l=lad), tail, "energy",
                foot_label="Выпуск в разделе<br>«На размещении»")

# ══════════════════════════════════════════════════════════════════════════════
#  СТР. 7 — КУПОН НА ОФЗ 26248
# ══════════════════════════════════════════════════════════════════════════════
def page_coupon():
    C = 19
    rows = []
    for s in (80, 90, 100, 110, 120):
        res = (s - 100) if s < 100 else C
        rows.append(dict(s="%d%%" % s, pay="%d%%" % (100 + res), res=res,
                         note="в размере падения" if s < 100 else
                              "купон выплачен" if s == 100 else ""))
    ch = chart_svg([(78, -22), (100, C), (122, C)], (78, 122), (-26, 26),
                   [dict(x=100, label="100%")])
    mid = market_block(
        ["Цены по государственным облигациям находятся на уровне осени 2024 года. "
         "Консолидированный прогноз — снижение ключевой ставки до 12,2% к 2027 году."],
        "Факторы движения доходности",
        ["ключевая ставка и ожидания её изменения;",
         "предложение Минфина и объёмы размещений;",
         "спрос со стороны банков, НПФ и частных инвесторов;",
         "макроэкономика: цена нефти, динамика курса рубля."])
    sp = spec_block("Параметры выпуска", [
        ("Срок", "12 месяцев", 0), ("Базовый актив", "ОФЗ 26248", 0),
        ("Купон", "%d%%" % C, 1), ("Условие купона", "ОФЗ &ge; 100%", 0),
        ("Номинал", "1 000 ₽", 0), ("Валюта", "рубли", 0)])
    lad = ladder_block(("ОФЗ 26248", "выплата", "результат"), rows,
                       "купон платится и при неизменной цене — <b>%d%%</b>" % C, ch,
                       "<span>ОФЗ 78%</span><span>результат на вложенные</span><span>122%</span>",
                       note="Ниже 100% купон не выплачивается, а выплата номинала уменьшается "
                            "пропорционально падению цены ОФЗ — защиты капитала нет.")
    return page(6, "Купон", "Купон на ОФЗ 26248",
                "ОФЗ подорожают на горизонте 12 месяцев",
                T('<div class="cols">$m$s</div>$l', m=mid, s=sp, l=lad),
                cards_block([
                    ("Как заработать", "Купон без требования роста",
                     "Структурная облигация выплачивает купон %d%% через 12 месяцев. Купон "
                     "выплачивается, даже если цена ОФЗ 26248 просто сохранится на уровне входа." % C),
                    ("Структура выплаты", "Купон при цене не ниже входа",
                     "При сохранении уровня или росте цены ОФЗ 26248 инвестор получает купон %d%%. "
                     "При снижении выплата номинала уменьшается пропорционально падению." % C)]),
                "board", foot_label="Все идеи<br>на витрине")

# ══════════════════════════════════════════════════════════════════════════════
#  СТР. 8 — ДИСКОНТНАЯ ОБЛИГАЦИЯ ВЭБ.РФ
# ══════════════════════════════════════════════════════════════════════════════
def page_veb():
    d = INSTR["D-VEB-5Y"]
    PR = d["quote"]
    GAIN = round((100 / PR - 1) * 100)
    mid = market_block(
        ["Облигации ВЭБ.РФ относятся к числу наиболее надёжных корпоративных инструментов "
         "российского рынка: государственная корпорация развития финансирует крупные "
         "инфраструктурные и промышленные проекты страны и опирается на поддержку государства.",
         "Дисконтная облигация — инструмент для сохранения капитала: покупка ниже номинала, "
         "погашение по 100%. Результат известен в день сделки."], "", [])
    sp = spec_block("Параметры выпуска", [
        ("Срок", d["tenor"], 0), ("Базовый актив", "долг ВЭБ.РФ", 0),
        ("Размещение", "%d%%" % PR, 0), ("Погашение", "100%", 0),
        ("Дата погашения", d["expiry"], 0), ("Доход", fmt(GAIN), 1)])
    fixed = T("""
    <div class="fixed">$top
      <div class="fx-grid">
        <div class="fx"><div class="k">Вход сегодня</div><div class="v">$pr%</div>
          <div class="u">$prub ₽ за бумагу номиналом 1&nbsp;000 ₽ · индикативно</div></div>
        <div class="fx"><div class="k">Погашение $exp</div><div class="v">100%</div>
          <div class="u">1&nbsp;000 ₽ за бумагу в дату погашения</div></div>
        <div class="fx acc"><div class="k">Доход к погашению</div><div class="v">$gain%</div>
          <div class="u">зафиксирован в день сделки, за весь срок — $tenor</div></div>
      </div>
      <p class="scen-note">Рыночного риска по базовому активу нет: выплата не зависит от котировок.
        Остаётся кредитный риск эмитента и структуры, а также риск ликвидности — при досрочном
        выходе цена определяется рынком и может быть ниже цены входа.</p>
    </div>""", top=head_row("Результат известен заранее",
                            "без зависимости от рынка — <b>при исполнении обязательств эмитентом</b>"),
             pr=str(PR), prub="%d" % (PR * 10), exp=d["expiry"], gain="+%d" % GAIN, tenor=d["tenor"])
    return page(7, "Дисконт", "Дисконтная облигация<br>на долг ВЭБ.РФ",
                "Надёжный эмитент с фиксированным результатом к погашению",
                T('<div class="cols">$m$s</div>$f', m=mid, s=sp, f=fixed),
                cards_block([
                    ("Как заработать", "Покупка ниже номинала",
                     "Структурная облигация на публичный долг ВЭБ.РФ: вход по %d%%, погашение "
                     "по 100%%. Доход формируется дисконтом и не требует роста рынка." % PR),
                    ("Структура выплаты", "100% номинала в дату погашения",
                     "В конце срока обращения выплачивается 100% номинала — 1&nbsp;000 ₽ на бумагу. "
                     "Промежуточных купонов нет.")]), "veb")

# ══════════════════════════════════════════════════════════════════════════════
#  СТР. 9 — ПОРТФЕЛЬ ДОЛГОСРОЧНЫХ ОФЗ
# ══════════════════════════════════════════════════════════════════════════════
def page_portfolio():
    mid = market_block(
        ["Высокий уровень ставок и возможность их последующего снижения формируют привлекательную "
         "точку входа в длинные государственные облигации. Консолидированный прогноз — снижение "
         "ключевой ставки до 12,2% к 2027 году.",
         "Комбинация текущей доходности и потенциала снижения ставок создаёт условия для "
         "опережающей доходности стратегии."], "", [])
    sp = spec_block("Параметры стратегии", [
        ("Срок", "3 года", 0), ("Базовый актив", "портфель ОФЗ", 0),
        ("Выплата", "цена портфеля", 0), ("Купоны", "реинвестируются", 1),
        ("Номинал", "1 000 ₽", 0), ("Валюта", "рубли", 0)])
    drv = [("01", "Текущая доходность",
            "Длинные ОФЗ куплены на высоком уровне ставок — купонный поток зафиксирован при входе."),
           ("02", "Переоценка при снижении ставок",
            "Чем длиннее выпуск, тем сильнее растёт его цена при снижении ключевой ставки."),
           ("03", "Реинвестирование купонов",
            "Купоны не выводятся, а вкладываются обратно в портфель и работают дальше."),
           ("04", "Режим налогообложения",
            "Доход формируется внутри структуры — налоговый режим эффективнее прямого владения.")]
    tiles = "".join(T('<div class="dr"><div class="n">$n</div><h3>$h</h3><p>$p</p></div>',
                      n=n, h=h, p=p) for n, h, p in drv)
    block = T("""
    <div class="drivers">$top
      <div class="dr-grid">$tiles</div>
      <p class="scen-note">Стратегия не содержит защиты капитала и гарантированной выплаты:
        результат равен стоимости портфеля на дату погашения и может оказаться ниже вложенной суммы,
        если ставки вырастут. Конкретные цифры доходности заранее не фиксируются.</p>
    </div>""", top=head_row("Из чего складывается доход", "четыре источника, а не один"), tiles=tiles)
    return page(9, "Портфель", "Портфель<br>долгосрочных ОФЗ",
                "Стабилизация ставок создаёт условия для повышенной доходности облигационных стратегий",
                T('<div class="cols">$m$s</div>$d', m=mid, s=sp, d=block),
                cards_block([
                    ("Как заработать", "Диверсифицированный набор ОФЗ",
                     "Добавляя стратегию на ОФЗ, инвестор получает диверсифицированный набор "
                     "государственных облигаций с автоматическим реинвестированием купонов."),
                    ("Структура выплаты", "Выплата = стоимость портфеля",
                     "Доход формируется за счёт изменения стоимости портфеля и реинвестирования "
                     "купонных выплат. Выплата равна стоимости портфеля на момент погашения.")]),
                "board", foot_label="Все идеи<br>на витрине")

# ══════════════════════════════════════════════════════════════════════════════
#  СТР. 10 — ОГРАНИЧЕНИЕ ОТВЕТСТВЕННОСТИ
# ══════════════════════════════════════════════════════════════════════════════
def page_legal():
    return T("""
<section class="sheet">
  <div class="head"><div><span class="fam">Правовая информация</span>
    <h1>Ограничение<br>ответственности</h1></div>$logo</div>
  <div class="legal">
    <p>Настоящий материал содержит информацию, предназначенную исключительно для квалифицированных
      инвесторов. Копирование, распространение, передача, пересылка настоящего материала или любой
      информации из него допускается только с предварительного письменного согласия
      ООО «Румберг Кэпитал».</p>
    <p>У читателя отсутствует обязанность получать статус квалифицированного инвестора при
      отсутствии у читателя потребности совершать действия, которые в соответствии с применимым
      законодательством, разъяснениями и рекомендациями Банка России могут совершаться только
      квалифицированными инвесторами. Решение получить статус квалифицированного инвестора должно
      быть принято читателем самостоятельно после ознакомления с правовыми последствиями признания
      инвестора квалифицированным инвестором. Подробности у вашего брокера.</p>
    <p>Материал не является индивидуальной инвестиционной рекомендацией, офертой или предложением
      совершить сделку. Приведённые котировки индикативны и не являются обязательством заключить
      договор на указанных условиях. Результаты инвестирования в прошлом не определяют доходов
      в будущем.</p>
    <div class="band">
      <div><h3>Все идеи выпуска — на витрине</h3>
        <p>Актуальные параметры, калькулятор результата и полные условия каждого выпуска.
          Витрина обновляется чаще, чем выходит дайджест.</p></div>
      <div><div class="qr">$qr</div><div class="qr-cap">invest<br>.rumberg.ru</div></div>
    </div>
  </div>$foot
</section>""", logo=LOGO, qr=QR["company"], foot=foot(10, "cover", "Цифровая версия<br>дайджеста"))

# ══════════════════════════════════════════════════════════════════════════════
PAGES = [cover(), page_ofz(), page_spy(), page_lkoh(), page_coupon(),
         page_veb(), page_energy(), page_portfolio(), page_legal()]

HTML = T("""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Дайджест $date — печатный выпуск</title>
<meta name="description" content="Печатный выпуск дайджеста: семь идей недели с гипотезой, механикой выплаты и параметрами. Сохранение в PDF, A4.">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Rumberg">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="Дайджест $date — печатный выпуск">
<meta property="og:description" content="Семь идей недели: гипотеза, механика выплаты и параметры каждого выпуска. A4, готово к печати и сохранению в PDF.">
<meta property="og:url" content="https://invest.rumberg.ru/digest-print.html">
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

os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w", encoding="utf-8", newline="\n").write(HTML)
print("готово: %s" % OUT)
print("страниц: %d | размер: %d КБ" % (len(PAGES), len(HTML) // 1024))
print("параметры взяты с витрины:")
for iid in ("W-OFZ238-C105-0728", "W-SPY-C100-0728", "B-LKOH-9M", "D-VEB-5Y"):
    i = INSTR[iid]
    print("   %-20s quote=%-7s strike=%-5s tenor=%s" % (iid, i["quote"], i.get("strike"), i["tenor"]))
o = OFFER["energy-future"]
print("   %-20s защита=%-6s участие=%-6s ISIN=%s" % (o["id"], o["protection"], o["participation"], o["isin"]))
