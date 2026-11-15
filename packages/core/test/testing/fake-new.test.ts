import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeLatLng, FakeLatLngBounds } from '../../src/testing/fake-latlng';
import { createFakeGoogle, fakeMapsError } from '../../src/testing/fake-new';
import type { PlaceJson, SuggestionJson } from '../../src/testing/types';

type Request = google.maps.places.AutocompleteRequest;

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

async function stateOf(promise: Promise<unknown>): Promise<string> {
  let state = 'pending';
  promise.then(
    () => {
      state = 'resolved';
    },
    () => {
      state = 'rejected';
    },
  );
  await flushMicrotasks();
  return state;
}

const paris: SuggestionJson = {
  placePrediction: {
    placeId: 'ChIJD7fiBh9u5kcRYJSMaMOCCwQ',
    text: { text: 'Paris, France', matches: [{ endOffset: 5 }] },
    structuredFormat: {
      mainText: { text: 'Paris', matches: [{ startOffset: 0, endOffset: 5 }] },
      secondaryText: { text: 'France' },
    },
    types: ['locality', 'political'],
    distanceMeters: 1200,
  },
};

const bare: SuggestionJson = {
  placePrediction: { placeId: 'bare', text: { text: 'Bare' } },
};

const placeJson: PlaceJson = {
  id: 'p1',
  displayName: 'Amoeba Music',
  formattedAddress: '6400 Sunset Blvd, Los Angeles, CA 90028, USA',
  location: { lat: 34.0979, lng: -118.3287 },
  viewport: { south: 34.09, west: -118.33, north: 34.1, east: -118.32 },
  types: ['store'],
  rating: null,
  plusCode: { globalCode: '8553323J+5G', compoundCode: '323J+5G Los Angeles' },
  addressComponents: [{ longText: 'Los Angeles', shortText: 'LA', types: ['locality'] }],
  photos: [
    {
      heightPx: 300,
      widthPx: 400,
      authorAttributions: [{ displayName: 'Ann', uri: 'https://a.test/ann' }],
    },
  ],
  reviews: [
    {
      authorAttribution: { displayName: 'Bob', photoURI: 'https://a.test/bob.png' },
      rating: 5,
      text: 'Great',
      publishTime: '2024-01-02T03:04:05Z',
    },
    {},
  ],
  attributions: [{ provider: 'Provider' }],
  regularOpeningHours: {
    periods: [
      { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 30 } },
      { open: { day: 0, hour: 0, minute: 0 } },
    ],
    weekdayDescriptions: ['Monday: 9:00 AM – 5:30 PM'],
  },
};

