# -*- coding: utf-8 -*-
"""
Генерирует og/<id>.png — ПЕРСОНАЛЬНУЮ картинку превью (1200x630) под каждый продукт
доски и каждый выпуск «На размещении»: название, базовый актив, ключевые цифры и
схематичный график выплаты, построенный из параметров самого продукта.

Зачем: до этого все ссылки на продукты разворачивались одной общей обложкой
og-cover.png. Персональная картинка резко усиливает главный сценарий — сейлз
отправляет клиенту ссылку в мессенджер.

Как работает: поднимает локальный http.server, рендерит HTML-шаблон карточки
headless-Chrome'ом по одному разу на продукт, кладёт PNG в og/.

Запуск:  python make_og_products.py            (все продукты)
         python make_og_products.py D-VEB-3Y   (только указанные id — быстро)

ПОСЛЕ прогона обязательно: python make_product_pages.py
(он проставит og:image на og/<id>.png тем продуктам, у кого картинка появилась).
"""
import json, os, re, sys, glob, socket, subprocess, threading, functools, http.server, shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(ROOT, "og")
TPL_NAME = "_og_product_tmp.html"

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]


def find_chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    for name in ("chrome", "msedge", "chromium"):
        p = shutil.which(name)
        if p:
            return p
    raise SystemExit("Не нашёл Chrome/Edge — укажи путь в CHROME_CANDIDATES")


def read_obj(path):
    t = open(path, encoding="utf-8").read()
    return json.loads(t[t.index("{"):t.rindex("}") + 1])


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def serve(port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    handler.log_message = lambda *a, **k: None          # тихо
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


# ─────────────────────────── шаблон карточки ───────────────────────────
# Читает data/*.js сам, продукт выбирается через ?id=. Вся геометрия графика
# считается из параметров продукта (см. curve()).
TEMPLATE = r"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>og product</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Rubik:wght@600;700;800&display=swap" rel="stylesheet">
<script src="data/instruments.js"></script>
<script src="data/offerings.js"></script>
<style>
  :root{--bg:#0B0C10;--card:#14161C;--ink:#F2F3F7;--mut:rgba(242,243,247,.64);
    --mut2:rgba(242,243,247,.40);--bd:rgba(255,255,255,.11);--or:#EE7D1B;--or2:#F58E33;--gr:#55C08A;
    --f:'Onest',sans-serif;--m:'JetBrains Mono',monospace;--d:'Rubik',sans-serif;}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#22242b}
  body{display:flex;align-items:center;justify-content:center;min-height:100vh;
       color:var(--ink);font-family:var(--f);-webkit-font-smoothing:antialiased}
  .og{position:relative;width:1200px;height:630px;background:var(--bg);overflow:hidden;
      display:flex;flex-direction:column;padding:52px 60px}
  .grid{position:absolute;inset:0;opacity:.55;
    background:linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px) 0 0/100% 42px}
  .glow{position:absolute;right:-140px;bottom:-200px;width:660px;height:660px;border-radius:50%;
    background:radial-gradient(circle,rgba(238,125,27,.22),transparent 62%);filter:blur(6px)}
  .top{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center}
  .wm{display:inline-flex;align-items:center;gap:10px;font-family:var(--d);font-weight:700;font-size:23px}
  .dot{width:11px;height:11px;border-radius:50%;background:var(--or);box-shadow:0 0 16px var(--or)}
  .qual{font-family:var(--m);font-size:12px;letter-spacing:.1em;color:var(--mut2);text-transform:uppercase}
  .mid{position:relative;z-index:2;flex:1;display:flex;align-items:center;gap:44px;padding:26px 0 0}
  .l{flex:1;min-width:0}
  .kick{font-family:var(--m);font-size:14px;letter-spacing:.2em;text-transform:uppercase;color:var(--or);margin-bottom:16px}
  h1{font-family:var(--d);font-weight:800;line-height:1.03;letter-spacing:-.02em;
     font-size:60px;word-break:break-word}
  .ua{font-size:21px;color:var(--mut);margin-top:16px}
  .ua b{color:var(--ink);font-weight:600}
  .r{flex:none;width:452px}
  .chart{background:rgba(255,255,255,.028);border:1px solid var(--bd);border-radius:16px;padding:16px 18px 10px}
  .chart .ct{font-family:var(--m);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut2);margin-bottom:6px}
  .bot{position:relative;z-index:2;display:flex;align-items:flex-end;gap:12px}
  .chip{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:11px 18px}
  .chip .c{display:block;font-family:var(--m);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--mut2)}
  .chip .v{display:block;font-family:var(--d);font-weight:700;font-size:21px;margin-top:4px;white-space:nowrap}
  .chip .v small{font-family:var(--m);font-weight:400;font-size:11px;color:var(--mut2);letter-spacing:.02em}
  .site{margin-left:auto;font-family:var(--m);font-size:14px;color:var(--mut2);letter-spacing:.02em;padding-bottom:6px}
