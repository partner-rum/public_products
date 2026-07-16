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

  function payoffSvg(p, color) {
    const W = 300, H = 130, PAD = 16;
    const x = t => PAD + t * (W - PAD * 2), y = t => PAD + t * (H - PAD * 2);
    let el = "";
    if (p.type === "callcap") {
      const line = "M" + x(0) + " " + y(0.85) + " L" + x(0.38) + " " + y(0.85) + " L" + x(0.74) + " " + y(0.15) + " L" + x(1) + " " + y(0.15);
      el = '<line x1="' + PAD + '" y1="' + y(0.15) + '" x2="' + (W - PAD) + '" y2="' + y(0.15) + '" stroke="rgba(255,255,255,0.17)" stroke-width="1" stroke-dasharray="2 4"/>' +
        '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<rect x="' + (x(0.74) - 3.5) + '" y="' + (y(0.15) - 3.5) + '" width="7" height="7" transform="rotate(45 ' + x(0.74) + ' ' + y(0.15) + ')" fill="' + color + '"/>' +
        '<text x="' + (W - PAD) + '" y="' + (y(0.15) - 8) + '" text-anchor="end" fill="rgba(255,255,255,0.60)" font-size="10.5" ' + MONO + '>макс. +' + p.capPct + '%</text>' +
        (p.premiumPct ? '<text x="' + x(0.19) + '" y="' + (y(0.85) + 14) + '" text-anchor="middle" fill="rgba(255,255,255,0.46)" font-size="10.5" ' + MONO + '>премия ' + String(p.premiumPct).replace(".", ",") + '%</text>' : "");
    } else if (p.type === "call") {
      const line = "M" + x(0) + " " + y(0.85) + " L" + x(0.38) + " " + y(0.85) + " L" + x(0.97) + " " + y(0.14);
      el = '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<text x="' + (W - PAD) + '" y="' + (y(0.14) + 2) + '" text-anchor="end" fill="rgba(255,255,255,0.60)" font-size="10.5" ' + MONO + '>рост без потолка</text>' +
        (p.premiumPct ? '<text x="' + x(0.19) + '" y="' + (y(0.85) + 14) + '" text-anchor="middle" fill="rgba(255,255,255,0.46)" font-size="10.5" ' + MONO + '>премия ' + String(p.premiumPct).replace(".", ",") + '%</text>' : "");
    } else if (p.type === "digital") {
      const base = y(0.62), up = y(0.18), bx = x(0.56);
      el = '<line x1="' + PAD + '" y1="' + base + '" x2="' + (W - PAD) + '" y2="' + base + '" stroke="rgba(255,255,255,0.17)" stroke-width="1" stroke-dasharray="2 4"/>' +
        '<text x="' + PAD + '" y="' + (base + 14) + '" fill="rgba(255,255,255,0.46)" font-size="10.5" ' + MONO + '>номинал 100%</text>' +
        '<path d="M' + PAD + ' ' + base + ' L' + bx + ' ' + base + ' L' + bx + ' ' + up + ' L' + (W - PAD) + ' ' + up + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<rect x="' + (bx - 3.5) + '" y="' + (up - 3.5) + '" width="7" height="7" transform="rotate(45 ' + bx + ' ' + up + ')" fill="' + color + '"/>' +
        '<text x="' + (W - PAD) + '" y="' + (up - 8) + '" text-anchor="end" fill="rgba(255,255,255,0.60)" font-size="10.5" ' + MONO + '>' + (p.barrierPct ? "барьер +" + p.barrierPct + "% → " : "") + "купон " + p.couponPct + '%</text>';
    } else if (p.type === "protected") {
      const floor = y(0.6), up = y(0.18), bx = x(0.5);
      el = '<line x1="' + PAD + '" y1="' + floor + '" x2="' + (W - PAD) + '" y2="' + floor + '" stroke="rgba(255,255,255,0.17)" stroke-width="1" stroke-dasharray="2 4"/>' +
        '<text x="' + PAD + '" y="' + (floor + 14) + '" fill="rgba(255,255,255,0.46)" font-size="10.5" ' + MONO + '>защита 100%</text>' +
        '<path d="M' + PAD + ' ' + floor + ' L' + bx + ' ' + floor + ' L' + x(0.86) + ' ' + up + ' L' + (W - PAD) + ' ' + up + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
        (p.capPct ? '<text x="' + (W - PAD) + '" y="' + (up - 8) + '" text-anchor="end" fill="rgba(255,255,255,0.60)" font-size="10.5" ' + MONO + '>участие до ' + p.capPct + '%</text>' : "");
    } else {
      const line = "M" + x(0) + " " + y(0.8) + " C" + x(0.35) + " " + y(0.72) + " " + x(0.6) + " " + y(0.42) + " " + x(1) + " " + y(0.2);
      el = '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
        '<text x="' + (W - PAD) + '" y="' + (y(0.2) - 8) + '" text-anchor="end" fill="rgba(255,255,255,0.60)" font-size="10.5" ' + MONO + '>стоимость портфеля</text>';
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block">' + el + '</svg>';
  }

  // Кому продавать — авто-шаблон по типу продукта (переопределяется полем idea.audience).
  function audienceOf(idea) {
    if (idea.audience) return idea.audience;
    const a = (idea.p && idea.p.asset) || idea.underlying;
    const prot = idea.p && /100/.test(idea.p.protection || "");
    if (idea.family === "warrant") return "Клиентам, кто верит в рост «" + a + "» и хочет усиленную экспозицию при ограниченном риске: оплачивается только премия, без маржин-коллов.";
    if (idea.family === "coupon") return prot
      ? "Клиентам, кто хочет заранее известный купон по «" + a + "» с полной защитой капитала."
      : "Клиентам, кто хочет заранее известный купон по «" + a + "» и мирится со снижением номинала, если актив упадёт.";
    if (idea.family === "protection") return "Осторожным клиентам: полная защита капитала плюс участие в росте «" + a + "».";
    return "Клиентам, кто хочет диверсифицированную облигационную стратегию с прогнозируемым горизонтом.";
  }
  // Риск — авто-шаблон по типу продукта (переопределяется полем idea.risk).
  function riskOf(idea) {
    if (idea.risk) return idea.risk;
    const prot = idea.p && /100/.test(idea.p.protection || "");
    if (idea.family === "warrant") return "Риск ограничен премией: если базовый актив не вырос к погашению, премия теряется полностью, вложенные средства не возвращаются.";
    if (idea.family === "coupon") return prot
      ? "Капитал защищён на 100% — при любом сценарии возвращается номинал. Основной риск — кредитное качество эмитента ноты."
      : "Если базовый актив снизится, выплата номинала уменьшается пропорционально падению. Дополнительно — кредитный риск эмитента ноты.";
    if (idea.family === "protection") return "Защита капитала 100%: при падении возвращается номинал. Основной риск — кредитное качество эмитента ноты.";
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
        '<div class="df-block"><div class="k">Почему сработает</div>' +
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
