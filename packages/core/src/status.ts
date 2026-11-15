export type LegacyStatus = `${google.maps.places.PlacesServiceStatus}`;

const LEGACY_STATUSES: readonly string[] = [
  'INVALID_REQUEST',
  'NOT_FOUND',
  'OK',
  'OVER_QUERY_LIMIT',
  'REQUEST_DENIED',
  'UNKNOWN_ERROR',
  'ZERO_RESULTS',
];

const RPC_CODES: Readonly<Record<string, LegacyStatus>> = {
  INVALID_ARGUMENT: 'INVALID_REQUEST',
  PERMISSION_DENIED: 'REQUEST_DENIED',
  UNAUTHENTICATED: 'REQUEST_DENIED',
  RESOURCE_EXHAUSTED: 'OVER_QUERY_LIMIT',
  NOT_FOUND: 'NOT_FOUND',
};

export function isLegacyStatus(value: unknown): value is LegacyStatus {
  return typeof value === 'string' && LEGACY_STATUSES.indexOf(value) !== -1;
}

export function toLegacyStatus(error: unknown): LegacyStatus {
  if (!(error instanceof Error)) return 'UNKNOWN_ERROR';
  const code: unknown = (error as { code?: unknown }).code;
  if (code === undefined || code === null || code === '') return 'INVALID_REQUEST';
  if (typeof code !== 'string') return 'UNKNOWN_ERROR';
  const mapped = RPC_CODES[code];
  if (typeof mapped === 'string') return mapped;
  if (isLegacyStatus(code)) return code;
  return 'UNKNOWN_ERROR';
}

export function statusForList(list: readonly unknown[]): LegacyStatus {
  return list.length === 0 ? 'ZERO_RESULTS' : 'OK';
}
