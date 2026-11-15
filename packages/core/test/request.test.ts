import { describe, expect, it } from 'vitest';
import { toAutocompleteRequest } from '../src/request';

type Legacy = google.maps.places.AutocompletionRequest;

const req = (value: Record<string, unknown>) => value as unknown as Legacy;

const BOUNDS = { north: 41, south: 40, east: -3, west: -4 };
const BIAS = { center: { lat: 1, lng: 2 }, radius: 10 };
const RESTRICTION = { north: 51, south: 50, east: 1, west: 0 };
const LOCATION = { lat: 40.4, lng: -3.7 } as unknown as google.maps.LatLng;

function hasUndefinedValue(value: object): boolean {
  return Object.keys(value).some((k) => (value as Record<string, unknown>)[k] === undefined);
}

describe('toAutocompleteRequest: key by key', () => {
  it('input: passes through', () => {
    expect(toAutocompleteRequest({ input: 'Mad' })).toEqual({
      request: { input: 'Mad' },
      dropped: [],
    });
  });

  it('input: a missing input is left for the validator, with no undefined key', () => {
    const { request } = toAutocompleteRequest(req({ input: undefined }));
    expect(request).toEqual({});
    expect('input' in request).toBe(false);
  });

  it('componentRestrictions.country: a string becomes a one-item array', () => {
    const { request } = toAutocompleteRequest({
      input: 'a',
      componentRestrictions: { country: 'es' },
    });
    expect(request).toEqual({ input: 'a', includedRegionCodes: ['es'] });
  });

  it('componentRestrictions.country: an array is copied', () => {
    const country = ['es', 'fr'];
    const { request } = toAutocompleteRequest({ input: 'a', componentRestrictions: { country } });
    expect(request.includedRegionCodes).toEqual(['es', 'fr']);
    expect(request.includedRegionCodes).not.toBe(country);
  });

  it('componentRestrictions.country: null, empty array, empty string or absent is omitted', () => {
    for (const country of [null, [], '']) {
      const out = toAutocompleteRequest(req({ input: 'a', componentRestrictions: { country } }));
      expect(out).toEqual({ request: { input: 'a' }, dropped: [] });
    }
    expect(toAutocompleteRequest(req({ input: 'a', componentRestrictions: {} }))).toEqual({
      request: { input: 'a' },
      dropped: [],
    });
  });

  it('types: other values pass as a copy', () => {
    const types = ['geocode'];
    const { request } = toAutocompleteRequest({ input: 'a', types });
    expect(request.includedPrimaryTypes).toEqual(['geocode']);
    expect(request.includedPrimaryTypes).not.toBe(types);
    expect(toAutocompleteRequest({ input: 'a', types: ['(cities)'] }).request).toEqual({
      input: 'a',
      includedPrimaryTypes: ['(cities)'],
    });
  });

  it("types: ['address'] is replaced (CORE-03)", () => {
    expect(toAutocompleteRequest({ input: 'a', types: ['address'] }).request).toEqual({
      input: 'a',
      includedPrimaryTypes: ['street_address', 'premise', 'subpremise', 'route'],
    });
  });

  it("types: 'address' mixed with other types is left for the validator", () => {
    expect(
      toAutocompleteRequest({ input: 'a', types: ['address', 'establishment'] }).request,
    ).toEqual({ input: 'a', includedPrimaryTypes: ['address', 'establishment'] });
  });

  it('types: an empty array is omitted', () => {
    expect(toAutocompleteRequest({ input: 'a', types: [] })).toEqual({
      request: { input: 'a' },
      dropped: [],
    });
  });

  it('types: a value that is not an array is dropped', () => {
    expect(toAutocompleteRequest(req({ input: 'a', types: 'geocode' }))).toEqual({
      request: { input: 'a' },
      dropped: ['types'],
    });
  });

  it('bounds: becomes locationBias', () => {
    expect(toAutocompleteRequest({ input: 'a', bounds: BOUNDS })).toEqual({
      request: { input: 'a', locationBias: BOUNDS },
      dropped: [],
    });
  });

  it('bounds: with strictBounds becomes locationRestriction', () => {
    expect(toAutocompleteRequest({ input: 'a', bounds: BOUNDS }, { strictBounds: true })).toEqual({
      request: { input: 'a', locationRestriction: BOUNDS },
      dropped: [],
    });
  });

  it('location + radius: becomes a circle bias, location kept by identity', () => {
    const { request, dropped } = toAutocompleteRequest({
      input: 'a',
      location: LOCATION,
      radius: 500,
    });
    expect(request).toEqual({ input: 'a', locationBias: { center: LOCATION, radius: 500 } });
    expect((request.locationBias as google.maps.CircleLiteral).center).toBe(LOCATION);
    expect(dropped).toEqual([]);
  });

  it('locationBias: passes by identity', () => {
    const { request } = toAutocompleteRequest({ input: 'a', locationBias: BIAS });
    expect(request).toEqual({ input: 'a', locationBias: BIAS });
    expect(request.locationBias).toBe(BIAS);
  });

  it('locationRestriction: passes by identity', () => {
    const { request } = toAutocompleteRequest({ input: 'a', locationRestriction: RESTRICTION });
    expect(request).toEqual({ input: 'a', locationRestriction: RESTRICTION });
    expect(request.locationRestriction).toBe(RESTRICTION);
  });

  it('origin, language, sessionToken: pass through by identity', () => {
    const origin = { lat: 1, lng: 2 };
    const sessionToken = {} as google.maps.places.AutocompleteSessionToken;
    const { request, dropped } = toAutocompleteRequest({
      input: 'a',
      origin,
      language: 'es',
      sessionToken,
    });
    expect(request).toEqual({ input: 'a', origin, language: 'es', sessionToken });
    expect(request.origin).toBe(origin);
    expect(request.sessionToken).toBe(sessionToken);
    expect(dropped).toEqual([]);
  });

  it('language/region: null is omitted without being dropped', () => {
    expect(toAutocompleteRequest({ input: 'a', language: null, region: null })).toEqual({
      request: { input: 'a' },
      dropped: [],
    });
  });

  it('offset: becomes inputOffset when inside the input', () => {
    expect(toAutocompleteRequest({ input: 'abc', offset: 2 }).request).toEqual({
      input: 'abc',
      inputOffset: 2,
    });
    expect(toAutocompleteRequest({ input: 'abc', offset: 0 }).request.inputOffset).toBe(0);
    expect(toAutocompleteRequest(req({ input: 'abc', offset: '1' })).request.inputOffset).toBe(1);
  });

  it('offset: equal to input.length (cursor at the end) is dropped', () => {
    expect(toAutocompleteRequest({ input: 'abc', offset: 3 })).toEqual({
      request: { input: 'abc' },
      dropped: ['offset'],
    });
  });

  it('offset: non-integer, negative, too large, blank or non-numeric is dropped', () => {
    for (const offset of [1.5, -1, 10, '', ' ', 'x', Number.NaN, true]) {
      expect(toAutocompleteRequest(req({ input: 'abc', offset }))).toEqual({
        request: { input: 'abc' },
        dropped: ['offset'],
      });
    }
  });

  it('offset: dropped when input is not a string', () => {
    expect(toAutocompleteRequest(req({ offset: 0 }))).toEqual({ request: {}, dropped: ['offset'] });
  });

  it("region: 'UK' and 'uk' become 'gb' (CORE-16)", () => {
    expect(toAutocompleteRequest({ input: 'a', region: 'UK' }).request.region).toBe('gb');
    expect(toAutocompleteRequest({ input: 'a', region: 'uk' }).request.region).toBe('gb');
  });

  it('region: other regions are lower-cased', () => {
    expect(toAutocompleteRequest({ input: 'a', region: 'ES' }).request.region).toBe('es');
    expect(toAutocompleteRequest({ input: 'a', region: 'fr' }).request.region).toBe('fr');
  });

  it('region: a value that is not a string is dropped', () => {
    expect(toAutocompleteRequest(req({ input: 'a', region: 34 }))).toEqual({
      request: { input: 'a' },
      dropped: ['region'],
    });
  });

  it('new keys: pass through unchanged', () => {
    const ids = ['gmp_x'];
    const legacy = req({
      input: 'abc',
      futureOpeningBusinessesIncluded: true,
      pureServiceAreaBusinessesIncluded: false,
      internalUsageAttributionIds: ids,
      includedPrimaryTypes: ['restaurant'],
      includedRegionCodes: ['es'],
      inputOffset: 1,
    });
    const { request, dropped } = toAutocompleteRequest(legacy);
    expect(request).toEqual({
      input: 'abc',
      futureOpeningBusinessesIncluded: true,
      pureServiceAreaBusinessesIncluded: false,
      internalUsageAttributionIds: ids,
      includedPrimaryTypes: ['restaurant'],
      includedRegionCodes: ['es'],
      inputOffset: 1,
    });
    expect(request.internalUsageAttributionIds).toBe(ids);
    expect(dropped).toEqual([]);
  });

  it('new keys: the new key wins over its legacy twin, which is dropped', () => {
    const { request, dropped } = toAutocompleteRequest(
      req({
        input: 'abc',
        includedPrimaryTypes: ['restaurant'],
        types: ['geocode'],
        includedRegionCodes: ['fr'],
        componentRestrictions: { country: 'es' },
        inputOffset: 1,
        offset: 2,
      }),
    );
    expect(request).toEqual({
      input: 'abc',
      includedPrimaryTypes: ['restaurant'],
      includedRegionCodes: ['fr'],
      inputOffset: 1,
    });
    expect(dropped).toEqual(['componentRestrictions', 'offset', 'types']);
  });

  it('new keys: null new keys are omitted', () => {
    expect(toAutocompleteRequest(req({ input: 'a', internalUsageAttributionIds: null }))).toEqual({
      request: { input: 'a' },
      dropped: [],
    });
  });

  it('unknown keys are removed and listed in sorted order', () => {
    expect(
      toAutocompleteRequest(req({ input: 'a', zeta: 1, alpha: 'x', strictBounds: true })),
    ).toEqual({ request: { input: 'a' }, dropped: ['alpha', 'strictBounds', 'zeta'] });
  });

  it('unknown keys with null or undefined are ignored', () => {
    expect(toAutocompleteRequest(req({ input: 'a', foo: undefined, bar: null }))).toEqual({
      request: { input: 'a' },
      dropped: [],
    });
  });
});