</style>
</head>
<body>
<div class="og" id="og">
  <div class="grid"></div><div class="glow"></div>
  <div class="top">
    <span class="wm"><span class="dot"></span>Rumberg</span>
    <span class="qual">только для квалифицированных инвесторов</span>
  </div>
  <div class="mid">
    <div class="l">
      <div class="kick" id="kick">—</div>
      <h1 id="name">—</h1>
      <div class="ua" id="ua"></div>
    </div>
    <div class="r" id="right"></div>
  </div>
  <div class="bot" id="chips"></div>
</div>
<script>
var TYPE_KICK = { discount:"Дисконтная облигация", protection:"Облигация с защитой капитала",
                  warrant:"Варрант", booster:"Бустер", autocall:"Автоколл" };
var qs = new URLSearchParams(location.search);
var id = qs.get("id") || "";
var instr = ((window.SITE_DATA||{}).instruments)||[];
var offers = ((window.OFFERINGS||{}).items)||[];
var p = instr.filter(function(x){return x.id===id;})[0];
var o = p ? null : offers.filter(function(x){return x.id===id;})[0];
var item = p || o || {name:id};

function num(v){ return String(v).replace(".", ","); }

/* ── Схема выплаты из параметров продукта. Возвращает точки в осях
      [уровень БА %, выплата %] + подписи. Для дисконта ось X — время. ── */
function curve(it, isOffer){
  var K = it.strike || 100, K2 = it.strike2, q = it.quote != null ? it.quote : it.price;
  var fam = isOffer ? (it.family || "") : (it.type || "");
  if (fam === "discount"){
    var entry = q != null ? q : 60;
    return { pts:[[0,entry],[1,100]], marks:[["вход "+num(entry)+"%",0,entry],["100% при погашении",1,100]],
             cap:false, xlab:"срок до погашения", ylab:"% номинала", time:true };
  }
  if (fam === "protection"){
    /* Уровень защиты берём из protectionPct (так он лежит в данных доски); строка
       it.protection — формат первички. Раньше оба игнорировались и рисовалось 80%. */
    var floor = it.protectionPct != null ? it.protectionPct
              : (parseFloat(String(it.protection||"100").replace("%","")) || 100);
    var Kp = it.strike || 100;
    /* participation: у доски — число-доля (1.9), у первички — строка "100%".
       Строку без парсинга умножали как число -> NaN, и линия исчезала. */
    var pRaw = it.participation;
    var part = typeof pRaw === "number" ? pRaw
             : (parseFloat(String(pRaw || "").replace("%", "")) / 100 || 1);
    var top = Math.max(floor + 4, 100 + part * (160 - Kp));
    var midK = (Kp + 160) / 2;
    var mk = [["защита "+num(floor)+"%",70,floor],
              ["участие "+Math.round(part*100)+"%",midK,100+part*(midK-Kp)]];
    if (Kp > 100) mk.push(["K "+num(Kp),Kp,floor]);
    return { pts:[[70,floor],[Kp,floor],[160,top]], marks:mk,
             cap:false, xlab:"уровень базового актива", ylab:"% номинала" };
  }
  if (fam === "autocall"){
    var prot = it.protectionPct || 65, call = it.callBarrier || 120;
    return { pts:[[prot-25,prot-25],[prot,prot],[prot,100],[call+12,100]],
             marks:[["защита "+num(prot)+"%",prot,100],["номинал 100%",call+12,100]],
             cap:true, xlab:"худшая бумага корзины", ylab:"возврат тела, % ном." };
  }
  if (fam === "booster"){
    var ku = it.ku || q || 100, top = ((K2||110) - K) * ku / 100;
    return { pts:[[K-12,0],[K,0],[K2||110,top],[(K2||110)+16,top]],
             marks:[["K "+K,K,0],["×"+num(ku)+"%",(K+(K2||110))/2,top/2],["макс +"+num(Math.round(top*10)/10)+"%",(K2||110),top]],
             cap:true, xlab:"уровень базового актива", ylab:"выплата, % ном." };
  }
  if (it.structure === "cs" && K2){
    var cap = K2 - K;
    return { pts:[[K-14,0],[K,0],[K2,cap],[K2+16,cap]],
             marks:[["K "+K,K,0],["потолок +"+num(cap)+"%",K2,cap]],
             cap:true, xlab:"уровень базового актива", ylab:"выплата, % ном." };
  }
  var be = q != null ? K + q : null;
  return { pts:[[K-16,0],[K,0],[K+58,58]],
           marks:[["K "+K,K,0]].concat(be? [["б/у "+num(Math.round(be*100)/100),be,be-K]] : [])
                  .concat([["рост не ограничен",K+58,58]]),
           cap:false, xlab:"уровень базового актива", ylab:"выплата, % ном." };
}

