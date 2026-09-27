/**
 * Backend do app. Constante por build: o EAS injeta EXPO_PUBLIC_API_URL por perfil (eas.json) e o
 * `expo start` lê do .env local. Sem tela para trocar servidor em produção.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4050').replace(/\/+$/, '');

/** `mock` quando não setado (Jest, `expo start` sem .env): só `http` explícito fala com servidor. */
export const API_MODE: 'mock' | 'http' = process.env.EXPO_PUBLIC_API_MODE === 'http' ? 'http' : 'mock';
