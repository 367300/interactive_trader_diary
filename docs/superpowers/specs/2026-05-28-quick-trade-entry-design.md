# Быстрый ввод цепочек завершённых сделок на графике

**Дата:** 2026-05-28
**Статус:** Утверждён к реализации
**Автор:** Брейншторм с пользователем

## Контекст и проблема

Текущий поток ввода сделки требует прохождения формы создания (`/trades/new`) и последовательного добавления каждого этапа жизненного цикла позиции — открытие → усреднения → частичные закрытия → закрытие — каждое как отдельной сделки с переходом туда-обратно по UI. Для записи уже **завершённых в прошлом** сделок этот цикл утомителен: трейдер хочет ввести серию готовых цепочек, не перепрыгивая между формами.

В проекте уже есть компонент `ChartPricePickerDialog`, который умеет захватывать с графика дату+цену для входа, SL и TP. Эту механику нужно расширить до полноценной страницы быстрого ввода всей цепочки.

## Цель

Добавить отдельную страницу `/trades/quick`, на которой трейдер за несколько кликов по свечному графику вводит цельную завершённую цепочку (OPEN → опц. AVERAGE/PARTIAL_CLOSE → CLOSE), указывая для каждого этапа точку на графике и `volume_from_capital`. По окончании цепочка сохраняется атомарно одним запросом, и трейдер может либо приступить к следующей, либо добавить общий анализ.

## Не цель

- Ввод незавершённых (открытых) позиций.
- Перевод существующего потока `/trades/new` на новую логику — он остаётся для подробного ввода с обоснованием, эмоциями и тегами.
- Реал-тайм режим с автоматическим определением сделок из брокерского API.
- Ввод нескольких параллельных цепочек одновременно — каждая цепочка вводится последовательно (но можно вводить несколько подряд на одном тикере с тусклой историей маркеров).

## Решения, принятые в брейншторме

| Вопрос | Решение |
|---|---|
| Парадигма потока | **Гибрид: wizard одной цепочки + история маркеров.** Цепочка сохраняется одна за раз. После save маркеры остаются на графике тускло, чтобы было видно прошлые цепочки на том же тикере; при смене тикера маркеры пропадают. |
| Per-leg поля | Точка (date+price) с графика + `volume_from_capital`. Commission не вводится в quick mode (по умолчанию 0). |
| Strategy | Обязательная в шапке цепочки. |
| SL/TP | На OPEN захватываются обязательно (как в существующем `ChartPricePickerDialog`). На AVERAGE опционально через чекбокс "пересчитать SL/TP". На PARTIAL_CLOSE / CLOSE — недопустимо. |
| После save | Success-панель с действиями `[Добавить анализ]` / `[Следующая цепочка]` / `[Открыть детали]`. Авто-скриншота нет — добавим как следующий шаг при необходимости. |
| Backend API | Новый атомарный endpoint `POST /api/trades/quick-chain/` с цепочкой в одном payload. Один `transaction.atomic`. |
| TradeAnalysis | Не создаётся в quick-flow. Добавляется после save через success-панель (переход в существующий редактор TradeAnalysis). |

## Архитектура

### Backend

- Новый endpoint: `POST /api/trades/quick-chain/`
- Реализация: `@action(detail=False, methods=['post'])` метод `quick_chain` в `TradeViewSet` (файл `django_base/trades/views.py`).
- Сериализаторы (файл `django_base/trades/serializers.py`):
  - `QuickChainLegSerializer` — один leg: `type`, `date`, `price`, `volume_from_capital`, `planned_stop_loss?`, `planned_take_profit?`.
  - `QuickChainSerializer` — шапка (`instrument_id`, `strategy_id`, `direction`) + `legs: List[QuickChainLegSerializer]`.
- Создание выполняется внутри `transaction.atomic()`:
  1. `Trade(trade_type=OPEN, ...)` сохраняется как parent.
  2. Каждый последующий leg сохраняется с `parent_trade=open.id`.
- `TradeAnalysis` в этом эндпоинте **не создаётся** — он остаётся независимой сущностью, привязываемой к OPEN-сделке цепочки позже.

### Frontend