describe('toAutocompleteRequest: location priority', () => {
  it('locationRestriction beats everything and drops every bias key', () => {
    const { request, dropped } = toAutocompleteRequest(
      {
        input: 'a',
        locationRestriction: RESTRICTION,
        bounds: BOUNDS,
        locationBias: BIAS,
        location: LOCATION,
        radius: 5,
      },
      { strictBounds: true },
    );
    expect(request).toEqual({ input: 'a', locationRestriction: RESTRICTION });
    expect(dropped).toEqual(['bounds', 'location', 'locationBias', 'radius']);
  });

  it('bounds with strictBounds beats locationBias and location + radius', () => {
    const { request, dropped } = toAutocompleteRequest(
      { input: 'a', bounds: BOUNDS, locationBias: BIAS, location: LOCATION, radius: 5 },
      { strictBounds: true },
    );
    expect(request).toEqual({ input: 'a', locationRestriction: BOUNDS });
    expect(dropped).toEqual(['location', 'locationBias', 'radius']);
  });

  it('bias and restriction together: the restriction wins', () => {
    expect(
      toAutocompleteRequest({ input: 'a', locationBias: BIAS, locationRestriction: RESTRICTION }),
    ).toEqual({
      request: { input: 'a', locationRestriction: RESTRICTION },
      dropped: ['locationBias'],
    });
  });

  it('locationBias beats bounds and location + radius', () => {
    const { request, dropped } = toAutocompleteRequest({
      input: 'a',
      bounds: BOUNDS,
      locationBias: BIAS,
      location: LOCATION,
      radius: 5,
    });
    expect(request).toEqual({ input: 'a', locationBias: BIAS });
    expect(dropped).toEqual(['bounds', 'location', 'radius']);
  });

  it('bounds beats location + radius', () => {
    const { request, dropped } = toAutocompleteRequest({
      input: 'a',
      bounds: BOUNDS,
      location: LOCATION,
      radius: 5,
    });
    expect(request).toEqual({ input: 'a', locationBias: BOUNDS });
    expect(dropped).toEqual(['location', 'radius']);
  });

  it('strictBounds without bounds has no effect', () => {
    expect(
      toAutocompleteRequest({ input: 'a', locationBias: BIAS }, { strictBounds: true }),
    ).toEqual({ request: { input: 'a', locationBias: BIAS }, dropped: [] });
    expect(toAutocompleteRequest({ input: 'a' }, { strictBounds: true })).toEqual({
      request: { input: 'a' },
      dropped: [],
    });
  });

  it('strictBounds false keeps bounds as a bias', () => {
    expect(
      toAutocompleteRequest({ input: 'a', bounds: BOUNDS }, { strictBounds: false }).request,
    ).toEqual({ input: 'a', locationBias: BOUNDS });
  });

  it('null locationBias and locationRestriction are omitted', () => {
    expect(
      toAutocompleteRequest({ input: 'a', locationBias: null, locationRestriction: null }),
    ).toEqual({ request: { input: 'a' }, dropped: [] });
  });
});

