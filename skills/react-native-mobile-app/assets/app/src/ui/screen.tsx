import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = { children: ReactNode; scroll?: boolean; padded?: boolean };

export function Screen({ children, scroll = false, padded = true }: Props) {
  const pad = padded ? 'px-6 py-4' : '';
  return (
    <SafeAreaView className="flex-1 bg-app-bg">
      {scroll ? (
        <ScrollView className="flex-1">
          <View className={pad}>{children}</View>
        </ScrollView>
      ) : (
        <View className={`flex-1 ${pad}`}>{children}</View>
      )}
    </SafeAreaView>
  );
}
