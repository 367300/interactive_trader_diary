import { Link, useParams } from 'react-router-dom';
import { instrumentsApi } from '../../api/endpoints';
import { useApi } from '../../lib/useApi';
import { staticUrl } from '../../lib/urls';
import CandlestickChart from '../../components/CandlestickChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function InstrumentDetail() {
  const { ticker } = useParams<{ ticker: string }>();
  const { data, loading, error } = useApi(() => instrumentsApi.get(ticker!), [ticker]);

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
          <div className="text-muted-foreground">{data.name}</div>
        </div>
        <span className="flex-1" />
        <Badge>{data.instrument_type_display}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mt-4.5">
        <Card>
          <CardHeader><CardTitle>Параметры</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><span className="text-muted-foreground text-sm">Размер лота</span><div>{data.lot_size}</div></div>
            <div><span className="text-muted-foreground text-sm">Минимальный шаг цены</span><div>{data.min_price_step}</div></div>
            <div><span className="text-muted-foreground text-sm">Валюта</span><div>{data.currency}</div></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Классификация</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><span className="text-muted-foreground text-sm">Сектор</span><div>{data.taxonomy.sector ?? '—'}</div></div>
            <div><span className="text-muted-foreground text-sm">Группа индустрий</span><div>{data.taxonomy.industry_group ?? '—'}</div></div>
            <div><span className="text-muted-foreground text-sm">Индустрия</span><div>{data.taxonomy.industry ?? '—'}</div></div>
            <div><span className="text-muted-foreground text-sm">Подгруппа</span><div>{data.taxonomy.sub_industry ?? '—'}</div></div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-3.5">
        <CardHeader><CardTitle>График котировок</CardTitle></CardHeader>
        <CardContent>
          <CandlestickChart ticker={data.ticker} market="stock" />
        </CardContent>
      </Card>

      {data.description && (
        <Card className="mt-3.5">
          <CardHeader><CardTitle>Описание</CardTitle></CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-soft-foreground">{data.description}</p>
          </CardContent>
        </Card>
      )}

      {data.futures.length > 0 && (
        <Card className="mt-3.5">
          <CardHeader><CardTitle>Связанные фьючерсы</CardTitle></CardHeader>
          <CardContent className="p-0 pb-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Тикер</TableHead>
                  <TableHead>Экспирация</TableHead>
                  <TableHead>Лот</TableHead>
                  <TableHead>Шаг</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.futures.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell><Link to={`/instruments/futures/${f.ticker}`}>{f.ticker}</Link></TableCell>
                    <TableCell>{f.expiration_date ?? '—'}</TableCell>
                    <TableCell>{f.lot_size ?? '—'}</TableCell>
                    <TableCell>{f.min_price_step ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
