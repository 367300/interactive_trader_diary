from decimal import Decimal
from django.contrib.auth.models import User
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
        sector = Sector.objects.create(name='Финансы')
        ig = IndustryGroup.objects.create(name='Банки', sector=sector)
        ind = Industry.objects.create(name='Универсальные банки', industry_group=ig)
        sub = SubIndustry.objects.create(name='Универсальные банки', industry=ind)
        cls.instrument = Instrument.objects.create(
            ticker='SBER',
            name='Сбербанк',
            instrument_type=Instrument.InstrumentType.STOCK,
            min_price_step=Decimal('0.01'),
            sub_industry=sub,
        )
        cls.strategy = TradingStrategy.objects.create(
            user=cls.user, name='Скальпинг', strategy_type='SCALPING'
        )
        cls.other_strategy = TradingStrategy.objects.create(
            user=cls.other_user, name='Чужая', strategy_type='SCALPING'
        )

    def setUp(self):
        self.client.force_authenticate(user=self.user)

    @classmethod
    def make_payload(cls, **overrides):
        base = {
            'instrument_id': cls.instrument.id,
            'strategy_id': cls.strategy.id,
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
        payload = self.make_payload()
        response = self.client.post('/api/trades/quick-chain/', payload, format='json')
        # endpoint должен существовать (не 404)
        self.assertNotEqual(response.status_code, status.HTTP_404_NOT_FOUND)


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


class QuickChainSerializerStructureTest(QuickChainBaseTestCase):
    def test_parses_valid_payload(self):
        from trades.serializers import QuickChainSerializer
        payload = self.make_payload()
        s = QuickChainSerializer(
            data=payload,
            context={'request': self._fake_request()},
        )
        self.assertTrue(s.is_valid(), s.errors)
        self.assertEqual(len(s.validated_data['legs']), 2)
        self.assertEqual(s.validated_data['direction'], 'LONG')

    def test_rejects_missing_legs(self):
        from trades.serializers import QuickChainSerializer
        payload = self.make_payload(legs=[])
        s = QuickChainSerializer(data=payload, context={'request': self._fake_request()})
        self.assertFalse(s.is_valid())

    def _fake_request(self):
        from unittest.mock import MagicMock
        req = MagicMock()
        req.user = self.user
        return req


class QuickChainStructureValidationTest(QuickChainBaseTestCase):
    def _serializer(self, payload):
        from trades.serializers import QuickChainSerializer
        from unittest.mock import MagicMock
        req = MagicMock()
        req.user = self.user
        return QuickChainSerializer(data=payload, context={'request': req})

    def test_rejects_first_not_open(self):
        payload = self.make_payload(legs=[
            {'type': 'AVERAGE', 'date': '2026-05-01T10:00:00Z',
             'price': '100', 'volume_from_capital': 10},
            {'type': 'CLOSE', 'date': '2026-05-01T11:00:00Z',
             'price': '108', 'volume_from_capital': 10},
        ])
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())
        self.assertIn('legs', s.errors)

    def test_rejects_last_not_close(self):
        payload = self.make_payload(legs=[
            {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
             'price': '100', 'volume_from_capital': 10},
            {'type': 'AVERAGE', 'date': '2026-05-01T11:00:00Z',
             'price': '98', 'volume_from_capital': 10},
        ])
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())

    def test_rejects_multiple_opens(self):
        payload = self.make_payload(legs=[
            {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
             'price': '100', 'volume_from_capital': 10},
            {'type': 'OPEN', 'date': '2026-05-01T11:00:00Z',
             'price': '102', 'volume_from_capital': 10},
            {'type': 'CLOSE', 'date': '2026-05-01T12:00:00Z',
             'price': '108', 'volume_from_capital': 20},
        ])
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())

    def test_rejects_multiple_closes(self):
        payload = self.make_payload(legs=[
            {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
             'price': '100', 'volume_from_capital': 10},
            {'type': 'CLOSE', 'date': '2026-05-01T11:00:00Z',
             'price': '108', 'volume_from_capital': 5},
            {'type': 'CLOSE', 'date': '2026-05-01T12:00:00Z',
             'price': '109', 'volume_from_capital': 5},
        ])
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())


