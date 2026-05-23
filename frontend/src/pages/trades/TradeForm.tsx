import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { instrumentsApi, strategiesApi, tradesApi } from '../../api/endpoints';
import { useApi } from '../../lib/useApi';
import { isoToInput, nowForInput, inputToIso } from '../../lib/datetime';
import type { EmotionalState, InstrumentListItem, Trade, TradeAnalysis } from '../../api/types';
import Select from '../../components/Select';

interface FormState {
  strategy: string;
  instrument: string;
  instrument_search: string;
  trade_date: string;
  direction: 'LONG' | 'SHORT';
  price: string;
  commission: string;
  planned_stop_loss: string;
  planned_take_profit: string;
  volume_from_capital: number;
  analysis: string;
  conclusions: string;
  emotional_state: EmotionalState;
  tags: string;
}

const emptyForm: FormState = {
  strategy: '',
  instrument: '',
  instrument_search: '',
  trade_date: nowForInput(),
  direction: 'LONG',
  price: '',
  commission: '',
  planned_stop_loss: '',
  planned_take_profit: '',
  volume_from_capital: 10,
  analysis: '',
  conclusions: '',
  emotional_state: '',
  tags: '',
};

const emotionChoices: { value: EmotionalState; label: string }[] = [
  { value: '', label: 'Не выбрано' },
  { value: 'CALM', label: 'Спокойное' },
  { value: 'EXCITED', label: 'Возбужденное' },
  { value: 'FEARFUL', label: 'Страх' },
  { value: 'GREEDY', label: 'Жадность' },
  { value: 'CONFIDENT', label: 'Уверенное' },
];

function tagsToList(value: string) {
  return value.split(',').map((t) => t.trim()).filter(Boolean);
}

function listToTags(list: string[] | undefined) {
  return (list ?? []).join(', ');
}