describe('toAutocompleteRequest: location + radius edge cases', () => {
  it('radius given as a numeric string becomes a number', () => {
    const { request, dropped } = toAutocompleteRequest(
      req({ input: 'a', location: LOCATION, radius: '1500' }),
    );
    expect(request.locationBias).toEqual({ center: LOCATION, radius: 1500 });
    expect(dropped).toEqual([]);
  });

  it('radius NaN, Infinity, blank or non-numeric drops both keys', () => {
    for (const radius of [Number.NaN, Number.POSITIVE_INFINITY, '', 'far', {}]) {
      expect(toAutocompleteRequest(req({ input: 'a', location: LOCATION, radius }))).toEqual({
        request: { input: 'a' },
        dropped: ['location', 'radius'],
      });
    }
  });

  it('location without radius is dropped', () => {
    expect(toAutocompleteRequest({ input: 'a', location: LOCATION })).toEqual({
      request: { input: 'a' },
      dropped: ['location'],
    });
  });

  it('radius without location is dropped', () => {
    expect(toAutocompleteRequest({ input: 'a', radius: 10 })).toEqual({
      request: { input: 'a' },
      dropped: ['radius'],
    });
  });

  it('radius 0 is finite and kept', () => {
    expect(toAutocompleteRequest({ input: 'a', location: LOCATION, radius: 0 }).request).toEqual({
      input: 'a',
      locationBias: { center: LOCATION, radius: 0 },
    });
  });
});

