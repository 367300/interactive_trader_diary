import { FormEvent, useState } from 'react';
import { ApiError } from '../../api/client';
import { tradesApi, type ChildTradePayload } from '../../api/endpoints';
import { inputToIso, nowForInput } from '../../lib/datetime';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { DateTimePicker } from '@/components/ui/date-time-picker';

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{titles[action]}</DialogTitle>
            <DialogDescription>
              {action === 'close'
                ? `Будет закрыт весь доступный объём (${availableVolume}%).`
                : `Доступный объём: ${availableVolume}%`}
            </DialogDescription>
          </DialogHeader>

          {errors._ && <Alert variant="destructive" className="mt-3">{errors._}</Alert>}

          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Дата и время</Label>
              <DateTimePicker value={date} onChange={setDate} required />
            </div>
            <div className="space-y-2">
              <Label>Цена</Label>
              <Input
                type="number"
                step="0.0001"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
              {errors.price && <p className="text-xs text-red">{errors.price}</p>}
            </div>
            {action !== 'close' && (
              <div className="space-y-2">
                <Label>Объём, % от капитала</Label>
                <Input
                  type="number"
                  min={1}
                  max={action === 'partial-close' ? availableVolume - 1 : 100}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Доступный объём: {availableVolume}%
                  {action === 'partial-close' && ' (для полного закрытия используйте отдельную кнопку)'}
                </p>
                {errors.volume_from_capital && <p className="text-xs text-red">{errors.volume_from_capital}</p>}
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Применить'}</Button>
            <Button type="button" variant="ghost" onClick={onClose}>Отмена</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
