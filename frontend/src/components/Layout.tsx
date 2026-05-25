import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Дашборд' },
  { to: '/trades/new', label: 'Новая сделка' },
  { to: '/trades', label: 'Все сделки', exact: true },
  { to: '/strategies', label: 'Стратегии' },
  { to: '/instruments', label: 'Инструменты' },
  { to: '/analytics', label: 'Аналитика' },
];

const adminItems = [
  { to: '/admin/instruments', label: 'Загрузка инструментов' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const initials = user.username.slice(0, 2).toUpperCase();

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <NavLink to="/dashboard" className="brand">
          <span className="brand-mark">TD</span>
          <span>
            <span className="brand-title">Дневник трейдера</span>
            <span className="brand-sub">Midnight Glass · v3</span>
          </span>
        </NavLink>

        <div className="nav-group">
          <span className="nav-label">Основное</span>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </div>

        {user.is_staff && (
          <div className="nav-group">
            <span className="nav-label">Администрирование</span>
            {adminItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
            <a className="nav-link" href="/admin/" target="_blank" rel="noreferrer">
              Django-админка ↗
            </a>
          </div>
        )}

        <div className="user-pill">
          <span className="avatar">{initials}</span>
          <span className="user-meta">
            <span className="user-name">{user.username}</span>
            <span className="user-role">{user.is_staff ? 'Администратор' : 'Трейдер'}</span>
          </span>
          <button className="btn-icon" onClick={onLogout} title="Выйти">→</button>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <NavLink to="/profile" className="user-name text-soft">Профиль</NavLink>
          <span className="spacer" />
          <NavLink to="/trades/new" className="btn btn-primary btn-sm">+ Новая сделка</NavLink>
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