function places(fake: ReturnType<typeof createFakeGoogle>) {
  return fake.google.maps.places;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('fakeMapsError', () => {
  it('builds a MapsRequestError for client-side codes, with code and endpoint', () => {
    const error = fakeMapsError('PERMISSION_DENIED') as Error & Record<string, unknown>;
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('MapsRequestError');
    expect(error.code).toBe('PERMISSION_DENIED');
    expect(error.endpoint).toBe('PLACES_AUTOCOMPLETE');
    expect(error.message).toBe('Error in fetching AutocompleteSuggestions: PERMISSION_DENIED');
    for (const code of [
      'INVALID_ARGUMENT',
      'UNAUTHENTICATED',
      'NOT_FOUND',
      'RESOURCE_EXHAUSTED',
      'FAILED_PRECONDITION',
      'OUT_OF_RANGE',
    ]) {
      expect(fakeMapsError(code).name).toBe('MapsRequestError');
    }
  });

  it('builds a MapsServerError for any other code', () => {
    for (const code of ['UNKNOWN', 'INTERNAL', 'UNAVAILABLE', 'DEADLINE_EXCEEDED']) {
      expect(fakeMapsError(code).name).toBe('MapsServerError');
    }
  });

  it('uses the endpoint in the message', () => {
    expect(fakeMapsError('NOT_FOUND', 'PLACES_GET_PLACE').message).toBe(
      'Error fetching fields: NOT_FOUND',
    );
    expect(fakeMapsError('INTERNAL', 'OTHER')).toMatchObject({
      message: 'OTHER: INTERNAL',
      endpoint: 'OTHER',
    });
  });
});

describe('createFakeGoogle: loading', () => {
  it('has the new classes by default and importLibrary resolves the same object', async () => {
    const fake = createFakeGoogle();
    const loaded = await fake.google.maps.importLibrary('places');
    expect(places(fake).AutocompleteSuggestion).toBeTypeOf('function');
    expect(places(fake).Place).toBeTypeOf('function');
    expect(loaded).toBe(places(fake));
    expect(fake.control.calls).toEqual([{ seq: 1, kind: 'importLibrary', request: 'places' }]);
  });

  it("sets google.maps.places only once importLibrary('places') resolves with viaImportLibrary", async () => {
    const fake = createFakeGoogle({ places: 'viaImportLibrary' });
    expect(fake.google.maps.places).toBeUndefined();
    const loaded = (await fake.google.maps.importLibrary('places')) as google.maps.PlacesLibrary;
    expect(loaded.AutocompleteSuggestion).toBeTypeOf('function');
    expect(fake.google.maps.places).toBe(loaded);
  });

  it('exposes a legacy-shaped places object with legacyOnly', async () => {
    const fake = createFakeGoogle({ places: 'legacyOnly' });
    const legacy = places(fake) as unknown as Record<string, unknown>;
    expect(legacy.AutocompleteSuggestion).toBeUndefined();
    expect(legacy.AutocompleteService).toBeTypeOf('function');
    expect(await fake.google.maps.importLibrary('places')).toBe(legacy);
    const { AutocompleteService, AutocompleteSessionToken } = places(fake);
    expect(() => new AutocompleteService()).toThrow(
      'google.maps.places.AutocompleteService is not provided by the new-API fake.',
    );
    new AutocompleteSessionToken();
    expect(fake.control.sessions.has('token-1')).toBe(true);
  });

  it("has no google.maps.places with absent, and importLibrary('places') rejects", async () => {
    const fake = createFakeGoogle({ places: 'absent' });
    expect(fake.google.maps.places).toBeUndefined();
    await expect(fake.google.maps.importLibrary('places')).rejects.toThrow(Error);
    expect(fake.google.maps.places).toBeUndefined();
  });

  it('removes google.maps.importLibrary with importLibrary: false', () => {
    const fake = createFakeGoogle({ importLibrary: false });
    expect(fake.google.maps.importLibrary).toBeUndefined();
  });

  it('resolves core and geocoding and rejects unknown libraries', async () => {
    const fake = createFakeGoogle();
    const core = (await fake.google.maps.importLibrary('core')) as google.maps.CoreLibrary;
    expect(core.LatLng).toBe(FakeLatLng);
    expect(core.LatLngBounds).toBe(FakeLatLngBounds);
    const geocoding = (await fake.google.maps.importLibrary(
      'geocoding',
    )) as google.maps.GeocodingLibrary;
    expect(geocoding.Geocoder).toBe(fake.google.maps.Geocoder);
    expect(geocoding.GeocoderStatus.ZERO_RESULTS).toBe('ZERO_RESULTS');
    await expect(fake.google.maps.importLibrary('nope')).rejects.toThrow(
      'The library nope is unknown.',
    );
    expect(fake.control.calls.map((call) => call.request)).toEqual(['core', 'geocoding', 'nope']);
  });

  it('defines google.maps.api only with mapsApiFlag', () => {
    const maps = (opts?: { mapsApiFlag: boolean }) =>
      createFakeGoogle(opts).google.maps as unknown as Record<string, unknown>;
    expect(maps().api).toBeUndefined();
    expect(maps({ mapsApiFlag: true }).api).toBeTruthy();
  });

  it('exposes the statuses, LatLng and LatLngBounds', () => {
    const fake = createFakeGoogle();
    expect(places(fake).PlacesServiceStatus.ZERO_RESULTS).toBe('ZERO_RESULTS');
    expect(fake.google.maps.GeocoderStatus.OK).toBe('OK');
    expect(new fake.google.maps.LatLng(1, 2).lat()).toBe(1);
    expect(
      new fake.google.maps.LatLngBounds({ south: 0, west: 0, north: 1, east: 1 }),
    ).toBeTruthy();
  });
});

describe('createFakeGoogle: install', () => {
  it('sets globalThis.google, the same as window.google, and removes it on uninstall', () => {
    const fake = createFakeGoogle();
    const uninstall = fake.install();
    expect(globalThis.google).toBe(fake.google);
    expect((window as unknown as { google: unknown }).google).toBe(fake.google);
    uninstall();
    expect('google' in globalThis).toBe(false);
  });

  it('restores the google that was there before', () => {
    const first = createFakeGoogle();
    const second = createFakeGoogle();
    const uninstallFirst = first.install();
    const uninstallSecond = second.install();
    expect(globalThis.google).toBe(second.google);
    uninstallSecond();
    expect(globalThis.google).toBe(first.google);
    uninstallFirst();
    expect('google' in globalThis).toBe(false);
  });
});

describe('fetchAutocompleteSuggestions: validation', () => {
  const cases: [string, Request, string][] = [
    ['unknown property', { input: 'a', bounds: {} } as Request, 'unknown property bounds'],
    [
      'negative inputOffset',
      { input: 'abc', inputOffset: -1 },
      "'inputOffset' should be less than 'input.length' and greater than or equal to 0.",
    ],
    [
      'inputOffset equal to input.length',
      { input: 'abc', inputOffset: 3 },
      "'inputOffset' should be less than 'input.length' and greater than or equal to 0.",
    ],
    [
      'bias and restriction',
      {
        input: 'a',
        locationBias: { lat: 1, lng: 2 },
        locationRestriction: { south: 0, west: 0, north: 1, east: 1 },
      },
      "Setting both 'locationBias' and 'locationRestriction' is not supported in autocomplete.",
    ],
  ];

  for (const [name, request, message] of cases) {
    it(`rejects on ${name} by default, with an Error without code`, async () => {
      const fake = createFakeGoogle();
      let promise: Promise<unknown> | undefined;
      expect(() => {
        promise = places(fake).AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
      }).not.toThrow();
      const error = await promise?.catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(message);
      expect(error).not.toHaveProperty('code');
      expect(fake.control.calls).toEqual([]);
    });

    it(`throws synchronously on ${name} with validation: 'throw'`, () => {
      const fake = createFakeGoogle({ validation: 'throw' });
      let thrown: unknown;
      try {
        places(fake).AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe(message);
      expect(thrown).not.toHaveProperty('code');
    });
  }

  it('accepts every key of AutocompleteRequest', async () => {
    const fake = createFakeGoogle({ validation: 'throw' });
    const { AutocompleteSuggestion, AutocompleteSessionToken } = places(fake);
    const common = {
      futureOpeningBusinessesIncluded: true,
      includedPrimaryTypes: ['locality'],
      includedRegionCodes: ['fr'],
      input: 'Paris',
      inputOffset: 4,
      internalUsageAttributionIds: ['x'],
      language: 'fr',
      origin: { lat: 1, lng: 2 },
      pureServiceAreaBusinessesIncluded: false,
      region: 'fr',
      sessionToken: new AutocompleteSessionToken(),
    } satisfies Request;
    await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      ...common,
      locationBias: { lat: 1, lng: 2 },
    });
    await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      ...common,
      locationRestriction: { south: 0, west: 0, north: 1, east: 1 },
      locationBias: null as unknown as google.maps.places.LocationBias,
      inputOffset: 0,
    });
    expect(fake.control.calls.filter((call) => call.kind === 'suggest')).toHaveLength(2);
  });
});

