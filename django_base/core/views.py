from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth import login, logout
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.utils.decorators import method_decorator
from django.views.generic import TemplateView, View
from django.db.models import Sum, Count, Avg
from trades.models import Trade
from trades.utils import calculate_user_aggregate_stats, annotate_recent_trades_with_pips
from strategies.models import TradingStrategy
from accounts.models import TraderProfile
from instruments.tasks import load_instruments_from_moex_task


class IndexView(TemplateView):
    """Главная страница - лендинг для неавторизованных пользователей"""
    template_name = 'core/index.html'
    
    def dispatch(self, request, *args, **kwargs):
        # Если пользователь авторизован, перенаправляем на дашборд
        if request.user.is_authenticated:
            return redirect('core:dashboard')
        return super().dispatch(request, *args, **kwargs)


@method_decorator(login_required, name='dispatch')
class DashboardView(TemplateView):
    """Дашборд для авторизованных пользователей"""
    template_name = 'core/dashboard.html'
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user
        
        # Получаем профиль пользователя
        try:
            profile = user.trader_profile
        except TraderProfile.DoesNotExist:
            profile = TraderProfile.objects.create(user=user)
        
        # Агрегированная статистика по сделкам (включая P&L в пипсах, win rate, avg)
        agg = calculate_user_aggregate_stats(user)

        # Стратегии
        strategies = TradingStrategy.objects.filter(user=user, is_active=True)

        # Последние сделки — берём родительские (исключаем закрытия/усреднения как дубли)
        recent_trades = (
            Trade.objects
            .filter(user=user, parent_trade__isnull=True)
            .select_related('instrument', 'strategy')
            .prefetch_related('child_trades')
            .order_by('-trade_date')[:5]
        )
        annotate_recent_trades_with_pips(recent_trades)

        context.update({
            'profile': profile,
            'total_trades': agg['total_trades'],
            'closed_trades': agg['closed_trades'],
            'open_trades': agg['open_trades'],
            'total_pnl': agg['total_pnl_pips'],
            'total_pnl_pips': agg['total_pnl_pips'],
            'win_rate': agg['win_rate'],
            'avg_trade': agg['avg_trade_pips'],
            'avg_trade_pips': agg['avg_trade_pips'],
            'win_count': agg['win_count'],
            'loss_count': agg['loss_count'],
            'strategies': strategies,
            'recent_trades': recent_trades,
        })

        return context


class AboutView(TemplateView):
    """Страница о проекте"""
    template_name = 'core/about.html'


class HelpView(TemplateView):
    """Страница помощи"""
    template_name = 'core/help.html'


@login_required
@require_http_methods(["GET"])
def get_dashboard_stats(request):
    """AJAX endpoint для получения статистики дашборда (P&L в пипсах)."""
    agg = calculate_user_aggregate_stats(request.user)
    stats = {
        'trades_count': agg['total_trades'],
        'closed_trades': agg['closed_trades'],
        'open_trades': agg['open_trades'],
        'total_pnl_pips': round(agg['total_pnl_pips'], 2),
        'win_rate': round(agg['win_rate'], 1),
        'avg_trade_pips': round(agg['avg_trade_pips'], 2),
    }
    return JsonResponse(stats)


@method_decorator(login_required, name='dispatch')
@method_decorator(user_passes_test(lambda u: u.is_staff), name='dispatch')
class AdminInstrumentsLoadView(View):
    """
    Страница для администраторов с запуском фоновой задачи загрузки инструментов.
    """

    template_name = 'core/admin_instruments_load.html'

    def get(self, request):
        return render(request, self.template_name)

    def post(self, request):
        instrument_type = request.POST.get('instrument_type', 'STOCK')
        update_existing = bool(request.POST.get('update_existing'))
        limit_raw = request.POST.get('limit') or None

        limit = None
        if limit_raw:
            try:
                limit = int(limit_raw)
            except (TypeError, ValueError):
                messages.warning(
                    request,
                    'Некорректное значение для ограничения количества. Игнорируется.',
                )

        task = load_instruments_from_moex_task.delay(
            instrument_type=instrument_type,
            update_existing=update_existing,
            limit=limit,
        )

        messages.success(
            request,
            f'Задача на загрузку инструментов поставлена в очередь Celery (ID: {task.id}).',
        )

        return redirect('core:admin_instruments_load')
