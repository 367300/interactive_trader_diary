# CLAUDE.md

Этот файл содержит инструкции для Claude Code (claude.ai/code) при работе с кодом в этом репозитории.

## Обзор проекта

Interactive Trader Diary — веб-приложение для систематического анализа сделок, статистики и улучшения стратегий. Фокус на российском фондовом рынке (MOEX). Бэкенд Django REST API + фронтенд React SPA, полностью в Docker.

Если локальный сайт запущен в dev-режиме, то к нему можно подключиться по адресу http://localhost:3000

Данные для входа на сайт:
- Логин: admin
- Пароль: Qwer@12345

## Команды разработки

```bash
# Запуск всех сервисов (dev)
docker compose -f docker-compose.dev.yml up --build

# Django management (внутри контейнера web)
docker compose -f docker-compose.dev.yml exec web python manage.py migrate
docker compose -f docker-compose.dev.yml exec web python manage.py createsuperuser
docker compose -f docker-compose.dev.yml exec web python manage.py collectstatic --noinput

# Загрузка инструментов MOEX
docker compose -f docker-compose.dev.yml exec web python manage.py load_instruments_from_moex
docker compose -f docker-compose.dev.yml exec web python manage.py load_instruments_from_moex --update-existing

# Тесты Django
docker compose -f docker-compose.dev.yml exec web python manage.py test

# Фронтенд (в контейнере frontend или локально)
cd frontend && npm install && npm run dev
cd frontend && npm run build   # tsc + vite build
```

## Архитектура

### Модель из двух контейнеров приложения
- **web**: Django 5.2 ASGI (uvicorn), REST API на `/api/` и серверные страницы (`/`, `/about/`, `/help/`). Статика через WhiteNoise.
- **frontend**: React 18 SPA (Vite dev server на порту 3000). Проксирует `/api`, `/admin`, `/static`, `/media` на Django через конфиг Vite.

### Сервисы (docker-compose.dev.yml)
| Сервис | Порт | Назначение |
|--------|------|------------|
| web | 8000 | Django API + SSR-страницы |
| frontend | 3000 | React SPA (Vite dev) |
| db | 5432 | PostgreSQL 17.5 |
| redis | 6379 | Кэш (свечи) + слой Channels |
| rabbitmq | 5672 | Брокер Celery |
| celery | — | Фоновые задачи (синхронизация данных MOEX) |
| celery-beat | — | Планировщик периодических задач |
| flower | 5555 | Мониторинг Celery |
| pgadmin | 5050 | UI администрирования БД |

### Django-приложения (django_base/)
- **core** — общие представления (index, about, help), базовые утилиты
- **accounts** — TraderProfile (расширяет User), JWT-аутентификация через simplejwt
- **instruments** — каталог инструментов MOEX: Sector → IndustryGroup → Industry → SubIndustry → Instrument, плюс Futures/FuturesAssetCodeMapping. Management-команды загрузки из API MOEX и обогащения из CSV
- **strategies** — модель TradingStrategy (принадлежит пользователю)
- **trades** — Trade (поддержка parent/child), TradeAnalysis, TradeScreenshot, MarketContext

