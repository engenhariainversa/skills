// Entrada do app. Polyfills que precisam rodar antes de qualquer rota (ex.:
// 'react-native-get-random-values' para crypto.getRandomValues) entram ANTES desta linha: o
// expo-router avalia os layouts e as stores que eles importam antes do app/_layout.tsx.
import 'expo-router/entry';
