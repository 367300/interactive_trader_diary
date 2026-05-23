from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Trade, TradeAnalysis, TradeScreenshot
from .serializers import (
    ChildTradeCreateSerializer,
    TradeAnalysisSerializer,
    TradeDetailSerializer,
    TradeListSerializer,
    TradeScreenshotSerializer,
    TradeSerializer,
)
from .utils import (
    annotate_recent_trades_with_pips,
    calculate_trade_stats,
    calculate_user_aggregate_stats,
)


class TradeViewSet(viewsets.ModelViewSet):
    """CRUD по сделкам пользователя + действия (усреднение/частичное/полное закрытие)."""

    def get_queryset(self):
        qs = Trade.objects.filter(user=self.request.user).select_related(
            'instrument', 'strategy'
        )
        if self.action == 'list':
            qs = qs.filter(parent_trade__isnull=True)
        return qs.order_by('-trade_date')

    def get_serializer_class(self):
        if self.action == 'list':
            return TradeListSerializer
        if self.action == 'retrieve':
            return TradeDetailSerializer
        return TradeSerializer

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        results = response.data.get('results') if isinstance(response.data, dict) else None
        if results:
            annotate_recent_trades_with_pips(self.paginator.page.object_list)
        return response

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, trade_type=Trade.TradeType.OPEN)

    def _create_child(self, request, parent_id, trade_type, full_close=False, partial=False):
        parent = get_object_or_404(Trade, pk=parent_id, user=request.user)
        if parent.is_closed():
            return Response(
                {'detail': 'Сделка уже закрыта.'}, status=status.HTTP_400_BAD_REQUEST
            )
        if partial and not parent.can_partial_close():
            return Response(
                {'detail': 'Нет доступного объёма для частичного закрытия.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ChildTradeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        analysis_data = data.pop('analysis', None)

        if full_close:
            data['volume_from_capital'] = parent.get_available_volume()
        if partial:
            volume = data.get('volume_from_capital') or 0
            available = parent.get_available_volume()
            if volume <= 0:
                return Response(
                    {'volume_from_capital': ['Объём должен быть положительным']},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if volume >= available:
                return Response(
                    {
                        'volume_from_capital': [
                            f'Для частичного закрытия объём должен быть меньше доступного '
                            f'({available}%). Используйте полное закрытие.'
                        ]
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if trade_type == Trade.TradeType.AVERAGE and 'volume_from_capital' not in data:
            data['volume_from_capital'] = parent.volume_from_capital

        child = Trade.objects.create(
            user=request.user,
            parent_trade=parent,
            trade_type=trade_type,
            direction=parent.direction,
            instrument=parent.instrument,
            strategy=parent.strategy,
            **data,
        )
        if analysis_data:
            has_data = any(
                analysis_data.get(f) for f in ('analysis', 'conclusions', 'emotional_state', 'tags')
            )
            if has_data:
                TradeAnalysis.objects.create(trade=child, **analysis_data)

        return Response(
            TradeSerializer(child, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'])
    def average(self, request, pk=None):
        return self._create_child(request, pk, Trade.TradeType.AVERAGE)

    @action(detail=True, methods=['post'], url_path='partial-close')
    def partial_close(self, request, pk=None):
        return self._create_child(request, pk, Trade.TradeType.PARTIAL_CLOSE, partial=True)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        return self._create_child(request, pk, Trade.TradeType.CLOSE, full_close=True)

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        trade = self.get_object()
        if trade.trade_type != Trade.TradeType.OPEN:
            return Response({'detail': 'Статистика доступна только по родительской сделке.'},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(calculate_trade_stats(trade))


class TradeScreenshotViewSet(viewsets.ModelViewSet):
    """Скриншоты сделки: список/добавление/удаление/правка описания."""

    serializer_class = TradeScreenshotSerializer
    parser_classes = (MultiPartParser, FormParser)
    pagination_class = None

    def get_trade(self):
        trade = get_object_or_404(
            Trade, pk=self.kwargs.get('trade_id'), user=self.request.user
        )
        return trade

    def get_queryset(self):
        return TradeScreenshot.objects.filter(
            trade=self.get_trade()
        ).order_by('-uploaded_at')

    def perform_create(self, serializer):
        serializer.save(trade=self.get_trade())


class TradeAnalyticsView(APIView):
    """Сводная аналитика для страницы аналитики."""

    def get(self, request):
        from instruments.models import Instrument
        from strategies.models import TradingStrategy

        user = request.user
        agg = calculate_user_aggregate_stats(user)

        strategies_stats = []
        for strategy in TradingStrategy.objects.filter(user=user, is_active=True):
            count = Trade.objects.filter(
                user=user, strategy=strategy, parent_trade__isnull=True
            ).count()
            if count:
                strategies_stats.append(
                    {'id': strategy.id, 'name': strategy.name, 'trades_count': count}
                )

        instruments_stats = []
        for instrument in Instrument.objects.filter(is_active=True, trades__user=user).distinct():
            count = Trade.objects.filter(
                user=user, instrument=instrument, parent_trade__isnull=True
            ).count()
            if count:
                instruments_stats.append(
                    {
                        'id': instrument.id,
                        'ticker': instrument.ticker,
                        'name': instrument.name,
                        'trades_count': count,
                    }
                )

        return Response(
            {
                'aggregate': agg,
                'strategies': strategies_stats,
                'instruments': instruments_stats,
            }
        )


class TradesChartView(APIView):
    """Точки для графика количества сделок по дате."""

    def get(self, request):
        trades = Trade.objects.filter(
            user=request.user, parent_trade__isnull=True
        ).order_by('trade_date')
        return Response(
            [
                {'date': t.trade_date.strftime('%Y-%m-%d'), 'count': 1}
                for t in trades
            ]
        )
