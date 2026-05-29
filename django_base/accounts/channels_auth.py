"""Channels middleware: аутентификация WebSocket-соединений через JWT в query."""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser


@database_sync_to_async
def _user_from_token(token: str):
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        validated = AccessToken(token)
        user_id = validated.get("user_id")
        if user_id is None:
            return AnonymousUser()
        User = get_user_model()
        return User.objects.get(pk=user_id)
    except Exception:
        return AnonymousUser()


class JWTAuthMiddleware:
    """Достаёт `?token=<jwt>` из query string и кладёт ``scope['user']``."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        token = None
        qs = scope.get("query_string", b"").decode()
        if qs:
            params = parse_qs(qs)
            token = params.get("token", [None])[0]
        scope["user"] = await _user_from_token(token) if token else AnonymousUser()
        return await self.inner(scope, receive, send)
