/**
 * The shelter layer says how current it is (#201).
 *
 * An empty layer used to mean either "no shelter is open" or "the feed
 * failed", with nothing to tell them apart. The notice distinguishes them and
 * gives the time the shelters shown were reported.
 */
import { render } from "@testing-library/react-native";

import {
  LayerStatusNotice,
  layerStatusMessage,
  resourceDetail,
} from "@/components/map/LayerStatusNotice";
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

describe("layerStatusMessage — shelters", () => {
  it("says nothing before shelters have ever been fetched", () => {
    expect(
      layerStatusMessage("shelter", { asOf: null, failed: false }, 0, NOW),
    ).toBe(null);
  });

  it("gives the time of the shelters shown", () => {
    expect(
      layerStatusMessage(
        "shelter",
        { asOf: THIS_MORNING, failed: false },
        2,
        NOW,
      ),
    ).toMatch(/^Shelters as of 9:30\sAM$/);
  });

  it("adds the day when the shelters are from an earlier day", () => {
    expect(
      layerStatusMessage("shelter", { asOf: YESTERDAY, failed: false }, 2, NOW),
    ).toMatch(/^Shelters as of Oct 4, 9:30\sAM$/);
  });

  it("says none are open, rather than showing an empty layer", () => {
    expect(
      layerStatusMessage(
        "shelter",
        { asOf: THIS_MORNING, failed: false },
        0,
        NOW,
      ),
    ).toMatch(/^No open shelters reported in this area · as of 9:30\sAM$/);
  });

  it("says a refresh failed, and how old the shelters shown are", () => {
    expect(
      layerStatusMessage(
        "shelter",
        { asOf: THIS_MORNING, failed: true },
        2,
        NOW,
      ),
    ).toMatch(/^Couldn't update shelters; showing those as of 9:30\sAM$/);
  });

  it("says shelters couldn't be loaded when none are cached", () => {
    expect(
      layerStatusMessage("shelter", { asOf: null, failed: true }, 0, NOW),
    ).toBe("Couldn't load shelters");
  });
});

describe("resourceDetail — shelters", () => {
  it("gives a shelter's status and when it was reported", () => {
    expect(resourceDetail(SHELTER, NOW)).toMatch(/^Open · as of 9:30\sAM$/);
  });

  it("adds the day when the report is from an earlier day", () => {
    expect(resourceDetail({ ...SHELTER, fetchedAt: YESTERDAY }, NOW)).toMatch(
      /^Open · as of Oct 4, 9:30\sAM$/,
    );
  });

  it("says when the status is unknown", () => {
    expect(resourceDetail({ ...SHELTER, metadata: {} }, NOW)).toMatch(
      /^Status unknown · as of/,
    );
  });
});

describe("LayerStatusNotice", () => {
  beforeEach(() => {
    useResourceStore.setState({
      resources: [SHELTER],
      visibleTypes: new Set<ResourceType>(["fuel", "water", "shelter"]),
      layerStatus: {
        fuel: { asOf: null, failed: false },
        shelter: { asOf: THIS_MORNING, failed: false },
      },
    });
  });

  it("shows the status as a polite live region", async () => {
    const screen = await render(<LayerStatusNotice now={NOW} />);
    const notice = screen.getByTestId("shelter-status");
    expect(notice).toHaveTextContent(/Shelters as of 9:30\sAM/);
    expect(notice.props.accessibilityLiveRegion).toBe("polite");
  });

  it("counts only shelters when deciding whether any are open", async () => {
    useResourceStore.setState({
      resources: [{ ...SHELTER, id: "well", type: "water" }],
    });
    const screen = await render(<LayerStatusNotice now={NOW} />);
    expect(screen.getByTestId("shelter-status")).toHaveTextContent(
      /No open shelters reported/,
    );
  });

  it("is hidden while the shelter layer is off", async () => {
    useResourceStore.setState({
      visibleTypes: new Set<ResourceType>(["fuel", "water"]),
    });
    const screen = await render(<LayerStatusNotice now={NOW} />);
    expect(screen.queryByTestId("shelter-status")).toBeNull();
  });
});

const STATION = {
  type: "fuel",
  metadata: { brand: "Shell", diesel: true },
  fetchedAt: THIS_MORNING,
};

describe("layerStatusMessage — fuel (#200)", () => {
  it("names fuel stations in its own words", () => {
    expect(
      layerStatusMessage("fuel", { asOf: THIS_MORNING, failed: false }, 3, NOW),
    ).toMatch(/^Fuel stations as of 9:30\sAM$/);
    expect(
      layerStatusMessage("fuel", { asOf: THIS_MORNING, failed: false }, 0, NOW),
    ).toMatch(/^No fuel stations found in this area · as of 9:30\sAM$/);
  });

  it("says a failed load is a failure, not an empty area", () => {
    expect(
      layerStatusMessage("fuel", { asOf: null, failed: true }, 0, NOW),
    ).toBe("Couldn't load fuel stations");
  });
});

describe("resourceDetail — fuel (#200)", () => {
  it("gives the brand, diesel and when it was fetched", () => {
    expect(resourceDetail(STATION, NOW)).toMatch(
      /^Shell · Diesel · as of 9:30\sAM$/,
    );
  });

  it("leaves out what OSM doesn't say", () => {
    expect(resourceDetail({ ...STATION, metadata: {} }, NOW)).toMatch(
      /^as of 9:30\sAM$/,
    );
  });

  it("has nothing to add for water", () => {
    expect(resourceDetail({ ...STATION, type: "water" }, NOW)).toBeNull();
  });
});

describe("LayerStatusNotice — fuel and shelters together", () => {
  it("shows a line for each visible layer with a status", async () => {
    useResourceStore.setState({
      resources: [],
      visibleTypes: new Set<ResourceType>(["fuel", "water", "shelter"]),
      layerStatus: {
        fuel: { asOf: null, failed: true },
        shelter: { asOf: THIS_MORNING, failed: false },
      },
    });
    const screen = await render(<LayerStatusNotice now={NOW} />);
    expect(screen.getByTestId("fuel-status")).toHaveTextContent(
      "Couldn't load fuel stations",
    );
    expect(screen.getByTestId("shelter-status")).toHaveTextContent(
      /No open shelters reported/,
    );
  });

  it("hides the fuel line while the fuel layer is off", async () => {
    useResourceStore.setState({
      visibleTypes: new Set<ResourceType>(["shelter"]),
      layerStatus: {
        fuel: { asOf: null, failed: true },
        shelter: { asOf: null, failed: false },
      },
    });
    const screen = await render(<LayerStatusNotice now={NOW} />);
    expect(screen.queryByTestId("fuel-status")).toBeNull();
  });
});
