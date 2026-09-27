import { colorScheme, vars } from 'nativewind';
import { useEffect, useMemo, type ReactNode } from 'react';
import { View, useColorScheme } from 'react-native';
import { cssVars, type SchemeName } from '@/theme/tokens';

export function useSchemeName(): SchemeName {
  // Para preferência do usuário (claro/escuro/sistema), leia de uma store persistida no MMKV aqui.
  return useColorScheme() === 'light' ? 'light' : 'dark';
}

/** Injeta as variáveis CSS do tema: `bg-app-bg` etc. trocam de cor sem `dark:` nas telas. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useSchemeName();
  const style = useMemo(() => vars(cssVars(scheme)), [scheme]);
  useEffect(() => {
    colorScheme.set(scheme);
  }, [scheme]);
  return (
    <View style={style} className="flex-1 bg-app-bg">
      {children}
    </View>
  );
}
