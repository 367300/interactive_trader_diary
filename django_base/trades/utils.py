from decimal import Decimal
from .models import Trade


def calculate_user_aggregate_stats(user):
    """Агрегированные метрики по всем родительским сделкам пользователя.

    Финансовый результат считается в пипсах — поля рублёвого результата в модели нет
    (см. миграцию 0003_remove_trade_actual_result_points_and_more). Для каждой
    закрытой родительской сделки берём pips из calculate_trade_stats.
    """
    parent_trades = (
        Trade.objects
        .filter(user=user, parent_trade__isnull=True)
        .select_related('instrument')
        .prefetch_related('child_trades')
    )

    total_count = 0
    closed_count = 0
    win_count = 0
    pips_sum = 0.0
    closed_pips = []

    for trade in parent_trades:
        total_count += 1
        if not trade.is_closed():
            continue
        stats = calculate_trade_stats(trade)
        pips = stats.get('pips')
        if pips is None:
            continue
        closed_count += 1
        pips_sum += pips
        closed_pips.append(pips)
        if pips > 0:
            win_count += 1

    open_count = total_count - closed_count
    win_rate = (win_count / closed_count * 100.0) if closed_count else 0.0
    avg_trade_pips = (pips_sum / closed_count) if closed_count else 0.0

    return {
        'total_trades': total_count,
        'closed_trades': closed_count,
        'open_trades': open_count,
        'total_pnl_pips': pips_sum,
        'win_rate': win_rate,
        'avg_trade_pips': avg_trade_pips,
        'win_count': win_count,
        'loss_count': closed_count - win_count,
    }


def annotate_recent_trades_with_pips(trades):
    """Добавляет к каждой сделке поле pips_result (для отображения в списках)."""
    for trade in trades:
        if trade.parent_trade_id is None and trade.is_closed():
            stats = calculate_trade_stats(trade)
            trade.pips_result = stats.get('pips')
        else:
            trade.pips_result = None
    return trades


def calculate_trade_stats(main_trade):
    """Расчет агрегированной статистики по главной сделке и всем дочерним"""
    all_trades = [main_trade] + list(main_trade.child_trades.all().order_by('trade_date'))
    min_step = main_trade.instrument.min_price_step
    
    # Базовая статистика
    stats = {
        'total_trades': len(all_trades),
        'averages_count': sum(1 for t in all_trades if t.trade_type == Trade.TradeType.AVERAGE),
        'partial_closes_count': sum(1 for t in all_trades if t.trade_type == Trade.TradeType.PARTIAL_CLOSE),
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

