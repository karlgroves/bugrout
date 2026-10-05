/**
 * A plan whose destination is outside the downloaded maps warns when it's
 * saved (#190), while there's still time and signal to fix it — not during the
 * evacuation, when routing to it fails.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";

import ScenarioEditScreen from "@/app/scenarios/edit";
import { confirmCoverage, coverageWarning } from "@/services/routing/coverage";
import { useScenarioStore } from "@/stores/useScenarioStore";

const MARYLAND = {
  name: "Maryland",
  bbox: { west: -79.49, south: 37.91, east: -75.05, north: 39.72 },
};
const ANNAPOLIS = { lat: 38.9784, lng: -76.4922 };
const LOUISVILLE = { lat: 38.2527, lng: -85.7585 };

const mockGetDownloadedRegions = jest.fn();
jest.mock("@/db/queries/regions", () => ({
  getDownloadedRegions: () => mockGetDownloadedRegions() as unknown,
}));

const mockUpsertScenario = jest.fn().mockResolvedValue(undefined);
jest.mock("@/db/queries/scenarios", () => ({
  upsertScenario: (...args: unknown[]) =>
    mockUpsertScenario(...args) as unknown,
  deleteScenario: jest.fn(),
}));

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({}),
}));

/** The buttons of the most recent alert. */
function lastAlertButtons(spy: jest.SpyInstance): AlertButton[] {
  const call = spy.mock.calls.at(-1) as unknown[] | undefined;
  return (call?.[2] ?? []) as AlertButton[];
}

describe("coverageWarning", () => {
  it("is silent for a destination inside a downloaded region", () => {
    expect(coverageWarning(ANNAPOLIS, [MARYLAND])).toBeNull();
  });

  it("names the downloaded regions when the destination is outside them", () => {
    expect(coverageWarning(LOUISVILLE, [MARYLAND])).toMatch(
      /outside your downloaded maps \(Maryland\)/,
    );
  });

  it("says no maps are downloaded when there are none", () => {
    expect(coverageWarning(ANNAPOLIS, [])).toMatch(
      /No offline maps are downloaded yet/,
    );
  });
});

describe("saving a scenario", () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    mockGetDownloadedRegions.mockReset().mockResolvedValue([MARYLAND]);
    mockUpsertScenario.mockClear();
    mockBack.mockClear();
    useScenarioStore.setState({ scenarios: [] });
  });

  afterEach(() => {
    alert.mockRestore();
  });

  /**
   * Fill in the editor and press Save. `pressing` settles once the save
   * handler ends, which may wait on the coverage alert.
   */
  async function save(destination: {
    lat: number;
    lng: number;
  }): Promise<{ pressing: Promise<unknown> }> {
    const screen = await render(<ScenarioEditScreen />);
    await fireEvent.changeText(
      screen.getByLabelText("Scenario name"),
      "Family",
    );
    await fireEvent.changeText(
      screen.getByLabelText("Destination latitude"),
      String(destination.lat),
    );
    await fireEvent.changeText(
      screen.getByLabelText("Destination longitude"),
      String(destination.lng),
    );
    // Not awaited: the save waits on the coverage alert, which the test answers.
    return {
      pressing: fireEvent.press(screen.getByLabelText("Save Scenario")),
    };
  }

  it("saves a destination inside the maps without asking", async () => {
    await (
      await save(ANNAPOLIS)
    ).pressing;
    await waitFor(() => {
      expect(mockUpsertScenario).toHaveBeenCalled();
    });
    expect(alert).not.toHaveBeenCalled();
  });

  it("warns before saving a destination outside the maps, and waits", async () => {
    const { pressing } = await save(LOUISVILLE);
    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith(
        "Outside your offline maps",
        expect.stringMatching(/Maryland/),
        expect.any(Array),
        expect.any(Object),
      );
    });
    expect(mockUpsertScenario).not.toHaveBeenCalled();

    lastAlertButtons(alert)
      .find((b) => b.text === "Save anyway")
      ?.onPress?.();
    await pressing;
    expect(mockUpsertScenario).toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });

  it("goes back to editing when the user chooses to change it", async () => {
    const { pressing } = await save(LOUISVILLE);
    await waitFor(() => {
      expect(alert).toHaveBeenCalled();
    });
    lastAlertButtons(alert)
      .find((b) => b.text === "Change destination")
      ?.onPress?.();
    await pressing;
    expect(mockUpsertScenario).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("treats dismissing the warning as going back to editing", async () => {
    const pending = confirmCoverage(LOUISVILLE);
    await waitFor(() => {
      expect(alert).toHaveBeenCalled();
    });
    const call = alert.mock.calls.at(-1) as unknown[] | undefined;
    const options = call?.[3] as { onDismiss?: () => void };
    options.onDismiss?.();
    await expect(pending).resolves.toBe(false);
  });
});
