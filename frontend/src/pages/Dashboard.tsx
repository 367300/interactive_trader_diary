import { Link } from 'react-router-dom';
import { coreApi } from '../api/endpoints';
import { useApi } from '../lib/useApi';
import { directionLabel, formatDate, formatNumber, formatPips, pnlClass } from '../lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function Dashboard() {
  const { data, loading, error } = useApi(() => coreApi.dashboard(), []);

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Загрузка дашборда…</div>;
  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return null;

  const { aggregate, recent_trades, active_strategies } = data;

  return (
    <section>
      <h1>Дашборд</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <Card className="p-4">
          <div className="stat-label">Всего сделок</div>
          <div className="text-2xl font-bold mt-1.5">{aggregate.total_trades}</div>
        </Card>
        <Card className="p-4">
          <div className="stat-label">Закрытых</div>
          <div className="text-2xl font-bold mt-1.5 text-green">{aggregate.closed_trades}</div>
        </Card>
        <Card className="p-4">
          <div className="stat-label">Открытых</div>
          <div className="text-2xl font-bold mt-1.5 text-soft-foreground">{aggregate.open_trades}</div>
        </Card>
        <Card className="p-4">
          <div className="stat-label">Активных стратегий</div>
          <div className="text-2xl font-bold mt-1.5">{active_strategies.length}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-4">
        <Card className="p-4">
          <div className="stat-label">Win rate</div>
          <div className="text-2xl font-bold mt-1.5">{formatNumber(aggregate.win_rate, 1)}%</div>
          <div className="text-muted-foreground text-[13px] mt-1">
            {aggregate.win_count} побед / {aggregate.loss_count} проигрышей
          </div>
        </Card>
        <Card className="p-4">
          <div className="stat-label">P&amp;L (пипсы)</div>
          <div className={`text-2xl font-bold mt-1.5 ${pnlClass(aggregate.total_pnl_pips)}`}>
            {formatPips(aggregate.total_pnl_pips)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="stat-label">Среднее на сделку</div>
          <div className={`text-2xl font-bold mt-1.5 ${pnlClass(aggregate.avg_trade_pips)}`}>
            {formatPips(aggregate.avg_trade_pips)}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mt-4.5">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>Последние сделки</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/trades">Все →</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recent_trades.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                Сделок пока нет. <Link to="/trades/new">Создать первую</Link>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Тикер</TableHead>
                    <TableHead>Направление</TableHead>
                    <TableHead>Цена</TableHead>
                    <TableHead>Пипсы</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent_trades.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{formatDate(t.trade_date)}</TableCell>
                      <TableCell>
                        <Link to={`/trades/${t.id}`}>{t.instrument_detail.ticker}</Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.direction === 'LONG' ? 'success' : 'destructive'}>
                          {directionLabel(t.direction)}
                        </Badge>
                      </TableCell>
                      <TableCell>{t.price}</TableCell>
                      <TableCell className={pnlClass(t.pips_result)}>{formatPips(t.pips_result)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>Активные стратегии</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/strategies">Управлять →</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {active_strategies.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                Нет активных стратегий. <Link to="/strategies/new">Создать</Link>
              </div>
            ) : (
              <ul className="space-y-0 divide-y divide-border">
                {active_strategies.map((s) => (
                  <li key={s.id} className="py-2.5">
                    <Link to={`/strategies/${s.id}`} className="font-medium">{s.name}</Link>
                    <div className="text-muted-foreground text-xs mt-0.5">
                      {s.strategy_type} · {s.instruments}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
