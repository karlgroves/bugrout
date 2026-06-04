/**
 * Temporary type declarations for @maplibre/maplibre-react-native
 *
 * The actual types come from the package, but until MapLibre RN is
 * properly installed and linked (requires native build), we provide
 * minimal declarations to allow type-checking of app code.
 *
 * These will be removed once the Sprint 0 PoC validates the MapLibre integration.
 */

declare module "@maplibre/maplibre-react-native" {
  import { Component } from "react";
  import { ViewStyle } from "react-native";

  export function setAccessToken(token: string | null): void;

  export interface OnPressEvent {
    features: Array<{
      type: string;
      geometry: { type: string; coordinates: number[] };
      properties: Record<string, unknown>;
    }>;
    coordinates: { latitude: number; longitude: number };
  }

  export interface MapViewProps {
    style?: ViewStyle;
    styleURL?: string;
    onPress?: (event: OnPressEvent) => void;
    onRegionDidChange?: () => void;
    attributionEnabled?: boolean;
    logoEnabled?: boolean;
    compassEnabled?: boolean;
    compassViewMargins?: { x: number; y: number };
    children?: React.ReactNode;
  }

  export interface MapViewRef {
    getVisibleBounds: () => Promise<[[number, number], [number, number]]>;
  }

  export class MapView extends Component<
    MapViewProps & { ref?: React.Ref<MapViewRef> }
  > {}

  export interface CameraProps {
    defaultSettings?: {
      centerCoordinate?: [number, number];
      zoomLevel?: number;
    };
    followUserLocation?: boolean;
    followUserMode?: string;
    children?: React.ReactNode;
  }

  export class Camera extends Component<CameraProps> {}

  export const UserTrackingMode: {
    Follow: string;
    FollowWithHeading: string;
    FollowWithCourse: string;
  };

  export interface UserLocationProps {
    visible?: boolean;
    renderMode?: string;
    androidRenderMode?: string;
  }

  export class UserLocation extends Component<UserLocationProps> {}

  export interface ShapeSourceProps {
    id: string;
    shape: unknown;
    cluster?: boolean;
    clusterRadius?: number;
    clusterMaxZoomLevel?: number;
    onPress?: (event: OnPressEvent) => void;
    children?: React.ReactNode;
  }

  export class ShapeSource extends Component<ShapeSourceProps> {}

  export interface LineLayerProps {
    id: string;
    belowLayerID?: string;
    style?: Record<string, unknown>;
  }

  export class LineLayer extends Component<LineLayerProps> {}

  export interface FillLayerProps {
    id: string;
    style?: Record<string, unknown>;
  }

  export class FillLayer extends Component<FillLayerProps> {}

  export interface CircleLayerProps {
    id: string;
    filter?: unknown[];
    style?: Record<string, unknown>;
  }

  export class CircleLayer extends Component<CircleLayerProps> {}

  export interface SymbolLayerProps {
    id: string;
    filter?: unknown[];
    style?: Record<string, unknown>;
  }

  export class SymbolLayer extends Component<SymbolLayerProps> {}
}
