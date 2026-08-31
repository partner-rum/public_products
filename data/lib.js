// ============================================================
// ЛОГИКА САЙТА: тексты типов продуктов, формула выплаты, форматирование.
// Котировки и инструменты — в instruments.js (его генерирует update_site.py).
// Этот файл правится редко — только если меняются тексты или конвенции.
// ============================================================

window.SITE = (function () {

  const TYPES = {
    discount: {
      slug: "discount",
      title: "Дисконтные облигации",
      chip: "Консервативный",
      chipFg: "#2E6E56", chipBg: "#DFEAE2",
      desc: "Облигация покупается дешевле номинала, на погашение выплачивается 100%. Доход — дисконт, и он известен в день покупки.",
      paramLabel: "Доходность"
    },
    protection: {
      slug: "protection",
      title: "Защита капитала",
      chip: "Сбалансированный",
      chipFg: "#33608C", chipBg: "#DCE6F0",
      desc: "Облигация с возвратом 100% номинала при любом сценарии и участием в росте базового актива.",
      paramLabel: "Участие"
    },
    warrant: {
      slug: "warrant",
      title: "Варранты",
      chip: "Активный",
      chipFg: "#B3801F", chipBg: "#F2E7CF",
      desc: "CALL и колл-спреды (CS) на акции, индексы, золото и биткоин со сроками 2–3 года. Страйк — 100% или выше уровня базового актива в день покупки. Котировка — премия в процентах от номинала, она же максимальный риск покупателя.",
      paramLabel: "Страйк, %"
    },
    booster: {
      slug: "booster",
      title: "Бустеры",
      chip: "Агрессивный",
      chipFg: "#A6402E", chipBg: "#F6DAD2",
      desc: "Усиленное участие в росте базового актива (КУ 150–200%) внутри диапазона до потолка — ценой полного участия в падении один к одному. На акции РФ, срок до года.",
      paramLabel: "КУ, %"
    },
    autocall: {
      slug: "autocall",
      title: "Автоколлы",
      chip: "Купонный",
      chipFg: "#2C6E68", chipBg: "#D9EBE9",
      desc: "Облигация с условным купоном на корзину акций по принципу worst-of: купон начисляется, пока худшая бумага корзины держится выше купонного барьера. Если на дату наблюдения все бумаги выше барьера автоотзыва — выпуск гасится досрочно с выплатой номинала и купона. На погашении номинал возвращается полностью, пока worst-of выше барьера защиты.",
      paramLabel: "Купон, % г."
    },
    revconv: {
      slug: "revconv",
      title: "Реверс-конвертибл",
      chip: "Доходный",
      chipFg: "#8A3A60", chipBg: "#F3DDE8",
      desc: "Облигация с повышенным купоном: купон платится при любом сценарии, за это инвестор принимает риск по базовому активу. На страйке и выше на погашении возвращается 100% номинала, ниже — выплата считается по перформансу ОТ СТРАЙКА. Расчёт денежный, бумаги не поставляются.",
      paramLabel: "Купон, % г."
    }
  };

  const INSTRUMENTS = (window.SITE_DATA || {}).instruments || [];
  const UNDERLYINGS = (window.SITE_DATA || {}).underlyings || {};

  // Развёрнутые описания базовых активов для one-pager (правится редко, вручную).
  const UNDERLYING_LONG = {
    "S&P 500": "Индекс 500 крупнейших публичных компаний США — на них приходится около 80% капитализации американского рынка акций. Это главный барометр экономики США и мировой эталон долгосрочных инвестиций: в составе — технологические гиганты, финансовый, промышленный и потребительский секторы. Широкая диверсификация по сотням эмитентов снижает зависимость результата от отдельной компании.",
    "ОФЗ 26238": "Облигация федерального займа с погашением в 2041 году — одна из самых длинных бумаг Минфина России. Цена длинных ОФЗ особенно чувствительна к ключевой ставке: при её снижении они дорожают заметно сильнее коротких выпусков. Поэтому ОФЗ 26238 — удобная ставка на смягчение политики ЦБ.",
    "Nebius Group (NBIS)": "Nebius Group строит и сдаёт в аренду вычислительные мощности на GPU для обучения моделей искусственного интеллекта; акции торгуются на NASDAQ. Бизнес завязан на глобальный рост спроса на AI-вычисления — один из самых быстрорастущих сегментов рынка. Компания уже заключила крупные контракты.",
    "NVIDIA (NVDA)": "NVIDIA — мировой лидер в разработке графических и AI-процессоров; её чипы стали фактическим стандартом для обучения нейросетей и центром притяжения инвестиций в искусственный интеллект. Компания входит в число самых дорогих в мире по капитализации, а её акции — ключевой прокси на весь сектор ИИ и полупроводников.",
    "Индекс МосБиржи": "Основной индекс российского рынка акций: около 40 крупнейших компаний, взвешенных по капитализации, из нефтегазового, финансового, металлургического и потребительского секторов. Отражает общую динамику отечественного рынка и служит базовым ориентиром доходности рублёвых вложений в акции.",
    "ОФЗ": "Облигации федерального займа — государственные рублёвые облигации Минфина России, эталон надёжности и базовый ориентир доходности локального долгового рынка. Дисконтная структура фиксирует доход уже в момент покупки: бумага приобретается дешевле номинала, а на погашении выплачивается 100%."
  };

  // Юридические тексты (one-pager, футеры). Реквизиты заполняет компания — правится в одном месте.
  const LEGAL = {
    // Единая формулировка ИИР — строгий термин «индивидуальной» (не путать с более
    // слабым «инвестиционной рекомендацией»). Используется в подвалах витрины.
    iir: "Не является индивидуальной инвестиционной рекомендацией.",
    qual: "Материал предназначен исключительно для квалифицированных инвесторов.",
    fx: "Базовый актив номинирован в иностранной валюте — выплата и пример расчёта приведены без учёта изменения валютного курса.",
    onepager: [
      "Настоящий материал содержит информацию, предназначенную исключительно для квалифицированных инвесторов. Копирование, распространение, передача или пересылка настоящего материала либо любой информации из него допускается только с предварительного письменного согласия компании.",
      "У читателя отсутствует обязанность получать статус квалифицированного инвестора при отсутствии потребности совершать действия, которые в соответствии с применимым законодательством и разъяснениями Банка России могут совершаться только квалифицированными инвесторами. Решение о получении статуса квалифицированного инвестора принимается читателем самостоятельно после ознакомления с правовыми последствиями такого статуса. Подробности — у вашего брокера.",
      "Настоящий материал не является индивидуальной инвестиционной рекомендацией и может не соответствовать инвестиционному профилю читателя, его целям инвестирования и ожиданиям по уровню риска и/или доходности.",
      "Сценарии доходности не являются гарантированными, носят иллюстративный характер и рассчитаны без учёта комиссий и налогов. Итоговая доходность может отличаться от прогнозной. Параметры выпуска — ориентировочные; финальные условия определяются эмиссионной документацией по выпуску.",
      "Инвестирование в структурные облигации связано с рисками, включая кредитный риск эмитента и риск потери части или всей суммы инвестиций. Не является офертой. Доход от инвестирования не гарантирован."
    ]
  };

  // --- Продукт -------------------------------------------------------------

  const PAYOFF = {
    // Текст формулы выплаты для инструмента (CALL или колл-спред).
    formula(r) {
      return r && r.structure === "cs" ? "Ном × min(max(S − K; 0); K₂ − K)" : "Ном × max(S − K; 0)";
    },
    // Выплата в % от номинала. S, K, K2 — в % от начального уровня БА.
    // CALL: max(S − K; 0) — рост актива выше страйка; колл-спред: не выше K₂ − K.
    pct(S, K, K2) {
      let v = Math.max(S - K, 0);
      if (K2) v = Math.min(v, K2 - K);
      return v;
    },
    // Бустер: вниз участие в падении 1:1 (выплата = S при S<K); вверх — КУ×рост внутри
    // диапазона [K;K2], выше K2 — потолок. S,K,K2 — в % от начального; ku — доля (напр. 1.75).
    // Возврат — выплата в % от номинала.
    booster(S, K, K2, ku) {
      if (S < K) return S;
      return K + ku * (Math.min(S, K2) - K);
    },
    // Автоколл, возврат ТЕЛА на погашении (без купонов): европейский барьер.
    // worst-of ≥ barrier → 100% номинала; ниже — выплата по перформансу худшей бумаги.
    // S и barrier — в % от начального уровня worst-of.
    autocall(S, barrier) {
      return S >= barrier ? 100 : S;
    },
    // Реверс-конвертибл: ТЕЛО на погашении (купон безусловный и в эту функцию
    // не входит). S и K — в % от начального уровня БА.
    // S ≥ K → 100% номинала; ниже — S/K от номинала, то есть падение считается
    // ОТ СТРАЙКА, а не от начального уровня: при K = 90 бумага на 90% ещё даёт
    // полный номинал, а на 45% — 50% номинала, а не 45%.
    revconv(S, K) {
      return Math.min(100, S / (K || 100) * 100);
    }
  };

  // --- Калькулятор выплаты (единый источник для доски и карточки) ----------
  // Раньше calcMove/calcPct дублировались в board.html и instrument.html: из-за
  // этого границы ползунка и статический «Пример расчёта» разъезжались по знаку,
  // а на NBIS с премией 70–86% прибыль была недостижима (потолок ползунка +60%
  // был НИЖЕ безубытка). Теперь границы привязаны к математике продукта.
  const calc = {
    // Ход базового актива (в %) в точке безубытка. Для CALL/колл-спреда выплата
    // pct(move) = max((100+move) − K; 0); безубыток там, где pct == премия (quote),
    // то есть move = K + quote − 100. Для остальных типов не считаем.
    breakeven(r) {
      if (r.type === "warrant") return (r.strike || 100) + (r.quote || 0) - 100;
      return null;
    },
    // Границы ползунка {min,max,val}. val (дефолт) — ближайшая круглая точка
    // СТРОГО выше безубытка (результат неотрицателен уже на старте); потолок —
    // заведомо выше безубытка, поэтому прибыль достижима у любого продукта.
    move(r) {
      if (r.type === "warrant") {
        const cs = r.structure === "cs";
        const be = calc.breakeven(r);
        const val = Math.floor(be / 5) * 5 + 5;                 // круглая точка > безубытка
        const capMove = cs ? (r.strike2 || 150) - 100 : 0;      // ход, где выплата упёрлась в потолок
        const max = cs ? Math.ceil(capMove / 5) * 5 + 15        // показать плато потолка
                       : val + 40;                              // запас на рост прибыли
        return { min: -30, max: Math.max(max, val + 20), val };
      }
      // У защиты капитала С ПОТОЛКОМ (cap) диапазон продлеваем ЗА потолок, как у
      // колл-спреда: прежний max = 50 обрывал кадр ровно в точке, где выплата в
      // него упирается, полка не попадала в график — и «Защита капитала · до +50%»
      // рисовалась безлимитным участием, то есть картинка обещала больше продукта
      if (r.type === "protection") {
        const off = (r.strike || 100) - 100;
        const max = r.cap != null ? Math.ceil(r.cap / 5) * 5 + 15 : Math.max(50, off + 40);
        return { min: -30, max: Math.max(max, off + 40), val: Math.max(20, off + 15) };
      }
      if (r.type === "booster") return { min: -30, max: 25, val: (r.strike2 || 110) - 100 };
      // Реверс-конвертибл: весь смысл — вокруг страйка, левее него тело начинает
      // таять. Вправо кадр не растягиваем: выше страйка выплата тела не меняется,
      // и половина графика ушла бы под прямую линию.
      if (r.type === "revconv") {
        const K = r.strike || 100;
        // Кадр обязан вмещать точку, где купоны перестают покрывать просадку тела:
        // это главный ориентир разговора с клиентом, и обрезать его границей кадра
        // значило бы показать продукт опаснее, чем он есть.
        const be = revconvBreakeven(r);
        let lo = Math.min(-55, K - 100 - 30);
        if (be != null && be > 0) lo = Math.min(lo, be - 100 - 8);
        return { min: lo, max: Math.max(20, K - 100 + 20), val: 0 };
      }
      // Автоколл: интересна зона вокруг барьера защиты — ползунок уводим глубоко вниз,
      // вверх достаточно барьера автоотзыва (выше выплата тела уже не меняется).
      if (r.type === "autocall") {
        const prot = r.protectionPct || 65;
        return { min: Math.min(-60, prot - 100 - 15), max: Math.max(30, (r.callBarrier || 120) - 100 + 5), val: 10 };
      }
      return null;
    },
    // Выплата в % от номинала при заданном ходе БА (move, %).
    pct(r, move) {
      if (r.type === "warrant") { const lvl = (r.spot || 100) * (1 + move / 100); return PAYOFF.pct(lvl, r.strike, r.strike2); }
      // Защита капитала: участие начисляется на рост ВЫШЕ страйка опциона (strike, % от
      // начального уровня; 100 = ATM). Раньше страйк игнорировался, и продукт на CALL 105
      // показывал участие уже с нулевого движения.
      // База выплаты — УРОВЕНЬ ЗАЩИТЫ, а не номинал: при защите 80% и отсутствии роста
      // возвращается 80% («Энергетика будущего»: выплата = 80% + 100% × рост корзины).
      // Раньше базой было 100, и защита ниже 100% не работала вовсе: график рисовал
      // полку на 80%, а расчёт платил 100% при любом падении. У всех продуктов доски
      // защита 100%, поэтому их цифры не меняются (floor = 100 → прежняя формула).
      if (r.type === "protection") {
        const p = r.participation, floor = r.protectionPct != null ? r.protectionPct : 100, K = r.strike || 100;
        let v = floor + p * Math.max(100 + move - K, 0);
        if (r.cap != null) v = Math.min(v, floor + p * Math.max(100 + r.cap - K, 0));
        return v;
      }
      if (r.type === "booster") return PAYOFF.booster(100 + move, r.strike || 100, r.strike2 || 110, (r.ku || 175) / 100);
      if (r.type === "autocall") return PAYOFF.autocall(100 + move, r.protectionPct || 65);
      if (r.type === "revconv") return PAYOFF.revconv(100 + move, r.strike || 100);
      return 100;
    }
  };

  // --- Рамка графика выплаты: оси с делениями и подписями ---------------------
  // Одна на все поверхности (доска, карточка, one-pager) и на все типы продуктов.
  // До 10.08.2026 каждый график рисовал «оси» сам: подписью служил то страйк, то
  // барьер, то S₀ — горизонтальная ось называлась у каждого продукта по-своему,
  // а нуля на ней не было видно вовсе. Теперь семантика единая: X — уровень
  // базового актива в % от старта, Y — выплата в % номинала.
  const AXIS_X = "Уровень базового актива, % от старта";
  const AXIS_Y = "Выплата, % номинала";

  // Круглые деления: шаг из ряда 1/2/2.5/5/10 × 10^k, чтобы подписи читались.
  function niceTicks(min, max, target) {
    const span = max - min;
    if (!(span > 0)) return [min];
    const raw = span / Math.max(1, target || 5);
    const mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    const n = raw / mag;
    const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) {
      out.push(Math.round(v * 1e6) / 1e6);
    }
    return out;
  }

  // Возвращает масштабы x()/y() и разметку осей; сам график рисует вызывающий.
  function chartFrame(o) {
    const W = o.W, H = o.H;
    const L = o.padL != null ? o.padL : 58, R = o.padR != null ? o.padR : 26;
    const T = o.padT != null ? o.padT : 20, B = o.padB != null ? o.padB : 48;
    const c = o.colors || {};
    const grid = c.grid || "rgba(255,255,255,0.09)";
    const axis = c.axis || "rgba(255,255,255,0.17)";
    const lab = c.lab || "rgba(255,255,255,0.46)";
    const MONO = 'font-family="JetBrains Mono, monospace"';
    const x = (v) => L + ((v - o.xMin) / (o.xMax - o.xMin)) * (W - L - R);
    const y = (v) => H - B - ((v - o.yMin) / (o.yMax - o.yMin)) * (H - T - B);
    const fs = o.font || 11;                     // на узком экране viewBox уже — кегль крупнее
    const fx = o.xFmt || fmtSmart, fy = o.yFmt || fmtSmart;
    const xt = o.xTicks || niceTicks(o.xMin, o.xMax, o.xCount || 5);
    const yt = o.yTicks || niceTicks(o.yMin, o.yMax, o.yCount || 4);
    let s = "";
    for (const v of yt) {
      const gy = y(v);
      if (gy < T - 1 || gy > H - B + 1) continue;
      s += '<line x1="' + L + '" y1="' + gy.toFixed(1) + '" x2="' + (W - R) + '" y2="' + gy.toFixed(1) +
        '" stroke="' + grid + '" stroke-width="1"/>' +
        '<text x="' + (L - 9) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end" fill="' + lab +
        '" font-size="' + fs + '" ' + MONO + '>' + fy(v) + '</text>';
    }
    for (const v of xt) {
      const gx = x(v);
      if (gx < L - 1 || gx > W - R + 1) continue;
      // Подпись деления центрируется по нему, но у крайних может не поместиться:
      // у дисконтной облигации деления подписаны словами («покупка», «погашение»),
      // и на узком экране «погашение» уходило на 21px за правый край кадра.
      // Прижимаем к границе, когда центрирование не влезает
      const tl = String(fx(v)), half = tl.length * fs * 0.62 / 2;
      const anc = gx + half > W - 2 ? "end" : (gx - half < 2 ? "start" : "middle");
      const tx = anc === "end" ? W - 2 : anc === "start" ? 2 : gx;
      s += '<line x1="' + gx.toFixed(1) + '" y1="' + (H - B) + '" x2="' + gx.toFixed(1) + '" y2="' + (H - B + 5) +
        '" stroke="' + axis + '" stroke-width="1"/>' +
        '<text x="' + tx.toFixed(1) + '" y="' + (H - B + fs + 8) + '" text-anchor="' + anc + '" fill="' + lab +
        '" font-size="' + fs + '" ' + MONO + '>' + tl + '</text>';
    }
    s += '<line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (H - B) + '" stroke="' + axis + '" stroke-width="1"/>' +
      '<line x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) + '" y2="' + (H - B) + '" stroke="' + axis + '" stroke-width="1"/>' +
      '<text x="' + ((L + W - R) / 2) + '" y="' + (H - 9) + '" text-anchor="middle" fill="' + lab + '" font-size="' + fs + '">' +
      (o.xLabel != null ? o.xLabel : AXIS_X) + '</text>' +
      '<text transform="translate(' + (fs + 1) + ' ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle" fill="' + lab +
      '" font-size="' + fs + '">' + (o.yLabel != null ? o.yLabel : AXIS_Y) + '</text>';
    return { x, y, svg: s, L, R, T, B };
  }

  // График выплаты — ОДИН на доску и карточку продукта. Кривая строится из
  // calc.pct, то есть из той же функции, что считает калькулятор: разойтись они
  // не могут. Шкала Y — по данным продукта (вариант А, выбран 10.08.2026):
  // перелом виден крупно, а ноль/номинал помечены пунктиром и подписью деления.
  function payoffChart(r, o) {
    const W = o.W, H = o.H, C = o.colors;
    const MONO = 'font-family="JetBrains Mono, monospace"';
    const fs = o.font || 11;
    const rg = calc.move(r) || { min: -30, max: 30 };
    const mLo = rg.min, mHi = rg.max;
    const base = r.type === "warrant" ? 0 : 100;      // «ноль» выплаты для этого типа
    const pts = [];
    for (let i = 0; i <= 240; i++) {
      const m = mLo + (mHi - mLo) * i / 240;
      pts.push([100 + m, calc.pct(r, m)]);
    }
    const vals = pts.map((p) => p[1]);
    const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    const pad = Math.max(6, (hi - lo) * 0.14);
    const yMin = Math.max(0, Math.min(lo, base) - pad);
    const yMax = hi + pad * (o.headroom || 1.6);       // запас сверху под подписи меток
    const f = chartFrame({ W: W, H: H, xMin: 100 + mLo, xMax: 100 + mHi, yMin: yMin, yMax: yMax,
      colors: C, padL: o.padL, padR: o.padR, padT: o.padT, padB: o.padB,
      font: o.font, xCount: o.xCount, yCount: o.yCount });
    const x = f.x, y = f.y, R = W - f.R;
    const txt = (tx, ty, fill, anchor, s, size) => '<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) +
      '"' + (anchor ? ' text-anchor="' + anchor + '"' : "") + ' fill="' + fill + '" font-size="' + (size || fs) +
      '" ' + MONO + '>' + s + '</text>';
    const hline = (v, col, dash) => '<line x1="' + f.L + '" y1="' + y(v).toFixed(1) + '" x2="' + R +
      '" y2="' + y(v).toFixed(1) + '" stroke="' + col + '" stroke-width="1" stroke-dasharray="' + (dash || "4 4") + '"/>';
    const vline = (v, col) => '<line x1="' + x(v).toFixed(1) + '" y1="' + f.T + '" x2="' + x(v).toFixed(1) +
      '" y2="' + (H - f.B) + '" stroke="' + col + '" stroke-width="1" stroke-dasharray="3 4"/>';
    const diamond = (cx, cy, col) => '<rect x="' + (cx - 4).toFixed(1) + '" y="' + (cy - 4).toFixed(1) +
      '" width="8" height="8" transform="rotate(45 ' + cx.toFixed(1) + " " + cy.toFixed(1) + ')" fill="' + col + '"/>';
    // Подпись по центру над точкой в кадр помещается не всегда: у колл-спреда на
    // узком экране «K₂ 150 · макс. 50%» уезжала на 6px за правый край (там кегль
    // крупнее — 13px). Прижимаем к ближней границе вместо центрирования.
    // Ширина считается по моноширинному кеглю: 0,62em на знак — с запасом
    const txtFit = (cx, ty, fill, str, size) => {
      const w = str.length * (size || fs) * 0.62;
      if (cx + w / 2 > R) return txt(R, ty, fill, "end", str, size);
      if (cx - w / 2 < f.L) return txt(f.L, ty, fill, null, str, size);
      return txt(cx, ty, fill, "middle", str, size);
    };
    // Подпись НАД наклонной линией. Фиксированный отступ не годится: линия идёт
    // под углом (а у автоколла ещё и скачком на барьере) и проходит сквозь текст.
    // Центр смещаем так, чтобы рамка целиком легла на нужный участок [loLvl;hiLvl],
    // и отступаем от САМОЙ ВЫСОКОЙ точки линии под этой рамкой
    const labelAbove = (cLvl, loLvl, hiLvl, str, fill, size) => {
      const half = (str.length * (size || fs) * 0.62 / 2 + 6) / (x(101) - x(100));
      const c = Math.max(loLvl + half, Math.min(cLvl, hiLvl - half));
      let top = Infinity;
      for (let i = 0; i <= 10; i++) top = Math.min(top, y(calc.pct(r, c - half + 2 * half * i / 10 - 100)));
      return txtFit(x(c), top - 9, fill, str, size);
    };

    // Базовая линия выплаты: 0 у варранта, номинал 100% у бумаг с возвратом тела
    let s = hline(base, C.axis) + txt(R, y(base) - 7, C.lab, "end", base ? "номинал 100%" : "выплата 0");
    const K = r.strike || 100;

    if (r.type === "warrant") {
      const q = r.quote || 0, be = K + q, cap = r.strike2 ? r.strike2 - K : 0;
      s += hline(q, C.gold) + txt(f.L + 3, y(q) - 7, C.gold, null, "премия " + fmt1(q) + "%");
      if (r.strike2) {
        s += hline(cap, C.grid, "2 4") +
          diamond(x(r.strike2), y(cap), C.line) +
          txtFit(x(r.strike2), y(cap) - 10, C.lab2, "K₂ " + fmtSmart(r.strike2) + " · макс. " + fmtSmart(cap) + "%");
      }
      // Страйк подписываем НАД осью и левее ромба: у варранта нулевая выплата лежит
      // ровно на нижней оси, и подпись под ромбом налезала на деление шкалы.
      // Слева от страйка выплата плоская — место свободно.
      s += diamond(x(K), y(0), C.line) + txt(x(K) - 8, y(0) - 9, C.lab2, "end", "K " + fmtSmart(K));
      if (be >= 100 + mLo && be <= 100 + mHi) {
        const end = x(be) > W * 0.75;
        s += '<circle cx="' + x(be).toFixed(1) + '" cy="' + y(q).toFixed(1) + '" r="4.5" fill="' + C.gold + '"/>' +
          txt(x(be) + (end ? -8 : 8), y(q) + 16, C.gold, end ? "end" : null, "б/у " + fmtSmart(be));
      }
    } else if (r.type === "protection") {
      const floor = r.protectionPct != null ? r.protectionPct : 100, part = r.participation || 1;
      if (floor !== 100) s += hline(floor, C.axis) + txt(f.L + 3, y(floor) + 15, C.lab2, null, "защита " + fmtSmart(floor) + "%");
      s += diamond(x(K), y(calc.pct(r, K - 100)), C.line) +
        txt(x(K), y(calc.pct(r, K - 100)) + 18, C.lab2, "middle", K === 100 ? "S₀" : "K " + fmtSmart(K));
      // Потолок — ТОЛЬКО при заданном cap: у обычной защиты капитала участие не
      // ограничено, и полка справа превратила бы картинку в колл-спред.
      // Уровень БА, на котором выплата упирается в потолок, — ровно 100 + cap.
      // Подпись прижата к правому краю: по центру над ромбом «потолок 150% ·
      // макс. 160%» вылезает за кадр (164px против 130 свободных)
      const capLvl = r.cap != null ? 100 + r.cap : null;
      if (capLvl != null) {
        const capPay = calc.pct(r, r.cap);
        s += hline(capPay, C.grid, "2 4") +
          diamond(x(capLvl), y(capPay), C.line) +
          txt(R, y(capPay) - 11, C.lab2, "end", "потолок " + fmtSmart(capLvl) + "% · макс. " + fmtSmart(capPay) + "%");
      }
      // Подпись участия ставится над САМОЙ ВЫСОКОЙ точкой линии под своей рамкой,
      // а не над её серединой: линия наклонная, и при фиксированном отступе 11px
      // она проходила СКВОЗЬ текст (замер: путь пересекал bbox подписи). Ширину
      // рамки считаем по моноширинному кеглю — 0,6em на знак плюс запас
      const upTo = capLvl != null ? capLvl : 100 + mHi;
      s += labelAbove((K + upTo) / 2, K, upTo, "участие " + Math.round(part * 100) + "%", C.line);
    } else if (r.type === "booster") {
      const K2 = r.strike2 || 110, ku = (r.ku || 175) / 100, capPay = K + ku * (K2 - K);
      s += hline(capPay, C.grid, "2 4") + txt(R, y(capPay) - 8, C.gold, "end", "потолок +" + fmt1(capPay - 100) + "%") +
        diamond(x(K), y(K), C.line) + txt(x(K), y(K) + 18, C.lab2, "middle", "S₀") +
        labelAbove(100 + mLo + (K - 100 - mLo) * 0.45, 100 + mLo, K, "падение 1:1", C.lab) +
        txt(x(K2) + 6, y(capPay) + 17, C.gold, null, "рост ×" + Math.round(ku * 100) + "%");
    } else if (r.type === "autocall") {
      const prot = r.protectionPct || 65, cpn = r.couponBarrier || prot, call = r.callBarrier || 120;
      const vmark = (v, col, label, anchor) => vline(v, col) +
        txt(x(v) + (anchor === "end" ? -6 : 6), f.T + 11, col, anchor, label);
      s += vmark(call, C.gold, "автоотзыв " + fmtSmart(call) + "%", "end");
      if (cpn !== prot) s += vmark(cpn, C.lab, "купон " + fmtSmart(cpn) + "%", "end");
      s += '<circle cx="' + x(prot).toFixed(1) + '" cy="' + y(100).toFixed(1) + '" r="3.8" fill="' + C.line + '"/>' +
        txt(x(prot) - 8, y(100) + 17, C.lab2, "end", "защита " + fmtSmart(prot) + "%");
      // Та же правка, что у защиты капитала: ниже барьера выплата идёт по
      // перформансу, то есть наклонной линией, и подпись с фиксированным отступом
      // 11px оказывалась на ней. Отступ считаем от самой высокой точки под рамкой
      // Верхняя граница участка — БАРЬЕР: правее него выплата скачком уходит на
      // 100%, и подпись, зайдя за него краем, оказывалась под этой полкой
      s += labelAbove((100 + mLo + prot) / 2, 100 + mLo, prot, "по перформансу", C.lab);
    } else if (r.type === "revconv") {
      const K = r.strike || 100;
      // Страйк — единственный перелом кривой: правее тело целое, левее оно тает.
      s += diamond(x(K), y(100), C.line) +
        txt(x(K) + 9, y(100) + 17, C.lab2, null, K === 100 ? "страйк S₀" : "страйк " + fmtSmart(K) + "%");
      // Уровень, ниже которого купоны за срок перестают покрывать просадку тела —
      // тот же смысл, что «б/у» у варранта. Не рисуем, если срок или купон не
      // распознаны: выдуманная граница риска хуже отсутствующей.
      // Подпись вертикали идёт ВНИЗУ, у оси, а не под верхней кромкой, как у
      // автоколла: наверху уже стоит «перформанс от страйка», и при глубоком
      // страйке их рамки пересекались (замер на корзине со страйком 80% и
      // купоном за три года). Внизу под вертикалью пусто при любом страйке —
      // линия выплаты в этой точке заведомо выше.
      const cush = revconvBreakeven(r);
      if (cush != null && cush > 100 + mLo && cush < K - 1) {
        // Сторона подписи зависит от места: при страйке 100% и коротком сроке
        // точка покрытия стоит у самого правого края, и подпись вправо уезжала
        // за кадр (замер на телефоне: Газпром, б/у 91,25%). Слева от вертикали
        // место есть всегда — там наклонный участок, а не текст.
        const cl = "б/у с купоном " + fmtSmart(cush) + "%";
        const fits = x(cush) + 6 + cl.length * fs * 0.62 <= R;
        s += vline(cush, C.gold) +
          txt(x(cush) + (fits ? 6 : -6), H - f.B - 6, C.gold, fits ? null : "end", cl);
      }
      s += labelAbove((100 + mLo + K) / 2, 100 + mLo, K, "перформанс от страйка", C.lab);
    }
    const d = pts.map((p, i) => (i ? "L" : "M") + x(p[0]).toFixed(1) + " " + y(p[1]).toFixed(1)).join(" ");
    s += '<path d="' + d + '" fill="none" stroke="' + C.line + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block">' + f.svg + s + '</svg>';
  }

  // Дисконтная облигация — единственная, у которой по горизонтали не уровень БА,
  // а срок: выплата от рынка не зависит, бумага просто дорастает до номинала.
  function discountChart(r, o) {
    const W = o.W, H = o.H, C = o.colors;
    const MONO = 'font-family="JetBrains Mono, monospace"';
    const q = r.quote;
    const f = chartFrame({ W: W, H: H, xMin: 0, xMax: 100, yMin: Math.max(0, q - 12), yMax: 108,
      colors: C, padL: o.padL, padR: o.padR, padT: o.padT, padB: o.padB,
      font: o.font, yCount: o.yCount, xLabel: "Срок жизни выпуска", xTicks: [0, 100], xFmt: (v) => (v ? "погашение" : "покупка") });
    const R = W - f.R;
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block">' + f.svg +
      '<line x1="' + f.L + '" y1="' + f.y(100).toFixed(1) + '" x2="' + R + '" y2="' + f.y(100).toFixed(1) +
      '" stroke="' + C.axis + '" stroke-width="1" stroke-dasharray="4 4"/>' +
      '<text x="' + R + '" y="' + (f.y(100) - 7).toFixed(1) + '" text-anchor="end" fill="' + C.lab +
      '" font-size="11" ' + MONO + '>номинал 100%</text>' +
      '<path d="M' + f.x(0).toFixed(1) + " " + f.y(q).toFixed(1) + " L" + f.x(100).toFixed(1) + " " + f.y(100).toFixed(1) +
      '" fill="none" stroke="' + C.line + '" stroke-width="2.5" stroke-linecap="round"/>' +
      '<circle cx="' + f.x(0).toFixed(1) + '" cy="' + f.y(q).toFixed(1) + '" r="4.5" fill="' + C.gold + '"/>' +
      // Подпись НИЖЕ точки входа, а не вровень с ней: линия идёт из этой точки
      // вверх-вправо, и при отступе +4 она прорезала текст по всей его длине
      '<text x="' + (f.x(0) + 9).toFixed(1) + '" y="' + (f.y(q) + 17).toFixed(1) + '" fill="' + C.gold +
      '" font-size="11" ' + MONO + '>вход ' + fmt2(q) + '% · доход +' + fmt2(100 - q) + ' п.п.</text>' +
      '</svg>';
  }

  // Срок в годах из подписи tenor: «9 месяцев» → 0.75, «2 года» → 2.
  // Ноль означает «не распознан» — вызывающий обязан это проверить: цифра,
  // посчитанная из выдуманного срока, на витрине выглядит так же уверенно.
  function tenorYears(r) {
    const t = String((r && r.tenor) || "");
    const m = /(\d+(?:[.,]\d+)?)\s*мес/i.exec(t);
    if (m) return parseFloat(m[1].replace(",", ".")) / 12;
    const y = /(\d+(?:[.,]\d+)?)/.exec(t);
    return y ? parseFloat(y[1].replace(",", ".")) : 0;
  }

  // Реверс-конвертибл: уровень базового актива, на котором купоны за весь срок
  // ровно покрывают просадку тела. Тело(S) = S/K·100, купоны = купон×срок, и
  // S/K·100 + купоны = 100 даёт S = K·(100 − купоны)/100.
  // null — если срока или купона нет; 0 — если купоны покрывают любое падение
  // (сумма купонов ≥ 100% номинала).
  function revconvBreakeven(r) {
    const K = (r && r.strike) || 100, yrs = tenorYears(r);
    const cpn = (r && (r.couponPa != null ? r.couponPa : r.quote)) || 0;
    if (!(yrs > 0) || !(cpn > 0)) return null;
    const total = cpn * yrs;
    return total >= 100 ? 0 : K * (100 - total) / 100;
  }

  function displayName(r) { return r.name; }

  // Возвращает null, если продукта с таким id нет (снят с витрины, битая ссылка,
  // пустой ?id). Подставлять вместо него первый инструмент каталога НЕЛЬЗЯ:
  // клиент видел бы чужой продукт с настоящей котировкой, считая, что смотрит
  // присланный сейлзом. Вызывающие обязаны обработать null.
  function findInstrument(id) {
    return INSTRUMENTS.find(r => r.id === id) || null;
  }

  function instrumentsOfType(type) {
    return INSTRUMENTS.filter(r => r.type === type);
  }

  // Инфо о базовом активе (описание, динамика) — из update_site.py.
  function underlyingInfo(name) {
    return UNDERLYINGS[name] || null;
  }

  // Детерминированная история котировки (демо).
  function history(id, quote) {
    let seed = 0;
    for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const n = 30, out = new Array(n);
    out[n - 1] = quote;
    for (let i = n - 2; i >= 0; i--) {
      const step = (rnd() - 0.5) * quote * 0.02;
      out[i] = Math.max(quote * 0.4, out[i + 1] - step);
    }
    return out;
  }

  // --- Форматирование ------------------------------------------------------

  function fmtInt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0"); }
  function fmt2(n) {
    const parts = n.toFixed(2).split(".");
    return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0") + "," + parts[1];
  }
  function fmt1(n) { return n.toFixed(1).replace(".", ","); }
  // Крупная котировка: целая часть большая, дробь и «%» мельче (иначе запятая
  // моношрифта висит с большими зазорами). Возвращает HTML — вставлять как innerHTML.
  function quoteBig(n) {
    const s = fmt2(n), c = s.indexOf(",");
    const intp = c >= 0 ? s.slice(0, c) : s;
    const dec = c >= 0 ? s.slice(c + 1) : "";
    const tail = (dec && dec !== "00") ? "," + dec + "%" : "%";
    return intp + '<span class="q-dec">' + tail + '</span>';
  }
  function fmtSmart(v) {
    if (Math.abs(v) >= 1000) return fmtInt(v);
    return String(parseFloat(v.toFixed(2))).replace(".", ",");
  }
  function daysTo(expiry) {
    const p = expiry.split(".").map(Number);
    return Math.max(0, Math.ceil((new Date(p[2], p[1] - 1, p[0]).getTime() - Date.now()) / 86400000));
  }

  function underlyingLong(name) { return UNDERLYING_LONG[name] || null; }

  // Валюта инструмента для витрины. Если экономика считается в одной валюте, а
  // денежные расчёты идут в другой (поле settle) — показываем обе:
  // «USD · расчёты в ₽». Иначе — просто код валюты.
  // Период non-call словами: 1 → «Первый период», 3 → «Первые 3 периода».
  // Раньше склеивалось «Первые 1 период» — грамматика ломалась на единице.
  function nonCallText(n) {
    n = Number(n) || 0;
    if (n <= 0) return "";
    if (n === 1) return "Первый период";
    const t = n % 10, h = n % 100;
    const w = (t >= 2 && t <= 4 && (h < 10 || h >= 20)) ? "периода" : "периодов";
    return "Первые " + n + " " + w;
  }

  const CCY_SIGN = { RUB: "₽", USD: "$", EUR: "€", CNY: "¥" };
  function ccyLabel(r) {
    const c = (r && r.currency) || "RUB", s = r && r.settle;
    if (!s || s === c) return c;
    return c + " · расчёты в " + (CCY_SIGN[s] || s);
  }

  // Чувствителен ли инструмент к валютному курсу: базовый актив в иностранной валюте.
  // Валютные пары (USD/RUB, CNY/RUB) исключаем — там курс и есть базовый актив.
  function isFxSensitive(name) {
    const n = String(name || "");
    if (/USD\s*\/?\s*RUB|CNY\s*\/?\s*RUB|USDRUB|CNYRUB|валют|курс/i.test(n)) return false;
    return /S&P|NASDAQ|NVDA|NVIDIA|NBIS|Nebius|BTC|IBIT|GLD|SPY|COPX|CSI|URA|Uranium|Bitcoin|Gold|USD|\$/i.test(n);
  }

  return { TYPES, INSTRUMENTS, PAYOFF, LEGAL, calc, displayName, tenorYears, revconvBreakeven, findInstrument, instrumentsOfType, underlyingInfo, underlyingLong, isFxSensitive, ccyLabel, nonCallText, history, fmtInt, fmt2, fmt1, fmtSmart, quoteBig, daysTo, chartFrame, niceTicks, payoffChart, discountChart, AXIS_X, AXIS_Y };

})();
