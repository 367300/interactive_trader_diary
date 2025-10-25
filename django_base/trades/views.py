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
from .utils import calculate_trade_stats
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
        # Получаем только родительские сделки (открытия позиций)
        return Trade.objects.filter(
            user=self.request.user,
            parent_trade__isnull=True
        ).order_by('-trade_date')
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user
        
        # Статистика
        trades = Trade.objects.filter(user=user)
        context['total_trades'] = trades.filter(parent_trade__isnull=True).count()
        context['closed_trades'] = trades.filter(trade_type='CLOSE').count()
        context['open_trades'] = context['total_trades'] - context['closed_trades']
        
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
        
        if trade.trade_type == Trade.TradeType.OPEN:
            self.template_name = 'trades/main_trade_detail.html'
            # Получаем все связанные сделки (дочерние + главная) и сортируем по дате
            child_trades = list(trade.child_trades.all())
            child_trades.append(trade)  # Добавляем главную сделку
            child_trades.sort(key=lambda x: x.trade_date, reverse=True)  # Сортируем весь список по дате
            context['child_trades'] = child_trades
            # Добавляем агрегированную статистику
            context['trade_stats'] = calculate_trade_stats(trade)
        
        return context


@method_decorator(login_required, name='dispatch')
class TradeCreateView(CreateView):
    """Создание новой сделки"""
    model = Trade
    form_class = TradeForm
    template_name = 'trades/trade_form.html'
    success_url = reverse_lazy('trades:trade_list')
    
    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['user'] = self.request.user
        return kwargs
    
    def form_valid(self, form):
        form.instance.user = self.request.user
        trade = form.save()
        
        # Создаем анализ сделки, если заполнены поля
        analysis_data = form.cleaned_data.get('analysis')
        conclusions_data = form.cleaned_data.get('conclusions')
        emotional_state_data = form.cleaned_data.get('emotional_state')
        tags_data = form.cleaned_data.get('tags')
        
        if any([analysis_data, conclusions_data, emotional_state_data, tags_data]):
            TradeAnalysis.objects.create(
                trade=trade,
                analysis=analysis_data or '',
                conclusions=conclusions_data or '',
                emotional_state=emotional_state_data or '',
                tags=tags_data or [],
            )
        
        # Обрабатываем скриншоты
        screenshots = self.request.FILES.getlist('screenshots')
        descriptions = self.request.POST.getlist('screenshot_descriptions')
        
        for i, screenshot in enumerate(screenshots):
            description = descriptions[i] if i < len(descriptions) else ''
            TradeScreenshot.objects.create(
                trade=trade,
                image=screenshot,
                description=description
            )
        
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
    
    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['user'] = self.request.user
        return kwargs
    
    def get_initial(self):
        initial = super().get_initial()
        trade = self.get_object()
        
        try:
            analysis = trade.analysis
            initial.update({
                'analysis': analysis.analysis or '',
                'conclusions': analysis.conclusions or '',
                'emotional_state': analysis.emotional_state or '',
                'tags': ', '.join(analysis.tags) if analysis.tags else ''
            })
        except TradeAnalysis.DoesNotExist:
            pass
        
        return initial
    
    
    def form_valid(self, form):
        trade = form.save()
        
        # Обновляем или создаем анализ сделки
        analysis_data = form.cleaned_data.get('analysis')
        conclusions_data = form.cleaned_data.get('conclusions')
        emotional_state_data = form.cleaned_data.get('emotional_state')
        tags_data = form.cleaned_data.get('tags')
        
        if any([analysis_data, conclusions_data, emotional_state_data, tags_data]):
            analysis, created = TradeAnalysis.objects.get_or_create(
                trade=trade,
                defaults={
                    'analysis': analysis_data or '',
                    'conclusions': conclusions_data or '',
                    'emotional_state': emotional_state_data or '',
                    'tags': tags_data or [],
                }
            )
            if not created:
                # Обновляем существующий анализ
                analysis.analysis = analysis_data or ''
                analysis.conclusions = conclusions_data or ''
                analysis.emotional_state = emotional_state_data or ''
                analysis.tags = tags_data or []
                analysis.save()
        
        # Обрабатываем удаление существующих скриншотов
        delete_screenshots = self.request.POST.getlist('delete_screenshots')
        if delete_screenshots:
            TradeScreenshot.objects.filter(
                id__in=delete_screenshots,
                trade=trade
            ).delete()
        
        # Обновляем описания существующих скриншотов
        screenshot_descriptions = self.request.POST.getlist('screenshot_descriptions')
        screenshot_ids = self.request.POST.getlist('screenshot_id')
        
        # Создаем словарь для хранения описаний новых скриншотов
        new_screenshot_descriptions = {}
        
        for i, screenshot_id in enumerate(screenshot_ids):
            if screenshot_id and i < len(screenshot_descriptions):
                # Проверяем, является ли это новым скриншотом
                if screenshot_id.startswith('new_'):
                    new_screenshot_descriptions[screenshot_id] = screenshot_descriptions[i]
                else:
                    # Обновляем существующий скриншот
                    try:
                        screenshot = TradeScreenshot.objects.get(
                            id=screenshot_id,
                            trade=trade
                        )
                        screenshot.description = screenshot_descriptions[i]
                        screenshot.save()
                    except TradeScreenshot.DoesNotExist:
                        pass
        
        # Обрабатываем новые скриншоты
        screenshots = self.request.FILES.getlist('screenshots')
        
        for i, screenshot in enumerate(screenshots):
            # Ищем описание для этого скриншота по индексу
            description = ''
            for new_id, desc in new_screenshot_descriptions.items():
                # Проверяем по индексу в конце ID (точное совпадение)
                if f'_{i}' in new_id and new_id.endswith(f'_{i}'):
                    description = desc
                    break
            
            TradeScreenshot.objects.create(
                trade=trade,
                image=screenshot,
                description=description
            )
        
        messages.success(self.request, 'Сделка успешно обновлена!')
        return super().form_valid(form)
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['title'] = 'Редактирование сделки'
        context['button_text'] = 'Сохранить изменения'
        context['is_update'] = True
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
class TradeAverageView(CreateView):
    """Усреднение позиции"""
    model = Trade
    form_class = TradeForm
    template_name = 'trades/trade_form.html'
    
    def dispatch(self, request, *args, **kwargs):
        self.parent_trade = get_object_or_404(
            Trade,
            pk=self.kwargs['parent_id'],
            user=request.user
        )
        
        # Проверяем, что родительская сделка не закрыта
        if self.parent_trade.is_closed():
            return render(request, 'core/forbidden.html', {
                'message': 'Нельзя усреднить уже закрытую позицию!',
                'reason': 'Сделка уже закрыта и не может быть усреднена.',
                'back_url': reverse_lazy('trades:trade_list'),
                'back_text': 'Вернуться к списку сделок',
                'detail_url': reverse_lazy('trades:trade_detail', kwargs={'pk': self.parent_trade.pk}),
                'detail_text': 'Просмотр сделки'
            })
        
        return super().dispatch(request, *args, **kwargs)
    
    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['user'] = self.request.user
        kwargs['parent_trade'] = self.parent_trade
        return kwargs
    
    def get_initial(self):
        """Инициализация формы данными из родительской сделки"""
        initial = super().get_initial()
        
        # Копируем данные из родительской сделки
        initial['planned_stop_loss'] = self.parent_trade.planned_stop_loss
        initial['planned_take_profit'] = self.parent_trade.planned_take_profit
        initial['volume_from_capital'] = self.parent_trade.volume_from_capital
        
        # Копируем анализ из родительской сделки, если он существует
        try:
            parent_analysis = self.parent_trade.analysis
            # Сохраняем данные родительского анализа для JavaScript
            initial['parent_analysis'] = parent_analysis.analysis or ''
            initial['parent_conclusions'] = parent_analysis.conclusions or ''
            initial['parent_emotional_state'] = parent_analysis.emotional_state or ''
            initial['parent_tags'] = ', '.join(parent_analysis.tags) if parent_analysis.tags else ''
        except TradeAnalysis.DoesNotExist:
            initial['parent_analysis'] = ''
            initial['parent_conclusions'] = ''
            initial['parent_emotional_state'] = ''
            initial['parent_tags'] = ''
        
        return initial
    
    def form_valid(self, form):
        form.instance.user = self.request.user
        form.instance.parent_trade = self.parent_trade
        form.instance.trade_type = Trade.TradeType.AVERAGE
        form.instance.direction = self.parent_trade.direction
        form.instance.instrument = self.parent_trade.instrument
        form.instance.strategy = self.parent_trade.strategy
        form.instance.volume_from_capital = self.parent_trade.volume_from_capital
        trade = form.save()
        
        # Создаем анализ сделки, если заполнены поля
        analysis_data = form.cleaned_data.get('analysis')
        conclusions_data = form.cleaned_data.get('conclusions')
        emotional_state_data = form.cleaned_data.get('emotional_state')
        tags_data = form.cleaned_data.get('tags')
        
        if any([analysis_data, conclusions_data, emotional_state_data, tags_data]):
            TradeAnalysis.objects.create(
                trade=trade,
                analysis=analysis_data or '',
                conclusions=conclusions_data or '',
                emotional_state=emotional_state_data or '',
                tags=tags_data or []
            )
        
        # Обрабатываем скриншоты (новые для усреднения)
        screenshots = self.request.FILES.getlist('screenshots')
        descriptions = self.request.POST.getlist('screenshot_descriptions')
        
        for i, screenshot in enumerate(screenshots):
            description = descriptions[i] if i < len(descriptions) else ''
            TradeScreenshot.objects.create(
                trade=trade,
                image=screenshot,
                description=description
            )
        
        messages.success(self.request, 'Усреднение успешно добавлено!')
        return super().form_valid(form)
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['title'] = f'Усреднение позиции {self.parent_trade.instrument.ticker}'
        context['button_text'] = 'Добавить усреднение'
        context['parent_trade'] = self.parent_trade
        context['is_average'] = True
        return context
    
    def get_success_url(self):
        return reverse_lazy('trades:trade_detail', kwargs={'pk': self.parent_trade.pk})


