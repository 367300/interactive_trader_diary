import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth, RequireGuest } from './auth/RequireAuth';
import Layout from './components/Layout';
import PublicLayout from './components/PublicLayout';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Analytics from './pages/Analytics';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import InstrumentsLoad from './pages/admin/InstrumentsLoad';
import InstrumentsRouter from './pages/instruments';
import StrategiesRouter from './pages/strategies';
import TradesRouter from './pages/trades';
import { QuickTradeEntryPage } from '@/pages/trades/quick/QuickTradeEntryPage';
import { SiteSettingsContext, useSiteSettingsLoader } from './lib/useSiteSettings';

export default function App() {
  const siteSettings = useSiteSettingsLoader();

  return (
    <SiteSettingsContext.Provider value={siteSettings}>
    <AuthProvider>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route
            path="/login"
            element={<RequireGuest><Login /></RequireGuest>}
          />
          {siteSettings.registrationEnabled && (
            <Route
              path="/register"
              element={<RequireGuest><Register /></RequireGuest>}
            />
          )}
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
          <Route path="/trades/quick" element={<QuickTradeEntryPage />} />
          <Route path="/trades/*" element={<TradesRouter />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/admin/instruments" element={<InstrumentsLoad />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
    </SiteSettingsContext.Provider>
  );
}
