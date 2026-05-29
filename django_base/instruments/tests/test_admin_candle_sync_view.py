from datetime import date
from unittest.mock import patch, MagicMock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from instruments.models import Instrument


class AdminCandleSyncViewTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        User = get_user_model()
        self.admin = User.objects.create_user(username="root", password="x", is_staff=True)
        self.user = User.objects.create_user(username="u", password="x", is_staff=False)
        Instrument.objects.create(
            ticker="SBER", name="Sber", instrument_type="STOCK",
            is_active=True, min_price_step="0.01",
        )
        cache.delete("candles:sync_state:SBER")
        cache.delete("candles:sync_lock:SBER")

    def tearDown(self):
        from django.core.cache import cache
        cache.delete("candles:sync_state:SBER")
        cache.delete("candles:sync_lock:SBER")

    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        return c

    def test_403_when_not_staff(self):
        resp = self._client(self.user).post("/api/instruments/SBER/sync-candles/", {})
        self.assertEqual(resp.status_code, 403)

    def test_404_unknown_ticker(self):
        resp = self._client(self.admin).post("/api/instruments/ZZZZ/sync-candles/", {})
        self.assertEqual(resp.status_code, 404)

    def test_202_starts_task_and_takes_lock(self):
        from django.core.cache import cache
        # Ensure Redis is clean - sometimes lock persists across test runs
        try:
            cache.client.get_client().flushdb()
        except Exception:
            pass
        with patch("instruments.views.sync_candles_for_instrument") as task_mock:
            task_mock.apply_async.return_value = MagicMock(id="task-1")
            resp = self._client(self.admin).post("/api/instruments/SBER/sync-candles/", {})
        self.assertEqual(resp.status_code, 202)
        self.assertEqual(resp.json()["task_id"], "task-1")
        self.assertEqual(resp.json()["ticker"], "SBER")
        task_mock.apply_async.assert_called_once()

    def test_409_when_lock_busy(self):
        from django.core.cache import cache
        cache.set("candles:sync_lock:SBER", "task-old", 60)
        cache.set("candles:sync_state:SBER", {"task_id": "task-old"}, 60)
        try:
            resp = self._client(self.admin).post("/api/instruments/SBER/sync-candles/", {})
        finally:
            cache.delete("candles:sync_lock:SBER")
            cache.delete("candles:sync_state:SBER")
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.json()["task_id"], "task-old")


class AdminCandleSyncBrokerFailureTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        User = get_user_model()
        self.admin = User.objects.create_user(username="root", password="x", is_staff=True)
        Instrument.objects.create(
            ticker="SBER", name="Sber", instrument_type="STOCK",
            is_active=True, min_price_step="0.01",
        )
        cache.delete("candles:sync_state:SBER")
        cache.delete("candles:sync_lock:SBER")
        self.client_ = APIClient()
        self.client_.force_authenticate(user=self.admin)

    def tearDown(self):
        from django.core.cache import cache
        cache.delete("candles:sync_state:SBER")
        cache.delete("candles:sync_lock:SBER")

    def test_lock_released_when_apply_async_fails(self):
        from django.core.cache import cache
        try:
            cache.client.get_client().flushdb()
        except Exception:
            pass
        with patch("instruments.views.sync_candles_for_instrument") as task_mock:
            task_mock.apply_async.side_effect = RuntimeError("broker down")
            resp = self.client_.post("/api/instruments/SBER/sync-candles/", {})
        self.assertEqual(resp.status_code, 503)
        # lock не должен оставаться занятым после сбоя брокера
        self.assertIsNone(cache.get("candles:sync_lock:SBER"))


class AdminCandleSyncStateViewTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        User = get_user_model()
        self.admin = User.objects.create_user(username="root", password="x", is_staff=True)
        Instrument.objects.create(
            ticker="SBER", name="Sber", instrument_type="STOCK",
            is_active=True, min_price_step="0.01",
        )
        cache.delete("candles:sync_state:SBER")
        cache.delete("candles:sync_lock:SBER")
        self.client_ = APIClient()
        self.client_.force_authenticate(user=self.admin)

    def tearDown(self):
        from django.core.cache import cache
        cache.delete("candles:sync_state:SBER")
        cache.delete("candles:sync_lock:SBER")

    def test_returns_null_when_no_state(self):
        from django.core.cache import cache
        cache.delete("candles:sync_state:SBER")
        resp = self.client_.get("/api/instruments/SBER/sync-candles/state/")
        self.assertEqual(resp.status_code, 200)
        # Response content should be empty (which represents null/None)
        self.assertIn(resp.content, (b'', b'null', b'None'))

    def test_returns_state(self):
        from django.core.cache import cache
        cache.set("candles:sync_state:SBER", {
            "task_id": "t1", "done_ranges": 1, "total_ranges": 2,
            "range_from": "2026-05-04", "range_till": "2026-05-04",
            "range_candles": 5, "cumulative_candles": 5,
        }, 60)
        try:
            resp = self.client_.get("/api/instruments/SBER/sync-candles/state/")
        finally:
            cache.delete("candles:sync_state:SBER")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["task_id"], "t1")