describe('toAutocompleteRequest: output shape', () => {
  it('never emits keys whose value is undefined', () => {
    const inputs: Legacy[] = [
      { input: 'a' },
      req({
        input: 'abc',
        bounds: undefined,
        location: undefined,
        radius: undefined,
        offset: undefined,
        types: undefined,
        componentRestrictions: undefined,
        language: undefined,
        region: undefined,
        origin: undefined,
        sessionToken: undefined,
        locationBias: undefined,
        locationRestriction: undefined,
        inputOffset: undefined,
      }),
      { input: 'abc', offset: 5, location: LOCATION, types: [] },
    ];
    for (const legacy of inputs) {
      const { request } = toAutocompleteRequest(legacy);
      expect(hasUndefinedValue(request)).toBe(false);
    }
  });

  it('does not mutate the legacy request', () => {
    const legacy: Legacy = {
      input: 'abc',
      types: ['address'],
      componentRestrictions: { country: ['es'] },
      bounds: BOUNDS,
      region: 'UK',
    };
    const copy = JSON.parse(JSON.stringify(legacy));
    toAutocompleteRequest(legacy, { strictBounds: true });
    expect(legacy).toEqual(copy);
  });

  it('is deterministic', () => {
    const legacy = req({ input: 'a', z: 1, location: LOCATION, a: 2, bounds: BOUNDS });
    expect(toAutocompleteRequest(legacy)).toEqual(toAutocompleteRequest(legacy));
    expect(toAutocompleteRequest(legacy).dropped).toEqual(['a', 'location', 'z']);
  });
});