- Новый роут `/trades/quick` в `frontend/src/App.tsx` (под `ProtectedLayout`).
- Новая директория `frontend/src/pages/trades/quick/` с компонентами (см. секцию "Компоненты").
- В `frontend/src/components/Layout.tsx` добавляется пункт сайдбара "Быстрый ввод" между "Новая сделка" и "Все сделки".
- В `frontend/src/pages/trades/TradeForm.tsx` сверху добавляется компактный inline-баннер с ссылкой на `/trades/quick`: "Нужно быстро записать уже завершённую сделку? → Быстрый ввод".

### Переиспользование существующего кода

- `CandlestickChart` (frontend/src/components/CandlestickChart.tsx) подвергается **целевому рефакторингу**: внешний API маркеров и обработчика клика выносится в управляемые props (`markers`, `onPointPick`). Это требуется для:
  - quick-страницы (маркеры активной + сохранённых цепочек, режим "жду leg"),
  - и существующего `ChartPricePickerDialog` (нынешний внутренний стейт переезжает на тот же контролируемый API).
- API-клиент `frontend/src/api/trades.ts` получает метод `createQuickChain(payload): Promise<{open_trade: TradeDetail, chain_id: string}>`.

## Компоненты

### Backend

| Артефакт | Файл | Ответственность |
|---|---|---|
| `QuickChainSerializer` | `django_base/trades/serializers.py` | Валидация шапки + цепочки целиком (см. секцию "Валидация") |
| `QuickChainLegSerializer` | `django_base/trades/serializers.py` | Сериализация одного leg |
| `TradeViewSet.quick_chain` | `django_base/trades/views.py` | Действие `POST /quick-chain/`, transaction.atomic, ответ `TradeDetailSerializer(open)` |

### Frontend (frontend/src/pages/trades/quick/)

| Компонент | Ответственность |
|---|---|
| `QuickTradeEntryPage.tsx` | Маршрут страницы. Хранит стейт `activeChain`, `pendingLeg`, `savedChainsForCurrentInstrument`, оркеструет вызов API. |
| `QuickChainHeader.tsx` | Левая колонка: instrument-select (через существующий поиск инструментов), strategy-select (обязательное поле), direction-toggle, отображение текущего статуса ожидания, кнопки `[+ Усреднение] [+ Частичка] [+ Закрытие]`. |
| `QuickChainChart.tsx` | Центральная колонка: обёртка над отрефакторенным `CandlestickChart`. Получает массив маркеров (активные яркие + прошлые тусклые) и колбэк `onPointPick`. Сама не хранит маркеры. |
| `QuickChainLegsPanel.tsx` | Правая колонка: список legs текущей цепочки. Каждая строка имеет inline-редактирование `volume_from_capital`, чекбокс "пересчитать SL/TP" для AVERAGE. Кнопки `[Сохранить цепочку]` (disabled пока CLOSE не отмечен и не сходятся объёмы) и `[Сбросить]`. |
| `QuickChainSuccessPanel.tsx` | Появляется после успешного save поверх остальной разметки страницы. Кнопки `[Добавить анализ]`, `[Следующая цепочка]`, `[Открыть детали]`. |

### API клиент

`frontend/src/api/trades.ts`:
```ts
type QuickChainLeg = {
  type: 'OPEN' | 'AVERAGE' | 'PARTIAL_CLOSE' | 'CLOSE';
  date: string; // ISO 8601
  price: number;
  volume_from_capital: number;
  planned_stop_loss?: number | null;
  planned_take_profit?: number | null;
};

type QuickChainPayload = {
  instrument_id: number;
  strategy_id: number;
  direction: 'LONG' | 'SHORT';
  legs: QuickChainLeg[];
};

createQuickChain(payload: QuickChainPayload): Promise<{
  open_trade: TradeDetail;
  chain_id: string;
}>;
```

## Поток данных

### Жизненный цикл клика "жду leg"

1. Пользователь жмёт в `QuickChainHeader` кнопку шага, например `[+ Усреднение]`.
2. `QuickTradeEntryPage` устанавливает `pendingLeg = { type: 'AVERAGE', sub: 'point' }`.
3. Курсор над графиком сигнализирует ожидание клика.
4. Клик по свече → `CandlestickChart` вызывает `onPointPick({ time, price })`.
5. `QuickTradeEntryPage` добавляет leg в `activeChain.legs`:
   `{ type: 'AVERAGE', date, price, volume_from_capital: 10 /* default */, planned_stop_loss: null, planned_take_profit: null }`.
6. `pendingLeg = null`. `LegsPanel` рендерит новую строку.

### SL/TP захват

