export type SchemeName = 'light' | 'dark';

// Paleta do app. As chaves precisam bater com `keys` em tailwind.config.js.
export const tokens: Record<SchemeName, Record<string, string>> = {
  dark: {
    bg: '#0B0F19',
    surface: '#121828',
    surface2: '#1A2136',
    border: '#232B41',
    text: '#F3F4F6',
    muted: '#9CA3AF',
    accent: '#7C87F7',
    danger: '#F87171',
    ok: '#4ADE80',
  },
  light: {
    bg: '#F7F8FC',
    surface: '#FFFFFF',
    surface2: '#EEF0F8',
    border: '#D9DDEA',
    text: '#0F1320',
    muted: '#5B6275',
    accent: '#5B63D3',
    danger: '#DC2626',
    ok: '#15803D',
  },
};

export const cssVars = (scheme: SchemeName) => Object.fromEntries(Object.entries(tokens[scheme]).map(([k, v]) => [`--app-${k}`, v]));
