from django.contrib import admin
from .models import TradingStrategy


@admin.register(TradingStrategy)
class TradingStrategyAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'strategy_type', 'instruments', 'is_active', 'created_at')
    list_filter = ('strategy_type', 'instruments', 'is_active', 'created_at')
    search_fields = ('name', 'description', 'user__username')
    readonly_fields = ('created_at', 'updated_at')
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('user', 'name', 'description')
        }),
        ('Настройки стратегии', {
            'fields': ('strategy_type', 'instruments', 'is_active')
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def get_queryset(self, request):
        """Фильтруем стратегии по пользователю для обычных админов"""
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        return qs.filter(user=request.user)