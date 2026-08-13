// Ставки для скринера размещения ликвидности.
// ГЕНЕРИРУЕТСЯ fetch_rates.py — руками не править, изменения затрутся.
// Источники: ЦБ (ключевая ставка, RUONIA), MOEX ISS (RUSFAR, БПИФы, ОФЗ).
window.RATES = {
  "updated": "2026-08-13 10:06",
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
      "price": 19.1505,
      "rate": 14.19
    },
    {
      "id": "BCSD",
      "name": "БКС Денежный рынок",
      "price": 14.192,
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
      "price": 175.42,
      "rate": 13.66
    },
    {
      "id": "TMON",
      "name": "Т-Капитал Денежный рынок",
      "price": 162.4,
      "rate": 13.58
    }
  ],
  "ofz": [
    {
      "id": "SU26219RMFS4",
      "name": "ОФЗ 26219",
      "maturity": "2026-09-16",
      "years": 0.09,
      "rate": 14.58
    },
    {
      "id": "SU26226RMFS9",
      "name": "ОФЗ 26226",
      "maturity": "2026-10-07",
      "years": 0.15,
      "rate": 13.81
    },
    {
      "id": "SU26207RMFS9",
      "name": "ОФЗ 26207",
      "maturity": "2027-02-03",
      "years": 0.48,
      "rate": 13.26
    },
    {
      "id": "SU26232RMFS7",
      "name": "ОФЗ 26232",
      "maturity": "2027-10-06",
      "years": 1.15,
      "rate": 13.33
    },
    {
      "id": "SU26212RMFS9",
      "name": "ОФЗ 26212",
      "maturity": "2028-01-19",
      "years": 1.43,
      "rate": 13.97
    }
  ]
};
