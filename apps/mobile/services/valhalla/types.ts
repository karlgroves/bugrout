/**
 * Valhalla API types — matches Valhalla's JSON response format.
 * Used to parse native module responses into our Route type.
 */

/**
 *
 */
export interface ValhallaRouteResponse {
  trip: {
    locations: ValhallaLocation[];
    legs: ValhallaLeg[];
    summary: {
      length: number; // km
      time: number; // seconds
    };
    status_message: string;
    status: number;
  };
}

/**
 *
 */
export interface ValhallaLocation {
  lat: number;
  lon: number;
  type: string;
}

/**
 *
 */
export interface ValhallaLeg {
  maneuvers: ValhallaManeuver[];
  summary: {
    length: number;
    time: number;
  };
  shape: string; // encoded polyline
}

/**
 *
 */
export interface ValhallaManeuver {
  type: number;
  instruction: string;
  street_names?: string[];
  length: number;
  time: number;
  begin_shape_index: number;
  end_shape_index: number;
}