@method_decorator(login_required, name='dispatch')
class TradeCloseView(CreateView):
    """Закрытие позиции"""
    model = Trade
    form_class = TradeForm
    template_name = 'trades/trade_form.html'
    
    def dispatch(self, request, *args, **kwargs):
        self.parent_trade = get_object_or_404(
            Trade,
            pk=self.kwargs['parent_id'],
            user=request.user
        )
        
        # Проверяем, что родительская сделка не закрыта
        if self.parent_trade.is_closed():
            return render(request, 'core/forbidden.html', {
                'message': 'Нельзя закрыть уже закрытую позицию!',
                'reason': 'Сделка уже закрыта и не может быть закрыта повторно.',
                'back_url': reverse_lazy('trades:trade_list'),
                'back_text': 'Вернуться к списку сделок',
                'detail_url': reverse_lazy('trades:trade_detail', kwargs={'pk': self.parent_trade.pk}),
                'detail_text': 'Просмотр сделки'
            })
        
        return super().dispatch(request, *args, **kwargs)
    
    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs['user'] = self.request.user
        kwargs['parent_trade'] = self.parent_trade
        return kwargs
    
    def get_initial(self):
        """Инициализация формы данными из родительской сделки"""
        initial = super().get_initial()
        
        # Копируем данные из родительской сделки
        initial['planned_stop_loss'] = self.parent_trade.planned_stop_loss
        initial['planned_take_profit'] = self.parent_trade.planned_take_profit
        initial['volume_from_capital'] = self.parent_trade.volume_from_capital

        # Копируем анализ из родительской сделки, если он существует
        try:
            parent_analysis = self.parent_trade.analysis
            # Сохраняем данные родительского анализа для JavaScript
            initial['parent_analysis'] = parent_analysis.analysis or ''
            initial['parent_conclusions'] = parent_analysis.conclusions or ''
            initial['parent_emotional_state'] = parent_analysis.emotional_state or ''
            initial['parent_tags'] = ', '.join(parent_analysis.tags) if parent_analysis.tags else ''
        except TradeAnalysis.DoesNotExist:
            initial['parent_analysis'] = ''
            initial['parent_conclusions'] = ''
            initial['parent_emotional_state'] = ''
            initial['parent_tags'] = ''
        
        return initial
    
    def form_valid(self, form):
        form.instance.user = self.request.user
        form.instance.parent_trade = self.parent_trade
        form.instance.trade_type = Trade.TradeType.CLOSE
        form.instance.direction = self.parent_trade.direction
        form.instance.instrument = self.parent_trade.instrument
        form.instance.strategy = self.parent_trade.strategy
        form.instance.volume_from_capital = self.parent_trade.volume_from_capital
        trade = form.save()
        
        # Создаем анализ сделки, если заполнены поля
        analysis_data = form.cleaned_data.get('analysis')
        conclusions_data = form.cleaned_data.get('conclusions')
        emotional_state_data = form.cleaned_data.get('emotional_state')
        tags_data = form.cleaned_data.get('tags')
        
        if any([analysis_data, conclusions_data, emotional_state_data, tags_data]):
            TradeAnalysis.objects.create(
                trade=trade,
                analysis=analysis_data or '',
                conclusions=conclusions_data or '',
                emotional_state=emotional_state_data or '',
                tags=tags_data or []
            )
        
        # Обрабатываем скриншоты (новые для закрытия)
        screenshots = self.request.FILES.getlist('screenshots')
        descriptions = self.request.POST.getlist('screenshot_descriptions')
        
        for i, screenshot in enumerate(screenshots):
            description = descriptions[i] if i < len(descriptions) else ''
            TradeScreenshot.objects.create(
                trade=trade,
                image=screenshot,
                description=description
            )
        
        messages.success(self.request, 'Позиция успешно закрыта!')
        return super().form_valid(form)
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['title'] = f'Закрытие позиции {self.parent_trade.instrument.ticker}'
        context['button_text'] = 'Закрыть позицию'
        context['parent_trade'] = self.parent_trade
        context['is_close'] = True
        return context
    
    def get_success_url(self):
        return reverse_lazy('trades:trade_detail', kwargs={'pk': self.parent_trade.pk})


