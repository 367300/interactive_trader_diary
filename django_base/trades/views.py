from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.utils.decorators import method_decorator
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView, TemplateView
from django.urls import reverse_lazy
from django.db.models import Sum, Count, Avg, Q
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from .models import Trade, TradeAnalysis, TradeScreenshot, MarketContext
from .forms import TradeForm, TradeAnalysisForm
from strategies.models import TradingStrategy
from instruments.models import Instrument


@method_decorator(login_required, name='dispatch')
class TradeListView(ListView):
    """Список сделок пользователя"""
    model = Trade
    template_name = 'trades/trade_list.html'
    context_object_name = 'trades'
    paginate_by = 20
    
    def get_queryset(self):
        return Trade.objects.filter(user=self.request.user).order_by('-trade_date')
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user
        
        # Статистика
        trades = Trade.objects.filter(user=user)
        context['total_trades'] = trades.count()
        context['closed_trades'] = trades.filter(is_closed=True).count()
        context['open_trades'] = trades.filter(is_closed=False).count()
        
        # P&L
        closed_trades = trades.filter(is_closed=True)
        context['total_pnl'] = closed_trades.aggregate(
            total=Sum('actual_result_rub')
        )['total'] or 0
        
        # Win rate
        winning_trades = closed_trades.filter(actual_result_rub__gt=0).count()
        context['win_rate'] = (winning_trades / closed_trades.count() * 100) if closed_trades.count() > 0 else 0
        
        # Фильтры
        context['strategies'] = TradingStrategy.objects.filter(user=user, is_active=True)
        context['instruments'] = Instrument.objects.filter(is_active=True)
        
        return context


@method_decorator(login_required, name='dispatch')
class TradeDetailView(DetailView):
    """Детальная информация о сделке"""
    model = Trade
    template_name = 'trades/trade_detail.html'
    context_object_name = 'trade'
    
    def get_queryset(self):
        return Trade.objects.filter(user=self.request.user)
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        trade = self.get_object()
        
        # Получаем связанные данные
        try:
            context['analysis'] = trade.analysis
        except TradeAnalysis.DoesNotExist:
            context['analysis'] = None
        
        try:
            context['market_context'] = trade.market_context
        except MarketContext.DoesNotExist:
            context['market_context'] = None
        
        context['screenshots'] = trade.screenshots.all()
        
        return context


@method_decorator(login_required, name='dispatch')
class TradeCreateView(CreateView):
    """Создание новой сделки"""
    model = Trade
    form_class = TradeForm
    template_name = 'trades/trade_form.html'
    success_url = reverse_lazy('trades:trade_list')
    
    def form_valid(self, form):
        form.instance.user = self.request.user
        messages.success(self.request, 'Сделка успешно создана!')
        return super().form_valid(form)
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['title'] = 'Новая сделка'
        context['button_text'] = 'Создать сделку'
        return context


@method_decorator(login_required, name='dispatch')
class TradeUpdateView(UpdateView):
    """Редактирование сделки"""
    model = Trade
    form_class = TradeForm
    template_name = 'trades/trade_form.html'
    success_url = reverse_lazy('trades:trade_list')
    
    def get_queryset(self):
        return Trade.objects.filter(user=self.request.user)
    
    def form_valid(self, form):
        messages.success(self.request, 'Сделка успешно обновлена!')
        return super().form_valid(form)
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['title'] = 'Редактирование сделки'
        context['button_text'] = 'Сохранить изменения'
        return context


@method_decorator(login_required, name='dispatch')
class TradeDeleteView(DeleteView):
    """Удаление сделки"""
    model = Trade
    template_name = 'trades/trade_confirm_delete.html'
    success_url = reverse_lazy('trades:trade_list')
    
    def get_queryset(self):
        return Trade.objects.filter(user=self.request.user)
    
    def delete(self, request, *args, **kwargs):
        messages.success(request, 'Сделка успешно удалена!')
        return super().delete(request, *args, **kwargs)


@method_decorator(login_required, name='dispatch')
class TradeAnalyticsView(TemplateView):
    """Аналитика торговли"""
    template_name = 'trades/analytics.html'
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user
        
        # Базовая статистика
        trades = Trade.objects.filter(user=user)
        closed_trades = trades.filter(is_closed=True)
        
        # Общая статистика
        context['total_trades'] = trades.count()
        context['closed_trades'] = closed_trades.count()
        context['open_trades'] = trades.filter(is_closed=False).count()
        
        # P&L
        context['total_pnl'] = closed_trades.aggregate(
            total=Sum('actual_result_rub')
        )['total'] or 0
        
        # Win rate
        winning_trades = closed_trades.filter(actual_result_rub__gt=0).count()
        context['win_rate'] = (winning_trades / closed_trades.count() * 100) if closed_trades.count() > 0 else 0
        
        # Средняя сделка
        context['avg_trade'] = closed_trades.aggregate(
            avg=Avg('actual_result_rub')
        )['avg'] or 0
        
        # Статистика по стратегиям
        strategies_stats = []
        for strategy in TradingStrategy.objects.filter(user=user, is_active=True):
            strategy_trades = closed_trades.filter(strategy=strategy)
            if strategy_trades.exists():
                strategies_stats.append({
                    'strategy': strategy,
                    'trades_count': strategy_trades.count(),
                    'total_pnl': strategy_trades.aggregate(total=Sum('actual_result_rub'))['total'] or 0,
                    'win_rate': (strategy_trades.filter(actual_result_rub__gt=0).count() / strategy_trades.count() * 100)
                })
        
        context['strategies_stats'] = strategies_stats
        
        # Статистика по инструментам
        instruments_stats = []
        for instrument in Instrument.objects.filter(is_active=True):
            instrument_trades = closed_trades.filter(instrument=instrument)
            if instrument_trades.exists():
                instruments_stats.append({
                    'instrument': instrument,
                    'trades_count': instrument_trades.count(),
                    'total_pnl': instrument_trades.aggregate(total=Sum('actual_result_rub'))['total'] or 0,
                    'win_rate': (instrument_trades.filter(actual_result_rub__gt=0).count() / instrument_trades.count() * 100)
                })
        
        context['instruments_stats'] = instruments_stats
        
        return context


@login_required
@require_http_methods(["GET"])
def get_trades_chart_data(request):
    """AJAX endpoint для получения данных для графиков"""
    user = request.user
    
    # Данные для графика P&L по времени
    trades = Trade.objects.filter(user=user, is_closed=True).order_by('trade_date')
    
    chart_data = {
        'dates': [],
        'pnl': [],
        'cumulative_pnl': []
    }
    
    cumulative_pnl = 0
    for trade in trades:
        chart_data['dates'].append(trade.trade_date.strftime('%Y-%m-%d'))
        pnl = float(trade.actual_result_rub or 0)
        chart_data['pnl'].append(pnl)
        cumulative_pnl += pnl
        chart_data['cumulative_pnl'].append(cumulative_pnl)
    
    return JsonResponse(chart_data)