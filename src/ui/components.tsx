import React from 'react';
import {
  Image,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
  ViewStyle,
  type TextInputProps,
} from 'react-native';
import { useTheme } from '../providers/ThemeProvider';

export function Screen({
  children,
  style,
  containerStyle,
  showHeader = true,
  headerRight,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  showHeader?: boolean;
  headerRight?: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }, containerStyle]}>
      {showHeader && <AppHeader right={headerRight} />}
      <View style={[styles.screen, style]}>{children}</View>
    </View>
  );
}

export function AppHeader({ right }: { right?: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.header, { borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Image source={require('../../assets/logo.png')} style={styles.headerLogo} />
      </View>
      {right}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const { theme } = useTheme();

  const bg =
    variant === 'primary'
      ? theme.colors.primary
      : variant === 'danger'
        ? theme.colors.danger
        : theme.colors.surfaceAlt;

  const fg = variant === 'secondary' ? theme.colors.text : '#FFFFFF';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.9 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: theme.colors.border },
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function AppTextInput(props: TextInputProps & { label: string }) {
  const { theme } = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' }}>{label}</Text>
      <RNTextInput
        {...rest}
        placeholderTextColor={theme.colors.textMuted}
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor: theme.colors.border,
            color: theme.colors.text,
          },
          style,
        ]}
      />
    </View>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return <Text style={{ fontSize: 24, fontWeight: '800', color: theme.colors.text }}>{children}</Text>;
}

export function P({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  const { theme } = useTheme();
  return (
    <Text style={{ fontSize: 14, lineHeight: 20, color: muted ? theme.colors.textMuted : theme.colors.text }}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 128,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  headerLogo: { width: '100%', height: 104, resizeMode: 'contain' },
  screen: { flex: 1, padding: 16 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  button: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  buttonText: { fontSize: 14, fontWeight: '800' },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
  },
});

