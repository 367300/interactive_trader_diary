import uuid
from django.db import models
from django.contrib.auth.models import User
from instruments.models import Instrument
from strategies.models import TradingStrategy


class Trade(models.Model):
    """Основная модель торговых сделок"""
    
    class TradingSession(models.TextChoices):
        OPENING = 'OPENING', 'Утренняя сессия'
        LUNCH = 'LUNCH', 'Обеденная сессия'
        EVENING = 'EVENING', 'Вечерняя сессия'
        CLOSING = 'CLOSING', 'Закрытие'
    
    class Direction(models.TextChoices):
        LONG = 'LONG', 'Длинная позиция'
        SHORT = 'SHORT', 'Короткая позиция'
    
    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
        verbose_name='ID сделки'
    )
    
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='trades',
        verbose_name='Трейдер'
    )
    
    strategy = models.ForeignKey(
        TradingStrategy,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='trades',
        verbose_name='Стратегия'
    )
    
    instrument = models.ForeignKey(
        Instrument,
        on_delete=models.CASCADE,
        related_name='trades',
        verbose_name='Инструмент'
    )
    
    trade_date = models.DateTimeField(
        verbose_name='Дата и время сделки'
    )
    
    trading_session = models.CharField(
        max_length=20,
        choices=TradingSession.choices,
        verbose_name='Торговая сессия'
    )
    
    direction = models.CharField(
        max_length=10,
        choices=Direction.choices,
        verbose_name='Направление'
    )
    
    entry_price = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        verbose_name='Цена входа'
    )
    
    exit_price = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Цена выхода'
    )
    
    quantity = models.PositiveIntegerField(
        verbose_name='Количество'
    )
    
    leverage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=1.0,
        verbose_name='Плечо'
    )
    
    commission = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        verbose_name='Комиссия'
    )
    
    planned_stop_loss = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Плановый стоп-лосс (в пунктах)'
    )
    
    planned_take_profit = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Плановый тейк-профит (в пунктах)'
    )
    
    actual_result_points = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Фактический результат (в пунктах)'
    )
    
    actual_result_rub = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Результат в рублях'
    )
    
    is_closed = models.BooleanField(
        default=False,
        verbose_name='Сделка закрыта'
    )
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания записи'
    )
    
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='Дата обновления записи'
    )
    
    class Meta:
        verbose_name = 'Торговая сделка'
        verbose_name_plural = 'Торговые сделки'
        db_table = 'trades_trade'
        ordering = ['-trade_date']
    
    def __str__(self):
        return f'{self.instrument.ticker} {self.get_direction_display()} - {self.trade_date.strftime("%d.%m.%Y %H:%M")}'


class TradeAnalysis(models.Model):
    """Анализ торговой сделки"""
    
    class EmotionalState(models.TextChoices):
        CALM = 'CALM', 'Спокойное'
        EXCITED = 'EXCITED', 'Возбужденное'
        FEARFUL = 'FEARFUL', 'Страх'
        GREEDY = 'GREEDY', 'Жадность'
        CONFIDENT = 'CONFIDENT', 'Уверенное'
    
    trade = models.OneToOneField(
        Trade,
        on_delete=models.CASCADE,
        related_name='analysis',
        verbose_name='Сделка'
    )
    
    entry_reason = models.TextField(
        verbose_name='Основание для входа'
    )
    
    exit_reason = models.TextField(
        blank=True,
        verbose_name='Основание для закрытия'
    )
    
    analysis = models.TextField(
        blank=True,
        verbose_name='Анализ действий и эмоций'
    )
    
    conclusions = models.TextField(
        blank=True,
        verbose_name='Выводы на будущее'
    )
    
    emotional_state = models.CharField(
        max_length=20,
        choices=EmotionalState.choices,
        blank=True,
        verbose_name='Эмоциональное состояние'
    )
    
    tags = models.JSONField(
        default=list,
        verbose_name='Теги'
    )
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания анализа'
    )
    
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='Дата обновления анализа'
    )
    
    class Meta:
        verbose_name = 'Анализ сделки'
        verbose_name_plural = 'Анализы сделок'
        db_table = 'trades_trade_analysis'
    
    def __str__(self):
        return f'Анализ сделки {self.trade.id}'


class TradeScreenshot(models.Model):
    """Скриншоты торговых сделок"""
    
    trade = models.ForeignKey(
        Trade,
        on_delete=models.CASCADE,
        related_name='screenshots',
        verbose_name='Сделка'
    )
    
    image = models.ImageField(
        upload_to='trade_screenshots/%Y/%m/%d/',
        verbose_name='Скриншот'
    )
    
    description = models.CharField(
        max_length=200,
        blank=True,
        verbose_name='Описание скриншота'
    )
    
    uploaded_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата загрузки'
    )
    
    class Meta:
        verbose_name = 'Скриншот сделки'
        verbose_name_plural = 'Скриншоты сделок'
        db_table = 'trades_trade_screenshot'
        ordering = ['-uploaded_at']
    
    def __str__(self):
        return f'Скриншот сделки {self.trade.id}'


class MarketContext(models.Model):
    """Контекст рынка на момент сделки (для будущей интеграции с API)"""
    
    trade = models.OneToOneField(
        Trade,
        on_delete=models.CASCADE,
        related_name='market_context',
        verbose_name='Сделка'
    )
    
    moex_index_value = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Значение индекса Мосбиржи'
    )
    
    market_data_json = models.JSONField(
        null=True,
        blank=True,
        verbose_name='Данные рынка (JSON)'
    )
    
    collected_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Время сбора данных'
    )
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания записи'
    )
    
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='Дата обновления записи'
    )
    
    class Meta:
        verbose_name = 'Контекст рынка'
        verbose_name_plural = 'Контексты рынка'
        db_table = 'trades_market_context'
    
    def __str__(self):
        return f'Контекст рынка для сделки {self.trade.id}'