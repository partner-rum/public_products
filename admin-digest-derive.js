/* Вывод идеи дайджеста из готового продукта доски/размещения.
   Общий код для админки (admin.html) и интеграционного теста — чтобы цифры в дайджесте
   не расходились с витриной и сейлз НЕ вводил их руками. Работает и в браузере, и в Node. */
(function (g) {
  "use strict";
  function num(v) { var n = Number(v); return isFinite(n) ? n : null; }
  function comma(v) { return String(v).replace(".", ","); }
  function rub(pct) { return Math.round(pct * 10).toLocaleString("ru-RU").replace(/ /g, " ") + " ₽ · " + comma(pct) + "% ном."; }
  function isFx(cur) { return /usd|eur|\$|€/i.test(String(cur || "")); }
  // Склонение: «1 наблюдение», «3 наблюдения», «5 наблюдений» — иначе в тексте
  // получалось «Первые 1 наблюдения».
  function plu(n, one, few, many) {
    var a = n % 10, b = n % 100;
    return (a === 1 && b !== 11) ? one : (a >= 2 && a <= 4 && (b < 12 || b > 14)) ? few : many;
  }

  // Продукт доски (instruments.js) → идея. Возвращает {supported:false,reason} для неподдержанных.
  function fromBoard(p) {
    var t = p.type, strike = num(p.strike), strike2 = num(p.strike2), ku = num(p.ku), quote = num(p.quote);
    var base = { underlying: p.underlying || p.name, name: p.name, tenor: p.tenor || "",
                 fx: isFx(p.currency), p: { asset: p.underlying || p.name } };

    if (t === "warrant") {
      var structure = p.structure || "call";
      var isSpread = structure === "cs" || structure === "callspread";
      if (structure !== "call" && !isSpread) {
        return { supported: false, reason: "Тип варранта «" + structure + "» пока не поддержан в дайджесте (нет графика выплаты). Поддержаны call и call-spread (cs)." };
      }
      if (quote == null) return { supported: false, reason: "У продукта нет котировки (премии)." };
      base.family = "warrant"; base.kind = "Варрант";
      base.p.price = rub(quote); base.p.protection = "нет";
      if (isSpread && strike != null && strike2 != null) {
        var cap = strike2 - strike;
        base.metric = { v: "+" + comma(cap) + "%", k: "потолок роста" };
        base.p.upside = "рост актива до +" + comma(cap) + "%";
        base.payoff = { type: "callcap", premiumPct: quote, capPct: cap, strikePct: strike };
      } else {
        base.metric = { v: comma(quote) + "%", k: "премия от номинала" };
        base.p.upside = "рост актива, без потолка";
        base.payoff = { type: "call", premiumPct: quote };
        if (strike != null) base.payoff.strikePct = strike;
      }
      return base;
    }

    if (t === "booster") {
      if (strike == null || strike2 == null || ku == null) return { supported: false, reason: "У бустера не заданы strike/strike2/ku." };
      var bcap = Math.round((strike2 - strike) * ku / 100 * 100) / 100;
      base.family = "booster"; base.kind = "Бустер";
      base.metric = { v: "+" + comma(bcap) + "%", k: "максимум" };
      base.p.price = "100% номинала";
      base.p.upside = "×" + ku + "% в диапазоне " + strike + "–" + strike2 + "%, максимум +" + comma(bcap) + "%";
      base.p.protection = "нет";
      base.payoff = { type: "booster", kuPct: ku, capPct: bcap };
      return base;
    }

    if (t === "discount") {
      if (quote == null) return { supported: false, reason: "У дисконтной облигации нет цены (quote)." };
      var gain = Math.round((100 / quote - 1) * 100);
      base.family = "discount"; base.kind = "Дисконтная облигация";
      base.metric = { v: "+" + gain + "%", k: "доход к погашению" };
      base.p.price = rub(quote);
      base.p.upside = "+" + gain + "% к погашению по 100%";
      base.p.protection = "погашение по 100% номинала";
      base.payoff = { type: "fixed", entryPct: quote, gainPct: gain };
      return base;
    }

    if (t === "protection") {
      var floor = num(p.protectionPct); if (floor == null) floor = 100;
      var part = num(p.participation); if (part == null) part = 1;
      // participation в instruments.js — доля (1.2), на витрине показывается процентами
      var partPct = Math.round(part * 100);
      var K = strike != null ? strike : 100;
      // cap — потолок РОСТА БАЗОВОГО АКТИВА в п.п. от старта (так же читает его витрина,
      // calc.pct в data/lib.js). Максимальная выплата из него считается, а не равна ему:
      // при участии 90% и потолке +50% клиент получает не более +45%.
      var pcap = num(p.cap);
      if (pcap != null && 100 + pcap <= K) pcap = null;      // потолок ниже страйка — данные битые
      var maxGain = pcap != null ? Math.round(partPct / 100 * (100 + pcap - K) * 100) / 100 : null;
      base.family = "protection"; base.kind = "Структурная облигация · защита капитала";
      base.metric = { v: floor + "%", k: "защита капитала" };
      base.p.price = "100% номинала";
      base.p.upside = partPct + "% роста базового актива" + (K > 100 ? " выше +" + comma(K - 100) + "%" : "") +
                      (pcap != null ? " до +" + comma(pcap) + "%, максимум +" + comma(maxGain) + "%" : "");
      base.p.protection = floor + "%";
      base.payoff = { type: "protected", floorPct: floor, partPct: partPct, strikePct: K };
      if (pcap != null) base.payoff.capPct = pcap;
      return base;
    }

    if (t === "autocall") {
      // Купон и барьеры — обязательные параметры: без них продукт не описать,
      // а выдумывать их нельзя. Остальное (nonCall, наблюдения) необязательно.
      var cpn = num(p.couponPa), cb = num(p.couponBarrier), callB = num(p.callBarrier);
      var floorAC = num(p.protectionPct);
      if (cpn == null) return { supported: false, reason: "У автоколла не задан купон (couponPa)." };
      if (cb == null) return { supported: false, reason: "У автоколла не задан барьер купона (couponBarrier)." };
      var obsY = num(p.obsPerYear), nc = num(p.nonCall);
      // Число наблюдений за срок: из срока в годах и частоты. Срок в данных —
      // строка («3 года»), поэтому вытаскиваем первое число.
      var yrs = num((String(p.tenor || "").match(/[\d.,]+/) || [""])[0].replace(",", "."));
      var obsTotal = (obsY != null && yrs != null) ? Math.round(obsY * yrs) : null;
      var basket = Array.isArray(p.basket) ? p.basket : null;

      base.family = "coupon"; base.kind = "Автоколл";
      base.metric = { v: comma(cpn) + "% годовых", k: "условный купон" };
      base.p.price = "100% номинала";
      base.p.upside = "условный купон " + comma(cpn) + "% годовых, пока" +
                      (basket ? " худшая бумага корзины" : " базовый актив") +
                      " держится выше " + comma(cb) + "%";
      base.p.protection = floorAC != null ? "барьер " + comma(floorAC) + "% на погашении" : "барьерная";
      base.payoff = { type: "autocall", couponPa: cpn, couponBarrier: cb };
      if (callB != null) base.payoff.callBarrier = callB;
      if (floorAC != null) base.payoff.floorPct = floorAC;
      if (nc != null) base.payoff.nonCall = nc;
      if (obsTotal != null) base.payoff.obsTotal = obsTotal;
      if (obsY != null) base.payoff.obsPerYear = obsY;
      if (basket) base.payoff.basket = basket;
      return base;
    }

    // Купонный варрант НЕ подставляем намеренно. В дайджесте пэйофф с этим именем
    // уже есть, но он рисует ОБЛИГАЦИОННУЮ форму: линия идёт от номинала 100% вверх
    // на купон. У варрантной формы выплата считается от нуля и номинал не
    // возвращается — та же картинка обещала бы клиенту возврат вложенного.
    // Чтобы вывести диджитал в дайджест, нужен свой пэйофф в data/digest-lib.js
    // и make_digest.py (экран и печать рисуют независимо).
    if (t === "digital") {
      return { supported: false, reason: "Купонный варрант в дайджест пока не выводится: график дайджеста рисует диджитал от номинала, а у варрантной формы номинал не возвращается — картинка обещала бы возврат вложенного. Опишите идею вручную или выберите другой продукт." };
    }

    return { supported: false, reason: "Тип продукта «" + t + "» не поддержан в дайджесте." };
  }

  // Выпуск «На размещении» (offerings.js) → идея. Поддержана защита капитала.
  function fromOffering(o) {
    if (o.family !== "protection") {
      return { supported: false, reason: "В дайджест из «Размещений» пока поддержаны только продукты с защитой капитала (family=protection)." };
    }
    var floor = num(String(o.protection || "").replace("%", ""));
    // participation в offerings.js — строка («100%»), в отличие от доли на доске
    var partPct = num(String(o.participation == null ? "" : o.participation).replace("%", ""));
    var pf = { type: "protected", floorPct: floor != null ? floor : 100 };
    if (partPct != null) pf.partPct = partPct;
    return {
      family: "protection", kind: o.kind || "Структурная облигация · защита капитала",
      underlying: o.reference || o.name, name: o.name, tenor: o.tenor || "",
      fx: isFx(o.currency) || !!o.fx,
      metric: { v: o.protection || (floor != null ? floor + "%" : ""), k: "защита капитала" },
      p: { asset: o.reference || o.name, price: "100% номинала",
           upside: (o.participation || "100%") + " роста базового актива",
           protection: o.protection || (floor != null ? floor + "%" : "есть") },
      payoff: pf,
    };
  }

  // Авто-тексты «как заработать» и «структура выплаты» по типу продукта — чтобы сейлз
  // не описывал механику руками (она и так однозначно следует из типа и цифр).
  function attachHowPayout(r) {
    var pf = r.payoff || {}, cap = pf.capPct, ku = pf.kuPct, gain = pf.gainPct, entry = pf.entryPct, floor = pf.floorPct;
    if (r.family === "warrant") {
      r.how = "Варрант: инвестор оплачивает только премию и получает участие в росте базового актива на весь номинал, без маржин-коллов.";
      r.payout = pf.type === "callcap"
        ? "Выплата равна росту актива выше страйка (максимум +" + comma(cap) + "%), рассчитанному от номинала; премия не возвращается."
        : "Выплата равна росту актива выше страйка, рассчитанному от номинала; премия не возвращается.";
    } else if (r.family === "booster") {
      r.how = "Бустер: рост внутри диапазона засчитывается с коэффициентом " + ku + "% (максимум +" + comma(cap) + "%); при падении — участие один к одному, как в самой бумаге.";
      r.payout = "При росте — усиленное участие в динамике, максимум +" + comma(cap) + "%. При снижении выплата номинала уменьшается пропорционально падению актива.";
    } else if (r.family === "discount") {
      r.how = "Дисконтная облигация: покупка ниже номинала (" + entry + "%), погашение по 100%. Доход +" + gain + "% зафиксирован в день сделки и не требует роста рынка.";
      r.payout = "В дату погашения выплачивается 100% номинала. Промежуточных купонов нет.";
    } else if (pf.type === "autocall") {
      // Механика автоколла: наблюдения, память купона, досрочный отзыв, worst-of.
      // Тексты обычного купона здесь были бы неверны — там одна выплата и один барьер.
      var wo = pf.basket && pf.basket.length ? "худшая бумага корзины (" + pf.basket.join(", ") + ")" : "базовый актив";
      var per = pf.obsPerYear ? (pf.obsPerYear === 4 ? "ежеквартально" : pf.obsPerYear === 12 ? "ежемесячно" :
                pf.obsPerYear === 2 ? "раз в полгода" : pf.obsPerYear + " раза в год") : "на каждом наблюдении";
      var ncTxt = pf.nonCall
        ? (pf.nonCall === 1
            ? " На первом наблюдении выпуск не отзывается."
            : " Первые " + pf.nonCall + " " + plu(pf.nonCall, "наблюдение", "наблюдения", "наблюдений") +
              " выпуск не отзывается.")
        : "";
      // Полный состав корзины называем ОДИН раз, дальше короткая форма: иначе
      // список бумаг повторялся трижды в двух абзацах и забивал текст.
      var woShort = pf.basket && pf.basket.length ? "худшая бумага корзины" : "базовый актив";
      var callTxt = pf.callBarrier != null
        ? " Если на дату наблюдения " + woShort + " выше " + comma(pf.callBarrier) +
          "%, выпуск гасится досрочно с номиналом и купоном." : "";
      r.how = "Автоколл: условный купон " + comma(pf.couponPa) + "% годовых начисляется " + per +
              ", пока " + wo + " держится выше " + comma(pf.couponBarrier) +
              "%. Пропущенные купоны копятся и выплачиваются позже — это память купона." +
              ncTxt + callTxt;
      r.payout = "Купон выплачивается, когда " + woShort + " на дату наблюдения выше " +
                 comma(pf.couponBarrier) + "%; иначе купон не теряется, а переносится." +
                 (pf.floorPct != null
                   ? " На погашении номинал возвращается полностью, пока " + woShort + " выше " +
                     comma(pf.floorPct) + "%; ниже — выплата уменьшается пропорционально падению."
                   : " Условия погашения — в спецификации выпуска.");
    } else if (r.family === "protection") {
      // участие и страйк знаем не всегда (у первички в данных может не быть) — текст
      // подстраиваем, а не подставляем «100%» по умолчанию: это была бы выдуманная цифра
      var part = pf.partPct, K = pf.strikePct, pcap = pf.capPct;
      var above = K != null && K > 100 ? " выше +" + comma(K - 100) + "%" : "";
      var grow = (part != null ? part + "% роста базового актива" : "участие в росте базового актива") + above;
      // потолок называем максимальной ВЫПЛАТОЙ: клиенту важен его результат, а не уровень актива
      var maxGain = pcap != null && part != null
        ? Math.round(part / 100 * (100 + pcap - (K != null ? K : 100)) * 100) / 100 : null;
      var capTxt = maxGain != null ? " (максимум +" + comma(maxGain) + "%)"
                 : pcap != null ? " (рост актива засчитывается до +" + comma(pcap) + "%)" : "";
      r.how = "Защита капитала " + floor + "%: при погашении возвращается не менее " + floor +
              "% номинала плюс " + grow + capTxt + ".";
      r.payout = "Выплата = " + floor + "% номинала плюс " + grow + capTxt +
                 ". Если актив не вырос — возврат " + floor + "% номинала.";
    } else {
      r.how = "Диверсифицированная облигационная стратегия."; r.payout = "Выплата равна стоимости портфеля на дату погашения.";
    }
    return r;
  }

  g.deriveDigestIdea = function (product, source) {
    if (!product) return { supported: false, reason: "Продукт не выбран." };
    var r = source === "offering" ? fromOffering(product) : fromBoard(product);
    if (r && r.supported === false) return r;
    r.supported = true;
    return attachHowPayout(r);
  };
})(typeof window !== "undefined" ? window : globalThis);
