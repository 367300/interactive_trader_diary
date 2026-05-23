import { useState } from 'react';
import { Link } from 'react-router-dom';
import { tradesApi } from '../../api/endpoints';
import { useApi } from '../../lib/useApi';
import { directionLabel, formatDate, formatPips, pnlClass } from '../../lib/format';

const PAGE_SIZE = 24;

export default function TradeList() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useApi(() => tradesApi.list({ page }), [page]);

  if (loading) return <div className="empty">Загрузка…</div>;
  if (error) return <div className="flash flash-error">{error}</div>;
  if (!data) return null;

  const total = data.count;
  const numPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section>
      <div className="row-flex" style={{ justifyContent: 'space-between' }}>
        <h1>Все сделки</h1>
        <Link to="/trades/new" className="btn btn-primary">+ Новая сделка</Link>
      </div>

      {data.results.length === 0 ? (
        <div className="card empty">
          Сделок пока нет. <Link to="/trades/new">Создать первую</Link>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тикер</th>
                <th>Стратегия</th>
                <th>Направление</th>
                <th>Цена</th>
                <th>Объём, %</th>
                <th>Статус</th>
                <th>Пипсы</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((t) => (
                <tr key={t.id}>
                  <td>{formatDate(t.trade_date)}</td>
                  <td>
                    <Link to={`/trades/${t.id}`}>{t.instrument_detail.ticker}</Link>
                  </td>
                  <td>{t.strategy_detail?.name ?? '—'}</td>
                  <td>
                    <span className={`badge ${t.direction === 'LONG' ? 'badge-green' : 'badge-red'}`}>
                      {directionLabel(t.direction)}
                    </span>
                  </td>
                  <td>{t.price}</td>
                  <td>{t.volume_from_capital}%</td>
                  <td>
                    {t.is_closed
                      ? <span className="badge">Закрыта</span>
                      : <span className="badge badge-blue">Открыта</span>}
                  </td>
                  <td className={pnlClass(t.pips_result)}>{formatPips(t.pips_result)}</td>
                  <td><Link to={`/trades/${t.id}`} className="btn btn-sm btn-ghost">Открыть</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          {numPages > 1 && (
            <div className="row-flex" style={{ justifyContent: 'center', marginTop: 12 }}>
              <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>←</button>
              <span className="muted">{page} / {numPages}</span>
              <button className="btn btn-sm" disabled={page >= numPages} onClick={() => setPage(page + 1)}>→</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
