/* Вывод идеи дайджеста из готового продукта доски/размещения.
   Общий код для админки (admin.html) и интеграционного теста — чтобы цифры в дайджесте
   не расходились с витриной и сейлз НЕ вводил их руками. Работает и в браузере, и в Node. */
(function (g) {
  "use strict";
  function num(v) { var n = Number(v); return isFinite(n) ? n : null; }
  function comma(v) { return String(v).replace(".", ","); }
  function rub(pct) { return Math.round(pct * 10).toLocaleString("ru-RU").replace(/ /g, " ") + " ₽ · " + comma(pct) + "% ном."; }
  function isFx(cur) { return /usd|eur|\$|€/i.test(String(cur || "")); }

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
        base.payoff = { type: "callcap", premiumPct: quote, capPct: cap };
      } else {
        base.metric = { v: comma(quote) + "%", k: "премия от номинала" };
        base.p.upside = "рост актива, без потолка";
        base.payoff = { type: "call", premiumPct: quote };
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

    return { supported: false, reason: "Тип продукта «" + t + "» не поддержан в дайджесте." };
  }

  // Выпуск «На размещении» (offerings.js) → идея. Поддержана защита капитала.
  function fromOffering(o) {
    if (o.family !== "protection") {
      return { supported: false, reason: "В дайджест из «Размещений» пока поддержаны только продукты с защитой капитала (family=protection)." };
    }
    var floor = num(String(o.protection || "").replace("%", ""));
    return {
      family: "protection", kind: o.kind || "Структурная облигация · защита капитала",
      underlying: o.reference || o.name, name: o.name, tenor: o.tenor || "",
      fx: isFx(o.currency) || !!o.fx,
      metric: { v: o.protection || (floor != null ? floor + "%" : ""), k: "защита капитала" },
      p: { asset: o.reference || o.name, price: "100% номинала",
           upside: (o.participation || "100%") + " роста базового актива",
           protection: o.protection || (floor != null ? floor + "%" : "есть") },
      payoff: { type: "protected", floorPct: floor != null ? floor : 100 },
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
    } else if (r.family === "protection") {
      r.how = "Защита капитала " + floor + "%: при погашении возвращается не менее " + floor + "% номинала плюс участие в росте базового актива.";
      r.payout = "Выплата = " + floor + "% + участие в росте базового актива. Если актив не вырос — возврат " + floor + "% номинала.";
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
