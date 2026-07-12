// АРХИВ ДАЙДЖЕСТОВ. Каждую неделю добавляется НОВЫЙ выпуск В НАЧАЛО массива issues.
// issues[0] — всегда актуальный. sections/DF общие для всех выпусков.
// Каждая идея: hypothesis → situation → factors → (conclusion) → how → payout + params + payoff.
window.DIGEST_ARCHIVE = {
  sections: [
    { key: "warrant",    label: "Варранты",       note: "Рычаг на рост актива, риск ограничен премией", color: "#E0A24A" },
    { key: "coupon",     label: "Купоны",          note: "Фиксированный доход при заданном условии",       color: "#4F86E6" },
    { key: "protection", label: "Защита капитала", note: "Участие в росте с возвратом номинала",           color: "#5E9B82" },
    { key: "portfolio",  label: "Портфель",        note: "Диверсифицированные стратегии",                  color: "#8A93A6" }
  ],
  issues: [
    {
      id: "2026-07-06", date: "06.07.2026", label: "6 июля 2026",
      summary: "Медь, BTC, рынок РФ, Nebius, юань, ОФЗ, портфель",
      intro: "Инвестиционные идеи недели: по каждой — гипотеза, рыночная ситуация, факторы и параметры выпуска.",
      qualNote: "Продукты доступны только квалифицированным инвесторам. Не является инвестиционной рекомендацией.",
      ideas: [
        {
          id: "copx-warrant", family: "warrant", kind: "Варрант",
          name: "Варрант на производителей меди", underlying: "COPX · ETF на добытчиков меди", fx: true,
          teaser: "Рычаг на рост меди: электрификация, дефицит предложения и спрос со стороны ИИ и дата-центров.",
          metric: { v: "+30%", k: "потолок роста" }, tenor: "0,5 года",
          hypothesis: "Медь — ключевой металл электрификации мировой экономики.",
          situation: "Медь используется в электросетях, трансформаторах, солнечных и ветряных станциях, зарядной инфраструктуре и электромобилях.",
          factors: [
            "Рост инвестиций в энергосети: всё больше ЛЭП и дата-центров",
            "Ограниченное предложение — новые месторождения запускаются сложно и долго",
            "Рост спроса со стороны ИИ и дата-центров",
            "В электромобиле меди в несколько раз больше, чем в авто с ДВС"
          ],
          conclusion: "Дефицит предложения и тренд на ИИ и электрификацию делают медь интересной для инвестиций.",
          how: "Варрант на COPX: инвестор оплачивает только часть номинала и получает рычаг на рост ETF без маржин-коллов. Если актив не вырос — потеря ограничена уплаченной премией.",
          payout: "Выплата роста базового актива (максимум 30%), рассчитанного от номинала; вложенные средства не возвращаются.",
          p: { asset: "COPX (ETF)", price: "150 ₽ · 15% ном.", upside: "рост актива, потолок +30%", protection: "нет" },
          payoff: { type: "callcap", capPct: 30, premiumPct: 15 }
        },
        {
          id: "ibit-warrant", family: "warrant", kind: "Варрант",
          name: "Варрант на BTC", underlying: "IBIT · ETF на биткоин", fx: true,
          teaser: "CALL на биткоин с лимитом роста 50% — без маржин-коллов и риска ликвидации позиции.",
          metric: { v: "+50%", k: "лимит роста" }, tenor: "24 мес",
          hypothesis: "Рост BTC на горизонте 3 лет.",
          situation: "BTC торгуется у локальных минимумов, впервые опустившись ниже $60 тыс. с 2024 года.",
          factors: [
            "Ограниченное предложение и фиксированная эмиссия",
            "Рост институциональных инвестиций, крипта в финансовых продуктах",
            "Развитие инфраструктуры: кошельки, биржи, OTC",
            "Смягчение монетарной политики ФРС",
            "Урегулирование конфликта на Ближнем Востоке"
          ],
          conclusion: null,
          how: "Заработок на росте IBIT (ETF) с эффектом большой сделки при меньших вложениях. Продукт повторяет CALL: маржин-колл отсутствует, нет риска ликвидации позиции.",
          payout: "Выплата до 50% роста базового актива, рассчитанного от номинала; вложенные средства не возвращаются.",
          p: { asset: "IBIT (ETF)", price: "200 ₽ · 20% ном.", upside: "рост актива, лимит +50%", protection: "нет" },
          payoff: { type: "callcap", capPct: 50, premiumPct: 20 }
        },
        {
          id: "rwmd-warrant", family: "warrant", kind: "Варрант",
          name: "Варрант на рост российского рынка", underlying: "Индекс «Румберг Широкий рынок Д» (RWMD)", fx: false,
          teaser: "Ставка на недооценённый рынок РФ через индекс «акции с дивидендами минус денежный рынок».",
          metric: { v: "рост", k: "без потолка" }, tenor: "24 мес",
          hypothesis: "Рост российского рынка на горизонте 3 лет.",
          situation: "Индекс МосБиржи падает несмотря на 8-е подряд снижение ставки и находится на уровне 2020 года, тогда как бизнесы компаний выросли — это указывает на недооценённость. Базовый актив — индекс RWMD: разница между рынком акций с дивидендами (MCFTRR) и денежным рынком (RUSFAR).",
          factors: [
            "Снижение ключевой ставки",
            "Рост индекса МосБиржи полной доходности (с дивидендами)",
            "Деэскалация конфликта на Ближнем Востоке",
            "Изменение геополитической ситуации вокруг Украины"
          ],
          conclusion: "В 2025 году варрант на индекс RWMD принёс клиентам 40% в абсолюте за 2,5 месяца. Румберг обеспечивает ликвидность на вторичном рынке.",
          how: "Варрант даёт заработать на росте индекса RWMD, если при погашении его значение выше начального.",
          payout: "Выплата роста базового актива, рассчитанного от номинала; вложенные средства не возвращаются.",
          p: { asset: "Индекс RWMD", price: "188 ₽ · 18,8% ном.", upside: "рост индекса, без потолка", protection: "нет" },
          payoff: { type: "call", premiumPct: 18.8 }
        },
        {
          id: "nebius-coupon", family: "coupon", kind: "Купон · участие",
          name: "Nebius + USD/RUB", underlying: "Акции Nebius + курс USD/RUB", fx: true,
          teaser: "Фиксированный купон и участие в росте Nebius (до 20%) с валютной переоценкой.",
          metric: { v: "20%", k: "купон + участие" }, tenor: "12 мес",
          hypothesis: "Nebius выиграет от дальнейшего роста интереса к AI-инфраструктуре.",
          situation: "AI-сектор остаётся ключевой темой рынка: спрос на вычислительные мощности и AI-инфраструктуру растёт, интерес инвесторов к AI-компаниям сохраняется.",
          factors: [
            "Рост мировых расходов на AI-инфраструктуру",
            "Высокий спрос на GPU и вычислительные мощности",
            "Расширение рынка AI-сервисов",
            "Сохраняющийся интерес инвесторов к AI-компаниям"
          ],
          conclusion: "Рынок AI — долгосрочный структурный тренд; Nebius уже заключил AI-контракты с Meta и Microsoft на десятки млрд долларов.",
          how: "Структурная облигация выплачивает фиксированный купон и даёт участие в росте акций Nebius. При росте — участие в динамике (до 20%); при снижении выплата номинала уменьшается пропорционально падению.",
          payout: "Купон фиксированный. При росте — участие в динамике (макс. 20%) плюс валютная переоценка. При снижении номинал уменьшается пропорционально падению.",
          p: { asset: "Nebius + USD/RUB", price: "по номиналу", upside: "купон + участие до +20% и валютная переоценка", protection: "нет" },
          payoff: { type: "callcap", capPct: 20, premiumPct: 0 }
        },
        {
          id: "cnyrub-coupon", family: "coupon", kind: "Купон · защита капитала",
          name: "Купон на снижение рубля", underlying: "Курс CNY/RUB", fx: false,
          teaser: "Купон 19%, если юань к рублю вырастет на 10%+. Защита капитала 100%.",
          metric: { v: "19%", k: "купон" }, tenor: "12 мес",
          hypothesis: "Рубль ослабнет на горизонте года более чем на 10% от текущих уровней.",
          situation: "Курс CNY/RUB торгуется около 11,38 ₽ за юань, отражая смещение внешней торговли России в сторону Китая и растущую роль юаня в расчётах.",
          factors: [
            "Рост доли расчётов в юанях во внешней торговле РФ",
            "Спрос на юань со стороны импортёров и финансового сектора",
            "Бюджетная политика и операции Минфина на валютном рынке",
            "Динамика сырьевых цен и состояние платёжного баланса",
            "Волатильность развивающихся рынков и политика НБК"
          ],
          conclusion: "Даже умеренный рост спроса на юань может привести к ослаблению рубля и росту CNY/RUB. Большинство аналитиков ожидают снижения курса рубля в этом году.",
          how: "Структурная облигация выплачивает купон при погашении, если курс CNY/RUB вырос до заданного уровня. Капитал защищён на 100%.",
          payout: "Купон 19% при погашении, если CNY/RUB вырос на 10% и более. Защита капитала — 100%.",
          p: { asset: "CNY/RUB", price: "по номиналу", upside: "купон 19% при росте +10% по CNY/RUB", protection: "100%" },
          payoff: { type: "digital", couponPct: 19, barrierPct: 10 }
        },
        {
          id: "ofz-coupon", family: "coupon", kind: "Купон",
          name: "Купон на ОФЗ 26248", underlying: "ОФЗ 26248", fx: false,
          teaser: "Купон 19% при сохранении или росте цены длинной ОФЗ.",
          metric: { v: "19%", k: "купон" }, tenor: "12 мес",
          hypothesis: "Длинные ОФЗ подорожают на горизонте 12 месяцев.",
          situation: "Длинные ОФЗ (26248) растеряли рост, накопленный за год после начала цикла снижения ставок (июнь 2025).",
          factors: [
            "Ключевая ставка и ожидания её изменения",
            "Предложение Минфина и объёмы размещений",
            "Спрос со стороны банков, НПФ и частных инвесторов",
            "Бюджетный дефицит, цена нефти, динамика курса рубля"
          ],
          conclusion: "При позитивных геополитических изменениях ОФЗ способны быстро восстановить рост от снижения ставки. Консолидированный прогноз — снижение ставки до 14,1%.",
          how: "Структурная облигация с выплатой купона 19% через 12 месяцев. Купон выплачивается даже при сохранении цены ОФЗ 26248; при снижении цены выплата номинала уменьшается пропорционально.",
          payout: "Купон 19% при сохранении или росте цены ОФЗ 26248. При снижении номинал уменьшается пропорционально падению.",
          p: { asset: "ОФЗ 26248", price: "по номиналу", upside: "купон 19% при сохранении/росте цены", protection: "нет" },
          payoff: { type: "digital", couponPct: 19, barrierPct: 0 }
        },
        {
          id: "btc-protection", family: "protection", kind: "Защита капитала · участие",
          name: "Участие в росте BTC", underlying: "IBIT · ETF на биткоин", fx: true,
          teaser: "100% защита капитала плюс участие в росте BTC (до 50%).",
          metric: { v: "100%", k: "защита капитала" }, tenor: "24 мес",
          hypothesis: "Рост BTC на горизонте 3 лет.",
          situation: "BTC торгуется у локальных минимумов, впервые опустившись ниже $60 тыс. с 2024 года.",
          factors: [
            "Ограниченное предложение и фиксированная эмиссия",
            "Рост институциональных инвестиций и внедрение крипты в финансовые продукты",
            "Развитие инфраструктуры: кошельки, биржи, OTC",
            "Смягчение монетарной политики ФРС"
          ],
          conclusion: null,
          how: "Структурная облигация с защитой капитала, позволяющая участвовать в росте BTC (IBIT ETF). Доход выплачивается при погашении.",
          payout: "Участие в росте 100% (лимит 50%) плюс валютная переоценка. Защита капитала 100%: при падении возвращается номинал.",
          p: { asset: "IBIT (ETF)", price: "по номиналу", upside: "участие 100%, до +50%", protection: "100%" },
          payoff: { type: "protected", capPct: 50 }
        },
        {
          id: "ofz-portfolio", family: "portfolio", kind: "Портфель",
          name: "Портфель долгосрочных ОФЗ", underlying: "Корзина длинных ОФЗ", fx: false,
          teaser: "Диверсифицированный портфель длинных ОФЗ с реинвестированием купонов.",
          metric: { v: "3 года", k: "горизонт" }, tenor: "3 года",
          hypothesis: "Стабилизация ставок создаёт условия для повышенной доходности облигационных стратегий.",
          situation: "Высокий уровень ставок и возможность их последующего снижения формируют привлекательную точку входа в длинные государственные облигации.",
          factors: [
            "Высокий уровень ставок",
            "Снижение инфляции",
            "Потенциал снижения ставок",
            "Реинвестирование купонов",
            "Эффективный режим налогообложения"
          ],
          conclusion: "Комбинация текущей доходности и потенциала снижения ставок создаёт условия для опережающей доходности стратегии. Консолидированный прогноз — снижение ставки до 14,1%.",
          how: "Добавляя стратегию на ОФЗ, инвестор получает диверсифицированный набор облигаций с реинвестированием купонов. Доход формируется за счёт изменения стоимости портфеля и реинвестирования купонных выплат.",
          payout: "Выплата равна стоимости портфеля на момент погашения.",
          p: { asset: "Портфель ОФЗ", price: "по номиналу", upside: "стоимость портфеля + купоны", protection: "нет" },
          payoff: { type: "line" }
        }
      ]
    },
    {
      id: "2026-06-29", date: "29.06.2026", label: "29 июня 2026",
      summary: "Медь и купон на ослабление рубля",
      intro: "Инвестиционные идеи недели: по каждой — гипотеза, рыночная ситуация, факторы и параметры выпуска.",
      qualNote: "Продукты доступны только квалифицированным инвесторам. Не является инвестиционной рекомендацией.",
      ideas: [
        {
          id: "copx-warrant", family: "warrant", kind: "Варрант",
          name: "Варрант на производителей меди", underlying: "COPX · ETF на добытчиков меди", fx: true,
          teaser: "Рычаг на рост меди — электрификация экономики и дефицит предложения.",
          metric: { v: "+30%", k: "потолок роста" }, tenor: "0,5 года",
          hypothesis: "Медь — важный элемент электрификации мировой экономики.",
          situation: "Медь используется в электросетях, трансформаторах, солнечных и ветряных электростанциях, зарядной инфраструктуре и электромобилях.",
          factors: [
            "Рост инвестиций в энергосети: всё больше ЛЭП и дата-центров",
            "Ограниченное предложение — новые месторождения запускаются сложно и долго",
            "Рост спроса со стороны ИИ и дата-центров",
            "Тренд на электрокары: в электромобиле меди в несколько раз больше, чем в авто с ДВС"
          ],
          conclusion: "Ограниченное предложение и тренд на ИИ и электрификацию экономики делают медь интересной для инвестиций.",
          how: "Варрант на COPX: инвестор оплачивает только часть номинала и получает рычаг на рост ETF — без маржин-коллов. Если актив не вырос, потеря ограничена уплаченной премией.",
          payout: "Выплата роста базового актива (максимум 30% роста), рассчитанного от номинала; вложенные средства не возвращаются.",
          p: { asset: "COPX (ETF)", price: "150 ₽ · 15% ном.", upside: "рост актива, потолок +30%", protection: "нет" },
          payoff: { type: "callcap", capPct: 30, premiumPct: 15 }
        },
        {
          id: "cnyrub-coupon", family: "coupon", kind: "Купон · защита капитала",
          name: "Купон на снижение рубля", underlying: "Курс CNY/RUB", fx: false,
          teaser: "Купон 19% при росте юаня к рублю на 10%+. Защита капитала 100%.",
          metric: { v: "19%", k: "купон" }, tenor: "12 мес",
          hypothesis: "Рубль ослабнет на горизонте года более чем на 10% от текущих уровней.",
          situation: "Курс CNY/RUB торгуется около 11,38 ₽ за юань, отражая смещение внешней торговли России в сторону Китая и растущую роль юаня в расчётах.",
          factors: [
            "Рост доли расчётов в юанях во внешней торговле РФ",
            "Спрос на юань со стороны импортёров и финансового сектора",
            "Бюджетная политика и операции Минфина на валютном рынке",
            "Динамика сырьевых цен и состояние платёжного баланса"
          ],
          conclusion: "Даже умеренный рост спроса на юань может привести к ослаблению рубля и росту курса CNY/RUB.",
          how: "Структурная облигация выплачивает купон при погашении, если курс CNY/RUB вырос до заданного уровня. Капитал защищён полностью: при любом сценарии возвращается 100% номинала.",
          payout: "Купон 19% выплачивается при погашении, если курс CNY/RUB вырос на 10% и более. Защита капитала — 100%.",
          p: { asset: "CNY/RUB", price: "по номиналу", upside: "купон 19% при росте +10% по CNY/RUB", protection: "100%" },
          payoff: { type: "digital", couponPct: 19, barrierPct: 10 }
        }
      ]
    }
  ]
};

// Обратная совместимость: index.html читает window.DIGEST.date (последний выпуск).
window.DIGEST = window.DIGEST_ARCHIVE.issues[0];

// ── Общий рендер: мини-диаграмма выплаты и «тело» детали идеи ──
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
