import { ChangeEvent, useState } from 'react';
import { tradesApi } from '../../api/endpoints';
import type { TradeScreenshot } from '../../api/types';

interface Props {
  tradeId: string;
  initial: TradeScreenshot[];
}

export default function TradeScreenshots({ tradeId, initial }: Props) {
  const [items, setItems] = useState<TradeScreenshot[]>(initial);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      const created: TradeScreenshot[] = [];
      for (const file of files) {
        const item = await tradesApi.screenshots.upload(tradeId, file, description);
        created.push(item);
      }
      setItems((prev) => [...created, ...prev]);
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const remove = async (id: number) => {
    if (!confirm('Удалить скриншот?')) return;
    try {
      await tradesApi.screenshots.remove(tradeId, id);
      setItems((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Не удалось удалить');
    }
  };

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>Скриншоты</h3>
      {error && <div className="flash flash-error">{error}</div>}
      <div className="row-flex" style={{ marginBottom: 10 }}>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание (необязательно)"
          style={{ flex: 1, minWidth: 200 }}
        />
        <label className="btn">
          {busy ? 'Загружаем…' : 'Добавить файл'}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onChange={onUpload}
            style={{ display: 'none' }}
          />
        </label>
      </div>
      {items.length === 0 ? (
        <div className="muted">Скриншотов пока нет.</div>
      ) : (
        <div className="grid grid-3">
          {items.map((s) => (
            <div key={s.id} className="card" style={{ padding: 8 }}>
              <a href={s.image_url} target="_blank" rel="noreferrer">
                <img
                  src={s.image_url}
                  alt={s.description}
                  style={{ width: '100%', borderRadius: 8, display: 'block' }}
                />
              </a>
              {s.description && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{s.description}</div>}
              <button
                className="btn btn-sm btn-danger"
                style={{ marginTop: 8 }}
                onClick={() => remove(s.id)}
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
