import { FakeLatLng, FakeLatLngBounds, toLatLng, toLatLngBounds } from './fake-latlng';
import {
  createGeocoderClass,
  type FakeGoogle,
  GEOCODER_STATUS,
  type GeocodeReply,
  Handlers,
  installGoogle,
  mapsError,
  PLACES_STATUS,
  ReplyEngine,
} from './fake-shared';
import type {
  AuthorAttributionJson,
  FakeControl,
  OpeningPointJson,
  PlaceJson,
  SuggestionJson,
  TextJson,
} from './types';

type FakeCall = FakeControl['calls'][number];
type SuggestRequest = google.maps.places.AutocompleteRequest;
type PredictionJson = NonNullable<SuggestionJson['placePrediction']>;

export function fakeMapsError(code: string, endpoint = 'PLACES_AUTOCOMPLETE'): Error {
  const message =
    endpoint === 'PLACES_AUTOCOMPLETE'
      ? `Error in fetching AutocompleteSuggestions: ${code}`
      : endpoint === 'PLACES_GET_PLACE'
        ? `Error fetching fields: ${code}`
        : `${endpoint}: ${code}`;
  return mapsError(code, endpoint, message);
}

const REQUEST_KEY_SET: Record<keyof SuggestRequest, true> = {
  futureOpeningBusinessesIncluded: true,
  includedPrimaryTypes: true,
  includedRegionCodes: true,
  input: true,
  inputOffset: true,
  internalUsageAttributionIds: true,
  language: true,
  locationBias: true,
  locationRestriction: true,
  origin: true,
  pureServiceAreaBusinessesIncluded: true,
  region: true,
  sessionToken: true,
};
const REQUEST_KEYS = Object.keys(REQUEST_KEY_SET);

function validateRequest(request: SuggestRequest): Error | undefined {
  for (const key of Object.keys(request)) {
    if (!REQUEST_KEYS.includes(key)) return new Error(`unknown property ${key}`);
  }
  const offset = request.inputOffset;
  if (offset !== undefined && (offset < 0 || offset >= String(request.input ?? '').length)) {
    return new Error(
      "'inputOffset' should be less than 'input.length' and greater than or equal to 0.",
    );
  }
  if (request.locationBias != null && request.locationRestriction != null) {
    return new Error(
      "Setting both 'locationBias' and 'locationRestriction' is not supported in autocomplete.",
    );
  }
  return undefined;
}

const KNOWN_FIELDS = [
  'accessibilityOptions',
  'addressComponents',
  'addressDescriptor',
  'adrFormatAddress',
  'allowsDogs',
  'attributions',
  'businessStatus',
  'consumerAlert',
  'containingPlaces',
  'currentOpeningHours',
  'currentSecondaryOpeningHours',
  'displayName',
  'displayNameLanguageCode',
  'editorialSummary',
  'editorialSummaryLanguageCode',
  'evChargeAmenitySummary',
  'evChargeOptions',
  'formattedAddress',
  'fuelOptions',
  'futureOpeningDate',
  'generativeSummary',
  'googleMapsLinks',
  'googleMapsURI',
  'hasCurbsidePickup',
  'hasDelivery',
  'hasDineIn',
  'hasLiveMusic',
  'hasMenuForChildren',
  'hasOutdoorSeating',
  'hasRestroom',
  'hasTakeout',
  'hasWiFi',
  'iconBackgroundColor',
  'id',
  'internationalPhoneNumber',
  'isGoodForChildren',
  'isGoodForGroups',
  'isGoodForWatchingSports',
  'isPureServiceAreaBusiness',
  'isReservable',
  'location',
  'nationalPhoneNumber',
  'neighborhoodSummary',
  'parkingOptions',
  'paymentOptions',
  'photos',
  'plusCode',
  'postalAddress',
  'priceLevel',
  'priceRange',
  'primaryType',
  'primaryTypeDisplayName',
  'primaryTypeDisplayNameLanguageCode',
  'rating',
  'regularOpeningHours',
  'regularSecondaryOpeningHours',
  'resourceName',
  'reviews',
  'reviewSummary',
  'servesBeer',
  'servesBreakfast',
  'servesBrunch',
  'servesCocktails',
  'servesCoffee',
  'servesDessert',
  'servesDinner',
  'servesLunch',
  'servesVegetarianFood',
  'servesWine',
  'shortFormattedAddress',
  'subDestinations',
  'svgIconMaskURI',
  'timeZone',
  'transitStation',
  'types',
  'userRatingCount',
  'utcOffsetMinutes',
  'viewport',
  'websiteURI',
] as const satisfies readonly (keyof google.maps.places.Place)[];

