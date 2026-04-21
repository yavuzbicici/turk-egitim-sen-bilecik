import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/providers/AuthProvider';
import { useTheme } from '../../src/providers/ThemeProvider';
import { AppButton, AppTextInput, Card, P, Screen } from '../../src/ui/components';

export default function LoginScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { signIn } = useAuth();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hintEmail, setHintEmail] = useState<string | undefined>(undefined);
  const canSubmit = useMemo(() => fullName.trim().length > 0, [fullName]);

  const onLogin = async () => {
    setError(null);
    setHintEmail(undefined);
    const res = await signIn(fullName, password);
    if (!res.ok) {
      setError(res.reason);
      setHintEmail(res.email);
      return;
    }
    router.replace('/(tabs)');
  };

  return (
    <Screen style={{ justifyContent: 'center' }}>
      <Card style={{ gap: 14 }}>
        <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.text }}>Üye Paneli</Text>
        <P muted>Size özel işlemler için giriş yapın</P>

        <AppTextInput
          label="ad.soyad"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="ornek.ornek"
          returnKeyType="next"
        />

        <AppTextInput
          label="Üye şifresi"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {!!error && <Text style={{ color: theme.colors.danger, fontWeight: '700' }}>{error}</Text>}

        <AppButton title="Giriş Yap" onPress={onLogin} disabled={!canSubmit} />

        <Pressable
          onPress={() => router.push('/(auth)/forgot')}
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        >
          <Text style={{ color: theme.colors.primary, fontWeight: '800' }}>Şifremi Unuttum / Şifre Talep Et</Text>
        </Pressable>
      </Card>

      <View style={{ height: 12 }} />

      <Card style={{ gap: 10, backgroundColor: theme.colors.surfaceAlt }}>
        <Row label="Adres" value="Gazipaşa Mah. Atatürk Blv. Arz Birlik İş Mer. Kat 2, Merkez / BİLECİK" />
        <Row label="E-posta" value="tesbilecikuniversite@gmail.com" />
      </Card>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={{ width: 72, color: theme.colors.textMuted, fontWeight: '900', fontSize: 12 }}>{label}</Text>
      <Text style={{ flex: 1, color: theme.colors.text, fontWeight: '700', fontSize: 13 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
});

