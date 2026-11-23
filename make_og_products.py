# -*- coding: utf-8 -*-
"""
Генерирует og2/<id>.jpg — ПЕРСОНАЛЬНУЮ картинку превью (1200x630) под каждый продукт
доски и каждый выпуск «На размещении»: название, базовый актив, ключевые цифры и
схематичный график выплаты, построенный из параметров самого продукта.

Зачем: до этого все ссылки на продукты разворачивались одной общей обложкой.
Персональная картинка резко усиливает главный сценарий — сейлз отправляет клиенту
ссылку в мессенджер.

Папка og2/, а не og/ (с 23.11.2026): обложки перерисованы по брендбуку, а Telegram
кэширует картинку превью по её адресу — под прежними именами в og/ он показывал бы
старые. Старая папка og/ оставлена: по её адресам разосланы ссылки. Следующая смена
вида обложек = новая папка (OG_DIR здесь, og_image() в make_product_pages.py,
ogImageFor() в bot/worker.js).

У выпуска с лендингом (landing: true) обложка рисуется руками и лежит в той же
папке: полный прогон её НЕ трогает. Перерисовать автоматически — назвать id явно.

Как работает: поднимает локальный http.server, рендерит HTML-шаблон карточки
headless-Chrome'ом по одному разу на продукт, сжимает снимок в JPEG и кладёт в og2/.

Запуск:  python make_og_products.py            (все продукты)
         python make_og_products.py D-VEB-3Y   (только указанные id — быстро)

ПОСЛЕ прогона обязательно: python make_product_pages.py
(он проставит og:image на og/<id>.png тем продуктам, у кого картинка появилась).
"""
import json, os, re, sys, glob, socket, subprocess, threading, functools, http.server, shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
OG_DIR = "og2"
OUTDIR = os.path.join(ROOT, OG_DIR)
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


# Целевой вес превью. Chrome снимает только PNG, а PNG с градиентом весит ~225 КБ
# (и PNG под 90 КБ Telegram однажды не взял вовсе — см. make_og_ideas.py), поэтому
# снимок сжимается в JPEG. Ниже качества 72 не опускаемся: тёмный фон начинает полосить.
TARGET_KB = 70


