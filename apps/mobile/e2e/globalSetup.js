/**
 * Start the Valhalla replay server, then Detox's own global setup.
 *
 * The server lives for the whole run and is shared by every spec; see
 * support/valhalla-replay-server.js for why it exists (#190).
 */

const detoxGlobalSetup = require("detox/runners/jest/globalSetup");

const { startReplayServer } = require("./support/valhalla-replay-server");

module.exports = async function globalSetup(globalConfig, projectConfig) {
  // Jest runs setup and teardown in the same process, so the handle is shared
  // through globalThis — the pattern Jest documents for this.
  globalThis.__VALHALLA_REPLAY__ = await startReplayServer({ port: 8002 });
  await detoxGlobalSetup(globalConfig, projectConfig);
};
