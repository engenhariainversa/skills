const expoPreset = require('jest-expo/jest-preset');

const moduleNameMapper = {
  '^@/(.*)$': '<rootDir>/src/$1',
  // babel-preset-expo reescreve `process.env.EXPO_PUBLIC_*` para `expo/virtual/env` (ESM), que o
  // projeto `logic` (Node puro) não carrega: vira um stub.
  '^expo/virtual/env$': '<rootDir>/test/expo-env-stub.js',
  // Packages do workspace compilados em ESM importam irmãos com `.js`; tirar a extensão deixa o
  // resolver do Jest achar o `.js` do dist ou o `.ts` da fonte.
  '^(\\.{1,2}/.*)\\.js$': '$1',
};

// nativewind/react-native-css-interop e os packages do workspace (@repo) vêm em ESM sem transpilar.
const [expoIgnore, ...restIgnore] = expoPreset.transformIgnorePatterns;
const uiTransformIgnore = [expoIgnore.replace('))', '|nativewind|react-native-css-interop|@repo))'), ...restIgnore];

/**
 * Dois projetos separam a lógica pura das telas:
 * - `logic` (*.test.ts): models, viewmodels e services em Node puro, sem preset do Expo. Um módulo
 *   que importar react-native ou expo-router falha aqui (test/logic-setup.js), e esse é o ponto.
 * - `ui` (*.test.tsx): telas e componentes com jest-expo + @testing-library/react-native.
 */
/** @type {import('jest').Config} */
module.exports = {
  passWithNoTests: true,
  // Global de propósito: o Jest ignora testTimeout dentro de `projects`. O primeiro render de uma
  // tela num worker é frio (RN + NativeWind transformados no import) e passa de 5 s no CI.
  testTimeout: 30_000,
  projects: [
    {
      displayName: 'logic',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.test.ts'],
      transform: { '\\.[jt]sx?$': 'babel-jest' },
      transformIgnorePatterns: ['/node_modules/(?!(@repo)/)'],
      moduleNameMapper,
      setupFiles: ['<rootDir>/test/logic-setup.js'],
    },
    {
      displayName: 'ui',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/(app|src)/**/*.test.tsx'],
      setupFiles: ['<rootDir>/test/ui-setup.js'],
      // Reanimated 4 roda worklets via react-native-worklets; o resolver dele escolhe as versões JS.
      resolver: 'react-native-worklets/jest/resolver.js',
      transformIgnorePatterns: uiTransformIgnore,
      moduleNameMapper: { ...moduleNameMapper, '\\.css$': '<rootDir>/test/css-stub.js' },
    },
  ],
};
