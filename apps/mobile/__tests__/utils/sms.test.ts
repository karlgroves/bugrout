import { composeEmergencyMessage, sendEmergencySMS } from "@/utils/sms";

const mockSendSMSAsync = jest.fn();
jest.mock("@/platform/sms", () => ({
  sendSMSAsync: (...args: unknown[]) => mockSendSMSAsync(...args) as unknown,
}));

const mockTrack = jest.fn();
jest.mock("@/platform/analytics", () => ({
  Events: { EMERGENCY_SMS_SENT: "emergency_sms_sent" },
  track: (...args: unknown[]) => mockTrack(...args) as unknown,
}));

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

/**
 * Nothing is sent without the user tapping Send in the composer (#205), and
 * the app used to report "Emergency message sent" — and count a send — even
 * when they cancelled.
 */
describe("sendEmergencySMS", () => {
  const contacts = [
    { id: "1", name: "A", phone: "555-0100" },
    { id: "2", name: "B", phone: "555-0101" },
  ];

  beforeEach(() => {
    mockSendSMSAsync.mockReset();
    mockTrack.mockReset();
  });

  it("opens the composer addressed to every contact", async () => {
    mockSendSMSAsync.mockResolvedValue({ result: "sent" });
    await sendEmergencySMS(contacts, "msg");
    expect(mockSendSMSAsync).toHaveBeenCalledWith(
      ["555-0100", "555-0101"],
      "msg",
    );
  });

  it("reports and counts a send the composer confirmed", async () => {
    mockSendSMSAsync.mockResolvedValue({ result: "sent" });
    await expect(sendEmergencySMS(contacts, "msg")).resolves.toBe("sent");
    expect(mockTrack).toHaveBeenCalledWith("emergency_sms_sent", {
      contact_count: 2,
    });
  });

  it.each(["cancelled", "unknown"] as const)(
    "neither reports nor counts a %s message as sent",
    async (result) => {
      mockSendSMSAsync.mockResolvedValue({ result });
      await expect(sendEmergencySMS(contacts, "msg")).resolves.toBe(result);
      expect(mockTrack).not.toHaveBeenCalled();
    },
  );
});
