/**
 * Smoke tests for the shared presentational components extracted in #68/#69.
 *
 * These trees carry no logic, so the scope is narrow but real: each component
 * is now depended on by more than one screen, and nothing else in CI verifies
 * rendered output — typecheck and bundle:check only see the module graph.
 *
 * First component tests in the repo. They use React Native Testing Library
 * rather than react-test-renderer, which React has deprecated. Note RNTL 14's
 * `render` is async, so every call must be awaited — without the await the
 * queries land on a pending Promise and fail for unrelated reasons.
 */

import { render } from "@testing-library/react-native";

import { FeatureRow } from "@/components/common/FeatureRow";
import { LegalDocument } from "@/components/common/LegalDocument";

describe("FeatureRow", () => {
  it("renders its label", async () => {
    const { getByText } = await render(
      <FeatureRow icon="road" text="Offline routing" />,
    );
    expect(getByText("Offline routing")).toBeTruthy();
  });

  it("keeps each row's label distinct when several are listed", async () => {
    const { getByText } = await render(
      <>
        <FeatureRow icon="fire" text="Wildfire avoidance" />
        <FeatureRow icon="tint" text="Water stations" />
      </>,
    );
    expect(getByText("Wildfire avoidance")).toBeTruthy();
    expect(getByText("Water stations")).toBeTruthy();
  });

  it("routes the icon prop through to a different glyph", async () => {
    const road = await render(<FeatureRow icon="road" text="same" />);
    const roadTree = JSON.stringify(road.toJSON());
    await road.unmount();

    const fire = await render(<FeatureRow icon="fire" text="same" />);
    expect(JSON.stringify(fire.toJSON())).not.toEqual(roadTree);
  });
});

describe("LegalDocument", () => {
  it("renders the supplied document body", async () => {
    const { getByText } = await render(
      <LegalDocument text="Privacy policy body." />,
    );
    expect(getByText("Privacy policy body.")).toBeTruthy();
  });

  // These two assert on exact whitespace, so they must opt out of RNTL's
  // default text normalization — with it on, the trim assertion passes even
  // when the component stops trimming.
  const verbatim = { normalizer: (text: string): string => text };

  it("trims the surrounding blank lines the bundled constants carry", async () => {
    const { getByText } = await render(
      <LegalDocument text={"\n\n  Terms body.  \n\n"} />,
    );
    expect(getByText("Terms body.", verbatim)).toBeTruthy();
  });

  it("preserves interior line breaks so the policy stays readable", async () => {
    const { getByText } = await render(
      <LegalDocument text={"Section 1.\n\nSection 2."} />,
    );
    expect(getByText("Section 1.\n\nSection 2.", verbatim)).toBeTruthy();
  });
});
