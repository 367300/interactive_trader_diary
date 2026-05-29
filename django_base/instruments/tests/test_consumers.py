import asyncio

from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase, override_settings


def _build_app():
    """Собирает asgi-app только из WS-роутера + JWT middleware для теста."""
    from channels.routing import URLRouter
    from django.urls import re_path
    from instruments.consumers import CandleSyncConsumer
    from accounts.channels_auth import JWTAuthMiddleware

    return JWTAuthMiddleware(URLRouter([
        re_path(r"ws/candles-sync/(?P<ticker>[A-Z0-9._-]+)/$", CandleSyncConsumer.as_asgi()),
    ]))


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


@override_settings(
    CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
)
class CandleSyncConsumerTests(TransactionTestCase):
    async def _connect(self, ticker, token=""):
        app = _build_app()
        comm = WebsocketCommunicator(app, f"/ws/candles-sync/{ticker}/?token={token}")
        connected = await comm.connect()
        return comm, connected

    def test_anonymous_closed_4403(self):
        from instruments.models import Instrument
        Instrument.objects.create(ticker="SBER", name="Sber", instrument_type="STOCK", is_active=True, min_price_step="0.01")
        comm, (connected, code) = _run(self._connect("SBER"))
        self.assertFalse(connected)
        self.assertEqual(code, 4403)

    def test_non_staff_closed_4403(self):
        from instruments.models import Instrument
        from rest_framework_simplejwt.tokens import AccessToken
        Instrument.objects.create(ticker="SBER", name="Sber", instrument_type="STOCK", is_active=True, min_price_step="0.01")
        User = get_user_model()
        u = User.objects.create_user(username="alice", password="x", is_staff=False)
        token = str(AccessToken.for_user(u))
        comm, (connected, code) = _run(self._connect("SBER", token))
        self.assertFalse(connected)
        self.assertEqual(code, 4403)

    def test_unknown_ticker_closed_4404(self):
        from rest_framework_simplejwt.tokens import AccessToken
        User = get_user_model()
        admin = User.objects.create_user(username="root", password="x", is_staff=True)
        token = str(AccessToken.for_user(admin))
        comm, (connected, code) = _run(self._connect("ZZZZ", token))
        self.assertFalse(connected)
        self.assertEqual(code, 4404)

    def test_admin_connects_and_receives_progress(self):
        from instruments.models import Instrument
        from rest_framework_simplejwt.tokens import AccessToken
        from channels.layers import get_channel_layer

        Instrument.objects.create(ticker="SBER", name="Sber", instrument_type="STOCK", is_active=True, min_price_step="0.01")
        User = get_user_model()
        admin = User.objects.create_user(username="root", password="x", is_staff=True)
        token = str(AccessToken.for_user(admin))

        async def flow():
            app = _build_app()
            comm = WebsocketCommunicator(app, f"/ws/candles-sync/SBER/?token={token}")
            connected, _ = await comm.connect()
            assert connected, "should connect"

            layer = get_channel_layer()
            await layer.group_send("candles_sync_SBER", {
                "type": "sync.progress",
                "task_id": "t1",
                "done_ranges": 1, "total_ranges": 2,
                "range_from": "2026-05-04", "range_till": "2026-05-04",
                "range_candles": 5, "cumulative_candles": 5,
            })
            received = await comm.receive_json_from()
            await comm.disconnect()
            return received

        received = _run(flow())
        self.assertEqual(received["type"], "sync.progress")
        self.assertEqual(received["task_id"], "t1")
