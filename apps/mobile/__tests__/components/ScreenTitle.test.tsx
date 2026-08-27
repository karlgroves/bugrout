/**
 * Tests for document titles.
 *
 * `document.title` was `""` on every route in the web build, so every browser
 * tab, history entry and screen-reader page announcement was identical and
 * uninformative (WCAG 2.4.2). Filed as #101.
 *
 * The jest-expo environment is native: `Platform.OS` is not "web" and there is
 * no `document`. Both are the conditions `useScreenTitle` guards on, so the
 * web path has to be set up explicitly here rather than assumed.
 */

import { render } from "@testing-library/react-native";
import { Platform, Text } from "react-native";

import {
  buildDocumentTitle,
  withScreenTitle,
} from "@/components/common/ScreenTitle";

/**
 * A trivial screen to wrap.
 *
 * @returns A single text node.
 */
function DummyScreen(): React.JSX.Element {
  return <Text>content</Text>;
}

describe("buildDocumentTitle", () => {
  it("appends the app name", () => {
    expect(buildDocumentTitle("Settings")).toBe("Settings — BugRout");
  });

  it("never produces an empty title", () => {
    // The defect being fixed was an empty title, so the degenerate input is
    // worth pinning rather than assuming no caller passes it.
    expect(buildDocumentTitle("")).not.toBe("");
    expect(buildDocumentTitle("")).toContain("BugRout");
  });
});

describe("withScreenTitle — on web", () => {
  let doc: { title: string };

  beforeEach(() => {
    doc = { title: "" };
    Object.defineProperty(Platform, "OS", {
      value: "web",
      configurable: true,
    });
    (globalThis as unknown as { document: unknown }).document = doc;
  });

  afterEach(() => {
    Object.defineProperty(Platform, "OS", {
      value: "ios",
      configurable: true,
    });
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  it("sets the document title when the screen mounts", async () => {
    const Titled = withScreenTitle(DummyScreen, "Offline Maps");
    await render(<Titled />);

    expect(doc.title).toBe("Offline Maps — BugRout");
  });

  it("still renders the wrapped screen", async () => {
    const Titled = withScreenTitle(DummyScreen, "Offline Maps");
    const { getByText } = await render(<Titled />);

    expect(getByText("content")).toBeTruthy();
  });

  it("gives different screens different titles", async () => {
    const First = withScreenTitle(DummyScreen, "Map");
    await render(<First />);
    expect(doc.title).toBe("Map — BugRout");

    const Second = withScreenTitle(DummyScreen, "Scenarios");
    await render(<Second />);
    expect(doc.title).toBe("Scenarios — BugRout");
  });
});

describe("withScreenTitle — off web", () => {
  it("touches nothing when the platform is not web", async () => {
    const doc = { title: "untouched" };
    (globalThis as unknown as { document: unknown }).document = doc;

    const Titled = withScreenTitle(DummyScreen, "Map");
    await render(<Titled />);

    // Platform.OS is "ios" in this environment; the native header bar already
    // carries the screen title, so there is nothing to set.
    expect(doc.title).toBe("untouched");
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  it("carries a display name naming the screen it wraps", () => {
    const Titled = withScreenTitle(DummyScreen, "Emergency Contacts");
    expect(Titled.displayName).toBe("withScreenTitle(Emergency Contacts)");
  });
});
