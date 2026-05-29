# Quick Trade Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать страницу `/trades/quick` для быстрого ввода завершённых цепочек сделок (OPEN → AVG/PARTIAL → CLOSE) кликами по свечному графику с атомарным сохранением одним запросом.

**Architecture:** Backend получает новый атомарный endpoint `POST /api/trades/quick-chain/` (один сериализатор валидирует и создаёт всю цепочку в `transaction.atomic`). Frontend — новая страница из 3 колонок (шапка / chart / список legs) + sidebar-пункт + баннер в TradeForm. `CandlestickChart` дополняется опциональными контролируемыми props (`markers`, `onPointPick`, `pickerMode`) для использования в quick-странице. Существующий `ChartPricePickerDialog` остаётся как есть (его миграция вынесена в отдельный future-plan).

**Tech Stack:** Django 5.2 + DRF (REST), React 18 + Vite + TypeScript, lightweight-charts. Vitest + React Testing Library + jsdom добавляются для фронтенд-тестов.

**Спец-документ:** `docs/superpowers/specs/2026-05-28-quick-trade-entry-design.md`

---

## File Structure

### Создаются

| Путь | Назначение |
|---|---|
| `django_base/trades/tests/__init__.py` | Превращает tests в пакет |
| `django_base/trades/tests/test_quick_chain.py` | API-тесты quick-chain endpoint |
| `frontend/src/pages/trades/quick/QuickTradeEntryPage.tsx` | Маршрут страницы и оркестрация |
| `frontend/src/pages/trades/quick/QuickChainHeader.tsx` | Левая колонка: шапка + статус + кнопки шагов |
| `frontend/src/pages/trades/quick/QuickChainChart.tsx` | Обёртка над CandlestickChart с управляемыми маркерами |
| `frontend/src/pages/trades/quick/QuickChainLegsPanel.tsx` | Правая колонка: legs + inline-edit |
| `frontend/src/pages/trades/quick/QuickChainSuccessPanel.tsx` | Панель после save с действиями |
| `frontend/src/pages/trades/quick/types.ts` | Типы стейта (ChainLeg, ActiveChain, PendingLeg) |
| `frontend/vitest.config.ts` | Конфиг vitest |
| `frontend/src/test/setup.ts` | jsdom + RTL setup |
| `frontend/src/pages/trades/quick/__tests__/QuickChainLegsPanel.test.tsx` | Тест inline-edit |
| `frontend/src/pages/trades/quick/__tests__/QuickTradeEntryPage.test.tsx` | Тесты flow страницы |

### Изменяются

| Путь | Что меняем |
|---|---|
| `django_base/trades/serializers.py` | Добавить `QuickChainLegSerializer`, `QuickChainSerializer` |
| `django_base/trades/views.py` | Добавить `@action quick_chain`, расширить `get_queryset` фильтрами `instrument`, `is_closed` |
| `django_base/trades/tests.py` | **Удалить** (стаб) — заменяется пакетом `tests/` |
| `frontend/src/api/endpoints.ts` | Добавить `tradesApi.createQuickChain` + типы |
| `frontend/src/components/CandlestickChart.tsx` | Добавить опциональные props `markers`, `onPointPick`, `pickerMode` |
| `frontend/src/components/Layout.tsx` | Добавить пункт сайдбара "Быстрый ввод" |
| `frontend/src/App.tsx` | Зарегистрировать роут `/trades/quick` |
| `frontend/src/pages/trades/TradeForm.tsx` | Inline-баннер "Быстрый ввод" сверху формы |
| `frontend/package.json` | Скрипт `"test": "vitest run"` + dev deps |

### Удаляются

| Путь | Причина |
|---|---|
| `django_base/trades/tests.py` | Заменяется на `tests/` пакет |

---

## Backend Tasks

### Task 1: Test scaffolding для quick-chain

**Files:**
- Delete: `django_base/trades/tests.py`
- Create: `django_base/trades/tests/__init__.py`
- Create: `django_base/trades/tests/test_quick_chain.py`

- [ ] **Step 1: Удалить stub tests.py**

```bash
rm django_base/trades/tests.py
```

- [ ] **Step 2: Создать пакет tests с пустым __init__.py**

Создать `django_base/trades/tests/__init__.py` пустым (0 байт).

- [ ] **Step 3: Создать `tests/test_quick_chain.py` со скелетом**

```python
import uuid
from decimal import Decimal
from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from instruments.models import Sector, IndustryGroup, Industry, SubIndustry, Instrument
from strategies.models import TradingStrategy
from trades.models import Trade


class QuickChainBaseTestCase(APITestCase):
    """Базовый кейс — создаёт user, instrument, strategy, аутентифицирует клиент."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username='trader1', password='pwd12345', email='t@example.com'
        )
        cls.other_user = User.objects.create_user(
            username='trader2', password='pwd12345', email='t2@example.com'
        )
        sector = Sector.objects.create(name='Финансы', code='FIN')
        ig = IndustryGroup.objects.create(name='Банки', code='BANK', sector=sector)
        ind = Industry.objects.create(name='Универсальные банки', code='UBANK', industry_group=ig)
        sub = SubIndustry.objects.create(name='Универсальные банки', code='UBANK_SUB', industry=ind)
        cls.instrument = Instrument.objects.create(
            ticker='SBER', name='Сбербанк', sub_industry=sub
        )
        cls.strategy = TradingStrategy.objects.create(
            user=cls.user, name='Скальпинг', strategy_type='SCALPING'
        )
        cls.other_strategy = TradingStrategy.objects.create(
            user=cls.other_user, name='Чужая', strategy_type='SCALPING'
        )

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    @staticmethod
    def make_payload(**overrides):
        base = {
            'instrument_id': None,
            'strategy_id': None,
            'direction': 'LONG',
            'legs': [
                {
                    'type': 'OPEN',
                    'date': '2026-05-01T10:00:00Z',
                    'price': '100.00',
                    'volume_from_capital': 10,
                    'planned_stop_loss': '95.00',
                    'planned_take_profit': '110.00',
                },
                {
                    'type': 'CLOSE',
                    'date': '2026-05-01T12:00:00Z',
                    'price': '108.00',
                    'volume_from_capital': 10,
                },
            ],
        }
        base.update(overrides)
        return base


class QuickChainSmokeTest(QuickChainBaseTestCase):
    """Sanity-check: фикстура работает, endpoint существует."""

    def test_endpoint_exists(self):
        payload = self.make_payload(
            instrument_id=self.instrument.id,
            strategy_id=self.strategy.id,
        )
        response = self.client.post('/api/trades/quick-chain/', payload, format='json')
        # endpoint должен существовать (не 404)
        self.assertNotEqual(response.status_code, status.HTTP_404_NOT_FOUND)
```

- [ ] **Step 4: Запустить smoke-test, убедиться что он падает с 404 (endpoint ещё не существует)**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain.QuickChainSmokeTest -v 2
```

Expected: FAIL — endpoint возвращает 404 (asserNotEqual ловит и валит тест).

- [ ] **Step 5: Commit scaffolding**

```bash
git add django_base/trades/tests/__init__.py django_base/trades/tests/test_quick_chain.py
git rm django_base/trades/tests.py
git commit -m "test(trades): тест-пакет и базовый кейс для quick-chain endpoint"
```

---

### Task 2: QuickChainLegSerializer

**Files:**
- Modify: `django_base/trades/serializers.py`
- Test: `django_base/trades/tests/test_quick_chain.py`

- [ ] **Step 1: Написать падающий тест на сериализацию leg**

Добавить в `test_quick_chain.py`:

```python
class QuickChainLegSerializerTest(QuickChainBaseTestCase):
    def test_serializes_valid_open_leg(self):
        from trades.serializers import QuickChainLegSerializer
        data = {
            'type': 'OPEN',
            'date': '2026-05-01T10:00:00Z',
            'price': '100.50',
            'volume_from_capital': 25,
            'planned_stop_loss': '95.00',
            'planned_take_profit': '110.00',
        }
        s = QuickChainLegSerializer(data=data)
        self.assertTrue(s.is_valid(), s.errors)
        self.assertEqual(s.validated_data['type'], 'OPEN')
        self.assertEqual(s.validated_data['price'], Decimal('100.50'))
        self.assertEqual(s.validated_data['volume_from_capital'], 25)

    def test_rejects_negative_price(self):
        from trades.serializers import QuickChainLegSerializer
        data = {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
                'price': '-1', 'volume_from_capital': 10}
        s = QuickChainLegSerializer(data=data)
        self.assertFalse(s.is_valid())
        self.assertIn('price', s.errors)

    def test_rejects_volume_out_of_range(self):
        from trades.serializers import QuickChainLegSerializer
        for vol in [0, -5, 101]:
            data = {'type': 'CLOSE', 'date': '2026-05-01T10:00:00Z',
                    'price': '100', 'volume_from_capital': vol}
            s = QuickChainLegSerializer(data=data)
            self.assertFalse(s.is_valid(), f'vol={vol} must fail')
            self.assertIn('volume_from_capital', s.errors)
```

- [ ] **Step 2: Запустить тесты — ImportError ожидается**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain.QuickChainLegSerializerTest -v 2
```

Expected: FAIL с `ImportError: cannot import name 'QuickChainLegSerializer'`.

- [ ] **Step 3: Реализовать QuickChainLegSerializer**

Добавить в конец `django_base/trades/serializers.py`:

```python
class QuickChainLegSerializer(serializers.Serializer):
    """Один шаг цепочки в быстром вводе."""

    LEG_TYPES = ('OPEN', 'AVERAGE', 'PARTIAL_CLOSE', 'CLOSE')

    type = serializers.ChoiceField(choices=LEG_TYPES)
    date = serializers.DateTimeField()
    price = serializers.DecimalField(max_digits=15, decimal_places=2)
    volume_from_capital = serializers.IntegerField(min_value=1, max_value=100)
    planned_stop_loss = serializers.DecimalField(
        max_digits=15, decimal_places=2, required=False, allow_null=True
    )
    planned_take_profit = serializers.DecimalField(
        max_digits=15, decimal_places=2, required=False, allow_null=True
    )

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError('Цена должна быть положительной.')
        return value
```

- [ ] **Step 4: Запустить тесты — должны пройти**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain.QuickChainLegSerializerTest -v 2
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add django_base/trades/serializers.py django_base/trades/tests/test_quick_chain.py
git commit -m "feat(trades): сериализатор одного шага цепочки QuickChainLeg"
```

---

### Task 3: QuickChainSerializer — структура (header + nested legs)

**Files:**
- Modify: `django_base/trades/serializers.py`
- Test: `django_base/trades/tests/test_quick_chain.py`

- [ ] **Step 1: Тест на парсинг payload**

Добавить:

```python
class QuickChainSerializerStructureTest(QuickChainBaseTestCase):
    def test_parses_valid_payload(self):
        from trades.serializers import QuickChainSerializer
        payload = self.make_payload(
            instrument_id=self.instrument.id,
            strategy_id=self.strategy.id,
        )
        s = QuickChainSerializer(
            data=payload,
            context={'request': self._fake_request()},
        )
        self.assertTrue(s.is_valid(), s.errors)
        self.assertEqual(len(s.validated_data['legs']), 2)
        self.assertEqual(s.validated_data['direction'], 'LONG')

    def test_rejects_missing_legs(self):
        from trades.serializers import QuickChainSerializer
        payload = self.make_payload(
            instrument_id=self.instrument.id,
            strategy_id=self.strategy.id,
            legs=[],
        )
        s = QuickChainSerializer(data=payload, context={'request': self._fake_request()})
        self.assertFalse(s.is_valid())

    def _fake_request(self):
        from unittest.mock import MagicMock
        req = MagicMock()
        req.user = self.user
        return req
