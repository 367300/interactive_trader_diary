from decimal import Decimal
from .models import Trade


def calculate_trade_stats(main_trade):
    """Расчет агрегированной статистики по главной сделке и всем дочерним"""
    all_trades = [main_trade] + list(main_trade.child_trades.all().order_by('trade_date'))
    min_step = main_trade.instrument.min_price_step
    
    # Базовая статистика
    stats = {
        'total_trades': len(all_trades),
        'averages_count': sum(1 for t in all_trades if t.trade_type == Trade.TradeType.AVERAGE),
        'is_closed': any(t.trade_type == Trade.TradeType.CLOSE for t in all_trades),
        'direction': main_trade.direction,
    }
    
    # Средние значения стоп-лосса и тейк-профита
    stops = [t.planned_stop_loss for t in all_trades if t.planned_stop_loss]
    takes = [t.planned_take_profit for t in all_trades if t.planned_take_profit]
    stats['avg_stop'] = sum(stops) / len(stops) if stops else None
    stats['avg_take'] = sum(takes) / len(takes) if takes else None
    
    # Расчет пипсов
    if stats['is_closed']:
        close_trade = next(t for t in all_trades if t.trade_type == Trade.TradeType.CLOSE)
        
        # Вычисляем средневзвешенную цену входа с учетом усреднений
        entry_price = main_trade.price
        multiplier = Decimal('1')
        
        for t in all_trades:
            if t.trade_type == Trade.TradeType.AVERAGE:
                # С каждым усреднением увеличиваем множитель на 1
                multiplier += Decimal('1')
                # Обновляем среднюю цену (упрощенный расчет)
                entry_price = (entry_price + t.price) / Decimal('2')
        
        # Расчет пипсов с учетом направления
        if main_trade.direction == Trade.Direction.LONG:
            pips_raw = (close_trade.price - entry_price) / min_step
        else:  # SHORT
            pips_raw = (entry_price - close_trade.price) / min_step
        
        stats['pips'] = float(pips_raw * multiplier)
        stats['entry_price'] = entry_price
        stats['close_price'] = close_trade.price
        stats['multiplier'] = float(multiplier)
    else:
        stats['pips'] = None
        stats['entry_price'] = main_trade.price
        stats['close_price'] = None
        stats['multiplier'] = None
    
    return stats

