import { useState } from 'react';
import { Link } from 'react-router-dom';
import { tradesApi } from '../../api/endpoints';
import { useApi } from '../../lib/useApi';
import { directionLabel, formatDate, formatPips, pnlClass } from '../../lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

const PAGE_SIZE = 24;

export default function TradeList() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useApi(() => tradesApi.list({ page }), [page]);

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Загрузка…</div>;
  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return null;

  const total = data.count;
  const numPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h1 className="mb-0">Все сделки</h1>
        <Button variant="primary" asChild>
          <Link to="/trades/new"><Plus className="h-4 w-4" /> Новая сделка</Link>
        </Button>
      </div>

      {data.results.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Сделок пока нет. <Link to="/trades/new">Создать первую</Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Тикер</TableHead>
                  <TableHead>Стратегия</TableHead>
                  <TableHead>Направление</TableHead>
                  <TableHead>Цена</TableHead>
                  <TableHead>Объём, %</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Пипсы</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.results.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{formatDate(t.trade_date)}</TableCell>
                    <TableCell>
                      <Link to={`/trades/${t.id}`}>{t.instrument_detail.ticker}</Link>
                    </TableCell>
                    <TableCell>{t.strategy_detail?.name ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={t.direction === 'LONG' ? 'success' : 'destructive'}>
                        {directionLabel(t.direction)}
                      </Badge>
                    </TableCell>
                    <TableCell>{t.price}</TableCell>
                    <TableCell>{t.volume_from_capital}%</TableCell>
                    <TableCell>
                      {t.is_closed
                        ? <Badge>Закрыта</Badge>
                        : <Badge variant="info">Открыта</Badge>}
                    </TableCell>
                    <TableCell className={pnlClass(t.pips_result)}>{formatPips(t.pips_result)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/trades/${t.id}`}>Открыть</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          {numPages > 1 && (
            <div className="flex items-center justify-center gap-3 py-3">
              <Button variant="default" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-muted-foreground text-sm">{page} / {numPages}</span>
              <Button variant="default" size="sm" disabled={page >= numPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}