const KNOWN: readonly string[] = KNOWN_FIELDS;

function validateFields(fields: string[]): Error | undefined {
  if (fields.includes('openingHours')) {
    return new Error(
      "Unknown fields requested: openingHours. Use 'regularOpeningHours' instead of 'openingHours'.",
    );
  }
  const unknown = fields.filter((field) => field !== '*' && !KNOWN.includes(field));
  if (unknown.length > 0) return new Error(`Unknown fields requested: ${unknown.join(', ')}`);
  return undefined;
}

export class FakeStringRange {
  constructor(private readonly json: { startOffset?: number; endOffset: number }) {}

  get startOffset(): number {
    return this.json.startOffset as number;
  }

  get endOffset(): number {
    return this.json.endOffset;
  }
}

FakeStringRange.prototype satisfies google.maps.places.StringRange;

export class FakeFormattableText {
  private readonly ranges: FakeStringRange[];

  constructor(private readonly json: TextJson) {
    this.ranges = (json.matches ?? []).map((match) => new FakeStringRange(match));
  }

  get text(): string {
    return this.json.text;
  }

  get matches(): FakeStringRange[] {
    return this.ranges;
  }

  toString(): string {
    return this.json.text;
  }
}

FakeFormattableText.prototype satisfies google.maps.places.FormattableText;

export class FakePlacePrediction {
  private readonly textValue: FakeFormattableText;
  private readonly mainValue: FakeFormattableText | null;
  private readonly secondaryValue: FakeFormattableText | null;

  constructor(
    private readonly json: PredictionJson,
    private readonly makePlace: () => google.maps.places.Place,
  ) {
    this.textValue = new FakeFormattableText(json.text);
    const mainText = json.structuredFormat?.mainText;
    const secondaryText = json.structuredFormat?.secondaryText;
    this.mainValue = mainText ? new FakeFormattableText(mainText) : null;
    this.secondaryValue = secondaryText ? new FakeFormattableText(secondaryText) : null;
  }

  get placeId(): string {
    return this.json.placeId;
  }

  get text(): FakeFormattableText {
    return this.textValue;
  }

  get mainText(): FakeFormattableText | null {
    return this.mainValue;
  }

  get secondaryText(): FakeFormattableText | null {
    return this.secondaryValue;
  }

  get types(): string[] {
    return [...(this.json.types ?? [])];
  }

  get distanceMeters(): number | null {
    return this.json.distanceMeters ?? null;
  }

  toPlace(): google.maps.places.Place {
    return this.makePlace();
  }

  fetchAddressValidation(): Promise<never> {
    return Promise.reject(new Error('fetchAddressValidation is not supported by the fake.'));
  }
}

FakePlacePrediction.prototype satisfies google.maps.places.PlacePrediction;

export class FakeAutocompleteSuggestion {
  constructor(private readonly prediction: FakePlacePrediction | null) {}

  get placePrediction(): FakePlacePrediction | null {
    return this.prediction;
  }
}

FakeAutocompleteSuggestion.prototype satisfies google.maps.places.AutocompleteSuggestion;

class FakeAuthorAttribution implements google.maps.places.AuthorAttribution {
  readonly displayName: string;
  readonly uri: string | null;
  readonly photoURI: string | null;

  constructor(json: AuthorAttributionJson) {
    this.displayName = json.displayName;
    this.uri = json.uri ?? null;
    this.photoURI = json.photoURI ?? null;
  }

  toJSON(): unknown {
    return { displayName: this.displayName, uri: this.uri, photoURI: this.photoURI };
  }
}

