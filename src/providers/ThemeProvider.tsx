import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { resolveTheme, type AppTheme, type ThemeMode2 } from '../theme/theme';

const STORAGE_KEY = 'tes.themeMode.v1';

type ThemeContextValue = {
  theme: AppTheme;
  themeMode: ThemeMode2;
  setThemeMode: (mode: ThemeMode2) => void;
  isReady: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode2>(systemScheme === 'dark' ? 'dark' : 'light');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!mounted) return;
        if (stored === 'light' || stored === 'dark' || stored === 'blue') setThemeModeState(stored);
      } finally {
        if (mounted) setIsReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const theme = useMemo(() => resolveTheme(themeMode, systemScheme), [themeMode, systemScheme]);

  const setThemeMode = (mode: ThemeMode2) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
  };

  const value = useMemo(
    () => ({ theme, themeMode, setThemeMode, isReady }),
    [theme, themeMode, isReady]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

