import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSiteSettings } from '@/lib/useSiteSettings';
import { useAuth } from '../../auth/AuthContext';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export default function Login() {
  const { login, error } = useAuth();
  const { registrationEnabled } = useSiteSettings();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname?: string } } };

  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(loginValue, password);
      navigate(location.state?.from?.pathname ?? '/dashboard', { replace: true });
    } catch {
      /* ошибка покажется через context */
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="auth-page">
      <h1>Вход</h1>
      <Card>
        <form onSubmit={onSubmit}>
          <CardHeader className="pb-4">
            {error && <Alert variant="destructive">{error}</Alert>}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login">Имя пользователя или email</Label>
              <Input
                id="login"
                value={loginValue}
                onChange={(e) => setLoginValue(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex-col items-start gap-3">
            <Button variant="primary" type="submit" disabled={busy} className="w-full">
              {busy ? 'Входим…' : 'Войти'}
            </Button>
            {registrationEnabled && (
              <p className="text-xs text-muted-foreground">
                Нет аккаунта? <Link to="/register">Зарегистрируйтесь</Link>
              </p>
            )}
          </CardFooter>
        </form>
      </Card>
    </section>
  );
}