type PhotoJson = NonNullable<PlaceJson['photos']>[number];

class FakePhoto implements google.maps.places.Photo {
  readonly heightPx: number;
  readonly widthPx: number;
  readonly authorAttributions: FakeAuthorAttribution[];
  readonly flagContentURI = null;
  readonly googleMapsURI = null;

  constructor(
    json: PhotoJson,
    private readonly placeId: string,
    private readonly index: number,
  ) {
    this.heightPx = json.heightPx;
    this.widthPx = json.widthPx;
    this.authorAttributions = json.authorAttributions.map((a) => new FakeAuthorAttribution(a));
  }

  getURI(options?: google.maps.places.PhotoOptions): string {
    const query: string[] = [];
    if (options?.maxWidth != null) query.push(`maxWidth=${options.maxWidth}`);
    if (options?.maxHeight != null) query.push(`maxHeight=${options.maxHeight}`);
    const base = `https://photos.places.test/${encodeURIComponent(this.placeId)}/${this.index}`;
    return query.length > 0 ? `${base}?${query.join('&')}` : base;
  }

  toJSON(): unknown {
    return {
      heightPx: this.heightPx,
      widthPx: this.widthPx,
      authorAttributions: this.authorAttributions.map((a) => a.toJSON()),
    };
  }
}

type ReviewJson = NonNullable<PlaceJson['reviews']>[number];

class FakeReview implements google.maps.places.Review {
  readonly authorAttribution: FakeAuthorAttribution | null;
  readonly rating: number | null;
  readonly relativePublishTimeDescription: string | null;
  readonly text: string | null;
  readonly textLanguageCode: string | null;
  readonly publishTime: Date | null;
  readonly flagContentURI = null;
  readonly googleMapsURI = null;
  readonly originalText = null;
  readonly originalTextLanguageCode = null;
  readonly visitDateMonth = null;
  readonly visitDateYear = null;

  constructor(json: ReviewJson) {
    this.authorAttribution = json.authorAttribution
      ? new FakeAuthorAttribution(json.authorAttribution)
      : null;
    this.rating = json.rating ?? null;
    this.relativePublishTimeDescription = json.relativePublishTimeDescription ?? null;
    this.text = json.text ?? null;
    this.textLanguageCode = json.textLanguageCode ?? null;
    this.publishTime = json.publishTime ? new Date(json.publishTime) : null;
  }

  toJSON(): unknown {
    return { ...this, publishTime: this.publishTime?.toISOString() ?? null };
  }
}

class FakeAttribution implements google.maps.places.Attribution {
  readonly provider: string;
  readonly providerURI: string | null;

  constructor(json: { provider: string; providerURI?: string | null }) {
    this.provider = json.provider;
    this.providerURI = json.providerURI ?? null;
  }

  toJSON(): unknown {
    return { provider: this.provider, providerURI: this.providerURI };
  }
}

type AddressComponentJson = NonNullable<PlaceJson['addressComponents']>[number];

class FakeAddressComponent implements google.maps.places.AddressComponent {
  readonly longText: string | null;
  readonly shortText: string | null;
  readonly types: string[];

  constructor(json: AddressComponentJson) {
    this.longText = json.longText;
    this.shortText = json.shortText;
    this.types = [...json.types];
  }

  toJSON(): unknown {
    return { longText: this.longText, shortText: this.shortText, types: this.types };
  }
}

class FakePlusCode implements google.maps.places.PlusCode {
  readonly globalCode: string | null;
  readonly compoundCode: string | null;

  constructor(json: NonNullable<PlaceJson['plusCode']>) {
    this.globalCode = json.globalCode;
    this.compoundCode = json.compoundCode;
  }

  toJSON(): unknown {
    return { globalCode: this.globalCode, compoundCode: this.compoundCode };
  }
}

class FakeOpeningHoursPoint implements google.maps.places.OpeningHoursPoint {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;

  constructor(json: OpeningPointJson) {
    this.day = json.day;
    this.hour = json.hour;
    this.minute = json.minute;
  }

  toJSON(): unknown {
    return { day: this.day, hour: this.hour, minute: this.minute };
  }
}

