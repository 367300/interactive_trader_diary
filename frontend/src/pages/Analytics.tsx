import { Link } from 'react-router-dom';
import { tradesApi } from '../api/endpoints';
import { useApi } from '../lib/useApi';
import { formatNumber, formatPips, pnlClass } from '../lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function Analytics() {
  const { data, loading, error } = useApi(() => tradesApi.analytics(), []);
  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Загрузка…</div>;
  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return null;

  const a = data.aggregate;

  return (
    <section>
      <h1>Аналитика</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <Card className="p-4">
          <div className="stat-label">Сделок</div>
          <div className="text-2xl font-bold mt-1.5">{a.total_trades}</div>
        </Card>
        <Card className="p-4">
          <div className="stat-label">Win rate</div>
          <div className="text-2xl font-bold mt-1.5">{formatNumber(a.win_rate, 1)}%</div>
        </Card>
        <Card className="p-4">
          <div className="stat-label">P&amp;L (пипсы)</div>
          <div className={`text-2xl font-bold mt-1.5 ${pnlClass(a.total_pnl_pips)}`}>{formatPips(a.total_pnl_pips)}</div>
        </Card>
        <Card className="p-4">
          <div className="stat-label">Среднее</div>
          <div className={`text-2xl font-bold mt-1.5 ${pnlClass(a.avg_trade_pips)}`}>{formatPips(a.avg_trade_pips)}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mt-4">
        <Card>
          <CardHeader>
            <CardTitle>По стратегиям</CardTitle>
          </CardHeader>
          <CardContent>
            {data.strategies.length === 0 ? (
              <div className="text-muted-foreground text-sm">Сделки ещё не привязаны к стратегиям.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Стратегия</TableHead>
                    <TableHead>Сделок</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.strategies.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell><Link to={`/strategies/${s.id}`}>{s.name}</Link></TableCell>
                      <TableCell>{s.trades_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>По инструментам</CardTitle>
          </CardHeader>
          <CardContent>
            {data.instruments.length === 0 ? (
              <div className="text-muted-foreground text-sm">Сделок по инструментам пока нет.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Тикер</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Сделок</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.instruments.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell><Link to={`/instruments/${i.ticker}`}>{i.ticker}</Link></TableCell>
                      <TableCell>{i.name}</TableCell>
                      <TableCell>{i.trades_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
