import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme } from '../../src/providers/ThemeProvider';
import { useAuth } from '../../src/providers/AuthProvider';
import { API_BASE_URL } from '../../src/config/api';
import { AppButton, AppTextInput, Card, H1, P, Screen } from '../../src/ui/components';

type Member = {
  docId: string;
  fullName: string;
  email: string;
  role: 'uye' | 'admin';
  cinsiyet?: string;
  unvan?: string;
  gorevyeri?: string;
  gorevyeriIl?: string;
  kurum?: string;
  uyeno?: string;
  uyetarih?: string;
  hasPassword?: boolean;
};

export default function BranchScreen() {
  const { theme } = useTheme();
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [items, setItems] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [searchedOnce, setSearchedOnce] = useState(false);

  const [editing, setEditing] = useState<Member | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'uye' | 'admin'>('uye');
  const [cinsiyet, setCinsiyet] = useState('');
  const [unvan, setUnvan] = useState('');
  const [gorevyeri, setGorevyeri] = useState('');
  const [gorevyeriIl, setGorevyeriIl] = useState('');
  const [kurum, setKurum] = useState('');
  const [uyeno, setUyeno] = useState('');
  const [uyetarih, setUyetarih] = useState('');

  const canCall = Boolean(token) && isAdmin;

  const resetForm = () => {
    setEditing(null);
    setFullName('');
    setEmail('');
    setRole('uye');
    setCinsiyet('');
    setUnvan('');
    setGorevyeri('');
    setGorevyeriIl('');
    setKurum('');
    setUyeno('');
    setUyetarih('');
  };

  const load = async (query?: string) => {
    if (!canCall) return;
    const s = String(query ?? '').trim();
    if (s.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const url = `${API_BASE_URL}/admin/members?q=${encodeURIComponent(s)}&limit=20`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json().catch(() => null)) as any;
      if (res.ok && json?.ok && Array.isArray(json.items)) {
        setItems(
          json.items.map((x: any) => ({
            docId: String(x.docId),
            fullName: String(x.fullName ?? ''),
            email: String(x.email ?? ''),
            role: (String(x.role ?? 'uye') === 'admin' ? 'admin' : 'uye') as any,
            cinsiyet: String(x.cinsiyet ?? ''),
            unvan: String(x.unvan ?? ''),
            gorevyeri: String(x.gorevyeri ?? ''),
            gorevyeriIl: String(x.gorevyeriIl ?? ''),
            kurum: String(x.kurum ?? ''),
            uyeno: String(x.uyeno ?? ''),
            uyetarih: String(x.uyetarih ?? ''),
            hasPassword: Boolean(x.hasPassword),
          })),
        );
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const runSearch = async () => {
    // New search: don't keep previous edit form values
    resetForm();
    setSearchedOnce(true);
    await load(q);
  };

  const startEdit = (m: Member) => {
    setEditing(m);
    setFullName(m.fullName);
    setEmail(m.email);
    setRole(m.role);
    setCinsiyet(m.cinsiyet || '');
    setUnvan(m.unvan || '');
    setGorevyeri(m.gorevyeri || '');
    setGorevyeriIl(m.gorevyeriIl || '');
    setKurum(m.kurum || '');
    setUyeno(m.uyeno || '');
    setUyetarih(m.uyetarih || '');
  };

  const save = async () => {
    if (!canCall) return;
    if (!fullName.trim() || !email.trim()) {
      Alert.alert('Eksik bilgi', 'Ad Soyad ve E-posta gerekli.');
      return;
    }
    try {
      const body = {
        fullName: fullName.trim(),
        email: email.trim(),
        role,
        cinsiyet: cinsiyet.trim(),
        unvan: unvan.trim(),
        gorevyeri: gorevyeri.trim(),
        gorevyeriIl: gorevyeriIl.trim(),
        kurum: kurum.trim(),
        uyeno: uyeno.trim(),
        uyetarih: uyetarih.trim(),
      };

      const res = await fetch(
        editing ? `${API_BASE_URL}/admin/members/${encodeURIComponent(editing.docId)}` : `${API_BASE_URL}/admin/members`,
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        Alert.alert('Hata', json?.reason ?? 'Kaydedilemedi.');
        return;
      }
      resetForm();
      await load(q);
    } catch {
      Alert.alert('Hata', 'Sunucuya bağlanılamadı.');
    }
  };

  const remove = async (m: Member) => {
    if (!canCall) return;
    const ask = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/members/${encodeURIComponent(m.docId)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.ok) {
          Alert.alert('Hata', json?.reason ?? 'Silinemedi.');
          return;
        }
        if (editing?.docId === m.docId) resetForm();
        await load(q);
      } catch {
        Alert.alert('Hata', 'Sunucuya bağlanılamadı.');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Silinsin mi?\n\n${m.fullName} (${m.email})`)) await ask();
      return;
    }
    Alert.alert('Silinsin mi?', `${m.fullName}\n${m.email}`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => ask() },
    ]);
  };

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={{ gap: 6 }}>
          <H1>Yönetim</H1>
          <P muted>Üyeleri ekle / güncelle / sil.</P>
        </View>

        {!isAdmin ? (
          <Card style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.textMuted, fontWeight: '900' }}>Yetki</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '800' }}>Bu sayfayı sadece yöneticiler görebilir.</Text>
          </Card>
        ) : (
          <>
            <Card style={{ gap: 10 }}>
              <Text style={{ color: theme.colors.textMuted, fontWeight: '900' }}>
                {editing ? 'Üye Güncelle' : 'Yeni Üye Ekle'}
              </Text>
              <AppTextInput label="Ad Soyad" value={fullName} onChangeText={setFullName} />
              <AppTextInput
                label="E-posta"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <RolePill title="Üye" selected={role === 'uye'} onPress={() => setRole('uye')} />
                <RolePill title="Yönetici" selected={role === 'admin'} onPress={() => setRole('admin')} />
              </View>

              <AppTextInput label="Cinsiyet" value={cinsiyet} onChangeText={setCinsiyet} placeholder="Kadın / Erkek" />
              <AppTextInput label="Ünvan" value={unvan} onChangeText={setUnvan} />
              <AppTextInput label="Görev Yeri" value={gorevyeri} onChangeText={setGorevyeri} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <AppTextInput label="İlçe/İl" value={gorevyeriIl} onChangeText={setGorevyeriIl} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppTextInput label="Kurum" value={kurum} onChangeText={setKurum} />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <AppTextInput label="Üye No" value={uyeno} onChangeText={setUyeno} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppTextInput label="Üye Tarihi" value={uyetarih} onChangeText={setUyetarih} placeholder="YYYY-MM-DD" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <AppButton title={editing ? 'Güncelle' : 'Ekle'} onPress={save} />
                </View>
                {editing && (
                  <View style={{ flex: 1 }}>
                    <AppButton title="Vazgeç" onPress={resetForm} variant="secondary" />
                  </View>
                )}
              </View>
            </Card>

            <Card style={{ gap: 10 }}>
              <Text style={{ color: theme.colors.textMuted, fontWeight: '900' }}>Üyeler</Text>
              <AppTextInput
                label="Ara (ad / e-posta)"
                value={q}
                onChangeText={(t) => {
                  setQ(t);
                  // typing a new query should exit edit mode to avoid confusion
                  if (editing) resetForm();
                  if (t.trim().length < 2) {
                    setItems([]);
                    setSearchedOnce(false);
                  }
                }}
                autoCapitalize="none"
              />
              <AppButton title="Ara" onPress={runSearch} variant="secondary" />
              {loading ? (
                <Text style={{ color: theme.colors.textMuted, fontWeight: '800' }}>Yükleniyor…</Text>
              ) : items.length === 0 ? (
                <Text style={{ color: theme.colors.textMuted, fontWeight: '800' }}>
                  {searchedOnce ? 'Sonuç bulunamadı.' : 'Aramak için en az 2 karakter yazıp Ara’ya basın.'}
                </Text>
              ) : (
                items.map((m) => (
                  <View
                    key={m.docId}
                    style={{
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.border,
                      gap: 6,
                    }}
                  >
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{m.fullName}</Text>
                        <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>{m.email}</Text>
                      </View>
                      <Badge text={m.role === 'admin' ? 'Yönetici' : 'Üye'} />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <AppButton title="Düzenle" onPress={() => startEdit(m)} variant="secondary" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppButton title="Sil" onPress={() => remove(m)} variant="danger" />
                      </View>
                    </View>
                  </View>
                ))
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Badge({ text }: { text: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: theme.colors.surfaceAlt,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 12 }}>{text}</Text>
    </View>
  );
}

function RolePill({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceAlt,
        borderWidth: 1,
        borderColor: selected ? theme.colors.primaryDark : theme.colors.border,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Text style={{ color: selected ? '#FFFFFF' : theme.colors.text, fontWeight: '900' }}>{title}</Text>
    </Pressable>
  );
}
