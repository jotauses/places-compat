// Types mirrored from use-places-autocomplete 4.0.1 (dist/index.d.ts). MIT License, Copyright (c) 2020 Welly Shen.
export type RequestOptions = Omit<google.maps.places.AutocompletionRequest, 'input'>;

export interface HookArgs {
  requestOptions?: RequestOptions;
  debounce?: number;
  cache?: number | false;
  cacheKey?: string;
  // biome-ignore lint/suspicious/noExplicitAny: mirrors the published type
  googleMaps?: any;
  callbackName?: string;
  defaultValue?: string;
  initOnMount?: boolean;
}

export type Suggestion = google.maps.places.AutocompletePrediction;

export type Status = `${google.maps.places.PlacesServiceStatus}` | '';

export interface Suggestions {
  readonly loading: boolean;
  readonly status: Status;
  data: Suggestion[];
}

export interface SetValue {
  // biome-ignore lint/style/useShorthandFunctionType: mirrors the published type
  (val: string, shouldFetchData?: boolean): void;
}

export interface ClearSuggestions {
  // biome-ignore lint/style/useShorthandFunctionType: mirrors the published type
  (): void;
}

export interface ClearCache {
  // biome-ignore lint/style/useShorthandFunctionType: mirrors the published type
  (key?: string): void;
}

export interface Init {
  // biome-ignore lint/style/useShorthandFunctionType: mirrors the published type
  (): void;
}

export interface HookReturn {
  ready: boolean;
  value: string;
  suggestions: Suggestions;
  setValue: SetValue;
  clearSuggestions: ClearSuggestions;
  clearCache: ClearCache;
  init: Init;
}

export type GeoArgs = google.maps.GeocoderRequest;

export type GeocodeResult = google.maps.GeocoderResult;

export type GeoReturn = Promise<GeocodeResult[]>;

export type LatLng = { lat: number; lng: number };

export type ZipCode = string | undefined;

export type GetDetailsArgs = google.maps.places.PlaceDetailsRequest;

export type DetailsResult = Promise<google.maps.places.PlaceResult | string>;
