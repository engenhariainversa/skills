const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// expo/metro-config detecta a raiz do workspace (pnpm/npm) sozinho: não configure watchFolders nem
// nodeModulesPaths à mão. Só o NativeWind entra por cima.
module.exports = withNativeWind(getDefaultConfig(__dirname), { input: './global.css' });
