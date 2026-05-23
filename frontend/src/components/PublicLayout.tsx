import { Link, NavLink, Outlet } from 'react-router-dom';

export default function PublicLayout() {
  return (
    <div className="public">
      <header className="public-topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">TD</span>
          <span className="brand-title">Дневник трейдера</span>
        </Link>
        <nav>
          <NavLink to="/about">О проекте</NavLink>
          <NavLink to="/help">Помощь</NavLink>
        </nav>
        <NavLink to="/login" className="btn btn-ghost">Войти</NavLink>
        <NavLink to="/register" className="btn btn-primary">Создать аккаунт</NavLink>
      </header>
      <div className="public-content">
        <Outlet />
      </div>
      <footer className="public-footer">
        © {new Date().getFullYear()} Дневник трейдера
      </footer>
    </div>
  );
}
