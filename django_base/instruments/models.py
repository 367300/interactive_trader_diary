from django.db import models


class Instrument(models.Model):
    """Справочник торговых инструментов российского рынка"""
    
    class InstrumentType(models.TextChoices):
        STOCK = 'STOCK', 'Акция'
        FUTURES = 'FUTURES', 'Фьючерс'
    
    ticker = models.CharField(
        max_length=50,
        unique=True,
        verbose_name='Тикер'
    )
    
    name = models.CharField(
        max_length=200,
        verbose_name='Полное название'
    )
    
    instrument_type = models.CharField(
        max_length=20,
        choices=InstrumentType.choices,
        verbose_name='Тип инструмента'
    )
    
    sector = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Сектор экономики'
    )
    
    lot_size = models.PositiveIntegerField(
        default=1,
        verbose_name='Размер лота'
    )
    
    min_price_step = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        verbose_name='Минимальный шаг цены'
    )
    
    currency = models.CharField(
        max_length=3,
        default='RUB',
        verbose_name='Валюта'
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name='Активен'
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
        verbose_name = 'Торговый инструмент'
        verbose_name_plural = 'Торговые инструменты'
        db_table = 'instruments_instrument'
        ordering = ['ticker']
    
    def __str__(self):
        return f'{self.ticker} - {self.name}'