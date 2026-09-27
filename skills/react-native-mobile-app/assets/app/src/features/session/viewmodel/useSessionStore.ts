// A store única do app, sobre o client real (ou mock, conforme EXPO_PUBLIC_API_MODE).
import { api, bindSession } from '@/services/api';
import { vault } from '@/services/vault';
import { createSessionStore } from './createSessionStore';

export const useSessionStore = createSessionStore({ api, vault });

bindSession(
  () => useSessionStore.getState().accessToken,
  () => useSessionStore.getState().renew(),
);
