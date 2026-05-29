import asyncio

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import TransactionTestCase as TestCase
from rest_framework_simplejwt.tokens import AccessToken


def _run(coro):
    """Утилита для запуска coroutine из синхронного теста."""
    return asyncio.new_event_loop().run_until_complete(coro)


class JWTAuthMiddlewareTests(TestCase):
    def _exercise(self, query_string: bytes):
        from accounts.channels_auth import JWTAuthMiddleware

        captured: dict = {}

        async def inner(scope, receive, send):
            captured["user"] = scope["user"]

        scope = {"type": "websocket", "query_string": query_string}
        _run(JWTAuthMiddleware(inner)(scope, None, None))
        return captured.get("user")

    def test_valid_token_sets_user(self):
        User = get_user_model()
        user = User.objects.create_user(username="alice", password="x")
        token = str(AccessToken.for_user(user))
        result = self._exercise(f"token={token}".encode())
        self.assertEqual(result.id, user.id)

    def test_missing_token_sets_anonymous(self):
        result = self._exercise(b"")
        self.assertIsInstance(result, AnonymousUser)

    def test_invalid_token_sets_anonymous(self):
        result = self._exercise(b"token=not-a-jwt")
        self.assertIsInstance(result, AnonymousUser)