describe('fetchAutocompleteSuggestions: replies', () => {
  it('resolves { suggestions: [] } without a handler', async () => {
    const fake = createFakeGoogle();
    await expect(
      places(fake).AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: 'x' }),
    ).resolves.toEqual({ suggestions: [] });
  });

  it('uses the first matching handler with times left', async () => {
    const fake = createFakeGoogle();
    fake.control.onSuggest('Paris', [paris], { times: 1 });
    fake.control.onSuggest(/^par/i, [bare]);
    fake.control.onSuggest((request) => request.language === 'fr', []);
    const fetch = (request: Request) =>
      places(fake)
        .AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
        .then(({ suggestions }) => suggestions.map((s) => s.placePrediction?.placeId));
    expect(await fetch({ input: 'Paris' })).toEqual([paris.placePrediction?.placeId]);
    expect(await fetch({ input: 'Paris' })).toEqual(['bare']);
    expect(await fetch({ input: 'Lyon', language: 'fr' })).toEqual([]);
  });

  it('rejects with an Error reply', async () => {
    const fake = createFakeGoogle();
    const error = fakeMapsError('RESOURCE_EXHAUSTED');
    fake.control.onSuggest('x', error);
    await expect(
      places(fake).AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: 'x' }),
    ).rejects.toBe(error);
  });

  it('wraps predictions in classes with getters', async () => {
    const fake = createFakeGoogle();
    fake.control.onSuggest('Paris', [paris, { placePrediction: null }, {}]);
    const { suggestions } = await places(fake).AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: 'Paris',
    });
    expect(suggestions[0]).toBeInstanceOf(places(fake).AutocompleteSuggestion);
    const prediction = suggestions[0]?.placePrediction;
    expect(prediction).toBeInstanceOf(places(fake).PlacePrediction);
    expect(prediction?.placeId).toBe('ChIJD7fiBh9u5kcRYJSMaMOCCwQ');
    expect(prediction?.text.text).toBe('Paris, France');
    expect(String(prediction?.text)).toBe('Paris, France');
    expect(prediction?.mainText?.text).toBe('Paris');
    expect(prediction?.mainText?.matches[0]?.startOffset).toBe(0);
    expect(prediction?.secondaryText?.text).toBe('France');
    expect(prediction?.secondaryText?.matches).toEqual([]);
    expect(prediction?.types).toEqual(['locality', 'political']);
    expect(prediction?.distanceMeters).toBe(1200);
    expect(suggestions[1]?.placePrediction).toBeNull();
    expect(suggestions[2]?.placePrediction).toBeNull();
  });

  it('leaves startOffset undefined when the JSON omits it', async () => {
    const fake = createFakeGoogle();
    fake.control.onSuggest('Paris', [paris]);
    const { suggestions } = await places(fake).AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: 'Paris',
    });
    const range = suggestions[0]?.placePrediction?.text.matches[0];
    expect(range?.startOffset).toBeUndefined();
    expect(range?.endOffset).toBe(5);
  });

  it('returns null from mainText, secondaryText and distanceMeters when missing', async () => {
    const fake = createFakeGoogle();
    fake.control.onSuggest('Bare', [bare]);
    const { suggestions } = await places(fake).AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: 'Bare',
    });
    const prediction = suggestions[0]?.placePrediction;
    expect(prediction?.mainText).toBeNull();
    expect(prediction?.secondaryText).toBeNull();
    expect(prediction?.distanceMeters).toBeNull();
    expect(prediction?.types).toEqual([]);
    expect(prediction?.text.matches).toEqual([]);
    await expect(
      prediction?.fetchAddressValidation(
        {} as google.maps.addressValidation.AddressValidationRequest,
      ),
    ).rejects.toThrow('fetchAddressValidation is not supported by the fake.');
  });
});

