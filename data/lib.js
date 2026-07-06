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
      chipFg: "#2E7D57", chipBg: "#E2EDE5",
      desc: "Облигация покупается дешевле номинала, на погашение выплачивается 100%. Доход — дисконт, и он известен в день покупки.",
      paramLabel: "Доходность"
    },
    protection: {
      slug: "protection",
      title: "Защита капитала",
      chip: "Сбалансированный",
      chipFg: "#2B4A78", chipBg: "#DCE6F2",
      desc: "Нота с возвратом 100% номинала при любом сценарии и участием в росте базового актива.",
      paramLabel: "Участие"
    },
    warrant: {
      slug: "warrant",
      title: "Варранты",
      chip: "Активный",
      chipFg: "#B07B22", chipBg: "#F4E9D4",
      desc: "Варрант на рост базового актива: выплата на экспирацию — Ном × max(S − K; 0). Котировка — в процентах от номинала; премия — максимальный риск покупателя.",
      paramLabel: "Страйк"
    }
  };

  const INSTRUMENTS = (window.SITE_DATA || {}).instruments || [];

  // --- Продукт -------------------------------------------------------------

  const PAYOFF = {
    formulaText: "Ном × max(S − K; 0)",
    // Выплата варранта в % от номинала. Конвенция: нормировка на страйк, (S − K) / K.
    pct(S, K) { return Math.max(S - K, 0) / K * 100; }
  };

  function displayName(r) { return r.name; }

  function findInstrument(id) {
    return INSTRUMENTS.find(r => r.id === id) || INSTRUMENTS[0];
  }

  function instrumentsOfType(type) {
    return INSTRUMENTS.filter(r => r.type === type);
  }

  // Годовая доходность дисконтной облигации к погашению (простая).
  function yieldAnnual(r) {
    const d = daysTo(r.expiry);
    if (!d) return 0;
    return (100 / r.quote - 1) * (365 / d) * 100;
  }

  // Значение ключевого параметра для колонки доски.
  function paramValue(r) {
    if (r.type === "warrant") return fmtSmart(r.strike);
    if (r.type === "discount") return fmt1(yieldAnnual(r)) + "% год.";
    if (r.type === "protection") return Math.round(r.participation * 100) + "% роста";
    return "";
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
  function fmtSmart(v) {
    if (Math.abs(v) >= 1000) return fmtInt(v);
    return String(parseFloat(v.toFixed(2))).replace(".", ",");
  }
  function daysTo(expiry) {
    const p = expiry.split(".").map(Number);
    return Math.max(0, Math.ceil((new Date(p[2], p[1] - 1, p[0]).getTime() - Date.now()) / 86400000));
  }

  return { TYPES, INSTRUMENTS, PAYOFF, displayName, findInstrument, instrumentsOfType, yieldAnnual, paramValue, history, fmtInt, fmt2, fmt1, fmtSmart, daysTo };

})();
