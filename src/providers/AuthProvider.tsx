import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../config/api';

const STORAGE_KEY = 'tes.session.v1';
const TOKEN_KEY = 'tes.token.v1';

export type SessionUser = {
  id: string;
  fullName: string;
  email?: string;
  role: 'uye' | 'admin';
};

type AuthContextValue = {
  user: SessionUser | null;
  isReady: boolean;
  token: string | null;
  signIn: (fullName: string, password: string) => Promise<{ ok: true } | { ok: false; reason: string; email?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const tok = await AsyncStorage.getItem(TOKEN_KEY);
        if (!mounted) return;
        if (raw) setUser(JSON.parse(raw) as SessionUser);
        if (tok) setToken(tok);
      } catch {
        // ignore
      } finally {
        if (mounted) setIsReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const signIn: AuthContextValue['signIn'] = async (fullName, password) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fullName, password }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (res.ok && json?.ok && json?.user) {
        const session: SessionUser = json.user;
        setUser(session);
        setToken(typeof json?.token === 'string' ? json.token : null);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        if (typeof json?.token === 'string') await AsyncStorage.setItem(TOKEN_KEY, json.token);
        return { ok: true };
      }
      if (json?.reason) return { ok: false, reason: String(json.reason), email: json?.email };
      return { ok: false, reason: 'Giriş başarısız.' };
    } catch {
      return { ok: false, reason: 'Sunucuya bağlanılamadı. Lütfen tekrar deneyin.' };
    }
  };

  const signOut = async () => {
    setUser(null);
    setToken(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(TOKEN_KEY);
  };

  const value = useMemo(() => ({ user, token, isReady, signIn, signOut }), [user, token, isReady]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

