import { MMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

// Estado não sensível persistido (preferências, cache de listas). Segredos vão no vault (SecureStore).
export const mmkv = new MMKV({ id: '<app>' });

/** Storage do `persist` do zustand: `persist(..., { name, storage: createJSONStorage(() => mmkvStateStorage) })`. */
export const mmkvStateStorage: StateStorage = {
  getItem: (name) => mmkv.getString(name) ?? null,
  setItem: (name, value) => {
    mmkv.set(name, value);
  },
  removeItem: (name) => {
    mmkv.delete(name);
  },
};

/** Zera toda store persistida (logout). */
export function resetPersistedStores(): void {
  mmkv.clearAll();
}
