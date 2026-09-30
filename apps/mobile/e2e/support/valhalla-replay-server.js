/**
 * A routing server for the E2E suite that replays recorded Valhalla responses
 * (#190).
 *
 * The suite used to get its route from ValhallaModule's made-up straight-line
 * fallback, which only existed because routing never admitted failure. That
 * fallback is gone: a failure is now an honest "no route" state. So the suite
 * needs real routes without reaching a real service from CI, and this is where
 * they come from.
 *
 * It answers `POST /route` the way bugrout-valhalla.fly.dev does:
 * - a request whose first and last locations match a recorded route (within
 *   MATCH_TOLERANCE_M) gets that route's recorded response, verbatim;
 * - anything else gets the live server's own out-of-coverage error
 *   (error_code 171), so a spec can exercise the "outside your maps" state
 *   just by routing somewhere unrecorded.
 *
 * The app reaches it at localhost:8002, its default when no
 * EXPO_PUBLIC_VALHALLA_URL is baked in; on Android, launchToMapScreen forwards
 * the emulator's port 8002 to this host with `adb reverse`.
 *
 * Recordings live in e2e/fixtures/valhalla-routes.json. To add one, POST the
 * same request to the live server and store `from`, `to` and the response.
 */

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

/** How far a requested location may be from a recorded one and still match. */
const MATCH_TOLERANCE_M = 150;

/** Verbatim what the live server returns for a location off its road graph. */
const OUT_OF_COVERAGE = {
  error_code: 171,
  error: "No suitable edges near location",
  status_code: 400,
  status: "Bad Request",
};

/**
 * Great-circle distance in metres.
 *
 * @param {{lat: number, lon: number}} a
 * @param {{lat: number, lon: number}} b
 * @returns {number}
 */
function distanceM(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * The recorded route for a request, if its endpoints match one.
 *
 * @param {Array<{from: object, to: object, response: object}>} recordings
 * @param {{locations?: Array<{lat: number, lon: number}>}} request
 * @returns {object | undefined} The recorded response.
 */
function findRecording(recordings, request) {
  const locations = request.locations ?? [];
  const first = locations[0];
  const last = locations.at(-1);
  if (!first || !last) return undefined;
  return recordings.find(
    (r) =>
      distanceM(r.from, first) <= MATCH_TOLERANCE_M &&
      distanceM(r.to, last) <= MATCH_TOLERANCE_M,
  )?.response;
}

/**
 * Start the replay server.
 *
 * @param {{port?: number, fixture?: string}} [options]
 * @returns {Promise<http.Server>} Resolves once it is listening.
 */
function startReplayServer(options = {}) {
  const port = options.port ?? 8002;
  const fixture =
    options.fixture ??
    path.join(__dirname, "..", "fixtures", "valhalla-routes.json");
  const recordings = JSON.parse(fs.readFileSync(fixture, "utf8"));

  const server = http.createServer((req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.method === "GET" && req.url === "/status") {
      reply(200, { version: "replay" });
      return;
    }
    if (req.method !== "POST" || req.url !== "/route") {
      reply(404, { error: `not replayed: ${req.method} ${req.url}` });
      return;
    }

    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      let request;
      try {
        request = JSON.parse(raw);
      } catch {
        reply(400, { error: "request body is not JSON" });
        return;
      }
      const recorded = findRecording(recordings, request);
      // Logged so a failing spec shows which route the app actually asked for.
      console.log(
        `[valhalla-replay] ${recorded ? "200 recorded" : "400 out of coverage"} for ${JSON.stringify(request.locations)}`,
      );
      if (recorded) reply(200, recorded);
      else reply(400, OUT_OF_COVERAGE);
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      resolve(server);
    });
  });
}

module.exports = { startReplayServer, findRecording, MATCH_TOLERANCE_M };
