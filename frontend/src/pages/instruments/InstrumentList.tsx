import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { instrumentsApi, type InstrumentListParams } from '../../api/endpoints';
import { useApi } from '../../lib/useApi';
import { staticUrl } from '../../lib/urls';
import type { FuturesListItem, InstrumentListItem, Taxonomy } from '../../api/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 24;

export default function InstrumentList() {
  const [params, setParams] = useState<InstrumentListParams>({ page: 1, type: 'STOCK' });
  const [searchInput, setSearchInput] = useState('');

  const taxonomyQ = useApi<Taxonomy>(() => instrumentsApi.taxonomy(), []);
  const listQ = useApi(() => instrumentsApi.list(params), [JSON.stringify(params)]);

  useEffect(() => {
    const t = setTimeout(() => {
      setParams((p) => ({ ...p, search: searchInput || undefined, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const taxonomy = taxonomyQ.data;

  const industryGroups = useMemo(() => {
    if (!taxonomy || !params.sector) return [];
    return taxonomy.industry_groups.filter((g) => g.sector_id === params.sector);
  }, [taxonomy, params.sector]);

  const industries = useMemo(() => {
    if (!taxonomy || !params.industry_group) return [];
    return taxonomy.industries.filter((i) => i.industry_group_id === params.industry_group);
  }, [taxonomy, params.industry_group]);

  const subIndustries = useMemo(() => {
    if (!taxonomy || !params.industry) return [];
    return taxonomy.sub_industries.filter((s) => s.industry_id === params.industry);
  }, [taxonomy, params.industry]);

  const updateParam = <K extends keyof InstrumentListParams>(key: K, value: InstrumentListParams[K]) => {
    setParams((p) => {
      const next = { ...p, [key]: value, page: 1 };
      if (key === 'sector') {
        next.industry_group = undefined;
        next.industry = undefined;
        next.sub_industry = undefined;
      } else if (key === 'industry_group') {
        next.industry = undefined;
        next.sub_industry = undefined;
      } else if (key === 'industry') {
        next.sub_industry = undefined;
      } else if (key === 'type') {
        next.sector = undefined;
        next.industry_group = undefined;
        next.industry = undefined;
        next.sub_industry = undefined;
      }
      return next;
    });
  };

  const total = listQ.data?.count ?? 0;
  const numPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isFutures = params.type === 'FUTURES';

  return (
    <section>
      <h1>Инструменты</h1>

      <Card className="mb-4">
        <CardContent className="pt-4.5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Поиск</Label>
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Тикер или название"
              />
            </div>
            <div className="space-y-2">
              <Label>Тип списка</Label>
              <Select
                value={params.type ?? 'STOCK'}
                onValueChange={(v) => updateParam('type', v as 'STOCK' | 'FUTURES')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STOCK">Акции</SelectItem>
                  <SelectItem value="FUTURES">Фьючерсы</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-3.5">
            <div className="space-y-2">
              <Label>Сектор</Label>
              <Select
                value={String(params.sector ?? '__all__')}
                onValueChange={(v) => updateParam('sector', v === '__all__' ? undefined : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Все" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Все</SelectItem>
                  {(taxonomy?.sectors ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Группа индустрий</Label>
              <Select
                value={String(params.industry_group ?? '__all__')}
                onValueChange={(v) => updateParam('industry_group', v === '__all__' ? undefined : Number(v))}
                disabled={!params.sector}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Все" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Все</SelectItem>
                  {industryGroups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Индустрия</Label>
              <Select
                value={String(params.industry ?? '__all__')}
                onValueChange={(v) => updateParam('industry', v === '__all__' ? undefined : Number(v))}
                disabled={!params.industry_group}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Все" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Все</SelectItem>
                  {industries.map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Подгруппа</Label>
              <Select
                value={String(params.sub_industry ?? '__all__')}
                onValueChange={(v) => updateParam('sub_industry', v === '__all__' ? undefined : Number(v))}
                disabled={!params.industry}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Все" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Все</SelectItem>
                  {subIndustries.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-muted-foreground text-sm mb-3 px-1">
        Найдено: {total}
      </div>

      {listQ.loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">Загрузка…</div>
      ) : listQ.error ? (
        <Alert variant="destructive">{listQ.error}</Alert>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {listQ.data?.results.map((item) => (
              isFutures
                ? <FuturesCard key={item.id} item={item as FuturesListItem} />
                : <InstrumentCard key={item.id} item={item as InstrumentListItem} />
            ))}
          </div>
          {numPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4.5">
              <Button
                size="sm"
                disabled={params.page === 1}
                onClick={() => setParams((p) => ({ ...p, page: (p.page ?? 1) - 1 }))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-muted-foreground text-sm">{params.page ?? 1} / {numPages}</span>
              <Button
                size="sm"
                disabled={(params.page ?? 1) >= numPages}
                onClick={() => setParams((p) => ({ ...p, page: (p.page ?? 1) + 1 }))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function InstrumentCard({ item }: { item: InstrumentListItem }) {
  return (
    <Link to={`/instruments/${item.ticker}`} className="block no-underline">
      <Card className="p-4 hover:bg-glass-strong transition-colors">
        <div className="flex items-start gap-2.5">
          {item.logo_url && (
            <img
              src={staticUrl(item.logo_url)}
              alt=""
              className="w-9 h-9 rounded-lg object-contain bg-white"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-foreground">{item.ticker}</div>
            <div className="text-muted-foreground text-[13px] truncate">{item.name}</div>
          </div>
          <Badge>{item.instrument_type_display}</Badge>
        </div>
        <div className="text-muted-foreground text-xs mt-2">
          {item.taxonomy.sector ?? '—'} · лот {item.lot_size} · шаг {item.min_price_step}
        </div>
        {item.trades_count > 0 && (
          <div className="text-muted-foreground text-xs mt-1">
            Ваши сделки: {item.trades_count} (закрытых {item.closed_trades_count})
          </div>
        )}
      </Card>
    </Link>
  );
}

function FuturesCard({ item }: { item: FuturesListItem }) {
  return (
    <Link to={`/instruments/futures/${item.ticker}`} className="block no-underline">
      <Card className="p-4 hover:bg-glass-strong transition-colors">
        <div className="flex items-start gap-2.5">
          {item.logo_url && (
            <img
              src={staticUrl(item.logo_url)}
              alt=""
              className="w-9 h-9 rounded-lg object-contain bg-white"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-foreground">{item.ticker}</div>
            <div className="text-muted-foreground text-[13px]">
              Базовый актив: {item.base_asset_ticker}
            </div>
          </div>
          <Badge variant="info">Фьючерс</Badge>
        </div>
        <div className="text-muted-foreground text-xs mt-2">
          {item.expiration_date ? `Экспирация: ${item.expiration_date}` : 'Без даты'} ·
          лот {item.lot_size ?? '—'} · шаг {item.min_price_step ?? '—'}
        </div>
      </Card>
    </Link>
  );
}
