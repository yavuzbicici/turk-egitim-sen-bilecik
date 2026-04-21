import type { ColorSchemeName } from 'react-native';
import { Colors } from './colors';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemeColor = 'default' | 'blue';

export type AppTheme = {
  mode: Exclude<ColorSchemeName, null | undefined>;
  colors: {
    background: string;
    surface: string;
    surfaceAlt: string;
    text: string;
    textMuted: string;
    border: string;
    primary: string;
    primaryDark: string;
    primaryLight: string;
    danger: string;
  };
};

export type ThemeMode2 = 'light' | 'dark' | 'blue';

export function resolveTheme(mode: ThemeMode2, systemScheme: ColorSchemeName): AppTheme {
  // "blue" => light base + blue brand
  const resolved: Exclude<ColorSchemeName, null | undefined> = mode === 'dark' ? 'dark' : 'light';

  const base = resolved === 'dark' ? Colors.dark : Colors.light;
  const brand = mode === 'blue' ? Colors.brandBlue : Colors.brand;

  return {
    mode: resolved,
    colors: {
      background: base.background,
      surface: base.surface,
      surfaceAlt: base.surfaceAlt,
      text: base.text,
      textMuted: base.textMuted,
      border: base.border,
      primary: brand.primary,
      primaryDark: brand.primaryDark,
      primaryLight: brand.primaryLight,
      danger: base.danger,
    },
  };
}

