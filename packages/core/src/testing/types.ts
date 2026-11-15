export type Match<R> = string | RegExp | ((request: R) => boolean);

export interface ReplyOpts {
  delayMs?: number;
  times?: number;
  deferred?: boolean;
  sync?: boolean;
}

export interface PendingReply {
  seq: number;
  kind: 'suggest' | 'fetchFields' | 'geocode' | 'predictions' | 'queryPredictions' | 'details';
  resolve(): void;
  reject(error?: Error): void;
}

export interface TextJson {
  text: string;
  matches?: { startOffset?: number; endOffset: number }[];
}

export interface SuggestionJson {
  placePrediction?: {
    place?: string;
    placeId: string;
    text: TextJson;
    structuredFormat?: { mainText?: TextJson; secondaryText?: TextJson };
    types?: string[];
    distanceMeters?: number;
  } | null;
}

export interface OpeningPointJson {
  day: number;
  hour: number;
  minute: number;
}

export interface AuthorAttributionJson {
  displayName: string;
  uri?: string | null;
  photoURI?: string | null;
}

export interface PlaceJson {
  id: string;
  addressComponents?: { longText: string | null; shortText: string | null; types: string[] }[];
  adrFormatAddress?: string | null;
  formattedAddress?: string | null;
  location?: { lat: number; lng: number } | null;
  viewport?: { south: number; west: number; north: number; east: number } | null;
  plusCode?: { globalCode: string | null; compoundCode: string | null } | null;
  types?: string[];
  photos?: {
    heightPx: number;
    widthPx: number;
    authorAttributions: AuthorAttributionJson[];
  }[];
  displayName?: string | null;
  businessStatus?: string | null;
  utcOffsetMinutes?: number | null;
  iconBackgroundColor?: string | null;
  svgIconMaskURI?: string | null;
  regularOpeningHours?: {
    periods: { open: OpeningPointJson; close?: OpeningPointJson | null }[];
    weekdayDescriptions: string[];
  } | null;
  priceLevel?: string | null;
  rating?: number | null;
  userRatingCount?: number | null;
  websiteURI?: string | null;
  internationalPhoneNumber?: string | null;
  nationalPhoneNumber?: string | null;
  reviews?: {
    authorAttribution?: AuthorAttributionJson | null;
    rating?: number | null;
    relativePublishTimeDescription?: string | null;
    text?: string | null;
    textLanguageCode?: string | null;
    publishTime?: string | null;
  }[];
  googleMapsURI?: string | null;
  shortFormattedAddress?: string | null;
  attributions?: { provider: string; providerURI?: string | null }[];
}

export interface FakeControl {
  onSuggest(
    match: Match<google.maps.places.AutocompleteRequest>,
    reply: SuggestionJson[] | Error,
    opts?: ReplyOpts,
  ): void;
  onFetchFields(placeId: string, reply: PlaceJson | Error, opts?: ReplyOpts): void;
  onGeocode(
    match: Match<google.maps.GeocoderRequest>,
    reply: google.maps.GeocoderResult[] | { status: string },
    opts?: ReplyOpts,
  ): void;
  pending: PendingReply[];
  calls: {
    seq: number;
    kind: 'importLibrary' | 'newToken' | 'suggest' | 'toPlace' | 'fetchFields' | 'geocode';
    request: unknown;
    tokenId?: string;
  }[];
  sessions: Map<string, { suggest: number; fetchFields: number; closed: boolean }>;
  reset(): void;
}

export interface LegacyControl {
  onPredictions(
    match: Match<google.maps.places.AutocompletionRequest>,
    reply: google.maps.places.AutocompletePrediction[] | LegacyStatusString,
    opts?: ReplyOpts,
  ): void;
  onDetails(
    placeId: string,
    reply: google.maps.places.PlaceResult | LegacyStatusString,
    opts?: ReplyOpts,
  ): void;
  onGeocode(
    match: Match<google.maps.GeocoderRequest>,
    reply: google.maps.GeocoderResult[] | { status: string },
    opts?: ReplyOpts,
  ): void;
  pending: PendingReply[];
  calls: {
    seq: number;
    kind:
      | 'construct'
      | 'predictions'
      | 'queryPredictions'
      | 'details'
      | 'geocode'
      | 'newToken'
      | 'setter';
    target?: string;
    request: unknown;
  }[];
  selectPlace(place: google.maps.places.PlaceResult, index?: number): void;
  enterWithoutSelection(index?: number): void;
  reset(): void;
}

type LegacyStatusString = `${google.maps.places.PlacesServiceStatus}`;

export interface FixtureMeta {
  source: string;
  license: string;
  copyright: string;
  derived: 'legacy' | 'new' | null;
  notes: string;
}

export interface Fixture {
  slug: string;
  request: google.maps.places.AutocompletionRequest;
  legacy: { predictions: google.maps.places.AutocompletePrediction[]; status: LegacyStatusString };
  new: { suggestions: SuggestionJson[] };
  detailsLegacy: google.maps.places.PlaceResult | null;
  detailsNew: PlaceJson | null;
  geocode: google.maps.GeocoderResult[] | null;
  meta: FixtureMeta;
}

export type Step =
  | { type: 'type'; text: string }
  | { type: 'key'; key: 'ArrowDown' | 'ArrowUp' | 'Enter' | 'Escape' | 'Tab' }
  | { type: 'hover' | 'click'; index: number }
  | { type: 'focus' }
  | { type: 'blur' }
  | { type: 'advance'; ms: number }
  | { type: 'resolve'; index: number }
  | { type: 'reject'; index: number; code?: string }
  | { type: 'call'; name: string; args?: unknown[] }
  | { type: 'rerender'; props: Record<string, unknown> }
  | { type: 'unmount' };

export interface Subject {
  name: string;
  mount(env: {
    google: typeof google;
    props: Record<string, unknown>;
    strict?: boolean;
    control?: FakeControl | LegacyControl;
  }): Mounted | Promise<Mounted>;
}

export interface Mounted {
  act(step: Step): void | Promise<void>;
  snapshot(): unknown;
  loadingSeen(): boolean[];
  callbacks(): { name: string; args: unknown[] }[];
  unmount(): void;
}

export interface TraceEntry {
  step: number;
  label: string;
  settled: unknown;
  loading: boolean[];
  callbacks: { name: string; args: unknown[] }[];
  console: { level: 'error' | 'warn'; args: unknown[] }[];
}

export type Trace = TraceEntry[];

export interface AllowEntry {
  id: string;
  path: string | RegExp;
  reason: string;
}
