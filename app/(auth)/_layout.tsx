import { Redirect, Stack } from 'expo-router';
import React from 'react';
import { useAuth } from '../../src/providers/AuthProvider';

export default function AuthLayout() {
  const { user, isReady } = useAuth();
  if (!isReady) return null;
  if (user) return <Redirect href="/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}

