"""WebSocket consumer для прогресса синхронизации свечей."""
from asgiref.sync import async_to_sync
from channels.generic.websocket import JsonWebsocketConsumer
from django.core.cache import cache


def _ticker_exists(ticker: str) -> bool:
    from instruments.models import Futures, Instrument
    return (
        Instrument.objects.filter(ticker=ticker, is_active=True).exists()
        or Futures.objects.filter(ticker=ticker, is_active=True).exists()
    )


class CandleSyncConsumer(JsonWebsocketConsumer):
    def connect(self):
        user = self.scope.get("user")
        if not getattr(user, "is_authenticated", False) or not getattr(user, "is_staff", False):
            self.close(code=4403)
            return

        self.ticker = self.scope["url_route"]["kwargs"]["ticker"].upper()
        if not _ticker_exists(self.ticker):
            self.close(code=4404)
            return

        self.group = f"candles_sync_{self.ticker}"
        async_to_sync(self.channel_layer.group_add)(self.group, self.channel_name)
        self.accept()

        state = cache.get(f"candles:sync_state:{self.ticker}")
        if state:
            snapshot = dict(state)
            snapshot["type"] = "sync.snapshot"
            self.send_json(snapshot)

    def disconnect(self, code):
        group = getattr(self, "group", None)
        if group:
            async_to_sync(self.channel_layer.group_discard)(group, self.channel_name)

    def sync_progress(self, event): self.send_json(event)
    def sync_done(self, event):     self.send_json(event)
    def sync_error(self, event):    self.send_json(event)
    def sync_snapshot(self, event): self.send_json(event)
