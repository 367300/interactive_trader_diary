from datetime import date, datetime
from pathlib import Path

import pandas as pd
from django.test import TestCase, override_settings


def _write_csv(root: Path, ticker: str, day: date, times: list[str]) -> None:
    p = root / ticker.upper() / str(day.year) / f"{day.month:02d}" / f"{day.day:02d}.csv"
    p.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame({
        "datetime": [f"{day.isoformat()} {t}" for t in times],
        "open": [100.0] * len(times),
        "high": [101.0] * len(times),
        "low": [99.0] * len(times),
        "close": [100.5] * len(times),
        "volume": [10] * len(times),
        "value": [1000] * len(times),
    })
    df.to_csv(p, index=False)


class LastSavedCandleDtTests(TestCase):
    def setUp(self):
        self.root = Path(self._testMethodName + "_tmp").resolve()
        if self.root.exists():
            import shutil
            shutil.rmtree(self.root)
        self.root.mkdir(parents=True)
        self.addCleanup(lambda: __import__("shutil").rmtree(self.root, ignore_errors=True))

    def test_returns_none_when_no_files(self):
        from instruments import candles_gaps
        with override_settings(CANDLES_ROOT=str(self.root)):
            candles_gaps._last_saved_cache_clear()
            self.assertIsNone(candles_gaps.last_saved_candle_dt("SBER"))

    def test_returns_max_datetime_from_latest_day(self):
        from instruments import candles_gaps
        _write_csv(self.root, "SBER", date(2026, 5, 20), ["10:00:00", "10:01:00"])
        _write_csv(self.root, "SBER", date(2026, 5, 22), ["18:00:00", "23:49:00"])
        with override_settings(CANDLES_ROOT=str(self.root)):
            candles_gaps._last_saved_cache_clear()
            dt = candles_gaps.last_saved_candle_dt("SBER")
        self.assertEqual(dt, datetime(2026, 5, 22, 23, 49, 0))
