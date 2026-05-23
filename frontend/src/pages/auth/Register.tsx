import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';

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
      <form onSubmit={onSubmit} className="card">
        <div className="form-row">
          <label>Имя пользователя</label>
          <input
            value={data.username}
            onChange={(e) => setData({ ...data, username: e.target.value })}
            required
            minLength={3}
          />
          {errors.username && <div className="error">{errors.username}</div>}
        </div>
        <div className="form-row">
          <label>Email</label>
          <input
            type="email"
            value={data.email}
            onChange={(e) => setData({ ...data, email: e.target.value })}
            required
          />
          {errors.email && <div className="error">{errors.email}</div>}
        </div>
        <div className="form-row">
          <label>Пароль</label>
          <input
            type="password"
            value={data.password}
            onChange={(e) => setData({ ...data, password: e.target.value })}
            required
            minLength={8}
          />
          {errors.password && <div className="error">{errors.password}</div>}
          <div className="hint">Минимум 8 символов.</div>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Создаём…' : 'Создать аккаунт'}
        </button>
        <p className="hint" style={{ marginTop: 14 }}>
          Уже есть аккаунт? <Link to="/login">Войдите</Link>
        </p>
      </form>
    </section>
  );
}
