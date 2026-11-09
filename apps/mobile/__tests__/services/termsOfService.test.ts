/**
 * Tests for the bundled terms of service.
 *
 * Like the privacy policy, the terms are a representation the user agrees to at
 * first launch, so the capabilities they describe are as much a contract as any
 * API. These pin the claims that were wrong before (#285) — in each case the
 * code, not the prose, is the authority, and `docs/store-listing.md` is where
 * the same claims were already struck from the store listing.
 */

import { TERMS_OF_SERVICE } from "@/constants/legal";

describe("terms of service — the routing claims", () => {
  it("does not attribute routes to statistical models (#195)", () => {
    // The ELF congestion model is baked into no routing tile and applied to no
    // route, so no route suggestion comes from a statistical model.
    expect(TERMS_OF_SERVICE).not.toMatch(/statistical model/i);
  });

  it("names what routes actually come from", () => {
    expect(TERMS_OF_SERVICE).toContain(
      "based on map data and cached threat information",
    );
  });

  it("does not claim offline routing (#193, #146)", () => {
    // Every route is an HTTP request to the remote Valhalla service: the native
    // in-process engine is behind a config plugin no build enables, and region
    // packages ship no routing graph (valhallaSize is 0).
    expect(TERMS_OF_SERVICE).not.toContain("Offline routing");
    expect(TERMS_OF_SERVICE).not.toContain(
      "BugRout is designed to work without internet connectivity",
    );
  });

  it("says routing requires a data connection", () => {
    expect(TERMS_OF_SERVICE).toContain(
      "Routing requires a data connection. Every route is calculated by BugRout's routing service over the network",
    );
  });

  it("does not imply real-time traffic is available online", () => {
    // "(when offline)" read as a promise of traffic data while online. No
    // service in this repository fetches traffic of any kind.
    expect(TERMS_OF_SERVICE).not.toContain(
      "Real-time traffic conditions (when offline)",
    );
    expect(TERMS_OF_SERVICE).toContain(
      "Real-time traffic conditions, which BugRout does not receive from any source",
    );
  });

  it("has been re-dated", () => {
    expect(TERMS_OF_SERVICE).not.toContain("Last Updated: October 2026");
    expect(TERMS_OF_SERVICE).toContain("Last Updated: November 2026");
  });
});
