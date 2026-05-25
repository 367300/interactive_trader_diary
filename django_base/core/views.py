from pathlib import Path

from django.conf import settings
from django.views.generic import TemplateView
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from instruments.tasks import load_instruments_from_moex_task
from strategies.models import TradingStrategy
from trades.models import Trade
from trades.serializers import TradeListSerializer
from trades.utils import (
    annotate_recent_trades_with_pips,
    calculate_user_aggregate_stats,
)


class PublicTemplateView(TemplateView):
    """Публичный шаблон с пробросом frontend_url для ссылок на SPA."""

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['frontend_url'] = getattr(settings, 'FRONTEND_URL', '')
        return context


class IndexView(PublicTemplateView):
    template_name = 'core/index.html'


class AboutView(PublicTemplateView):
    template_name = 'core/about.html'


class HelpView(PublicTemplateView):
    template_name = 'core/help.html'


class DashboardView(APIView):
    """Сводка для главной страницы авторизованного пользователя."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        user = request.user
        agg = calculate_user_aggregate_stats(user)

        recent = list(
            Trade.objects.filter(user=user, parent_trade__isnull=True)
            .select_related('instrument', 'strategy')
            .prefetch_related('child_trades')
            .order_by('-trade_date')[:5]
        )
        annotate_recent_trades_with_pips(recent)

        strategies = TradingStrategy.objects.filter(user=user, is_active=True).values(
            'id', 'name', 'strategy_type', 'instruments'
        )

        return Response(
            {
                'aggregate': agg,
                'recent_trades': TradeListSerializer(
                    recent, many=True, context={'request': request}
                ).data,
                'active_strategies': list(strategies),
            }
        )


class AdminInstrumentsLoadView(APIView):
    """Запуск Celery-задачи загрузки инструментов с Мосбиржи."""

    permission_classes = (IsAuthenticated, IsAdminUser)

    def post(self, request):
        instrument_type = request.data.get('instrument_type', 'STOCK')
        update_existing = bool(request.data.get('update_existing'))
        limit_raw = request.data.get('limit')

        limit = None
        if limit_raw not in (None, ''):
            try:
                limit = int(limit_raw)
            except (TypeError, ValueError):
                return Response(
                    {'detail': 'Некорректное значение для ограничения количества.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        task = load_instruments_from_moex_task.delay(
            instrument_type=instrument_type,
            update_existing=update_existing,
            limit=limit,
        )
        return Response(
            {
                'task_id': task.id,
                'message': 'Задача поставлена в очередь Celery.',
            },
            status=status.HTTP_202_ACCEPTED,
        )


class AdminUploadEnrichmentCSVView(APIView):
    """Загрузка CSV-файла обогащения инструментов."""

    permission_classes = (IsAuthenticated, IsAdminUser)
    parser_classes = (MultiPartParser,)

    DEST = Path(settings.BASE_DIR).parent / 'uploads' / 'data_instruments' / 'moex_stocks_enriched.csv'

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response(
                {'detail': 'Файл не передан.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not file.name.endswith('.csv'):
            return Response(
                {'detail': 'Допустимы только .csv файлы.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        self.DEST.parent.mkdir(parents=True, exist_ok=True)
        with open(self.DEST, 'wb') as dest:
            for chunk in file.chunks():
                dest.write(chunk)

        return Response(
            {'detail': f'Файл сохранён ({file.size} байт).'},
            status=status.HTTP_200_OK,
        )
