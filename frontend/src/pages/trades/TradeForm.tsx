import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { instrumentsApi, strategiesApi, tradesApi } from '../../api/endpoints';
import { useApi } from '../../lib/useApi';
import { isoToInput, nowForInput, inputToIso } from '../../lib/datetime';
import type { EmotionalState, InstrumentListItem, Trade, TradeAnalysis } from '../../api/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import ChartPricePickerDialog from '@/components/ChartPricePickerDialog';

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

const emotionChoices: { value: string; label: string }[] = [
  { value: '__none__', label: 'Не выбрано' },
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
  const [chartOpen, setChartOpen] = useState(false);
  const showInstruments = !form.instrument && instruments.length > 0;

  const strategiesQ = useApi(() => strategiesApi.list(), []);
  const editQ = useApi<Trade | null>(
    () => (isEdit ? tradesApi.get(id!) : Promise.resolve(null)),
    [id],
  );

  const strategyOptions = useMemo(() => {
    const list = strategiesQ.data?.results ?? [];
    return [
      { value: '__none__', label: 'Без стратегии' },
      ...list
        .filter((s) => s.is_active || String(s.id) === form.strategy)
        .map((s) => ({ value: String(s.id), label: s.name })),
    ];
  }, [strategiesQ.data, form.strategy]);

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

  if ((isEdit && editQ.loading) || strategiesQ.loading)
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Загрузка…</div>;

  return (
    <section>
      <h1>{isEdit ? 'Редактирование сделки' : 'Новая сделка'}</h1>
      {!isEdit && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            background: '#eff6ff',
            border: '1px solid #93c5fd',
            borderRadius: 6,
          }}
        >
          Нужно быстро записать уже завершённую сделку?{' '}
          <Link to="/trades/quick">Быстрый ввод цепочки →</Link>
        </div>
      )}
      <Card className="max-w-[900px]">
        <CardContent className="pt-6">
          <form onSubmit={onSubmit}>
            {errors._ && <Alert variant="destructive" className="mb-4">{errors._}</Alert>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <Label>Стратегия</Label>
                <Select
                  value={form.strategy || '__none__'}
                  onValueChange={(v) => setForm({ ...form, strategy: v === '__none__' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Без стратегии" />
                  </SelectTrigger>
                  <SelectContent>
                    {strategyOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.strategy && <p className="text-xs text-red">{errors.strategy}</p>}
              </div>

              <div className="space-y-2 relative">
                <Label>Инструмент</Label>
                <Input
                  value={form.instrument_search}
                  onChange={(e) => setForm({ ...form, instrument_search: e.target.value, instrument: '' })}
                  placeholder="Введите тикер или часть названия"
                  disabled={isEdit}
                  autoComplete="off"
                />
                {!isEdit && showInstruments && (
                  <Card className="absolute top-full left-0 right-0 z-10 p-1.5 max-h-60 overflow-y-auto">
                    {instruments.slice(0, 12).map((i) => (
                      <div
                        key={i.id}
                        className="px-2.5 py-1.5 cursor-pointer rounded-lg hover:bg-blue/14 text-sm"
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            instrument: String(i.id),
                            instrument_search: i.ticker,
                          }));
                        }}
                      >
                        <strong>{i.ticker}</strong>{' '}
                        <span className="text-muted-foreground">— {i.name}</span>
                      </div>
                    ))}
                  </Card>
                )}
                {errors.instrument && <p className="text-xs text-red">{errors.instrument}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="space-y-2">
                <Label>Дата и время</Label>
                <DateTimePicker
                  value={form.trade_date}
                  onChange={(v) => setForm({ ...form, trade_date: v })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Направление</Label>
                <Select
                  value={form.direction}
                  onValueChange={(v) => setForm({ ...form, direction: v as 'LONG' | 'SHORT' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LONG">Лонг</SelectItem>
                    <SelectItem value="SHORT">Шорт</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Объём от капитала, %</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.volume_from_capital}
                  onChange={(e) => setForm({ ...form, volume_from_capital: Number(e.target.value) })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="space-y-2">
                <Label>Цена входа</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required
                />
                {errors.price && <p className="text-xs text-red">{errors.price}</p>}
              </div>
              <div className="space-y-2">
                <Label>Стоп-лосс</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={form.planned_stop_loss}
                  onChange={(e) => setForm({ ...form, planned_stop_loss: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Тейк-профит</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={form.planned_take_profit}
                  onChange={(e) => setForm({ ...form, planned_take_profit: e.target.value })}
                />
              </div>
            </div>

            {form.instrument && (
              <div className="mb-4">
                <Button
                  type="button"
                  variant="default"
                  onClick={() => setChartOpen(true)}
                  className="w-full border-blue/30 text-blue hover:bg-blue/10 hover:text-blue bg-blue/5"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  Выбрать цену и SL/TP на графике
                </Button>
              </div>
            )}

            <div className="space-y-2 mb-4">
              <Label>Комиссия (₽)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.commission}
                onChange={(e) => setForm({ ...form, commission: e.target.value })}
              />
            </div>

            <h3 className="mt-5">Анализ</h3>
            <div className="space-y-2 mb-4">
              <Label>Основание</Label>
              <Textarea
                rows={3}
                value={form.analysis}
                onChange={(e) => setForm({ ...form, analysis: e.target.value })}
              />
            </div>
            <div className="space-y-2 mb-4">
              <Label>Выводы на будущее</Label>
              <Textarea
                rows={3}
                value={form.conclusions}
                onChange={(e) => setForm({ ...form, conclusions: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <Label>Эмоциональное состояние</Label>
                <Select
                  value={form.emotional_state || '__none__'}
                  onValueChange={(v) => setForm({ ...form, emotional_state: (v === '__none__' ? '' : v) as EmotionalState })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Не выбрано" />
                  </SelectTrigger>
                  <SelectContent>
                    {emotionChoices.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Теги (через запятую)</Label>
                <Input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="ошибка, эмоции, тренд"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 mt-4">
              <Button variant="primary" disabled={busy}>
                {busy ? 'Сохраняем…' : isEdit ? 'Сохранить' : 'Создать сделку'}
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/trades">Отмена</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {form.instrument && (
        <ChartPricePickerDialog
          ticker={form.instrument_search}
          open={chartOpen}
          onOpenChange={setChartOpen}
          direction={form.direction}
          onApply={(date, price, stopLoss, takeProfit) =>
            setForm((prev) => ({
              ...prev,
              trade_date: date,
              price,
              ...(stopLoss ? { planned_stop_loss: stopLoss } : {}),
              ...(takeProfit ? { planned_take_profit: takeProfit } : {}),
            }))
          }
        />
      )}
    </section>
  );
}