function chart(c){
  var W=416,H=182,PL=8,PR=8,PT=26,PB=30;
  var xs=c.pts.map(function(p){return p[0];}), ys=c.pts.map(function(p){return p[1];});
  var x0=Math.min.apply(null,xs), x1=Math.max.apply(null,xs);
  var y0=Math.min.apply(null,ys), y1=Math.max.apply(null,ys);
  if (y1===y0) y1=y0+1;
  var sx=function(v){ return PL + (v-x0)/(x1-x0)*(W-PL-PR); };
  var sy=function(v){ return H-PB - (v-y0)/(y1-y0)*(H-PT-PB); };
  var d=c.pts.map(function(p,i){ return (i?"L":"M")+sx(p[0]).toFixed(1)+","+sy(p[1]).toFixed(1); }).join(" ");
  var area=d+" L"+sx(c.pts[c.pts.length-1][0]).toFixed(1)+","+sy(y0).toFixed(1)+
           " L"+sx(c.pts[0][0]).toFixed(1)+","+sy(y0).toFixed(1)+" Z";
  var svg='<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'">'+
    '<defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="0">'+
    '<stop offset="0" stop-color="#EE7D1B" stop-opacity=".45"/><stop offset="1" stop-color="#F58E33"/></linearGradient>'+
    '<linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">'+
    '<stop offset="0" stop-color="#EE7D1B" stop-opacity=".20"/><stop offset="1" stop-color="#EE7D1B" stop-opacity="0"/>'+
    '</linearGradient></defs>'+
    '<line x1="'+PL+'" y1="'+(H-PB)+'" x2="'+(W-PR)+'" y2="'+(H-PB)+'" stroke="rgba(255,255,255,.13)"/>'+
    '<path d="'+area+'" fill="url(#ag)"/>'+
    '<path d="'+d+'" fill="none" stroke="url(#lg)" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>';
  // подписи-маркеры
  c.marks.forEach(function(m,i){
    var mx=sx(m[1]), my=sy(m[2]);
    svg+='<circle cx="'+mx.toFixed(1)+'" cy="'+my.toFixed(1)+'" r="3.4" fill="#F58E33"/>';
    var anchor = i===0 ? "start" : (i===c.marks.length-1 ? "end" : "middle");
    var ty = my - 9 < 12 ? my + 16 : my - 9;
    svg+='<text x="'+mx.toFixed(1)+'" y="'+ty.toFixed(1)+'" fill="rgba(242,243,247,.72)" text-anchor="'+anchor+
         '" font-family="JetBrains Mono" font-size="11.5">'+m[0]+'</text>';
  });
  svg+='<text x="'+PL+'" y="'+(H-8)+'" fill="rgba(242,243,247,.34)" font-family="JetBrains Mono" font-size="10.5">'+c.xlab+'</text>';
  svg+='<text x="'+(W-PR)+'" y="'+(H-8)+'" fill="rgba(242,243,247,.34)" text-anchor="end" font-family="JetBrains Mono" font-size="10.5">'+c.ylab+'</text>';
  svg+='</svg>';
  return svg;
}

function chip(cap, val, sub){
  return '<span class="chip"><span class="c">'+cap+'</span><span class="v">'+val+
         (sub? ' <small>'+sub+'</small>':'')+'</span></span>';
}

