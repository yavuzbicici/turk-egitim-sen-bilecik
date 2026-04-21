import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../../src/providers/AuthProvider';
import { API_BASE_URL } from '../../src/config/api';
import { useTheme } from '../../src/providers/ThemeProvider';
import { AppButton, Card, H1, P, Screen } from '../../src/ui/components';

type MemberProfile = {
  cinsiyet?: string;
  unvan?: string;
  gorevyeri?: string;
  gorevyeriIl?: string;
  kurum?: string;
  uyeno?: string;
  uyetarih?: string;
};

export default function SettingsScreen() {
  const router = useRouter();
  const { theme, themeMode, setThemeMode } = useTheme();
  const { user, token, signOut } = useAuth();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!token) return;
      setProfileLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/me`, { headers: { Authorization: `Bearer ${token}` } });
        const json = (await res.json().catch(() => null)) as any;
        if (!mounted) return;
        if (res.ok && json?.ok && json?.profile) setProfile(json.profile as MemberProfile);
      } catch {
        // ignore
      } finally {
        if (mounted) setProfileLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  const logout = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={{ gap: 6 }}>
          <H1>Ayarlar</H1>
          <P muted>Tema ve hesap ayarları.</P>
        </View>

        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.textMuted, fontWeight: '900' }}>Hesap</Text>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>{user?.fullName}</Text>
          <Text style={{ color: theme.colors.textMuted, fontWeight: '800' }}>
            Rol: {user?.role === 'admin' ? 'Yönetici' : 'Üye'}
          </Text>
          {!!user?.email && <Text style={{ color: theme.colors.textMuted, fontWeight: '700' }}>{user.email}</Text>}

          {profileLoading && <Text style={{ color: theme.colors.textMuted, fontWeight: '800' }}>Profil yükleniyor…</Text>}

          <View style={{ height: 6 }} />
          <Row label="Ünvan" value={profile?.unvan} />
          <Row label="Görev Yeri" value={profile?.gorevyeri} />
          <Row label="İlçe/İl" value={profile?.gorevyeriIl} />
          <Row label="Kurum" value={profile?.kurum} />
          <Row label="Cinsiyet" value={profile?.cinsiyet} />
          <Row label="Üye No" value={profile?.uyeno} />
          <Row label="Üye Tarihi" value={profile?.uyetarih} />
        </Card>

        <Card style={{ gap: 14 }}>
          <Text style={{ color: theme.colors.textMuted, fontWeight: '900' }}>Görünüm</Text>

          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Tema</Text>
            <Segmented
              options={[
                { label: 'Açık', value: 'light' },
                { label: 'Koyu', value: 'dark' },
                { label: 'Mavi', value: 'blue' },
              ]}
              value={themeMode}
              onChange={setThemeMode}
            />
          </View>
        </Card>

        <AppButton title="Çıkış Yap" onPress={logout} variant="danger" />
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  const { theme } = useTheme();
  const v = String(value || '').trim() || '—';
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Text style={{ width: 90, color: theme.colors.textMuted, fontWeight: '900', fontSize: 12 }}>{label}</Text>
      <Text style={{ flex: 1, color: theme.colors.text, fontWeight: '700', fontSize: 12 }}>{v}</Text>
    </View>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 8,
        padding: 6,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceAlt,
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => ({
              flex: 1,
              height: 40,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? theme.colors.primary : 'transparent',
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text style={{ color: selected ? '#FFFFFF' : theme.colors.text, fontWeight: '900' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

