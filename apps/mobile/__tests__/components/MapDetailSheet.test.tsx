/**
 * Tests for the shared map detail sheet.
 *
 * More than a smoke test: this component owns the close affordance for both
 * the threat overlay and the resource markers, including its accessible name
 * and its 44pt touch target. Those are the parts worth pinning — a detail card
 * you cannot dismiss is a trap on a screen someone is using under duress.
 *
 * RNTL 14's `render` is async; see common.test.tsx for the details.
 */

import { render, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";

import { MapDetailSheet } from "@/components/map/MapDetailSheet";

const LABEL = "Close threat details";
const HINT = "Dismisses this threat detail card and returns to the map";

/**
 * Render a sheet with sensible defaults, overriding as needed.
 *
 * `children` is destructured out rather than spread: JSX children written
 * between the tags win over a `children` prop from a spread, so passing
 * `{ children: null }` through the spread would silently do nothing.
 */
function renderSheet(
  overrides: Partial<React.ComponentProps<typeof MapDetailSheet>> = {},
) {
  const { children = <Text>Card body</Text>, ...rest } = overrides;
  const onClose = jest.fn();
  const result = render(
    <MapDetailSheet
      visible
      onClose={onClose}
      closeLabel={LABEL}
      closeHint={HINT}
      {...rest}
    >
      {children}
    </MapDetailSheet>,
  );
  return { onClose, result };
}

describe("MapDetailSheet", () => {
  it("renders its children when open", async () => {
    const { result } = renderSheet();
    const { getByText } = await result;
    expect(getByText("Card body")).toBeTruthy();
  });

  it("exposes the close button by its accessible name", async () => {
    const { result } = renderSheet();
    const { getByLabelText } = await result;
    expect(getByLabelText(LABEL)).toBeTruthy();
  });

  it("calls onClose when the close button is pressed", async () => {
    const { onClose, result } = renderSheet();
    const { getByLabelText } = await result;
    fireEvent.press(getByLabelText(LABEL));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the close button at the 44pt minimum touch target", async () => {
    const { result } = renderSheet();
    const { getByLabelText } = await result;
    expect(getByLabelText(LABEL).props.style).toEqual(
      expect.objectContaining({ minHeight: 44 }),
    );
  });

  it("carries the caller's accessibility hint through", async () => {
    const { result } = renderSheet();
    const { getByLabelText } = await result;
    expect(getByLabelText(LABEL).props.accessibilityHint).toBe(HINT);
  });

  it("withholds the close button while children are absent", async () => {
    // Callers pass `selected ? <>…</> : null`, so children go null as the
    // modal animates out. A lone Close button must not flash in that gap.
    const { result } = renderSheet({ children: null });
    const { queryByLabelText } = await result;
    expect(queryByLabelText(LABEL)).toBeNull();
  });

  it("renders nothing when not visible", async () => {
    const { result } = renderSheet({ visible: false });
    const { queryByText } = await result;
    expect(queryByText("Card body")).toBeNull();
  });
});
