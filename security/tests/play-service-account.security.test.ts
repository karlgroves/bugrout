/**
 * The Google Play upload key must never be committable.
 *
 * `eas submit --platform android` reads a Google Cloud service-account key
 * from `submit.production.android.serviceAccountKeyPath` in
 * `apps/mobile/eas.json`. That file is a credential: it can publish builds to
 * the Play Store under the account's name.
 *
 * It was configured as `./google-services.json` — the conventional name of a
 * Firebase client config, which is not a secret and is routinely committed.
 * Nothing here uses Firebase (#150), so the name invited exactly the wrong
 * handling, and nothing ignored the path, so dropping the real key there left
 * it one `git add` from the public history.
 *
 * This checks what git itself will do with the configured path, via
 * `git check-ignore`, rather than re-implementing gitignore matching.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const mobileDir = path.join(repoRoot, "apps/mobile");

interface EasConfig {
  submit?: {
    production?: { android?: { serviceAccountKeyPath?: string } };
  };
}

const keyPath = (() => {
  const eas = JSON.parse(
    readFileSync(path.join(mobileDir, "eas.json"), "utf8"),
  ) as EasConfig;
  const configured = eas.submit?.production?.android?.serviceAccountKeyPath;
  assert.ok(configured, "eas.json sets no Android serviceAccountKeyPath");
  return configured;
})();

describe("Google Play service-account key", () => {
  test("is not named like a Firebase config file", () => {
    assert.notEqual(path.basename(keyPath), "google-services.json");
  });

  test("is ignored by git at the path eas.json names", () => {
    const result = spawnSync(
      "git",
      ["check-ignore", "--quiet", "--no-index", keyPath],
      { cwd: mobileDir },
    );
    assert.equal(
      result.status,
      0,
      `${keyPath} (relative to apps/mobile) is not gitignored`,
    );
  });
});
