from django.db import models


# Путь к иконке по умолчанию (относительно STATIC_URL).
# В шаблонах использовать: {% static instrument.logolink %}
# В коде: from django.templatetags.static import static; url = static(instrument.logolink)
DEFAULT_TICKER_ICON_PATH = 'instruments/ticker_icons/blank_ticker.svg'


class Sector(models.Model):
    """Сектор экономики (верхний уровень классификации)."""
    name = models.CharField(
        max_length=100,
        unique=True,
        verbose_name='Сектор экономики'
    )

    class Meta:
        verbose_name = 'Сектор экономики'
        verbose_name_plural = 'Секторы экономики'
        db_table = 'instruments_sector'
        ordering = ['name']

    def __str__(self):
        return self.name


class IndustryGroup(models.Model):
    """Группа индустрий (верхний уровень классификации)."""
    sector = models.ForeignKey(
        Sector,
        on_delete=models.PROTECT,
        related_name='industry_groups',
        verbose_name='Сектор экономики'
    )
    name = models.CharField(
        max_length=200,
        verbose_name='Группа индустрии'
    )

    class Meta:
        verbose_name = 'Группа индустрии'
        verbose_name_plural = 'Группы индустрий'
        db_table = 'instruments_industry_group'
        ordering = ['name']
        unique_together = [['name', 'sector']]

    def __str__(self):
        return self.name


class Industry(models.Model):
    """Индустрия (принадлежит группе индустрий)."""
    name = models.CharField(
        max_length=200,
        verbose_name='Индустрия'
    )
    industry_group = models.ForeignKey(
        IndustryGroup,
        on_delete=models.CASCADE,
        related_name='industries',
        verbose_name='Группа индустрии'
    )

    class Meta:
        verbose_name = 'Индустрия'
        verbose_name_plural = 'Индустрии'
        db_table = 'instruments_industry'
        ordering = ['name']
        unique_together = [['name', 'industry_group']]

    def __str__(self):
        return self.name


class SubIndustry(models.Model):
    """Подгруппа индустрии (принадлежит индустрии; к ней привязаны инструменты)."""
    name = models.CharField(
        max_length=200,
        verbose_name='Подгруппа индустрии'
    )
    description = models.TextField(
        blank=True,
        verbose_name='Описание подгруппы индустрии'
    )
    industry = models.ForeignKey(
        Industry,
        on_delete=models.CASCADE,
        related_name='sub_industries',
        verbose_name='Индустрия'
    )

    class Meta:
        verbose_name = 'Подгруппа индустрии'
        verbose_name_plural = 'Подгруппы индустрий'
        db_table = 'instruments_sub_industry'
        ordering = ['name']
        unique_together = [['name', 'industry']]

    def __str__(self):
        return self.name


class Instrument(models.Model):
    """
    Справочник базовых торговых инструментов (акции, индексы, облигации и т.д.).
    Фьючерсы вынесены в отдельную модель Futures с ссылкой на базовый актив.
    """
    class InstrumentType(models.TextChoices):
        STOCK = 'STOCK', 'Акция'
        INDEX = 'INDEX', 'Индекс'
        BOND = 'BOND', 'Облигация'
        ETF = 'ETF', 'Биржевой фонд'
        CURRENCY = 'CURRENCY', 'Валюта'
        # FUTURES не используется — фьючерсы в таблице Futures

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
    # Классификация по индустриям (через подгруппу получаем industry и industry_group)
    sub_industry = models.ForeignKey(
        SubIndustry,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='instruments',
        verbose_name='Подгруппа индустрии'
    )
    description = models.TextField(
        blank=True,
        default='',
        verbose_name='Описание'
    )
    # Путь к иконке относительно STATIC_URL (в шаблоне: {% static instrument.logolink %})
    logolink = models.CharField(
        max_length=500,
        default=DEFAULT_TICKER_ICON_PATH,
        blank=True,
        verbose_name='Ссылка на логотип (малая иконка)'
    )
    # Большая иконка тикера (Open Graph и т.д.)
    og_logo = models.CharField(
        max_length=500,
        default=DEFAULT_TICKER_ICON_PATH,
        blank=True,
        verbose_name='Ссылка на большую иконку (og_logo)'
    )
    lot_size = models.PositiveIntegerField(
        default=1,
        verbose_name='Размер лота'
    )
    min_price_step = models.DecimalField(
        max_digits=20,
        decimal_places=10,
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


class Futures(models.Model):
    """
    Фьючерсные контракты. Фьючерс — производный инструмент от базового актива.
    Один базовый актив (Instrument) — много фьючерсов с разными датами экспирации.
    Детальная информация (сектор, описание, индустрия) берётся из base_asset.
    """
    base_asset = models.ForeignKey(
        Instrument,
        on_delete=models.CASCADE,
        related_name='futures',
        verbose_name='Базовый актив'
    )
    ticker = models.CharField(
        max_length=50,
        verbose_name='Тикер контракта'
    )
    name = models.CharField(
        max_length=200,
        blank=True,
        verbose_name='Название контракта'
    )
    expiration_date = models.DateField(
        null=True,
        blank=True,
        verbose_name='Дата экспирации'
    )
    min_price_step = models.DecimalField(
        max_digits=20,
        decimal_places=10,
        null=True,
        blank=True,
        verbose_name='Минимальный шаг цены (если отличается от базового актива)'
    )
    lot_size = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name='Размер лота (если отличается)'
    )
    currency = models.CharField(
        max_length=3,
        default='RUB',
        blank=True,
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
        verbose_name = 'Фьючерс'
        verbose_name_plural = 'Фьючерсы'
        db_table = 'instruments_futures'
        ordering = ['base_asset', 'expiration_date']
        unique_together = [['base_asset', 'ticker']]

    def __str__(self):
        return f'{self.ticker} (базовый актив: {self.base_asset.ticker})'
