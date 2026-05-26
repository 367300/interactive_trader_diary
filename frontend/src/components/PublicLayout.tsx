import { NavLink, Outlet } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const landingHref = (() => {
  const apiBase = import.meta.env.VITE_API_BASE_URL || '';
  return apiBase.replace(/\/api\/?$/, '') || '/';
})();

export default function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center px-4 sm:px-7 py-3.5 border-b border-border bg-glass-soft backdrop-blur-[12px] gap-4 sm:gap-6 flex-wrap">
        <a href={landingHref} className="flex items-center gap-2.5 no-underline text-foreground">
          <span className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-blue to-purple grid place-items-center text-white font-bold text-sm">TD</span>
          <span className="font-bold">Дневник трейдера</span>
        </a>
        <nav className="hidden sm:flex flex-1 gap-1">
          <a href={`${landingHref}about/`} className="px-3.5 py-2 rounded-[10px] text-soft-foreground text-[13.5px] font-medium no-underline hover:bg-glass-soft hover:text-foreground transition-colors">О проекте</a>
          <a href={`${landingHref}help/`} className="px-3.5 py-2 rounded-[10px] text-soft-foreground text-[13.5px] font-medium no-underline hover:bg-glass-soft hover:text-foreground transition-colors">Помощь</a>
        </nav>
        <div className="hidden sm:flex gap-2 ml-auto">
          <Button variant="ghost" asChild>
            <NavLink to="/login">Войти</NavLink>
          </Button>
          <Button variant="primary" asChild>
            <NavLink to="/register">Создать аккаунт</NavLink>
          </Button>
        </div>
      </header>
      <div className="flex-1 p-5 sm:p-8 max-w-[1100px] mx-auto w-full">
        <Outlet />
      </div>
      <footer className="py-5 px-7 border-t border-border text-muted-foreground text-[13px] text-center">
        © {new Date().getFullYear()} Дневник трейдера
      </footer>
    </div>
  );
}
