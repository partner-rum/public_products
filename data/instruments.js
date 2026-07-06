// Файл сгенерирован update_site.py — руками не править (перезапишется при следующем запуске).
// Обновлено: 2026-07-06
window.SITE_DATA = {
  "updated": "2026-07-06",
  "instruments": [
    {
      "id": "D-OFZ-1226", "type": "discount",
      "name": "Дисконтная облигация · ОФЗ",
      "underlying": "ОФЗ", "cls": "Облигации",
      "expiry": "18.12.2026", "quote": 96.80, "chg": 0.1, "minNom": 1000000
    },
    {
      "id": "P-IMOEX-0627", "type": "protection",
      "name": "Защита капитала · Индекс МосБиржи",
      "underlying": "Индекс МосБиржи", "cls": "Индекс",
      "spot": 3285, "strike": 3285, "participation": 0.6, "protectionPct": 100,
      "expiry": "18.06.2027", "quote": 101.30, "chg": 0.2, "minNom": 1000000
    },
    {
      "id": "W-SBER-310-0327", "type": "warrant",
      "name": "Варрант · Сбербанк CALL 310",
      "underlying": "Сбербанк", "cls": "Акции",
      "strike": 310, "spot": 296.4,
      "expiry": "19.03.2027", "quote": 6.80, "chg": 0.3, "minNom": 1000000
    }
  ]
};
