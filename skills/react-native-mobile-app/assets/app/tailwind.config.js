// Cores vêm de variáveis CSS (src/theme/tokens.ts), trocadas pelo ThemeProvider: `bg-app-bg`,
// `text-app-text` etc. funcionam em claro e escuro sem `dark:` espalhado pelas telas.
const keys = ['bg', 'surface', 'surface2', 'border', 'text', 'muted', 'accent', 'danger', 'ok'];

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: { colors: Object.fromEntries(keys.map((k) => [`app-${k}`, `var(--app-${k})`])) } },
  plugins: [],
};
