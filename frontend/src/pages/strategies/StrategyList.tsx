import { Link } from 'react-router-dom';
import { strategiesApi } from '../../api/endpoints';
import { useApi } from '../../lib/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Plus, Trash2 } from 'lucide-react';

export default function StrategyList() {
  const { data, loading, error, reload } = useApi(() => strategiesApi.list(), []);

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Загрузка стратегий…</div>;
  if (error) return <Alert variant="destructive">{error}</Alert>;

  const items = data?.results ?? [];

  return (
    <section>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h1 className="mb-0">Стратегии</h1>
        <Button variant="primary" asChild>
          <Link to="/strategies/new"><Plus className="h-4 w-4" /> Новая стратегия</Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            У вас пока нет стратегий. <Link to="/strategies/new">Создать первую</Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {items.map((s) => (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle>
                      <Link to={`/strategies/${s.id}`}>{s.name}</Link>
                    </CardTitle>
                    <div className="text-muted-foreground text-[13px] mt-1">
                      {s.strategy_type_display} · {s.instruments_display}
                    </div>
                  </div>
                  {s.is_active
                    ? <Badge variant="success">Активна</Badge>
                    : <Badge>Отключена</Badge>}
                </div>
              </CardHeader>
              <CardContent>
                {s.description && <p className="text-soft-foreground text-sm mt-0 mb-3">{s.description}</p>}
                <div className="text-muted-foreground text-[13px]">
                  Сделок: {s.trades_count} · Закрытых: {s.closed_trades_count}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Button size="sm" asChild>
                    <Link to={`/strategies/${s.id}/edit`}>Редактировать</Link>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      if (!confirm(`Удалить стратегию «${s.name}»?`)) return;
                      try {
                        await strategiesApi.remove(s.id);
                        reload();
                      } catch (e) {
                        alert(e instanceof Error ? e.message : 'Не удалось удалить');
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Удалить
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
