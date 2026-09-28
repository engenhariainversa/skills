import { Tabs } from 'expo-router';
import { tokens } from '@/theme/tokens';
import { useSchemeName } from '@/ui/theme-provider';

export default function TabsLayout() {
  // `screenOptions` não aceita className: a barra lê a mesma paleta do tema pelos tokens,
  // e acompanha claro/escuro como o resto do app.
  const colors = tokens[useSchemeName()];
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Início' }} />
    </Tabs>
  );
}