export default function TradeForm() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [instruments, setInstruments] = useState<InstrumentListItem[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showInstruments = !form.instrument && instruments.length > 0;

  const strategiesQ = useApi(() => strategiesApi.list(), []);
  const editQ = useApi<Trade | null>(
    () => (isEdit ? tradesApi.get(id!) : Promise.resolve(null)),
    [id],
  );

  const strategyOptions = useMemo(() => {
    const list = strategiesQ.data?.results ?? [];
    return [
      { value: '', label: 'Без стратегии' },
      ...list
        .filter((s) => s.is_active || String(s.id) === form.strategy)
        .map((s) => ({ value: String(s.id), label: s.name })),
    ];
  }, [strategiesQ.data, form.strategy]);

  const directionOptions = [
    { value: 'LONG', label: 'Лонг' },
    { value: 'SHORT', label: 'Шорт' },
  ];

  useEffect(() => {
    if (editQ.data) {
      const t = editQ.data;
      setForm({
        strategy: String(t.strategy ?? ''),
        instrument: String(t.instrument),
        instrument_search: t.instrument_detail.ticker,
        trade_date: isoToInput(t.trade_date),
        direction: t.direction,
        price: t.price,
        commission: t.commission ?? '',
        planned_stop_loss: t.planned_stop_loss ?? '',
        planned_take_profit: t.planned_take_profit ?? '',
        volume_from_capital: t.volume_from_capital,
        analysis: t.analysis?.analysis ?? '',
        conclusions: t.analysis?.conclusions ?? '',
        emotional_state: (t.analysis?.emotional_state ?? '') as EmotionalState,
        tags: listToTags(t.analysis?.tags),
      });
    }
  }, [editQ.data]);

  useEffect(() => {
    const query = form.instrument_search.trim();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query) {
      setInstruments([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await instrumentsApi.list({ search: query, type: 'STOCK' });
        setInstruments(res.results as InstrumentListItem[]);
      } catch {
        setInstruments([]);
      }
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [form.instrument_search]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    if (!form.instrument) {
      setErrors({ instrument: 'Выберите инструмент из списка' });
      setBusy(false);
      return;
    }
    const payload: Partial<Trade> & { analysis?: TradeAnalysis | null } = {
      strategy: form.strategy ? Number(form.strategy) : null,
      instrument: Number(form.instrument),
      trade_date: inputToIso(form.trade_date),
      direction: form.direction,
      price: form.price,
      commission: form.commission || null,
      planned_stop_loss: form.planned_stop_loss || null,
      planned_take_profit: form.planned_take_profit || null,
      volume_from_capital: Number(form.volume_from_capital),
      analysis: {
        analysis: form.analysis,
        conclusions: form.conclusions,
        emotional_state: form.emotional_state,
        tags: tagsToList(form.tags),
      },
    };

    try {
      const result = isEdit
        ? await tradesApi.update(id!, payload)
        : await tradesApi.create(payload);
      navigate(`/trades/${result.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.data && typeof err.data === 'object') {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.data as Record<string, unknown>)) {
          if (Array.isArray(v) && v.length) flat[k] = String(v[0]);
          else if (typeof v === 'string') flat[k] = v;
        }
        setErrors(flat);
      } else {
        setErrors({ _: 'Не удалось сохранить' });
      }
    } finally {
      setBusy(false);
    }
  };

  if ((isEdit && editQ.loading) || strategiesQ.loading) return <div className="empty">Загрузка…</div>;

  return (
    <section>
      <h1>{isEdit ? 'Редактирование сделки' : 'Новая сделка'}</h1>
      <form onSubmit={onSubmit} className="card" style={{ maxWidth: 900 }}>
        {errors._ && <div className="flash flash-error">{errors._}</div>}

        <div className="grid grid-2">
          <div className="form-row">
            <label>Стратегия</label>
            <Select
              value={form.strategy}
              options={strategyOptions}
              onChange={(v) => setForm({ ...form, strategy: v })}
              placeholder="Без стратегии"
              searchable={strategyOptions.length > 8}
            />
            {errors.strategy && <div className="error">{errors.strategy}</div>}
          </div>

          <div className="form-row" style={{ position: 'relative' }}>
            <label>Инструмент</label>
            <input
              value={form.instrument_search}
              onChange={(e) => setForm({ ...form, instrument_search: e.target.value, instrument: '' })}
              placeholder="Введите тикер или часть названия"
              disabled={isEdit}
              autoComplete="off"
            />
            {!isEdit && showInstruments && (
              <div
                className="card"
                style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5,
                  padding: 6, maxHeight: 240, overflowY: 'auto',
                }}
              >
                {instruments.slice(0, 12).map((i) => (
                  <div
                    key={i.id}
                    style={{ padding: '6px 10px', cursor: 'pointer', borderRadius: 6 }}
                    onClick={() => {
                      setForm((prev) => ({
                        ...prev,
                        instrument: String(i.id),
                        instrument_search: i.ticker,
                      }));
                    }}
                  >
                    <strong>{i.ticker}</strong> <span className="muted">— {i.name}</span>
                  </div>
                ))}
              </div>
            )}
            {errors.instrument && <div className="error">{errors.instrument}</div>}
          </div>
        </div>

        <div className="grid grid-3">
          <div className="form-row">
            <label>Дата и время</label>
            <input
              type="datetime-local"
              value={form.trade_date}
              onChange={(e) => setForm({ ...form, trade_date: e.target.value })}
              required
            />
          </div>
          <div className="form-row">
            <label>Направление</label>
            <Select
              value={form.direction}
              options={directionOptions}
              onChange={(v) => setForm({ ...form, direction: v as 'LONG' | 'SHORT' })}
            />
          </div>
          <div className="form-row">
            <label>Объём от капитала, %</label>
            <input
              type="number"
              min={1}
              max={100}
              value={form.volume_from_capital}
              onChange={(e) => setForm({ ...form, volume_from_capital: Number(e.target.value) })}
              required
            />
          </div>
        </div>

        <div className="grid grid-3">
          <div className="form-row">
            <label>Цена входа</label>
            <input
              type="number"
              step="0.0001"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              required
            />
            {errors.price && <div className="error">{errors.price}</div>}
          </div>
          <div className="form-row">
            <label>Стоп-лосс</label>
            <input
              type="number"
              step="0.0001"
              value={form.planned_stop_loss}
              onChange={(e) => setForm({ ...form, planned_stop_loss: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>Тейк-профит</label>
            <input
              type="number"
              step="0.0001"
              value={form.planned_take_profit}
              onChange={(e) => setForm({ ...form, planned_take_profit: e.target.value })}
            />
          </div>
        </div>

        <div className="form-row">
          <label>Комиссия (₽)</label>
          <input
            type="number"
            step="0.01"
            value={form.commission}
            onChange={(e) => setForm({ ...form, commission: e.target.value })}
          />
        </div>

        <h3 style={{ marginTop: 20 }}>Анализ</h3>
        <div className="form-row">
          <label>Основание</label>
          <textarea
            rows={3}
            value={form.analysis}
            onChange={(e) => setForm({ ...form, analysis: e.target.value })}
          />
        </div>
        <div className="form-row">
          <label>Выводы на будущее</label>
          <textarea
            rows={3}
            value={form.conclusions}
            onChange={(e) => setForm({ ...form, conclusions: e.target.value })}
          />
        </div>
        <div className="grid grid-2">
          <div className="form-row">
            <label>Эмоциональное состояние</label>
            <Select
              value={form.emotional_state}
              options={emotionChoices.map((c) => ({ value: c.value, label: c.label }))}
              onChange={(v) => setForm({ ...form, emotional_state: v as EmotionalState })}
              placeholder="Не выбрано"
            />
          </div>
          <div className="form-row">
            <label>Теги (через запятую)</label>
            <input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="ошибка, эмоции, тренд"
            />
          </div>
        </div>

        <div className="row-flex" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Сохраняем…' : isEdit ? 'Сохранить' : 'Создать сделку'}
          </button>
          <Link to="/trades" className="btn btn-ghost">Отмена</Link>
        </div>
      </form>
    </section>
  );
}
