import { Redirect } from 'expo-router';
import React from 'react';
import { useAuth } from '../src/providers/AuthProvider';
import { Screen } from '../src/ui/components';

export default function Index() {
  const { user, isReady } = useAuth();

  if (!isReady) return <Screen />;

  if (!user) return <Redirect href="/(auth)/login" />;
  return <Redirect href="/(tabs)" />;
}

