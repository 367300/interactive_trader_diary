from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.utils.decorators import method_decorator
from django.views.generic import ListView, DetailView, CreateView, UpdateView, DeleteView
from django.urls import reverse_lazy
from django.db.models import Count, Sum, Q
from .models import TradingStrategy
from .forms import TradingStrategyForm
from trades.models import Trade


@method_decorator(login_required, name='dispatch')
class TradingStrategyListView(ListView):
    """Список торговых стратегий пользователя"""
    model = TradingStrategy
    template_name = 'strategies/strategy_list.html'
    context_object_name = 'strategies'
    paginate_by = 10
    
    def get_queryset(self):
        return TradingStrategy.objects.filter(user=self.request.user).order_by('-created_at')
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user
        
        # Статистика по стратегиям
        strategies = TradingStrategy.objects.filter(user=user)
        context['total_strategies'] = strategies.count()
        context['active_strategies'] = strategies.filter(is_active=True).count()
        
        # Добавляем статистику по сделкам для каждой стратегии
        for strategy in context['strategies']:
            strategy_trades = Trade.objects.filter(user=user, strategy=strategy)
            strategy.closed_trades_count = strategy_trades.filter(is_closed=True).count()
            strategy.total_pnl = strategy_trades.filter(is_closed=True).aggregate(
                total=Sum('actual_result_rub')
            )['total'] or 0
        
        return context


@method_decorator(login_required, name='dispatch')
class TradingStrategyDetailView(DetailView):
    """Детальная информация о стратегии"""
    model = TradingStrategy
    template_name = 'strategies/strategy_detail.html'
    context_object_name = 'strategy'
    
    def get_queryset(self):
        return TradingStrategy.objects.filter(user=self.request.user)
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        strategy = self.get_object()
        user = self.request.user
        
        # Статистика по сделкам этой стратегии
        trades = Trade.objects.filter(user=user, strategy=strategy)
        closed_trades = trades.filter(is_closed=True)
        
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
            avg=Sum('actual_result_rub') / Count('id')
        )['avg'] or 0
        
        # Последние сделки
        context['recent_trades'] = trades.order_by('-trade_date')[:5]
        
        return context


@method_decorator(login_required, name='dispatch')
class TradingStrategyCreateView(CreateView):
    """Создание новой торговой стратегии"""
    model = TradingStrategy
    form_class = TradingStrategyForm
    template_name = 'strategies/strategy_form.html'
    success_url = reverse_lazy('strategies:strategy_list')
    
    def form_valid(self, form):
        form.instance.user = self.request.user
        messages.success(self.request, 'Стратегия успешно создана!')
        return super().form_valid(form)
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['title'] = 'Новая стратегия'
        context['button_text'] = 'Создать стратегию'
        return context


@method_decorator(login_required, name='dispatch')
class TradingStrategyUpdateView(UpdateView):
    """Редактирование торговой стратегии"""
    model = TradingStrategy
    form_class = TradingStrategyForm
    template_name = 'strategies/strategy_form.html'
    success_url = reverse_lazy('strategies:strategy_list')
    
    def get_queryset(self):
        return TradingStrategy.objects.filter(user=self.request.user)
    
    def form_valid(self, form):
        messages.success(self.request, 'Стратегия успешно обновлена!')
        return super().form_valid(form)
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['title'] = 'Редактирование стратегии'
        context['button_text'] = 'Сохранить изменения'
        return context


@method_decorator(login_required, name='dispatch')
class TradingStrategyDeleteView(DeleteView):
    """Удаление торговой стратегии"""
    model = TradingStrategy
    template_name = 'strategies/strategy_confirm_delete.html'
    success_url = reverse_lazy('strategies:strategy_list')
    
    def get_queryset(self):
        return TradingStrategy.objects.filter(user=self.request.user)
    
    def delete(self, request, *args, **kwargs):
        strategy = self.get_object()
        
        # Проверяем, есть ли сделки с этой стратегией
        trades_count = Trade.objects.filter(user=request.user, strategy=strategy).count()
        
        if trades_count > 0:
            messages.error(
                request, 
                f'Нельзя удалить стратегию, так как с ней связано {trades_count} сделок. '
                'Сначала удалите или переназначьте сделки.'
            )
            return redirect('strategies:strategy_detail', pk=strategy.pk)
        
        messages.success(request, 'Стратегия успешно удалена!')
        return super().delete(request, *args, **kwargs)