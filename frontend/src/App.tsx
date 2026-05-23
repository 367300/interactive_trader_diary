import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth, RequireGuest } from './auth/RequireAuth';
import Layout from './components/Layout';
import PublicLayout from './components/PublicLayout';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import InstrumentsRouter from './pages/instruments';
import StrategiesRouter from './pages/strategies';
import About from './pages/public/About';
import Help from './pages/public/Help';
import Landing from './pages/public/Landing';

function Placeholder({ title }: { title: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <p>Страница в процессе миграции.</p>
    </section>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/about" element={<About />} />
          <Route path="/help" element={<Help />} />
          <Route
            path="/login"
            element={<RequireGuest><Login /></RequireGuest>}
          />
          <Route
            path="/register"
            element={<RequireGuest><Register /></RequireGuest>}
          />
        </Route>
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/strategies/*" element={<StrategiesRouter />} />
          <Route path="/instruments/*" element={<InstrumentsRouter />} />
          <Route path="/trades/*" element={<Placeholder title="Сделки" />} />
          <Route path="/analytics" element={<Placeholder title="Аналитика" />} />
          <Route path="/admin/*" element={<Placeholder title="Администрирование" />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
