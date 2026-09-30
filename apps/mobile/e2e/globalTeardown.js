/**
 * Detox's global teardown, then stop the Valhalla replay server that
 * globalSetup.js started.
 */

const detoxGlobalTeardown = require("detox/runners/jest/globalTeardown");

module.exports = async function globalTeardown(globalConfig, projectConfig) {
  await detoxGlobalTeardown(globalConfig, projectConfig);
  const server = globalThis.__VALHALLA_REPLAY__;
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
};
