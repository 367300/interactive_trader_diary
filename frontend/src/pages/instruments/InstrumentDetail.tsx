import { Link, useParams } from 'react-router-dom';
import { instrumentsApi } from '../../api/endpoints';
import { useApi } from '../../lib/useApi';
import { staticUrl } from '../../lib/urls';

export default function InstrumentDetail() {
  const { ticker } = useParams<{ ticker: string }>();
  const { data, loading, error } = useApi(() => instrumentsApi.get(ticker!), [ticker]);

  if (loading) return <div className="empty">Загрузка…</div>;
  if (error) return <div className="flash flash-error">{error}</div>;
  if (!data) return null;

  return (
    <section>
      <div className="row-flex" style={{ alignItems: 'center' }}>
        {data.og_logo_url && (
          <img
            src={staticUrl(data.og_logo_url)}
            alt=""
            style={{ width: 64, height: 64, borderRadius: 12, background: '#fff', objectFit: 'contain' }}
          />
        )}
        <div>
          <h1 style={{ margin: 0 }}>{data.ticker}</h1>
          <div className="muted">{data.name}</div>
        </div>
        <span className="spacer" />
        <span className="badge">{data.instrument_type_display}</span>
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <div className="card">
          <h3>Параметры</h3>
          <div className="form-row"><span className="muted">Размер лота</span><div>{data.lot_size}</div></div>
          <div className="form-row"><span className="muted">Минимальный шаг цены</span><div>{data.min_price_step}</div></div>
          <div className="form-row"><span className="muted">Валюта</span><div>{data.currency}</div></div>
        </div>
        <div className="card">
          <h3>Классификация</h3>
          <div className="form-row"><span className="muted">Сектор</span><div>{data.taxonomy.sector ?? '—'}</div></div>
          <div className="form-row"><span className="muted">Группа индустрий</span><div>{data.taxonomy.industry_group ?? '—'}</div></div>
          <div className="form-row"><span className="muted">Индустрия</span><div>{data.taxonomy.industry ?? '—'}</div></div>
          <div className="form-row"><span className="muted">Подгруппа</span><div>{data.taxonomy.sub_industry ?? '—'}</div></div>
        </div>
      </div>

      {data.description && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Описание</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{data.description}</p>
        </div>
      )}

      {data.futures.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Связанные фьючерсы</h3>
          <table>
            <thead>
              <tr>
                <th>Тикер</th>
                <th>Экспирация</th>
                <th>Лот</th>
                <th>Шаг</th>
              </tr>
            </thead>
            <tbody>
              {data.futures.map((f) => (
                <tr key={f.id}>
                  <td><Link to={`/instruments/futures/${f.ticker}`}>{f.ticker}</Link></td>
                  <td>{f.expiration_date ?? '—'}</td>
                  <td>{f.lot_size ?? '—'}</td>
                  <td>{f.min_price_step ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
