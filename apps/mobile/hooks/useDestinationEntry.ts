/**
 * Setting a destination by address or by a dropped pin (#187).
 *
 * Lifted out of the plan editor so the saved-destination editor asks the same
 * way and refuses the same things: an ambiguous address is offered to the
 * user rather than settled by taking the first match, and no match or no
 * network resolves nothing at all, so nothing without coordinates is saved.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";

import {
  lookupAddress,
  lookupMessage,
  type AddressLookup,
} from "@/services/geocoding/AddressLookup";
import { reverseGeocode } from "@/services/geocoding/Geocoder";
import { useScenarioStore } from "@/stores/useScenarioStore";

import type { GeocodeResult } from "@/services/geocoding/Geocoder";
import type { LatLng } from "@bugrout/shared";

/** A destination ready to save, and the address to save with it. */
interface ResolvedDestination {
  point: LatLng;
  address: string | null;
}

/** What {@link useDestinationEntry} returns. */
interface DestinationEntry {
  address: string;
  resolved: ResolvedDestination | null;
  matches: GeocodeResult[] | null;
  lookingUp: boolean;
  changeAddress: (text: string) => void;
  pickMatch: (match: GeocodeResult) => void;
  /** The destination to save, or `null` with the user told why. */
  resolve: () => Promise<ResolvedDestination | null>;
}

/**
 * State and actions for one destination field.
 *
 * @param initial - The destination as already saved, or handed in. Non-null
 *   means no lookup is needed, which is why renaming a saved entry still works
 *   with no signal: nothing re-resolves a destination already resolved.
 * @returns The field's state, and `resolve` to call on save.
 */
export function useDestinationEntry(
  initial: ResolvedDestination | null,
): DestinationEntry {
  const pickedDestination = useScenarioStore((s) => s.pickedDestination);
  const setPickedDestination = useScenarioStore((s) => s.setPickedDestination);

  /** What is in the address field. Empty for a destination set by a pin. */
  const [address, setAddress] = useState(initial?.address ?? "");

  /**
   * The destination ready to save. Typing in the address field clears it,
   * because the text no longer describes the point.
   */
  const [resolved, setResolved] = useState(initial);

  /** Matches awaiting the user's choice; never resolved by taking the first. */
  const [matches, setMatches] = useState<GeocodeResult[] | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  // A point chosen on the map arrives through the store. Reverse-geocode it
  // once, here, where the user has just asked for it — rather than filling in
  // addresses in the background, which would send where someone is going to a
  // third party nobody invited.
  useEffect(() => {
    if (!pickedDestination) return;
    const point = pickedDestination;
    setPickedDestination(null);
    setResolved({ point, address: null });
    setMatches(null);
    setAddress("");

    void reverseGeocode(point)
      .then((found) => {
        if (!found) return;
        setAddress(found);
        setResolved({ point, address: found });
      })
      .catch(() => {
        // A pin is allowed to have no address: a rally point in a field has
        // none, and offline there is no way to ask. It saves either way.
      });
  }, [pickedDestination, setPickedDestination]);

  const changeAddress = useCallback((text: string) => {
    setAddress(text);
    // The text no longer describes the resolved point, so it has to be
    // looked up again before this can be saved.
    setResolved(null);
    setMatches(null);
  }, []);

  /** A match the user chose from an ambiguous address. */
  const pickMatch = useCallback((match: GeocodeResult) => {
    setResolved({
      point: { lat: match.lat, lng: match.lng },
      address: match.displayName,
    });
    setAddress(match.displayName);
    setMatches(null);
  }, []);

  // Looks the address up if it needs it. `null` means nothing to save yet:
  // the user has been told why, or offered matches to choose from.
  const resolve = useCallback(async (): Promise<ResolvedDestination | null> => {
    // Already resolved — a pin, a chosen match, or as saved. Nothing to look
    // up, so this works with no connection.
    if (resolved) return resolved;

    if (!address.trim()) {
      Alert.alert(
        "Destination Required",
        "Enter an address, or drop a pin on the map.",
      );
      return null;
    }

    setLookingUp(true);
    let lookup: AddressLookup;
    try {
      lookup = await lookupAddress(address);
    } finally {
      setLookingUp(false);
    }

    if (lookup.kind === "one") {
      return {
        point: { lat: lookup.match.lat, lng: lookup.match.lng },
        address: lookup.match.displayName,
      };
    }

    if (lookup.kind === "many") {
      // Several places match. Offer them; never pick one silently.
      setMatches(lookup.matches);
      return null;
    }

    if (lookup.kind === "superseded") return null;

    // Nothing is saved, and what was typed is left alone to be corrected.
    const message = lookupMessage(lookup);
    if (message) Alert.alert(message.title, message.body);
    return null;
  }, [address, resolved]);

  const entry = { address, resolved, matches, lookingUp };
  return { ...entry, changeAddress, pickMatch, resolve };
}
