import { useAuth } from '../auth/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Profile() {
  const { profile } = useAuth();
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
      </div>
    </section>
  );
}
