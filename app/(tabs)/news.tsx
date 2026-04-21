import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { API_BASE_URL } from '../../src/config/api';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTheme } from '../../src/providers/ThemeProvider';
import { AppButton, AppTextInput, Card, H1, P, Screen } from '../../src/ui/components';

type NewsItem = {
  id: string;
  title: string;
  summary: string;
  dateISO: string;
};

export default function NewsScreen() {
  const { theme } = useTheme();
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [editing, setEditing] = useState<NewsItem | null>(null);
  const [saving, setSaving] = useState(false);

  const canPublish = useMemo(() => title.trim().length > 0 && summary.trim().length > 0, [title, summary]);

  const load = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/news`);
      const json = (await res.json().catch(() => null)) as any;
      if (res.ok && json?.ok && Array.isArray(json.items)) {
        const normalized: NewsItem[] = json.items
          .map((x: any) => ({
            id: String(x.id),
            title: String(x.title ?? ''),
            summary: String(x.summary ?? ''),
            dateISO: String(x.dateISO ?? ''),
          }))
          .filter((x: NewsItem) => x.title);
        setItems(normalized);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEdit = (n: NewsItem) => {
    setEditing(n);
    setTitle(n.title);
    setSummary(n.summary);
  };

  const cancelEdit = () => {
    setEditing(null);
    setTitle('');
    setSummary('');
  };

  const publish = async () => {
    if (!title.trim() || !summary.trim()) {
      Alert.alert('Eksik bilgi', 'Başlık ve özet giriniz.');
      return;
    }
    if (!token) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const isEdit = Boolean(editing?.id);
      const res = await fetch(isEdit ? `${API_BASE_URL}/news/${encodeURIComponent(editing!.id)}` : `${API_BASE_URL}/news`, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: title.trim(), summary: summary.trim() }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        Alert.alert('Hata', json?.reason ?? (editing ? 'Haber güncellenemedi.' : 'Haber kaydedilemedi.'));
        return;
      }
      setTitle('');
      setSummary('');
      setEditing(null);
      await load();
    } catch {
      Alert.alert('Hata', 'Sunucuya bağlanılamadı.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const doDelete = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/news/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.ok) {
          const msg = json?.reason ?? 'Haber silinemedi.';
          if (Platform.OS === 'web') window.alert(msg);
          else Alert.alert('Hata', msg);
          return;
        }
        await load();
      } catch {
        if (Platform.OS === 'web') window.alert('Sunucuya bağlanılamadı.');
        else Alert.alert('Hata', 'Sunucuya bağlanılamadı.');
      }
    };

    if (Platform.OS === 'web') {
      const ok = window.confirm('Bu haber kalıcı olarak silinecek. Devam edilsin mi?');
      if (!ok) return;
      await doDelete();
      return;
    }

    Alert.alert('Silinsin mi?', 'Bu haber kalıcı olarak silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: doDelete },
    ]);
  };

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={{ gap: 6 }}>
          <H1>Haberler</H1>
          <P muted>Şube haberleri ve etkinlikler.</P>
        </View>

        {loading && (
          <Card style={{ backgroundColor: theme.colors.surfaceAlt }}>
            <P muted>Yükleniyor…</P>
          </Card>
        )}

        {isAdmin && (
          <Card style={{ gap: 12, borderColor: theme.colors.primaryLight }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
              {editing ? 'Haberi Düzenle' : 'Yeni Haber Yayınla'}
            </Text>
            <AppTextInput label="Başlık" value={title} onChangeText={setTitle} placeholder="Örn: Basın açıklaması" />
            <AppTextInput
              label="Özet"
              value={summary}
              onChangeText={setSummary}
              placeholder="Haber özetini yazın..."
              multiline
              style={{ height: 96, textAlignVertical: 'top', paddingTop: 10 }}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <AppButton
                title={saving ? (editing ? 'Güncelleniyor…' : 'Yayınlanıyor…') : editing ? 'Güncelle' : 'Haberi Yayınla'}
                onPress={publish}
                disabled={!canPublish || saving}
              />
              {editing ? <AppButton title="Vazgeç" variant="secondary" onPress={cancelEdit} disabled={saving} /> : null}
            </View>
          </Card>
        )}

        {items.map((n) => (
          <Card key={n.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ flex: 1, color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>{n.title}</Text>
              {isAdmin ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <AppButton title="Düzenle" variant="secondary" onPress={() => startEdit(n)} disabled={saving} />
                  <AppButton title="Sil" variant="danger" onPress={() => remove(n.id)} disabled={saving} />
                </View>
              ) : null}
            </View>
            <Text style={{ color: theme.colors.textMuted, fontWeight: '800', fontSize: 12 }}>{n.dateISO}</Text>
            <P muted>{n.summary}</P>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

