import { FormEvent, useRef, useState } from 'react';
import { coreApi } from '../../api/endpoints';
import { ApiError } from '../../api/client';
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

      <CsvUpload />
    </section>
  );
}

function CsvUpload() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const onFileChange = () => {
    const file = fileRef.current?.files?.[0];
    setFileName(file?.name ?? null);
    setMsg(null);
    setErr(null);
  };

  const onUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await coreApi.uploadEnrichmentCsv(file);
      setMsg(res.detail);
      setFileName(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Ошибка загрузки файла');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 560, marginTop: 20 }}>
      <h3>CSV-файл обогащения</h3>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 14px' }}>
        Загрузите <code>moex_stocks_enriched.csv</code> — при запуске задачи скрипт
        автоматически обогатит инструменты данными из этого файла.
      </p>
      {msg && <div className="flash flash-success">{msg}</div>}
      {err && <div className="flash flash-error">{err}</div>}
      <div className="row-flex">
        <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
          Выбрать файл
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
        </label>
        {fileName && <span className="muted" style={{ fontSize: 13 }}>{fileName}</span>}
        <button
          className="btn btn-primary btn-sm"
          disabled={!fileName || uploading}
          onClick={onUpload}
        >
          {uploading ? 'Загрузка…' : 'Загрузить CSV'}
        </button>
      </div>
    </div>
  );
}