```

- [ ] **Step 2: Запустить — ImportError на QuickChainSerializer**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain.QuickChainSerializerStructureTest -v 2
```

Expected: FAIL — ImportError.

- [ ] **Step 3: Реализовать QuickChainSerializer (только структура)**

Добавить в `serializers.py`:

```python
class QuickChainSerializer(serializers.Serializer):
    """Атомарное создание цепочки сделок одним запросом."""

    instrument_id = serializers.IntegerField()
    strategy_id = serializers.IntegerField()
    direction = serializers.ChoiceField(choices=Trade.Direction.choices)
    legs = QuickChainLegSerializer(many=True)

    def validate_legs(self, value):
        if len(value) < 2:
            raise serializers.ValidationError('Цепочка должна содержать минимум 2 шага (OPEN и CLOSE).')
        return value
```

Также убедиться что в начале файла импортирован `Trade`:

```python
from .models import Trade, TradeAnalysis, TradeScreenshot
```

(если уже импортирован — пропустить).

- [ ] **Step 4: Запустить — оба теста должны пройти**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain.QuickChainSerializerStructureTest -v 2
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add django_base/trades/serializers.py django_base/trades/tests/test_quick_chain.py
git commit -m "feat(trades): структура QuickChainSerializer (header + nested legs)"
```

---

### Task 4: QuickChainSerializer.validate — структурные правила цепочки

**Files:**
- Modify: `django_base/trades/serializers.py`
- Test: `django_base/trades/tests/test_quick_chain.py`

Структурные правила: первый OPEN, последний CLOSE, ровно один OPEN и один CLOSE.

- [ ] **Step 1: Тесты на структуру цепочки**

```python
class QuickChainStructureValidationTest(QuickChainBaseTestCase):
    def _serializer(self, payload):
        from trades.serializers import QuickChainSerializer
        from unittest.mock import MagicMock
        req = MagicMock()
        req.user = self.user
        return QuickChainSerializer(data=payload, context={'request': req})

    def test_rejects_first_not_open(self):
        payload = self.make_payload(
            instrument_id=self.instrument.id,
            strategy_id=self.strategy.id,
            legs=[
                {'type': 'AVERAGE', 'date': '2026-05-01T10:00:00Z',
                 'price': '100', 'volume_from_capital': 10},
                {'type': 'CLOSE', 'date': '2026-05-01T11:00:00Z',
                 'price': '108', 'volume_from_capital': 10},
            ],
        )
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())
        self.assertIn('legs', s.errors)

    def test_rejects_last_not_close(self):
        payload = self.make_payload(
            instrument_id=self.instrument.id,
            strategy_id=self.strategy.id,
            legs=[
                {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
                 'price': '100', 'volume_from_capital': 10},
                {'type': 'AVERAGE', 'date': '2026-05-01T11:00:00Z',
                 'price': '98', 'volume_from_capital': 10},
            ],
        )
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())

    def test_rejects_multiple_opens(self):
        payload = self.make_payload(
            instrument_id=self.instrument.id,
            strategy_id=self.strategy.id,
            legs=[
                {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
                 'price': '100', 'volume_from_capital': 10},
                {'type': 'OPEN', 'date': '2026-05-01T11:00:00Z',
                 'price': '102', 'volume_from_capital': 10},
                {'type': 'CLOSE', 'date': '2026-05-01T12:00:00Z',
                 'price': '108', 'volume_from_capital': 20},
            ],
        )
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())

    def test_rejects_multiple_closes(self):
        payload = self.make_payload(
            instrument_id=self.instrument.id,
            strategy_id=self.strategy.id,
            legs=[
                {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
                 'price': '100', 'volume_from_capital': 10},
                {'type': 'CLOSE', 'date': '2026-05-01T11:00:00Z',
                 'price': '108', 'volume_from_capital': 5},
                {'type': 'CLOSE', 'date': '2026-05-01T12:00:00Z',
                 'price': '109', 'volume_from_capital': 5},
            ],
        )
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())
```

- [ ] **Step 2: Запустить — должны падать**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain.QuickChainStructureValidationTest -v 2
```

Expected: 4 FAIL (валидация ещё пропускает).

- [ ] **Step 3: Реализовать структурные проверки**

Заменить `validate_legs` в `QuickChainSerializer`:

```python
    def validate_legs(self, value):
        if len(value) < 2:
            raise serializers.ValidationError('Цепочка должна содержать минимум 2 шага (OPEN и CLOSE).')
        if value[0]['type'] != 'OPEN':
            raise serializers.ValidationError('Первый шаг цепочки должен быть OPEN.')
        if value[-1]['type'] != 'CLOSE':
            raise serializers.ValidationError('Последний шаг цепочки должен быть CLOSE.')
        open_count = sum(1 for leg in value if leg['type'] == 'OPEN')
        close_count = sum(1 for leg in value if leg['type'] == 'CLOSE')
        if open_count != 1:
            raise serializers.ValidationError(f'В цепочке должен быть ровно один OPEN, найдено {open_count}.')
        if close_count != 1:
            raise serializers.ValidationError(f'В цепочке должен быть ровно один CLOSE, найдено {close_count}.')
        return value
```

- [ ] **Step 4: Запустить — 4 теста должны пройти**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain.QuickChainStructureValidationTest -v 2
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add django_base/trades/serializers.py django_base/trades/tests/test_quick_chain.py
git commit -m "feat(trades): структурная валидация цепочки (порядок и количество OPEN/CLOSE)"
```

---

### Task 5: QuickChainSerializer.validate — field-level правила

Правила: даты неубывающие, sum(close+partial.volume) == sum(open+average.volume), SL/TP только на OPEN/AVERAGE.

**Files:**
- Modify: `django_base/trades/serializers.py`
- Test: `django_base/trades/tests/test_quick_chain.py`

- [ ] **Step 1: Тесты**

```python
class QuickChainFieldValidationTest(QuickChainBaseTestCase):
    def _serializer(self, payload):
        from trades.serializers import QuickChainSerializer
        from unittest.mock import MagicMock
        req = MagicMock()
        req.user = self.user
        return QuickChainSerializer(data=payload, context={'request': req})

    def test_rejects_dates_not_monotonic(self):
        payload = self.make_payload(
            instrument_id=self.instrument.id,
            strategy_id=self.strategy.id,
            legs=[
                {'type': 'OPEN', 'date': '2026-05-01T12:00:00Z',
                 'price': '100', 'volume_from_capital': 10},
                {'type': 'CLOSE', 'date': '2026-05-01T10:00:00Z',
                 'price': '108', 'volume_from_capital': 10},
            ],
        )
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())

    def test_rejects_volume_mismatch(self):
        payload = self.make_payload(
            instrument_id=self.instrument.id,
            strategy_id=self.strategy.id,
            legs=[
                {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
                 'price': '100', 'volume_from_capital': 20},
                {'type': 'CLOSE', 'date': '2026-05-01T11:00:00Z',
                 'price': '108', 'volume_from_capital': 10},
            ],
        )
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())

    def test_accepts_volume_match_with_partial(self):
        payload = self.make_payload(
            instrument_id=self.instrument.id,
            strategy_id=self.strategy.id,
            legs=[
                {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
                 'price': '100', 'volume_from_capital': 20},
                {'type': 'AVERAGE', 'date': '2026-05-01T11:00:00Z',
                 'price': '95', 'volume_from_capital': 10},
                {'type': 'PARTIAL_CLOSE', 'date': '2026-05-01T12:00:00Z',
                 'price': '102', 'volume_from_capital': 15},
                {'type': 'CLOSE', 'date': '2026-05-01T13:00:00Z',
                 'price': '108', 'volume_from_capital': 15},
            ],
        )
        s = self._serializer(payload)
        self.assertTrue(s.is_valid(), s.errors)

    def test_rejects_sl_on_partial_close(self):
        payload = self.make_payload(
            instrument_id=self.instrument.id,
            strategy_id=self.strategy.id,
            legs=[
                {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
                 'price': '100', 'volume_from_capital': 10},
                {'type': 'PARTIAL_CLOSE', 'date': '2026-05-01T11:00:00Z',
                 'price': '102', 'volume_from_capital': 5, 'planned_stop_loss': '90'},
                {'type': 'CLOSE', 'date': '2026-05-01T12:00:00Z',
                 'price': '108', 'volume_from_capital': 5},
            ],
        )
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())

    def test_rejects_tp_on_close(self):
        payload = self.make_payload(
            instrument_id=self.instrument.id,
            strategy_id=self.strategy.id,
            legs=[
                {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
                 'price': '100', 'volume_from_capital': 10},
                {'type': 'CLOSE', 'date': '2026-05-01T11:00:00Z',
                 'price': '108', 'volume_from_capital': 10, 'planned_take_profit': '110'},
            ],
        )
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())
```

- [ ] **Step 2: Запустить — должны падать**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain.QuickChainFieldValidationTest -v 2
```

Expected: 4 FAIL (test_accepts_volume_match_with_partial может пройти, остальные падают).

- [ ] **Step 3: Расширить validate_legs**

Добавить после структурных проверок в `validate_legs`:

```python
        # Даты неубывающие
        for i in range(1, len(value)):
            if value[i]['date'] < value[i-1]['date']:
                raise serializers.ValidationError(
                    f'Даты должны быть в неубывающем порядке (шаг #{i} раньше предыдущего).'
                )

        # Сумма объёмов открытий = сумма объёмов закрытий
        open_volume = sum(leg['volume_from_capital'] for leg in value
                          if leg['type'] in ('OPEN', 'AVERAGE'))
        close_volume = sum(leg['volume_from_capital'] for leg in value
                           if leg['type'] in ('PARTIAL_CLOSE', 'CLOSE'))
        if open_volume != close_volume:
            raise serializers.ValidationError(
                f'Сумма открытий ({open_volume}%) не равна сумме закрытий ({close_volume}%).'
            )

        # SL/TP допустимы только на OPEN и AVERAGE
        for i, leg in enumerate(value):
            if leg['type'] in ('PARTIAL_CLOSE', 'CLOSE'):
                if leg.get('planned_stop_loss') is not None:
                    raise serializers.ValidationError(
                        f'planned_stop_loss не допускается на шаге #{i} (тип {leg["type"]}).'
                    )
                if leg.get('planned_take_profit') is not None:
                    raise serializers.ValidationError(
                        f'planned_take_profit не допускается на шаге #{i} (тип {leg["type"]}).'
                    )
        return value
```

