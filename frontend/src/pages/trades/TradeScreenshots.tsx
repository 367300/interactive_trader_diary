import { ChangeEvent, useState } from 'react';
import { tradesApi } from '../../api/endpoints';
import type { TradeScreenshot } from '../../api/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Upload, Trash2 } from 'lucide-react';

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
    <Card className="mt-3.5">
      <CardHeader>
        <CardTitle>Скриншоты</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <Alert variant="destructive" className="mb-3">{error}</Alert>}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание (необязательно)"
            className="flex-1 min-w-[200px]"
          />
          <Button asChild className="cursor-pointer">
            <label>
              <Upload className="h-4 w-4" />
              {busy ? 'Загружаем…' : 'Добавить файл'}
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={busy}
                onChange={onUpload}
                className="hidden"
              />
            </label>
          </Button>
        </div>
        {items.length === 0 ? (
          <div className="text-muted-foreground text-sm">Скриншотов пока нет.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {items.map((s) => (
              <Card key={s.id} className="p-2">
                <a href={s.image_url} target="_blank" rel="noreferrer">
                  <img
                    src={s.image_url}
                    alt={s.description}
                    className="w-full rounded-lg block"
                  />
                </a>
                {s.description && <div className="text-muted-foreground text-xs mt-1.5 px-1">{s.description}</div>}
                <Button
                  variant="destructive"
                  size="sm"
                  className="mt-2"
                  onClick={() => remove(s.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Удалить
                </Button>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
