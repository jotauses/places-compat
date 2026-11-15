import { describe, expect, it } from 'vitest';
import { isLegacyStatus, statusForList, toLegacyStatus } from '../src/status';

class MapsRequestError extends Error {
  code: string;
  endpoint = 'PLACES_AUTOCOMPLETE';
  constructor(code: string) {
    super(`request failed: ${code}`);
    this.name = 'MapsRequestError';
    this.code = code;
  }
}

class MapsServerError extends MapsRequestError {
  constructor(code: string) {
    super(code);
    this.name = 'MapsServerError';
  }
}

const withCode = (code: unknown) => Object.assign(new Error('x'), { code });

const ALL_STATUSES = [
  'INVALID_REQUEST',
  'NOT_FOUND',
  'OK',
  'OVER_QUERY_LIMIT',
  'REQUEST_DENIED',
  'UNKNOWN_ERROR',
  'ZERO_RESULTS',
] as const;

describe('statusForList', () => {
  it('an empty list is ZERO_RESULTS', () => {
    expect(statusForList([])).toBe('ZERO_RESULTS');
  });

  it('a non-empty list is OK', () => {
    expect(statusForList([1])).toBe('OK');
  });
});

describe('toLegacyStatus', () => {
  it('INVALID_ARGUMENT maps to INVALID_REQUEST', () => {
    expect(toLegacyStatus(new MapsRequestError('INVALID_ARGUMENT'))).toBe('INVALID_REQUEST');
  });

  it('an Error without a code (client validation) is INVALID_REQUEST', () => {
    expect(toLegacyStatus(new Error('unknown property foo'))).toBe('INVALID_REQUEST');
    expect(toLegacyStatus(new TypeError('in property input: not a string'))).toBe(
      'INVALID_REQUEST',
    );
    expect(toLegacyStatus(withCode(null))).toBe('INVALID_REQUEST');
    expect(toLegacyStatus(withCode(''))).toBe('INVALID_REQUEST');
  });

  it('PERMISSION_DENIED and UNAUTHENTICATED map to REQUEST_DENIED', () => {
    expect(toLegacyStatus(new MapsRequestError('PERMISSION_DENIED'))).toBe('REQUEST_DENIED');
    expect(toLegacyStatus(new MapsRequestError('UNAUTHENTICATED'))).toBe('REQUEST_DENIED');
  });

  it('RESOURCE_EXHAUSTED maps to OVER_QUERY_LIMIT', () => {
    expect(toLegacyStatus(new MapsRequestError('RESOURCE_EXHAUSTED'))).toBe('OVER_QUERY_LIMIT');
  });

  it('NOT_FOUND maps to NOT_FOUND', () => {
    expect(toLegacyStatus(new MapsRequestError('NOT_FOUND'))).toBe('NOT_FOUND');
  });

  it.each(ALL_STATUSES)('a code that is already a PlacesServiceStatus: %s maps to itself', (s) => {
    expect(toLegacyStatus(withCode(s))).toBe(s);
  });

  it.each(['UNAVAILABLE', 'INTERNAL', 'DEADLINE_EXCEEDED', 'UNKNOWN'])(
    'server code %s is UNKNOWN_ERROR',
    (code) => {
      expect(toLegacyStatus(new MapsServerError(code))).toBe('UNKNOWN_ERROR');
    },
  );

  it('values that are not Error are UNKNOWN_ERROR', () => {
    expect(toLegacyStatus(undefined)).toBe('UNKNOWN_ERROR');
    expect(toLegacyStatus(null)).toBe('UNKNOWN_ERROR');
    expect(toLegacyStatus('NOT_FOUND')).toBe('UNKNOWN_ERROR');
    expect(toLegacyStatus({ code: 'NOT_FOUND' })).toBe('UNKNOWN_ERROR');
    expect(toLegacyStatus(42)).toBe('UNKNOWN_ERROR');
  });

  it('odd codes are UNKNOWN_ERROR', () => {
    expect(toLegacyStatus(withCode(404))).toBe('UNKNOWN_ERROR');
    expect(toLegacyStatus(withCode('toString'))).toBe('UNKNOWN_ERROR');
    expect(toLegacyStatus(withCode('not_found'))).toBe('UNKNOWN_ERROR');
  });
});

describe('isLegacyStatus', () => {
  it('accepts every PlacesServiceStatus and nothing else', () => {
    for (const s of ALL_STATUSES) expect(isLegacyStatus(s)).toBe(true);
    expect(isLegacyStatus('INVALID_ARGUMENT')).toBe(false);
    expect(isLegacyStatus(undefined)).toBe(false);
  });
});
