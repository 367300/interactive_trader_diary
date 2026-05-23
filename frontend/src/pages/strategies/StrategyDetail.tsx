import { Link, useParams } from 'react-router-dom';
import { strategiesApi } from '../../api/endpoints';
import { useApi } from '../../lib/useApi';

export default function StrategyDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useApi(() => strategiesApi.get(Number(id)), [id]);

  if (loading) return <div className="empty">Загрузка…</div>;
  if (error) return <div className="flash flash-error">{error}</div>;
  if (!data) return null;

  return (
    <section>
      <div className="row-flex" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0 }}>{data.name}</h1>
          <div className="muted" style={{ marginTop: 4 }}>
            {data.strategy_type_display} · {data.instruments_display} ·{' '}
            {data.is_active ? <span className="badge badge-green">Активна</span> : <span className="badge">Отключена</span>}
          </div>
        </div>
        <Link to={`/strategies/${data.id}/edit`} className="btn">Редактировать</Link>
      </div>

      {data.description && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Описание</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{data.description}</p>
        </div>
      )}

      <div className="grid grid-3" style={{ marginTop: 16 }}>
        <div className="card stat">
          <div className="stat-label">Сделок</div>
          <div className="stat-value">{data.trades_count}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Закрытых</div>
          <div className="stat-value stat-pos">{data.closed_trades_count}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Создана</div>
          <div className="stat-value" style={{ fontSize: 16 }}>
            {new Date(data.created_at).toLocaleDateString('ru-RU')}
          </div>
        </div>
      </div>
    </section>
  );
}
