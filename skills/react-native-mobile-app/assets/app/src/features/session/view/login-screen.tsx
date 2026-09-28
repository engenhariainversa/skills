import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Screen } from '@/ui/screen';
import { useSessionStore } from '../viewmodel/useSessionStore';

/** View: lê a store e chama ações dela. Nunca chama a API direto. */
export function LoginScreen() {
  const { login, busy, error } = useSessionStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <Screen>
      <View className="flex-1 justify-center gap-4">
        <Text className="text-2xl font-bold text-app-text">Entrar</Text>
        <TextInput
          className="rounded-xl border border-app-border bg-app-surface px-4 py-3 text-app-text"
          placeholder="E-mail"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          className="rounded-xl border border-app-border bg-app-surface px-4 py-3 text-app-text"
          placeholder="Senha"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text className="text-app-danger">{error}</Text> : null}
        <Pressable accessibilityRole="button" className="items-center rounded-xl bg-app-accent py-3" disabled={busy} onPress={() => void login(email, password)}>
          {busy ? <ActivityIndicator color="white" /> : <Text className="font-semibold text-white">Continuar</Text>}
        </Pressable>
      </View>
    </Screen>
  );
}
