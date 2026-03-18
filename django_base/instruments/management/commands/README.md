# Команды управления инструментами

## load_industry_taxonomy_from_moex_csv

Команда для загрузки и обновления нормализованных справочников отраслей из CSV:
- `Sector`
- `IndustryGroup`
- `Industry`
- `SubIndustry`

Источник: `uploads/data_instruments/moex_stocks_enriched.csv`

### Использование

```bash
# По умолчанию берёт uploads/data_instruments/moex_stocks_enriched.csv
python manage.py load_industry_taxonomy_from_moex_csv

# Явно указать путь к файлу
python manage.py load_industry_taxonomy_from_moex_csv --csv-path /app/uploads/data_instruments/moex_stocks_enriched.csv
```

### Что делает

- Читает CSV и проверяет обязательные колонки (`ticker`, `sector`, `industry_group`, `industry`, `sub_industry`, `sub_industry_desc`).
- Идемпотентно выполняет upsert:
  - `Sector` по `name`
  - `IndustryGroup` по `(sector, name)`
  - `Industry` по `(industry_group, name)`
  - `SubIndustry` по `(industry, name)`
- Обновляет `SubIndustry.description`, если описание изменилось.

## load_instruments_from_moex

Команда для загрузки торговых инструментов типа `STOCK` из открытого API Московской биржи с обогащением из CSV.

### Описание

Команда получает базовые торговые данные через ИСС Мосбиржи и сохраняет их в `Instrument`.
Отраслевые поля и дополнительные атрибуты берутся из CSV `uploads/data_instruments/moex_stocks_enriched.csv`.

Для каждого инструмента загружается:

- Тикер
- Полное название
- Тип инструмента (`STOCK`)
- Минимальный шаг цены
- Размер лота
- Валюта
- Сектор экономики (из CSV)
- Подгруппа индустрии (`sub_industry`, через нормализованные таблицы)
- Описание инструмента (`description`, из CSV)
- Ссылки на иконки (`logolink`, `og_logo`, из CSV)
- Статус активности

### Использование

#### Базовая загрузка акций

```bash
python manage.py load_instruments_from_moex
```

#### Обновление существующих инструментов

```bash
python manage.py load_instruments_from_moex --update-existing
```

#### Ограничение количества (для тестирования)

```bash
python manage.py load_instruments_from_moex --limit 10
```

#### Комбинированные опции

```bash
python manage.py load_instruments_from_moex --instrument-type STOCK --update-existing --limit 50
```

### Параметры

- `--update-existing` - Обновить существующие инструменты (по умолчанию пропускаются)
- `--instrument-type` - Тип инструментов: только `STOCK`
- `--limit` - Ограничить количество загружаемых инструментов (для тестирования)

### Примеры использования в Docker

```bash
# 1) Сначала загрузка/обновление отраслевых справочников
docker compose exec web python manage.py load_industry_taxonomy_from_moex_csv

# 2) Затем загрузка всех акций
docker compose exec web python manage.py load_instruments_from_moex

# 3) Обновление существующих акций
docker compose exec web python manage.py load_instruments_from_moex --update-existing

# 4) Загрузка первых 20 акций для теста
docker compose exec web python manage.py load_instruments_from_moex --limit 20
```

### API Мосбиржи

Команда использует следующие эндпоинты:

- **Акции**: `https://iss.moex.com/iss/engines/stock/markets/shares/securities.json`

### Обработка ошибок

Команда обрабатывает следующие ситуации:

- Отсутствие интернет-соединения
- Недоступность API Мосбиржи
- Некорректные данные от API
- Дубликаты инструментов
- Отсутствие обязательных полей
- Отсутствие или некорректная структура CSV для обогащения

Все ошибки логируются, но не останавливают процесс загрузки других инструментов.

### Примечания

- Перед загрузкой инструментов рекомендуется запускать `load_industry_taxonomy_from_moex_csv`
- Команда использует транзакции для обеспечения целостности данных
- При использовании `--update-existing` обновляются все обогащаемые поля существующих инструментов
- Без `--update-existing` существующие инструменты пропускаются


