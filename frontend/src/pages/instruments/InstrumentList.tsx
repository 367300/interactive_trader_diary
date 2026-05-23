import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { instrumentsApi, type InstrumentListParams } from '../../api/endpoints';
import { useApi } from '../../lib/useApi';
import { staticUrl } from '../../lib/urls';
import type { FuturesListItem, InstrumentListItem, Taxonomy } from '../../api/types';

const PAGE_SIZE = 24;

export default function InstrumentList() {
  const [params, setParams] = useState<InstrumentListParams>({ page: 1, type: 'STOCK' });
  const [searchInput, setSearchInput] = useState('');

  const taxonomyQ = useApi<Taxonomy>(() => instrumentsApi.taxonomy(), []);
  const listQ = useApi(() => instrumentsApi.list(params), [JSON.stringify(params)]);

  useEffect(() => {
    const t = setTimeout(() => {
      setParams((p) => ({ ...p, search: searchInput || undefined, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const taxonomy = taxonomyQ.data;

  const industryGroups = useMemo(() => {
    if (!taxonomy || !params.sector) return [];
    return taxonomy.industry_groups.filter((g) => g.sector_id === params.sector);
  }, [taxonomy, params.sector]);

  const industries = useMemo(() => {
    if (!taxonomy || !params.industry_group) return [];
    return taxonomy.industries.filter((i) => i.industry_group_id === params.industry_group);
  }, [taxonomy, params.industry_group]);

  const subIndustries = useMemo(() => {
    if (!taxonomy || !params.industry) return [];
    return taxonomy.sub_industries.filter((s) => s.industry_id === params.industry);
  }, [taxonomy, params.industry]);

  const updateParam = <K extends keyof InstrumentListParams>(key: K, value: InstrumentListParams[K]) => {
    setParams((p) => {
      const next = { ...p, [key]: value, page: 1 };
      if (key === 'sector') {
        next.industry_group = undefined;
        next.industry = undefined;
        next.sub_industry = undefined;
      } else if (key === 'industry_group') {
        next.industry = undefined;
        next.sub_industry = undefined;
      } else if (key === 'industry') {
        next.sub_industry = undefined;
      } else if (key === 'type') {
        next.sector = undefined;
        next.industry_group = undefined;
        next.industry = undefined;
        next.sub_industry = undefined;
      }
      return next;
    });
  };

  const total = listQ.data?.count ?? 0;
  const numPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isFutures = params.type === 'FUTURES';

  return (
    <section>
      <h1>Инструменты</h1>

      <div className="card">
        <div className="grid grid-2" style={{ alignItems: 'end' }}>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Поиск</label>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Тикер или название"
            />
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Тип списка</label>
            <select
              value={params.type ?? 'STOCK'}
              onChange={(e) => updateParam('type', e.target.value as 'STOCK' | 'FUTURES')}
            >
              <option value="STOCK">Акции</option>
              <option value="FUTURES">Фьючерсы</option>
            </select>
          </div>
        </div>

        <div className="grid grid-4" style={{ marginTop: 14 }}>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Сектор</label>
            <select
              value={params.sector ?? ''}
              onChange={(e) => updateParam('sector', e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">Все</option>
              {taxonomy?.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Группа индустрий</label>
            <select
              value={params.industry_group ?? ''}
              onChange={(e) => updateParam('industry_group', e.target.value ? Number(e.target.value) : undefined)}
              disabled={!params.sector}
            >
              <option value="">Все</option>
              {industryGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Индустрия</label>
            <select
              value={params.industry ?? ''}
              onChange={(e) => updateParam('industry', e.target.value ? Number(e.target.value) : undefined)}
              disabled={!params.industry_group}
            >
              <option value="">Все</option>
              {industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Подгруппа</label>
            <select
              value={params.sub_industry ?? ''}
              onChange={(e) => updateParam('sub_industry', e.target.value ? Number(e.target.value) : undefined)}
              disabled={!params.industry}
            >
              <option value="">Все</option>
              {subIndustries.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="muted" style={{ margin: '12px 4px' }}>
        Найдено: {total}
      </div>

      {listQ.loading ? (
        <div className="empty">Загрузка…</div>
      ) : listQ.error ? (
        <div className="flash flash-error">{listQ.error}</div>
      ) : (
        <>
          <div className="grid grid-3">
            {listQ.data?.results.map((item) => (
              isFutures
                ? <FuturesCard key={item.id} item={item as FuturesListItem} />
                : <InstrumentCard key={item.id} item={item as InstrumentListItem} />
            ))}
          </div>
          {numPages > 1 && (
            <div className="row-flex" style={{ justifyContent: 'center', marginTop: 18 }}>
              <button
                className="btn btn-sm"
                disabled={params.page === 1}
                onClick={() => setParams((p) => ({ ...p, page: (p.page ?? 1) - 1 }))}
              >
                ←
              </button>
              <span className="muted">{params.page ?? 1} / {numPages}</span>
              <button
                className="btn btn-sm"
                disabled={(params.page ?? 1) >= numPages}
                onClick={() => setParams((p) => ({ ...p, page: (p.page ?? 1) + 1 }))}
              >
                →
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function InstrumentCard({ item }: { item: InstrumentListItem }) {
  return (
    <Link to={`/instruments/${item.ticker}`} className="card" style={{ display: 'block', textDecoration: 'none' }}>
      <div className="row-flex" style={{ alignItems: 'flex-start' }}>
        {item.logo_url && (
          <img
            src={staticUrl(item.logo_url)}
            alt=""
            style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain', background: '#fff' }}
          />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{item.ticker}</div>
          <div className="muted" style={{ fontSize: 13 }}>{item.name}</div>
        </div>
        <span className="badge">{item.instrument_type_display}</span>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        {item.taxonomy.sector ?? '—'} · лот {item.lot_size} · шаг {item.min_price_step}
      </div>
      {item.trades_count > 0 && (
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Ваши сделки: {item.trades_count} (закрытых {item.closed_trades_count})
        </div>
      )}
    </Link>
  );
}

function FuturesCard({ item }: { item: FuturesListItem }) {
  return (
    <Link to={`/instruments/futures/${item.ticker}`} className="card" style={{ display: 'block', textDecoration: 'none' }}>
      <div className="row-flex" style={{ alignItems: 'flex-start' }}>
        {item.logo_url && (
          <img
            src={staticUrl(item.logo_url)}
            alt=""
            style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain', background: '#fff' }}
          />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{item.ticker}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Базовый актив: {item.base_asset_ticker}
          </div>
        </div>
        <span className="badge badge-blue">Фьючерс</span>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        {item.expiration_date ? `Экспирация: ${item.expiration_date}` : 'Без даты'} ·
        лот {item.lot_size ?? '—'} · шаг {item.min_price_step ?? '—'}
      </div>
    </Link>
  );
}
