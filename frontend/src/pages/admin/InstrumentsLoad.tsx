import { FormEvent, useState } from 'react';
import { coreApi } from '../../api/endpoints';
import Select from '../../components/Select';

export default function InstrumentsLoad() {
  const [type, setType] = useState('STOCK');
  const [updateExisting, setUpdateExisting] = useState(false);
  const [limit, setLimit] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const res = await coreApi.loadInstruments({
        instrument_type: type,
        update_existing: updateExisting,
        limit: limit ? Number(limit) : null,
      });
      setResult(`Задача запущена. ID: ${res.task_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка запуска задачи');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h1>Загрузка инструментов с MOEX</h1>
      <p className="muted">
        Запускает фоновую задачу Celery, которая обращается к ISS Мосбиржи и пополняет/обновляет
        справочник.
      </p>
      <form onSubmit={onSubmit} className="card" style={{ maxWidth: 560 }}>
        {result && <div className="flash flash-success">{result}</div>}
        {error && <div className="flash flash-error">{error}</div>}
        <div className="form-row">
          <label>Тип инструмента</label>
          <Select
            value={type}
            options={[
              { value: 'STOCK', label: 'Акции' },
              { value: 'FUTURES', label: 'Фьючерсы' },
            ]}
            onChange={setType}
          />
        </div>
        <div className="form-row">
          <label>
            <input
              type="checkbox"
              checked={updateExisting}
              onChange={(e) => setUpdateExisting(e.target.checked)}
              style={{ width: 'auto', marginRight: 8, verticalAlign: 'middle' }}
            />
            Обновлять существующие записи
          </label>
        </div>
        <div className="form-row">
          <label>Лимит (необязательно)</label>
          <input
            type="number"
            min={1}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="например, 50"
          />
          <div className="hint">Пусто — без ограничения.</div>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Запускаем…' : 'Запустить задачу'}
        </button>
      </form>
    </section>
  );
}