class FakeOpeningHoursPeriod implements google.maps.places.OpeningHoursPeriod {
  readonly open: FakeOpeningHoursPoint;
  readonly close: FakeOpeningHoursPoint | null;

  constructor(json: { open: OpeningPointJson; close?: OpeningPointJson | null }) {
    this.open = new FakeOpeningHoursPoint(json.open);
    this.close = json.close ? new FakeOpeningHoursPoint(json.close) : null;
  }

  toJSON(): unknown {
    return { open: this.open.toJSON(), close: this.close?.toJSON() ?? null };
  }
}

class FakeOpeningHours implements google.maps.places.OpeningHours {
  readonly periods: FakeOpeningHoursPeriod[];
  readonly weekdayDescriptions: string[];
  readonly specialDays: Date[] = [];

  constructor(json: NonNullable<PlaceJson['regularOpeningHours']>) {
    this.periods = json.periods.map((period) => new FakeOpeningHoursPeriod(period));
    this.weekdayDescriptions = [...json.weekdayDescriptions];
  }

  toJSON(): unknown {
    return {
      periods: this.periods.map((period) => period.toJSON()),
      weekdayDescriptions: this.weekdayDescriptions,
    };
  }
}

function toPlaceValue(field: string, value: unknown, placeId: string): unknown {
  if (value === null) return null;
  switch (field) {
    case 'location':
      return toLatLng(value as google.maps.LatLngLiteral);
    case 'viewport':
      return toLatLngBounds(value as google.maps.LatLngBoundsLiteral);
    case 'plusCode':
      return new FakePlusCode(value as NonNullable<PlaceJson['plusCode']>);
    case 'regularOpeningHours':
      return new FakeOpeningHours(value as NonNullable<PlaceJson['regularOpeningHours']>);
    case 'addressComponents':
      return (value as AddressComponentJson[]).map((c) => new FakeAddressComponent(c));
    case 'photos':
      return (value as PhotoJson[]).map((photo, index) => new FakePhoto(photo, placeId, index));
    case 'reviews':
      return (value as ReviewJson[]).map((review) => new FakeReview(review));
    case 'attributions':
      return (value as { provider: string }[]).map((a) => new FakeAttribution(a));
    default:
      return Array.isArray(value) ? [...value] : value;
  }
}

interface PlaceState {
  id: string;
  values: Map<string, unknown>;
  fetch(place: FakePlace, fields: string[]): Promise<{ place: google.maps.places.Place }>;
  validation: 'reject' | 'throw';
}

const placeStates = new WeakMap<object, PlaceState>();

function stateOf(place: object): PlaceState {
  return placeStates.get(place) as PlaceState;
}

function readField<T>(place: object, field: string): T {
  return stateOf(place).values.get(field) as T;
}

type PlaceContext = Pick<PlaceState, 'fetch' | 'validation'>;

export class FakePlace {
  requestedLanguage?: string | null;
  requestedRegion?: string | null;

