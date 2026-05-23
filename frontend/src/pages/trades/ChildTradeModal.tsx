import { FormEvent, useState } from 'react';
import { ApiError } from '../../api/client';
import { tradesApi, type ChildTradePayload } from '../../api/endpoints';
import { inputToIso, nowForInput } from '../../lib/datetime';

export type ChildAction = 'average' | 'partial-close' | 'close';

const titles: Record<ChildAction, string> = {
  average: 'Усреднение',
  'partial-close': 'Частичное закрытие',
  close: 'Закрытие позиции',
};

interface Props {
  tradeId: string;
  action: ChildAction;
  availableVolume: number;
  onClose: () => void;
  onCreated: () => void;
}

export default function ChildTradeModal({ tradeId, action, availableVolume, onClose, onCreated }: Props) {
  const [date, setDate] = useState(nowForInput());
  const [price, setPrice] = useState('');
  const [volume, setVolume] = useState<number>(
    action === 'partial-close' ? Math.max(1, Math.floor(availableVolume / 2)) : 10,
  );
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const payload: ChildTradePayload = { trade_date: inputToIso(date), price };
    if (action !== 'close') payload.volume_from_capital = Number(volume);
    try {
      if (action === 'average') await tradesApi.average(tradeId, payload);
      if (action === 'partial-close') await tradesApi.partialClose(tradeId, payload);
      if (action === 'close') await tradesApi.close(tradeId, payload);
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.data && typeof err.data === 'object') {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.data as Record<string, unknown>)) {
          if (Array.isArray(v) && v.length) flat[k] = String(v[0]);
          else if (typeof v === 'string') flat[k] = v;
        }
        setErrors(flat);
      } else {
        setErrors({ _: 'Не удалось выполнить' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(7,11,24,.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
      }}
      onClick={onClose}
    >
      <form
        className="card"
        style={{ width: 480, maxWidth: '92vw' }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <h3>{titles[action]}</h3>
        {errors._ && <div className="flash flash-error">{errors._}</div>}
        <div className="form-row">
          <label>Дата и время</label>
          <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>Цена</label>
          <input
            type="number"
            step="0.0001"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
          {errors.price && <div className="error">{errors.price}</div>}
        </div>
        {action !== 'close' && (
          <div className="form-row">
            <label>Объём, % от капитала</label>
            <input
              type="number"
              min={1}
              max={action === 'partial-close' ? availableVolume - 1 : 100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              required
            />
            <div className="hint">
              Доступный объём: {availableVolume}%
              {action === 'partial-close' && ` (для полного закрытия используйте отдельную кнопку)`}
            </div>
            {errors.volume_from_capital && <div className="error">{errors.volume_from_capital}</div>}
          </div>
        )}
        {action === 'close' && (
          <div className="hint">Будет закрыт весь доступный объём ({availableVolume}%).</div>
        )}
        <div className="row-flex" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Применить'}</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </div>
  );
}