describe('delivery', () => {
  const fetch = (fake: ReturnType<typeof createFakeGoogle>, input: string) =>
    places(fake).AutocompleteSuggestion.fetchAutocompleteSuggestions({ input });

  it('resolves in a microtask without delayMs, even under fake timers', async () => {
    vi.useFakeTimers();
    const fake = createFakeGoogle();
    fake.control.onSuggest('a', [paris]);
    expect(await stateOf(fetch(fake, 'a'))).toBe('resolved');
  });

  it('waits for setTimeout(delayMs)', async () => {
    vi.useFakeTimers();
    const fake = createFakeGoogle();
    fake.control.onSuggest('a', [paris], { delayMs: 200 });
    const promise = fetch(fake, 'a');
    expect(await stateOf(promise)).toBe('pending');
    vi.advanceTimersByTime(199);
    expect(await stateOf(promise)).toBe('pending');
    vi.advanceTimersByTime(1);
    expect(await stateOf(promise)).toBe('resolved');
  });

  it('settles deferred replies from control.pending in any order', async () => {
    const fake = createFakeGoogle();
    fake.control.onSuggest(() => true, [paris], { deferred: true });
    const first = fetch(fake, 'a');
    const second = fetch(fake, 'b');
    expect(fake.control.pending.map(({ seq, kind }) => ({ seq, kind }))).toEqual([
      { seq: 1, kind: 'suggest' },
      { seq: 2, kind: 'suggest' },
    ]);
    fake.control.pending[1]?.resolve();
    expect(await stateOf(second)).toBe('resolved');
    expect(await stateOf(first)).toBe('pending');
    fake.control.pending[0]?.resolve();
    expect(await stateOf(first)).toBe('resolved');
  });

  it("rejects with fakeMapsError('UNKNOWN') on reject() without an error", async () => {
    const fake = createFakeGoogle();
    fake.control.onSuggest(() => true, [paris], { deferred: true });
    const first = fetch(fake, 'a');
    const second = fetch(fake, 'b');
    const error = fakeMapsError('UNAVAILABLE');
    fake.control.pending[0]?.reject();
    fake.control.pending[1]?.reject(error);
    await expect(first).rejects.toMatchObject({
      name: 'MapsServerError',
      code: 'UNKNOWN',
      endpoint: 'PLACES_AUTOCOMPLETE',
    });
    await expect(second).rejects.toBe(error);
  });
});

