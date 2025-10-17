# django-base-docker

На главной ветке main находится базовый шаблон проекта Django для обучения коллег работе с Django внутри Docker-контейнеров с поддержкой асинхронных задач и WebSocket.

На ветке ml_service находится форма, использующая мл-сервис, который описан в репозитории [ml_сервис](https://github.com/367300/customer-support-ticket) с использованием базового шаблона джанго с асинхронным сервером приложений, сокет-соединениями и celery-заданиями

## Описание

- Проект предназначен для знакомства с современным подходом к разработке Django-приложений в изолированной среде Docker.
- Включает готовое приложение `tasks` с примером выполнения фоновых задач через Celery и синхронных задач.
- Поддерживает WebSocket-соединения через Django Channels для отслеживания статуса выполнения задач в реальном времени.
- Использует асинхронный сервер приложений (ASGI, Uvicorn).
- Интегрирован с Celery, RabbitMQ, Flower для управления фоновыми задачами.
- Проект легко расширяется под любые задачи.

## Состав
- Django (ASGI-ready)
- Django Channels (WebSocket поддержка)
- Celery (фоновые задачи)
- RabbitMQ (брокер сообщений)
- Flower (мониторинг Celery)
- Postgres (через Docker)
- Nginx (для production)
- Готовые конфиги для dev/prod окружения
- Пример .env файла
- Пример приложения `tasks` с формой и WebSocket
- **Генератор эмбедингов** — скрипт для создания базы знаний из кодовой базы ([подробнее](EMBEDDINGS_GENERATOR.md))

## Архитектура проекта
![Архитектура проекта](doc/img/arch_prod.png)

## Возможности

### Фоновые задачи
- Выполнение задач через Celery с задержкой
- Мониторинг задач через Flower
- Автоматический запуск воркеров при старте контейнеров

### WebSocket и реальное время
- Отслеживание статуса выполнения задач в реальном времени
- Автоматическое обновление страницы без перезагрузки
- Использование Django Channels для WebSocket-соединений

### Пример приложения `tasks`
- Форма с двумя кнопками: синхронное и асинхронное выполнение
- Страница статуса с WebSocket-обновлениями
- Модель TaskStatus для хранения состояния задач

## Как развернуть проект

1. **Клонируйте репозиторий:**
   ```bash
   git clone <адрес-репозитория>
   cd django-base-docker
   ```

2. **Создайте файл .env:**
   ```bash
   cp .env.example .env
   # или создайте вручную, см. пример ниже
   ```

3. **Запустите проект в режиме разработки:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
   ```
   - Приложение будет доступно на http://localhost:8000
   - Для отладки используется Debugpy и порт прослушивания 5678, подключаться к локальному хосту где запущены контейнеры
   - Админка Django: http://localhost:8000/admin/
   - PgAdmin (для работы с БД): http://localhost:5050
   - Flower (мониторинг Celery): http://localhost:5555
   - Пример приложения tasks: http://localhost:8000/tasks/
   - Для отладки используется Debugpy и порт прослушивания 5678

4. **Остановить проект:**
   ```bash
   docker compose down
   ```

5. **Выполнить миграции или другие команды Django внутри контейнера:**
   ```bash
   docker compose exec web python manage.py migrate
   docker compose exec web python manage.py createsuperuser
   ```

6. **Собрать статику (production):**
   ```bash
   docker compose exec web python manage.py collectstatic --noinput
   ```

## Пример .env файла

```env
# Django
DJANGO_SECRET_KEY=your_super_secret_key
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0
DJANGO_LANGUAGE_CODE=ru-RU
DJANGO_TIME_ZONE=Europe/Moscow

# Postgres
POSTGRES_DB=django_db
POSTGRES_USER=django_user
POSTGRES_PASSWORD=django_password
POSTGRES_HOST=db
POSTGRES_PORT=5432

# RabbitMQ
RABBITMQ_DEFAULT_USER=guest
RABBITMQ_DEFAULT_PASS=guest

# Celery
CELERY_BROKER_URL=amqp://guest:guest@rabbitmq:5672//
CELERY_RESULT_BACKEND=rpc://

# PgAdmin
PGADMIN_DEFAULT_EMAIL=admin@admin.com
PGADMIN_DEFAULT_PASSWORD=admin

# Flower для продуктивной среды
FLOWER_BASIC_AUTH=login:password

# Учетка, чтобы узнать свой id, введи команду id
# Это чтобы ты мог редактировать файлы, которые в общем volume создают твои контейнеры
UID=1000
GID=1000

# Также опционально для скрипта создания базы знаний для LLM
OPENAI_API_KEY=<КЛЮЧ ДЛЯ АПИ OPENAI>
```

## Генератор эмбедингов

Проект включает универсальный скрипт для создания эмбедингов из кодовой базы с поддержкой:
- Парсинга Python файлов (методы, функции)
- Обработки документации (.md, .yml, .conf)
- Умного обновления (только изменённые файлы)
- Игнорирования по .gitignore
- Интеграции с OpenAI API

**Подробная документация:** [EMBEDDINGS_GENERATOR.md](EMBEDDINGS_GENERATOR.md)

**Быстрый старт:**
```bash
# Установите зависимости
pip install -r requirements-emb.txt

# Создайте .env с OPENAI_API_KEY
echo "OPENAI_API_KEY=your_key_here" > .env

# Запустите генерацию эмбедингов
python generate_embeddings.py
```

## Тестирование функциональности

### Пример приложения `tasks`
1. Перейдите на http://localhost:8000/tasks/
2. Нажмите "Выполнить синхронно" — задача выполнится сразу с задержкой 5 секунд
3. Нажмите "Выполнить через Celery" — задача отправится в фоновую очередь и выполнится асинхронно
4. На странице статуса увидите обновления в реальном времени через WebSocket

### Мониторинг через Flower
- Откройте http://localhost:5555
- Просматривайте активные воркеры, задачи и их статусы
- Отслеживайте производительность Celery

## Полезные команды

- Запуск в режиме разработки:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
  ```
- Запуск в production:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
  ```
- Остановка:
  ```bash
  docker compose down
  ```
- Миграции:
  ```bash
  docker compose exec web python manage.py migrate
  ```
- Создание суперпользователя:
  ```bash
  docker compose exec web python manage.py createsuperuser
  ```
- Сборка статики:
  ```bash
  docker compose exec web python manage.py collectstatic --noinput
  ```
- Просмотр логов:
  ```bash
  docker compose logs -f web
  docker compose logs -f celery
  ```
- Запуск воркера Celery вручную (если нужно):
  ```bash
  docker compose exec web celery -A django_base worker --loglevel=info
  ```

## Архитектура

### Сервисы
- **web** — Django приложение с ASGI сервером
- **celery** — воркер для выполнения фоновых задач (сам контейнер создан с целью выполнить команду запуска воркера и вывода логов)
- **rabbitmq** — брокер сообщений для Celery
- **flower** — веб-интерфейс для мониторинга Celery
- **db** — PostgreSQL база данных
- **pgadmin** — веб-интерфейс для управления БД
- **nginx** — веб-сервер (только в production)

### Технологии
- **Django Channels** — для WebSocket поддержки
- **Celery** — для фоновых задач
- **RabbitMQ** — как брокер сообщений
- **InMemoryChannelLayer** — для WebSocket (в одном контейнере)
- **Bootstrap** — для UI (через CDN)

---

**Проект готов к использованию и расширению!**

Если возникнут вопросы — смело обращайтесь!
