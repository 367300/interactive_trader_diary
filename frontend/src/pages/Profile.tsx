import { FormEvent, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { authApi } from '../api/endpoints';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export default function Profile() {
  const { profile, refreshProfile } = useAuth();
  if (!profile) return <div className="flex items-center justify-center py-20 text-muted-foreground">Загрузка профиля…</div>;
  const { user, stats } = profile;

  return (
    <section>
      <h1>Профиль</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <Card>
          <CardHeader>
            <CardTitle>Учётная запись</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div><span className="text-muted-foreground text-sm">Имя пользователя</span><div>{user.username}</div></div>
            <div><span className="text-muted-foreground text-sm">Email</span><div>{user.email || '—'}</div></div>
            <div><span className="text-muted-foreground text-sm">Имя/Фамилия</span><div>{[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}</div></div>
            <div><span className="text-muted-foreground text-sm">Роль</span><div>{user.is_staff ? 'Администратор' : 'Трейдер'}</div></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Статистика</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><div className="stat-label">Всего сделок</div><div className="text-2xl font-bold mt-1">{stats.total_trades}</div></div>
              <div><div className="stat-label">Закрытых</div><div className="text-2xl font-bold mt-1 text-green">{stats.closed_trades}</div></div>
              <div><div className="stat-label">Открытых</div><div className="text-2xl font-bold mt-1 text-soft-foreground">{stats.open_trades}</div></div>
              <div><div className="stat-label">Активных стратегий</div><div className="text-2xl font-bold mt-1">{stats.active_strategies}</div></div>
            </div>
          </CardContent>
        </Card>
        <TinkoffTokenCard
          masked={profile.tinkoff_token_masked}
          hasToken={profile.has_tinkoff_token}
          onSaved={refreshProfile}
        />
      </div>
    </section>
  );
}

function TinkoffTokenCard({
  masked,
  hasToken,
  onSaved,
}: {
  masked: string | null;
  hasToken: boolean;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await authApi.updateMe({ tinkoff_token: token } as any);
      setSuccess('Токен сохранён');
      setToken('');
      setEditing(false);
      await onSaved();
    } catch (err: any) {
      const msg =
        err?.data?.tinkoff_token?.[0] || err?.message || 'Ошибка сохранения';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const onClear = async () => {
    setBusy(true);
    setError(null);
    try {
      await authApi.updateMe({ tinkoff_token: '' } as any);
      setSuccess('Токен удалён');
      await onSaved();
    } catch {
      setError('Ошибка удаления');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>T-Invest API</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <span className="text-muted-foreground text-sm">Токен</span>
          <div className="font-mono text-sm mt-0.5">
            {hasToken ? masked : <span className="text-muted-foreground">Не задан</span>}
          </div>
        </div>
        {error && <Alert variant="destructive">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}
        {editing ? (
          <form onSubmit={onSubmit} className="space-y-2">
            <Label>Новый токен</Label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="t.xxx..."
              required
              autoFocus
            />
            <div className="flex gap-2">
              <Button variant="primary" size="sm" disabled={busy}>
                {busy ? 'Проверяем…' : 'Сохранить'}
              </Button>
              <Button variant="ghost" size="sm" type="button" onClick={() => setEditing(false)}>
                Отмена
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => { setEditing(true); setError(null); setSuccess(null); }}>
              {hasToken ? 'Обновить токен' : 'Добавить токен'}
            </Button>
            {hasToken && (
              <Button variant="destructive" size="sm" disabled={busy} onClick={onClear}>
                Удалить
              </Button>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Токен используется для получения котировок. Создать токен можно в настройках
          приложения Т-Инвестиции (readonly-доступ).
        </p>
      </CardContent>
    </Card>
  );
}
