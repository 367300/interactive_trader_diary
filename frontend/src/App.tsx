import { Routes, Route, Navigate } from 'react-router-dom';

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<Navigate to="/" replace />} />
      <Route
        path="/"
        element={
          <main style={{ padding: 32, fontFamily: 'sans-serif', color: '#e9eef9' }}>
            <h1>Дневник трейдера</h1>
            <p>Каркас фронтенда подключён. Идёт миграция на REST API.</p>
          </main>
        }
      />
    </Routes>
  );
}
