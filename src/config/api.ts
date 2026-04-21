function resolveApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (typeof raw === 'string') {
    const t = raw.trim().replace(/\/+$/, '');
    /** Göreli veya geçersiz değerler tarayıcıda mevcut origin’e (8081) gider; mutlak http(s) şart. */
    if (t.length > 0 && /^https?:\/\//i.test(t)) return t;
    if (typeof __DEV__ !== 'undefined' && __DEV__ && t.length > 0) {
      // eslint-disable-next-line no-console
      console.warn('[api] EXPO_PUBLIC_API_BASE_URL geçersiz, localhost:8787 kullanılıyor:', raw);
    }
  }
  return 'http://localhost:8787';
}

/** Backend kök adresi (mutlak URL olmalı; web’de boş string olursa istek yanlışlıkla :8081’e gider). */
export const API_BASE_URL = resolveApiBaseUrl();
