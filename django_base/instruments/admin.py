from django.contrib import admin
from .models import Instrument


@admin.register(Instrument)
class InstrumentAdmin(admin.ModelAdmin):
    list_display = ('ticker', 'name', 'instrument_type', 'sector', 'lot_size', 'min_price_step', 'is_active')
    list_filter = ('instrument_type', 'sector', 'is_active', 'created_at')
    search_fields = ('ticker', 'name', 'sector')
    readonly_fields = ('created_at', 'updated_at')
    ordering = ('ticker',)
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('ticker', 'name', 'instrument_type', 'sector')
        }),
        ('Торговые параметры', {
            'fields': ('lot_size', 'min_price_step', 'currency', 'is_active')
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )