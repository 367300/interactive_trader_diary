from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from strategies.models import TradingStrategy
from trades.models import Trade

from .models import TraderProfile
from core.models import SiteSettings

from .serializers import (
    LoginSerializer,
    RegisterSerializer,
    TraderProfileSerializer,
    UserSerializer,
    issue_tokens_for,
)


class RegisterView(APIView):
    """Регистрация: создаёт пользователя и сразу выдаёт токены."""

    permission_classes = (AllowAny,)

    def post(self, request):
        if not SiteSettings.load().registration_enabled:
            return Response(
                {"detail": "Регистрация временно закрыта."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(issue_tokens_for(user), status=status.HTTP_201_CREATED)


class LoginView(APIView):
    """Вход по username или email + выдача access/refresh."""

    permission_classes = (AllowAny,)

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(issue_tokens_for(serializer.validated_data['user']))


class LogoutView(APIView):
    """Помечает refresh-токен как использованный (опционально клиент его передаёт)."""

    permission_classes = (IsAuthenticated,)

    def post(self, request):
        token = request.data.get('refresh')
        if token:
            try:
                RefreshToken(token).blacklist()
            except (TokenError, AttributeError):
                # blacklist недоступен без приложения, игнорируем — клиент удалит токен сам
                pass
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MeView(APIView):
    """Текущий пользователь + краткая статистика для UI."""

    def get(self, request):
        user = request.user
        profile, _ = TraderProfile.objects.get_or_create(user=user)
        trades = Trade.objects.filter(user=user)
        data = TraderProfileSerializer(profile).data
        data['stats'] = {
            'total_trades': trades.filter(parent_trade__isnull=True).count(),
            'closed_trades': trades.filter(trade_type=Trade.TradeType.CLOSE).count(),
            'open_trades': trades.filter(parent_trade__isnull=True).count()
            - trades.filter(trade_type=Trade.TradeType.CLOSE).count(),
            'active_strategies': TradingStrategy.objects.filter(
                user=user, is_active=True
            ).count(),
        }
        return Response(data)

    def patch(self, request):
        user = request.user
        profile, _ = TraderProfile.objects.get_or_create(user=user)

        tinkoff_token = request.data.get('tinkoff_token')
        if tinkoff_token:
            from instruments.tinkoff_candles import validate_token
            if not validate_token(tinkoff_token):
                return Response(
                    {"tinkoff_token": ["Невалидный токен T-Invest API."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        profile_serializer = TraderProfileSerializer(
            profile, data=request.data, partial=True
        )
        profile_serializer.is_valid(raise_exception=True)
        profile_serializer.save()

        user_data = request.data.copy()
        user_data.pop('tinkoff_token', None)
        if user_data:
            user_serializer = UserSerializer(user, data=user_data, partial=True)
            user_serializer.is_valid(raise_exception=True)
            user_serializer.save()

        return Response(TraderProfileSerializer(profile).data)