  constructor(options: google.maps.places.PlaceOptions, context: PlaceContext) {
    const id = options?.id ?? options?.resourceName?.replace(/^places\//, '');
    if (!id) throw new Error("Place requires an 'id' or a 'resourceName'.");
    if (options.requestedLanguage !== undefined) this.requestedLanguage = options.requestedLanguage;
    if (options.requestedRegion !== undefined) this.requestedRegion = options.requestedRegion;
    placeStates.set(this, { ...context, id, values: new Map() });
  }

  get id(): string {
    return stateOf(this).id;
  }

  get resourceName(): string {
    return `places/${stateOf(this).id}`;
  }

  get addressComponents(): google.maps.places.AddressComponent[] | undefined {
    return readField(this, 'addressComponents');
  }

  get adrFormatAddress(): string | null | undefined {
    return readField(this, 'adrFormatAddress');
  }

  get formattedAddress(): string | null | undefined {
    return readField(this, 'formattedAddress');
  }

  get location(): google.maps.LatLng | null | undefined {
    return readField(this, 'location');
  }

  get viewport(): google.maps.LatLngBounds | null | undefined {
    return readField(this, 'viewport');
  }

  get plusCode(): google.maps.places.PlusCode | null | undefined {
    return readField(this, 'plusCode');
  }

  get types(): string[] | undefined {
    return readField(this, 'types');
  }

  get photos(): google.maps.places.Photo[] | undefined {
    return readField(this, 'photos');
  }

  get displayName(): string | null | undefined {
    return readField(this, 'displayName');
  }

  get businessStatus(): google.maps.places.BusinessStatusString | null | undefined {
    return readField(this, 'businessStatus');
  }

  get utcOffsetMinutes(): number | null | undefined {
    return readField(this, 'utcOffsetMinutes');
  }

  get iconBackgroundColor(): string | null | undefined {
    return readField(this, 'iconBackgroundColor');
  }

  get svgIconMaskURI(): string | null | undefined {
    return readField(this, 'svgIconMaskURI');
  }

  get regularOpeningHours(): google.maps.places.OpeningHours | null | undefined {
    return readField(this, 'regularOpeningHours');
  }

  get priceLevel(): google.maps.places.PriceLevelString | null | undefined {
    return readField(this, 'priceLevel');
  }

  get rating(): number | null | undefined {
    return readField(this, 'rating');
  }

  get userRatingCount(): number | null | undefined {
    return readField(this, 'userRatingCount');
  }

  get websiteURI(): string | null | undefined {
    return readField(this, 'websiteURI');
  }

  get internationalPhoneNumber(): string | null | undefined {
    return readField(this, 'internationalPhoneNumber');
  }

  get nationalPhoneNumber(): string | null | undefined {
    return readField(this, 'nationalPhoneNumber');
  }

  get reviews(): google.maps.places.Review[] | undefined {
    return readField(this, 'reviews');
  }

  get googleMapsURI(): string | null | undefined {
    return readField(this, 'googleMapsURI');
  }

  get shortFormattedAddress(): string | null | undefined {
    return readField(this, 'shortFormattedAddress');
  }

  get attributions(): google.maps.places.Attribution[] | undefined {
    return readField(this, 'attributions');
  }

  fetchFields(
    options: google.maps.places.FetchFieldsRequest,
  ): Promise<{ place: google.maps.places.Place }> {
    const state = stateOf(this);
    const fields = [...(options?.fields ?? [])];
    const invalid = validateFields(fields);
    if (invalid) {
      if (state.validation === 'throw') throw invalid;
      return Promise.reject(invalid);
    }
    const wanted = fields.includes('*') ? [...KNOWN_FIELDS] : fields;
    const missing = [...new Set(wanted)].filter(
      (field) => field !== 'id' && field !== 'resourceName' && !state.values.has(field),
    );
    if (missing.length === 0) {
      return Promise.resolve({ place: this as unknown as google.maps.places.Place });
    }
    return state.fetch(this, missing);
  }

  toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = { id: this.id };
    for (const [field, value] of stateOf(this).values) json[field] = value;
    return json;
  }
}

for (const field of KNOWN_FIELDS) {
  if (Object.getOwnPropertyDescriptor(FakePlace.prototype, field)) continue;
  Object.defineProperty(FakePlace.prototype, field, {
    configurable: true,
    get(this: FakePlace) {
      return readField(this, field);
    },
  });
}

FakePlace.prototype satisfies Pick<
  google.maps.places.Place,
  | 'id'
  | 'resourceName'
  | 'requestedLanguage'
  | 'requestedRegion'
  | 'fetchFields'
  | 'addressComponents'
  | 'adrFormatAddress'
  | 'formattedAddress'
  | 'location'
  | 'viewport'
  | 'plusCode'
  | 'types'
  | 'photos'
  | 'displayName'
  | 'businessStatus'
  | 'utcOffsetMinutes'
  | 'iconBackgroundColor'
  | 'svgIconMaskURI'
  | 'regularOpeningHours'
  | 'priceLevel'
  | 'rating'
  | 'userRatingCount'
  | 'websiteURI'
  | 'internationalPhoneNumber'
  | 'nationalPhoneNumber'
  | 'reviews'
  | 'googleMapsURI'
  | 'shortFormattedAddress'
  | 'attributions'
