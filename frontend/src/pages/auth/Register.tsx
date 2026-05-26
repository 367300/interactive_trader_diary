import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({ username: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await register(data);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.data && typeof err.data === 'object') {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.data as Record<string, unknown>)) {
          if (Array.isArray(v) && v.length) flat[k] = String(v[0]);
          else if (typeof v === 'string') flat[k] = v;
        }
        setErrors(flat);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="auth-page">
      <h1>Регистрация</h1>
      <Card>
        <form onSubmit={onSubmit}>
          <CardHeader className="pb-0" />
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Имя пользователя</Label>
              <Input
                value={data.username}
                onChange={(e) => setData({ ...data, username: e.target.value })}
                required
                minLength={3}
              />
              {errors.username && <p className="text-xs text-red">{errors.username}</p>}
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={data.email}
                onChange={(e) => setData({ ...data, email: e.target.value })}
                required
              />
              {errors.email && <p className="text-xs text-red">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label>Пароль</Label>
              <Input
                type="password"
                value={data.password}
                onChange={(e) => setData({ ...data, password: e.target.value })}
                required
                minLength={8}
              />
              {errors.password && <p className="text-xs text-red">{errors.password}</p>}
              <p className="text-xs text-muted-foreground">Минимум 8 символов.</p>
            </div>
          </CardContent>
          <CardFooter className="flex-col items-start gap-3">
            <Button variant="primary" disabled={busy} className="w-full">
              {busy ? 'Создаём…' : 'Создать аккаунт'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Уже есть аккаунт? <Link to="/login">Войдите</Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </section>
  );
}
