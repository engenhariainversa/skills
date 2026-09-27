/* global jest */
// Projeto `ui`: telas sob jest-expo. Módulos nativos tocados no import viram fakes aqui, então cada
// teste só mocka o que é assunto dele.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return {
    ...require('react-native-safe-area-context/jest/mock'),
    initialWindowMetrics: { insets, frame },
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: View,
  };
});
jest.mock('react-native-mmkv', () => require('./fakes/mmkv'));
jest.mock('expo-secure-store', () => require('./fakes/secure-store'));
jest.mock('expo-device', () => ({ osName: 'iOS', modelName: 'Test', osVersion: '18.0' }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0.1.0', nativeBuildVersion: '1' }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { scheme: '<scheme>' } } }));
