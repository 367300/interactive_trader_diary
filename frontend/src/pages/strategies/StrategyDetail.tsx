import { Link, useParams } from 'react-router-dom';
import { strategiesApi } from '../../api/endpoints';
import { useApi } from '../../lib/useApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export default function StrategyDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useApi(() => strategiesApi.get(Number(id)), [id]);

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Загрузка…</div>;
  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!data) return null;

  return (
    <section>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="mb-1">{data.name}</h1>
          <div className="text-muted-foreground text-sm flex items-center gap-2 flex-wrap">
            {data.strategy_type_display} · {data.instruments_display} ·{' '}
            {data.is_active ? <Badge variant="success">Активна</Badge> : <Badge>Отключена</Badge>}
          </div>
        </div>
        <Button asChild>
          <Link to={`/strategies/${data.id}/edit`}>Редактировать</Link>
        </Button>
      </div>

      {data.description && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Описание</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-soft-foreground">{data.description}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-4">
        <Card className="p-4">
          <div className="stat-label">Сделок</div>
          <div className="text-2xl font-bold mt-1.5">{data.trades_count}</div>
        </Card>
        <Card className="p-4">
          <div className="stat-label">Закрытых</div>
          <div className="text-2xl font-bold mt-1.5 text-green">{data.closed_trades_count}</div>
        </Card>
        <Card className="p-4">
          <div className="stat-label">Создана</div>
          <div className="text-base font-bold mt-1.5">
            {new Date(data.created_at).toLocaleDateString('ru-RU')}
          </div>
        </Card>
      </div>
    </section>
  );
}