>;

function fillPlace(place: FakePlace, json: PlaceJson, fields: string[]): void {
  const state = stateOf(place);
  const source = json as unknown as Record<string, unknown>;
  for (const field of fields) {
    const value = source[field];
    state.values.set(field, value === undefined ? null : toPlaceValue(field, value, state.id));
  }
}

export interface CreateFakeGoogleOptions {
  places?: 'present' | 'viaImportLibrary' | 'legacyOnly' | 'absent';
  importLibrary?: boolean;
  validation?: 'reject' | 'throw';
  mapsApiFlag?: boolean;
}

function unavailable(name: string): new (...args: unknown[]) => never {
  return class {
    constructor() {
      throw new Error(`google.maps.places.${name} is not provided by the new-API fake.`);
    }
  } as unknown as new (
    ...args: unknown[]
  ) => never;
}

export function createFakeGoogle(opts: CreateFakeGoogleOptions = {}): FakeGoogle<FakeControl> {
  const mode = opts.places ?? 'present';
  const validation = opts.validation ?? 'reject';
  const engine = new ReplyEngine<FakeCall>();
  const suggestHandlers = new Handlers<SuggestRequest, SuggestionJson[] | Error>();
  const fetchHandlers = new Handlers<{ placeId: string }, PlaceJson | Error>();
  const geocodeHandlers = new Handlers<google.maps.GeocoderRequest, GeocodeReply>();
  const sessions: FakeControl['sessions'] = new Map();
  let tokenIds = new WeakMap<object, string>();
  const placeTokens = new WeakMap<object, object>();
  let tokenCount = 0;

  const withToken = (tokenId: string | undefined) => (tokenId === undefined ? {} : { tokenId });
  const tokenIdOf = (token: unknown) =>
    typeof token === 'object' && token !== null ? tokenIds.get(token) : undefined;

  const fetch: PlaceState['fetch'] = (place, fields) => {
    const token = placeTokens.get(place);
    const tokenId = tokenIdOf(token);
    const placeId = place.id;
    const seq = engine.record({
      kind: 'fetchFields',
      request: { placeId, fields },
      ...withToken(tokenId),
    });
    const session = tokenId === undefined ? undefined : sessions.get(tokenId);
    if (session) session.fetchFields += 1;
    const picked = fetchHandlers.take({ placeId }, placeId);
    return new Promise((resolve, reject) => {
      engine.schedule(
        'fetchFields',
        seq,
        picked?.opts ?? {},
        () => {
          const reply = picked?.reply;
          if (reply === undefined) return reject(fakeMapsError('NOT_FOUND', 'PLACES_GET_PLACE'));
          if (reply instanceof Error) return reject(reply);
          fillPlace(place, reply, fields);
          if (token) placeTokens.delete(place);
          if (session) session.closed = true;
          resolve({ place: place as unknown as google.maps.places.Place });
        },
        (error) => reject(error ?? fakeMapsError('UNKNOWN', 'PLACES_GET_PLACE')),
      );
    });
  };

  class Place extends FakePlace {
    constructor(options: google.maps.places.PlaceOptions) {
      super(options, { fetch, validation });
    }
  }

  class AutocompleteSessionToken {
    constructor() {
      tokenCount += 1;
      const tokenId = `token-${tokenCount}`;
      tokenIds.set(this, tokenId);
      sessions.set(tokenId, { suggest: 0, fetchFields: 0, closed: false });
      engine.record({ kind: 'newToken', request: undefined, tokenId });
    }
  }

  AutocompleteSessionToken.prototype satisfies google.maps.places.AutocompleteSessionToken;

  const toPlace = (placeId: string, token: object | undefined): google.maps.places.Place => {
    engine.record({ kind: 'toPlace', request: { placeId }, ...withToken(tokenIdOf(token)) });
    const place = new Place({ id: placeId });
    if (token) placeTokens.set(place, token);
    return place as unknown as google.maps.places.Place;
  };

  const wrap = (json: SuggestionJson, token: object | undefined) => {
    const prediction = json.placePrediction;
    return new AutocompleteSuggestion(
      prediction
        ? new FakePlacePrediction(prediction, () => toPlace(prediction.placeId, token))
        : null,
    );
  };

  class AutocompleteSuggestion extends FakeAutocompleteSuggestion {
    static fetchAutocompleteSuggestions(
      request: SuggestRequest,
    ): Promise<{ suggestions: AutocompleteSuggestion[] }> {
      const invalid = validateRequest(request);
      if (invalid) {
        if (validation === 'throw') throw invalid;
        return Promise.reject(invalid);
      }
      const token = request.sessionToken ?? undefined;
      const tokenId = tokenIdOf(token);
      const seq = engine.record({
        kind: 'suggest',
        request: { ...request },
        ...withToken(tokenId),
      });
      const session = tokenId === undefined ? undefined : sessions.get(tokenId);
      if (session) session.suggest += 1;
      const picked = suggestHandlers.take(request, request.input);
      return new Promise((resolve, reject) => {
        engine.schedule(
          'suggest',
          seq,
          picked?.opts ?? {},
          () => {
            const reply = picked?.reply ?? [];
            if (reply instanceof Error) reject(reply);
            else resolve({ suggestions: reply.map((json) => wrap(json, token)) });
          },
          (error) => reject(error ?? fakeMapsError('UNKNOWN')),
        );
      });
    }
  }

  AutocompleteSuggestion.fetchAutocompleteSuggestions satisfies typeof google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions;

  const Geocoder = createGeocoderClass(engine, geocodeHandlers);
  const core = { LatLng: FakeLatLng, LatLngBounds: FakeLatLngBounds };
  const geocoding = { Geocoder, GeocoderStatus: { ...GEOCODER_STATUS } };
  const places = {
    AutocompleteSuggestion,
    AutocompleteSessionToken,
    Place,
    PlacePrediction: FakePlacePrediction,
    FormattableText: FakeFormattableText,
    StringRange: FakeStringRange,
    PlacesServiceStatus: { ...PLACES_STATUS },
  };
  const legacyPlaces = {
    Autocomplete: unavailable('Autocomplete'),
    AutocompleteService: unavailable('AutocompleteService'),
    PlacesService: unavailable('PlacesService'),
    SearchBox: unavailable('SearchBox'),
    AutocompleteSessionToken,
    PlacesServiceStatus: { ...PLACES_STATUS },
  };

  const maps: Record<string, unknown> = { ...core, ...geocoding };
  if (mode === 'present') maps.places = places;
  if (mode === 'legacyOnly') maps.places = legacyPlaces;
  if (opts.mapsApiFlag) maps.api = {};
  if (opts.importLibrary !== false) {
    maps.importLibrary = (name: string): Promise<unknown> => {
      engine.record({ kind: 'importLibrary', request: name });
      if (name === 'core') return Promise.resolve(core);
      if (name === 'geocoding') return Promise.resolve(geocoding);
      if (name !== 'places') return Promise.reject(new Error(`The library ${name} is unknown.`));
      if (mode === 'absent') {
        return Promise.reject(new Error('The places library could not be loaded.'));
      }
      if (mode === 'legacyOnly') return Promise.resolve(legacyPlaces);
      return Promise.resolve().then(() => {
        maps.places = places;
        return places;
      });
    };
  }

  const google = { maps } as unknown as typeof globalThis.google;

  const control: FakeControl = {
    onSuggest(match, reply, replyOpts) {
      suggestHandlers.add(match, reply, replyOpts);
    },
    onFetchFields(placeId, reply, replyOpts) {
      fetchHandlers.add(placeId, reply, replyOpts);
    },
    onGeocode(match, reply, replyOpts) {
      geocodeHandlers.add(match, reply, replyOpts);
    },
    pending: engine.pending,
    calls: engine.calls,
    sessions,
    reset() {
      suggestHandlers.clear();
      fetchHandlers.clear();
      geocodeHandlers.clear();
      engine.reset();
      sessions.clear();
      tokenIds = new WeakMap();
      tokenCount = 0;
    },
  };

  return { google, control, install: () => installGoogle(google) };
}
