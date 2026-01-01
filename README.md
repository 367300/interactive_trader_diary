# Interactive Trader Diary

Интерактивный дневник трейдера — это веб-приложение для систематического анализа торговой деятельности, сбора статистики и улучшения торговых стратегий.

## Описание

- Проект предназначен для создания простой и понятной системы сбора статистики торговли
- Включает инструменты для самоанализа сделок и выявления паттернов в торговой деятельности
- Планируется интеграция с Tinkoff API для автоматического получения данных о сделках
- Поддержка получения реальных рыночных данных в онлайн режиме
- Система поможет трейдеру улучшать свою торговлю через детальный анализ результатов

## Планируемый функционал

### Основные возможности
- **Дневник сделок** — запись и анализ каждой торговой операции
- **Статистика торговли** — автоматический расчет ключевых метрик (прибыльность, win rate, средняя сделка)
- **Анализ паттернов** — выявление успешных и неудачных торговых стратегий
- **Интеграция с брокерами** — автоматический импорт сделок через API
- **Рыночные данные** — получение актуальных котировок и новостей
- **Визуализация** — графики и диаграммы для наглядного анализа

### Технический стек
- Django (ASGI-ready) — основа веб-приложения
- Django Channels — WebSocket для реального времени
- Celery — фоновые задачи (синхронизация с API, обработка данных)
- RabbitMQ — брокер сообщений
- PostgreSQL — хранение торговых данных
- Redis — кэширование рыночных данных
- **Tinkoff API** — интеграция с брокером (планируется)
- **Market Data API** — получение котировок в реальном времени (планируется)

## Архитектура проекта

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Django App    │    │   External APIs │
│   (React/Vue)   │◄──►│   (ASGI)        │◄──►│   Tinkoff API   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │◄──►│   Celery        │◄──►│   RabbitMQ      │
│   (Trading Data)│    │   (Background)   │    │   (Message      │
└─────────────────┘    └─────────────────┘    │    Broker)      │
                              │               └─────────────────┘
                              ▼
                       ┌─────────────────┐
                       │   Redis Cache   │
                       │   (Market Data) │
                       └─────────────────┘
```

## Этапы разработки

### Этап 1: Базовая функциональность
- [x] Модели для хранения сделок и торговых данных
- [x] Простой интерфейс для ввода сделок вручную
- [x] Базовые расчеты статистики (P&L, количество сделок)
- [x] Аутентификация пользователей

### Этап 2: Аналитика и визуализация (В разработке)
- [ ] Расширенная статистика торговли
- [ ] Графики и диаграммы для анализа
- [ ] Фильтрация и группировка сделок
- [ ] Экспорт данных в различные форматы

### Этап 3: Интеграции
- [ ] Интеграция с Tinkoff API
- [ ] Автоматический импорт сделок
- [ ] Получение рыночных данных в реальном времени
- [ ] Уведомления о важных событиях

### Этап 4: Продвинутые возможности
- [ ] Машинное обучение для анализа паттернов
- [ ] Рекомендации по улучшению торговли
- [ ] Социальные функции (обмен опытом)
- [ ] Мобильное приложение

## Документация

- **[Структура базы данных](doc/DATABASE_STRUCTURE.md)** - подробное описание моделей и связей

## Быстрый старт

### Установка и запуск

1. **Клонируйте репозиторий:**
   ```bash
   git clone <адрес-репозитория>
   cd interactive_trader_diary
   ```

2. **Настройте окружение:**
   ```bash
   cp .env.example .env
   # Отредактируйте .env файл под ваши нужды
   ```

3. **Запустите проект:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
   ```

4. **Выполните миграции:**
   ```bash
   docker compose exec web python manage.py migrate
   docker compose exec web python manage.py createsuperuser
   ```

### Доступные сервисы

- **Основное приложение:** http://localhost:8000
- **Админка Django:** http://localhost:8000/admin/
- **PgAdmin (БД):** http://localhost:5050
- **Flower (Celery):** http://localhost:5555
- **API документация:** http://localhost:8000/api/docs/ (планируется)

## Конфигурация

### Пример .env файла

```env
# Django
DJANGO_SECRET_KEY=your_super_secret_key
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0
DJANGO_LANGUAGE_CODE=ru-RU
DJANGO_TIME_ZONE=Europe/Moscow

# База данных
POSTGRES_DB=trader_diary
POSTGRES_USER=trader_user
POSTGRES_PASSWORD=trader_password
POSTGRES_HOST=db
POSTGRES_PORT=5432

# Redis (для кэширования рыночных данных)
REDIS_URL=redis://redis:6379/0

# Celery
CELERY_BROKER_URL=amqp://guest:guest@rabbitmq:5672//
CELERY_RESULT_BACKEND=redis://redis:6379/1

# Tinkoff API (планируется)
TINKOFF_TOKEN=your_tinkoff_token_here
TINKOFF_SANDBOX=True

# Market Data API (планируется)
MARKET_DATA_API_KEY=your_market_data_key
MARKET_DATA_PROVIDER=alpha_vantage  # или другой провайдер

# PgAdmin
PGADMIN_DEFAULT_EMAIL=admin@trader-diary.com
PGADMIN_DEFAULT_PASSWORD=admin

# Flower
FLOWER_BASIC_AUTH=admin:password

# Системные настройки
UID=1000
GID=1000
```

