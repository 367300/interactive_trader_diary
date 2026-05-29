from datetime import date
from unittest.mock import patch, MagicMock

from channels.layers import get_channel_layer
from django.test import TestCase, override_settings


class _AsyncNoop:
    def __await__(self):
        if False:
            yield
        return None


@override_settings(
    CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
)
class SyncCandlesTaskHappyPathTests(TestCase):
    def test_happy_path_sends_progress_and_done(self):
        from instruments import tasks
        from instruments.candles_gaps import GapRange

        ranges = [
            GapRange(date(2026, 5, 4), date(2026, 5, 4), "missing_days"),
            GapRange(date(2026, 5, 5), date(2026, 5, 5), "tail"),
        ]
        fake_candles = [
            {"datetime": "2026-05-04 10:00:00", "open": 100, "high": 101, "low": 99, "close": 100.5, "volume": 10, "value": 0},
        ]

        events: list[dict] = []
        layer = get_channel_layer()

        with patch.object(tasks, "_get_admin_token", return_value="fake-token"), \
             patch("instruments.tasks.resolve_instrument_uid", return_value="uid-xyz"), \
             patch("instruments.tasks.find_missing_ranges", return_value=ranges), \
             patch("instruments.tasks.fetch_tinkoff_candles", return_value=fake_candles), \
             patch("instruments.tasks.save_candles_to_csv", return_value=1):

            with patch.object(layer, "group_send") as group_send:
                group_send.side_effect = lambda group, event: events.append(event) or _AsyncNoop()
                self_mock = MagicMock()
                self_mock.request.id = "task-abc"
                tasks._run_sync_candles(
                    self_mock,
                    ticker="SBER",
                    market="stock",
                    api_ticker=None,
                )

        types = [e["type"] for e in events]
        self.assertEqual(types.count("sync.progress"), 2)
        self.assertEqual(types[-1], "sync.done")
        done = events[-1]
        self.assertEqual(done["task_id"], "task-abc")
        self.assertEqual(done["total_ranges"], 2)
        self.assertEqual(done["errors"], 0)
        self.assertEqual(done["cumulative_candles"], 2)


@override_settings(
    CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
)
class SyncCandlesTaskErrorPathsTests(TestCase):
    def _run(self, **overrides):
        from instruments import tasks
        events: list[dict] = []
        layer = get_channel_layer()
        with patch.object(layer, "group_send") as group_send:
            group_send.side_effect = lambda g, e: events.append(e) or _AsyncNoop()
            self_mock = MagicMock()
            self_mock.request.id = "task-err"
            tasks._run_sync_candles(self_mock, ticker="SBER", market="stock", **overrides)
        return events

    def test_no_token(self):
        from instruments import tasks
        with patch.object(tasks, "_get_admin_token", return_value=None):
            events = self._run()
        self.assertEqual(events[0]["type"], "sync.error")
        self.assertEqual(events[0]["message"], "no_token")

    def test_uid_not_found(self):
        from instruments import tasks
        with patch.object(tasks, "_get_admin_token", return_value="t"), \
             patch("instruments.tasks.resolve_instrument_uid", return_value=None):
            events = self._run()
        self.assertEqual(events[0]["type"], "sync.error")
        self.assertEqual(events[0]["message"], "uid_not_found")

    def test_exception_in_one_range_continues(self):
        from instruments import tasks
        from instruments.candles_gaps import GapRange
        ranges = [
            GapRange(date(2026, 5, 4), date(2026, 5, 4), "missing_days"),
            GapRange(date(2026, 5, 5), date(2026, 5, 5), "missing_days"),
        ]
        def fetch_side_effect(token, uid, frm, till, interval):
            if frm == date(2026, 5, 4):
                raise RuntimeError("boom")
            return [{"datetime": "2026-05-05 10:00:00", "open": 1, "high": 1, "low": 1, "close": 1, "volume": 1, "value": 0}]
        with patch.object(tasks, "_get_admin_token", return_value="t"), \
             patch("instruments.tasks.resolve_instrument_uid", return_value="uid"), \
             patch("instruments.tasks.find_missing_ranges", return_value=ranges), \
             patch("instruments.tasks.fetch_tinkoff_candles", side_effect=fetch_side_effect), \
             patch("instruments.tasks.save_candles_to_csv", return_value=1):
            events = self._run()
        done = [e for e in events if e["type"] == "sync.done"][0]
        self.assertEqual(done["errors"], 1)
        self.assertEqual(done["total_ranges"], 2)

    def test_soft_timeout_emits_error(self):
        from instruments import tasks
        from instruments.candles_gaps import GapRange
        from celery.exceptions import SoftTimeLimitExceeded
        ranges = [GapRange(date(2026, 5, 4), date(2026, 5, 4), "missing_days")]
        def boom(*a, **kw):
            raise SoftTimeLimitExceeded()
        with patch.object(tasks, "_get_admin_token", return_value="t"), \
             patch("instruments.tasks.resolve_instrument_uid", return_value="uid"), \
             patch("instruments.tasks.find_missing_ranges", return_value=ranges), \
             patch("instruments.tasks.fetch_tinkoff_candles", side_effect=boom):
            events = self._run()
        self.assertEqual(events[-1]["type"], "sync.error")
        self.assertEqual(events[-1]["message"], "timeout")
