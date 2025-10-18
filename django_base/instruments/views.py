from django.shortcuts import render
from django.utils.decorators import method_decorator
from django.views.generic import ListView, TemplateView
from django.contrib.auth.decorators import login_required
from django.db.models import Count, Q
from .models import Instrument
from trades.models import Trade


@method_decorator(login_required, name='dispatch')
class InstrumentListView(ListView):
    """Список торговых инструментов"""
    model = Instrument
    template_name = 'instruments/instrument_list.html'
    context_object_name = 'instruments'
    paginate_by = 20
    
    def get_queryset(self):
        return Instrument.objects.filter(is_active=True).order_by('ticker')
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user
        
        # Создаем новый QuerySet с самого начала
        instruments = Instrument.objects.filter(is_active=True)
        
        # Фильтрация по типу
        instrument_type = self.request.GET.get('type')
        if instrument_type:
            instruments = instruments.filter(instrument_type=instrument_type)
        
        # Поиск
        search = self.request.GET.get('search')
        if search:
            instruments = instruments.filter(
                Q(ticker__icontains=search) | Q(name__icontains=search)
            )
        
        # Сортируем
        instruments = instruments.order_by('ticker')
        
        # Статистика по инструментам
        context['total_instruments'] = instruments.count()
        
        # Добавляем статистику по сделкам для каждого инструмента
        for instrument in instruments:
            instrument_trades = Trade.objects.filter(user=user, instrument=instrument)
            instrument.trades_count = instrument_trades.count()
            instrument.closed_trades_count = instrument_trades.filter(is_closed=True).count()
        
        context['instruments'] = instruments
        context['current_filter'] = instrument_type
        context['current_search'] = search
        
        return context


@method_decorator(login_required, name='dispatch')
class InstrumentStatsView(TemplateView):
    """Статистика по инструментам"""
    template_name = 'instruments/instrument_stats.html'
    
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user
        
        # Топ-10 инструментов по количеству сделок
        top_instruments = Instrument.objects.filter(
            is_active=True,
            trades__user=user
        ).annotate(
            trades_count=Count('trades'),
            closed_trades_count=Count('trades', filter=Q(trades__is_closed=True))
        ).order_by('-trades_count')[:10]
        
        context['top_instruments'] = top_instruments
        
        # Статистика по типам инструментов
        instrument_types = []
        for inst_type, display_name in Instrument.InstrumentType.choices:
            count = Instrument.objects.filter(
                is_active=True,
                instrument_type=inst_type,
                trades__user=user
            ).count()
            if count > 0:
                instrument_types.append({
                    'type': inst_type,
                    'display_name': display_name,
                    'count': count
                })
        
        context['instrument_types'] = instrument_types
        
        return context