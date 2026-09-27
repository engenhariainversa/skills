// Sessão do app: fases booting → signedOut | signedIn. O refresh token fica no vault (SecureStore);
// o access token só em memória. Viewmodel: não importa react-native nem expo-router (o projeto
// `logic` do Jest garante), então é testável em Node puro com o MockTransport.
import { create } from 'zustand';
import type { ApiClient } from '@/services/api/client';
import { ApiError } from '@/services/api/errors';
import { sessionEnded } from '@/services/signal';
import type { vault as Vault } from '@/services/vault';

export type SessionPhase = 'booting' | 'signedOut' | 'signedIn';

export interface SessionState {
  phase: SessionPhase;
  accessToken: string | null;
  error: string | null;
  busy: boolean;
  /** Boot: tenta renovar com o refresh guardado; sem ele (ou recusado) vai para signedOut. */
  restore(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  /** Usado pelo client num 401 TOKEN_EXPIRED; null encerra a sessão. */
  renew(): Promise<string | null>;
  logout(): Promise<void>;
}

export function createSessionStore(deps: { api: ApiClient; vault: typeof Vault }) {
  const store = create<SessionState>()((set, get) => ({
    phase: 'booting',
    accessToken: null,
    error: null,
    busy: false,

    async restore() {
      const token = await get().renew();
      if (!token) set({ phase: 'signedOut' });
    },

    async login(email, password) {
      set({ busy: true, error: null });
      try {
        const t = await deps.api.login({ email, password });
        await deps.vault.set('auth.refresh', t.refresh_token);
        set({ phase: 'signedIn', accessToken: t.access_token, busy: false });
      } catch (err) {
        set({ busy: false, error: err instanceof ApiError ? err.message : 'Sem conexão com o servidor.' });
      }
    },

    async renew() {
      const refresh = await deps.vault.get('auth.refresh');
      if (!refresh) return null;
      try {
        const t = await deps.api.refresh(refresh);
        await deps.vault.set('auth.refresh', t.refresh_token); // refresh rotativo
        set({ phase: 'signedIn', accessToken: t.access_token });
        return t.access_token;
      } catch (err) {
        // Recusa explícita do servidor encerra a sessão; falha de rede não (o app pode estar offline).
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) await get().logout();
        return null;
      }
    },

    async logout() {
      await deps.vault.clear();
      set({ phase: 'signedOut', accessToken: null, error: null, busy: false });
      sessionEnded.emit();
    },
  }));
  return store;
}
