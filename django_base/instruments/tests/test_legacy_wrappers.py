from datetime import date
from unittest.mock import patch, MagicMock

from django.test import TestCase


class LoadCandlesForInstrumentWrapperTests(TestCase):
    def test_year_translates_to_start_end_range(self):
        from instruments import tasks
        with patch.object(tasks, "_run_sync_candles") as impl_mock:
            impl_mock.return_value = {"ticker": "SBER"}
            tasks.load_candles_for_instrument.run("SBER", year=2025, market="stock")
        kwargs = impl_mock.call_args.kwargs
        self.assertEqual(kwargs["start"], "2025-01-01")
        self.assertEqual(kwargs["end"], "2025-12-31")
        self.assertEqual(kwargs["market"], "stock")

    def test_default_year_is_current(self):
        from instruments import tasks
        with patch.object(tasks, "_run_sync_candles") as impl_mock:
            impl_mock.return_value = {"ticker": "SBER"}
            tasks.load_candles_for_instrument.run("SBER")
        kwargs = impl_mock.call_args.kwargs
        self.assertTrue(kwargs["start"].startswith(str(date.today().year)))


class UpdateTodayCandlesWrapperTests(TestCase):
    def test_fan_out_for_active_stocks_and_futures(self):
        from instruments import tasks
        from instruments.models import Instrument, Futures

        base = Instrument.objects.create(
            ticker="SBER",
            name="Sber",
            instrument_type="STOCK",
            is_active=True,
            min_price_step="0.01",
        )
        Futures.objects.create(
            ticker="SIU5",
            name="Si",
            secid="SiU5",
            is_active=True,
            base_asset=base,
        )

        with patch.object(tasks.sync_candles_for_instrument, "apply_async") as apply_mock:
            tasks.update_today_candles.run()
        called_tickers = sorted([c.kwargs["kwargs"]["ticker"] for c in apply_mock.call_args_list])
        self.assertIn("SBER", called_tickers)
        self.assertIn("SIU5", called_tickers)
        today_iso = date.today().isoformat()
        for c in apply_mock.call_args_list:
            self.assertEqual(c.kwargs["kwargs"]["start"], today_iso)
            self.assertEqual(c.kwargs["kwargs"]["end"], today_iso)
