/**
 * The shelter layer says how current it is (#201).
 *
 * An empty layer used to mean either "no shelter is open" or "the feed
 * failed", with nothing to tell them apart. The notice distinguishes them and
 * gives the time the shelters shown were reported.
 */
import { render } from "@testing-library/react-native";

import {
  ShelterStatusNotice,
  shelterStatusMessage,
} from "@/components/map/ShelterStatusNotice";
import { useResourceStore } from "@/stores/useResourceStore";

import type { ResourcePoint, ResourceType } from "@bugrout/shared";

const NOW = new Date(2026, 9, 5, 14, 0).getTime();
const THIS_MORNING = new Date(2026, 9, 5, 9, 30).getTime();
const YESTERDAY = new Date(2026, 9, 4, 9, 30).getTime();

const SHELTER: ResourcePoint = {
  id: "fema-1",
  type: "shelter",
  name: "Towson High School",
  lat: 39.4,
  lng: -76.6,
  address: null,
  metadata: { status: "OPEN" },
  source: "fema",
  fetchedAt: THIS_MORNING,
  regionId: "md",
};

describe("shelterStatusMessage", () => {
  it("says nothing before shelters have ever been fetched", () => {
    expect(shelterStatusMessage({ asOf: null, failed: false }, 0, NOW)).toBe(
      null,
    );
  });

  it("gives the time of the shelters shown", () => {
    expect(
      shelterStatusMessage({ asOf: THIS_MORNING, failed: false }, 2, NOW),
    ).toMatch(/^Shelters as of 9:30\sAM$/);
  });

  it("adds the day when the shelters are from an earlier day", () => {
    expect(
      shelterStatusMessage({ asOf: YESTERDAY, failed: false }, 2, NOW),
    ).toMatch(/^Shelters as of Oct 4, 9:30\sAM$/);
  });

  it("says none are open, rather than showing an empty layer", () => {
    expect(
      shelterStatusMessage({ asOf: THIS_MORNING, failed: false }, 0, NOW),
    ).toMatch(/^No open shelters reported in this area · as of 9:30\sAM$/);
  });

  it("says a refresh failed, and how old the shelters shown are", () => {
    expect(
      shelterStatusMessage({ asOf: THIS_MORNING, failed: true }, 2, NOW),
    ).toMatch(/^Couldn't update shelters; showing those as of 9:30\sAM$/);
  });

  it("says shelters couldn't be loaded when none are cached", () => {
    expect(shelterStatusMessage({ asOf: null, failed: true }, 0, NOW)).toBe(
      "Couldn't load shelters",
    );
  });
});

describe("ShelterStatusNotice", () => {
  beforeEach(() => {
    useResourceStore.setState({
      resources: [SHELTER],
      visibleTypes: new Set<ResourceType>(["fuel", "water", "shelter"]),
      shelterStatus: { asOf: THIS_MORNING, failed: false },
    });
  });

  it("shows the status as a polite live region", async () => {
    const screen = await render(<ShelterStatusNotice now={NOW} />);
    const notice = screen.getByTestId("shelter-status");
    expect(notice).toHaveTextContent(/Shelters as of 9:30\sAM/);
    expect(notice.props.accessibilityLiveRegion).toBe("polite");
  });

  it("counts only shelters when deciding whether any are open", async () => {
    useResourceStore.setState({
      resources: [{ ...SHELTER, id: "well", type: "water" }],
    });
    const screen = await render(<ShelterStatusNotice now={NOW} />);
    expect(screen.getByTestId("shelter-status")).toHaveTextContent(
      /No open shelters reported/,
    );
  });

  it("is hidden while the shelter layer is off", async () => {
    useResourceStore.setState({
      visibleTypes: new Set<ResourceType>(["fuel", "water"]),
    });
    const screen = await render(<ShelterStatusNotice now={NOW} />);
    expect(screen.queryByTestId("shelter-status")).toBeNull();
  });
});
