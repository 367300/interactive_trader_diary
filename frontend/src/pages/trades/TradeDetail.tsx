import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { tradesApi } from '../../api/endpoints';
import { useApi } from '../../lib/useApi';
import { directionLabel, formatDate, formatNumber, formatPips, pnlClass } from '../../lib/format';
import ChildTradeModal, { type ChildAction } from './ChildTradeModal';
import TradeScreenshots from './TradeScreenshots';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function TradeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => tradesApi.get(id!), [id]);
  const [action, setAction] = useState<ChildAction | null>(null);

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Загрузка…</div>;
  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return null;

  const t = data;
  const isParent = t.trade_type === 'OPEN';

  const remove = async () => {
    if (!confirm('Удалить сделку и все связанные действия?')) return;
    await tradesApi.remove(t.id);
    navigate('/trades');
  };

  return (
    <section>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="mb-1 flex items-center gap-2 flex-wrap">
            {t.instrument_detail.ticker}
            <Badge variant={t.direction === 'LONG' ? 'success' : 'destructive'}>
              {directionLabel(t.direction)}
            </Badge>
            <Badge>{t.trade_type_display}</Badge>
          </h1>
          <div className="text-muted-foreground text-sm">
            {formatDate(t.trade_date)} · {t.strategy_detail?.name ?? 'без стратегии'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link to={`/trades/${t.id}/edit`}>Редактировать</Link>
          </Button>
          <Button variant="destructive" onClick={remove}>Удалить</Button>
        </div>
      </div>

      {isParent && !t.is_closed && (
        <div className="flex items-center gap-3 flex-wrap mt-3.5">
          <Button onClick={() => setAction('average')}>Усреднение</Button>
          <Button onClick={() => setAction('partial-close')} disabled={t.available_volume <= 0}>
            Частичное закрытие
          </Button>
          <Button variant="primary" onClick={() => setAction('close')}>Закрыть позицию</Button>
          <span className="text-muted-foreground text-sm">Доступный объём: {t.available_volume}%</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-4.5">
        <Card className="p-4">
          <div className="stat-label">Цена входа</div>
          <div className="text-2xl font-bold mt-1.5">{t.price}</div>
        </Card>
        <Card className="p-4">
          <div className="stat-label">Объём, % от капитала</div>
          <div className="text-2xl font-bold mt-1.5">{t.volume_from_capital}</div>
        </Card>
        {isParent && (
          <Card className="p-4">
            <div className="stat-label">P&amp;L (пипсы)</div>
            <div className={`text-2xl font-bold mt-1.5 ${pnlClass(t.pips_result)}`}>{formatPips(t.pips_result)}</div>
          </Card>
        )}
      </div>

      {isParent && t.stats && (
        <Card className="mt-3.5">
          <CardHeader>
            <CardTitle>Статистика по сделке</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><div className="text-muted-foreground text-sm">Усреднений</div>{t.stats.averages_count}</div>
              <div><div className="text-muted-foreground text-sm">Частичных закрытий</div>{t.stats.partial_closes_count}</div>
              <div><div className="text-muted-foreground text-sm">Множитель</div>{t.stats.multiplier ?? '—'}</div>
              <div><div className="text-muted-foreground text-sm">Средний стоп</div>{t.stats.avg_stop ? formatNumber(Number(t.stats.avg_stop), 4) : '—'}</div>
              <div><div className="text-muted-foreground text-sm">Средний тейк</div>{t.stats.avg_take ? formatNumber(Number(t.stats.avg_take), 4) : '—'}</div>
              <div><div className="text-muted-foreground text-sm">Цена закрытия</div>{t.stats.close_price ?? '—'}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {(t.planned_stop_loss || t.planned_take_profit || t.commission) && (
        <Card className="mt-3.5">
          <CardHeader>
            <CardTitle>Планирование</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><div className="text-muted-foreground text-sm">Стоп-лосс</div>{t.planned_stop_loss ?? '—'}</div>
              <div><div className="text-muted-foreground text-sm">Тейк-профит</div>{t.planned_take_profit ?? '—'}</div>
              <div><div className="text-muted-foreground text-sm">Комиссия</div>{t.commission ?? '—'}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {t.analysis && (t.analysis.analysis || t.analysis.conclusions || t.analysis.tags?.length) && (
        <Card className="mt-3.5">
          <CardHeader>
            <CardTitle>Анализ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {t.analysis.analysis && (
              <div><span className="text-muted-foreground text-sm">Основание</span><div className="whitespace-pre-wrap mt-1">{t.analysis.analysis}</div></div>
            )}
            {t.analysis.conclusions && (
              <div><span className="text-muted-foreground text-sm">Выводы</span><div className="whitespace-pre-wrap mt-1">{t.analysis.conclusions}</div></div>
            )}
            {t.analysis.emotional_state_display && (
              <div><span className="text-muted-foreground text-sm">Состояние</span><div className="mt-1">{t.analysis.emotional_state_display}</div></div>
            )}
            {t.analysis.tags?.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {t.analysis.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <TradeScreenshots tradeId={t.id} initial={t.screenshots} />

      {isParent && t.child_trades && t.child_trades.length > 0 && (
        <Card className="mt-3.5">
          <CardHeader>
            <CardTitle>История по позиции</CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Цена</TableHead>
                  <TableHead>Объём, %</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.child_trades.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{formatDate(c.trade_date)}</TableCell>
                    <TableCell><Badge>{c.trade_type_display}</Badge></TableCell>
                    <TableCell>{c.price}</TableCell>
                    <TableCell>{c.volume_from_capital}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/trades/${c.id}`}>Открыть</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {action && (
        <ChildTradeModal
          tradeId={t.id}
          action={action}
          availableVolume={t.available_volume}
          instrumentTicker={t.instrument_detail.ticker}
          parentTradeDate={t.trade_date}
          onClose={() => setAction(null)}
          onCreated={() => {
            setAction(null);
            void reload();
          }}
        />
      )}
    </section>
  );
}
