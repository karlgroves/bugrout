/**
 * Emergency contact SMS utility.
 * Sends a one-tap SMS with current location, destination, and ETA.
 */

import { track, Events } from "@/platform/analytics";
import * as SMS from "@/platform/sms";

import { formatDuration } from "./geo";

import type { LatLng } from "@bugrout/shared";

/**
 *
 */
export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
}

/**
 * Compose an emergency SMS message.
 */
export function composeEmergencyMessage(
  currentPosition: LatLng,
  destination: LatLng | null,
  etaSeconds: number | null,
): string {
  let message = `BugRout Alert: I am evacuating.\n`;
  message += `Current location: ${currentPosition.lat.toFixed(5)}, ${currentPosition.lng.toFixed(5)}\n`;

  if (destination) {
    message += `Destination: ${destination.lat.toFixed(5)}, ${destination.lng.toFixed(5)}\n`;
  }

  if (etaSeconds !== null) {
    message += `ETA: ${formatDuration(etaSeconds)}\n`;
  }

  message += `\nSent via BugRout`;
  return message;
}

/**
 * Open the system message composer, addressed to every emergency contact.
 *
 * Nothing is sent unless the user taps Send in the composer. The result says
 * what happened: iOS reports "sent" or "cancelled"; Android can't tell, so it
 * is "unknown" there.
 *
 * @returns The composer's result.
 */
export async function sendEmergencySMS(
  contacts: EmergencyContact[],
  message: string,
): Promise<SMS.SMSResult["result"]> {
  const phones = contacts.map((c) => c.phone);
  const { result } = await SMS.sendSMSAsync(phones, message);
  if (result === "sent") {
    track(Events.EMERGENCY_SMS_SENT, { contact_count: contacts.length });
  }
  return result;
}
