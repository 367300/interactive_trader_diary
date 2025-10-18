from django.db import models
from django.contrib.auth.models import User


class TradingStrategy(models.Model):
    """Торговые стратегии трейдера"""
    
    class StrategyType(models.TextChoices):
        SCALPING = 'SCALPING', 'Скальпинг'
        DAY_TRADING = 'DAY_TRADING', 'Дневная торговля'
        SWING = 'SWING', 'Свинг-торговля'
        POSITION = 'POSITION', 'Позиционная торговля'
    
    class InstrumentType(models.TextChoices):
        STOCKS = 'STOCKS', 'Акции'
        FUTURES = 'FUTURES', 'Фьючерсы'
        BOTH = 'BOTH', 'Акции и фьючерсы'
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='trading_strategies',
        verbose_name='Трейдер'
    )
    
    name = models.CharField(
        max_length=200,
        verbose_name='Название стратегии'
    )
    
    description = models.TextField(
        blank=True,
        verbose_name='Описание стратегии'
    )
    
    strategy_type = models.CharField(
        max_length=20,
        choices=StrategyType.choices,
        verbose_name='Тип стратегии'
    )
    
    instruments = models.CharField(
        max_length=20,
        choices=InstrumentType.choices,
        default=InstrumentType.BOTH,
        verbose_name='Типы инструментов'
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name='Активна'
    )
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания'
    )
    
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='Дата обновления'
    )
    
    class Meta:
        verbose_name = 'Торговая стратегия'
        verbose_name_plural = 'Торговые стратегии'
        db_table = 'strategies_trading_strategy'
        ordering = ['-created_at']
    
    def __str__(self):
        return f'{self.name} ({self.get_strategy_type_display()})'