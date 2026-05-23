import { Link, useParams } from 'react-router-dom';
import { instrumentsApi } from '../../api/endpoints';
import { useApi } from '../../lib/useApi';
import { staticUrl } from '../../lib/urls';

export default function FuturesDetail() {
  const { ticker } = useParams<{ ticker: string }>();
  const { data, loading, error } = useApi(() => instrumentsApi.getFutures(ticker!), [ticker]);

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
          <div className="muted">{data.name || 'Фьючерсный контракт'}</div>
        </div>
        <span className="spacer" />
        <span className="badge badge-blue">Фьючерс</span>
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <div className="card">
          <h3>Параметры контракта</h3>
          <div className="form-row"><span className="muted">Дата экспирации</span><div>{data.expiration_date ?? '—'}</div></div>
          <div className="form-row"><span className="muted">Лот</span><div>{data.lot_size ?? '—'}</div></div>
          <div className="form-row"><span className="muted">Шаг цены</span><div>{data.min_price_step ?? '—'}</div></div>
          <div className="form-row"><span className="muted">Валюта</span><div>{data.currency}</div></div>
        </div>
        <div className="card">
          <h3>Базовый актив</h3>
          <div className="form-row">
            <span className="muted">Тикер</span>
            <div><Link to={`/instruments/${data.base_asset_ticker}`}>{data.base_asset_ticker}</Link></div>
          </div>
          <div className="form-row"><span className="muted">Название</span><div>{data.base_asset_name}</div></div>
          <div className="form-row"><span className="muted">Сектор</span><div>{data.taxonomy.sector ?? '—'}</div></div>
        </div>
      </div>
    </section>
  );
}
