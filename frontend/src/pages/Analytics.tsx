import { Link } from 'react-router-dom';
import { tradesApi } from '../api/endpoints';
import { useApi } from '../lib/useApi';
import { formatNumber, formatPips, pnlClass } from '../lib/format';

export default function Analytics() {
  const { data, loading, error } = useApi(() => tradesApi.analytics(), []);
  if (loading) return <div className="empty">Загрузка…</div>;
  if (error) return <div className="flash flash-error">{error}</div>;
  if (!data) return null;

  const a = data.aggregate;

  return (
    <section>
      <h1>Аналитика</h1>

      <div className="grid grid-4">
        <div className="card stat">
          <div className="stat-label">Сделок</div>
          <div className="stat-value">{a.total_trades}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Win rate</div>
          <div className="stat-value">{formatNumber(a.win_rate, 1)}%</div>
        </div>
        <div className="card stat">
          <div className="stat-label">P&amp;L (пипсы)</div>
          <div className={`stat-value ${pnlClass(a.total_pnl_pips)}`}>{formatPips(a.total_pnl_pips)}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Среднее</div>
          <div className={`stat-value ${pnlClass(a.avg_trade_pips)}`}>{formatPips(a.avg_trade_pips)}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>По стратегиям</h3>
          {data.strategies.length === 0 ? (
            <div className="muted">Сделки ещё не привязаны к стратегиям.</div>
          ) : (
            <table>
              <thead><tr><th>Стратегия</th><th>Сделок</th></tr></thead>
              <tbody>
                {data.strategies.map((s) => (
                  <tr key={s.id}>
                    <td><Link to={`/strategies/${s.id}`}>{s.name}</Link></td>
                    <td>{s.trades_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h3>По инструментам</h3>
          {data.instruments.length === 0 ? (
            <div className="muted">Сделок по инструментам пока нет.</div>
          ) : (
            <table>
              <thead><tr><th>Тикер</th><th>Название</th><th>Сделок</th></tr></thead>
              <tbody>
                {data.instruments.map((i) => (
                  <tr key={i.id}>
                    <td><Link to={`/instruments/${i.ticker}`}>{i.ticker}</Link></td>
                    <td>{i.name}</td>
                    <td>{i.trades_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