- [ ] **Step 4: Запустить — все 5 должны пройти**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain.QuickChainFieldValidationTest -v 2
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add django_base/trades/serializers.py django_base/trades/tests/test_quick_chain.py
git commit -m "feat(trades): field-валидации цепочки (даты, объёмы, SL/TP placement)"
```

---

### Task 6: QuickChainSerializer.validate — авторизация (strategy ownership + instrument)

**Files:**
- Modify: `django_base/trades/serializers.py`
- Test: `django_base/trades/tests/test_quick_chain.py`

- [ ] **Step 1: Тесты**

```python
class QuickChainAuthValidationTest(QuickChainBaseTestCase):
    def _serializer(self, payload):
        from trades.serializers import QuickChainSerializer
        from unittest.mock import MagicMock
        req = MagicMock()
        req.user = self.user
        return QuickChainSerializer(data=payload, context={'request': req})

    def test_rejects_other_users_strategy(self):
        payload = self.make_payload(
            instrument_id=self.instrument.id,
            strategy_id=self.other_strategy.id,
        )
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())
        self.assertIn('strategy_id', s.errors)

    def test_rejects_nonexistent_strategy(self):
        payload = self.make_payload(
            instrument_id=self.instrument.id,
            strategy_id=999999,
        )
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())
        self.assertIn('strategy_id', s.errors)

    def test_rejects_nonexistent_instrument(self):
        payload = self.make_payload(
            instrument_id=999999,
            strategy_id=self.strategy.id,
        )
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())
        self.assertIn('instrument_id', s.errors)
```

- [ ] **Step 2: Запустить — должны падать**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain.QuickChainAuthValidationTest -v 2
```

Expected: 3 FAIL.

- [ ] **Step 3: Реализовать validate_strategy_id и validate_instrument_id**

Добавить методы в `QuickChainSerializer`:

```python
    def validate_strategy_id(self, value):
        from strategies.models import TradingStrategy
        request = self.context.get('request')
        try:
            strategy = TradingStrategy.objects.get(pk=value)
        except TradingStrategy.DoesNotExist:
            raise serializers.ValidationError('Стратегия не найдена.')
        if request is not None and strategy.user_id != request.user.id:
            raise serializers.ValidationError('Стратегия принадлежит другому пользователю.')
        return value

    def validate_instrument_id(self, value):
        from instruments.models import Instrument
        if not Instrument.objects.filter(pk=value).exists():
            raise serializers.ValidationError('Инструмент не найден.')
        return value
```

- [ ] **Step 4: Запустить — 3 теста должны пройти**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain.QuickChainAuthValidationTest -v 2
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add django_base/trades/serializers.py django_base/trades/tests/test_quick_chain.py
git commit -m "feat(trades): проверка владельца стратегии и существования инструмента"
```

---

### Task 7: QuickChainSerializer.create — атомарное создание цепочки

**Files:**
- Modify: `django_base/trades/serializers.py`
- Test: `django_base/trades/tests/test_quick_chain.py`

- [ ] **Step 1: Тесты на создание**

```python
class QuickChainCreationTest(QuickChainBaseTestCase):
    def _serializer_and_save(self, payload):
        from trades.serializers import QuickChainSerializer
        from unittest.mock import MagicMock
        req = MagicMock()
        req.user = self.user
        s = QuickChainSerializer(data=payload, context={'request': req})
        self.assertTrue(s.is_valid(), s.errors)
        return s.save()

    def test_creates_open_with_children(self):
        payload = self.make_payload(
            instrument_id=self.instrument.id,
            strategy_id=self.strategy.id,
            legs=[
                {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
                 'price': '100', 'volume_from_capital': 20,
                 'planned_stop_loss': '90', 'planned_take_profit': '120'},
                {'type': 'AVERAGE', 'date': '2026-05-01T11:00:00Z',
                 'price': '95', 'volume_from_capital': 10},
                {'type': 'PARTIAL_CLOSE', 'date': '2026-05-01T12:00:00Z',
                 'price': '102', 'volume_from_capital': 15},
                {'type': 'CLOSE', 'date': '2026-05-01T13:00:00Z',
                 'price': '108', 'volume_from_capital': 15},
            ],
        )
        open_trade = self._serializer_and_save(payload)
        self.assertEqual(open_trade.trade_type, Trade.TradeType.OPEN)
        self.assertEqual(open_trade.user, self.user)
        self.assertEqual(open_trade.instrument, self.instrument)
        self.assertEqual(open_trade.strategy, self.strategy)
        self.assertEqual(open_trade.direction, 'LONG')
        self.assertEqual(open_trade.volume_from_capital, 20)
        self.assertEqual(open_trade.planned_stop_loss, Decimal('90'))
        self.assertEqual(open_trade.planned_take_profit, Decimal('120'))

        children = list(open_trade.child_trades.order_by('trade_date'))
        self.assertEqual(len(children), 3)
        self.assertEqual([c.trade_type for c in children],
                         ['AVERAGE', 'PARTIAL_CLOSE', 'CLOSE'])
        for c in children:
            self.assertEqual(c.parent_trade, open_trade)
            self.assertEqual(c.user, self.user)
            self.assertEqual(c.instrument, self.instrument)
            self.assertEqual(c.direction, 'LONG')

        self.assertTrue(open_trade.is_closed())

    def test_atomic_rollback_on_failure(self):
        """Если падает на 3-м leg — в БД ничего не остаётся."""
        from trades import serializers as ser_mod
        from unittest.mock import patch, MagicMock

        payload = self.make_payload(
            instrument_id=self.instrument.id,
            strategy_id=self.strategy.id,
            legs=[
                {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
                 'price': '100', 'volume_from_capital': 10},
                {'type': 'AVERAGE', 'date': '2026-05-01T11:00:00Z',
                 'price': '95', 'volume_from_capital': 5},
                {'type': 'CLOSE', 'date': '2026-05-01T12:00:00Z',
                 'price': '108', 'volume_from_capital': 15},
            ],
        )

        before = Trade.objects.count()

        original_create = Trade.objects.create
        call_counter = {'n': 0}

        def buggy_create(*args, **kwargs):
            call_counter['n'] += 1
            if call_counter['n'] == 3:
                raise RuntimeError('Simulated DB error')
            return original_create(*args, **kwargs)

        from trades.serializers import QuickChainSerializer
        req = MagicMock()
        req.user = self.user
        s = QuickChainSerializer(data=payload, context={'request': req})
        self.assertTrue(s.is_valid())

        with patch('trades.serializers.Trade.objects.create', side_effect=buggy_create):
            with self.assertRaises(RuntimeError):
                s.save()

        after = Trade.objects.count()
        self.assertEqual(after, before, 'Транзакция должна быть откачена')
```

- [ ] **Step 2: Запустить — должны падать (нет create)**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain.QuickChainCreationTest -v 2
```

Expected: 2 FAIL (NotImplementedError или AttributeError).

- [ ] **Step 3: Реализовать `create` в QuickChainSerializer**

Добавить импорт `transaction` сверху (если ещё нет):

```python
from django.db import transaction
```

Добавить метод в `QuickChainSerializer`:

```python
    @transaction.atomic
    def create(self, validated_data):
        request = self.context['request']
        legs_data = validated_data['legs']
        open_data = legs_data[0]

        open_trade = Trade.objects.create(
            user=request.user,
            instrument_id=validated_data['instrument_id'],
            strategy_id=validated_data['strategy_id'],
            direction=validated_data['direction'],
            trade_type=Trade.TradeType.OPEN,
            trade_date=open_data['date'],
            price=open_data['price'],
            volume_from_capital=open_data['volume_from_capital'],
            planned_stop_loss=open_data.get('planned_stop_loss'),
            planned_take_profit=open_data.get('planned_take_profit'),
        )

        for leg in legs_data[1:]:
            Trade.objects.create(
                user=request.user,
                instrument_id=validated_data['instrument_id'],
                strategy_id=validated_data['strategy_id'],
                direction=validated_data['direction'],
                trade_type=leg['type'],
                trade_date=leg['date'],
                price=leg['price'],
                volume_from_capital=leg['volume_from_capital'],
                planned_stop_loss=leg.get('planned_stop_loss'),
                planned_take_profit=leg.get('planned_take_profit'),
                parent_trade=open_trade,
            )

        return open_trade
```

