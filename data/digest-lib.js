// Отрисовка дайджеста (DF): цвета секций, payoff-SVG и пр. Код отделён от данных,
// чтобы data/digest.js можно было обновлять автоматически. Подключать ПОСЛЕ data/digest.js.
window.DF = (function () {
  const A = window.DIGEST_ARCHIVE;
  const MONO = 'font-family="JetBrains Mono, monospace"';
  const FXT = (window.SITE && window.SITE.LEGAL && window.SITE.LEGAL.fx) ||
    "Базовый актив номинирован в иностранной валюте — выплата и пример расчёта приведены без учёта изменения валютного курса.";
  const colorMap = {};
  A.sections.forEach(s => colorMap[s.key] = s.color);
  const colorOf = fam => colorMap[fam] || "rgba(255,255,255,0.60)";
  const sectionOf = fam => A.sections.find(s => s.key === fam) || { label: fam, color: colorOf(fam) };

  // ── геометрия графиков выплаты ───────────────────────────────────────────────
  // Варрант и защита капитала считаются ИЗ ДАННЫХ и повторяют печатный дайджест
  // (_warrant_svg / _protected_svg в make_digest.py) один в один: ось X — уровень
  // базового актива в % от старта, ось Y — выплата в % номинала. Правишь одну —
  // правь вторую, иначе сайт и PDF покажут клиенту разные картинки одного продукта.
  const CW = 300, CH = 130;
  const GRID = "rgba(255,255,255,0.17)", LAB = "rgba(255,255,255,0.60)",
        EM = "rgba(255,255,255,0.86)", GHOST = "rgba(255,255,255,0.32)";
  const gnum = v => {
    const n = Number(v);
    return isFinite(n) ? String(Math.round(n * 100) / 100).replace(".", ",") : String(v);
  };
  const sTxt = (x, y, s, anchor, fill, size) =>
    '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + (anchor || "start") +
    '" fill="' + (fill || LAB) + '" font-size="' + (size || 10.5) + '" ' + MONO + '>' + s + '</text>';
  const sLine = (x1, y1, x2, y2, stroke, w, dash) =>
    '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) +
    '" y2="' + y2.toFixed(1) + '" stroke="' + stroke + '" stroke-width="' + (w || 1) + '"' +
    (dash ? ' stroke-dasharray="' + dash + '"' : "") + '/>';
  const sPath = (d, stroke, w, dash) =>
    '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + w +
    '" stroke-linejoin="round" stroke-linecap="round"' + (dash ? ' stroke-dasharray="' + dash + '"' : "") + '/>';
  const sDia = (x, y, fill) =>
    '<rect x="' + (x - 3.5).toFixed(1) + '" y="' + (y - 3.5).toFixed(1) + '" width="7" height="7" ' +
    'transform="rotate(45 ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')" fill="' + fill + '"/>';

  // Премия рисуется ГОРИЗОНТАЛЬНЫМ уровнем: где линия выплаты его пересекает — безубыток.
  // До 31.08.2026 «премия N%» на сайте подписывала плоскую часть графика, где выплата
  // РАВНА НУЛЮ (читалось так, будто там что-то платят), а страйка и безубытка не было
  // вовсе — печатный выпуск это давно чинил, сайт остался со старой картинкой.
  function warrantSvg(p, color, cap) {
    const K = Number(p.strikePct) || 100, q = Number(p.premiumPct) || 0;
    const K2 = cap ? K + cap : null, sBe = K + q;
    const s0 = K * 0.8, s1 = K2 ? K2 * 1.18 : Math.max(K * 1.32, sBe * 1.15);
    const pay = s => { const v = Math.max(s - K, 0); return cap ? Math.min(v, cap) : v; };
    const ymax = Math.max(cap || pay(s1), q) * 1.14 + 4;
    const PADL = 8, PADR = 8, PADT = 15, PADB = 24;   // снизу — место под подпись страйка
    const X = s => PADL + (s - s0) / (s1 - s0) * (CW - PADL - PADR);
    const Y = v => CH - PADB - (v / ymax) * (CH - PADT - PADB);

    let d = "M" + X(s0).toFixed(1) + " " + Y(0).toFixed(1) + " L" + X(K).toFixed(1) + " " + Y(0).toFixed(1);
    d += K2 ? " L" + X(K2).toFixed(1) + " " + Y(cap).toFixed(1) + " L" + X(s1).toFixed(1) + " " + Y(cap).toFixed(1)
            : " L" + X(s1).toFixed(1) + " " + Y(pay(s1)).toFixed(1);

    let o = sLine(PADL, Y(0), CW - PADR, Y(0), GRID, 1);
    if (q) {
      o += sLine(PADL, Y(q), CW - PADR, Y(q), color, 1, "3 3") +
           sTxt(PADL + 1, Y(q) - 5, "премия " + gnum(q) + "%", "start", EM);
    }
    if (K2) o += sLine(PADL, Y(cap), CW - PADR, Y(cap), GRID, 1, "2 4");
    o += sPath(d, color, 2.5) + sDia(X(K), Y(0), color) + sTxt(X(K), Y(0) + 15, "K " + gnum(K), "middle");
    if (q && X(sBe) < CW - PADR - 6) {
      const end = X(sBe) > CW * 0.7;
      // Слева от безубытка кривая идёт НИЖЕ уровня премии — подпись под уровнем легла бы
      // прямо на неё (премия 86,5% у CALL 100 · NBIS). У правого края уводим её НАД уровень.
      o += '<circle cx="' + X(sBe).toFixed(1) + '" cy="' + Y(q).toFixed(1) + '" r="3.2" fill="' + color + '"/>' +
           sTxt(X(sBe) + (end ? -6 : 6), Y(q) + (end ? -5 : 14), "б/у " + gnum(sBe), end ? "end" : "start", EM);
    }
    return o + sTxt(CW - PADR, PADT - 4, K2 ? "макс. +" + gnum(cap) + "% ном." : "рост без потолка", "end");
  }

  // НАКЛОН ЛИНИИ И ЕСТЬ КОЭФФИЦИЕНТ УЧАСТИЯ: до 31.08.2026 геометрия была фиксированной,
  // и участие 40% и 200% давали пиксель в пиксель одну картинку — цифра жила подписью,
  // а не рисунком. Бледная линия «актив» (рост один к одному) — опора: без неё «круче»
  // не с чем сравнивать, а на ней же читается и защита (слева актив уходит вниз,
  // выплата держит полку). Потолок рисуем ТОЛЬКО при заданном capPct — у обычной защиты
  // участие ничем не ограничено, и полка справа изображала бы call-spread.
  // capPct — потолок РОСТА АКТИВА в п.п. от старта (поле cap на доске), НЕ максимальная
  // выплата: при участии 90% и потолке +50% клиент получает не более +45%.
  function protectedSvg(p, color) {
    const floor = Number(p.floorPct) || 100, K = Number(p.strikePct) || 100;
    const part = p.partPct != null ? Number(p.partPct) / 100 : 1;
    let capLvl = p.capPct != null ? 100 + Number(p.capPct) : null;
    if (capLvl != null && capLvl <= K) capLvl = null;       // потолок ниже страйка — данные битые
    const pay = s => floor + part * Math.max((capLvl != null ? Math.min(s, capLvl) : s) - K, 0);

    // Окно начинаем ниже САМОГО НИЖНЕГО из уровней: при защите 80% линия актива
    // выходила из нижнего угла вплотную к полке и ложилась на подпись «защита 80%».
    const s0 = Math.min(K, 100, floor) - 25;
    const s1 = capLvl != null ? capLvl + (capLvl - s0) * 0.14 : Math.max(K, 100) + 40;
    const ymin = Math.min(floor, s0), ymax = pay(s1) + (pay(s1) - ymin) * 0.14 + 2;
    const PADL = 8, PADR = 8, PADT = 15, PADB = 22;
    const X = s => PADL + (s - s0) / (s1 - s0) * (CW - PADL - PADR);
    const Y = v => CH - PADB - (v - ymin) / (ymax - ymin) * (CH - PADT - PADB);

    let d = "M" + X(s0).toFixed(1) + " " + Y(floor).toFixed(1) + " L" + X(K).toFixed(1) + " " + Y(floor).toFixed(1);
    d += capLvl != null
      ? " L" + X(capLvl).toFixed(1) + " " + Y(pay(capLvl)).toFixed(1) + " L" + X(s1).toFixed(1) + " " + Y(pay(s1)).toFixed(1)
      : " L" + X(s1).toFixed(1) + " " + Y(pay(s1)).toFixed(1);

    // Подпись защиты — НАД полкой: под ней проходит линия актива, и подпись легла бы на неё.
    let o = sLine(PADL, Y(floor), CW - PADR, Y(floor), GRID, 1, "2 4") +
            sTxt(PADL, Y(floor) - 5, "защита " + gnum(p.floorPct != null ? p.floorPct : 100) + "%");
    const sG = Math.min(s1, ymax);                          // линия актива уходит за верх кадра
    if (sG > s0 + 1) {
      o += sPath("M" + X(s0).toFixed(1) + " " + Y(s0).toFixed(1) + " L" + X(sG).toFixed(1) + " " + Y(sG).toFixed(1),
                 GHOST, 1.2, "4 3");
      // Подпись — у НАЧАЛА линии, в нижнем поле кадра: вдоль наклонной любая подпись
      // ложится на саму линию (за свою ширину линия успевает уйти на её высоту).
      o += sTxt(X(s0) + 2, Math.min(Y(s0) + 12, CH - 5), "актив");
    }
    o += sPath(d, color, 2.5);
    if (capLvl != null) o += sDia(X(capLvl), Y(pay(capLvl)), color);
    if (Math.abs(K - 100) > 0.01) {                         // страйк выше старта — отметить и назвать
      o += sDia(X(K), Y(floor), color) + sTxt(X(K), Y(floor) + 13, "K " + gnum(K), "middle");
    }
    // Максимальную выплату называем ТОЛЬКО когда участие есть в данных: без него оно
    // принято за 100% ради геометрии, и «макс. +50%» было бы выводом из допущения.
    // Потолок роста актива при этом известен точно — его и печатаем.
    const lab = capLvl != null
      ? (p.partPct != null ? "участие " + gnum(p.partPct) + "% · макс. +" + gnum(pay(s1) - floor) + "%"
                           : "потолок +" + gnum(p.capPct) + "% роста")
      : (p.partPct != null ? "участие " + gnum(p.partPct) + "% · без потолка" : "участие в росте");
    return o + sTxt(CW - PADR, PADT - 4, lab, "end");
  }

  function payoffSvg(p, color) {
    const W = 300, H = 130, PAD = 16;
    const x = t => PAD + t * (W - PAD * 2), y = t => PAD + t * (H - PAD * 2);
    let el = "";
    if (p.type === "callcap") {
      el = warrantSvg(p, color, Number(p.capPct) || null);
    } else if (p.type === "call") {
      el = warrantSvg(p, color, null);
    } else if (p.type === "protected") {
      el = protectedSvg(p, color);
    } else if (p.type === "digital") {
      const base = y(0.62), up = y(0.18), bx = x(0.56);
      el = '<line x1="' + PAD + '" y1="' + base + '" x2="' + (W - PAD) + '" y2="' + base + '" stroke="rgba(255,255,255,0.17)" stroke-width="1" stroke-dasharray="2 4"/>' +
        '<text x="' + PAD + '" y="' + (base + 14) + '" fill="rgba(255,255,255,0.46)" font-size="10.5" ' + MONO + '>номинал 100%</text>' +
        '<path d="M' + PAD + ' ' + base + ' L' + bx + ' ' + base + ' L' + bx + ' ' + up + ' L' + (W - PAD) + ' ' + up + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<rect x="' + (bx - 3.5) + '" y="' + (up - 3.5) + '" width="7" height="7" transform="rotate(45 ' + bx + ' ' + up + ')" fill="' + color + '"/>' +
        '<text x="' + (W - PAD) + '" y="' + (up - 8) + '" text-anchor="end" fill="rgba(255,255,255,0.60)" font-size="10.5" ' + MONO + '>' + (p.barrierPct ? "барьер +" + gnum(p.barrierPct) + "% → " : "") + "купон " + gnum(p.couponPct) + '%</text>';
    } else if (p.type === "booster") {
      // Бустер: вниз — один к одному, вверх — усиленное участие внутри диапазона до потолка.
      const zero = y(0.58), cap = y(0.16), x0 = x(0.42), xc = x(0.7);
      el = '<line x1="' + PAD + '" y1="' + zero + '" x2="' + (W - PAD) + '" y2="' + zero + '" stroke="rgba(255,255,255,0.17)" stroke-width="1" stroke-dasharray="2 4"/>' +
        '<text x="' + (W - PAD) + '" y="' + (zero + 14) + '" text-anchor="end" fill="rgba(255,255,255,0.46)" font-size="10.5" ' + MONO + '>номинал 100%</text>' +
        '<path d="M' + PAD + ' ' + y(0.95) + ' L' + x0 + ' ' + zero + ' L' + xc + ' ' + cap + ' L' + (W - PAD) + ' ' + cap + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<rect x="' + (xc - 3.5) + '" y="' + (cap - 3.5) + '" width="7" height="7" transform="rotate(45 ' + xc + ' ' + cap + ')" fill="' + color + '"/>' +
        '<text x="' + (W - PAD) + '" y="' + (cap - 8) + '" text-anchor="end" fill="rgba(255,255,255,0.60)" font-size="10.5" ' + MONO + '>макс. +' + gnum(p.capPct) + '%</text>' +
        // «номинал 100%» уведён ВПРАВО, коэффициент — правее излома: слева обе подписи
        // лежали прямо на ломаной (участок падения проходил сквозь «номинал 100%»).
        (p.kuPct ? '<text x="' + x(0.66) + '" y="' + y(0.52) + '" fill="rgba(255,255,255,0.60)" font-size="10.5" ' + MONO + '>×' + gnum(p.kuPct) + '%</text>' : "") +
        '<text x="' + PAD + '" y="' + (y(0.95) + 13) + '" fill="rgba(255,255,255,0.46)" font-size="10.5" ' + MONO + '>падение 1:1</text>';
    } else if (p.type === "fixed") {
      // Дисконтная облигация: результат известен в день сделки — вход ниже номинала, погашение по 100%.
      const inY = y(0.72), outY = y(0.2), mid = x(0.52);
      el = '<line x1="' + PAD + '" y1="' + inY + '" x2="' + (W - PAD) + '" y2="' + inY + '" stroke="rgba(255,255,255,0.17)" stroke-width="1" stroke-dasharray="2 4"/>' +
        '<text x="' + PAD + '" y="' + (inY + 14) + '" fill="rgba(255,255,255,0.46)" font-size="10.5" ' + MONO + '>вход ' + gnum(p.entryPct) + '%</text>' +
        '<line x1="' + PAD + '" y1="' + outY + '" x2="' + (W - PAD) + '" y2="' + outY + '" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>' +
        '<text x="' + (W - PAD) + '" y="' + (outY - 8) + '" text-anchor="end" fill="rgba(255,255,255,0.60)" font-size="10.5" ' + MONO + '>погашение 100%</text>' +
        '<line x1="' + mid + '" y1="' + (inY - 4) + '" x2="' + mid + '" y2="' + (outY + 6) + '" stroke="' + color + '" stroke-width="1.6" stroke-dasharray="3 3"/>' +
        '<path d="M' + (mid - 4.5) + ' ' + (outY + 11) + ' L' + mid + ' ' + (outY + 4) + ' L' + (mid + 4.5) + ' ' + (outY + 11) + '" fill="none" stroke="' + color + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<text x="' + (mid + 10) + '" y="' + ((inY + outY) / 2 + 4) + '" fill="' + color + '" font-size="11.5" ' + MONO + '>+' + gnum(p.gainPct) + '%</text>';
    } else {
      const line = "M" + x(0) + " " + y(0.8) + " C" + x(0.35) + " " + y(0.72) + " " + x(0.6) + " " + y(0.42) + " " + x(1) + " " + y(0.2);
      el = '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<text x="' + (W - PAD) + '" y="' + (y(0.2) - 8) + '" text-anchor="end" fill="rgba(255,255,255,0.60)" font-size="10.5" ' + MONO + '>стоимость портфеля</text>';
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block">' + el + '</svg>';
  }

  // Уровень защиты числом: в payoff он лежит как есть, в параметрах — строкой («80%»).
  // Нужен, чтобы тексты «кому» и «риск» не утверждали 100%, когда защита частичная.
  function floorOf(idea) {
    const pf = idea.payoff || {};
    if (typeof pf.floorPct === "number") return pf.floorPct;
    const m = String((idea.p && idea.p.protection) || "").match(/\d+([.,]\d+)?/);
    return m ? Number(m[0].replace(",", ".")) : null;
  }
  const numTxt = (n) => String(Math.round(n * 100) / 100).replace(".", ",");

  // Кому продавать — авто-шаблон по типу продукта (переопределяется полем idea.audience).
  function audienceOf(idea) {
    if (idea.audience) return idea.audience;
    const a = (idea.p && idea.p.asset) || idea.underlying;
    const prot = idea.p && /100/.test(idea.p.protection || "");
    if (idea.family === "warrant") return "Подходит, если вы ждёте рост «" + a + "» и хотите усиленную экспозицию при ограниченном риске: оплачивается только премия, без маржин-коллов.";
    if (idea.family === "coupon") return prot
      ? "Подходит, если вы хотите заранее известный купон по «" + a + "» с полной защитой капитала."
      : "Подходит, если вы хотите заранее известный купон по «" + a + "» и готовы к снижению номинала, если актив упадёт.";
    if (idea.family === "protection") {
      const f = floorOf(idea);
      return f != null && f < 100
        ? "Осторожным клиентам: возврат не менее " + numTxt(f) + "% номинала плюс участие в росте «" + a + "»."
        : "Осторожным клиентам: полная защита капитала плюс участие в росте «" + a + "».";
    }
    return "Подходит, если вы хотите диверсифицированную облигационную стратегию с прогнозируемым горизонтом.";
  }
  // Риск — авто-шаблон по типу продукта (переопределяется полем idea.risk).
  function riskOf(idea) {
    if (idea.risk) return idea.risk;
    const prot = idea.p && /100/.test(idea.p.protection || "");
    if (idea.family === "warrant") return "Риск ограничен премией: если базовый актив не вырос к погашению, премия теряется полностью, вложенные средства не возвращаются.";
    if (idea.family === "coupon") return prot
      ? "Капитал защищён на 100% — при любом сценарии возвращается номинал. Основной риск — кредитное качество эмитента облигации."
      : "Если базовый актив снизится, выплата номинала уменьшается пропорционально падению. Дополнительно — кредитный риск эмитента облигации.";
    if (idea.family === "protection") {
      const f = floorOf(idea);
      return f != null && f < 100
        ? "Защита капитала " + numTxt(f) + "%: максимальный убыток — " + numTxt(100 - f) +
          "% от вложенной суммы, он реализуется, если базовый актив не вырастет. Дополнительно — кредитный риск эмитента облигации."
        : "Защита капитала 100%: при падении возвращается номинал. Основной риск — кредитное качество эмитента облигации.";
    }
    return "Стоимость портфеля колеблется вместе с рынком облигаций — итоговый доход не гарантирован.";
  }
  // Единый набор параметров: сейлзы заполняют одинаковые поля через idea.p.
  function paramRows(idea) {
    if (!idea.p) return idea.params || [];
    const p = idea.p;
    return [
      ["Базовый актив", p.asset || idea.underlying],
      ["Тип продукта", idea.kind || sectionOf(idea.family).label],
      ["Цена входа", p.price || "—"],
      ["Номинал", p.nominal || "1 000 ₽"],
      ["Срок", idea.tenor || "—"],
      ["Потенциал дохода", p.upside || "—"],
      ["Защита капитала", p.protection || "нет"]
    ];
  }

  function detailBody(idea) {
    const c = colorOf(idea.family);
    return '<div class="df-detail" style="--fc:' + c + '">' +
      '<div class="df-hypo"><span class="k">Гипотеза</span>' + idea.hypothesis + '</div>' +
      '<div class="df-grid"><div class="df-main">' +
        '<div class="df-sell"><div class="k">Кому подходит</div><p>' + audienceOf(idea) + '</p></div>' +
        '<div class="df-block"><div class="k">Логика идеи</div>' +
          (idea.situation ? '<p>' + idea.situation + '</p>' : "") +
          '<ul>' + idea.factors.map(f => '<li>' + f + '</li>').join("") + '</ul>' +
          (idea.conclusion ? '<p class="concl">' + idea.conclusion + '</p>' : "") +
        '</div>' +
        '<div class="df-earn"><div class="k">Как заработать</div><p>' + idea.how + '</p></div>' +
        '<div class="df-risk"><div class="k">Риск</div><p>' + riskOf(idea) + '</p></div>' +
      '</div><div class="df-side">' +
        '<div class="df-chart">' + payoffSvg(idea.payoff, c) + '<div class="cap">' + idea.payout + '</div></div>' +
        '<div class="df-params">' + paramRows(idea).map(r => '<div class="df-param"><span class="k">' + r[0] + '</span><span class="v">' + r[1] + '</span></div>').join("") + '</div>' +
        (idea.fx ? '<div class="df-fx">' + FXT + '</div>' : "") +
      '</div></div></div>';
  }

  const CSS = '.df-detail{}' +
    '.df-hypo{margin:0 0 22px;padding:16px 20px;background:rgba(255,255,255,0.05);border-radius:10px;font-size:16.5px;line-height:1.55;color:var(--ink);text-wrap:pretty}' +
    '.df-hypo .k{display:block;font-family:var(--f-mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,0.60);margin-bottom:7px}' +
    '.df-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:30px;align-items:start}' +
    '.df-block{margin-bottom:20px}' +
    '.df-block .k{font-family:var(--f-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,0.60);margin-bottom:9px}' +
    '.df-block p{margin:0;font-size:14.5px;line-height:1.65;color:var(--hushed);text-wrap:pretty}' +
    '.df-block ul{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:7px}' +
    '.df-block li{font-size:14px;line-height:1.55;color:var(--hushed)}' +
    '.df-block li::marker{color:var(--fc)}' +
    '.df-side{display:flex;flex-direction:column;gap:10px}' +
    '.df-chart{background:rgba(255,255,255,0.04);border-radius:10px;padding:14px 16px 10px}' +
    '.df-chart .cap{font-size:11.5px;color:var(--faint);margin-top:8px;line-height:1.45}' +
    '.df-param{background:rgba(255,255,255,0.04);border-radius:10px;padding:11px 15px;display:flex;justify-content:space-between;align-items:center;gap:12px}' +
    '.df-param .k{font-size:13px;color:var(--hushed)}' +
    '.df-param .v{font-family:var(--f-mono);font-size:13.5px;text-align:right}' +
    '.df-fx{padding:9px 12px;border-left:3px solid var(--down);background:rgba(238,125,27,0.12);border-radius:0 7px 7px 0;font-size:11.5px;line-height:1.45;color:#E7B98D}' +
    '.df-sell{margin:0 0 20px;padding:14px 18px;background:rgba(238,125,27,0.10);border-left:3px solid var(--solar);border-radius:0 10px 10px 0}' +
    '.df-sell .k{display:block;font-family:var(--f-mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--solar);margin-bottom:6px}' +
    '.df-sell p{margin:0;font-size:14.5px;line-height:1.55;color:var(--ink);text-wrap:pretty}' +
    '.df-earn{margin:0 0 14px;padding:14px 18px;background:rgba(85,192,138,0.10);border-left:3px solid var(--up);border-radius:0 10px 10px 0}' +
    '.df-earn .k{display:block;font-family:var(--f-mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--up);margin-bottom:6px}' +
    '.df-earn p{margin:0;font-size:14.5px;line-height:1.55;color:var(--ink);text-wrap:pretty}' +
    '.df-risk{margin-top:0;padding:14px 18px;background:rgba(224,112,90,0.12);border-left:3px solid #E0705A;border-radius:0 10px 10px 0}' +
    '.df-risk .k{display:block;font-family:var(--f-mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:#E0705A;margin-bottom:6px}' +
    '.df-risk p{margin:0;font-size:13.5px;line-height:1.5;color:rgba(242,243,247,0.82);text-wrap:pretty}' +
    '.df-params{display:flex;flex-direction:column;gap:8px}' +
    '.df-block p.concl{margin-top:12px;color:var(--ink)}' +
    '@media (max-width:820px){.df-grid{grid-template-columns:1fr}}';
  const st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);

  return { colorOf, sectionOf, payoffSvg, detailBody };
})();
