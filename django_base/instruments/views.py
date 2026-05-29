from datetime import date, timedelta

from django.conf import settings
from django.core.cache import cache
from django.db.models import Count, Prefetch, Q
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from instruments.tasks import sync_candles_for_instrument

from .list_query import (
    LIST_TYPE_FUTURES,
    get_instrument_list_queryset,
    get_taxonomy_payload,
    normalize_search_param,
)
from .models import Futures, Instrument
from .serializers import (
    FuturesListSerializer,
    InstrumentDetailSerializer,
    InstrumentListSerializer,
)


class InstrumentListView(ListAPIView):
    """Список акций или фьючерсов с фильтрами таксономии и FTS-поиском."""

    def get_queryset(self):
        qs, _ = get_instrument_list_queryset(self.request, self.request.user)
        return qs

    def get_serializer_class(self):
        kind = normalize_search_param(self.request.GET.get('type'))
        return FuturesListSerializer if kind == LIST_TYPE_FUTURES else InstrumentListSerializer


class TaxonomyView(APIView):
    """Плоские справочники секторов/групп/индустрий/подгрупп для каскадных фильтров."""

    def get(self, request):
        return Response(get_taxonomy_payload())


class InstrumentDetailView(RetrieveAPIView):
    """Карточка базового инструмента по тикеру."""

    serializer_class = InstrumentDetailSerializer
    lookup_field = 'ticker'

    def get_queryset(self):
        return (
            Instrument.objects.filter(is_active=True)
            .select_related('sub_industry__industry__industry_group__sector')
            .prefetch_related(
                Prefetch(
                    'futures',
                    queryset=Futures.objects.filter(is_active=True).order_by(
                        'expiration_date', 'ticker'
                    ),
                ),
            )
        )


class FuturesDetailView(RetrieveAPIView):
    """Карточка фьючерсного контракта по тикеру."""

    serializer_class = FuturesListSerializer
    lookup_field = 'ticker'

    def get_queryset(self):
        return (
            Futures.objects.filter(is_active=True)
            .select_related(
                'base_asset',
                'base_asset__sub_industry__industry__industry_group__sector',
            )
        )


class InstrumentStatsView(APIView):
    """Статистика по инструментам пользователя."""

    def get(self, request):
        user = request.user
        from trades.models import Trade

        total_instruments = Instrument.objects.filter(is_active=True).count()
        used_instruments = (
            Instrument.objects.filter(is_active=True, trades__user=user).distinct().count()
        )
        user_trades = Trade.objects.filter(user=user)

        top_qs = (
            Instrument.objects.filter(is_active=True, trades__user=user)
            .annotate(
                trades_count=Count('trades'),
                closed_trades_count=Count(
                    'trades', filter=Q(trades__trade_type=Trade.TradeType.CLOSE)
                ),
            )
            .order_by('-trades_count')[:10]
        )
        top = [
            {
                'ticker': i.ticker,
                'name': i.name,
                'trades_count': i.trades_count,
                'closed_trades_count': i.closed_trades_count,
            }
            for i in top_qs
        ]

        type_distribution = []
        for inst_type, label in Instrument.InstrumentType.choices:
            count = Instrument.objects.filter(
                is_active=True,
                instrument_type=inst_type,
                trades__user=user,
            ).count()
            if count:
                type_distribution.append(
                    {'type': inst_type, 'label': label, 'count': count}
                )

        return Response(
            {
                'total_instruments': total_instruments,
                'used_instruments': used_instruments,
                'total_trades': user_trades.count(),
                'closed_trades': user_trades.filter(
                    trade_type=Trade.TradeType.CLOSE
                ).count(),
                'top_instruments': top,
                'type_distribution': type_distribution,
            }
        )


class CandleDataView(APIView):
    """OHLCV candle data for charting."""

    MAX_CANDLES = 5000

    def get(self, request, ticker):
        from instruments.candles import (
            candles_to_json,
            read_candles,
            resample_candles,
        )

        is_instrument = Instrument.objects.filter(ticker=ticker, is_active=True).exists()
        is_futures = (
            not is_instrument
            and Futures.objects.filter(ticker=ticker, is_active=True).exists()
        )

        if not is_instrument and not is_futures:
            return Response(
                {"detail": "Инструмент не найден."},
                status=status.HTTP_404_NOT_FOUND,
            )

        today = date.today()
        from_date = request.GET.get("from")
        till_date = request.GET.get("till")
        interval = request.GET.get("interval", "1")

        try:
            interval = int(interval)
        except (TypeError, ValueError):
            interval = 1
        interval = max(1, min(interval, 10080))

        try:
            from_date = date.fromisoformat(from_date) if from_date else today
        except ValueError:
            from_date = today
        try:
            till_date = date.fromisoformat(till_date) if till_date else today
        except ValueError:
            till_date = today

        if from_date > till_date:
            from_date, till_date = till_date, from_date

        cache_key = f"candles:{ticker}:{from_date}:{till_date}:{interval}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        df = read_candles(ticker, from_date, till_date)
        if not df.empty and interval > 1:
            df = resample_candles(df, interval)

        candles = candles_to_json(df)

        if len(candles) > self.MAX_CANDLES:
            candles = candles[-self.MAX_CANDLES:]

        result = {
            "ticker": ticker,
            "interval": interval,
            "from": from_date.isoformat(),
            "till": till_date.isoformat(),
            "count": len(candles),
            "candles": candles,
        }

        ttl = 300 if till_date >= today else 86400
        cache.set(cache_key, result, ttl)

        return Response(result)


def _resolve_market(ticker: str):
    """Возвращает (market, api_ticker) либо (None, None) если тикер не найден."""
    inst = Instrument.objects.filter(ticker=ticker, is_active=True).first()
    if inst:
        return "stock", inst.ticker
    fut = Futures.objects.filter(ticker=ticker, is_active=True).first()
    if fut and fut.secid:
        return "futures", fut.secid
    return None, None


class AdminCandleSyncView(APIView):
    permission_classes = (IsAuthenticated, IsAdminUser)

    def post(self, request, ticker):
        ticker = ticker.upper()
        market, api_ticker = _resolve_market(ticker)
        if not market:
            return Response({"detail": "Инструмент не найден."}, status=status.HTTP_404_NOT_FOUND)

        lock_key = f"candles:sync_lock:{ticker}"
        state_key = f"candles:sync_state:{ticker}"
        try:
            redis_client = cache.client.get_client()
        except Exception:
            return Response({"detail": "Кэш недоступен."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        ttl = getattr(settings, "CANDLES_SYNC_LOCK_TTL", 21600)
        acquired = redis_client.set(lock_key, "pending", nx=True, ex=ttl)
        if not acquired:
            existing = cache.get(state_key) or {}
            return Response(
                {"detail": "Синхронизация уже идёт.", "task_id": existing.get("task_id")},
                status=status.HTTP_409_CONFLICT,
            )

        start = request.data.get("start")
        end = request.data.get("end")

        task = sync_candles_for_instrument.apply_async(kwargs={
            "ticker": ticker,
            "market": market,
            "api_ticker": api_ticker,
            "start": start,
            "end": end,
            "triggered_by": request.user.id,
        })
        redis_client.set(lock_key, task.id, ex=ttl)
        return Response({"task_id": task.id, "ticker": ticker}, status=status.HTTP_202_ACCEPTED)
