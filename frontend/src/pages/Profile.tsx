import { useAuth } from '../auth/AuthContext';

export default function Profile() {
  const { profile } = useAuth();
  if (!profile) return <div className="empty">Загрузка профиля…</div>;
  const { user, stats } = profile;
  return (
    <section>
      <h1>Профиль</h1>
      <div className="grid grid-2">
        <div className="card">
          <h3>Учётная запись</h3>
          <div className="form-row"><span className="muted">Имя пользователя</span><div>{user.username}</div></div>
          <div className="form-row"><span className="muted">Email</span><div>{user.email || '—'}</div></div>
          <div className="form-row"><span className="muted">Имя/Фамилия</span><div>{[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}</div></div>
          <div className="form-row"><span className="muted">Роль</span><div>{user.is_staff ? 'Администратор' : 'Трейдер'}</div></div>
        </div>
        <div className="card">
          <h3>Статистика</h3>
          <div className="grid grid-3">
            <div><div className="stat-label">Всего сделок</div><div className="stat-value">{stats.total_trades}</div></div>
            <div><div className="stat-label">Закрытых</div><div className="stat-value stat-pos">{stats.closed_trades}</div></div>
            <div><div className="stat-label">Открытых</div><div className="stat-value stat-mute">{stats.open_trades}</div></div>
            <div><div className="stat-label">Активных стратегий</div><div className="stat-value">{stats.active_strategies}</div></div>
          </div>
        </div>
      </div>
    </section>
  );
}