(function render(){
  var isOffer = !!o;
  var fam = isOffer ? (item.family||"") : (item.type||"");
  // шапка-кикер
  var kick = isOffer
    ? (item.kind || TYPE_KICK[fam] || "Выпуск на размещении")
    : ((TYPE_KICK[fam]||"Структурный продукт") + (item.structure==="cs" ? " · колл-спред" : (item.structure==="call" ? " · CALL" : "")));
  document.getElementById("kick").textContent = kick;
  document.getElementById("name").textContent = item.name || item.id;

  var ua = isOffer ? (item.reference||"") : (item.underlying||"");
  document.getElementById("ua").innerHTML = ua ? "Базовый актив: <b>"+ua+"</b>" : "";

  // график
  var c = curve(item, isOffer);
  document.getElementById("right").innerHTML =
    '<div class="chart"><div class="ct">Профиль выплаты · схематично</div>'+chart(c)+'</div>';

  // чипы: цена/участие, срок, класс/статус
  var chips = [];
  var q = item.quote != null ? item.quote : item.price;
  if (fam === "booster") chips.push(chip("участие", num(item.ku||q)+"%", ""));
  else if (fam === "autocall") chips.push(chip("купон", num(item.couponPa != null ? item.couponPa : q)+"%", "годовых · индикативно"));
  else if (fam === "discount") chips.push(chip("цена входа", num(q)+"%", "ном. · индикативно"));
  else if (q != null) chips.push(chip(isOffer?"цена":"котировка", num(q)+"%", "ном. · индикативно"));
  if (item.tenor) chips.push(chip("срок", item.tenor, ""));
  if (isOffer && item.statusLabel) chips.push(chip("статус", item.statusLabel, ""));
  else if (!isOffer && item.cls) chips.push(chip("класс актива", item.cls, ""));
  document.getElementById("chips").innerHTML =
    chips.join("") + '<span class="site">invest.rumberg.ru</span>';

  // подгоняем кегль названия под 2–3 строки
  var h = document.getElementById("name"), size = 60;
  while (h.getBoundingClientRect().height > 168 && size > 30) { size -= 2; h.style.fontSize = size + "px"; }
  document.title = "og:" + (item.id || "?");
  window.__ready = true;
})();
</script>
</body>
</html>
"""


def main():
    only = set(a for a in sys.argv[1:] if not a.startswith("-"))
    os.makedirs(OUTDIR, exist_ok=True)
    chrome = find_chrome()

    instruments = read_obj(os.path.join(ROOT, "data", "instruments.js"))["instruments"]
    offerings = read_obj(os.path.join(ROOT, "data", "offerings.js")).get("items", [])
    ids = [i["id"] for i in instruments] + [o["id"] for o in offerings]
    if only:
        ids = [i for i in ids if i in only]
        missing = only - set(ids)
        if missing:
            print("нет таких id:", ", ".join(sorted(missing)))
    if not ids:
        raise SystemExit("нечего рендерить")

    tpl_path = os.path.join(ROOT, TPL_NAME)
    with open(tpl_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(TEMPLATE)

    port = free_port()
    srv = serve(port)
    profile = os.path.join(os.environ.get("TEMP", "/tmp"), "chr-og-products")
    made, failed = 0, []
    try:
        for n, pid in enumerate(ids, 1):
            out = os.path.join(OUTDIR, pid + ".png")
            url = "http://127.0.0.1:%d/%s?id=%s" % (port, TPL_NAME, pid)
            cmd = [chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
                   "--force-device-scale-factor=1", "--window-size=1200,630",
                   "--virtual-time-budget=4000", "--user-data-dir=" + profile,
                   "--screenshot=" + out, url]
            subprocess.run(cmd, capture_output=True)
            if os.path.exists(out) and os.path.getsize(out) > 8000:
                made += 1
                print("  [%d/%d] %s" % (n, len(ids), pid))
            else:
                failed.append(pid)
                print("  [%d/%d] %s — ОШИБКА" % (n, len(ids), pid))
    finally:
        srv.shutdown()
        try:
            os.remove(tpl_path)
        except OSError:
            pass

    # чистим картинки снятых продуктов (только при полном прогоне)
    removed = 0
    if not only:
        keep = set(ids)
        for path in glob.glob(os.path.join(OUTDIR, "*.png")):
            if os.path.splitext(os.path.basename(path))[0] not in keep:
                os.remove(path)
                removed += 1

    print("готово: %d картинок | удалено устаревших: %d" % (made, removed))
    if failed:
        print("НЕ СДЕЛАНЫ:", ", ".join(failed))
    print("дальше: python make_product_pages.py   (проставит og:image на персональные картинки)")


if __name__ == "__main__":
    main()
