/**
 * The map and route preview say when threat data couldn't be updated (#288),
 * so no warning box never reads as a confirmed-clear route.
 */
import { render } from "@testing-library/react-native";

import { threatStatusMessage } from "@/components/map/ThreatStatusNotice";
import { RouteThreatWarnings } from "@/components/routing/RouteThreatWarnings";
import { useThreatStore } from "@/stores/useThreatStore";

describe("threatStatusMessage", () => {
  it("says nothing while every source is current", () => {
    expect(threatStatusMessage({}, "map")).toBeNull();
    expect(
      threatStatusMessage({ nws: false, usfs: false }, "route"),
    ).toBeNull();
  });

  it("names each failed source", () => {
    expect(threatStatusMessage({ usfs: true }, "map")).toBe(
      "Couldn't update fire perimeters; threats shown may be out of date",
    );
    expect(threatStatusMessage({ nws: true, usfs: true }, "route")).toBe(
      "Couldn't update weather alerts and fire perimeters; this route may not avoid current threats",
    );
  });
});

describe("RouteThreatWarnings — threat data status", () => {
  it("warns on a route with no threats when a feed failed", async () => {
    useThreatStore.setState({ failedSources: { usfs: true } });
    const screen = await render(<RouteThreatWarnings threats={[]} />);
    const notice = screen.getByTestId("threat-status");
    expect(notice).toHaveTextContent(
      "Couldn't update fire perimeters; this route may not avoid current threats",
    );
    expect(notice.props.accessibilityLiveRegion).toBe("polite");
  });

  it("renders nothing for a clear route with current data", async () => {
    useThreatStore.setState({ failedSources: { nws: false, usfs: false } });
    const screen = await render(<RouteThreatWarnings threats={[]} />);
    expect(screen.queryByTestId("threat-status")).toBeNull();
    expect(screen.toJSON()).toBeNull();
  });
});
