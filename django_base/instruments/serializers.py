from decimal import Decimal, InvalidOperation

from django.templatetags.static import static
from rest_framework import serializers

from .models import Futures, Industry, IndustryGroup, Instrument, Sector, SubIndustry


def _format_price_step(value):
    if value in (None, ''):
        return None
    try:
        d = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return str(value)
    s = format(d.normalize(), 'f')
    if '.' in s:
        s = s.rstrip('0').rstrip('.')
    return s or '0'


class SectorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sector
        fields = ('id', 'name')


class IndustryGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = IndustryGroup
        fields = ('id', 'name', 'sector_id')


class IndustrySerializer(serializers.ModelSerializer):
    class Meta:
        model = Industry
        fields = ('id', 'name', 'industry_group_id')


class SubIndustrySerializer(serializers.ModelSerializer):
    class Meta:
        model = SubIndustry
        fields = ('id', 'name', 'industry_id')


class TaxonomyPathSerializer(serializers.Serializer):
    sector = serializers.SerializerMethodField()
    industry_group = serializers.SerializerMethodField()
    industry = serializers.SerializerMethodField()
    sub_industry = serializers.SerializerMethodField()

    def _name(self, obj, attr):
        item = getattr(obj, attr, None)
        return item.name if item else None

    def get_sub_industry(self, obj):
        return self._name(obj, 'sub_industry')

    def get_industry(self, obj):
        sub = obj.sub_industry
        return sub.industry.name if sub and sub.industry_id else None

    def get_industry_group(self, obj):
        sub = obj.sub_industry
        if not sub or not sub.industry_id:
            return None
        return sub.industry.industry_group.name if sub.industry.industry_group_id else None

    def get_sector(self, obj):
        sub = obj.sub_industry
        if not sub or not sub.industry_id:
            return None
        ig = sub.industry.industry_group
        if not ig or not ig.sector_id:
            return None
        return ig.sector.name


class InstrumentListSerializer(serializers.ModelSerializer):
    instrument_type_display = serializers.CharField(source='get_instrument_type_display', read_only=True)
    min_price_step = serializers.SerializerMethodField()
    logo_url = serializers.SerializerMethodField()
    og_logo_url = serializers.SerializerMethodField()
    trades_count = serializers.IntegerField(read_only=True, default=0)
    closed_trades_count = serializers.IntegerField(read_only=True, default=0)
    taxonomy = serializers.SerializerMethodField()

    class Meta:
        model = Instrument
        fields = (
            'id',
            'ticker',
            'name',
            'instrument_type',
            'instrument_type_display',
            'sector',
            'description',
            'lot_size',
            'min_price_step',
            'currency',
            'is_active',
            'logo_url',
            'og_logo_url',
            'trades_count',
            'closed_trades_count',
            'taxonomy',
        )

    def get_min_price_step(self, obj):
        return _format_price_step(obj.min_price_step)

    def get_logo_url(self, obj):
        return static(obj.logolink) if obj.logolink else None

    def get_og_logo_url(self, obj):
        return static(obj.og_logo) if obj.og_logo else None

    def get_taxonomy(self, obj):
        return TaxonomyPathSerializer(obj).data


class FuturesListSerializer(serializers.ModelSerializer):
    base_asset_ticker = serializers.CharField(source='base_asset.ticker', read_only=True)
    base_asset_name = serializers.CharField(source='base_asset.name', read_only=True)
    base_asset_id = serializers.IntegerField(read_only=True)
    logo_url = serializers.SerializerMethodField()
    og_logo_url = serializers.SerializerMethodField()
    min_price_step = serializers.SerializerMethodField()
    lot_size = serializers.SerializerMethodField()
    taxonomy = serializers.SerializerMethodField()
    trades_count = serializers.IntegerField(read_only=True, default=0)
    closed_trades_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Futures
        fields = (
            'id',
            'ticker',
            'name',
            'expiration_date',
            'currency',
            'is_active',
            'min_price_step',
            'lot_size',
            'base_asset_id',
            'base_asset_ticker',
            'base_asset_name',
            'logo_url',
            'og_logo_url',
            'taxonomy',
            'trades_count',
            'closed_trades_count',
        )

    def get_min_price_step(self, obj):
        return _format_price_step(obj.min_price_step or obj.base_asset.min_price_step)

    def get_lot_size(self, obj):
        return obj.lot_size or obj.base_asset.lot_size

    def get_logo_url(self, obj):
        return static(obj.base_asset.logolink) if obj.base_asset.logolink else None

    def get_og_logo_url(self, obj):
        return static(obj.base_asset.og_logo) if obj.base_asset.og_logo else None

    def get_taxonomy(self, obj):
        return TaxonomyPathSerializer(obj.base_asset).data


class FuturesShortSerializer(serializers.ModelSerializer):
    """Краткое представление фьючерса для карточки базового актива."""

    min_price_step = serializers.SerializerMethodField()

    class Meta:
        model = Futures
        fields = ('id', 'ticker', 'name', 'expiration_date', 'currency', 'min_price_step', 'lot_size')

    def get_min_price_step(self, obj):
        return _format_price_step(obj.min_price_step)


class InstrumentDetailSerializer(InstrumentListSerializer):
    futures = serializers.SerializerMethodField()

    class Meta(InstrumentListSerializer.Meta):
        fields = InstrumentListSerializer.Meta.fields + ('futures',)

    def get_futures(self, obj):
        items = [f for f in obj.futures.all() if f.is_active]
        return FuturesShortSerializer(items, many=True).data
