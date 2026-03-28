"""
Общая логика выборки списка акций / фьючерсов для страницы справочника и AJAX-фрагмента.
"""

from django.db.models import Count, Q
from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector

from .models import Futures, Instrument

LIST_TYPE_FUTURES = 'FUTURES'


def normalize_search_param(raw):
    if raw is None:
        return ''
    text = str(raw).strip()
    if text.lower() in ('none', 'null'):
        return ''
    return text


def parse_int_param(request, key):
    raw = request.GET.get(key)
    if raw is None or raw == '':
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def get_instrument_list_queryset(request, user):
    """
    Возвращает (queryset, is_futures: bool).
    """
    kind = normalize_search_param(request.GET.get('type'))
    is_futures = kind == LIST_TYPE_FUTURES

    sector_id = parse_int_param(request, 'sector')
    industry_group_id = parse_int_param(request, 'industry_group')
    industry_id = parse_int_param(request, 'industry')
    sub_industry_id = parse_int_param(request, 'sub_industry')

    search = normalize_search_param(request.GET.get('search'))

    if is_futures:
        qs = Futures.objects.filter(is_active=True).select_related(
            'base_asset',
            'base_asset__sub_industry__industry__industry_group__sector',
        )
        if sector_id:
            qs = qs.filter(
                base_asset__sub_industry__industry__industry_group__sector_id=sector_id
            )
        if industry_group_id:
            qs = qs.filter(
                base_asset__sub_industry__industry__industry_group_id=industry_group_id
            )
        if industry_id:
            qs = qs.filter(base_asset__sub_industry__industry_id=industry_id)
        if sub_industry_id:
            qs = qs.filter(base_asset__sub_industry_id=sub_industry_id)

        if search:
            qs = qs.filter(
                Q(ticker__icontains=search)
                | Q(name__icontains=search)
                | Q(base_asset__ticker__icontains=search)
                | Q(base_asset__name__icontains=search)
                | Q(base_asset__description__icontains=search)
            )
        qs = qs.order_by('base_asset__ticker', 'ticker')

        qs = qs.annotate(
            trades_count=Count(
                'base_asset__trades', filter=Q(base_asset__trades__user=user)
            ),
            closed_trades_count=Count(
                'base_asset__trades',
                filter=Q(
                    base_asset__trades__user=user,
                    base_asset__trades__trade_type='CLOSE',
                ),
            ),
        )
        return qs, True

    qs = (
        Instrument.objects.filter(
            is_active=True,
            instrument_type=Instrument.InstrumentType.STOCK,
        )
        .select_related(
            'sub_industry__industry__industry_group__sector',
        )
    )
    if sector_id:
        qs = qs.filter(sub_industry__industry__industry_group__sector_id=sector_id)
    if industry_group_id:
        qs = qs.filter(sub_industry__industry__industry_group_id=industry_group_id)
    if industry_id:
        qs = qs.filter(sub_industry__industry_id=industry_id)
    if sub_industry_id:
        qs = qs.filter(sub_industry_id=sub_industry_id)

    if search:
        vector = (
            SearchVector('ticker', config='simple')
            + SearchVector('name', config='russian')
            + SearchVector('description', config='russian')
            + SearchVector('sector', config='russian')
        )
        query = SearchQuery(search, config='russian')
        qs = (
            qs.annotate(rank=SearchRank(vector, query))
            .filter(
                Q(rank__gt=0)
                | Q(ticker__icontains=search)
                | Q(name__icontains=search)
            )
            .distinct()
            .order_by('-rank', 'ticker')
        )
    else:
        qs = qs.order_by('ticker')

    qs = qs.annotate(
        trades_count=Count('trades', filter=Q(trades__user=user)),
        closed_trades_count=Count(
            'trades',
            filter=Q(trades__user=user, trades__trade_type='CLOSE'),
        ),
    )
    return qs, False


def get_taxonomy_payload():
    """Плоские списки для каскадных фильтров на клиенте."""
    from .models import Industry, IndustryGroup, Sector, SubIndustry

    return {
        'sectors': list(Sector.objects.order_by('name').values('id', 'name')),
        'industry_groups': list(
            IndustryGroup.objects.order_by('sector__name', 'name').values(
                'id', 'name', 'sector_id'
            )
        ),
        'industries': list(
            Industry.objects.order_by('industry_group__name', 'name').values(
                'id', 'name', 'industry_group_id'
            )
        ),
        'sub_industries': list(
            SubIndustry.objects.order_by('industry__name', 'name').values(
                'id', 'name', 'industry_id'
            )
        ),
    }
