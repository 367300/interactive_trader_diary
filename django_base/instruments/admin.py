from django.contrib import admin
from .models import Sector, Instrument, IndustryGroup, Industry, SubIndustry, Futures


@admin.register(Sector)
class SectorAdmin(admin.ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)
    ordering = ('name',)


@admin.register(IndustryGroup)
class IndustryGroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'sector')
    list_filter = ('sector',)
    search_fields = ('name', 'sector__name')
    ordering = ('name',)
    autocomplete_fields = ('sector',)


@admin.register(Industry)
class IndustryAdmin(admin.ModelAdmin):
    list_display = ('name', 'industry_group')
    list_filter = ('industry_group',)
    search_fields = ('name',)
    ordering = ('name',)
    autocomplete_fields = ('industry_group',)


@admin.register(SubIndustry)
class SubIndustryAdmin(admin.ModelAdmin):
    list_display = ('name', 'industry', 'description')
    list_filter = ('industry',)
    search_fields = ('name', 'description')
    ordering = ('name',)
    autocomplete_fields = ('industry',)


@admin.register(Instrument)
class InstrumentAdmin(admin.ModelAdmin):
    list_display = (
        'ticker', 'name', 'instrument_type', 'sector', 'sub_industry',
        'lot_size', 'min_price_step', 'is_active'
    )
    list_filter = ('instrument_type', 'sector', 'is_active', 'sub_industry', 'created_at')
    search_fields = ('ticker', 'name', 'sector', 'description')
    readonly_fields = ('created_at', 'updated_at')
    ordering = ('ticker',)
    autocomplete_fields = ('sub_industry',)

    fieldsets = (
        ('Основная информация', {
            'fields': ('ticker', 'name', 'instrument_type', 'sector', 'sub_industry', 'description')
        }),
        ('Иконки', {
            'fields': ('logolink', 'og_logo'),
            'description': 'Пути относительно STATIC_URL. В шаблоне: {% load static %} {% static instrument.logolink %}',
        }),
        ('Торговые параметры', {
            'fields': ('lot_size', 'min_price_step', 'currency', 'is_active')
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(Futures)
class FuturesAdmin(admin.ModelAdmin):
    list_display = ('ticker', 'base_asset', 'expiration_date', 'lot_size', 'min_price_step', 'is_active')
    list_filter = ('is_active', 'base_asset')
    search_fields = ('ticker', 'name', 'base_asset__ticker')
    readonly_fields = ('created_at', 'updated_at')
    ordering = ('base_asset', 'expiration_date')
    autocomplete_fields = ('base_asset',)