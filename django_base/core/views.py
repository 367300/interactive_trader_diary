import logging
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from django.views.generic import TemplateView
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from instruments.tasks import load_all_candles, load_instruments_from_moex_task
from strategies.models import TradingStrategy
from trades.models import Trade
from trades.serializers import TradeListSerializer
from trades.utils import (
    annotate_recent_trades_with_pips,
    calculate_user_aggregate_stats,
)

logger = logging.getLogger(__name__)


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

    def _dest(self):
        base = Path(getattr(settings, 'MEDIA_ROOT', ''))
        if not base.is_absolute():
            base = Path(settings.BASE_DIR).parent / 'uploads'
        return base / 'data_instruments' / 'moex_stocks_enriched.csv'

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

        dest = self._dest()
        try:
            dest.parent.mkdir(parents=True, exist_ok=True)
            with open(dest, 'wb') as f:
                for chunk in file.chunks():
                    f.write(chunk)
        except OSError as e:
            return Response(
                {'detail': f'Ошибка записи: {e}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {'detail': f'Файл сохранён ({file.size} байт).'},
            status=status.HTTP_200_OK,
        )


class AdminCandlesLoadView(APIView):
    """Trigger bulk candle download from MOEX for all active stocks."""

    permission_classes = (IsAuthenticated, IsAdminUser)

    def post(self, request):
        year_raw = request.data.get("year")
        from datetime import date

        year = date.today().year
        if year_raw is not None:
            try:
                year = int(year_raw)
                if year < 2011 or year > date.today().year:
                    raise ValueError
            except (TypeError, ValueError):
                return Response(
                    {"detail": "Некорректный год (допустимо: 2011 — текущий)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        task = load_all_candles.delay(year=year)
        return Response(
            {
                "task_id": task.id,
                "message": f"Загрузка котировок за {year} год поставлена в очередь.",
            },
            status=status.HTTP_202_ACCEPTED,
        )


class AdminFlushCacheView(APIView):
    """Сброс всего кэша проекта (Redis)."""

    permission_classes = (IsAuthenticated, IsAdminUser)

    def post(self, request):
        cleared = []

        try:
            cache.clear()
            cleared.append("Redis-кэш Django (свечи, сессии, прочее)")
        except Exception as e:
            logger.exception("Ошибка очистки Redis-кэша")
            return Response(
                {"detail": f"Ошибка очистки Redis: {e}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "detail": "Кэш успешно сброшен.",
                "cleared": cleared,
            },
            status=status.HTTP_200_OK,
        )
