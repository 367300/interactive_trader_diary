import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { strategiesApi } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { useApi } from '../../lib/useApi';
import type { Strategy, StrategyChoices, StrategyType, StrategyInstruments } from '../../api/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type FormState = {
  name: string;
  description: string;
  strategy_type: StrategyType;
  instruments: StrategyInstruments;
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

  if (choicesQ.loading || editQ.loading)
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Загрузка…</div>;

  return (
    <section>
      <h1>{isEdit ? 'Редактирование стратегии' : 'Новая стратегия'}</h1>
      <Card className="max-w-[720px]">
        <CardContent className="pt-6">
          <form onSubmit={onSubmit}>
            {errors._ && <Alert variant="destructive" className="mb-4">{errors._}</Alert>}
            <div className="space-y-2 mb-4">
              <Label>Название</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                minLength={3}
                required
              />
              {errors.name && <p className="text-xs text-red">{errors.name}</p>}
            </div>
            <div className="space-y-2 mb-4">
              <Label>Описание</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
                placeholder="Подробное описание, правила входа и выхода…"
              />
              {errors.description && <p className="text-xs text-red">{errors.description}</p>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <Label>Тип стратегии</Label>
                <Select
                  value={form.strategy_type}
                  onValueChange={(v) => setForm({ ...form, strategy_type: v as StrategyType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(choicesQ.data?.strategy_types ?? []).map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Инструменты</Label>
                <Select
                  value={form.instruments}
                  onValueChange={(v) => setForm({ ...form, instruments: v as StrategyInstruments })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(choicesQ.data?.instruments ?? []).map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <Checkbox
                id="is_active"
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked === true })}
              />
              <Label htmlFor="is_active" className="cursor-pointer">
                Активная стратегия (доступна при создании сделок)
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="primary" disabled={busy}>
                {busy ? 'Сохраняем…' : isEdit ? 'Сохранить' : 'Создать'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => navigate('/strategies')}>
                Отмена
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
