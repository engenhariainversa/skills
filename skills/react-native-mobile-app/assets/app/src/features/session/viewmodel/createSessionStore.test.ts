// Projeto `logic`: Node puro, MockTransport, SecureStore fake (test/fakes). Nada de react-native.
import { createApiClient } from '@/services/api/client';
import { createMockTransport } from '@/services/api/mock';
import { vault } from '@/services/vault';
import { createSessionStore } from './createSessionStore';

function setup() {
  let store: ReturnType<typeof createSessionStore>;
  const api = createApiClient({
    transport: createMockTransport(),
    baseUrl: 'http://mock',
    appHeader: 'ios/0.1.0+1',
    accessToken: () => store.getState().accessToken,
    onTokenExpired: () => store.getState().renew(),
  });
  store = createSessionStore({ api, vault });
  return { store, api };
}

beforeEach(() => vault.clear());

test('boot without a refresh token goes to signedOut', async () => {
  const { store } = setup();
  await store.getState().restore();
  expect(store.getState().phase).toBe('signedOut');
});

test('login keeps the refresh token in the vault and signs in', async () => {
  const { store, api } = setup();
  await store.getState().login('teste@example.com', 'x');
  expect(store.getState().phase).toBe('signedIn');
  expect(await vault.get('auth.refresh')).toBe('mock-refresh-1');
  await expect(api.me()).resolves.toMatchObject({ id: 'u1' });
});

test('login error shows the server message', async () => {
  const { store } = setup();
  await store.getState().login('', '');
  expect(store.getState()).toMatchObject({ phase: 'booting', error: 'Informe e-mail e senha.' });
});
