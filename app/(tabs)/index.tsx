import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTheme } from '../../src/providers/ThemeProvider';
import { API_BASE_URL } from '../../src/config/api';
import { BRANCH_INFO } from '../../src/data/content';
import { Card, H1, P, Screen } from '../../src/ui/components';

export default function HomeScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [monthlyNew, setMonthlyNew] = useState<number | null>(null);
  const [districts, setDistricts] = useState<Array<{ label: string; count: number }> | null>(null);
  const [recentMembers, setRecentMembers] = useState<Array<{ fullName: string; sub: string }> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadError(null);
      try {
        const base = API_BASE_URL;
        if (__DEV__ && Platform.OS === 'web') {
          // eslint-disable-next-line no-console
          console.log('[home] API_BASE_URL =', base);
        }
        const [resA, resB, resC, resD] = await Promise.all([
          fetch(`${base}/stats/members-count`, { method: 'GET', mode: 'cors' }),
          fetch(`${base}/stats/monthly-new`, { method: 'GET', mode: 'cors' }),
          fetch(`${base}/stats/districts`, { method: 'GET', mode: 'cors' }),
          fetch(`${base}/stats/recent-members?limit=4`, { method: 'GET', mode: 'cors' }),
        ]);
        const jsonA = (await resA.json().catch(() => null)) as any;
        const jsonB = (await resB.json().catch(() => null)) as any;
        const jsonC = (await resC.json().catch(() => null)) as any;
        const jsonD = (await resD.json().catch(() => null)) as any;
        if (!mounted) return;
        if (resA.ok && jsonA?.ok && typeof jsonA?.count === 'number') setMemberCount(jsonA.count);
        if (resB.ok && jsonB?.ok && typeof jsonB?.count === 'number') setMonthlyNew(jsonB.count);
        if (resC.ok && jsonC?.ok && Array.isArray(jsonC?.items)) {
          setDistricts(
            jsonC.items
              .filter((x: any) => x && typeof x.label === 'string' && typeof x.count === 'number')
              .map((x: any) => ({ label: x.label, count: x.count })),
          );
        }
        if (resD.ok && jsonD?.ok && Array.isArray(jsonD?.items)) {
          setRecentMembers(
            jsonD.items
              .filter((x: any) => x && typeof x.fullName === 'string')
              .map((x: any) => ({
                fullName: x.fullName,
                sub: String(x.gorevyeri || x.kurum || '').trim(),
              })),
          );
        }
        const anyFail = !resA.ok || !resB.ok || !resC.ok || !resD.ok;
        if (anyFail) {
          const hint = !resA.ok ? `Üye sayısı HTTP ${resA.status}` : 'İstatistik isteği başarısız';
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.warn('[home] stats response', { a: resA.status, b: resB.status, c: resC.status, d: resD.status, jsonA, jsonB });
          }
          setLoadError(hint);
        }
      } catch (e: any) {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn('[home] stats fetch failed', e?.message || e);
        }
        setLoadError('Sunucuya bağlanılamadı. Backend (8787) açık mı ve adres doğru mu?');
      } finally {
        if (!mounted) return;
        setDistricts((prev) => (prev === null ? [] : prev));
        setRecentMembers((prev) => (prev === null ? [] : prev));
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const memberCountLabel = useMemo(() => {
    if (memberCount === null) return '—';
    return memberCount.toLocaleString('tr-TR');
  }, [memberCount]);

  const monthlyNewLabel = useMemo(() => {
    if (monthlyNew === null) return '—';
    return monthlyNew.toLocaleString('tr-TR');
  }, [monthlyNew]);

  const districtMax = useMemo(() => {
    const arr = districts ?? [];
    if (arr.length === 0) return 1;
    return Math.max(1, ...arr.map((d) => d.count));
  }, [districts]);

  const districtTopBars = useMemo(() => (districts ?? []).slice(0, 4), [districts]);
  const districtMinis = useMemo(() => (districts ?? []).slice(4, 8), [districts]);

  return (
    <Screen
      style={{ padding: 0 }}
      headerRight={
        <Text style={{ color: theme.colors.textMuted, fontWeight: '800' }}>
          {user?.role === 'admin' ? 'Yönetici' : 'Üye'}
        </Text>
      }
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}>
        {!!loadError && (
          <Card style={{ borderColor: theme.colors.danger, backgroundColor: theme.colors.surfaceAlt }}>
            <Text style={{ color: theme.colors.danger, fontWeight: '800' }}>{loadError}</Text>
            <P muted>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
                API: {API_BASE_URL} — Tarayıcıda F12 → Ağ sekmesinde kırmızı istek var mı bakın (CORS / bağlantı).
              </Text>
            </P>
          </Card>
        )}
        <Card style={{ backgroundColor: theme.colors.primary, borderColor: theme.colors.primaryDark }}>
          <Text style={{ color: '#EAF6FF', fontWeight: '900' }}>GENEL BAKIŞ</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginTop: 10 }}>Toplam Üye Sayısı</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 44, fontWeight: '900', marginTop: 6 }}>{memberCountLabel}</Text>
          <P muted>
            <Text style={{ color: '#EAF6FF' }}>
              Bilecik il genelinde eğitim çalışanlarının en güçlü sesi olmaya devam ediyoruz.
            </Text>
          </P>
        </Card>

        <Card style={{ gap: 6 }}>
          <Text style={{ color: theme.colors.textMuted, fontWeight: '900' }}>Aylık Yeni Katılım</Text>
          <H1>{monthlyNewLabel}</H1>
          <P muted>Bu ay aramıza katılan yeni meslektaşlarımız.</P>
        </Card>

        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.textMuted, fontWeight: '900' }}>İlçelere Göre Dağılım</Text>
          {districts === null ? (
            <Text style={{ color: theme.colors.textMuted, fontWeight: '800' }}>Yükleniyor…</Text>
          ) : districts.length === 0 ? (
            <Text style={{ color: theme.colors.textMuted, fontWeight: '800' }}>Veri bulunamadı.</Text>
          ) : (
            <>
              {districtTopBars.map((d) => (
                <Bar key={d.label} label={d.label} value={d.count} max={districtMax} />
              ))}
              {districtMinis.length > 0 && (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {districtMinis.slice(0, 2).map((d) => (
                    <Mini key={d.label} label={d.label} value={d.count} />
                  ))}
                </View>
              )}
              {districtMinis.length > 2 && (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {districtMinis.slice(2, 4).map((d) => (
                    <Mini key={d.label} label={d.label} value={d.count} />
                  ))}
                </View>
              )}
            </>
          )}
        </Card>

        <Card style={{ gap: 10 }}>
          <Text style={{ color: theme.colors.textMuted, fontWeight: '900' }}>Yeni Katılan Üyeler</Text>
          {recentMembers === null ? (
            <Text style={{ color: theme.colors.textMuted, fontWeight: '800' }}>Yükleniyor…</Text>
          ) : recentMembers.length === 0 ? (
            <Text style={{ color: theme.colors.textMuted, fontWeight: '800' }}>Veri bulunamadı.</Text>
          ) : (
            recentMembers.map((m, i) => (
              <MemberRow
                key={`${m.fullName}-${i}`}
                name={m.fullName}
                sub={m.sub || '—'}
                color={['#FF6B6B', '#5C7CFA', '#20C997', '#845EF7'][i % 4]}
              />
            ))
          )}
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={{ color: theme.colors.textMuted, fontWeight: '900' }}>Şube İletişim</Text>
          <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 16 }}>{BRANCH_INFO.name}</Text>
          <Info label="Adres" value={BRANCH_INFO.address} />
          <Info label="Telefon" value={BRANCH_INFO.phone} />
          <Info label="E-posta" value={BRANCH_INFO.email} />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Action
              title="Ara"
              onPress={() => Linking.openURL(`tel:${BRANCH_INFO.phone.replace(/\s/g, '')}`).catch(() => {})}
            />
            <Action title="E-posta" onPress={() => Linking.openURL(`mailto:${BRANCH_INFO.email}`).catch(() => {})} />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const { theme } = useTheme();
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row' }}>
        <Text style={{ flex: 1, color: theme.colors.text, fontWeight: '800' }}>{label}</Text>
        <Text style={{ color: theme.colors.textMuted, fontWeight: '800' }}>{value} Üye</Text>
      </View>
      <View style={{ height: 10, borderRadius: 999, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: 10, backgroundColor: theme.colors.primary, borderRadius: 999 }} />
      </View>
    </View>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceAlt,
        padding: 12,
        gap: 4,
      }}
    >
      <Text style={{ color: theme.colors.textMuted, fontWeight: '900', fontSize: 12 }}>{label}</Text>
      <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18 }}>{value}</Text>
    </View>
  );
}

function MemberRow({ name, sub, color }: { name: string; sub: string; color: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{name}</Text>
        <Text style={{ color: theme.colors.textMuted, fontWeight: '700', fontSize: 12 }}>{sub}</Text>
      </View>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: theme.colors.textMuted, fontWeight: '900', fontSize: 12 }}>{label}</Text>
      <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{value}</Text>
    </View>
  );
}

function Action({ title, onPress }: { title: string; onPress: () => void }) {
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
        backgroundColor: theme.colors.surfaceAlt,
        borderWidth: 1,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: theme.colors.text, fontWeight: '900' }}>{title}</Text>
    </Pressable>
  );
}

