import { NavLink, Outlet } from 'react-router-dom';

const landingHref = (() => {
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';
  return apiBase.replace(/\/api\/?$/, '') || '/';
})();

export default function PublicLayout() {
  return (
    <div className="public">
      <header className="public-topbar">
        <a href={landingHref} className="brand">
          <span className="brand-mark">TD</span>
          <span className="brand-title">Дневник трейдера</span>
        </a>
        <nav>
          <a href={`${landingHref}about/`}>О проекте</a>
          <a href={`${landingHref}help/`}>Помощь</a>
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
