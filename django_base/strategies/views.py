from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from trades.models import Trade

from .models import TradingStrategy
from .serializers import TradingStrategySerializer


class TradingStrategyViewSet(viewsets.ModelViewSet):
    """CRUD по стратегиям пользователя."""

    serializer_class = TradingStrategySerializer

    def get_queryset(self):
        return TradingStrategy.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        strategy = self.get_object()
        related = Trade.objects.filter(user=request.user, strategy=strategy).count()
        if related:
            return Response(
                {
                    'detail': (
                        f'Нельзя удалить стратегию: с ней связано {related} сделок. '
                        'Сначала удалите или переназначьте сделки.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class StrategyChoicesView(APIView):
    """Справочники для форм фронтенда (типы стратегий, типы инструментов)."""

    def get(self, request):
        return Response(
            {
                'strategy_types': [
                    {'value': v, 'label': l}
                    for v, l in TradingStrategy.StrategyType.choices
                ],
                'instruments': [
                    {'value': v, 'label': l}
                    for v, l in TradingStrategy.InstrumentType.choices
                ],
            }
        )