- [ ] **Step 4: Запустить — должны пройти**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain.QuickChainCreationTest -v 2
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add django_base/trades/serializers.py django_base/trades/tests/test_quick_chain.py
git commit -m "feat(trades): атомарное создание цепочки сделок в QuickChainSerializer.create"
```

---

### Task 8: TradeViewSet.quick_chain action + endpoint

**Files:**
- Modify: `django_base/trades/views.py`
- Test: `django_base/trades/tests/test_quick_chain.py`

- [ ] **Step 1: Тесты на endpoint**

```python
class QuickChainEndpointTest(QuickChainBaseTestCase):
    URL = '/api/trades/quick-chain/'

    def test_unauthenticated_blocked(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(self.URL, self.make_payload(
            instrument_id=self.instrument.id, strategy_id=self.strategy.id
        ), format='json')
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED,
                                              status.HTTP_403_FORBIDDEN))

    def test_creates_chain_and_returns_open_trade(self):
        response = self.client.post(self.URL, self.make_payload(
            instrument_id=self.instrument.id, strategy_id=self.strategy.id
        ), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        body = response.json()
        self.assertIn('open_trade', body)
        self.assertIn('chain_id', body)
        self.assertEqual(body['open_trade']['trade_type'], 'OPEN')
        self.assertEqual(body['chain_id'], body['open_trade']['id'])

    def test_validation_error_returns_400(self):
        bad = self.make_payload(
            instrument_id=self.instrument.id,
            strategy_id=self.strategy.id,
            legs=[
                {'type': 'AVERAGE', 'date': '2026-05-01T10:00:00Z',
                 'price': '100', 'volume_from_capital': 10},
                {'type': 'CLOSE', 'date': '2026-05-01T11:00:00Z',
                 'price': '108', 'volume_from_capital': 10},
            ],
        )
        response = self.client.post(self.URL, bad, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_chain_appears_in_list(self):
        self.client.post(self.URL, self.make_payload(
            instrument_id=self.instrument.id, strategy_id=self.strategy.id
        ), format='json')
        list_response = self.client.get('/api/trades/')
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        items = list_response.json().get('results', list_response.json())
        opens = [t for t in items if t['trade_type'] == 'OPEN']
        self.assertGreaterEqual(len(opens), 1)
```

- [ ] **Step 2: Запустить — должны падать с 404 на endpoint**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain.QuickChainEndpointTest -v 2
```

Expected: 3 FAIL (test_unauthenticated_blocked может пройти если view ещё не работает но request заворачивается раньше; остальные 404).

- [ ] **Step 3: Добавить action в TradeViewSet**

В `django_base/trades/views.py` в классе `TradeViewSet`, после существующего `@action stats`, добавить:

```python
    @action(detail=False, methods=['post'], url_path='quick-chain')
    def quick_chain(self, request):
        """Атомарное создание цепочки сделок одним запросом."""
        from .serializers import QuickChainSerializer, TradeDetailSerializer
        serializer = QuickChainSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        open_trade = serializer.save()
        return Response({
            'open_trade': TradeDetailSerializer(open_trade, context={'request': request}).data,
            'chain_id': str(open_trade.id),
        }, status=status.HTTP_201_CREATED)
```

Убедиться что `status` импортирован сверху файла:
```python
from rest_framework import status
```
(если нет — добавить).

- [ ] **Step 4: Запустить — должны пройти**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain.QuickChainEndpointTest -v 2
```

Expected: 4 passed.

- [ ] **Step 5: Прогнать все тесты test_quick_chain**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain -v 2
```

Expected: все passed.

- [ ] **Step 6: Commit**

```bash
git add django_base/trades/views.py django_base/trades/tests/test_quick_chain.py
git commit -m "feat(trades): endpoint POST /api/trades/quick-chain/ для атомарного создания цепочки"
```

---

### Task 9: Фильтры list по instrument и is_closed

Нужны для загрузки прошлых завершённых цепочек на текущем тикере.

**Files:**
- Modify: `django_base/trades/views.py`
- Test: `django_base/trades/tests/test_quick_chain.py`

- [ ] **Step 1: Тесты на фильтры**

```python
from datetime import timezone as dt_tz, datetime as dt_dt

class TradeListFiltersTest(QuickChainBaseTestCase):
    def setUp(self):
        super().setUp()
        # Создаём вторую сущность instrument для фильтра
        sub = self.instrument.sub_industry
        self.other_instrument = Instrument.objects.create(
            ticker='GAZP', name='Газпром', sub_industry=sub
        )
        # Закрытая цепочка на SBER
        open1 = Trade.objects.create(
            user=self.user, instrument=self.instrument, strategy=self.strategy,
            trade_date='2026-05-01T10:00:00Z', direction='LONG',
            trade_type=Trade.TradeType.OPEN, price=100, volume_from_capital=10,
        )
        Trade.objects.create(
            user=self.user, instrument=self.instrument, strategy=self.strategy,
            trade_date='2026-05-01T11:00:00Z', direction='LONG',
            trade_type=Trade.TradeType.CLOSE, price=108, volume_from_capital=10,
            parent_trade=open1,
        )
        # Открытая цепочка на SBER (без CLOSE)
        Trade.objects.create(
            user=self.user, instrument=self.instrument, strategy=self.strategy,
            trade_date='2026-05-02T10:00:00Z', direction='LONG',
            trade_type=Trade.TradeType.OPEN, price=100, volume_from_capital=10,
        )
        # Закрытая цепочка на GAZP
        open3 = Trade.objects.create(
            user=self.user, instrument=self.other_instrument, strategy=self.strategy,
            trade_date='2026-05-03T10:00:00Z', direction='LONG',
            trade_type=Trade.TradeType.OPEN, price=200, volume_from_capital=10,
        )
        Trade.objects.create(
            user=self.user, instrument=self.other_instrument, strategy=self.strategy,
            trade_date='2026-05-03T11:00:00Z', direction='LONG',
            trade_type=Trade.TradeType.CLOSE, price=210, volume_from_capital=10,
            parent_trade=open3,
        )

    def test_filter_by_instrument(self):
        response = self.client.get(f'/api/trades/?instrument={self.instrument.id}')
        items = response.json().get('results', response.json())
        for t in items:
            self.assertEqual(t['instrument'], self.instrument.id)
        self.assertEqual(len(items), 2)  # 2 OPEN-trade на SBER

    def test_filter_is_closed_true(self):
        response = self.client.get(
            f'/api/trades/?instrument={self.instrument.id}&is_closed=true'
        )
        items = response.json().get('results', response.json())
        self.assertEqual(len(items), 1)
        self.assertTrue(items[0]['is_closed'])

    def test_filter_is_closed_false(self):
        response = self.client.get(
            f'/api/trades/?instrument={self.instrument.id}&is_closed=false'
        )
        items = response.json().get('results', response.json())
        self.assertEqual(len(items), 1)
        self.assertFalse(items[0]['is_closed'])
```

- [ ] **Step 2: Запустить — должны падать (фильтры игнорируются)**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain.TradeListFiltersTest -v 2
```

Expected: FAIL.

- [ ] **Step 3: Расширить `get_queryset` в TradeViewSet**

Найти существующий метод `get_queryset` в `django_base/trades/views.py` и заменить его на:

```python
    def get_queryset(self):
        qs = Trade.objects.filter(user=self.request.user).select_related(
            'instrument', 'strategy'
        )
        if self.action == 'list':
            qs = qs.filter(parent_trade__isnull=True)

            instrument_id = self.request.query_params.get('instrument')
            if instrument_id:
                qs = qs.filter(instrument_id=instrument_id)

            is_closed = self.request.query_params.get('is_closed')
            if is_closed is not None:
                # Закрытая цепочка = есть child с trade_type=CLOSE
                if is_closed.lower() in ('true', '1', 'yes'):
                    qs = qs.filter(child_trades__trade_type=Trade.TradeType.CLOSE).distinct()
                elif is_closed.lower() in ('false', '0', 'no'):
                    qs = qs.exclude(child_trades__trade_type=Trade.TradeType.CLOSE)

        return qs.order_by('-trade_date')
```

- [ ] **Step 4: Запустить — должны пройти**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain.TradeListFiltersTest -v 2
```

Expected: 3 passed.

- [ ] **Step 5: Прогнать весь test_quick_chain финально**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades.tests.test_quick_chain -v 2
```

Expected: все passed.

- [ ] **Step 6: Commit**

```bash
git add django_base/trades/views.py django_base/trades/tests/test_quick_chain.py
git commit -m "feat(trades): фильтры list по instrument и is_closed для загрузки прошлых цепочек"
```

---

## Frontend Tasks

### Task 10: Установить vitest + RTL + jsdom

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`

- [ ] **Step 1: Установить dev-зависимости**

```bash
docker compose -f docker-compose.dev.yml exec frontend npm install --save-dev \
  vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom \
  @testing-library/user-event
```

Если контейнер frontend не имеет доступа к npm — выполнить локально:

```bash
cd frontend && npm install --save-dev \
  vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom \
  @testing-library/user-event
```

- [ ] **Step 2: Добавить test-скрипт в `frontend/package.json`**

В разделе `"scripts"` добавить:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Создать `frontend/vitest.config.ts`**

```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
```

- [ ] **Step 4: Создать `frontend/src/test/setup.ts`**

```typescript
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 5: Smoke-test — простой тест, чтобы убедиться что инфраструктура работает**

Создать `frontend/src/test/smoke.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('vitest setup', () => {
  it('renders a simple component', () => {
    render(<div>Hello vitest</div>);
    expect(screen.getByText('Hello vitest')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Запустить vitest**

```bash
cd frontend && npm run test
```

Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json \
        frontend/vitest.config.ts frontend/src/test/setup.ts \
        frontend/src/test/smoke.test.tsx
git commit -m "test(frontend): добавить vitest + React Testing Library + jsdom"
```

---

### Task 11: API клиент tradesApi.createQuickChain + типы

**Files:**
- Modify: `frontend/src/api/endpoints.ts`

- [ ] **Step 1: Добавить типы и метод**

Найти в `frontend/src/api/endpoints.ts` блок `tradesApi` и добавить выше него типы:

```typescript
export type QuickChainLeg = {
  type: 'OPEN' | 'AVERAGE' | 'PARTIAL_CLOSE' | 'CLOSE';
  date: string; // ISO 8601
  price: string; // decimal as string (для соответствия DecimalField)
  volume_from_capital: number;
  planned_stop_loss?: string | null;
  planned_take_profit?: string | null;
};

export type QuickChainPayload = {
  instrument_id: number;
  strategy_id: number;
  direction: 'LONG' | 'SHORT';
  legs: QuickChainLeg[];
};

export type QuickChainResponse = {
  open_trade: TradeDetail;
  chain_id: string;
};
```

И добавить метод в `tradesApi`:

```typescript
  createQuickChain: (data: QuickChainPayload) =>
    api.post<QuickChainResponse>('/trades/quick-chain/', data),
```

- [ ] **Step 2: Прогнать типы — должно компилироваться**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors (если есть несвязанные ошибки — исправить, но новый код не должен ничего ломать).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/endpoints.ts
git commit -m "feat(frontend): API клиент tradesApi.createQuickChain"
```

---

### Task 12: CandlestickChart — контролируемые props (markers, onPointPick, pickerMode)

Расширяем существующий компонент опциональными props. Старое поведение сохраняется как default.

**Files:**
- Modify: `frontend/src/components/CandlestickChart.tsx`

- [ ] **Step 1: Расширить props и сигнатуру компонента**

В начале файла найти `interface CandlestickChartProps` (или объявление props) и добавить новые опциональные поля:

```typescript
export type ChartMarker = {
  time: number; // unix seconds
  position: 'aboveBar' | 'belowBar' | 'inBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  text?: string;
  size?: number;
};

interface CandlestickChartProps {
  ticker: string;
  // Новое:
  markers?: ChartMarker[];
  onPointPick?: (point: { time: number; price: number }) => void;
  pickerMode?: boolean; // если true — клики идут в onPointPick, не в DrawingManager
}

export function CandlestickChart({
  ticker,
  markers,
  onPointPick,
  pickerMode = false,
}: CandlestickChartProps) {
```

- [ ] **Step 2: Добавить ref на маркеры и эффект синхронизации**

После создания `candleSeriesRef` в `useEffect` инициализации chart, добавить рядом:

```typescript
import { createSeriesMarkers } from 'lightweight-charts';
// (импорт уже может быть — если нет, добавить)

// внутри основного useEffect инициализации chart, после candleSeriesRef.current = ...
const markersApi = createSeriesMarkers(candleSeriesRef.current);
markersApiRef.current = markersApi;
```

Объявить ref сверху компонента (рядом с другими refs):

```typescript
const markersApiRef = useRef<ReturnType<typeof createSeriesMarkers> | null>(null);
```

Добавить отдельный `useEffect` для синхронизации входных markers:

```typescript
useEffect(() => {
  if (!markersApiRef.current) return;
  markersApiRef.current.setMarkers(markers ?? []);
}, [markers]);
```

- [ ] **Step 3: Изменить обработчик subscribeClick для pickerMode**

Найти текущий вызов `chart.subscribeClick((param) => { ... })`. Заменить внутреннее тело на:

```typescript
chart.subscribeClick((param) => {
  if (!param.time || !param.point) return;
  if (pickerMode && onPointPick) {
    const candlePrice = candleSeriesRef.current?.coordinateToPrice(param.point.y);
    if (candlePrice == null) return;
    onPointPick({
      time: typeof param.time === 'number' ? param.time : Math.floor(new Date(param.time as string).getTime() / 1000),
      price: Number(candlePrice),
    });
    return;
  }
  // существующая логика DrawingManager (multi-anchor preview, magnet, etc.) — оставить как было
  // ... оригинальный код продолжается тут
});
```

**Важно:** не удалять существующую логику рисовалок — она остаётся работать когда `pickerMode === false`.

- [ ] **Step 4: Скрыть toolbar рисовалок в pickerMode**

Найти рендер `<DrawingToolbar ... />` (или эквивалент) и обернуть:

```tsx
{!pickerMode && (
  <DrawingToolbar /* существующие props */ />
)}
```

- [ ] **Step 5: TypeScript-проверка**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 ошибок в CandlestickChart.tsx (несвязанные ошибки в проекте — отдельная история).

- [ ] **Step 6: Manual smoke — убедиться что существующие места использования компонента не сломаны**

```bash
docker compose -f docker-compose.dev.yml up -d frontend web
```

Открыть `http://localhost:3000`, залогиниться (admin/Qwer@12345), зайти в `/instruments/SBER` или другую страницу, где есть CandlestickChart — убедиться что график рисуется, рисовалки работают.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/CandlestickChart.tsx
git commit -m "feat(charts): контролируемые props markers/onPointPick/pickerMode для CandlestickChart"
```

---

### Task 13: Sidebar-пункт "Быстрый ввод" + роут-заглушка

**Files:**
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/pages/trades/quick/QuickTradeEntryPage.tsx` (только заглушка)

- [ ] **Step 1: Создать страницу-заглушку**

`frontend/src/pages/trades/quick/QuickTradeEntryPage.tsx`:

```typescript
export function QuickTradeEntryPage() {
  return (
    <section>
      <h1>Быстрый ввод цепочек сделок</h1>
      <p>Страница в разработке.</p>
    </section>
  );
}
```

- [ ] **Step 2: Зарегистрировать роут в App.tsx**

В `frontend/src/App.tsx` добавить импорт и роут под `Layout` (Protected). Найти секцию роутов `/trades/*` (`TradesRouter`). Добавить отдельный роут **до** `TradesRouter`:

```tsx
import { QuickTradeEntryPage } from '@/pages/trades/quick/QuickTradeEntryPage';

// в <Routes>:
<Route path="/trades/quick" element={<QuickTradeEntryPage />} />
<Route path="/trades/*" element={<TradesRouter />} />
```

Порядок важен — конкретный путь раньше wildcard.

- [ ] **Step 3: Добавить пункт сайдбара**

В `frontend/src/components/Layout.tsx` обновить `navItems`:

```typescript
const navItems = [
  { to: '/dashboard', label: 'Дашборд' },
  { to: '/trades/new', label: 'Новая сделка' },
  { to: '/trades/quick', label: 'Быстрый ввод' },
  { to: '/trades', label: 'Все сделки', exact: true },
  { to: '/strategies', label: 'Стратегии' },
  { to: '/instruments', label: 'Инструменты' },
  { to: '/analytics', label: 'Аналитика' },
];
```

- [ ] **Step 4: Manual smoke**

Открыть `http://localhost:3000/trades/quick` — увидеть заголовок "Быстрый ввод цепочек сделок". В сайдбаре появился пункт "Быстрый ввод".

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/trades/quick/QuickTradeEntryPage.tsx \
        frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat(frontend): роут /trades/quick и пункт сайдбара (заглушка страницы)"
```

---

### Task 14: Типы стейта quick-страницы

**Files:**
- Create: `frontend/src/pages/trades/quick/types.ts`

- [ ] **Step 1: Создать types.ts**

```typescript
export type LegType = 'OPEN' | 'AVERAGE' | 'PARTIAL_CLOSE' | 'CLOSE';

export type ChainLeg = {
  /** Локальный идентификатор для key и операций edit/remove. */
  localId: string;
  type: LegType;
  /** Unix seconds, как отдаёт lightweight-charts time. */
  time: number;
  price: number;
  volume_from_capital: number;
  planned_stop_loss?: number | null;
  planned_take_profit?: number | null;
};

export type PendingSubstep = 'point' | 'sl' | 'tp';

export type PendingLeg = {
  type: LegType;
  sub: PendingSubstep;
  /** Промежуточные точки во время многошагового захвата (OPEN+SL+TP). */
  draft?: Partial<ChainLeg>;
};

export type ActiveChain = {
  instrumentId: number | null;
  instrumentTicker: string | null;
  strategyId: number | null;
  direction: 'LONG' | 'SHORT';
  legs: ChainLeg[];
};

export type SavedChainSummary = {
  openTradeId: string;
  /** Точки маркеров (parent + child) для отрисовки тускло на графике. */
  markerPoints: Array<{ time: number; price: number; type: LegType }>;
};
```

- [ ] **Step 2: TypeScript-проверка**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/trades/quick/types.ts
git commit -m "feat(frontend): типы стейта для quick-trade-entry"
```

---

### Task 15: QuickChainHeader — шапка с шапкой и кнопками шагов

**Files:**
- Create: `frontend/src/pages/trades/quick/QuickChainHeader.tsx`

- [ ] **Step 1: Создать компонент**

```typescript
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { instrumentsApi, strategiesApi } from '@/api/endpoints';
import type { ActiveChain, PendingLeg } from './types';

interface Props {
  chain: ActiveChain;
  pendingLeg: PendingLeg | null;
  canCloseExist: boolean;
  hasOpen: boolean;
  onInstrumentChange: (id: number | null, ticker: string | null) => void;
  onStrategyChange: (id: number | null) => void;
  onDirectionChange: (dir: 'LONG' | 'SHORT') => void;
  onStartLeg: (type: 'OPEN' | 'AVERAGE' | 'PARTIAL_CLOSE' | 'CLOSE') => void;
}

export function QuickChainHeader(props: Props) {
  const [strategies, setStrategies] = useState<Array<{ id: number; name: string }>>([]);
  const [instrumentSearch, setInstrumentSearch] = useState('');
  const [instrumentResults, setInstrumentResults] = useState<
    Array<{ id: number; ticker: string; name: string }>
  >([]);

  useEffect(() => {
    strategiesApi.list().then((r) => setStrategies(r.results ?? r));
  }, []);

  useEffect(() => {
    if (!instrumentSearch) {
      setInstrumentResults([]);
      return;
    }
    const t = setTimeout(() => {
      instrumentsApi.search(instrumentSearch).then(setInstrumentResults);
    }, 200);
    return () => clearTimeout(t);
  }, [instrumentSearch]);

  const statusLabel = (() => {
    if (!props.chain.instrumentId) return 'Выберите инструмент';
    if (!props.chain.strategyId) return 'Выберите стратегию';
    if (!props.pendingLeg) {
      if (!props.hasOpen) return 'Нажмите [+ Вход]';
      return 'Выберите следующий шаг';
    }
    const labels: Record<string, string> = {
      OPEN: 'Жду точку входа',
      AVERAGE: 'Жду точку усреднения',
      PARTIAL_CLOSE: 'Жду точку частичного закрытия',
      CLOSE: 'Жду точку закрытия',
    };
    const subLabels: Record<string, string> = {
      point: '',
      sl: ' → клик SL',
      tp: ' → клик TP',
    };
    return labels[props.pendingLeg.type] + subLabels[props.pendingLeg.sub];
  })();

  return (
    <aside style={{ minWidth: 240, padding: 12 }}>
      <h2>Цепочка</h2>

      <label>Инструмент</label>
      <input
        type="text"
        placeholder={props.chain.instrumentTicker ?? 'SBER, GAZP...'}
        value={instrumentSearch}
        onChange={(e) => setInstrumentSearch(e.target.value)}
      />
      {instrumentResults.length > 0 && (
        <ul>
          {instrumentResults.map((i) => (
            <li key={i.id}>
              <button
                onClick={() => {
                  props.onInstrumentChange(i.id, i.ticker);
                  setInstrumentSearch('');
                  setInstrumentResults([]);
                }}
              >
                {i.ticker} — {i.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <label>Стратегия</label>
      <select
        value={props.chain.strategyId ?? ''}
        onChange={(e) => props.onStrategyChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">— выберите —</option>
        {strategies.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <label>Направление</label>
      <div>
        <label>
          <input
            type="radio"
            name="dir"
            checked={props.chain.direction === 'LONG'}
            onChange={() => props.onDirectionChange('LONG')}
          />
          LONG
        </label>
        <label>
          <input
            type="radio"
            name="dir"
            checked={props.chain.direction === 'SHORT'}
            onChange={() => props.onDirectionChange('SHORT')}
          />
          SHORT
        </label>
      </div>

      <hr />
      <p data-testid="status-label">{statusLabel}</p>

      <Button onClick={() => props.onStartLeg('OPEN')} disabled={props.hasOpen}>
        + Вход
      </Button>
      <Button onClick={() => props.onStartLeg('AVERAGE')} disabled={!props.hasOpen || props.canCloseExist}>
        + Усреднение
      </Button>
      <Button onClick={() => props.onStartLeg('PARTIAL_CLOSE')} disabled={!props.hasOpen || props.canCloseExist}>
        + Частичка
      </Button>
      <Button onClick={() => props.onStartLeg('CLOSE')} disabled={!props.hasOpen || props.canCloseExist}>
        + Закрытие
      </Button>
    </aside>
  );
}
```

Если `strategiesApi.list` или `instrumentsApi.search` отличаются по сигнатуре — адаптировать. Проверить:

```bash
grep -n "strategiesApi\|instrumentsApi" frontend/src/api/endpoints.ts
```

И подогнать имена методов. (Если нет `search`, использовать `list` с параметром query.)

- [ ] **Step 2: TS-проверка**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors в новом файле.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/trades/quick/QuickChainHeader.tsx
git commit -m "feat(frontend): QuickChainHeader с выбором инструмента/стратегии/направления и кнопками шагов"
```

---

### Task 16: QuickChainChart — обёртка над CandlestickChart

**Files:**
- Create: `frontend/src/pages/trades/quick/QuickChainChart.tsx`

- [ ] **Step 1: Создать обёртку**

```typescript
import { useMemo } from 'react';
import { CandlestickChart, type ChartMarker } from '@/components/CandlestickChart';
import type { ChainLeg, SavedChainSummary } from './types';

interface Props {
  ticker: string;
  activeLegs: ChainLeg[];
  savedChains: SavedChainSummary[];
  enablePicker: boolean;
  onPointPick: (point: { time: number; price: number }) => void;
}

const LEG_COLOR: Record<string, string> = {
  OPEN: '#2563eb',
  AVERAGE: '#0891b2',
  PARTIAL_CLOSE: '#f59e0b',
  CLOSE: '#16a34a',
};

const LEG_SHAPE: Record<string, ChartMarker['shape']> = {
  OPEN: 'arrowUp',
  AVERAGE: 'circle',
  PARTIAL_CLOSE: 'square',
  CLOSE: 'arrowDown',
};

export function QuickChainChart({ ticker, activeLegs, savedChains, enablePicker, onPointPick }: Props) {
  const markers = useMemo<ChartMarker[]>(() => {
    const active: ChartMarker[] = activeLegs.map((leg) => ({
      time: leg.time,
      position: leg.type === 'OPEN' || leg.type === 'AVERAGE' ? 'belowBar' : 'aboveBar',
      color: LEG_COLOR[leg.type],
      shape: LEG_SHAPE[leg.type],
      text: leg.type[0],
    }));

    const dim: ChartMarker[] = savedChains.flatMap((chain) =>
      chain.markerPoints.map((p) => ({
        time: p.time,
        position: p.type === 'OPEN' || p.type === 'AVERAGE' ? 'belowBar' : 'aboveBar',
        color: LEG_COLOR[p.type] + '55', // ~33% alpha
        shape: LEG_SHAPE[p.type],
      }))
    );

    // Тусклые ниже активных в массиве — порядок не важен, lightweight-charts сам сортирует по time
    return [...dim, ...active].sort((a, b) => a.time - b.time);
  }, [activeLegs, savedChains]);

  return (
    <div style={{ flex: 1 }}>
      <CandlestickChart
        ticker={ticker}
        markers={markers}
        pickerMode={enablePicker}
        onPointPick={onPointPick}
      />
    </div>
  );
}
```

- [ ] **Step 2: TS-проверка**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/trades/quick/QuickChainChart.tsx
git commit -m "feat(frontend): QuickChainChart — обёртка с маркерами активной и прошлых цепочек"
```

---

### Task 17: QuickChainLegsPanel — список legs и inline-edit

**Files:**
- Create: `frontend/src/pages/trades/quick/QuickChainLegsPanel.tsx`

- [ ] **Step 1: Создать компонент**

```typescript
import { Button } from '@/components/ui/button';
import type { ChainLeg } from './types';

interface Props {
  legs: ChainLeg[];
  errorsByIndex?: Record<number, string>;
  canSave: boolean;
  onVolumeChange: (localId: string, volume: number) => void;
  onRemoveLeg: (localId: string) => void;
  onSave: () => void;
  onReset: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  OPEN: 'OPEN',
  AVERAGE: 'AVG',
  PARTIAL_CLOSE: 'PC',
  CLOSE: 'CLOSE',
};

function formatDate(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function QuickChainLegsPanel({
  legs,
  errorsByIndex = {},
  canSave,
  onVolumeChange,
  onRemoveLeg,
  onSave,
  onReset,
}: Props) {
  return (
    <aside style={{ minWidth: 300, padding: 12 }} data-testid="legs-panel">
      <h2>Legs ({legs.length})</h2>
      <ol>
        {legs.map((leg, idx) => (
          <li
            key={leg.localId}
            data-testid={`leg-${idx}`}
            style={errorsByIndex[idx] ? { color: 'red' } : undefined}
          >
            <strong>{TYPE_LABEL[leg.type]}</strong>{' '}
            {formatDate(leg.time)}{' '}
            {leg.price.toFixed(2)}{' '}
            <label>
              Объём%
              <input
                type="number"
                min={1}
                max={100}
                value={leg.volume_from_capital}
                onChange={(e) => onVolumeChange(leg.localId, Number(e.target.value))}
                data-testid={`leg-${idx}-volume`}
                style={{ width: 60 }}
              />
            </label>
            <button onClick={() => onRemoveLeg(leg.localId)} aria-label={`remove-${idx}`}>×</button>
            {errorsByIndex[idx] && <em>{errorsByIndex[idx]}</em>}
          </li>
        ))}
      </ol>

      <Button onClick={onSave} disabled={!canSave} data-testid="save-chain">
        Сохранить цепочку
      </Button>
      <Button onClick={onReset} variant="outline" data-testid="reset-chain">
        Сбросить
      </Button>
    </aside>
  );
}
```

- [ ] **Step 2: Написать тест компонента**

`frontend/src/pages/trades/quick/__tests__/QuickChainLegsPanel.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickChainLegsPanel } from '../QuickChainLegsPanel';
import type { ChainLeg } from '../types';

const sampleLegs: ChainLeg[] = [
  { localId: 'a', type: 'OPEN', time: 1700000000, price: 100, volume_from_capital: 10 },
  { localId: 'b', type: 'CLOSE', time: 1700001000, price: 108, volume_from_capital: 10 },
];

describe('QuickChainLegsPanel', () => {
  it('renders all legs', () => {
    render(<QuickChainLegsPanel
      legs={sampleLegs}
      canSave={true}
      onVolumeChange={() => {}}
      onRemoveLeg={() => {}}
      onSave={() => {}}
      onReset={() => {}}
    />);
    expect(screen.getByTestId('leg-0')).toHaveTextContent('OPEN');
    expect(screen.getByTestId('leg-1')).toHaveTextContent('CLOSE');
  });

  it('emits onVolumeChange when input changes', () => {
    const onVolumeChange = vi.fn();
    render(<QuickChainLegsPanel
      legs={sampleLegs}
      canSave={false}
      onVolumeChange={onVolumeChange}
      onRemoveLeg={() => {}}
      onSave={() => {}}
      onReset={() => {}}
    />);
    fireEvent.change(screen.getByTestId('leg-0-volume'), { target: { value: '25' } });
    expect(onVolumeChange).toHaveBeenCalledWith('a', 25);
  });

  it('highlights legs with errors', () => {
    render(<QuickChainLegsPanel
      legs={sampleLegs}
      errorsByIndex={{ 1: 'Цена не та' }}
      canSave={false}
      onVolumeChange={() => {}}
      onRemoveLeg={() => {}}
      onSave={() => {}}
      onReset={() => {}}
    />);
    expect(screen.getByTestId('leg-1')).toHaveStyle({ color: 'rgb(255, 0, 0)' });
    expect(screen.getByText('Цена не та')).toBeInTheDocument();
  });

  it('disables save button when canSave=false', () => {
    render(<QuickChainLegsPanel
      legs={sampleLegs}
      canSave={false}
      onVolumeChange={() => {}}
      onRemoveLeg={() => {}}
      onSave={() => {}}
      onReset={() => {}}
    />);
    expect(screen.getByTestId('save-chain')).toBeDisabled();
  });
});
```

- [ ] **Step 3: Запустить тест**

```bash
cd frontend && npm run test src/pages/trades/quick/__tests__/QuickChainLegsPanel.test.tsx
```

Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/trades/quick/QuickChainLegsPanel.tsx \
        frontend/src/pages/trades/quick/__tests__/QuickChainLegsPanel.test.tsx
git commit -m "feat(frontend): QuickChainLegsPanel с inline-edit volume и подсветкой ошибок"
```

---

### Task 18: QuickChainSuccessPanel

**Files:**
- Create: `frontend/src/pages/trades/quick/QuickChainSuccessPanel.tsx`

- [ ] **Step 1: Создать компонент**

```typescript
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface Props {
  chainId: string;
  onNextChain: () => void;
  onClose: () => void;
}

export function QuickChainSuccessPanel({ chainId, onNextChain, onClose }: Props) {
  const navigate = useNavigate();

  return (
    <div
      role="dialog"
      aria-label="Цепочка сохранена"
      style={{
        position: 'fixed',
        top: 80,
        right: 24,
        padding: 16,
        background: 'white',
        border: '1px solid #16a34a',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        zIndex: 50,
      }}
      data-testid="success-panel"
    >
      <h3>Цепочка сохранена</h3>
      <Button onClick={() => navigate(`/trades/${chainId}/edit?tab=analysis`)}>
        Добавить анализ
      </Button>
      <Button onClick={onNextChain} variant="outline">
        Следующая цепочка
      </Button>
      <Button onClick={() => navigate(`/trades/${chainId}`)} variant="outline">
        Открыть детали
      </Button>
      <button onClick={onClose} aria-label="close">×</button>
    </div>
  );
}
```

- [ ] **Step 2: TS-проверка**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/trades/quick/QuickChainSuccessPanel.tsx
git commit -m "feat(frontend): QuickChainSuccessPanel с действиями после save"
```

---

### Task 19: QuickTradeEntryPage — оркестрация стейта и flow

Главный компонент: связывает Header + Chart + LegsPanel + SuccessPanel, реализует state machine клика и SL/TP захват.

**Files:**
- Modify: `frontend/src/pages/trades/quick/QuickTradeEntryPage.tsx` (заменяем заглушку)

- [ ] **Step 1: Реализовать полный компонент**

```typescript
import { useCallback, useEffect, useState } from 'react';
import { QuickChainHeader } from './QuickChainHeader';
import { QuickChainChart } from './QuickChainChart';
import { QuickChainLegsPanel } from './QuickChainLegsPanel';
import { QuickChainSuccessPanel } from './QuickChainSuccessPanel';
import { tradesApi, type QuickChainPayload } from '@/api/endpoints';
import type {
  ActiveChain, ChainLeg, LegType, PendingLeg, SavedChainSummary,
} from './types';

const EMPTY_CHAIN: ActiveChain = {
  instrumentId: null,
  instrumentTicker: null,
  strategyId: null,
  direction: 'LONG',
  legs: [],
};

const DEFAULT_VOLUME: Record<LegType, number> = {
  OPEN: 10, AVERAGE: 10, PARTIAL_CLOSE: 10, CLOSE: 10,
};

function newId() {
  return Math.random().toString(36).slice(2, 11);
}

function nextDefaultVolume(type: LegType, legs: ChainLeg[]): number {
  if (type === 'CLOSE') {
    const open = legs.filter((l) => l.type === 'OPEN' || l.type === 'AVERAGE')
      .reduce((s, l) => s + l.volume_from_capital, 0);
    const closed = legs.filter((l) => l.type === 'PARTIAL_CLOSE' || l.type === 'CLOSE')
      .reduce((s, l) => s + l.volume_from_capital, 0);
    return Math.max(1, open - closed);
  }
  if (type === 'PARTIAL_CLOSE') {
    const open = legs.filter((l) => l.type === 'OPEN' || l.type === 'AVERAGE')
      .reduce((s, l) => s + l.volume_from_capital, 0);
    const closed = legs.filter((l) => l.type === 'PARTIAL_CLOSE' || l.type === 'CLOSE')
      .reduce((s, l) => s + l.volume_from_capital, 0);
    return Math.max(1, Math.floor((open - closed) / 2));
  }
  return DEFAULT_VOLUME[type];
}

export function QuickTradeEntryPage() {
  const [chain, setChain] = useState<ActiveChain>(EMPTY_CHAIN);
  const [pendingLeg, setPendingLeg] = useState<PendingLeg | null>(null);
  const [savedChains, setSavedChains] = useState<SavedChainSummary[]>([]);
  const [errorsByIndex, setErrorsByIndex] = useState<Record<number, string>>({});
  const [nonFieldError, setNonFieldError] = useState<string | null>(null);
  const [successChainId, setSuccessChainId] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState<null | (() => void)>(null);

  const hasOpen = chain.legs.some((l) => l.type === 'OPEN');
  const hasClose = chain.legs.some((l) => l.type === 'CLOSE');
  const canSave = hasOpen && hasClose && computeVolumeBalance(chain.legs) === 0;

  // Загрузка прошлых цепочек на тикер
  useEffect(() => {
    if (!chain.instrumentId) {
      setSavedChains([]);
      return;
    }
    tradesApi.list({ instrument: chain.instrumentId, is_closed: true })
      .then((r) => {
        const items = r.results ?? r;
        // Маппинг: каждый OPEN-trade превращается в SavedChainSummary с его маркерами.
        // Точки child_trades подтягиваются через get(id).
        Promise.all(items.map((t: any) => tradesApi.get(t.id))).then((details: any[]) => {
          setSavedChains(details.map((d) => ({
            openTradeId: d.id,
            markerPoints: [
              { time: Math.floor(new Date(d.trade_date).getTime() / 1000), price: Number(d.price), type: 'OPEN' as LegType },
              ...(d.child_trades ?? []).map((c: any) => ({
                time: Math.floor(new Date(c.trade_date).getTime() / 1000),
                price: Number(c.price),
                type: c.trade_type as LegType,
              })),
            ],
          })));
        });
      });
  }, [chain.instrumentId]);

  const requestReset = useCallback((thenDo: () => void) => {
    if (chain.legs.length === 0) {
      thenDo();
    } else {
      setResetConfirm(() => thenDo);
    }
  }, [chain.legs.length]);

  const handleInstrumentChange = (id: number | null, ticker: string | null) => {
    requestReset(() => {
      setChain({ ...EMPTY_CHAIN, instrumentId: id, instrumentTicker: ticker, strategyId: chain.strategyId, direction: chain.direction });
      setPendingLeg(null);
      setErrorsByIndex({});
      setNonFieldError(null);
    });
  };

  const handleStartLeg = (type: LegType) => {
    setPendingLeg({ type, sub: 'point' });
  };

  const handlePointPick = (point: { time: number; price: number }) => {
    if (!pendingLeg) return;
    const { type, sub, draft } = pendingLeg;

    if (type === 'OPEN' && sub === 'point') {
      setPendingLeg({ type, sub: 'sl', draft: { type, time: point.time, price: point.price } });
      return;
    }
    if (type === 'OPEN' && sub === 'sl') {
      setPendingLeg({ type, sub: 'tp', draft: { ...draft, planned_stop_loss: point.price } });
      return;
    }
    if (type === 'OPEN' && sub === 'tp') {
      const leg: ChainLeg = {
        localId: newId(),
        type: 'OPEN',
        time: draft!.time!,
        price: draft!.price!,
        volume_from_capital: DEFAULT_VOLUME.OPEN,
        planned_stop_loss: draft!.planned_stop_loss ?? null,
        planned_take_profit: point.price,
      };
      setChain((c) => ({ ...c, legs: [...c.legs, leg] }));
      setPendingLeg(null);
      return;
    }

    // AVERAGE / PARTIAL_CLOSE / CLOSE — один клик
    const leg: ChainLeg = {
      localId: newId(),
      type,
      time: point.time,
      price: point.price,
      volume_from_capital: nextDefaultVolume(type, chain.legs),
    };
    setChain((c) => ({ ...c, legs: [...c.legs, leg] }));
    setPendingLeg(null);
  };

  const handleVolumeChange = (localId: string, volume: number) => {
    setChain((c) => ({
      ...c,
      legs: c.legs.map((l) => (l.localId === localId ? { ...l, volume_from_capital: volume } : l)),
    }));
  };

  const handleRemoveLeg = (localId: string) => {
    setChain((c) => ({ ...c, legs: c.legs.filter((l) => l.localId !== localId) }));
  };

  const handleSave = async () => {
    setErrorsByIndex({});
    setNonFieldError(null);
    if (!chain.instrumentId || !chain.strategyId) return;
    const payload: QuickChainPayload = {
      instrument_id: chain.instrumentId,
      strategy_id: chain.strategyId,
      direction: chain.direction,
      legs: chain.legs.map((l) => ({
        type: l.type,
        date: new Date(l.time * 1000).toISOString(),
        price: l.price.toFixed(2),
        volume_from_capital: l.volume_from_capital,
        planned_stop_loss: l.planned_stop_loss != null ? Number(l.planned_stop_loss).toFixed(2) : null,
        planned_take_profit: l.planned_take_profit != null ? Number(l.planned_take_profit).toFixed(2) : null,
      })),
    };
    try {
      const result = await tradesApi.createQuickChain(payload);
      setSuccessChainId(result.chain_id);
      setSavedChains((prev) => [
        {
          openTradeId: result.chain_id,
          markerPoints: chain.legs.map((l) => ({ time: l.time, price: l.price, type: l.type })),
        },
        ...prev,
      ]);
      setChain((c) => ({ ...EMPTY_CHAIN, instrumentId: c.instrumentId, instrumentTicker: c.instrumentTicker, strategyId: c.strategyId, direction: c.direction }));
    } catch (err: any) {
      const data = err?.response?.data ?? err?.body ?? {};
      if (Array.isArray(data.legs)) {
        const errs: Record<number, string> = {};
        data.legs.forEach((legErr: any, idx: number) => {
          if (legErr && typeof legErr === 'object') {
            const firstKey = Object.keys(legErr)[0];
            if (firstKey) errs[idx] = String(legErr[firstKey]);
          }
        });
        setErrorsByIndex(errs);
      }
      if (data.non_field_errors) {
        setNonFieldError(String(data.non_field_errors[0] ?? data.non_field_errors));
      } else if (typeof data === 'string') {
        setNonFieldError(data);
      } else if (data.detail) {
        setNonFieldError(String(data.detail));
      } else if (!Array.isArray(data.legs)) {
        setNonFieldError('Не удалось сохранить цепочку. Попробуйте ещё раз.');
      }
    }
  };

  return (
    <section>
      <h1>Быстрый ввод цепочек сделок</h1>
      <div style={{ display: 'flex', gap: 12 }}>
        <QuickChainHeader
          chain={chain}
          pendingLeg={pendingLeg}
          canCloseExist={hasClose}
          hasOpen={hasOpen}
          onInstrumentChange={handleInstrumentChange}
          onStrategyChange={(id) => setChain((c) => ({ ...c, strategyId: id }))}
          onDirectionChange={(d) => setChain((c) => ({ ...c, direction: d }))}
          onStartLeg={handleStartLeg}
        />
        {chain.instrumentTicker ? (
          <QuickChainChart
            ticker={chain.instrumentTicker}
            activeLegs={chain.legs}
            savedChains={savedChains}
            enablePicker={pendingLeg !== null}
            onPointPick={handlePointPick}
          />
        ) : (
          <div style={{ flex: 1, padding: 32, textAlign: 'center' }}>
            Выберите инструмент чтобы открыть график
          </div>
        )}
        <QuickChainLegsPanel
          legs={chain.legs}
          errorsByIndex={errorsByIndex}
          canSave={canSave}
          onVolumeChange={handleVolumeChange}
          onRemoveLeg={handleRemoveLeg}
          onSave={handleSave}
          onReset={() => requestReset(() => setChain((c) => ({ ...c, legs: [] })))}
        />
      </div>
      {nonFieldError && (
        <div role="alert" style={{ color: 'red' }} data-testid="non-field-error">
          {nonFieldError}
        </div>
      )}
      {successChainId && (
        <QuickChainSuccessPanel
          chainId={successChainId}
          onNextChain={() => setSuccessChainId(null)}
          onClose={() => setSuccessChainId(null)}
        />
      )}
      {resetConfirm && (
        <div role="dialog" aria-label="Подтвердите сброс" data-testid="reset-confirm">
          <p>Сбросить незавершённую цепочку?</p>
          <button onClick={() => { resetConfirm(); setResetConfirm(null); }} data-testid="reset-confirm-yes">
            Да, сбросить
          </button>
          <button onClick={() => setResetConfirm(null)}>Отмена</button>
        </div>
      )}
    </section>
  );
}

function computeVolumeBalance(legs: ChainLeg[]): number {
  const open = legs.filter((l) => l.type === 'OPEN' || l.type === 'AVERAGE')
    .reduce((s, l) => s + l.volume_from_capital, 0);
  const closed = legs.filter((l) => l.type === 'PARTIAL_CLOSE' || l.type === 'CLOSE')
    .reduce((s, l) => s + l.volume_from_capital, 0);
  return open - closed;
}
```

- [ ] **Step 2: TS-проверка**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Manual smoke**

Открыть `http://localhost:3000/trades/quick`, выбрать SBER, выбрать стратегию, кликнуть `+ Вход`, кликнуть по графику 3 раза (вход → SL → TP). Должны появиться маркеры и leg в списке.

Затем `+ Закрытие`, кликнуть точку. Должна быть активна кнопка [Сохранить цепочку]. Кликнуть. Должна появиться success-панель.

Проверить что в `/trades` появилась новая цепочка.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/trades/quick/QuickTradeEntryPage.tsx
git commit -m "feat(frontend): QuickTradeEntryPage — оркестрация state machine и save flow"
```

---

### Task 20: Тесты страницы QuickTradeEntryPage

**Files:**
- Create: `frontend/src/pages/trades/quick/__tests__/QuickTradeEntryPage.test.tsx`

- [ ] **Step 1: Написать тесты с моками API и чарта**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Мокаем CandlestickChart — он не должен дёргать реальный lightweight-charts/API свечей
vi.mock('@/components/CandlestickChart', () => ({
  CandlestickChart: ({ onPointPick, pickerMode }: any) => (
    <div data-testid="mock-chart">
      <button
        data-testid="mock-pick-entry"
        onClick={() => onPointPick?.({ time: 1700000000, price: 100 })}
      >
        pick entry
      </button>
      <button
        data-testid="mock-pick-sl"
        onClick={() => onPointPick?.({ time: 1700000000, price: 95 })}
      >
        pick sl
      </button>
      <button
        data-testid="mock-pick-tp"
        onClick={() => onPointPick?.({ time: 1700000000, price: 110 })}
      >
        pick tp
      </button>
      <button
        data-testid="mock-pick-close"
        onClick={() => onPointPick?.({ time: 1700001000, price: 108 })}
      >
        pick close
      </button>
      <span data-testid="picker-mode">{String(pickerMode)}</span>
    </div>
  ),
  // ре-экспорт типа не нужен — другие компоненты используют { type } import
}));

const mockCreateQuickChain = vi.fn();
const mockListTrades = vi.fn().mockResolvedValue({ results: [] });
const mockListStrategies = vi.fn().mockResolvedValue({
  results: [{ id: 1, name: 'Скальпинг' }],
});

vi.mock('@/api/endpoints', () => ({
  tradesApi: {
    list: (...args: any[]) => mockListTrades(...args),
    get: vi.fn(),
    createQuickChain: (...args: any[]) => mockCreateQuickChain(...args),
  },
  strategiesApi: {
    list: () => mockListStrategies(),
  },
  instrumentsApi: {
    search: vi.fn().mockResolvedValue([
      { id: 42, ticker: 'SBER', name: 'Сбербанк' },
    ]),
  },
}));

import { QuickTradeEntryPage } from '../QuickTradeEntryPage';

function setup() {
  return render(
    <MemoryRouter>
      <QuickTradeEntryPage />
    </MemoryRouter>
  );
}

async function selectInstrumentAndStrategy(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText(/SBER/), 'SBER');
  // Подождём результата поиска
  const result = await screen.findByText(/SBER — Сбербанк/);
  await user.click(result);

  // Дождёмся подгрузки стратегий
  await screen.findByRole('option', { name: 'Скальпинг' });
  await user.selectOptions(screen.getByRole('combobox'), '1');
}

describe('QuickTradeEntryPage', () => {
  beforeEach(() => {
    mockCreateQuickChain.mockReset();
    mockListTrades.mockClear();
  });

  it('добавляет AVERAGE leg после полного OPEN-цикла + клика по графику', async () => {
    const user = userEvent.setup();
    setup();
    await selectInstrumentAndStrategy(user);

    // OPEN: вход → SL → TP
    await user.click(screen.getByText('+ Вход'));
    await user.click(screen.getByTestId('mock-pick-entry'));
    await user.click(screen.getByTestId('mock-pick-sl'));
    await user.click(screen.getByTestId('mock-pick-tp'));
    expect(screen.getByTestId('leg-0')).toHaveTextContent('OPEN');

    // AVERAGE
    await user.click(screen.getByText('+ Усреднение'));
    await user.click(screen.getByTestId('mock-pick-entry'));
    expect(screen.getByTestId('leg-1')).toHaveTextContent('AVG');
  });

  it('save_calls_api с правильным payload', async () => {
    mockCreateQuickChain.mockResolvedValue({
      open_trade: { id: 'uuid-1' },
      chain_id: 'uuid-1',
    });

    const user = userEvent.setup();
    setup();
    await selectInstrumentAndStrategy(user);

    await user.click(screen.getByText('+ Вход'));
    await user.click(screen.getByTestId('mock-pick-entry'));
    await user.click(screen.getByTestId('mock-pick-sl'));
    await user.click(screen.getByTestId('mock-pick-tp'));

    await user.click(screen.getByText('+ Закрытие'));
    await user.click(screen.getByTestId('mock-pick-close'));

    await user.click(screen.getByTestId('save-chain'));

    await waitFor(() => expect(mockCreateQuickChain).toHaveBeenCalled());
    const payload = mockCreateQuickChain.mock.calls[0][0];
    expect(payload.instrument_id).toBe(42);
    expect(payload.strategy_id).toBe(1);
    expect(payload.direction).toBe('LONG');
    expect(payload.legs).toHaveLength(2);
    expect(payload.legs[0].type).toBe('OPEN');
    expect(payload.legs[1].type).toBe('CLOSE');
  });

  it('error_400 подсвечивает leg и non-field error', async () => {
    mockCreateQuickChain.mockRejectedValue({
      response: {
        data: {
          legs: [null, { price: 'должна быть > 0' }],
          non_field_errors: ['Сумма не сходится'],
        },
      },
    });

    const user = userEvent.setup();
    setup();
    await selectInstrumentAndStrategy(user);

    await user.click(screen.getByText('+ Вход'));
    await user.click(screen.getByTestId('mock-pick-entry'));
    await user.click(screen.getByTestId('mock-pick-sl'));
    await user.click(screen.getByTestId('mock-pick-tp'));
    await user.click(screen.getByText('+ Закрытие'));
    await user.click(screen.getByTestId('mock-pick-close'));
    await user.click(screen.getByTestId('save-chain'));

    await waitFor(() => {
      expect(screen.getByTestId('non-field-error')).toHaveTextContent('Сумма не сходится');
    });
    expect(screen.getByText('должна быть > 0')).toBeInTheDocument();
  });

  it('reset_on_instrument_change запрашивает подтверждение', async () => {
    const user = userEvent.setup();
    setup();
    await selectInstrumentAndStrategy(user);
    await user.click(screen.getByText('+ Вход'));
    await user.click(screen.getByTestId('mock-pick-entry'));
    await user.click(screen.getByTestId('mock-pick-sl'));
    await user.click(screen.getByTestId('mock-pick-tp'));

    // Смена инструмента — печатаем новый поиск
    await user.clear(screen.getByPlaceholderText(/SBER/));
    await user.type(screen.getByPlaceholderText(/SBER/), 'SBER');
    const result = await screen.findByText(/SBER — Сбербанк/);
    await user.click(result);

    expect(screen.getByTestId('reset-confirm')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Запустить тесты**

```bash
cd frontend && npm run test src/pages/trades/quick/__tests__/QuickTradeEntryPage.test.tsx
```

Expected: 4 passed.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/trades/quick/__tests__/QuickTradeEntryPage.test.tsx
git commit -m "test(frontend): тесты QuickTradeEntryPage (flow, save, error, reset)"
```

---

### Task 21: Inline-баннер в TradeForm

**Files:**
- Modify: `frontend/src/pages/trades/TradeForm.tsx`

- [ ] **Step 1: Добавить баннер сверху формы**

Найти в `TradeForm.tsx` начало return (примерно строка 191):

```tsx
return (
  <section>
    <h1>{isEdit ? 'Редактирование сделки' : 'Новая сделка'}</h1>
```

Добавить **после** `<h1>` и **до** `<Card>` (только для режима создания — не редактирования):

```tsx
{!isEdit && (
  <div
    style={{
      marginBottom: 12,
      padding: 10,
      background: '#eff6ff',
      border: '1px solid #93c5fd',
      borderRadius: 6,
    }}
  >
    Нужно быстро записать уже завершённую сделку?{' '}
    <a href="/trades/quick">Быстрый ввод цепочки →</a>
  </div>
)}
```

- [ ] **Step 2: Manual smoke**

Открыть `http://localhost:3000/trades/new` — увидеть баннер. Кликнуть ссылку — перейти на `/trades/quick`.
Открыть `/trades/<id>/edit` — баннера не должно быть.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/trades/TradeForm.tsx
git commit -m "feat(frontend): inline-баннер ссылка на быстрый ввод в TradeForm"
```

---

### Task 22: Финальный ручной end-to-end smoke

**Files:** — нет правок, только проверка.

- [ ] **Step 1: Поднять dev-стек**

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

- [ ] **Step 2: Прогнать все backend тесты trades**

```bash
docker compose -f docker-compose.dev.yml exec web python manage.py test trades -v 2
```

Expected: все passed.

- [ ] **Step 3: Прогнать все frontend тесты**

```bash
cd frontend && npm run test
```

Expected: все passed (smoke + LegsPanel + QuickTradeEntryPage).

- [ ] **Step 4: Ручной end-to-end чеклист**

Залогиниться `admin/Qwer@12345`, открыть `http://localhost:3000/trades/quick`.

- [ ] Выбрать инструмент SBER через поиск.
- [ ] Выбрать стратегию.
- [ ] Кнопка `+ Вход` → клик по графику → ещё 2 клика (SL, TP). Маркеры появляются.
- [ ] Кнопка `+ Усреднение` → клик по графику. Маркер появляется.
- [ ] Кнопка `+ Частичка` → клик. Маркер появляется.
- [ ] Кнопка `+ Закрытие` → клик. Маркер появляется.
- [ ] Изменить volume на одном из legs через inline input.
- [ ] Кнопка `Сохранить цепочку` активна → клик → success-панель.
- [ ] Перейти в `/trades` — цепочка видна как parent OPEN-сделка.
- [ ] Открыть детали — `is_closed = true`, child_trades содержит AVG/PC/CLOSE.
- [ ] Вернуться в `/trades/quick`, тот же тикер — должны быть тусклые маркеры прошлой цепочки.
- [ ] Сменить инструмент при не-пустой цепочке — увидеть модалку подтверждения.
- [ ] Открыть `/trades/new` — баннер "Быстрый ввод" виден сверху.

- [ ] **Step 5: Если всё OK — финальный commit (или skip если все шаги уже закоммичены)**

Никаких новых правок не должно быть. Если ходе ручного smoke нашлись баги — задокументировать и исправить в новых tasks, не закрывать план.

---

## Self-Review

### Spec coverage

| Требование spec | Task |
|---|---|
| POST /api/trades/quick-chain/ atomic | 7, 8 |
| QuickChainSerializer (header + legs) | 3 |
| QuickChainLegSerializer | 2 |
| Структурная валидация (OPEN/CLOSE) | 4 |
| Field-валидации (даты, volume, SL/TP) | 5 |
| Strategy ownership + instrument | 6 |
| Atomic rollback | 7 |
| Endpoint в URL | 8 (через @action) |
| Filter is_closed + instrument | 9 |
| Tests test_quick_chain.py | 1–9 |
| CandlestickChart контролируемые props | 12 |
| API клиент createQuickChain | 11 |
| Sidebar пункт | 13 |
| Роут /trades/quick | 13 |
| QuickChainHeader | 15 |
| QuickChainChart | 16 |
| QuickChainLegsPanel | 17 |
| QuickChainSuccessPanel | 18 |
| QuickTradeEntryPage оркестрация | 19 |
| Inline-banner в TradeForm | 21 |
| Vitest setup | 10 |
| Frontend тесты | 17, 20 |
| Ручной smoke | 22 |

Покрытие полное. Спец-пункт "адаптация ChartPricePickerDialog на новый API CandlestickChart" сознательно отложен — отмечено в Architecture-секции плана.

### Placeholder scan

Нет `TBD`, `TODO`, "appropriate", "etc". Все шаги содержат конкретный код или команды.

### Type consistency

- `QuickChainLegSerializer` поля совпадают между Task 2 и Task 3 (используется как nested).
- `QuickChainSerializer.validate_legs` — единая точка валидации, расширяется по Task 4 → 5, без переименования методов.
- `ChartMarker` определён в Task 12, импортируется в Task 16.
- `ChainLeg`, `ActiveChain`, `PendingLeg`, `SavedChainSummary` — единый источник в Task 14, используются во всех frontend-tasks.
- `QuickChainPayload`, `QuickChainResponse`, `QuickChainLeg` (frontend) — Task 11, используются в Task 19.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-28-quick-trade-entry.md`. Два варианта выполнения:

**1. Subagent-Driven (recommended)** — диспатчу свежего сабагента на каждый task, делаю ревью между ними, быстрая итерация.

**2. Inline Execution** — выполняю tasks в текущей сессии через executing-plans с чекпоинтами на ревью.

Какой подход выбираешь?
