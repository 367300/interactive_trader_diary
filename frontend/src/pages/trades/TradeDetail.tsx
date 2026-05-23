import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { tradesApi } from '../../api/endpoints';
import { useApi } from '../../lib/useApi';
import { directionLabel, formatDate, formatNumber, formatPips, pnlClass } from '../../lib/format';
import ChildTradeModal, { type ChildAction } from './ChildTradeModal';
import TradeScreenshots from './TradeScreenshots';

export default function TradeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(() => tradesApi.get(id!), [id]);
  const [action, setAction] = useState<ChildAction | null>(null);

  if (loading) return <div className="empty">Загрузка…</div>;
  if (error) return <div className="flash flash-error">{error}</div>;
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
      <div className="row-flex" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0 }}>
            {t.instrument_detail.ticker}{' '}
            <span className={`badge ${t.direction === 'LONG' ? 'badge-green' : 'badge-red'}`}>
              {directionLabel(t.direction)}
            </span>{' '}
            <span className="badge">{t.trade_type_display}</span>
          </h1>
          <div className="muted" style={{ marginTop: 4 }}>
            {formatDate(t.trade_date)} · {t.strategy_detail?.name ?? 'без стратегии'}
          </div>
        </div>
        <div className="row-flex">
          <Link to={`/trades/${t.id}/edit`} className="btn">Редактировать</Link>
          <button className="btn btn-danger" onClick={remove}>Удалить</button>
        </div>
      </div>

      {isParent && !t.is_closed && (
        <div className="row-flex" style={{ marginTop: 14 }}>
          <button className="btn" onClick={() => setAction('average')}>Усреднение</button>
          <button className="btn" onClick={() => setAction('partial-close')} disabled={t.available_volume <= 0}>
            Частичное закрытие
          </button>
          <button className="btn btn-primary" onClick={() => setAction('close')}>Закрыть позицию</button>
          <span className="muted">Доступный объём: {t.available_volume}%</span>
        </div>
      )}

      <div className="grid grid-3" style={{ marginTop: 18 }}>
        <div className="card stat">
          <div className="stat-label">Цена входа</div>
          <div className="stat-value">{t.price}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Объём, % от капитала</div>
          <div className="stat-value">{t.volume_from_capital}</div>
        </div>
        {isParent && (
          <div className="card stat">
            <div className="stat-label">P&amp;L (пипсы)</div>
            <div className={`stat-value ${pnlClass(t.pips_result)}`}>{formatPips(t.pips_result)}</div>
          </div>
        )}
      </div>

      {isParent && t.stats && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Статистика по сделке</h3>
          <div className="grid grid-3">
            <div><div className="muted">Усреднений</div>{t.stats.averages_count}</div>
            <div><div className="muted">Частичных закрытий</div>{t.stats.partial_closes_count}</div>
            <div><div className="muted">Множитель</div>{t.stats.multiplier ?? '—'}</div>
            <div><div className="muted">Средний стоп</div>{t.stats.avg_stop ? formatNumber(Number(t.stats.avg_stop), 4) : '—'}</div>
            <div><div className="muted">Средний тейк</div>{t.stats.avg_take ? formatNumber(Number(t.stats.avg_take), 4) : '—'}</div>
            <div><div className="muted">Цена закрытия</div>{t.stats.close_price ?? '—'}</div>
          </div>
        </div>
      )}

      {(t.planned_stop_loss || t.planned_take_profit || t.commission) && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Планирование</h3>
          <div className="grid grid-3">
            <div><div className="muted">Стоп-лосс</div>{t.planned_stop_loss ?? '—'}</div>
            <div><div className="muted">Тейк-профит</div>{t.planned_take_profit ?? '—'}</div>
            <div><div className="muted">Комиссия</div>{t.commission ?? '—'}</div>
          </div>
        </div>
      )}

      {t.analysis && (t.analysis.analysis || t.analysis.conclusions || t.analysis.tags?.length) && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Анализ</h3>
          {t.analysis.analysis && (
            <div className="form-row"><span className="muted">Основание</span><div style={{ whiteSpace: 'pre-wrap' }}>{t.analysis.analysis}</div></div>
          )}
          {t.analysis.conclusions && (
            <div className="form-row"><span className="muted">Выводы</span><div style={{ whiteSpace: 'pre-wrap' }}>{t.analysis.conclusions}</div></div>
          )}
          {t.analysis.emotional_state_display && (
            <div className="form-row"><span className="muted">Состояние</span><div>{t.analysis.emotional_state_display}</div></div>
          )}
          {t.analysis.tags?.length > 0 && (
            <div className="row-flex">
              {t.analysis.tags.map((tag) => <span key={tag} className="badge">{tag}</span>)}
            </div>
          )}
        </div>
      )}

      <TradeScreenshots tradeId={t.id} initial={t.screenshots} />

      {isParent && t.child_trades && t.child_trades.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>История по позиции</h3>
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тип</th>
                <th>Цена</th>
                <th>Объём, %</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {t.child_trades.map((c) => (
                <tr key={c.id}>
                  <td>{formatDate(c.trade_date)}</td>
                  <td><span className="badge">{c.trade_type_display}</span></td>
                  <td>{c.price}</td>
                  <td>{c.volume_from_capital}</td>
                  <td><Link to={`/trades/${c.id}`} className="btn btn-sm btn-ghost">Открыть</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {action && (
        <ChildTradeModal
          tradeId={t.id}
          action={action}
          availableVolume={t.available_volume}
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
