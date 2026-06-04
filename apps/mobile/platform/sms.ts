/**
 * SMS platform abstraction.
 * Uses expo-sms when available, logs to console on web.
 */

import { Platform, Alert } from "react-native";

export interface SMSResult {
  result: "sent" | "cancelled" | "unknown";
}

export async function isAvailableAsync(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const mod = "expo-sms";
    const SMS = require(mod);
    return SMS.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function sendSMSAsync(
  addresses: string[],
  message: string,
): Promise<SMSResult> {
  if (Platform.OS === "web") {
    console.log("[BugRout Mock SMS] To:", addresses.join(", "));
    console.log("[BugRout Mock SMS] Message:", message);
    Alert.alert(
      "SMS Preview (Web)",
      `To: ${addresses.join(", ")}\n\n${message}`,
    );
    return { result: "sent" };
  }

  try {
    const mod = "expo-sms";
    const SMS = require(mod);
    const { result } = await SMS.sendSMSAsync(addresses, message);
    return { result: result ?? "unknown" };
  } catch {
    console.log("[BugRout] SMS unavailable, message:", message);
    Alert.alert("SMS Unavailable", "SMS is not available on this device.");
    return { result: "unknown" };
  }
}
