// Отключаем Node-модули в браузерной сборке (нужно для sql.js)
module.exports = {
  webpack: {
    configure: (config) => {
      config.resolve.fallback = config.resolve.fallback || {};
      config.resolve.fallback.fs = false;
      config.resolve.fallback.path = false;
      config.resolve.fallback.crypto = false;
      config.resolve.fallback.stream = false;
      config.resolve.fallback.buffer = false;
      return config;
    }
  }
};
