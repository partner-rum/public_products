# Витрина структурных продуктов

Статический сайт: три страницы + данные. Серверов и баз данных нет.

```
index.html            — входная страница
board.html           — доска инструментов (board.html?type=warrant / discount / protection)
instrument.html      — карточка инструмента (instrument.html?id=W-SBER-310-0327)
data/instruments.js  — ДАННЫЕ (котировки, инструменты) — генерируется update_site.py
data/lib.js          — тексты типов продуктов, формула выплаты, форматирование
update_site.py       — обновление данных из Python (локально и/или пуш на GitHub)
```

## Как посмотреть локально

Просто откройте `index.html` двойным кликом — сайт работает прямо с диска.

## Как опубликовать на GitHub Pages (без командной строки)

1. Зарегистрируйтесь на github.com (бесплатно).
2. Нажмите **New repository**: имя, например, `products`, видимость **Public** → **Create repository**.
3. На странице репозитория: **Add file → Upload files** → перетащите СОДЕРЖИМОЕ этой папки → **Commit changes**.
4. **Settings → Pages** → «Build and deployment»: Source = **Deploy from a branch**, Branch = **main**, папка **/ (root)** → **Save**.
5. Через 1–3 минуты сайт доступен: `https://ВАШ_ЛОГИН.github.io/products/`

## Как обновлять котировки

### Способ 1 — из Python (основной)

1. Откройте `update_site.py` и заполните список `INSTRUMENTS` из вашего прайсера
   (это обычные питоновские словари — можно собирать из Excel/CSV/расчёта).
2. `python update_site.py` — перезапишет `data/instruments.js` локально.
   Проверьте, открыв `index.html` в браузере.
3. `python update_site.py --push` — сразу зальёт данные на GitHub;
   сайт обновится сам через 1–2 минуты.

Для `--push` один раз настройте:
- `pip install requests`
- токен: github.com → **Settings → Developer settings → Fine-grained personal access tokens →
  New token** → доступ только к вашему репозиторию, права **Contents: Read and write**;
- переменные окружения: `GITHUB_TOKEN` (токен) и `GITHUB_REPO` (например, `login/products`).

### Способ 2 — руками на GitHub

Откройте `data/instruments.js` → карандаш (**Edit this file**) → поправьте → **Commit changes**.
Учтите: следующий запуск скрипта перезапишет ручные правки — основной источник лучше держать в Python.

Тексты типов продуктов и формула выплаты — в `data/lib.js`.
Каждое изменение сохраняется в истории GitHub — любую правку можно откатить.

## Свой домен (опционально)

Купите домен у регистратора → **Settings → Pages → Custom domain** → впишите домен →
у регистратора создайте CNAME-запись на `ВАШ_ЛОГИН.github.io`.

## Google

Сайт индексируется как обычный статический. Чтобы ускорить — зарегистрируйте адрес в
Google Search Console. Когда инструментов станет десятки, стоит перейти на генератор
статических страниц (Astro): каждый инструмент получит отдельный URL для поиска,
дизайн и данные переносятся как есть.
