// Конфиг CRACO, чтобы сборка CRA корректно работала с sql.js
// и не требовала node-модуль `fs` в браузерном бандле.

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Отключаем требование node-модуля fs (и других, если понадобится)
      webpackConfig.resolve = webpackConfig.resolve || {};
      webpackConfig.resolve.fallback = {
        ...(webpackConfig.resolve.fallback || {}),
        fs: false,
        path: false,
        crypto: false,
      };
      return webpackConfig;
    },
  },
};