@method_decorator(login_required, name='dispatch')
class TradeAnalyticsView(TemplateView):
    """Аналитика торговли"""
    template_name = 'trades/analytics.html'
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user
        
        # Базовая статистика
        trades = Trade.objects.filter(user=user)
        closed_trades = trades.filter(trade_type='CLOSE')
        
        # Общая статистика
        context['total_trades'] = trades.filter(parent_trade__isnull=True).count()
        context['closed_trades'] = trades.filter(trade_type='CLOSE').count()
        context['open_trades'] = trades.filter(
            trade_type='OPEN',
            child_trades__trade_type='CLOSE'
        ).distinct().count()
        
        # Статистика по стратегиям
        strategies_stats = []
        for strategy in TradingStrategy.objects.filter(user=user, is_active=True):
            strategy_trades = trades.filter(strategy=strategy, parent_trade__isnull=True)
            if strategy_trades.exists():
                strategies_stats.append({
                    'strategy': strategy,
                    'trades_count': strategy_trades.count(),
                })
        
        context['strategies_stats'] = strategies_stats
        
        # Статистика по инструментам
        instruments_stats = []
        for instrument in Instrument.objects.filter(is_active=True):
            instrument_trades = trades.filter(instrument=instrument, parent_trade__isnull=True)
            if instrument_trades.exists():
                instruments_stats.append({
                    'instrument': instrument,
                    'trades_count': instrument_trades.count(),
                })
        
        context['instruments_stats'] = instruments_stats
        
        return context


@login_required
@require_http_methods(["GET"])
def get_trades_chart_data(request):
    """AJAX endpoint для получения данных для графиков"""
    user = request.user
    
    # Данные для графика сделок по времени
    trades = Trade.objects.filter(user=user, parent_trade__isnull=True).order_by('trade_date')
    
    chart_data = {
        'dates': [],
        'trades_count': []
    }
    
    for trade in trades:
        chart_data['dates'].append(trade.trade_date.strftime('%Y-%m-%d'))
        chart_data['trades_count'].append(1)
    
        return JsonResponse(chart_data)