- На **OPEN**: после клика точки автоматический переход в подсостояние `pendingLeg.sub = 'sl'` → клик → `sub = 'tp'` → клик → leg готов. Кнопка "Без SL/TP" в статус-баре пропускает.
- На **AVERAGE**: чекбокс "пересчитать SL/TP" в строке leg в `LegsPanel`. Если установлен — повторяет цикл захвата SL и TP для этого leg.
- На **PARTIAL_CLOSE / CLOSE**: SL/TP недопустимы (см. валидацию).

### Save

1. Пользователь жмёт `[Сохранить цепочку]`.
2. Client-side preflight (см. секцию "Валидация").
3. `POST /api/trades/quick-chain/` с payload.
4. Backend в transaction.atomic создаёт OPEN + child legs.
5. Ответ — `TradeDetailSerializer(open)` + `chain_id`.
6. Frontend:
   - добавляет новую цепочку в `savedChainsForCurrentInstrument` (рендер тусклых маркеров на графике),
   - очищает `activeChain`,
   - показывает `QuickChainSuccessPanel`.

### Загрузка прошлых цепочек на инструмент

- При выборе инструмента или его смене: `GET /api/trades/?instrument=<id>&trade_type=OPEN&is_closed=true&limit=50`.
- Из ответа собираются маркеры: точки parent + все child legs каждой завершённой цепочки.
- **Зависимость:** требуется поддержка фильтра `is_closed` в `TradeViewSet.list`. Проверить наличие — если нет, добавить через `filterset_class`.

### Действия success-панели

- `[Добавить анализ]` → переход на `/trades/<open_id>/edit?tab=analysis` (использует существующий редактор TradeAnalysis из TradeForm).
- `[Следующая цепочка]` → закрывает панель, инструмент и стратегия в шапке сохраняются, `activeChain` пуст.
- `[Открыть детали]` → переход на `/trades/<open_id>`.

## Валидация

### Client-side preflight

- Шапка: `instrument_id`, `strategy_id`, `direction` заполнены.
- Минимум 2 leg: первый — `OPEN`, последний — `CLOSE`.
- Ровно один `OPEN` и ровно один `CLOSE`.
- Все `price > 0`, все `volume_from_capital` в `[1..100]`.
- Даты неубывающие: `legs[i].date <= legs[i+1].date`.
- `planned_stop_loss` и `planned_take_profit` присутствуют только в legs типа `OPEN` или `AVERAGE`.
- Если на OPEN заданы оба SL и TP — для LONG `sl < entry < tp`, для SHORT `sl > entry > tp`. Нарушение — **warning**, не блокирует (трейдер записывает то, что реально было).
- Сумма `volume_from_capital` по `OPEN` + `AVERAGE` равна сумме по `PARTIAL_CLOSE` + `CLOSE`. Нарушение — конкретная ошибка с цифрами.

### Server-side (`QuickChainSerializer.validate`)

Повторяет все проверки клиента (нельзя доверять клиенту) плюс:

- `instrument` существует и не удалён.
- `strategy` существует и `strategy.user == request.user`.
- `direction` ∈ `{LONG, SHORT}`.
- `legs[i].type` ∈ `{OPEN, AVERAGE, PARTIAL_CLOSE, CLOSE}`.
- При ошибке возвращает HTTP 400 со структурой:
  ```json
  {
    "legs": [null, {"price": "должно быть > 0"}, null, null],
    "non_field_errors": ["Сумма закрытий не равна сумме открытий"]
  }
  ```

### Транзакционность

- Endpoint работает в `transaction.atomic()`. Любая ошибка внутри — полный rollback.

### Frontend обработка ошибок

- **400**: парсим `legs` массив, подсвечиваем красным конкретные строки в `LegsPanel`, тултип с сообщением. `non_field_errors` показывается над кнопкой `[Сохранить цепочку]`.
- **5xx / network**: toast "Не удалось сохранить" + кнопка "Повторить". Стейт цепочки не теряем.

### Edge cases

- Смена инструмента при не-пустом `activeChain` → модалка "Сбросить незавершённую цепочку?". Только подтверждение очищает.
- Клик на тусклый маркер прошлой цепочки → popover "Цепочка #N от <дата>" с ссылкой на её детали.
- Партиал-клоуз с объёмом > доступного на момент leg — preflight ловит и показывает remaining.

## Дефолтные значения

