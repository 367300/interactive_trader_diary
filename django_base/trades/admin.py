from django.contrib import admin
from .models import Trade, TradeAnalysis, TradeScreenshot, MarketContext


class TradeAnalysisInline(admin.StackedInline):
    model = TradeAnalysis
    extra = 0
    fields = ('entry_reason', 'exit_reason', 'analysis', 'conclusions', 'emotional_state', 'tags')


class TradeScreenshotInline(admin.TabularInline):
    model = TradeScreenshot
    extra = 0
    fields = ('image', 'description')


class MarketContextInline(admin.StackedInline):
    model = MarketContext
    extra = 0
    fields = ('moex_index_value', 'market_data_json', 'collected_at')
    classes = ('collapse',)


@admin.register(Trade)
class TradeAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'user', 'instrument', 'trade_date', 'direction', 
        'entry_price', 'exit_price', 'quantity', 'actual_result_rub', 'is_closed'
    )
    list_filter = (
        'direction', 'trading_session', 'is_closed', 'strategy__strategy_type',
        'instrument__instrument_type', 'trade_date', 'created_at'
    )
    search_fields = (
        'instrument__ticker', 'instrument__name', 'user__username', 
        'strategy__name', 'id'
    )
    readonly_fields = ('id', 'created_at', 'updated_at')
    date_hierarchy = 'trade_date'
    inlines = [TradeAnalysisInline, TradeScreenshotInline, MarketContextInline]
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('id', 'user', 'strategy', 'instrument', 'trade_date', 'trading_session')
        }),
        ('Параметры сделки', {
            'fields': (
                'direction', 'entry_price', 'exit_price', 'quantity', 
                'leverage', 'commission'
            )
        }),
        ('Планирование', {
            'fields': ('planned_stop_loss', 'planned_take_profit'),
            'classes': ('collapse',)
        }),
        ('Результаты', {
            'fields': ('actual_result_points', 'actual_result_rub', 'is_closed')
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def get_queryset(self, request):
        """Фильтруем сделки по пользователю для обычных админов"""
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(user=request.user)


@admin.register(TradeAnalysis)
class TradeAnalysisAdmin(admin.ModelAdmin):
    list_display = ('trade', 'emotional_state', 'created_at')
    list_filter = ('emotional_state', 'created_at')
    search_fields = ('trade__instrument__ticker', 'entry_reason', 'analysis')
    readonly_fields = ('created_at', 'updated_at')
    
    fieldsets = (
        ('Связь', {
            'fields': ('trade',)
        }),
        ('Анализ сделки', {
            'fields': ('entry_reason', 'exit_reason', 'analysis', 'conclusions')
        }),
        ('Эмоциональное состояние', {
            'fields': ('emotional_state', 'tags')
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(TradeScreenshot)
class TradeScreenshotAdmin(admin.ModelAdmin):
    list_display = ('trade', 'description', 'uploaded_at')
    list_filter = ('uploaded_at',)
    search_fields = ('trade__instrument__ticker', 'description')
    readonly_fields = ('uploaded_at',)


@admin.register(MarketContext)
class MarketContextAdmin(admin.ModelAdmin):
    list_display = ('trade', 'moex_index_value', 'collected_at', 'created_at')
    list_filter = ('collected_at', 'created_at')
    search_fields = ('trade__instrument__ticker',)
    readonly_fields = ('created_at', 'updated_at')
    
    fieldsets = (
        ('Связь', {
            'fields': ('trade',)
        }),
        ('Данные рынка', {
            'fields': ('moex_index_value', 'market_data_json', 'collected_at')
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )