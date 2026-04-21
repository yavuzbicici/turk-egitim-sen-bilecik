import React, { useMemo, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { API_BASE_URL } from '../../src/config/api';
import { useTheme } from '../../src/providers/ThemeProvider';
import { AppButton, AppTextInput, Card, P, Screen } from '../../src/ui/components';

export default function ForgotPasswordScreen() {
  const { theme } = useTheme();
  const router = useRouter();

  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [fullName, setFullName] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const canRequest = useMemo(() => fullName.trim().length > 0 && !busy, [fullName, busy]);
  const canReset = useMemo(
    () => fullName.trim().length > 0 && code.trim().length > 0 && newPassword.length >= 6 && !busy,
    [fullName, code, newPassword, busy],
  );

  const request = async () => {
    setBusy(true);
    try {
      await fetch(`${API_BASE_URL}/auth/request-reset`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fullName }),
      });
      setStep('reset');
      if (Platform.OS === 'web') {
        Alert.alert('Kod gönderildi', 'E-posta adresinize doğrulama kodu gönderildiyse birkaç dakika içinde ulaşacaktır.');
      }
    } catch {
      Alert.alert('Hata', 'Şifre talebi gönderilemedi. İnternet bağlantınızı kontrol edin.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fullName, code, newPassword }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) {
        Alert.alert('Hata', json?.reason ?? 'Kod geçersiz veya süresi doldu.');
        return;
      }
      Alert.alert('Başarılı', 'Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.');
      router.replace('/(auth)/login');
    } catch {
      Alert.alert('Hata', 'İşlem tamamlanamadı. Lütfen tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={{ justifyContent: 'center' }}>
      <Card style={{ gap: 14 }}>
        <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.text }}>Şifre Sıfırlama</Text>
        <P muted>E-posta ile doğrulama kodu gönderilir.</P>

        <AppTextInput
          label="ad.soyad"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="ornek.ornek"
          editable={!busy}
        />

        {step === 'reset' && (
          <View style={{ gap: 12 }}>
            <AppTextInput
              label="Doğrulama kodu"
              value={code}
              onChangeText={setCode}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="6 haneli kod"
              editable={!busy}
            />
            <AppTextInput
              label="Yeni şifre"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="en az 6 karakter"
              editable={!busy}
            />
          </View>
        )}

        {step === 'request' ? (
          <AppButton title={busy ? 'Gönderiliyor…' : 'Kodu Gönder'} onPress={request} disabled={!canRequest} />
        ) : (
          <AppButton title={busy ? 'Kaydediliyor…' : 'Şifreyi Sıfırla'} onPress={reset} disabled={!canReset} />
        )}

        <AppButton title="Geri Dön" variant="secondary" onPress={() => router.back()} disabled={busy} />
      </Card>
    </Screen>
  );
}

