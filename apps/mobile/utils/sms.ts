/**
 * Emergency contact SMS utility.
 * Sends a one-tap SMS with current location, destination, and ETA.
 */

import type { LatLng } from "@bugrout/shared";
import * as SMS from "@/platform/sms";
import { track, Events } from "@/platform/analytics";
import { formatDuration } from "./geo";

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
 * Send emergency SMS to all configured contacts.
 */
export async function sendEmergencySMS(
  contacts: EmergencyContact[],
  message: string,
): Promise<void> {
  const phones = contacts.map((c) => c.phone);
  await SMS.sendSMSAsync(phones, message);
  track(Events.EMERGENCY_SMS_SENT, { contact_count: contacts.length });
}
