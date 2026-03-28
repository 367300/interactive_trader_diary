from decimal import Decimal, InvalidOperation

from django import template

register = template.Library()


@register.filter
def format_price_step(value):
    """Убирает лишние нули у Decimal (шаг цены), без научной нотации."""
    if value is None or value == '':
        return '—'
    try:
        d = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return value
    t = d.normalize()
    s = format(t, 'f')
    if '.' in s:
        s = s.rstrip('0').rstrip('.')
    return s if s else '0'
