from django.core.paginator import Paginator
from django.db.models import Count, Prefetch, Q
from django.http import JsonResponse
from django.template.loader import render_to_string
from django.utils.decorators import method_decorator
from django.views import View
from django.views.generic import DetailView, ListView, TemplateView
from django.contrib.auth.decorators import login_required

from trades.models import Trade

from .list_query import (
    get_instrument_list_queryset,
    get_taxonomy_payload,
    normalize_search_param,
    parse_int_param,
)
from .models import Futures, Industry, IndustryGroup, Instrument, Sector, SubIndustry


@method_decorator(login_required, name='dispatch')
class InstrumentListFragmentView(View):
    """JSON + HTML-фрагмент списка для AJAX (без полной перезагрузки страницы)."""

    def get(self, request, *args, **kwargs):
        user = request.user
        qs, is_futures = get_instrument_list_queryset(request, user)
        paginator = Paginator(qs, 24)
        page_obj = paginator.get_page(request.GET.get('page', 1))
        context = {
            'page_obj': page_obj,
            'is_paginated': page_obj.has_other_pages(),
            'is_futures_list': is_futures,
            'total_instruments': paginator.count,
            'request': request,
        }
        if is_futures:
            context['futures_list'] = page_obj.object_list
            context['instruments'] = None
        else:
            context['instruments'] = page_obj.object_list
            context['futures_list'] = None

        html = render_to_string(
            'instruments/instrument_list_fragment.html',
            context,
            request=request,
        )
        return JsonResponse(
            {
                'html': html,
                'total': paginator.count,
                'page': page_obj.number,
                'num_pages': paginator.num_pages,
            }
        )


@method_decorator(login_required, name='dispatch')
class InstrumentListView(ListView):
    """Список акций и фьючерсов: пагинация, FTS по акциям, фильтры по таксономии Мосбиржи."""

    template_name = 'instruments/instrument_list.html'
    paginate_by = 24

    def get_queryset(self):
        qs, is_futures = get_instrument_list_queryset(self.request, self.request.user)
        self._list_is_futures = is_futures
        return qs

    def get_context_object_name(self, object_list):
        if getattr(self, '_list_is_futures', False):
            return 'futures_list'
        return 'instruments'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        req = self.request
        context['current_search'] = normalize_search_param(req.GET.get('search'))
        kind = normalize_search_param(req.GET.get('type'))
        context['current_filter'] = kind if kind else 'STOCK'
        context['is_futures_list'] = getattr(self, '_list_is_futures', False)

        sector_id = parse_int_param(req, 'sector')
        industry_group_id = parse_int_param(req, 'industry_group')
        industry_id = parse_int_param(req, 'industry')
        sub_industry_id = parse_int_param(req, 'sub_industry')

        context['sector_id'] = sector_id
        context['industry_group_id'] = industry_group_id
        context['industry_id'] = industry_id
        context['sub_industry_id'] = sub_industry_id

        context['sectors'] = Sector.objects.all().order_by('name')
        context['industry_groups'] = (
            IndustryGroup.objects.filter(sector_id=sector_id).order_by('name')
            if sector_id
            else IndustryGroup.objects.none()
        )
        context['industries'] = (
            Industry.objects.filter(industry_group_id=industry_group_id).order_by('name')
            if industry_group_id
            else Industry.objects.none()
        )
        context['sub_industries'] = (
            SubIndustry.objects.filter(industry_id=industry_id).order_by('name')
            if industry_id
            else SubIndustry.objects.none()
        )

        context['total_instruments'] = context['paginator'].count
        context['taxonomy'] = get_taxonomy_payload()
        return context


@method_decorator(login_required, name='dispatch')
class InstrumentDetailView(DetailView):
    """Карточка базового инструмента: описание, классификация, связанные фьючерсы."""

    model = Instrument
    template_name = 'instruments/instrument_detail.html'
    context_object_name = 'instrument'
    slug_field = 'ticker'
    slug_url_kwarg = 'ticker'

    def get_queryset(self):
        return (
            Instrument.objects.filter(is_active=True)
            .select_related(
                'sub_industry__industry__industry_group__sector',
            )
            .prefetch_related(
                Prefetch(
                    'futures',
                    queryset=Futures.objects.filter(is_active=True).order_by(
                        'expiration_date', 'ticker'
                    ),
                ),
            )
        )


@method_decorator(login_required, name='dispatch')
class FuturesDetailView(DetailView):
    """Карточка фьючерсного контракта с данными базового актива."""

    model = Futures
    template_name = 'instruments/futures_detail.html'
    context_object_name = 'futures_contract'
    slug_field = 'ticker'
    slug_url_kwarg = 'ticker'

    def get_queryset(self):
        return (
            Futures.objects.filter(is_active=True)
            .select_related(
                'base_asset',
                'base_asset__sub_industry__industry__industry_group__sector',
            )
        )


@method_decorator(login_required, name='dispatch')
class InstrumentStatsView(TemplateView):
    """Статистика по инструментам"""

    template_name = 'instruments/instrument_stats.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user

        total_instruments = Instrument.objects.filter(is_active=True).count()
        used_instruments = (
            Instrument.objects.filter(is_active=True, trades__user=user)
            .distinct()
            .count()
        )
        user_trades = Trade.objects.filter(user=user)
        total_trades = user_trades.count()
        closed_trades = user_trades.filter(trade_type='CLOSE').count()

        top_instruments = (
            Instrument.objects.filter(is_active=True, trades__user=user)
            .annotate(
                trades_count=Count('trades'),
                closed_trades_count=Count(
                    'trades', filter=Q(trades__trade_type='CLOSE')
                ),
            )
            .order_by('-trades_count')[:10]
        )

        type_distribution = {}
        instrument_types = []
        for inst_type, display_name in Instrument.InstrumentType.choices:
            count = Instrument.objects.filter(
                is_active=True,
                instrument_type=inst_type,
                trades__user=user,
            ).count()
            if count > 0:
                type_distribution[display_name] = count
                instrument_types.append(
                    {
                        'type': inst_type,
                        'display_name': display_name,
                        'count': count,
                    }
                )

        context['top_instruments'] = top_instruments
        context['total_instruments'] = total_instruments
        context['used_instruments'] = used_instruments
        context['total_trades'] = total_trades
        context['closed_trades'] = closed_trades
        context['type_distribution'] = type_distribution
        context['instrument_types'] = instrument_types

        return context
