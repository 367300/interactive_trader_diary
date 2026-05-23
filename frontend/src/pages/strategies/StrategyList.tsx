import { Link } from 'react-router-dom';
import { strategiesApi } from '../../api/endpoints';
import { useApi } from '../../lib/useApi';

export default function StrategyList() {
  const { data, loading, error, reload } = useApi(() => strategiesApi.list(), []);

  if (loading) return <div className="empty">Загрузка стратегий…</div>;
  if (error) return <div className="flash flash-error">{error}</div>;

  const items = data?.results ?? [];

  return (
    <section>
      <div className="row-flex" style={{ justifyContent: 'space-between' }}>
        <h1>Стратегии</h1>
        <Link to="/strategies/new" className="btn btn-primary">+ Новая стратегия</Link>
      </div>

      {items.length === 0 ? (
        <div className="card empty">
          У вас пока нет стратегий. <Link to="/strategies/new">Создать первую</Link>
        </div>
      ) : (
        <div className="grid grid-2">
          {items.map((s) => (
            <div key={s.id} className="card">
              <div className="row-flex" style={{ justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0 }}>
                    <Link to={`/strategies/${s.id}`}>{s.name}</Link>
                  </h3>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    {s.strategy_type_display} · {s.instruments_display}
                  </div>
                </div>
                {s.is_active ? (
                  <span className="badge badge-green">Активна</span>
                ) : (
                  <span className="badge">Отключена</span>
                )}
              </div>
              {s.description && <p style={{ marginTop: 10 }}>{s.description}</p>}
              <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>
                Сделок: {s.trades_count} · Закрытых: {s.closed_trades_count}
              </div>
              <div className="row-flex" style={{ marginTop: 12 }}>
                <Link to={`/strategies/${s.id}/edit`} className="btn btn-sm">Редактировать</Link>
                <button
                  className="btn btn-sm btn-danger"
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
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
