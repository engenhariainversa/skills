import * as SecureStore from 'expo-secure-store';

/** Conjunto fechado de segredos que o app guarda no Keychain/Keystore. Nada de token no MMKV; o
 *  access token vive só em memória (session store) e é renovado a partir do refresh no boot. */
export type VaultKey = 'auth.refresh';

const KEYS: VaultKey[] = ['auth.refresh'];

const opts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const vault = {
  get: (key: VaultKey) => SecureStore.getItemAsync(key, opts),
  set: (key: VaultKey, value: string) => SecureStore.setItemAsync(key, value, opts),
  delete: (key: VaultKey) => SecureStore.deleteItemAsync(key, opts),
  clear: async () => {
    for (const k of KEYS) await SecureStore.deleteItemAsync(k, opts).catch(() => undefined);
  },
};
