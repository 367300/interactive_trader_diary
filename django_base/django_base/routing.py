from django.urls import re_path

from instruments.consumers import CandleSyncConsumer

websocket_urlpatterns = [
    re_path(r"ws/candles-sync/(?P<ticker>[A-Z0-9._-]+)/$", CandleSyncConsumer.as_asgi()),
]