describe('sessions and calls', () => {
  it('records each kind synchronously with an increasing seq', () => {
    const fake = createFakeGoogle();
    const { AutocompleteSessionToken, AutocompleteSuggestion, Place } = places(fake);
    void fake.google.maps.importLibrary('places');
    const token = new AutocompleteSessionToken();
    void AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: 'a', sessionToken: token });
    void new Place({ id: 'p1' }).fetchFields({ fields: ['displayName'] }).catch(() => {});
    void new fake.google.maps.Geocoder().geocode({ address: 'x' }, () => {});
    expect(fake.control.calls).toEqual([
      { seq: 1, kind: 'importLibrary', request: 'places' },
      { seq: 2, kind: 'newToken', request: undefined, tokenId: 'token-1' },
      { seq: 3, kind: 'suggest', request: { input: 'a', sessionToken: token }, tokenId: 'token-1' },
      { seq: 4, kind: 'fetchFields', request: { placeId: 'p1', fields: ['displayName'] } },
      { seq: 5, kind: 'geocode', request: { address: 'x' } },
    ]);
  });

  it('opens one session per token and counts suggest calls', async () => {
    const fake = createFakeGoogle();
    const { AutocompleteSessionToken, AutocompleteSuggestion } = places(fake);
    const first = new AutocompleteSessionToken();
    const second = new AutocompleteSessionToken();
    await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: 'a', sessionToken: first });
    await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: 'ab', sessionToken: first });
    await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: 'x' });
    expect([...fake.control.sessions]).toEqual([
      ['token-1', { suggest: 2, fetchFields: 0, closed: false }],
      ['token-2', { suggest: 0, fetchFields: 0, closed: false }],
    ]);
    expect(second).toBeInstanceOf(AutocompleteSessionToken);
  });

  it('carries the token through toPlace() and closes the session on fetchFields', async () => {
    const fake = createFakeGoogle();
    const { AutocompleteSessionToken, AutocompleteSuggestion } = places(fake);
    fake.control.onSuggest('Paris', [paris]);
    fake.control.onFetchFields(paris.placePrediction?.placeId as string, placeJson);
    const sessionToken = new AutocompleteSessionToken();
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: 'Paris',
      sessionToken,
    });
    const place = suggestions[0]?.placePrediction?.toPlace() as google.maps.places.Place;
    expect(place).toBeInstanceOf(places(fake).Place);
    expect(place.id).toBe(paris.placePrediction?.placeId);
    await place.fetchFields({ fields: ['displayName'] });
    await place.fetchFields({ fields: ['formattedAddress'] });
    const kinds = fake.control.calls.map(({ kind, tokenId }) => ({ kind, tokenId }));
    expect(kinds).toEqual([
      { kind: 'newToken', tokenId: 'token-1' },
      { kind: 'suggest', tokenId: 'token-1' },
      { kind: 'toPlace', tokenId: 'token-1' },
      { kind: 'fetchFields', tokenId: 'token-1' },
      { kind: 'fetchFields', tokenId: undefined },
    ]);
    expect(fake.control.calls[2]?.request).toEqual({ placeId: paris.placePrediction?.placeId });
    expect(fake.control.calls[4]).not.toHaveProperty('tokenId');
    expect(fake.control.sessions.get('token-1')).toEqual({
      suggest: 1,
      fetchFields: 1,
      closed: true,
    });
  });

  it('keeps the token and the session open when fetchFields fails', async () => {
    const fake = createFakeGoogle();
    const { AutocompleteSessionToken, AutocompleteSuggestion } = places(fake);
    fake.control.onSuggest('Paris', [paris]);
    const placeId = paris.placePrediction?.placeId as string;
    fake.control.onFetchFields(placeId, fakeMapsError('UNAVAILABLE', 'PLACES_GET_PLACE'), {
      times: 1,
    });
    fake.control.onFetchFields(placeId, placeJson);
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: 'Paris',
      sessionToken: new AutocompleteSessionToken(),
    });
    const place = suggestions[0]?.placePrediction?.toPlace() as google.maps.places.Place;
    await expect(place.fetchFields({ fields: ['displayName'] })).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect(fake.control.sessions.get('token-1')?.closed).toBe(false);
    await place.fetchFields({ fields: ['displayName'] });
    const fetches = fake.control.calls.filter((call) => call.kind === 'fetchFields');
    expect(fetches.map((call) => call.tokenId)).toEqual(['token-1', 'token-1']);
    expect(fake.control.sessions.get('token-1')).toEqual({
      suggest: 1,
      fetchFields: 2,
      closed: true,
    });
  });

  it('records toPlace without tokenId when the request had no token', async () => {
    const fake = createFakeGoogle();
    fake.control.onSuggest('Paris', [paris]);
    const { suggestions } = await places(fake).AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: 'Paris',
    });
    suggestions[0]?.placePrediction?.toPlace();
    expect(fake.control.calls[fake.control.calls.length - 1]).toEqual({
      seq: 2,
      kind: 'toPlace',
      request: { placeId: paris.placePrediction?.placeId },
    });
  });

  it('reset() clears handlers, calls, pending and sessions', async () => {
    const fake = createFakeGoogle();
    const { AutocompleteSessionToken, AutocompleteSuggestion } = places(fake);
    fake.control.onSuggest('a', [paris], { deferred: true });
    new AutocompleteSessionToken();
    void AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: 'a' });
    const { calls, pending, sessions } = fake.control;
    fake.control.reset();
    expect([calls.length, pending.length, sessions.size]).toEqual([0, 0, 0]);
    expect(fake.control.calls).toBe(calls);
    await expect(
      AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: 'a' }),
    ).resolves.toEqual({ suggestions: [] });
    new AutocompleteSessionToken();
    expect(fake.control.calls.map(({ seq, tokenId }) => [seq, tokenId])).toEqual([
      [1, undefined],
      [2, 'token-1'],
    ]);
  });

  it('does not count a token made before reset() on the session of a new token', async () => {
    const fake = createFakeGoogle();
    const { AutocompleteSessionToken, AutocompleteSuggestion } = places(fake);
    fake.control.onSuggest('Paris', [paris]);
    fake.control.onFetchFields(paris.placePrediction?.placeId as string, placeJson);
    const old = new AutocompleteSessionToken();
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: 'Paris',
      sessionToken: old,
    });
    const place = suggestions[0]?.placePrediction?.toPlace() as google.maps.places.Place;
    fake.control.reset();
    fake.control.onSuggest('a', []);
    fake.control.onFetchFields(paris.placePrediction?.placeId as string, placeJson);
    new AutocompleteSessionToken();
    await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: 'a', sessionToken: old });
    await place.fetchFields({ fields: ['displayName'] });
    expect(fake.control.calls.map(({ kind, tokenId }) => [kind, tokenId])).toEqual([
      ['newToken', 'token-1'],
      ['suggest', undefined],
      ['fetchFields', undefined],
    ]);
    expect([...fake.control.sessions]).toEqual([
      ['token-1', { suggest: 0, fetchFields: 0, closed: false }],
    ]);
  });
});