### Фронтенд (frontend/src/)
- **api/** — HTTP-клиент с автообновлением JWT (access/refresh в localStorage), типизированные эндпоинты
- **auth/** — AuthContext + защита маршрутов RequireAuth
- **components/** — Layout, CandlestickChart (lightweight-charts), DrawingToolbar, ui/ (Radix + shadcn-style)
- **pages/** — Dashboard, Analytics, Profile, trades/, strategies/, instruments/, auth/, admin/, public/
- **lib/** — утилиты (хук useApi, datetime, форматирование, хранение графиков)

### Ключевые паттерны
- REST API на DRF с JWT (`Bearer` token). Пагинация по умолчанию: 24 элемента на страницу.
- Алиас Vite `@` указывает на `frontend/src/`.
- Redis db0 — Channels, db1 — кэш Django. TTL кэша по умолчанию 30 мин.
- CSV-файлы свечей хранятся в `uploads/candles/` (вне Django).
- Celery beat запускает `update_today_candles` каждые 5 мин (см. `CELERY_BEAT_SCHEDULE` в settings).
- Конфигурация через `python-decouple` (читает `.env`). У всех настроек есть значения по умолчанию.

### Продакшен (Dokploy + Traefik)
Используется `docker-compose.prod.yml`. Без nginx — TLS и маршрутизацию обрабатывает Traefik через labels контейнеров. Статику отдаёт WhiteNoise, медиа — Django view. Домен задаётся через переменную `DOMAIN` в `.env`.

## Доступ к prod-серверу по SSH

В `~/.ssh/config` настроен alias `midas-hand` (IP `82.146.58.10`, порт `49822`, user `root`,
ключ `~/.ssh/id_ed25519_claude` без пароля, `IdentitiesOnly yes`). Можно подключаться
напрямую: `ssh midas-hand`. Стандартный 22-й порт закрыт, password-аутентификация
отключена — только publickey.

Корень compose-стэка Dokploy на сервере: `/etc/dokploy/compose/traderdiary-midashand-5fsvxg/code`.
Compose-файл — `docker-compose.prod.yml`. Имена контейнеров с префиксом
`traderdiary-midashand-5fsvxg-`.

Полезные one-liners:

```bash
# Логи / статус
ssh midas-hand 'cd /etc/dokploy/compose/traderdiary-midashand-5fsvxg/code && docker compose -f docker-compose.prod.yml ps'
ssh midas-hand 'cd /etc/dokploy/compose/traderdiary-midashand-5fsvxg/code && docker compose -f docker-compose.prod.yml logs celery --tail=200'

# Django shell на проде
ssh midas-hand 'cd /etc/dokploy/compose/traderdiary-midashand-5fsvxg/code && docker compose -f docker-compose.prod.yml exec -T web python manage.py shell -c "<код>"'

# Redis (кэш на db1)
ssh midas-hand 'cd /etc/dokploy/compose/traderdiary-midashand-5fsvxg/code && docker compose -f docker-compose.prod.yml exec -T redis redis-cli -n 1 KEYS "candles:*"'
```

Деплой автоматический: push в `main` → Dokploy пересобирает стэк по `docker-compose.prod.yml`.

## Коммиты

Сообщения коммитов пишут **на русском языке** в формате [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): краткое описание изменения
```

- **type**: `feat`, `fix`, `refactor`, `chore`, `docs` и т.п.
- **scope**: область изменения — `frontend`, `backend`, `infra`, `admin`, `instruments`, `trades`, `deps` и т.д.
- Описание после двоеточия — с маленькой буквы, по сути «что сделано», без точки в конце.

Примеры из истории репозитория:

```
feat(frontend): инструменты рисования на свечном графике
fix(infra): сброс кэша без манифеста статики + именованный volume для uploads
feat(instruments): API свечей с кэшированием и ресемплингом
refactor(ui): заменить sidebar на Sheet + Tailwind, удалить layout CSS
```

Комиты пиши на русском языке. Комиты делай осмысленными на каждую функциональность свой комит, не надо сильно уменьшать комиты, но и укрупнять их тоже не нужно, надо соблюдать баланс, чтобы можно было разобраться что написано в том или ином комите.
Также рассуждай и предлагай планы реализации на русском языке, пользователь может ошибаться, думая, что предлагает правильное решение, поэтому главное учитывать задачу глобально и предлагать свои решения, если решение пользователя неправильное

## Отладка

Конфигурации attach в VS Code: порт 5678 (Django), порт 5679 (Celery). debugpy включён в dev compose. Маппинг путей: локальный `django_base/` ↔ контейнер `/app/django_base`.
