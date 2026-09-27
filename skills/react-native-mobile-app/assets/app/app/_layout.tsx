import '../global.css';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSessionStore } from '@/features/session/viewmodel/useSessionStore';
import { appForeground } from '@/services/signal';
import { ThemeProvider, useSchemeName } from '@/ui/theme-provider';

void SplashScreen.preventAutoHideAsync();

/** Mantém a rota visível em sintonia com a fase da sessão: signedOut → login, signedIn → tabs. */
function usePhaseRedirect() {
  const phase = useSessionStore((s) => s.phase);
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    if (phase === 'booting') return;
    void SplashScreen.hideAsync();
    const inTabs = segments[0] === '(tabs)';
    if (phase === 'signedIn' && !inTabs) router.replace('/(tabs)');
    if (phase === 'signedOut' && inTabs) router.replace('/');
  }, [phase, segments, router]);
}

function Navigator() {
  const scheme = useSchemeName();
  usePhaseRedirect();

  useEffect(() => {
    void useSessionStore.getState().restore();
    // Viewmodels não importam react-native: a view traduz AppState em sinal.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') appForeground.emit();
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Navigator />
    </ThemeProvider>
  );
}
