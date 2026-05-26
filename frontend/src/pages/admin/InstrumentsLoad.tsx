import { FormEvent, useRef, useState } from 'react';
import { coreApi } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload } from 'lucide-react';

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
      <p className="text-muted-foreground text-sm mb-4">
        Запускает фоновую задачу Celery, которая обращается к ISS Мосбиржи и пополняет/обновляет
        справочник.
      </p>
      <Card className="max-w-[560px]">
        <CardContent className="pt-6">
          <form onSubmit={onSubmit}>
            {result && <Alert variant="success" className="mb-4">{result}</Alert>}
            {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}
            <div className="space-y-2 mb-4">
              <Label>Тип инструмента</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STOCK">Акции</SelectItem>
                  <SelectItem value="FUTURES">Фьючерсы</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <Checkbox
                id="update_existing"
                checked={updateExisting}
                onCheckedChange={(checked) => setUpdateExisting(checked === true)}
              />
              <Label htmlFor="update_existing" className="cursor-pointer">
                Обновлять существующие записи
              </Label>
            </div>
            <div className="space-y-2 mb-4">
              <Label>Лимит (необязательно)</Label>
              <Input
                type="number"
                min={1}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="например, 50"
              />
              <p className="text-xs text-muted-foreground">Пусто — без ограничения.</p>
            </div>
            <Button variant="primary" disabled={busy}>
              {busy ? 'Запускаем…' : 'Запустить задачу'}
            </Button>
          </form>
        </CardContent>
      </Card>

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
    <Card className="max-w-[560px] mt-5">
      <CardHeader>
        <CardTitle>CSV-файл обогащения</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-[13px] mb-3.5">
          Загрузите <code className="bg-glass-strong px-1 rounded text-xs">moex_stocks_enriched.csv</code> — при запуске задачи скрипт
          автоматически обогатит инструменты данными из этого файла.
        </p>
        {msg && <Alert variant="success" className="mb-3">{msg}</Alert>}
        {err && <Alert variant="destructive" className="mb-3">{err}</Alert>}
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="sm" asChild className="cursor-pointer">
            <label>
              <Upload className="h-3.5 w-3.5" /> Выбрать файл
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                onChange={onFileChange}
                className="hidden"
              />
            </label>
          </Button>
          {fileName && <span className="text-muted-foreground text-[13px]">{fileName}</span>}
          <Button
            variant="primary"
            size="sm"
            disabled={!fileName || uploading}
            onClick={onUpload}
          >
            {uploading ? 'Загрузка…' : 'Загрузить CSV'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
