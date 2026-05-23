import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

export default function Login() {
  const { login, error } = useAuth();
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
      <form onSubmit={onSubmit} className="card">
        {error && <div className="flash flash-error">{error}</div>}
        <div className="form-row">
          <label htmlFor="login">Имя пользователя или email</label>
          <input
            id="login"
            value={loginValue}
            onChange={(e) => setLoginValue(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div className="form-row">
          <label htmlFor="password">Пароль</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Входим…' : 'Войти'}
        </button>
        <p className="hint" style={{ marginTop: 14 }}>
          Нет аккаунта? <Link to="/register">Зарегистрируйтесь</Link>
        </p>
      </form>
    </section>
  );
}
