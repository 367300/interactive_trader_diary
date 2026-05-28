import { useCallback, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, LogOut, Menu, Plus, User as UserIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/dashboard', label: 'Дашборд' },
  { to: '/trades/new', label: 'Новая сделка' },
  { to: '/trades', label: 'Все сделки', exact: true },
  { to: '/strategies', label: 'Стратегии' },
  { to: '/instruments', label: 'Инструменты' },
  { to: '/analytics', label: 'Аналитика' },
];

const adminItems = [
  { to: '/admin/instruments', label: 'Загрузка данных' },
];

function NavContent({ user, initials, onLogout, onNavClick }: {
  user: { username: string; is_staff: boolean };
  initials: string;
  onLogout: () => void;
  onNavClick?: () => void;
}) {
  return (
    <>
      <NavLink to="/dashboard" className="flex items-center gap-2.5 px-2.5 py-2 no-underline text-foreground" onClick={onNavClick}>
        <span className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-blue to-purple grid place-items-center text-white font-bold text-sm">TD</span>
        <span>
          <span className="font-bold block text-sm">Дневник трейдера</span>
          <span className="text-[11px] text-muted-foreground block">Midnight Glass · v3</span>
        </span>
      </NavLink>

      <nav className="flex flex-col gap-0.5 mt-4">
        <span className="text-[11px] uppercase tracking-[.12em] text-muted-foreground px-3 mb-1">Основное</span>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) => cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-sm no-underline transition-colors',
              isActive
                ? 'bg-gradient-to-r from-blue/20 to-cyan/5 text-foreground border border-border-strong'
                : 'text-soft-foreground hover:bg-glass-soft hover:text-foreground',
            )}
            onClick={onNavClick}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {user.is_staff && (
        <nav className="flex flex-col gap-0.5 mt-4">
          <span className="text-[11px] uppercase tracking-[.12em] text-muted-foreground px-3 mb-1">Администрирование</span>
          {adminItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-sm no-underline transition-colors',
                isActive
                  ? 'bg-gradient-to-r from-blue/20 to-cyan/5 text-foreground border border-border-strong'
                  : 'text-soft-foreground hover:bg-glass-soft hover:text-foreground',
              )}
              onClick={onNavClick}
            >
              {item.label}
            </NavLink>
          ))}
          <a
            className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-sm no-underline text-soft-foreground hover:bg-glass-soft hover:text-foreground transition-colors"
            href="/admin/"
            target="_blank"
            rel="noreferrer"
          >
            Django-админка ↗
          </a>
        </nav>
      )}

      <div className="mt-auto" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded-xl bg-glass-strong border border-border p-2.5 flex items-center gap-2.5 w-full text-left hover:bg-glass-soft transition-colors outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
          >
            <Avatar>
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col flex-1 leading-tight min-w-0">
              <span className="text-sm truncate">{user.username}</span>
              <span className="text-[11px] text-muted-foreground">{user.is_staff ? 'Администратор' : 'Трейдер'}</span>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-[218px]">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal truncate">
            {user.username}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <NavLink to="/profile" onClick={onNavClick} className="no-underline">
              <UserIcon className="h-4 w-4" /> Профиль
            </NavLink>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onLogout}
            className="text-red focus:text-red focus:bg-red/10"
          >
            <LogOut className="h-4 w-4" /> Выйти
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  if (!user) return null;

  const initials = user.username.slice(0, 2).toUpperCase();

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[248px_1fr]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex sticky top-0 h-screen flex-col gap-4 p-[20px_14px] bg-glass backdrop-blur-[20px] border-r border-border">
        <NavContent user={user} initials={initials} onLogout={onLogout} />
      </aside>

      {/* Mobile sidebar (Sheet) */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="flex flex-col gap-4 p-[20px_14px] w-[280px]">
          <SheetTitle className="sr-only">Навигация</SheetTitle>
          <NavContent user={user} initials={initials} onLogout={onLogout} onNavClick={closeSheet} />
        </SheetContent>
      </Sheet>

      <div className="flex flex-col min-h-screen">
        <header className="h-16 border-b border-border bg-glass-soft backdrop-blur-[20px] flex items-center px-4 lg:px-[22px] gap-4 sticky top-0 z-10">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8"
            onClick={() => setSheetOpen(true)}
            aria-label="Меню"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="flex-1" />
          <Button variant="primary" size="sm" asChild>
            <NavLink to="/trades/new"><Plus className="h-4 w-4" /> Новая сделка</NavLink>
          </Button>
        </header>
        <main className="p-4 lg:p-[22px_26px] flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
