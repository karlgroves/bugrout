import { composeEmergencyMessage } from "@/utils/sms";

describe("composeEmergencyMessage", () => {
  it("includes current location", () => {
    const msg = composeEmergencyMessage(
      { lat: 37.7749, lng: -122.4194 },
      null,
      null,
    );
    expect(msg).toContain("37.77490");
    expect(msg).toContain("-122.41940");
    expect(msg).toContain("BugRout Alert");
  });

  it("includes destination when provided", () => {
    const msg = composeEmergencyMessage(
      { lat: 37.7749, lng: -122.4194 },
      { lat: 34.0522, lng: -118.2437 },
      null,
    );
    expect(msg).toContain("Destination");
    expect(msg).toContain("34.05220");
  });

  it("includes ETA when provided", () => {
    const msg = composeEmergencyMessage(
      { lat: 37.7749, lng: -122.4194 },
      { lat: 34.0522, lng: -118.2437 },
      7200, // 2 hours
    );
    expect(msg).toContain("ETA");
    expect(msg).toContain("2h 0m");
  });

  it("omits destination when not provided", () => {
    const msg = composeEmergencyMessage(
      { lat: 37.7749, lng: -122.4194 },
      null,
      null,
    );
    expect(msg).not.toContain("Destination");
  });
});
