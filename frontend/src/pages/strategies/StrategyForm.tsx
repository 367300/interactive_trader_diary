import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { strategiesApi } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { useApi } from '../../lib/useApi';
import type { Strategy, StrategyChoices } from '../../api/types';

type FormState = {
  name: string;
  description: string;
  strategy_type: string;
  instruments: string;
  is_active: boolean;
};

const empty: FormState = {
  name: '',
  description: '',
  strategy_type: 'DAY_TRADING',
  instruments: 'BOTH',
  is_active: true,
};

export default function StrategyForm() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const choicesQ = useApi<StrategyChoices>(() => strategiesApi.choices(), []);
  const editQ = useApi<Strategy | null>(
    () => (isEdit ? strategiesApi.get(Number(id)) : Promise.resolve(null)),
    [id],
  );

  useEffect(() => {
    if (editQ.data) {
      setForm({
        name: editQ.data.name,
        description: editQ.data.description,
        strategy_type: editQ.data.strategy_type,
        instruments: editQ.data.instruments,
        is_active: editQ.data.is_active,
      });
    }
  }, [editQ.data]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      if (isEdit) {
        await strategiesApi.update(Number(id), form);
      } else {
        await strategiesApi.create(form);
      }
      navigate('/strategies');
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

  if (choicesQ.loading || editQ.loading) return <div className="empty">Загрузка…</div>;

  return (
    <section>
      <h1>{isEdit ? 'Редактирование стратегии' : 'Новая стратегия'}</h1>
      <form onSubmit={onSubmit} className="card" style={{ maxWidth: 720 }}>
        {errors._ && <div className="flash flash-error">{errors._}</div>}
        <div className="form-row">
          <label>Название</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            minLength={3}
            required
          />
          {errors.name && <div className="error">{errors.name}</div>}
        </div>
        <div className="form-row">
          <label>Описание</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
            placeholder="Подробное описание, правила входа и выхода…"
          />
          {errors.description && <div className="error">{errors.description}</div>}
        </div>
        <div className="grid grid-2">
          <div className="form-row">
            <label>Тип стратегии</label>
            <select
              value={form.strategy_type}
              onChange={(e) => setForm({ ...form, strategy_type: e.target.value })}
            >
              {choicesQ.data?.strategy_types.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Инструменты</label>
            <select
              value={form.instruments}
              onChange={(e) => setForm({ ...form, instruments: e.target.value })}
            >
              {choicesQ.data?.instruments.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <label>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              style={{ width: 'auto', marginRight: 8, verticalAlign: 'middle' }}
            />
            Активная стратегия (доступна при создании сделок)
          </label>
        </div>
        <div className="row-flex">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Сохраняем…' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate('/strategies')}
          >
            Отмена
          </button>
        </div>
      </form>
    </section>
  );
}
