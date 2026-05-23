from django.db.models import Count, Prefetch, Q
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

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
