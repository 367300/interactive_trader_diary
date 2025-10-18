from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.contrib.auth import login, logout
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.utils.decorators import method_decorator
from django.views.generic import TemplateView
from django.db.models import Sum, Count, Avg
from trades.models import Trade
from strategies.models import TradingStrategy
from accounts.models import TraderProfile


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
        
        # Статистика по сделкам
        trades = Trade.objects.filter(user=user)
        total_trades = trades.count()
        
        # Закрытые сделки
        closed_trades = trades.filter(is_closed=True)
        closed_count = closed_trades.count()
        
        # Открытые позиции
        open_trades = trades.filter(is_closed=False)
        open_count = open_trades.count()
        
        # Прибыль/убыток
        total_pnl = closed_trades.aggregate(
            total=Sum('actual_result_rub')
        )['total'] or 0
        
        # Win rate
        winning_trades = closed_trades.filter(actual_result_rub__gt=0).count()
        win_rate = (winning_trades / closed_count * 100) if closed_count > 0 else 0
        
        # Средняя сделка
        avg_trade = closed_trades.aggregate(
            avg=Avg('actual_result_rub')
        )['avg'] or 0
        
        # Стратегии
        strategies = TradingStrategy.objects.filter(user=user, is_active=True)
        
        # Последние сделки
        recent_trades = trades.order_by('-trade_date')[:5]
        
        context.update({
            'profile': profile,
            'total_trades': total_trades,
            'closed_trades': closed_count,
            'open_trades': open_count,
            'total_pnl': total_pnl,
            'win_rate': win_rate,
            'avg_trade': avg_trade,
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
    """AJAX endpoint для получения статистики дашборда"""
    user = request.user
    
    # Получаем статистику за последние 30 дней
    from datetime import datetime, timedelta
    thirty_days_ago = datetime.now() - timedelta(days=30)
    
    recent_trades = Trade.objects.filter(
        user=user,
        trade_date__gte=thirty_days_ago,
        is_closed=True
    )
    
    stats = {
        'trades_count': recent_trades.count(),
        'total_pnl': float(recent_trades.aggregate(
            total=Sum('actual_result_rub')
        )['total'] or 0),
        'win_rate': 0,
        'avg_trade': float(recent_trades.aggregate(
            avg=Avg('actual_result_rub')
        )['avg'] or 0),
    }
    
    # Win rate
    winning_trades = recent_trades.filter(actual_result_rub__gt=0).count()
    if recent_trades.count() > 0:
        stats['win_rate'] = round(winning_trades / recent_trades.count() * 100, 2)
    
    return JsonResponse(stats)