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