describe('Place', () => {
  it('throws without id and resourceName', () => {
    const { Place } = places(createFakeGoogle());
    expect(() => new Place({})).toThrow("Place requires an 'id' or a 'resourceName'.");
  });

  it('takes the id from resourceName and keeps the requested language and region', () => {
    const { Place } = places(createFakeGoogle());
    const place = new Place({
      resourceName: 'places/abc',
      requestedLanguage: 'fr',
      requestedRegion: 'be',
    });
    expect(place.id).toBe('abc');
    expect(place.resourceName).toBe('places/abc');
    expect(place.requestedLanguage).toBe('fr');
    expect(place.requestedRegion).toBe('be');
    const plain = new Place({ id: 'xyz' });
    expect(plain.resourceName).toBe('places/xyz');
    expect('requestedLanguage' in plain).toBe(false);
  });

  it('rejects unknown fields with the names, or throws with validation: throw', async () => {
    const message = 'Unknown fields requested: foo, place_id';
    const rejecting = new (places(createFakeGoogle()).Place)({ id: 'p1' });
    let promise: Promise<unknown> | undefined;
    expect(() => {
      promise = rejecting.fetchFields({ fields: ['displayName', 'foo', 'place_id'] });
    }).not.toThrow();
    await expect(promise).rejects.toThrow(message);
    const throwing = new (places(createFakeGoogle({ validation: 'throw' })).Place)({ id: 'p1' });
    expect(() => throwing.fetchFields({ fields: ['foo', 'place_id'] })).toThrow(message);
  });

  it('points openingHours to regularOpeningHours in both validation modes', async () => {
    const fake = createFakeGoogle();
    const place = new (places(fake).Place)({ id: 'p1' });
    await expect(place.fetchFields({ fields: ['openingHours'] })).rejects.toThrow(
      /regularOpeningHours/,
    );
    const throwing = new (places(createFakeGoogle({ validation: 'throw' })).Place)({ id: 'p1' });
    expect(() => throwing.fetchFields({ fields: ['openingHours'] })).toThrow(/regularOpeningHours/);
    expect(fake.control.calls).toEqual([]);
  });

  it('fills only the requested fields: null when missing, undefined when not requested', async () => {
    const fake = createFakeGoogle();
    fake.control.onFetchFields('p1', placeJson);
    const place = new (places(fake).Place)({ id: 'p1' });
    const result = await place.fetchFields({
      fields: ['displayName', 'rating', 'websiteURI', 'primaryType'],
    });
    expect(result.place).toBe(place);
    expect(place.displayName).toBe('Amoeba Music');
    expect(place.rating).toBeNull();
    expect(place.websiteURI).toBeNull();
    expect(place.primaryType).toBeNull();
    expect(place.formattedAddress).toBeUndefined();
    expect(place.hasWiFi).toBeUndefined();
    expect(place.id).toBe('p1');
  });

  it('skips fields already loaded and resolves without a call when nothing is left', async () => {
    const fake = createFakeGoogle();
    fake.control.onFetchFields('p1', placeJson);
    const place = new (places(fake).Place)({ id: 'p1' });
    await place.fetchFields({ fields: ['displayName'] });
    await place.fetchFields({ fields: ['displayName', 'types', 'types', 'id'] });
    expect(await place.fetchFields({ fields: ['displayName', 'id', 'resourceName'] })).toEqual({
      place,
    });
    expect(fake.control.calls.map((call) => call.request)).toEqual([
      { placeId: 'p1', fields: ['displayName'] },
      { placeId: 'p1', fields: ['types'] },
    ]);
  });

  it("expands '*' to every known field", async () => {
    const fake = createFakeGoogle();
    fake.control.onFetchFields('p1', placeJson);
    const place = new (places(fake).Place)({ id: 'p1' });
    await place.fetchFields({ fields: ['*'] });
    const request = fake.control.calls[0]?.request as { fields: string[] } | undefined;
    const fields = request?.fields ?? [];
    expect(fields).toContain('regularOpeningHours');
    expect(fields).not.toContain('id');
    expect(place.displayName).toBe('Amoeba Music');
    expect(place.servesBeer).toBeNull();
  });

  it('wraps location, viewport, photos, reviews and the other objects', async () => {
    const fake = createFakeGoogle();
    fake.control.onFetchFields('p1', placeJson);
    const place = new (places(fake).Place)({ id: 'p1' });
    await place.fetchFields({
      fields: [
        'location',
        'viewport',
        'photos',
        'reviews',
        'attributions',
        'addressComponents',
        'plusCode',
        'regularOpeningHours',
        'types',
      ],
    });
    expect(place.location?.lat()).toBe(34.0979);
    expect(place.location?.lng()).toBe(-118.3287);
    expect(place.viewport?.getNorthEast().lat()).toBe(34.1);
    expect(place.viewport?.getSouthWest().lng()).toBe(-118.33);
    const photo = place.photos?.[0];
    expect([photo?.heightPx, photo?.widthPx]).toEqual([300, 400]);
    expect(photo?.authorAttributions[0]?.displayName).toBe('Ann');
    expect(photo?.authorAttributions[0]?.uri).toBe('https://a.test/ann');
    expect(photo?.authorAttributions[0]?.photoURI).toBeNull();
    expect(photo?.getURI({ maxWidth: 400, maxHeight: 300 })).toBe(
      'https://photos.places.test/p1/0?maxWidth=400&maxHeight=300',
    );
    expect(photo?.getURI()).toBe('https://photos.places.test/p1/0');
    expect(photo?.toJSON()).toEqual({
      heightPx: 300,
      widthPx: 400,
      authorAttributions: [{ displayName: 'Ann', uri: 'https://a.test/ann', photoURI: null }],
    });
    const [review, empty] = place.reviews ?? [];
    expect(review?.publishTime).toBeInstanceOf(Date);
    expect(review?.publishTime?.toISOString()).toBe('2024-01-02T03:04:05.000Z');
    expect(review?.authorAttribution?.displayName).toBe('Bob');
    expect(review?.authorAttribution?.photoURI).toBe('https://a.test/bob.png');
    expect([review?.rating, review?.text, review?.textLanguageCode]).toEqual([5, 'Great', null]);
    expect(review?.relativePublishTimeDescription).toBeNull();
    expect(review?.toJSON()).toMatchObject({ publishTime: '2024-01-02T03:04:05.000Z' });
    expect([empty?.authorAttribution, empty?.publishTime, empty?.rating]).toEqual([
      null,
      null,
      null,
    ]);
    expect(empty?.toJSON()).toMatchObject({ publishTime: null });
    expect(place.attributions?.[0]?.provider).toBe('Provider');
    expect(place.attributions?.[0]?.providerURI).toBeNull();
    expect(place.attributions?.[0]?.toJSON()).toEqual({ provider: 'Provider', providerURI: null });
    const component = place.addressComponents?.[0];
    expect([component?.longText, component?.shortText, component?.types]).toEqual([
      'Los Angeles',
      'LA',
      ['locality'],
    ]);
    expect(component?.toJSON()).toEqual({
      longText: 'Los Angeles',
      shortText: 'LA',
      types: ['locality'],
    });
    expect(place.plusCode?.globalCode).toBe('8553323J+5G');
    expect(place.plusCode?.toJSON()).toEqual({
      globalCode: '8553323J+5G',
      compoundCode: '323J+5G Los Angeles',
    });
    const hours = place.regularOpeningHours;
    expect(hours?.periods[0]?.open.hour).toBe(9);
    expect(hours?.periods[0]?.close?.minute).toBe(30);
    expect(hours?.periods[1]?.close).toBeNull();
    expect(hours?.weekdayDescriptions).toEqual(['Monday: 9:00 AM – 5:30 PM']);
    expect(hours?.specialDays).toEqual([]);
    expect(hours?.toJSON()).toEqual({
      periods: [
        { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 30 } },
        { open: { day: 0, hour: 0, minute: 0 }, close: null },
      ],
      weekdayDescriptions: ['Monday: 9:00 AM – 5:30 PM'],
    });
    expect(place.types).toEqual(['store']);
    expect(place.types).not.toBe(placeJson.types);
    expect(JSON.parse(JSON.stringify(place))).toMatchObject({
      id: 'p1',
      location: { lat: 34.0979, lng: -118.3287 },
    });
  });

  it('reads the explicit getters of the core fields', async () => {
    const fake = createFakeGoogle();
    const full: PlaceJson = {
      id: 'p2',
      adrFormatAddress: 'adr',
      businessStatus: 'OPERATIONAL',
      utcOffsetMinutes: 60,
      iconBackgroundColor: '#fff',
      svgIconMaskURI: 'https://icons.test/x.svg',
      priceLevel: 'MODERATE',
      userRatingCount: 10,
      websiteURI: 'https://site.test',
      internationalPhoneNumber: '+33 1',
      nationalPhoneNumber: '01',
      googleMapsURI: 'https://maps.test/p2',
      shortFormattedAddress: 'Short',
    };
    fake.control.onFetchFields('p2', full);
    const place = new (places(fake).Place)({ id: 'p2' });
    const fields = Object.keys(full).filter((field) => field !== 'id');
    await place.fetchFields({ fields });
    const read = place as unknown as Record<string, unknown>;
    for (const field of fields) expect(read[field]).toBe(full[field as keyof PlaceJson]);
  });

  it('rejects NOT_FOUND without a handler and passes an Error reply through', async () => {
    const fake = createFakeGoogle();
    const error = fakeMapsError('PERMISSION_DENIED', 'PLACES_GET_PLACE');
    fake.control.onFetchFields('denied', error);
    const { Place } = places(fake);
    await expect(
      new Place({ id: 'nope' }).fetchFields({ fields: ['id', 'types'] }),
    ).rejects.toMatchObject({
      name: 'MapsRequestError',
      code: 'NOT_FOUND',
      endpoint: 'PLACES_GET_PLACE',
    });
    await expect(new Place({ id: 'denied' }).fetchFields({ fields: ['types'] })).rejects.toBe(
      error,
    );
  });

  it('delivers fetchFields per its handler options', async () => {
    vi.useFakeTimers();
    const fake = createFakeGoogle();
    fake.control.onFetchFields('slow', placeJson, { delayMs: 50 });
    fake.control.onFetchFields('later', placeJson, { deferred: true });
    const { Place } = places(fake);
    const slow = new Place({ id: 'slow' }).fetchFields({ fields: ['types'] });
    const later = new Place({ id: 'later' }).fetchFields({ fields: ['types'] });
    expect(await stateOf(slow)).toBe('pending');
    vi.advanceTimersByTime(50);
    expect(await stateOf(slow)).toBe('resolved');
    expect(fake.control.pending.map(({ kind, seq }) => [kind, seq])).toEqual([['fetchFields', 2]]);
    fake.control.pending[0]?.reject();
    await expect(later).rejects.toMatchObject({ code: 'UNKNOWN', endpoint: 'PLACES_GET_PLACE' });
  });
});

describe('Geocoder', () => {
  it('wraps location and viewport literals and calls back with OK', async () => {
    const fake = createFakeGoogle();
    fake.control.onGeocode('Paris', [
      {
        place_id: 'x',
        geometry: {
          location: { lat: 1, lng: 2 },
          viewport: { south: 0, west: 0, north: 1, east: 3 },
        },
      } as unknown as google.maps.GeocoderResult,
    ]);
    const callback = vi.fn();
    const { results } = await new fake.google.maps.Geocoder().geocode(
      { address: 'Paris' },
      callback,
    );
    expect(results[0]?.geometry.location.lng()).toBe(2);
    expect(results[0]?.geometry.viewport.getNorthEast().lng()).toBe(3);
    expect(callback).toHaveBeenCalledWith(results, 'OK');
  });

  it('gives ZERO_RESULTS without a handler and leaves no unhandled rejection with a callback', async () => {
    const fake = createFakeGoogle();
    const callback = vi.fn();
    new fake.google.maps.Geocoder().geocode({ address: 'nowhere' }, callback);
    await flushMicrotasks();
    expect(callback).toHaveBeenCalledWith([], 'ZERO_RESULTS');
  });
});
