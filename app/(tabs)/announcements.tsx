import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { API_BASE_URL } from '../../src/config/api';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTheme } from '../../src/providers/ThemeProvider';
import { AppButton, AppTextInput, Card, H1, P, Screen } from '../../src/ui/components';

type Announcement = {
  id: string;
  title: string;
  body: string;
  dateISO: string;
  imageUrl?: string;
};

type UploadImageResult = { ok: true; url: string; publicId: string } | { ok: false; message: string };

async function uploadAnnouncementImage(
  token: string,
  uri: string,
  opts?: { mimeType?: string; fileName?: string },
): Promise<UploadImageResult> {
  const form = new FormData();
  const name = opts?.fileName || 'duyuru.jpg';

  if (Platform.OS === 'web') {
    const blobRes = await fetch(uri);
    const blob = await blobRes.blob();
    const rawType = (opts?.mimeType || blob.type || 'image/jpeg').toLowerCase();
    const mime = rawType.startsWith('image/') ? rawType : 'image/jpeg';
    const file = new File([blob], name.replace(/[^\w.\-]+/g, '_') || 'duyuru.jpg', { type: mime });
    form.append('image', file);
  } else {
    form.append('image', {
      uri,
      name,
      type: opts?.mimeType || 'image/jpeg',
    } as any);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/admin/upload/announcement-image`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    });
  } catch (e: any) {
    const hint =
      Platform.OS !== 'web' && API_BASE_URL.includes('localhost')
        ? ' Telefonda localhost çalışmaz; .env’de EXPO_PUBLIC_API_BASE_URL olarak bilgisayarınızın LAN IP’sini (örn. http://192.168.1.5:8787) verin.'
        : '';
    return { ok: false, message: (e?.message || 'Ağ hatası') + hint };
  }

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok || !json?.ok || !json?.url) {
    const detail = [json?.detail, json?.reason].filter(Boolean).join(' — ') || `HTTP ${res.status}`;
    return { ok: false, message: detail };
  }
  return { ok: true, url: String(json.url), publicId: String(json.publicId || '') };
}

export default function AnnouncementsScreen() {
  const { theme } = useTheme();
  const { height: windowH } = useWindowDimensions();
  const announcementImageMaxH = Math.min(520, Math.max(260, Math.round(windowH * 0.38)));
  const previewImageMaxH = Math.min(320, Math.round(announcementImageMaxH * 0.75));

  const { user, token } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedMime, setPickedMime] = useState<string | undefined>(undefined);
  const [pickedName, setPickedName] = useState<string | undefined>(undefined);

  const [publishing, setPublishing] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);

  const [gate, setGate] = useState<
    | { stage: 'idle' }
    | { stage: 'needs_delete'; deleteCount: number; currentCount: number }
    | { stage: 'ready_to_add' }
  >({ stage: 'idle' });

  const latest = useMemo(() => items[0], [items]);

  const load = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/announcements`, { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as any;
      if (res.ok && json?.ok && Array.isArray(json.items)) {
        const normalized: Announcement[] = json.items
          .map((x: any) => ({
            id: String(x.id),
            title: String(x.title ?? ''),
            body: String(x.body ?? ''),
            dateISO: String(x.dateISO ?? ''),
            imageUrl: x.imageUrl ? String(x.imageUrl) : undefined,
          }))
          .filter((x: Announcement) => x.title);
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

  const ensurePermission = async () => {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED) return true;
    const req = await Notifications.requestPermissionsAsync();
    return !!req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('İzin gerekli', 'Görsel seçmek için galeri izni verin.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    let uri = a.uri;
    let mime = a.mimeType || 'image/jpeg';
    let fname = a.fileName || 'duyuru.jpg';

    if (Platform.OS !== 'web') {
      try {
        const out = await manipulateAsync(uri, [{ resize: { width: 1280 } }], {
          compress: 0.82,
          format: SaveFormat.JPEG,
        });
        uri = out.uri;
        mime = 'image/jpeg';
        fname = 'duyuru.jpg';
      } catch {
        // keep original
      }
    }

    setPickedUri(uri);
    setPickedMime(mime);
    setPickedName(fname);
  };

  const clearImage = () => {
    setPickedUri(null);
    setPickedMime(undefined);
    setPickedName(undefined);
  };

  const startEdit = (a: Announcement) => {
    setEditing(a);
    setTitle(a.title);
    setBody(a.body);
    clearImage();
    setGate({ stage: 'idle' });
  };

  const cancelEdit = () => {
    setEditing(null);
    setTitle('');
    setBody('');
    clearImage();
    setGate({ stage: 'idle' });
  };

  const saveOrPublish = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Eksik bilgi', 'Başlık ve mesaj giriniz.');
      return;
    }
    if (!token) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }

    const isEdit = Boolean(editing?.id);
    const publishedTitle = title.trim();

    setPublishing(true);
    let imageUrl: string | undefined;
    let imagePublicId: string | undefined;

    try {
      if (pickedUri) {
        const up = await uploadAnnouncementImage(token, pickedUri, { mimeType: pickedMime, fileName: pickedName });
        if (!up.ok) {
          Alert.alert('Görsel yüklenemedi', up.message);
          return;
        }
        imageUrl = up.url;
        imagePublicId = up.publicId || undefined;
      }

      const url = isEdit
        ? `${API_BASE_URL}/announcements/${encodeURIComponent(editing!.id)}`
        : `${API_BASE_URL}/announcements`;

      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          ...(imageUrl ? { imageUrl, imagePublicId } : {}),
        }),
      });

      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        Alert.alert('Hata', json?.reason ?? (isEdit ? 'Duyuru güncellenemedi.' : 'Duyuru kaydedilemedi.'));
        return;
      }

      setTitle('');
      setBody('');
      clearImage();
      setEditing(null);
      setGate({ stage: 'idle' });
      await load();
    } catch {
      Alert.alert('Hata', 'Sunucuya bağlanılamadı.');
      return;
    } finally {
      setPublishing(false);
    }

    if (isEdit) return;

    const ok = await ensurePermission();
    if (!ok) return;
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Yeni Duyuru', body: publishedTitle, sound: 'default' },
      trigger: Platform.OS === 'android' ? { channelId: 'duyurular' } : null,
    }).catch(() => {});
  };

  const precheckBeforePublish = async () => {
    if (publishing) return;
    if (!token) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }
    if (editing) {
      await saveOrPublish();
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/announcements/count`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        Alert.alert('Hata', json?.reason ?? 'Ön kontrol yapılamadı.');
        return;
      }
      const count = Math.max(0, Number(json?.count || 0) || 0);
      const deleteCount = Math.max(0, count - 9);
      if (deleteCount > 0) {
        setGate({ stage: 'needs_delete', deleteCount, currentCount: count });
        return;
      }
      setGate({ stage: 'idle' });
      await saveOrPublish();
    } catch {
      Alert.alert('Hata', 'Sunucuya bağlanılamadı.');
    }
  };

  const pruneOldestThenEnableAdd = async () => {
    if (publishing) return;
    if (!token) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }
    if (gate.stage !== 'needs_delete') return;
    setPublishing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/announcements/prune-oldest`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ deleteCount: gate.deleteCount }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        Alert.alert('Hata', json?.reason ?? 'Silme işlemi yapılamadı.');
        return;
      }
      await load();
      setGate({ stage: 'ready_to_add' });
    } catch {
      Alert.alert('Hata', 'Sunucuya bağlanılamadı.');
    } finally {
      setPublishing(false);
    }
  };

  const remove = async (id: string) => {
    const doDelete = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/announcements/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.ok) {
          const msg = json?.reason ?? 'Duyuru silinemedi.';
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
      const ok = window.confirm('Bu duyuru kalıcı olarak silinecek. Devam edilsin mi?');
      if (!ok) return;
      await doDelete();
      return;
    }

    Alert.alert('Silinsin mi?', 'Bu duyuru kalıcı olarak silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: doDelete },
    ]);
  };

  const AnnouncementImage = ({ url }: { url: string }) => (
    <View
      style={{
        width: '100%',
        height: announcementImageMaxH,
        marginTop: 10,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: theme.colors.surfaceAlt,
      }}
    >
      <Image
        source={{ uri: url }}
        style={{ width: '100%', height: '100%' }}
        resizeMode="contain"
        accessibilityRole="image"
      />
    </View>
  );

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={{ gap: 6 }}>
          <H1>Duyurular</H1>
          <P muted>Sendika duyuruları ve bilgilendirmeler.</P>
        </View>

        {loading && (
          <Card style={{ backgroundColor: theme.colors.surfaceAlt }}>
            <P muted>Yükleniyor…</P>
          </Card>
        )}

        {!!latest && (
          <Card style={{ backgroundColor: theme.colors.surfaceAlt }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ flex: 1, color: theme.colors.textMuted, fontWeight: '900' }}>DUYURU</Text>
              {isAdmin ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <AppButton title="Düzenle" variant="secondary" onPress={() => startEdit(latest)} disabled={publishing} />
                  <AppButton title="Sil" variant="danger" onPress={() => remove(latest.id)} disabled={publishing} />
                </View>
              ) : null}
            </View>

            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18, marginTop: 8 }}>{latest.title}</Text>
            <P muted>
              <Text style={{ color: theme.colors.textMuted }}>{latest.dateISO}</Text>
            </P>
            {!!latest.imageUrl && <AnnouncementImage url={latest.imageUrl} />}
            <View style={{ height: 10 }} />
            <P>{latest.body}</P>
          </Card>
        )}

        {isAdmin && (
          <Card style={{ gap: 12, borderColor: theme.colors.primaryLight }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
              {editing ? 'Duyuruyu Düzenle' : 'Yeni Duyuru Yayınla'}
            </Text>
            <AppTextInput label="Başlık" value={title} onChangeText={setTitle} placeholder="Örn: Promosyon bilgilendirmesi" />
            <AppTextInput
              label="Mesaj"
              value={body}
              onChangeText={setBody}
              placeholder="Duyuru detayını yazın..."
              multiline
              style={{ height: 96, textAlignVertical: 'top', paddingTop: 10 }}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <AppButton title="Görsel seç (isteğe bağlı)" variant="secondary" onPress={pickImage} disabled={publishing} />
              {pickedUri ? <AppButton title="Görseli kaldır" variant="secondary" onPress={clearImage} disabled={publishing} /> : null}
              {editing ? <AppButton title="Vazgeç" variant="secondary" onPress={cancelEdit} disabled={publishing} /> : null}
            </View>

            {pickedUri ? (
              <View
                style={{
                  width: '100%',
                  height: previewImageMaxH,
                  borderRadius: 12,
                  overflow: 'hidden',
                  backgroundColor: theme.colors.surfaceAlt,
                }}
              >
                <Image
                  source={{ uri: pickedUri }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="contain"
                  accessibilityRole="image"
                />
              </View>
            ) : null}

            {editing ? (
              <AppButton title={publishing ? 'Güncelleniyor…' : 'Güncelle'} onPress={saveOrPublish} disabled={publishing} />
            ) : gate.stage === 'needs_delete' ? (
              <Card style={{ gap: 10, borderColor: theme.colors.danger }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Duyuru sayısı sınırı</Text>
                <P muted>
                  Şu an <Text style={{ fontWeight: '900', color: theme.colors.text }}>{gate.currentCount}</Text> duyuru var. Yeni duyuru
                  eklemek için önce{' '}
                  <Text style={{ fontWeight: '900', color: theme.colors.text }}>{gate.deleteCount}</Text> eski duyuru silinmeli.
                </P>
                <AppButton
                  title={publishing ? 'Siliniyor…' : `Sil (${gate.deleteCount})`}
                  variant="danger"
                  onPress={pruneOldestThenEnableAdd}
                  disabled={publishing}
                />
              </Card>
            ) : gate.stage === 'ready_to_add' ? (
              <Card style={{ gap: 10, borderColor: theme.colors.primaryLight }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Silme tamamlandı</Text>
                <P muted>Şimdi yeni duyuruyu ekleyebilirsiniz.</P>
                <AppButton title={publishing ? 'Ekleniyor…' : 'Ekle (Bildirim)'} onPress={saveOrPublish} disabled={publishing} />
              </Card>
            ) : (
              <AppButton
                title={publishing ? 'Gönderiliyor…' : 'Duyuru Gönder (Bildirim)'}
                onPress={precheckBeforePublish}
                disabled={publishing}
              />
            )}
          </Card>
        )}

        <View style={{ gap: 10 }}>
          {items.slice(1).map((a) => (
            <Card key={a.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ flex: 1, color: theme.colors.text, fontWeight: '900' }}>{a.title}</Text>
                {isAdmin ? (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <AppButton title="Düzenle" variant="secondary" onPress={() => startEdit(a)} disabled={publishing} />
                    <AppButton title="Sil" variant="danger" onPress={() => remove(a.id)} disabled={publishing} />
                  </View>
                ) : null}
              </View>
              <Text style={{ color: theme.colors.textMuted, fontWeight: '800', fontSize: 12 }}>{a.dateISO}</Text>
              {!!a.imageUrl && <AnnouncementImage url={a.imageUrl} />}
              <P muted>{a.body}</P>
            </Card>
          ))}
        </View>

        {__DEV__ && Platform.OS === 'web' ? (
          <View style={{ height: 12 }}>
            <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 11 }}>
              API: {API_BASE_URL} •{' '}
              <Text
                style={{ color: theme.colors.primary, fontWeight: '900' }}
                onPress={() => Linking.openURL(`${API_BASE_URL}/health`).catch(() => {})}
              >
                health
              </Text>
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useAuth } from '../../src/providers/AuthProvider';
import { API_BASE_URL } from '../../src/config/api';
import { useTheme } from '../../src/providers/ThemeProvider';
import { AppButton, AppTextInput, Card, H1, P, Screen } from '../../src/ui/components';

type Announcement = {
  id: string;
  title: string;
  body: string;
  dateISO: string;
  imageUrl?: string;
};

type UploadImageResult =
  | { ok: true; url: string; publicId: string }
  | { ok: false; message: string };

async function uploadAnnouncementImage(
  token: string,
  uri: string,
  opts?: { mimeType?: string; fileName?: string },
): Promise<UploadImageResult> {
  const form = new FormData();
  const name = opts?.fileName || 'duyuru.jpg';

  if (Platform.OS === 'web') {
    const blobRes = await fetch(uri);
    const blob = await blobRes.blob();
    const rawType = (opts?.mimeType || blob.type || 'image/jpeg').toLowerCase();
    const mime = rawType.startsWith('image/') ? rawType : 'image/jpeg';
    // Blob'un type'ı boş / octet-stream olunca sunucu tarafı hata verebiliyor; File ile sabitle.
    const file = new File([blob], name.replace(/[^\w.\-]+/g, '_') || 'duyuru.jpg', { type: mime });
    form.append('image', file);
  } else {
    form.append('image', {
      uri,
      name,
      type: opts?.mimeType || 'image/jpeg',
    } as any);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/admin/upload/announcement-image`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    });
  } catch (e: any) {
    const hint =
      Platform.OS !== 'web' && API_BASE_URL.includes('localhost')
        ? ' Telefonda localhost çalışmaz; .env’de EXPO_PUBLIC_API_BASE_URL olarak bilgisayarınızın LAN IP’sini (örn. http://192.168.1.5:8787) verin.'
        : '';
    return { ok: false, message: (e?.message || 'Ağ hatası') + hint };
  }
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok || !json?.ok || !json?.url) {
    const detail = [json?.detail, json?.reason].filter(Boolean).join(' — ') || `HTTP ${res.status}`;
    return { ok: false, message: detail };
  }
  return { ok: true, url: String(json.url), publicId: String(json.publicId || '') };
}

export default function AnnouncementsScreen() {
  const { theme } = useTheme();
  const { height: windowH } = useWindowDimensions();
  /** Duyuru görseli: tam görünsün (kırpma yok), ekrana göre makul üst sınır. */
  const announcementImageMaxH = Math.min(520, Math.max(260, Math.round(windowH * 0.38)));
  const previewImageMaxH = Math.min(320, Math.round(announcementImageMaxH * 0.75));
  const { user, token } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [pickedMime, setPickedMime] = useState<string | undefined>(undefined);
  const [pickedName, setPickedName] = useState<string | undefined>(undefined);
  const [publishing, setPublishing] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [gate, setGate] = useState<
    | { stage: 'idle' }
    | { stage: 'needs_delete'; deleteCount: number; currentCount: number }
    | { stage: 'ready_to_add' }
  >({ stage: 'idle' });

  const latest = useMemo(() => items[0], [items]);

  const load = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/announcements`, { cache: 'no-store' });
      const json = (await res.json().catch(() => null)) as any;
      if (res.ok && json?.ok && Array.isArray(json.items)) {
        const normalized: Announcement[] = json.items
          .map((x: any) => ({
            id: String(x.id),
            title: String(x.title ?? ''),
            body: String(x.body ?? ''),
            dateISO: String(x.dateISO ?? ''),
            imageUrl: x.imageUrl ? String(x.imageUrl) : undefined,
          }))
          .filter((x: Announcement) => x.title);
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

  const ensurePermission = async () => {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED) return true;
    const req = await Notifications.requestPermissionsAsync();
    return !!req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('İzin gerekli', 'Görsel seçmek için galeri izni verin.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    let uri = a.uri;
    let mime = a.mimeType || 'image/jpeg';
    let fname = a.fileName || 'duyuru.jpg';

    if (Platform.OS !== 'web') {
      try {
        const out = await manipulateAsync(uri, [{ resize: { width: 1280 } }], {
          compress: 0.82,
          format: SaveFormat.JPEG,
        });
        uri = out.uri;
        mime = 'image/jpeg';
        fname = 'duyuru.jpg';
      } catch {
        // keep original
      }
    }

    setPickedUri(uri);
    setPickedMime(mime);
    setPickedName(fname);
  };

  const clearImage = () => {
    setPickedUri(null);
    setPickedMime(undefined);
    setPickedName(undefined);
  };

  const startEdit = (a: Announcement) => {
    setEditing(a);
    setTitle(a.title);
    setBody(a.body);
    // Görseli varsayılan olarak olduğu gibi bırakıyoruz; yeni seçilirse upload olur.
    clearImage();
    setGate({ stage: 'idle' });
  };

  const cancelEdit = () => {
    setEditing(null);
    setTitle('');
    setBody('');
    clearImage();
    setGate({ stage: 'idle' });
  };

  const publish = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Eksik bilgi', 'Başlık ve mesaj giriniz.');
      return;
    }
    if (!token) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }

    const publishedTitle = title.trim();

    setPublishing(true);
    let imageUrl: string | undefined;
    let imagePublicId: string | undefined;

    try {
      if (pickedUri) {
        const up = await uploadAnnouncementImage(token, pickedUri, { mimeType: pickedMime, fileName: pickedName });
        if (!up.ok) {
          Alert.alert('Görsel yüklenemedi', up.message);
          setPublishing(false);
          return;
        }
        imageUrl = up.url;
        imagePublicId = up.publicId || undefined;
      }

      const next: Announcement = {
        id: `a-${Date.now()}`,
        title: title.trim(),
        body: body.trim(),
        dateISO: new Date().toISOString().slice(0, 10),
        imageUrl,
      };

      if (Platform.OS === 'web') {
        console.log('[duyurular] gönder →', `${API_BASE_URL}/announcements`);
      }
      const isEdit = Boolean(editing?.id);
      const url = isEdit ? `${API_BASE_URL}/announcements/${encodeURIComponent(editing!.id)}` : `${API_BASE_URL}/announcements`;
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: next.title,
          body: next.body,
          ...(imageUrl ? { imageUrl, imagePublicId } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        Alert.alert('Hata', json?.reason ?? (isEdit ? 'Duyuru güncellenemedi.' : 'Duyuru kaydedilemedi.'));
        setPublishing(false);
        return;
      }

      setTitle('');
      setBody('');
      clearImage();
      setEditing(null);
      setGate({ stage: 'idle' });
      await load();
    } catch {
      Alert.alert('Hata', 'Sunucuya bağlanılamadı.');
      setPublishing(false);
      return;
    } finally {
      setPublishing(false);
    }

    // Düzenleme modunda bildirim gönderme.
    if (editing) return;

    const ok = await ensurePermission();
    if (!ok) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Yeni Duyuru',
        body: publishedTitle,
        sound: 'default',
      },
      trigger: Platform.OS === 'android' ? { channelId: 'duyurular' } : null,
    }).catch(() => {});
  };

  const precheckBeforePublish = async () => {
    if (publishing) return;
    if (!token) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }
    if (editing) {
      await publish();
      return;
    }
    // Yeni duyuru ekleyince toplam +1 olacağı için, 10 sınırını aşmamak adına önce ≤9 olmalı.
    try {
      const res = await fetch(`${API_BASE_URL}/announcements/count`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        Alert.alert('Hata', json?.reason ?? 'Ön kontrol yapılamadı.');
        return;
      }
      const count = Math.max(0, Number(json?.count || 0) || 0);
      const deleteCount = Math.max(0, count - 9);
      if (deleteCount > 0) {
        setGate({ stage: 'needs_delete', deleteCount, currentCount: count });
        return;
      }
      setGate({ stage: 'idle' });
      await publish();
    } catch {
      Alert.alert('Hata', 'Sunucuya bağlanılamadı.');
    }
  };

  const pruneOldestThenEnableAdd = async () => {
    if (publishing) return;
    if (!token) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }
    if (gate.stage !== 'needs_delete') return;
    setPublishing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/announcements/prune-oldest`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ deleteCount: gate.deleteCount }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        Alert.alert('Hata', json?.reason ?? 'Silme işlemi yapılamadı.');
        return;
      }
      await load();
      setGate({ stage: 'ready_to_add' });
    } catch {
      Alert.alert('Hata', 'Sunucuya bağlanılamadı.');
    } finally {
      setPublishing(false);
    }
  };

  const remove = async (id: string) => {
    const doDelete = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/announcements/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.ok) {
          const msg = json?.reason ?? 'Duyuru silinemedi.';
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
      const ok = window.confirm('Bu duyuru kalıcı olarak silinecek. Devam edilsin mi?');
      if (!ok) return;
      await doDelete();
      return;
    }

    Alert.alert('Silinsin mi?', 'Bu duyuru kalıcı olarak silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: doDelete },
    ]);
  };

  const AnnouncementImage = ({ url }: { url: string }) => (
    <View
      style={{
        width: '100%',
        height: announcementImageMaxH,
        marginTop: 10,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: theme.colors.surfaceAlt,
      }}
    >
      <Image
        source={{ uri: url }}
        style={{ width: '100%', height: '100%' }}
        resizeMode="contain"
        accessibilityRole="image"
      />
    </View>
  );

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={{ gap: 6 }}>
          <H1>Duyurular</H1>
          <P muted>Sendika duyuruları ve bilgilendirmeler.</P>
        </View>

        {loading && (
          <Card style={{ backgroundColor: theme.colors.surfaceAlt }}>
            <P muted>Yükleniyor…</P>
          </Card>
        )}

        {!!latest && (
          <Card style={{ backgroundColor: theme.colors.surfaceAlt }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ flex: 1, color: theme.colors.textMuted, fontWeight: '900' }}>DUYURU</Text>
              {isAdmin ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <AppButton title="Düzenle" variant="secondary" onPress={() => startEdit(latest)} disabled={publishing} />
                  <AppButton title="Sil" variant="danger" onPress={() => remove(latest.id)} disabled={publishing} />
                </View>
              ) : null}
            </View>

            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18, marginTop: 8 }}>{latest.title}</Text>
            <P muted>
              <Text style={{ color: theme.colors.textMuted }}>{latest.dateISO}</Text>
            </P>
            {!!latest.imageUrl && <AnnouncementImage url={latest.imageUrl} />}
            <View style={{ height: 10 }} />
            <P>{latest.body}</P>
          </Card>
        )}

        {isAdmin && (
          <Card style={{ gap: 12, borderColor: theme.colors.primaryLight }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>
              {editing ? 'Duyuruyu Düzenle' : 'Yeni Duyuru Yayınla'}
            </Text>
            <AppTextInput label="Başlık" value={title} onChangeText={setTitle} placeholder="Örn: Promosyon bilgilendirmesi" />
            <AppTextInput
              label="Mesaj"
              value={body}
              onChangeText={setBody}
              placeholder="Duyuru detayını yazın..."
              multiline
              style={{ height: 96, textAlignVertical: 'top', paddingTop: 10 }}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <AppButton title="Görsel seç (isteğe bağlı)" variant="secondary" onPress={pickImage} disabled={publishing} />
              {pickedUri ? <AppButton title="Görseli kaldır" variant="secondary" onPress={clearImage} disabled={publishing} /> : null}
              {editing ? <AppButton title="Vazgeç" variant="secondary" onPress={cancelEdit} disabled={publishing} /> : null}
            </View>
            {pickedUri ? (
              <View
                style={{
                  width: '100%',
                  height: previewImageMaxH,
                  borderRadius: 12,
                  overflow: 'hidden',
                  backgroundColor: theme.colors.surfaceAlt,
                }}
              >
                <Image
                  source={{ uri: pickedUri }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="contain"
                  accessibilityRole="image"
                />
              </View>
            ) : null}

            {editing ? (
              <AppButton
                title={publishing ? 'Güncelleniyor…' : 'Güncelle'}
                onPress={publish}
                disabled={publishing}
              />
            ) : gate.stage === 'needs_delete' ? (
              <Card style={{ gap: 10, borderColor: theme.colors.danger }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Duyuru sayısı sınırı</Text>
                <P muted>
                  Şu an <Text style={{ fontWeight: '900', color: theme.colors.text }}>{gate.currentCount}</Text> duyuru var. Yeni duyuru
                  eklemek için önce{' '}
                  <Text style={{ fontWeight: '900', color: theme.colors.text }}>{gate.deleteCount}</Text> eski duyuru silinmeli.
                </P>
                <AppButton
                  title={publishing ? 'Siliniyor…' : `Sil (${gate.deleteCount})`}
                  variant="danger"
                  onPress={pruneOldestThenEnableAdd}
                  disabled={publishing}
                />
              </Card>
            ) : gate.stage === 'ready_to_add' ? (
              <Card style={{ gap: 10, borderColor: theme.colors.primaryLight }}>
                <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Silme tamamlandı</Text>
                <P muted>Şimdi yeni duyuruyu ekleyebilirsiniz.</P>
                <AppButton title={publishing ? 'Ekleniyor…' : 'Ekle (Bildirim)'} onPress={publish} disabled={publishing} />
              </Card>
            ) : (
              <AppButton
                title={publishing ? 'Gönderiliyor…' : 'Duyuru Gönder (Bildirim)'}
                onPress={precheckBeforePublish}
                disabled={publishing}
              />
            )}
          </Card>
        )}

        <View style={{ gap: 10 }}>
          {items.slice(1).map((a) => (
            <Card key={a.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ flex: 1, color: theme.colors.text, fontWeight: '900' }}>{a.title}</Text>
                {isAdmin ? (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <AppButton title="Düzenle" variant="secondary" onPress={() => startEdit(a)} disabled={publishing} />
                    <AppButton title="Sil" variant="danger" onPress={() => remove(a.id)} disabled={publishing} />
                  </View>
                ) : null}
              </View>
              <Text style={{ color: theme.colors.textMuted, fontWeight: '800', fontSize: 12 }}>{a.dateISO}</Text>
              {!!a.imageUrl && <AnnouncementImage url={a.imageUrl} />}
              <P muted>{a.body}</P>
            </Card>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
