import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth, RequireGuest } from './auth/RequireAuth';

function Placeholder({ title }: { title: string }) {
  return (
    <main style={{ padding: 32 }}>
      <h1>{title}</h1>
      <p>Страница в процессе миграции.</p>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route
          path="/login"
          element={
            <RequireGuest>
              <Placeholder title="Вход" />
            </RequireGuest>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Placeholder title="Дашборд" />
            </RequireAuth>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
