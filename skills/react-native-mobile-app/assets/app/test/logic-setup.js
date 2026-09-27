/* global jest */
// Projeto `logic`: models, viewmodels e services rodam em Node puro. Guard do MVVM: nenhum deles
// pode importar react-native ou expo-router; módulos nativos que tocam viram fakes em memória.
jest.mock('react-native', () => {
  throw new Error('react-native must not be imported by models, viewmodels or services');
});
jest.mock('expo-router', () => {
  throw new Error('expo-router must not be imported by models, viewmodels or services');
});
jest.mock('react-native-mmkv', () => require('./fakes/mmkv'));
jest.mock('expo-secure-store', () => require('./fakes/secure-store'));
jest.mock('expo-device', () => ({ osName: 'iOS', modelName: 'Test', osVersion: '18.0' }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0.1.0', nativeBuildVersion: '1' }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { scheme: '<scheme>' } } }));
