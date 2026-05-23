import { Link } from 'react-router-dom';
import { coreApi } from '../api/endpoints';
import { useApi } from '../lib/useApi';
import { directionLabel, formatDate, formatNumber, formatPips, pnlClass } from '../lib/format';

export default function Dashboard() {
  const { data, loading, error } = useApi(() => coreApi.dashboard(), []);

  if (loading) return <div className="empty">Загрузка дашборда…</div>;
  if (error) return <div className="flash flash-error">{error}</div>;
  if (!data) return null;

  const { aggregate, recent_trades, active_strategies } = data;

  return (
    <section>
      <h1>Дашборд</h1>

      <div className="grid grid-4">
        <div className="card stat">
          <div className="stat-label">Всего сделок</div>
          <div className="stat-value">{aggregate.total_trades}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Закрытых</div>
          <div className="stat-value stat-pos">{aggregate.closed_trades}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Открытых</div>
          <div className="stat-value stat-mute">{aggregate.open_trades}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Активных стратегий</div>
          <div className="stat-value">{active_strategies.length}</div>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginTop: 16 }}>
        <div className="card stat">
          <div className="stat-label">Win rate</div>
          <div className="stat-value">{formatNumber(aggregate.win_rate, 1)}%</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {aggregate.win_count} побед / {aggregate.loss_count} проигрышей
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">P&amp;L (пипсы)</div>
          <div className={`stat-value ${pnlClass(aggregate.total_pnl_pips)}`}>
            {formatPips(aggregate.total_pnl_pips)}
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">Среднее на сделку</div>
          <div className={`stat-value ${pnlClass(aggregate.avg_trade_pips)}`}>
            {formatPips(aggregate.avg_trade_pips)}
          </div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="row-flex" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Последние сделки</h3>
            <Link to="/trades" className="btn btn-sm btn-ghost">Все →</Link>
          </div>
          {recent_trades.length === 0 ? (
            <div className="empty">
              Сделок пока нет. <Link to="/trades/new">Создать первую</Link>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Тикер</th>
                  <th>Направление</th>
                  <th>Цена</th>
                  <th>Пипсы</th>
                </tr>
              </thead>
              <tbody>
                {recent_trades.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDate(t.trade_date)}</td>
                    <td>
                      <Link to={`/trades/${t.id}`}>{t.instrument_detail.ticker}</Link>
                    </td>
                    <td>
                      <span className={`badge ${t.direction === 'LONG' ? 'badge-green' : 'badge-red'}`}>
                        {directionLabel(t.direction)}
                      </span>
                    </td>
                    <td>{t.price}</td>
                    <td className={pnlClass(t.pips_result)}>{formatPips(t.pips_result)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="row-flex" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Активные стратегии</h3>
            <Link to="/strategies" className="btn btn-sm btn-ghost">Управлять →</Link>
          </div>
          {active_strategies.length === 0 ? (
            <div className="empty">
              Нет активных стратегий. <Link to="/strategies/new">Создать</Link>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {active_strategies.map((s) => (
                <li key={s.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--brd)' }}>
                  <Link to={`/strategies/${s.id}`}>{s.name}</Link>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {s.strategy_type} · {s.instruments}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
