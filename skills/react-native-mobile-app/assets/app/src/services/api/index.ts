// O singleton do client. `src/services` não importa react-native: plataforma e versão vêm de
// expo-application/expo-device (mockados no Jest).
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { createApiClient } from './client';
import { API_MODE, API_URL } from './config';
import { createMockTransport } from './mock';
import { FetchTransport } from './transport';

const platform = Device.osName === 'iOS' ? 'ios' : 'android';
const appHeader = `${platform}/${Application.nativeApplicationVersion ?? '0'}+${Application.nativeBuildVersion ?? '0'}`;

// Ligações feitas pela session store no boot, sem este arquivo importar a store (ciclo de require:
// a store importa `api`).
let tokenGetter: () => string | null = () => null;
let renewer: () => Promise<string | null> = async () => null;
export function bindSession(get: () => string | null, renew: () => Promise<string | null>): void {
  tokenGetter = get;
  renewer = renew;
}

export const api = createApiClient({
  transport: API_MODE === 'http' ? new FetchTransport() : createMockTransport(),
  baseUrl: API_URL,
  appHeader,
  accessToken: () => tokenGetter(),
  onTokenExpired: () => renewer(),
});

export { ApiError } from './errors';
