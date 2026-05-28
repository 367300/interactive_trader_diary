from django.urls import reverse
from rest_framework import serializers

from instruments.models import Instrument
from strategies.models import TradingStrategy

from .models import Trade, TradeAnalysis, TradeScreenshot
from .utils import calculate_trade_stats
from .validations import validate_file_size


class TradeAnalysisSerializer(serializers.ModelSerializer):
    emotional_state_display = serializers.CharField(
        source='get_emotional_state_display', read_only=True
    )

    class Meta:
        model = TradeAnalysis
        fields = (
            'analysis',
            'conclusions',
            'emotional_state',
            'emotional_state_display',
            'tags',
        )


class TradeScreenshotSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(validators=[validate_file_size])
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = TradeScreenshot
        fields = ('id', 'image', 'image_url', 'description', 'uploaded_at')
        read_only_fields = ('id', 'image_url', 'uploaded_at')
        extra_kwargs = {'image': {'write_only': True}}

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get('request')
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url


class TradeInstrumentBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Instrument
        fields = ('id', 'ticker', 'name', 'min_price_step', 'lot_size', 'currency')


class TradeStrategyBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = TradingStrategy
        fields = ('id', 'name')


class TradeSerializer(serializers.ModelSerializer):
    """Универсальный сериализатор сделки. Создание/чтение/обновление."""

    direction_display = serializers.CharField(source='get_direction_display', read_only=True)
    trade_type_display = serializers.CharField(source='get_trade_type_display', read_only=True)
    instrument_detail = TradeInstrumentBriefSerializer(source='instrument', read_only=True)
    strategy_detail = TradeStrategyBriefSerializer(source='strategy', read_only=True)
    analysis = TradeAnalysisSerializer(required=False, allow_null=True)
    screenshots = TradeScreenshotSerializer(many=True, read_only=True)
    pips_result = serializers.SerializerMethodField()
    is_closed = serializers.SerializerMethodField()
    available_volume = serializers.SerializerMethodField()

    class Meta:
        model = Trade
        fields = (
            'id',
            'user',
            'strategy',
            'strategy_detail',
            'instrument',
            'instrument_detail',
            'trade_date',
            'direction',
            'direction_display',
            'trade_type',
            'trade_type_display',
            'price',
            'commission',
            'planned_stop_loss',
            'planned_take_profit',
            'volume_from_capital',
            'parent_trade',
            'analysis',
            'screenshots',
            'pips_result',
            'is_closed',
            'available_volume',
            'created_at',
            'updated_at',
        )
        read_only_fields = (
            'id',
            'user',
            'trade_type',
            'parent_trade',
            'pips_result',
            'is_closed',
            'available_volume',
            'created_at',
            'updated_at',
        )

    def get_pips_result(self, obj):
        if obj.parent_trade_id is None and obj.is_closed():
            return calculate_trade_stats(obj).get('pips')
        return None

    def get_is_closed(self, obj):
        return obj.is_closed()

    def get_available_volume(self, obj):
        return obj.get_available_volume()

    def validate_price(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError('Цена должна быть положительной')
        return value

    def validate_volume_from_capital(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError('Объём должен быть положительным')
        return value

    def _save_analysis(self, trade, data):
        if data is None:
            return
        has_data = any(
            data.get(f) for f in ('analysis', 'conclusions', 'emotional_state', 'tags')
        )
        if has_data:
            TradeAnalysis.objects.update_or_create(trade=trade, defaults=data)
        else:
            TradeAnalysis.objects.filter(trade=trade).delete()

    def create(self, validated_data):
        analysis_data = validated_data.pop('analysis', None)
        validated_data.setdefault('user', self.context['request'].user)
        trade = Trade.objects.create(**validated_data)
        self._save_analysis(trade, analysis_data)
        return trade

    def update(self, instance, validated_data):
        analysis_data = validated_data.pop('analysis', serializers._UNSET if hasattr(serializers, '_UNSET') else None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if analysis_data is not None:
            self._save_analysis(instance, analysis_data)
        return instance


class TradeListSerializer(TradeSerializer):
    """Облегчённое представление для списков (без скриншотов и полного анализа)."""

    class Meta(TradeSerializer.Meta):
        fields = (
            'id',
            'strategy_detail',
            'instrument_detail',
            'trade_date',
            'direction',
            'direction_display',
            'trade_type',
            'trade_type_display',
            'price',
            'volume_from_capital',
            'parent_trade',
            'pips_result',
            'is_closed',
            'available_volume',
            'created_at',
        )


class TradeDetailSerializer(TradeSerializer):
    """Детальный вид: добавляет дочерние сделки и агрегированную статистику."""

    child_trades = serializers.SerializerMethodField()
    stats = serializers.SerializerMethodField()

    class Meta(TradeSerializer.Meta):
        fields = TradeSerializer.Meta.fields + ('child_trades', 'stats')

    def get_child_trades(self, obj):
        if obj.trade_type != Trade.TradeType.OPEN:
            return []
        children = list(obj.child_trades.all().order_by('-trade_date'))
        return TradeSerializer(children, many=True, context=self.context).data

    def get_stats(self, obj):
        if obj.trade_type != Trade.TradeType.OPEN:
            return None
        return calculate_trade_stats(obj)


class ChildTradeCreateSerializer(serializers.ModelSerializer):
    """Сериализатор для создания усреднения / закрытия / частичного закрытия."""

    analysis = TradeAnalysisSerializer(required=False, allow_null=True)

    class Meta:
        model = Trade
        fields = (
            'trade_date',
            'price',
            'commission',
            'planned_stop_loss',
            'planned_take_profit',
            'volume_from_capital',
            'analysis',
        )

    def validate_price(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError('Цена должна быть положительной')
        return value


class QuickChainLegSerializer(serializers.Serializer):
    """Один шаг цепочки в быстром вводе."""

    LEG_TYPES = ('OPEN', 'AVERAGE', 'PARTIAL_CLOSE', 'CLOSE')

    type = serializers.ChoiceField(choices=LEG_TYPES)
    date = serializers.DateTimeField()
    price = serializers.DecimalField(max_digits=15, decimal_places=2)
    volume_from_capital = serializers.IntegerField(min_value=1, max_value=100)
    planned_stop_loss = serializers.DecimalField(
        max_digits=15, decimal_places=2, required=False, allow_null=True
    )
    planned_take_profit = serializers.DecimalField(
        max_digits=15, decimal_places=2, required=False, allow_null=True
    )

    def validate_price(self, value):
        if value <= 0:
            raise serializers.ValidationError('Цена должна быть положительной.')
        return value


class QuickChainSerializer(serializers.Serializer):
    """Атомарное создание цепочки сделок одним запросом."""

    instrument_id = serializers.IntegerField()
    strategy_id = serializers.IntegerField()
    direction = serializers.ChoiceField(choices=Trade.Direction.choices)
    legs = QuickChainLegSerializer(many=True)

    def validate_legs(self, value):
        if len(value) < 2:
            raise serializers.ValidationError('Цепочка должна содержать минимум 2 шага (OPEN и CLOSE).')
        if value[0]['type'] != 'OPEN':
            raise serializers.ValidationError('Первый шаг цепочки должен быть OPEN.')
        if value[-1]['type'] != 'CLOSE':
            raise serializers.ValidationError('Последний шаг цепочки должен быть CLOSE.')
        open_count = sum(1 for leg in value if leg['type'] == 'OPEN')
        close_count = sum(1 for leg in value if leg['type'] == 'CLOSE')
        if open_count != 1:
            raise serializers.ValidationError(f'В цепочке должен быть ровно один OPEN, найдено {open_count}.')
        if close_count != 1:
            raise serializers.ValidationError(f'В цепочке должен быть ровно один CLOSE, найдено {close_count}.')

        # Даты неубывающие
        for i in range(1, len(value)):
            if value[i]['date'] < value[i-1]['date']:
                raise serializers.ValidationError(
                    f'Даты должны быть в неубывающем порядке (шаг #{i} раньше предыдущего).'
                )

        # Сумма объёмов открытий = сумма объёмов закрытий
        open_volume = sum(leg['volume_from_capital'] for leg in value
                          if leg['type'] in ('OPEN', 'AVERAGE'))
        close_volume = sum(leg['volume_from_capital'] for leg in value
                           if leg['type'] in ('PARTIAL_CLOSE', 'CLOSE'))
        if open_volume != close_volume:
            raise serializers.ValidationError(
                f'Сумма открытий ({open_volume}%) не равна сумме закрытий ({close_volume}%).'
            )

        # SL/TP допустимы только на OPEN и AVERAGE
        for i, leg in enumerate(value):
            if leg['type'] in ('PARTIAL_CLOSE', 'CLOSE'):
                if leg.get('planned_stop_loss') is not None:
                    raise serializers.ValidationError(
                        f'planned_stop_loss не допускается на шаге #{i} (тип {leg["type"]}).'
                    )
                if leg.get('planned_take_profit') is not None:
                    raise serializers.ValidationError(
                        f'planned_take_profit не допускается на шаге #{i} (тип {leg["type"]}).'
                    )

        return value
