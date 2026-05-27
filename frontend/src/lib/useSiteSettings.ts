import { createContext, useContext, useEffect, useState } from 'react';
import { siteApi } from '../api/endpoints';

export interface SiteSettings {
  registrationEnabled: boolean;
  loading: boolean;
}

export const SiteSettingsContext = createContext<SiteSettings>({
  registrationEnabled: false,
  loading: true,
});

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}

export function useSiteSettingsLoader(): SiteSettings {
  const [state, setState] = useState<SiteSettings>({
    registrationEnabled: false,
    loading: true,
  });

  useEffect(() => {
    siteApi
      .settings()
      .then((data) =>
        setState({ registrationEnabled: data.registration_enabled, loading: false }),
      )
      .catch(() => setState({ registrationEnabled: false, loading: false }));
  }, []);

  return state;
}