## Планируемые функции

### Дневник сделок
- Запись каждой торговой операции с деталями
- Классификация сделок по типам и стратегиям
- Прикрепление скриншотов и заметок
- Теги для группировки и поиска

### Аналитика и статистика
- **Основные метрики:** P&L, Win Rate, Average Win/Loss
- **Продвинутая аналитика:** Sharpe Ratio, Maximum Drawdown, Profit Factor
- **Временной анализ:** производительность по дням/неделям/месяцам
- **Сравнение стратегий:** эффективность разных подходов

### Интеграции (планируется)
- **Tinkoff API:** автоматический импорт сделок
- **Market Data:** получение котировок в реальном времени
- **Новости:** анализ влияния новостей на торговлю
- **Экономические календари:** планирование торговых сессий

### Визуализация
- Интерактивные графики P&L
- Распределение прибыли/убытков
- Анализ по инструментам и секторам
- Тепловые карты торговой активности

## Полезные команды

### Разработка
```bash
# Запуск в режиме разработки
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Остановка
docker compose down

# Просмотр логов
docker compose logs -f web
docker compose logs -f celery
```

### Управление данными
```bash
# Миграции
docker compose exec web python manage.py migrate

# Создание суперпользователя
docker compose exec web python manage.py createsuperuser

# Сборка статики
docker compose exec web python manage.py collectstatic --noinput
```

### Celery
```bash
# Запуск воркера вручную
docker compose exec web celery -A trader_diary worker --loglevel=info

# Мониторинг через Flower
# Откройте http://localhost:5555
```

## Отладка

Проект поддерживает отладку через VS Code с использованием debugpy в Docker контейнерах.

### Запуск в режиме отладки

1. **Запустите контейнеры с отладкой:**
   ```bash
   docker compose -f docker-compose.debug.yml up --build
   ```

2. **Дождитесь полной загрузки сервисов** (debugpy должен быть готов к подключению)

### Конфигурации отладки в VS Code

В файле `.vscode/launch.json` доступны следующие конфигурации:

#### Docker: Attach to Django (Web)
- **Порт:** 5678
- **Назначение:** Отладка Django веб-приложения
- **Особенности:**
  - Поддержка Django-специфичных функций (шаблоны, ORM)
  - Маппинг путей между локальной файловой системой и контейнером
  - Отладка библиотечного кода включена

#### Docker: Attach to Celery Worker
- **Порт:** 5679
- **Назначение:** Отладка Celery воркера и фоновых задач
- **Особенности:**
  - Отладка задач Celery
  - Маппинг путей для корректной работы точек останова
  - Отладка библиотечного кода включена

### Использование

1. **Запустите контейнеры в режиме отладки** (см. выше)

2. **В VS Code:**
   - Откройте панель отладки (F5 или `View > Run and Debug`)
   - Выберите нужную конфигурацию из списка:
     - `Docker: Attach to Django (Web)` — для отладки веб-приложения
     - `Docker: Attach to Celery Worker` — для отладки фоновых задач
   - Нажмите F5 или кнопку "Start Debugging"

3. **Установите точки останова** в коде и используйте их как обычно

**Файл для vscode launch.json**

```json
{
    // Use IntelliSense to learn about possible attributes.
    // Hover to view descriptions of existing attributes.
    // For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Docker: Attach to Django (Web)",
            "type": "debugpy",
            "request": "attach",
            "connect": {
                "host": "localhost",
                "port": 5678
            },
            "pathMappings": [
                {
                    "localRoot": "${workspaceFolder}/django_base",
                    "remoteRoot": "/app/django_base"
                }
            ],
            "django": true,
            "justMyCode": false
        },
        {
            "name": "Docker: Attach to Celery Worker",
            "type": "debugpy",
            "request": "attach",
            "connect": {
                "host": "localhost",
                "port": 5679
            },
            "pathMappings": [
                {
                    "localRoot": "${workspaceFolder}/django_base",
                    "remoteRoot": "/app/django_base"
                }
            ],
            "justMyCode": false
        }
    ]
}
```

### Примечания

- Убедитесь, что порты 5678 и 5679 не заняты другими процессами
- При изменении кода в контейнере изменения применяются автоматически благодаря volume mapping
- Для отладки Celery задач запустите задачу через Django или другой механизм, чтобы она попала в очередь

## Техническая архитектура

### Сервисы
- **web** — Django приложение с ASGI сервером
- **celery** — воркер для фоновых задач (синхронизация с API)
- **rabbitmq** — брокер сообщений для Celery
- **redis** — кэширование рыночных данных
- **flower** — мониторинг Celery
- **db** — PostgreSQL для торговых данных
- **pgadmin** — управление БД

### Технологии
- **Django Channels** — WebSocket для реального времени
- **Celery** — фоновые задачи и синхронизация
- **PostgreSQL** — надежное хранение торговых данных
- **Redis** — быстрый доступ к рыночным данным
- **Docker** — изолированная среда разработки

---

**Проект в активной разработке!**

Цель: создать мощный инструмент для анализа и улучшения торговой деятельности.

Если есть идеи или предложения — добро пожаловать к участию в разработке!
