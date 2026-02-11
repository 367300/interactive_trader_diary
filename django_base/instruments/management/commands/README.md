# Команды управления инструментами

## load_instruments_from_moex

Команда для загрузки торговых инструментов (акций, фьючерсов) из открытого API Московской биржи.

### Описание

Команда получает данные об инструментах через Информационно-статистический сервер (ИСС) Мосбиржи и сохраняет их в базу данных. Для каждого инструмента загружается:

- Тикер
- Полное название
- Тип инструмента (акция/фьючерс)
- Минимальный шаг цены
- Размер лота
- Валюта
- Сектор экономики (если доступен)
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

#### Загрузка фьючерсов

```bash
python manage.py load_instruments_from_moex --instrument-type FUTURES
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
- `--instrument-type` - Тип инструментов: `STOCK` (акции) или `FUTURES` (фьючерсы). По умолчанию: `STOCK`
- `--limit` - Ограничить количество загружаемых инструментов (для тестирования)

### Примеры использования в Docker

```bash
# Загрузка всех акций
docker compose exec web python manage.py load_instruments_from_moex

# Обновление существующих акций
docker compose exec web python manage.py load_instruments_from_moex --update-existing

# Загрузка первых 20 акций для теста
docker compose exec web python manage.py load_instruments_from_moex --limit 20
```

### API Мосбиржи

Команда использует следующие эндпоинты:

- **Акции**: `https://iss.moex.com/iss/engines/stock/markets/shares/securities.json`
- **Фьючерсы**: `https://iss.moex.com/iss/engines/futures/markets/forts/securities.json`
- **Детали инструмента**: `https://iss.moex.com/iss/securities/{ticker}.json`

### Обработка ошибок

Команда обрабатывает следующие ситуации:

- Отсутствие интернет-соединения
- Недоступность API Мосбиржи
- Некорректные данные от API
- Дубликаты инструментов
- Отсутствие обязательных полей

Все ошибки логируются, но не останавливают процесс загрузки других инструментов.

### Примечания

- Первая загрузка может занять несколько минут, так как для каждого инструмента делается дополнительный запрос для получения детальной информации
- Команда использует транзакции для обеспечения целостности данных
- При использовании `--update-existing` обновляются все поля существующих инструментов
- Без `--update-existing` существующие инструменты пропускаются