| Поле | Дефолт |
|---|---|
| `volume_from_capital` OPEN | 10 (как в модели) |
| `volume_from_capital` AVERAGE | 10 |
| `volume_from_capital` PARTIAL_CLOSE | половина текущего открытого |
| `volume_from_capital` CLOSE | весь оставшийся (закрывает позицию) |
| `commission` | 0 (передаётся в backend; не редактируется в quick UI) |
| `planned_stop_loss/take_profit` AVERAGE | null (опционально) |

## Тестирование

### Backend (`django_base/trades/tests/test_quick_chain.py`)

Django TestCase + REST framework `APIClient`.

| Тест | Что проверяет |
|---|---|
| `test_create_minimal_chain_open_close` | OPEN+CLOSE → 201, `is_closed()` true, parent_trade у CLOSE = open.id |
| `test_create_full_chain` | OPEN+AVG+PARTIAL+CLOSE → 201, child корректно слинкованы |
| `test_rejects_first_not_open` | 400 с ошибкой по legs[0] |
| `test_rejects_last_not_close` | 400 |
| `test_rejects_multiple_opens` | 400 |
| `test_rejects_volume_mismatch` | sum(close) ≠ sum(open+avg) → 400 |
| `test_rejects_dates_not_monotonic` | 400 |
| `test_rejects_sl_tp_on_partial_close` | leg PARTIAL_CLOSE с SL → 400 |
| `test_atomic_rollback_on_db_error` | мокаем падение на 3-м leg → в БД ни одной записи |
| `test_strategy_must_belong_to_user` | strategy чужого юзера → 400 |
| `test_unauthenticated_403` | без токена 401/403 |
| `test_invalid_instrument_id` | несуществующий instrument → 400 |
| `test_chain_appears_in_list` | после save GET /api/trades/ возвращает цепочку |

### Frontend (`frontend/src/pages/trades/quick/__tests__/`)

Vitest + React Testing Library.

| Тест | Что проверяет |
|---|---|
| `QuickChainLegsPanel.test.tsx` | рендер leg-ов, inline-edit volume обновляет стейт |
| `QuickTradeEntryPage.test.tsx: add_average_leg_flow` | клик `[+ Усреднение]` + клик по моку графика → leg в панели |
| `QuickTradeEntryPage.test.tsx: save_calls_api` | мок `tradesApi.createQuickChain` получает правильный payload |
| `QuickTradeEntryPage.test.tsx: error_400_highlights_leg` | мок 400 с `legs[1].price` → строка leg #1 красная |
| `QuickTradeEntryPage.test.tsx: reset_on_instrument_change` | смена тикера при не-пустой цепочке → модалка → подтверждение → стейт пустой |
| `QuickChainChart.test.tsx` | рендерит маркеры из props (snapshot ключевого стейта) |

### Ручное smoke-тестирование

После реализации:
1. `docker compose -f docker-compose.dev.yml up --build`.
2. Залогиниться (admin/Qwer@12345).
3. Открыть `http://localhost:3000/trades/quick`.
4. Ввести цепочку SBER LONG: вход → 1 усреднение → 1 частичное закрытие → закрытие. Сохранить.
5. Проверить:
   - Цепочка появилась в `/trades` как одна строка-родитель с child-сделками.
   - В деталях `is_closed = true`, аналитика подхватывает (`/analytics`).
   - В success-панели кнопка `[Добавить анализ]` ведёт в редактор TradeAnalysis.
6. На той же странице ввести вторую цепочку на SBER — должны быть видны тусклые маркеры первой.
7. Сменить инструмент с не-пустой активной цепочкой — должна появиться модалка подтверждения.

### Команды верификации

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain
cd frontend && npm run test -- pages/trades/quick
```

## План внедрения (краткий)

1. Backend: добавить сериализаторы и `quick_chain` action, миграции не требуются. Тесты.
2. Backend: убедиться/добавить фильтр `is_closed` в `TradeViewSet.list`.
3. Frontend: рефакторинг `CandlestickChart` (контролируемые `markers` и `onPointPick`). Адаптировать существующий `ChartPricePickerDialog`.
4. Frontend: новые компоненты quick/.
5. Frontend: API метод `createQuickChain`, роут, пункт сайдбара, баннер на TradeForm.
6. Тесты frontend + ручное smoke.

Детальный пошаговый план — отдельным документом через `writing-plans` после утверждения этого spec.
