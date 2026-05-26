import { Link, useParams } from 'react-router-dom';
import { instrumentsApi } from '../../api/endpoints';
import { useApi } from '../../lib/useApi';
import { staticUrl } from '../../lib/urls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';

export default function FuturesDetail() {
  const { ticker } = useParams<{ ticker: string }>();
  const { data, loading, error } = useApi(() => instrumentsApi.getFutures(ticker!), [ticker]);

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Загрузка…</div>;
  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return null;

  return (
    <section>
      <div className="flex items-center gap-3 flex-wrap">
        {data.og_logo_url && (
          <img
            src={staticUrl(data.og_logo_url)}
            alt=""
            className="w-16 h-16 rounded-xl bg-white object-contain"
          />
        )}
        <div>
          <h1 className="mb-0">{data.ticker}</h1>
          <div className="text-muted-foreground">{data.name || 'Фьючерсный контракт'}</div>
        </div>
        <span className="flex-1" />
        <Badge variant="info">Фьючерс</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mt-4.5">
        <Card>
          <CardHeader><CardTitle>Параметры контракта</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><span className="text-muted-foreground text-sm">Дата экспирации</span><div>{data.expiration_date ?? '—'}</div></div>
            <div><span className="text-muted-foreground text-sm">Лот</span><div>{data.lot_size ?? '—'}</div></div>
            <div><span className="text-muted-foreground text-sm">Шаг цены</span><div>{data.min_price_step ?? '—'}</div></div>
            <div><span className="text-muted-foreground text-sm">Валюта</span><div>{data.currency}</div></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Базовый актив</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <span className="text-muted-foreground text-sm">Тикер</span>
              <div><Link to={`/instruments/${data.base_asset_ticker}`}>{data.base_asset_ticker}</Link></div>
            </div>
            <div><span className="text-muted-foreground text-sm">Название</span><div>{data.base_asset_name}</div></div>
            <div><span className="text-muted-foreground text-sm">Сектор</span><div>{data.taxonomy.sector ?? '—'}</div></div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