def to_jpeg(src, dst):
    from PIL import Image
    im = Image.open(src).convert("RGB")
    for q in (88, 84, 80, 76, 72):
        im.save(dst, "JPEG", quality=q, optimize=True, progressive=True, subsampling=1)
        if os.path.getsize(dst) / 1024 <= TARGET_KB:
            break
    return os.path.getsize(dst) / 1024


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
<link href="fonts/fonts.css?v=2" rel="stylesheet">
<link href="brand/brand.css?v=1" rel="stylesheet">
<script src="data/instruments.js"></script>
<script src="data/offerings.js"></script>
<style>
  /* Вид по брендбуку Rumberg Capital, как у обложек событий и разборов: логотип из
     brand/logo.svg, Montserrat, фон #191A2F, оранжевый #F06E08 только на главном
     (линия выплаты), углы 2px, подписи без моно-капса, без свечений */
  :root{--bg:#191A2F;--card:#22243B;--ink:#F2F3F7;--mut:rgba(242,243,247,.70);
    --mut2:rgba(242,243,247,.46);--bd:rgba(255,255,255,.12);--or:#F06E08;--or2:#F48834;--gr:#55C08A;
    --f:'Onest',sans-serif;--m:'JetBrains Mono',monospace;--d:'Montserrat',sans-serif;}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#2a2c44}
  body{display:flex;align-items:center;justify-content:center;min-height:100vh;
       color:var(--ink);font-family:var(--f);-webkit-font-smoothing:antialiased}
  .og{position:relative;width:1200px;height:630px;overflow:hidden;
      background:linear-gradient(135deg,#191A2F 0%,#1B1C35 55%,#22244A 100%);
      display:flex;flex-direction:column;padding:52px 60px}
  .grid{position:absolute;inset:0;
    background:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px) 0 0/48px 48px,
               linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px) 0 0/48px 48px;
    -webkit-mask:linear-gradient(110deg,transparent 35%,#000 100%);mask:linear-gradient(110deg,transparent 35%,#000 100%)}
  .top{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center}
  .logo{height:38px;width:150px;background:url(brand/logo.svg) left center/contain no-repeat}
  .qual{font-size:15px;color:var(--mut2)}
  .mid{position:relative;z-index:2;flex:1;display:flex;align-items:center;gap:44px;padding:26px 0 0}
  .l{flex:1;min-width:0}
  .kick{font-size:20px;color:var(--mut);margin-bottom:16px;display:flex;align-items:center;gap:11px}
  .kick .sq{width:9px;height:9px;background:var(--or);flex:none}
  h1{font-family:var(--d);font-weight:600;line-height:1.08;letter-spacing:-.01em;
     font-size:56px;word-break:break-word}
  .ua{font-size:21px;color:var(--mut);margin-top:16px}
  .ua b{color:var(--ink);font-weight:600}
  .r{flex:none;width:452px}
  .chart{background:rgba(34,36,59,.85);border:1px solid var(--bd);border-radius:2px;padding:16px 18px 10px}
  .chart .ct{font-size:13.5px;color:var(--mut2);margin-bottom:6px}
  .bot{position:relative;z-index:2;display:flex;align-items:flex-end;gap:12px}
  .chip{background:rgba(34,36,59,.85);border:1px solid var(--bd);border-radius:2px;padding:11px 18px}
  .chip .c{display:block;font-size:13.5px;color:var(--mut2)}
  .chip .v{display:block;font-family:var(--d);font-weight:600;font-size:21px;margin-top:4px;white-space:nowrap}
  .chip .v small{font-family:var(--f);font-weight:400;font-size:13.5px;color:var(--mut2)}
  .site{margin-left:auto;font-family:var(--m);font-size:19px;color:var(--mut);letter-spacing:.01em;padding-bottom:6px}
</style>
</head>
<body>
<div class="og" id="og">
  <div class="grid"></div>
  <div class="top">
    <span class="logo" role="img" aria-label="Rumberg Capital"></span>
    <span class="qual">только для квалифицированных инвесторов</span>
  </div>
  <div class="mid">
    <div class="l">
      <div class="kick"><span class="sq"></span><span id="kick">—</span></div>
      <h1 id="name">—</h1>
      <div class="ua" id="ua"></div>
    </div>
    <div class="r" id="right"></div>
  </div>
  <div class="bot" id="chips"></div>
</div>
<script>
var TYPE_KICK = { discount:"Дисконтная облигация", protection:"Облигация с защитой капитала",
                  warrant:"Варрант", digital:"Купонный варрант", booster:"Бустер",
                  autocall:"Автоколл", revconv:"Реверс-конвертибл",
                  rcdigital:"Реверс-конвертибл с условным купоном" };
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
  if (fam === "revconv"){
    // Тело: 100% на страйке и выше, ниже — по перформансу ОТ СТРАЙКА (S/K),
    // поэтому левый конец выше, чем у автоколла с тем же уровнем актива.
    var Krc = it.strike != null ? it.strike : 100;
    var loRc = Math.max(20, Krc - 45);
    return { pts:[[loRc, loRc/Krc*100],[Krc,100],[Krc+35,100]],
             marks:[["страйк "+num(Krc)+"%",Krc,100],["номинал 100%",Krc+35,100]],
             cap:true, xlab:"уровень базового актива", ylab:"возврат тела, % ном." };
  }
  if (fam === "rcdigital"){
    /* Тело по перформансу от страйка ПЛЮС ступенька купона на самом страйке.
       Без своей ветки тип свалился бы в ванильный CALL, а рисовать его как
       обычный реверс-конвертибл нельзя: там полка ровно на номинале, здесь она
       на номинале ПЛЮС купон, и именно эта разница и есть продукт. */
    var Krd = it.strike != null ? it.strike : 100;
    var cpnRd = it.couponPct != null ? it.couponPct : (it.quote || 0);
    var loRd = Math.max(20, Krd - 45);
    return { pts:[[loRd, loRd/Krd*100],[Krd,100],[Krd,100+cpnRd],[Krd+35,100+cpnRd]],
             marks:[["страйк "+num(Krd)+"%",Krd,100],
                    ["с купоном "+num(100+cpnRd)+"%",Krd+35,100+cpnRd]],
             cap:true, xlab:"уровень базового актива", ylab:"выплата, % ном." };
  }
  if (fam === "digital"){
    /* Ступенька: ноль до страйка, полка выплаты после. Ровно та же картинка, что
       на доске; без этой ветки купонный варрант уходил в ванильный CALL и og-превью
       рисовало РАСТУЩУЮ выплату — обещание, которого в продукте нет. */
    var payD = it.digitalPct || 0;
    return { pts:[[K-16,0],[K,0],[K,payD],[K+24,payD]],
             marks:[["K "+num(K),K,0],["выплата "+num(payD)+"%",K+24,payD]],
             cap:true, xlab:"уровень базового актива", ylab:"выплата, % ном." };
  }
  if (fam === "booster"){
    /* Ниже страйка бустер теряет вместе с бумагой, один к одному (PAYOFF.booster в
       data/lib.js). Раньше левая часть рисовалась ровной полкой на нуле, как у
       колл-спреда, и картинка прятала главный риск продукта. Ось — результат
       относительно номинала. */
    var ku = it.ku || q || 100, top = ((K2||110) - K) * ku / 100;
    return { pts:[[K-14,-14],[K,0],[K2||110,top],[(K2||110)+16,top]],
             marks:[["ниже — как бумага",K-14,-14],["×"+num(ku)+"%",(K+(K2||110))/2,top/2],["макс +"+num(Math.round(top*10)/10)+"%",(K2||110),top]],
             cap:true, xlab:"уровень базового актива", ylab:"результат, % ном." };
  }
  if (it.structure === "put"){
    /* PUT — зеркало CALL: выплата растёт при падении актива ниже страйка. */
    var pbe = q != null ? K - q : null;
    return { pts:[[K-58,58],[K,0],[K+16,0]],
             marks:[["падение 1:1",K-58,58]].concat(pbe? [["б/у "+num(Math.round(pbe*100)/100),pbe,K-pbe]] : [])
                    .concat([["K "+K,K,0]]),
             cap:false, xlab:"уровень базового актива", ylab:"выплата, % ном." };
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
    '<stop offset="0" stop-color="#F06E08" stop-opacity=".55"/><stop offset="1" stop-color="#F48834"/></linearGradient>'+
    '<linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">'+
    '<stop offset="0" stop-color="#F06E08" stop-opacity=".18"/><stop offset="1" stop-color="#F06E08" stop-opacity="0"/>'+
    '</linearGradient></defs>'+
    '<line x1="'+PL+'" y1="'+(H-PB)+'" x2="'+(W-PR)+'" y2="'+(H-PB)+'" stroke="rgba(255,255,255,.13)"/>'+
    '<path d="'+area+'" fill="url(#ag)"/>'+
    '<path d="'+d+'" fill="none" stroke="url(#lg)" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>';
  // подписи-маркеры
  c.marks.forEach(function(m,i){
    var mx=sx(m[1]), my=sy(m[2]);
    svg+='<circle cx="'+mx.toFixed(1)+'" cy="'+my.toFixed(1)+'" r="3.4" fill="#F48834"/>';
    var anchor = i===0 ? "start" : (i===c.marks.length-1 ? "end" : "middle");
    var ty = my - 9 < 12 ? my + 16 : my - 9;
    svg+='<text x="'+mx.toFixed(1)+'" y="'+ty.toFixed(1)+'" fill="rgba(242,243,247,.78)" text-anchor="'+anchor+
         '" font-family="Onest" font-size="13">'+m[0]+'</text>';
  });
  svg+='<text x="'+PL+'" y="'+(H-8)+'" fill="rgba(242,243,247,.46)" font-family="Onest" font-size="12">'+c.xlab+'</text>';
  svg+='<text x="'+(W-PR)+'" y="'+(H-8)+'" fill="rgba(242,243,247,.46)" text-anchor="end" font-family="Onest" font-size="12">'+c.ylab+'</text>';
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
    : ((TYPE_KICK[fam]||"Структурный продукт") + (item.structure==="cs" ? " · колл-спред" : (item.structure==="call" ? " · CALL" : (item.structure==="put" ? " · PUT" : ""))));
  document.getElementById("kick").textContent = kick;
  /* «S&P 500» и «5 лет» не рвём между строк: «S&P» в конце строки и «500» в начале следующей читались как два слова */
  document.getElementById("name").textContent = String(item.name || item.id).replace(/S&P 500/g, "S&P" + String.fromCharCode(160) + "500")
    .replace(/(\d) (лет|года?|месяц)/g, "$1" + String.fromCharCode(160) + "$2")
    .replace(/(^|[\s(])([А-Яа-яЁё]{1,2}) (?=\S)/g, "$1$2" + String.fromCharCode(160));

  var ua = isOffer ? (item.reference||"") : (item.underlying||"");
  document.getElementById("ua").innerHTML = ua ? "Базовый актив: <b>"+ua+"</b>" : "";

  // график
  var c = curve(item, isOffer);
  /* Корзина доски: по горизонтали не «базовый актив», а худшая бумага (worst-of) или
     средний уровень корзины (basketMode "avg"). Правило то же, что S.basketOf в data/lib.js. */
  if (!isOffer && Array.isArray(item.basket) && item.basket.length > 1 && item.type !== "autocall" &&
      c.xlab === "уровень базового актива") {
    var bkAvg = item.basketMode === "avg" ||
      (item.basketMode == null && /(^|[^а-яё])средн(ее|яя|ей|ему|юю|ий|его|ем)([^а-яё]|$)/i.test(item.name || ""));
    c.xlab = bkAvg ? "средний уровень корзины" : "худшая бумага корзины";
  }
  document.getElementById("right").innerHTML =
    '<div class="chart"><div class="ct">Профиль выплаты · схематично</div>'+chart(c)+'</div>';

  // чипы: цена/участие, срок, класс/статус
  var chips = [];
  var q = item.quote != null ? item.quote : item.price;
  if (fam === "booster") chips.push(chip("участие", num(item.ku||q)+"%", ""));
  else if (fam === "autocall" || fam === "revconv") chips.push(chip("купон", num(item.couponPa != null ? item.couponPa : q)+"%", "годовых · индикативно"));
  // Купон за срок, не годовой: подпись «годовых» завысила бы его в разы
  else if (fam === "rcdigital") chips.push(chip("купон", num(item.couponPct != null ? item.couponPct : q)+"%", "за срок · индикативно"));
  else if (fam === "discount") chips.push(chip("цена входа", num(q)+"%", "ном. · индикативно"));
  else if (fam === "digital") chips.push(chip("премия", num(q)+"%", "ном. · индикативно"));
  /* У защиты капитала вход всегда по номиналу: «котировка 100%» ничего не сообщает.
     Говорящая цифра — участие в росте (то же правило, что у figure() на главной). */
  else if (fam === "protection") {
    var pr = item.participation;
    var prt = typeof pr === "number" ? pr : (parseFloat(String(pr || "").replace("%", "")) / 100 || 1);
    chips.push(chip("участие в росте", Math.round(prt*100)+"%", "индикативно"));
  }
  else if (q != null) chips.push(chip(isOffer?"цена":"котировка", num(q)+"%", "ном. · индикативно"));
  if (item.tenor) chips.push(chip("срок", item.tenor, ""));
  if (isOffer && item.statusLabel) chips.push(chip("статус", item.statusLabel, ""));
  else if (!isOffer && item.cls) chips.push(chip("класс актива", item.cls, ""));
  document.getElementById("chips").innerHTML =
    chips.join("") + '<span class="site">invest.rumberg.ru</span>';

  // подгоняем кегль названия под 2–3 строки
  var h = document.getElementById("name"), size = 56;
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
    all_ids = [i["id"] for i in instruments] + [o["id"] for o in offerings]
    ids = list(all_ids)
    if only:
        ids = [i for i in ids if i in only]
        missing = only - set(ids)
        if missing:
            print("нет таких id:", ", ".join(sorted(missing)))
    else:
        # Обложку выпуска с лендингом рисуют руками (свой рисунок, свои цифры) —
        # полный прогон не должен затирать её схемой из шаблона.
        hand = set(o["id"] for o in offerings if o.get("landing")
                   and os.path.exists(os.path.join(OUTDIR, o["id"] + ".jpg")))
        if hand:
            print("ручные обложки не трогаю:", ", ".join(sorted(hand)))
        ids = [i for i in ids if i not in hand]
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
            out = os.path.join(OUTDIR, pid + ".jpg")
            raw = os.path.join(OUTDIR, "_raw.png")
            url = "http://127.0.0.1:%d/%s?id=%s" % (port, TPL_NAME, pid)
            cmd = [chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
                   "--force-device-scale-factor=1", "--window-size=1200,630",
                   "--virtual-time-budget=4000", "--user-data-dir=" + profile,
                   "--screenshot=" + raw, url]
            if os.path.exists(raw):
                os.remove(raw)
            subprocess.run(cmd, capture_output=True)
            if os.path.exists(raw) and os.path.getsize(raw) > 8000:
                kb = to_jpeg(raw, out)
                os.remove(raw)
                made += 1
                print("  [%d/%d] %s — %.0f КБ" % (n, len(ids), pid, kb))
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
        keep = set(all_ids)
        for path in glob.glob(os.path.join(OUTDIR, "*.jpg")):
            if os.path.splitext(os.path.basename(path))[0] not in keep:
                os.remove(path)
                removed += 1

    print("готово: %d картинок | удалено устаревших: %d" % (made, removed))
    if failed:
        print("НЕ СДЕЛАНЫ:", ", ".join(failed))
    print("дальше: python make_product_pages.py   (проставит og:image на персональные картинки)")


if __name__ == "__main__":
    main()
