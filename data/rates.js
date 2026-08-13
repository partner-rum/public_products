// Ставки для скринера размещения ликвидности.
// ГЕНЕРИРУЕТСЯ fetch_rates.py — руками не править, изменения затрутся.
// Источники: ЦБ (ключевая, RUONIA), MOEX ISS (RUSFAR, БПИФы, ОФЗ),
// Финуслуги (вклады и накопительные счета — витрина МосБиржи).
window.RATES = {
  "updated": "2026-08-13 10:40",
  "cbr": {
    "key": {
      "rate": 14.0,
      "date": "2026-07-27"
    },
    "ruonia": {
      "rate": 13.59,
      "date": "2026-08-11"
    }
  },
  "rusfar": [
    {
      "id": "RUSFAR",
      "term": "овернайт",
      "days": 1,
      "rate": 13.82
    },
    {
      "id": "RUSFAR1W",
      "term": "1 неделя",
      "days": 7,
      "rate": 13.85
    },
    {
      "id": "RUSFAR2W",
      "term": "2 недели",
      "days": 14,
      "rate": 13.9
    },
    {
      "id": "RUSFAR1M",
      "term": "1 месяц",
      "days": 30,
      "rate": 13.95
    },
    {
      "id": "RUSFAR3M",
      "term": "3 месяца",
      "days": 90,
      "rate": 14.04
    }
  ],
  "funds": [
    {
      "id": "MONY",
      "name": "АК БАРС Денежный рынок",
      "price": 131.01,
      "rate": 14.54
    },
    {
      "id": "SBMM",
      "name": "Первая Сберегательный",
      "price": 19.1565,
      "rate": 14.19
    },
    {
      "id": "BCSD",
      "name": "БКС Денежный рынок",
      "price": 14.198,
      "rate": 14.15
    },
    {
      "id": "LQDT",
      "name": "Ликвидность (ВИМ)",
      "price": 2.0604,
      "rate": 14.14
    },
    {
      "id": "AMNR",
      "name": "АТОН Накопительный",
      "price": 154.865,
      "rate": 14.02
    },
    {
      "id": "AKMM",
      "name": "Альфа Денежный рынок",
      "price": 175.43,
      "rate": 13.66
    },
    {
      "id": "TMON",
      "name": "Т-Капитал Денежный рынок",
      "price": 162.43,
      "rate": 13.58
    }
  ],
  "ofz": [
    {
      "id": "SU26219RMFS4",
      "name": "ОФЗ 26219",
      "maturity": "2026-09-16",
      "years": 0.09,
      "rate": 13.09
    },
    {
      "id": "SU26226RMFS9",
      "name": "ОФЗ 26226",
      "maturity": "2026-10-07",
      "years": 0.15,
      "rate": 12.91
    },
    {
      "id": "SU26207RMFS9",
      "name": "ОФЗ 26207",
      "maturity": "2027-02-03",
      "years": 0.48,
      "rate": 12.74
    },
    {
      "id": "SU26232RMFS7",
      "name": "ОФЗ 26232",
      "maturity": "2027-10-06",
      "years": 1.15,
      "rate": 12.89
    },
    {
      "id": "SU26212RMFS9",
      "name": "ОФЗ 26212",
      "maturity": "2028-01-19",
      "years": 1.44,
      "rate": 13.78
    }
  ],
  "deposits": [
    {
      "bank": "Банк ПСБ",
      "name": "Александр Невский",
      "rate": 31.0,
      "kind": "deposit",
      "termMonths": 1,
      "daysFrom": 32,
      "daysTo": 122,
      "minAmount": 10000,
      "url": "https://finuslugi.ru/vklady/promsvyazbank_aleksandr_nevskij",
      "promo": true,
      "floating": false
    },
    {
      "bank": "Газпромбанк",
      "name": "Ключевой момент",
      "rate": 16.0,
      "kind": "deposit",
      "termMonths": 36,
      "daysFrom": 120,
      "daysTo": 1095,
      "minAmount": 100000,
      "url": "https://finuslugi.ru/vklady/gazprombank_klyuchevoj_moment",
      "promo": false,
      "floating": true
    },
    {
      "bank": "Московский Кредитный Банк",
      "name": "МКБ. Перспектива (% в конце срока)",
      "rate": 14.5,
      "kind": "deposit",
      "termMonths": 3,
      "daysFrom": 95,
      "daysTo": 1100,
      "minAmount": 10000,
      "url": "https://finuslugi.ru/vklady/mkb_mkb_perspektiva_procenty_v_konce_sroka",
      "promo": false,
      "floating": false
    },
    {
      "bank": "Банк ПСБ",
      "name": "Сильная ставка",
      "rate": 14.2,
      "kind": "deposit",
      "termMonths": 6,
      "daysFrom": 91,
      "daysTo": 731,
      "minAmount": 50000,
      "url": "https://finuslugi.ru/vklady/promsvyazbank_silnaya_stavka",
      "promo": false,
      "floating": false
    },
    {
      "bank": "Газпромбанк",
      "name": "Доходный (на минимальный остаток)",
      "rate": 14.0,
      "kind": "saving",
      "termMonths": 0,
      "daysFrom": 1,
      "daysTo": 61,
      "minAmount": 1,
      "url": "https://finuslugi.ru/vklady/gazprombank_dohodnyj_na_minimalnyj_ostatok",
      "promo": false,
      "floating": false
    },
    {
      "bank": "Газпромбанк",
      "name": "Новые деньги",
      "rate": 13.6,
      "kind": "deposit",
      "termMonths": 5,
      "daysFrom": 61,
      "daysTo": 1095,
      "minAmount": 15000,
      "url": "https://finuslugi.ru/vklady/gazprombank_novye_dengi",
      "promo": false,
      "floating": false
    },
    {
      "bank": "Банк ПСБ",
      "name": "Мой доход",
      "rate": 13.5,
      "kind": "deposit",
      "termMonths": 6,
      "daysFrom": 91,
      "daysTo": 731,
      "minAmount": 50000,
      "url": "https://finuslugi.ru/vklady/promsvyazbank_moj_dohod",
      "promo": false,
      "floating": false
    },
    {
      "bank": "Газпромбанк",
      "name": "Доходный (на ежедневный остаток)",
      "rate": 13.0,
      "kind": "saving",
      "termMonths": 0,
      "daysFrom": 1,
      "daysTo": 61,
      "minAmount": 1,
      "url": "https://finuslugi.ru/vklady/gazprombank_dohodnyj_na_ezhednevnyj_ostatok",
      "promo": false,
      "floating": false
    },
    {
      "bank": "Банк ПСБ",
      "name": "Про запас",
      "rate": 13.0,
      "kind": "saving",
      "termMonths": 0,
      "daysFrom": 1,
      "daysTo": 61,
      "minAmount": 1,
      "url": "https://finuslugi.ru/vklady/promsvyazbank_pro_zapas",
      "promo": false,
      "floating": false
    },
    {
      "bank": "Т-Банк",
      "name": "СмартВклад",
      "rate": 12.0,
      "kind": "deposit",
      "termMonths": 1,
      "daysFrom": 31,
      "daysTo": 730,
      "minAmount": 50000,
      "url": "https://finuslugi.ru/vklady/tbank_bank_smartvklad",
      "promo": false,
      "floating": false
    }
  ]
};
