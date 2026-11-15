type AutocompleteRequest = google.maps.places.AutocompleteRequest;
type AutocompletionRequest = google.maps.places.AutocompletionRequest;

const ADDRESS_TYPES = ['street_address', 'premise', 'subpremise', 'route'];

const LEGACY_KEYS = [
  'input',
  'componentRestrictions',
  'types',
  'bounds',
  'location',
  'radius',
  'locationBias',
  'locationRestriction',
  'origin',
  'language',
  'sessionToken',
  'offset',
  'region',
];

const NEW_KEYS = [
  'futureOpeningBusinessesIncluded',
  'pureServiceAreaBusinessesIncluded',
  'internalUsageAttributionIds',
  'includedPrimaryTypes',
  'includedRegionCodes',
  'inputOffset',
] as const;

function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function regionCodes(country: unknown): string[] | undefined {
  if (typeof country === 'string') return country === '' ? undefined : [country];
  if (Array.isArray(country) && country.length > 0) return country.slice();
  return undefined;
}

export function toRegionCode(region: string): string {
  const code = region.toLowerCase();
  return code === 'uk' ? 'gb' : code;
}

export function toAutocompleteRequest(
  legacy: AutocompletionRequest,
  opts?: { strictBounds?: boolean },
): { request: AutocompleteRequest; dropped: string[] } {
  const source = legacy as unknown as Record<string, unknown>;
  const request = {} as AutocompleteRequest;
  const dropped: string[] = [];
  const drop = (key: string) => {
    if (present(source[key]) && dropped.indexOf(key) === -1) dropped.push(key);
  };

  for (const key of Object.keys(source)) {
    if (LEGACY_KEYS.indexOf(key) === -1 && (NEW_KEYS as readonly string[]).indexOf(key) === -1) {
      drop(key);
    }
  }

  if (present(legacy.input)) request.input = legacy.input;

  for (const key of NEW_KEYS) {
    if (present(source[key])) (request as unknown as Record<string, unknown>)[key] = source[key];
  }

  const codes = regionCodes(legacy.componentRestrictions?.country);
  if (codes) {
    if (request.includedRegionCodes) drop('componentRestrictions');
    else request.includedRegionCodes = codes;
  }

  if (present(legacy.types)) {
    const types: unknown = legacy.types;
    if (!Array.isArray(types) || request.includedPrimaryTypes) drop('types');
    else if (types.length === 1 && types[0] === 'address') {
      request.includedPrimaryTypes = ADDRESS_TYPES.slice();
    } else if (types.length > 0) request.includedPrimaryTypes = types.slice();
  }

  if (present(legacy.offset)) {
    const length = typeof legacy.input === 'string' ? legacy.input.length : 0;
    const offset = finiteNumber(legacy.offset);
    const valid =
      offset !== undefined && Number.isInteger(offset) && offset >= 0 && offset < length;
    if (!valid || request.inputOffset !== undefined) drop('offset');
    else request.inputOffset = offset;
  }

  if (present(legacy.origin)) request.origin = legacy.origin as google.maps.LatLngLiteral;
  if (present(legacy.language)) request.language = legacy.language as string;
  if (present(legacy.sessionToken)) {
    request.sessionToken = legacy.sessionToken as google.maps.places.AutocompleteSessionToken;
  }
  if (present(legacy.region)) {
    if (typeof legacy.region !== 'string') drop('region');
    else request.region = toRegionCode(legacy.region);
  }

  const radius = finiteNumber(legacy.radius);
  const circle = present(legacy.location) && radius !== undefined;
  if (!circle) {
    drop('location');
    drop('radius');
  }
  const strict = opts?.strictBounds === true && present(legacy.bounds);
  if (present(legacy.locationRestriction) || strict) {
    if (present(legacy.locationRestriction)) {
      request.locationRestriction = legacy.locationRestriction as google.maps.LatLngBoundsLiteral;
      drop('bounds');
    } else request.locationRestriction = legacy.bounds as google.maps.LatLngBoundsLiteral;
    for (const key of ['locationBias', 'location', 'radius']) drop(key);
  } else if (present(legacy.locationBias)) {
    request.locationBias = legacy.locationBias as google.maps.places.LocationBias;
    for (const key of ['bounds', 'location', 'radius']) drop(key);
  } else if (present(legacy.bounds)) {
    request.locationBias = legacy.bounds as google.maps.LatLngBoundsLiteral;
    for (const key of ['location', 'radius']) drop(key);
  } else if (circle) {
    request.locationBias = { center: legacy.location as google.maps.LatLng, radius: radius };
  }

  return { request, dropped: dropped.sort() };
}
