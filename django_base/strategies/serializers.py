from rest_framework import serializers

from trades.models import Trade

from .models import TradingStrategy


class TradingStrategySerializer(serializers.ModelSerializer):
    strategy_type_display = serializers.CharField(source='get_strategy_type_display', read_only=True)
    instruments_display = serializers.CharField(source='get_instruments_display', read_only=True)
    trades_count = serializers.SerializerMethodField()
    closed_trades_count = serializers.SerializerMethodField()

    class Meta:
        model = TradingStrategy
        fields = (
            'id',
            'name',
            'description',
            'strategy_type',
            'strategy_type_display',
            'instruments',
            'instruments_display',
            'is_active',
            'trades_count',
            'closed_trades_count',
            'created_at',
            'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')

    def validate_name(self, value):
        if value and len(value.strip()) < 3:
            raise serializers.ValidationError('Название должно содержать минимум 3 символа')
        return value.strip()

    def validate_description(self, value):
        if value and len(value.strip()) < 10:
            raise serializers.ValidationError('Описание должно содержать минимум 10 символов')
        return value.strip()

    def _user_trades(self, strategy):
        user = self.context['request'].user
        return Trade.objects.filter(user=user, strategy=strategy)

    def get_trades_count(self, obj):
        return self._user_trades(obj).filter(parent_trade__isnull=True).count()

    def get_closed_trades_count(self, obj):
        return self._user_trades(obj).filter(trade_type=Trade.TradeType.CLOSE).count()


class StrategyChoicesSerializer(serializers.Serializer):
    """Сводный объект справочников для форм на клиенте."""

    strategy_types = serializers.ListField()
    instruments = serializers.ListField()
