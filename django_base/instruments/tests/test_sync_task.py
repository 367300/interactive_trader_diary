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
                tasks.sync_candles_for_instrument(
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
