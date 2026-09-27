import { Pressable, Text } from 'react-native';
import { useSessionStore } from '@/features/session/viewmodel/useSessionStore';
import { Screen } from '@/ui/screen';

// Placeholder: troque pela view da primeira feature (src/features/<feature>/view).
export default function Home() {
  const logout = useSessionStore((s) => s.logout);
  return (
    <Screen>
      <Text className="text-2xl font-bold text-app-text">Olá!</Text>
      <Pressable accessibilityRole="button" className="mt-6" onPress={() => void logout()}>
        <Text className="text-app-accent">Sair</Text>
      </Pressable>
    </Screen>
  );
}