class QuickChainFieldValidationTest(QuickChainBaseTestCase):
    def _serializer(self, payload):
        from trades.serializers import QuickChainSerializer
        from unittest.mock import MagicMock
        req = MagicMock()
        req.user = self.user
        return QuickChainSerializer(data=payload, context={'request': req})

    def test_rejects_dates_not_monotonic(self):
        payload = self.make_payload(legs=[
            {'type': 'OPEN', 'date': '2026-05-01T12:00:00Z',
             'price': '100', 'volume_from_capital': 10},
            {'type': 'CLOSE', 'date': '2026-05-01T10:00:00Z',
             'price': '108', 'volume_from_capital': 10},
        ])
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())

    def test_rejects_volume_mismatch(self):
        payload = self.make_payload(legs=[
            {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
             'price': '100', 'volume_from_capital': 20},
            {'type': 'CLOSE', 'date': '2026-05-01T11:00:00Z',
             'price': '108', 'volume_from_capital': 10},
        ])
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())

    def test_accepts_volume_match_with_partial(self):
        payload = self.make_payload(legs=[
            {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
             'price': '100', 'volume_from_capital': 20},
            {'type': 'AVERAGE', 'date': '2026-05-01T11:00:00Z',
             'price': '95', 'volume_from_capital': 10},
            {'type': 'PARTIAL_CLOSE', 'date': '2026-05-01T12:00:00Z',
             'price': '102', 'volume_from_capital': 15},
            {'type': 'CLOSE', 'date': '2026-05-01T13:00:00Z',
             'price': '108', 'volume_from_capital': 15},
        ])
        s = self._serializer(payload)
        self.assertTrue(s.is_valid(), s.errors)

    def test_rejects_sl_on_partial_close(self):
        payload = self.make_payload(legs=[
            {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
             'price': '100', 'volume_from_capital': 10},
            {'type': 'PARTIAL_CLOSE', 'date': '2026-05-01T11:00:00Z',
             'price': '102', 'volume_from_capital': 5, 'planned_stop_loss': '90'},
            {'type': 'CLOSE', 'date': '2026-05-01T12:00:00Z',
             'price': '108', 'volume_from_capital': 5},
        ])
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())

    def test_rejects_tp_on_close(self):
        payload = self.make_payload(legs=[
            {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
             'price': '100', 'volume_from_capital': 10},
            {'type': 'CLOSE', 'date': '2026-05-01T11:00:00Z',
             'price': '108', 'volume_from_capital': 10, 'planned_take_profit': '110'},
        ])
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())


class QuickChainAuthValidationTest(QuickChainBaseTestCase):
    def _serializer(self, payload):
        from trades.serializers import QuickChainSerializer
        from unittest.mock import MagicMock
        req = MagicMock()
        req.user = self.user
        return QuickChainSerializer(data=payload, context={'request': req})

    def test_rejects_other_users_strategy(self):
        payload = self.make_payload(strategy_id=self.other_strategy.id)
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())
        self.assertIn('strategy_id', s.errors)

    def test_rejects_nonexistent_strategy(self):
        payload = self.make_payload(strategy_id=999999)
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())
        self.assertIn('strategy_id', s.errors)

    def test_rejects_nonexistent_instrument(self):
        payload = self.make_payload(instrument_id=999999)
        s = self._serializer(payload)
        self.assertFalse(s.is_valid())
        self.assertIn('instrument_id', s.errors)


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
        payload = self.make_payload(legs=[
            {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
             'price': '100', 'volume_from_capital': 20,
             'planned_stop_loss': '90', 'planned_take_profit': '120'},
            {'type': 'AVERAGE', 'date': '2026-05-01T11:00:00Z',
             'price': '95', 'volume_from_capital': 10},
            {'type': 'PARTIAL_CLOSE', 'date': '2026-05-01T12:00:00Z',
             'price': '102', 'volume_from_capital': 15},
            {'type': 'CLOSE', 'date': '2026-05-01T13:00:00Z',
             'price': '108', 'volume_from_capital': 15},
        ])
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
        from unittest.mock import patch, MagicMock

        payload = self.make_payload(legs=[
            {'type': 'OPEN', 'date': '2026-05-01T10:00:00Z',
             'price': '100', 'volume_from_capital': 10},
            {'type': 'AVERAGE', 'date': '2026-05-01T11:00:00Z',
             'price': '95', 'volume_from_capital': 5},
            {'type': 'CLOSE', 'date': '2026-05-01T12:00:00Z',
             'price': '108', 'volume_from_capital': 15},
        ])

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


class QuickChainEndpointTest(QuickChainBaseTestCase):
    URL = '/api/trades/quick-chain/'

    def test_unauthenticated_blocked(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(self.URL, self.make_payload(), format='json')
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED,
                                              status.HTTP_403_FORBIDDEN))

    def test_creates_chain_and_returns_open_trade(self):
        response = self.client.post(self.URL, self.make_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        body = response.json()
        self.assertIn('open_trade', body)
        self.assertIn('chain_id', body)
        self.assertEqual(body['open_trade']['trade_type'], 'OPEN')
        self.assertEqual(body['chain_id'], body['open_trade']['id'])

    def test_validation_error_returns_400(self):
        bad = self.make_payload(legs=[
            {'type': 'AVERAGE', 'date': '2026-05-01T10:00:00Z',
             'price': '100', 'volume_from_capital': 10},
            {'type': 'CLOSE', 'date': '2026-05-01T11:00:00Z',
             'price': '108', 'volume_from_capital': 10},
        ])
        response = self.client.post(self.URL, bad, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_chain_appears_in_list(self):
        self.client.post(self.URL, self.make_payload(), format='json')
        list_response = self.client.get('/api/trades/')
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        items = list_response.json().get('results', list_response.json())
        opens = [t for t in items if t['trade_type'] == 'OPEN']
        self.assertGreaterEqual(len(opens), 1)
