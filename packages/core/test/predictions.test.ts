import { describe, expect, it, vi } from 'vitest';
import { fetchPredictions } from '../src/predictions';
import { createSession } from '../src/session';
import { createFakeGoogle, fakeMapsError } from '../src/testing/fake-new';
import type { SuggestionJson } from '../src/testing/types';

type Lib = google.maps.PlacesLibrary;
type AutocompletionRequest = google.maps.places.AutocompletionRequest;

function setup(opts?: Parameters<typeof createFakeGoogle>[0]) {
  const fake = createFakeGoogle(opts);
  const places = fake.google.maps.places as unknown as Lib;
  return { ...fake, places };
}

function suggestRequests(control: ReturnType<typeof setup>['control']): unknown[] {
  return control.calls.filter((call) => call.kind === 'suggest').map((call) => call.request);
}

const paris: SuggestionJson = {
  placePrediction: {
    placeId: 'paris',
    text: { text: 'Paris, France', matches: [{ endOffset: 5 }] },
    structuredFormat: {
      mainText: { text: 'Paris', matches: [{ endOffset: 5 }] },
      secondaryText: { text: 'France' },
    },
    types: ['locality', 'political'],
    distanceMeters: 1200,
  },
};

const parisLegacy: google.maps.places.AutocompletePrediction = {
  description: 'Paris, France',
  distance_meters: 1200,
  matched_substrings: [{ length: 5, offset: 0 }],
  place_id: 'paris',
  structured_formatting: {
    main_text: 'Paris',
    main_text_matched_substrings: [{ length: 5, offset: 0 }],
    secondary_text: 'France',
  },
  terms: [
    { offset: 0, value: 'Paris' },
    { offset: 7, value: 'France' },
  ],
  types: ['locality', 'political'],
};

const texas: SuggestionJson = {
  placePrediction: { placeId: 'texas', text: { text: 'Paris, TX, USA' } },
};

describe('fetchPredictions: success', () => {
  it('converts every suggestion and reports OK', async () => {
    const { places, control } = setup();
    control.onSuggest('Paris', [paris, texas]);
    const { status, predictions } = await fetchPredictions(places, { input: 'Paris' });
    expect(status).toBe('OK');
    expect(predictions).toEqual([parisLegacy, expect.objectContaining({ place_id: 'texas' })]);
  });

  it('an empty list is ZERO_RESULTS with no predictions', async () => {
    const { places } = setup();
    expect(await fetchPredictions(places, { input: 'nothing' })).toEqual({
      status: 'ZERO_RESULTS',
      predictions: [],
    });
  });

  it('drops suggestions whose placePrediction is null', async () => {
    const { places, control } = setup();
    control.onSuggest('Paris', [{ placePrediction: null }, paris, {}]);
    const { status, predictions } = await fetchPredictions(places, { input: 'Paris' });
    expect(status).toBe('OK');
    expect(predictions.map((p) => p.place_id)).toEqual(['paris']);
  });

  it('only null placePredictions is ZERO_RESULTS', async () => {
    const { places, control } = setup();
    control.onSuggest('Paris', [{ placePrediction: null }]);
    expect(await fetchPredictions(places, { input: 'Paris' })).toEqual({
      status: 'ZERO_RESULTS',
      predictions: [],
    });
  });

  it("secondaryText null gives secondary_text '' (CORE-05)", async () => {
    const { places, control } = setup();
    control.onSuggest('Euro', [
      { placePrediction: { placeId: 'e', text: { text: 'Europe' }, structuredFormat: {} } },
    ]);
    const { predictions } = await fetchPredictions(places, { input: 'Euro' });
    expect(predictions[0]?.structured_formatting).toEqual({
      main_text: 'Europe',
      main_text_matched_substrings: [],
      secondary_text: '',
    });
  });

  it('empty text.matches fall back to the mainText matches (CORE-08)', async () => {
    const { places, control } = setup();
    control.onSuggest('Piz', [
      {
        placePrediction: {
          placeId: 'p',
          text: { text: 'Pizza Place, Rome', matches: [] },
          structuredFormat: {
            mainText: { text: 'Pizza Place', matches: [{ endOffset: 3 }] },
            secondaryText: { text: 'Rome' },
          },
        },
      },
    ]);
    const { predictions } = await fetchPredictions(places, { input: 'Piz' });
    expect(predictions[0]?.matched_substrings).toEqual([{ length: 3, offset: 0 }]);
  });
});

describe('fetchPredictions: request', () => {
  it('forwards the sessionToken of the legacy request', async () => {
    const { places, control } = setup();
    const token = new places.AutocompleteSessionToken();
    await fetchPredictions(places, { input: 'Paris', sessionToken: token });
    expect(control.calls.find((call) => call.kind === 'suggest')?.tokenId).toBe('token-1');
    expect(control.sessions.get('token-1')?.suggest).toBe(1);
  });

  it('sends no token when the request has none', async () => {
    const { places, control } = setup();
    await fetchPredictions(places, { input: 'Paris' }, { session: createSession(places) });
    expect(control.calls.map((call) => call.kind)).toEqual(['suggest']);
  });

  it('drops an offset equal to input.length and still succeeds', async () => {
    const { places, control } = setup();
    control.onSuggest('Paris', [paris]);
    const { status } = await fetchPredictions(places, { input: 'Paris', offset: 5 });
    expect(status).toBe('OK');
    expect(suggestRequests(control)).toEqual([{ input: 'Paris' }]);
  });

  it('sends an offset inside the input as inputOffset', async () => {
    const { places, control } = setup();
    await fetchPredictions(places, { input: 'Paris', offset: 4 });
    expect(suggestRequests(control)).toEqual([{ input: 'Paris', inputOffset: 4 }]);
  });

  it('with a bias and a restriction together only the restriction is sent', async () => {
    const { places, control } = setup();
    const restriction = { south: 1, west: 2, north: 3, east: 4 };
    const legacy = {
      input: 'Paris',
      locationBias: { center: { lat: 1, lng: 2 }, radius: 10 },
      locationRestriction: restriction,
    } as AutocompletionRequest;
    const { status } = await fetchPredictions(places, legacy);
    expect(status).toBe('ZERO_RESULTS');
    expect(suggestRequests(control)).toEqual([
      { input: 'Paris', locationRestriction: restriction },
    ]);
  });

  it('strictBounds sends bounds as locationRestriction', async () => {
    const { places, control } = setup();
    const bounds = { south: 1, west: 2, north: 3, east: 4 };
    await fetchPredictions(places, { input: 'Paris', bounds }, { strictBounds: true });
    expect(suggestRequests(control)).toEqual([{ input: 'Paris', locationRestriction: bounds }]);
  });

  it('without strictBounds bounds is a locationBias', async () => {
    const { places, control } = setup();
    const bounds = { south: 1, west: 2, north: 3, east: 4 };
    await fetchPredictions(places, { input: 'Paris', bounds }, { strictBounds: false });
    expect(suggestRequests(control)).toEqual([{ input: 'Paris', locationBias: bounds }]);
  });

  it('removes unknown keys before the client validator sees them', async () => {
    const { places, control } = setup();
    control.onSuggest('Paris', [paris]);
    const legacy = { input: 'Paris', mystery: true } as AutocompletionRequest;
    expect((await fetchPredictions(places, legacy)).status).toBe('OK');
    expect(suggestRequests(control)).toEqual([{ input: 'Paris' }]);
  });
});

describe('fetchPredictions: session registry', () => {
  it('remembers each prediction with the language and region of the request', async () => {
    const { places, control } = setup();
    const session = createSession(places);
    const remember = vi.spyOn(session, 'remember');
    control.onSuggest('Paris', [paris, texas]);
    await fetchPredictions(places, { input: 'Paris', language: 'fr', region: 'UK' }, { session });
    expect(remember).toHaveBeenCalledTimes(2);
    expect(remember.mock.calls.map(([p, ctx]) => [p.placeId, ctx])).toEqual([
      ['paris', { language: 'fr', region: 'gb' }],
      ['texas', { language: 'fr', region: 'gb' }],
    ]);
  });

  it('remembers with an empty context when the request has no language or region', async () => {
    const { places, control } = setup();
    const session = createSession(places);
    const remember = vi.spyOn(session, 'remember');
    control.onSuggest('Paris', [paris]);
    await fetchPredictions(places, { input: 'Paris' }, { session });
    expect(remember.mock.calls[0]?.[1]).toEqual({});
  });

  it('a remembered prediction is fetched through toPlace()', async () => {
    const { places, control } = setup();
    const session = createSession(places);
    control.onSuggest('Paris', [paris]);
    await fetchPredictions(places, { input: 'Paris' }, { session });
    session.placeFor({ placeId: 'paris' });
    expect(control.calls.filter((call) => call.kind === 'toPlace')).toHaveLength(1);
  });

  it('nothing is remembered when the request fails', async () => {
    const { places, control } = setup();
    const session = createSession(places);
    const remember = vi.spyOn(session, 'remember');
    control.onSuggest('Paris', fakeMapsError('INTERNAL'));
    await fetchPredictions(places, { input: 'Paris' }, { session });
    expect(remember).not.toHaveBeenCalled();
  });
});

describe('fetchPredictions: malformed suggestions', () => {
  function stubPlaces(suggestions: unknown): Lib {
    const reply = () => Promise.resolve({ suggestions });
    return { AutocompleteSuggestion: { fetchAutocompleteSuggestions: reply } } as unknown as Lib;
  }

  it('a prediction that cannot be converted is UNKNOWN_ERROR and nothing is remembered', async () => {
    const toPlace = vi.fn();
    const good = { placePrediction: { placeId: 'good', text: { text: 'Good' }, toPlace } };
    const odd = { placePrediction: { placeId: 'odd', text: null, toPlace } };
    const places = stubPlaces([good, odd]);
    const session = createSession(places);
    const remember = vi.spyOn(session, 'remember');
    expect(await fetchPredictions(places, { input: 'x' }, { session })).toEqual({
      status: 'UNKNOWN_ERROR',
      predictions: [],
    });
    expect(remember).not.toHaveBeenCalled();
    (places as { Place: unknown }).Place = vi.fn();
    session.placeFor({ placeId: 'good' });
    session.placeFor({ placeId: 'odd' });
    expect(toPlace).not.toHaveBeenCalled();
  });

  it('a reply whose suggestions are not a list is UNKNOWN_ERROR', async () => {
    expect(await fetchPredictions(stubPlaces(null), { input: 'x' })).toEqual({
      status: 'UNKNOWN_ERROR',
      predictions: [],
    });
  });
});

describe('fetchPredictions: statuses', () => {
  it.each([
    ['INVALID_ARGUMENT', 'INVALID_REQUEST'],
    ['PERMISSION_DENIED', 'REQUEST_DENIED'],
    ['UNAUTHENTICATED', 'REQUEST_DENIED'],
    ['RESOURCE_EXHAUSTED', 'OVER_QUERY_LIMIT'],
    ['NOT_FOUND', 'NOT_FOUND'],
    ['OVER_QUERY_LIMIT', 'OVER_QUERY_LIMIT'],
    ['REQUEST_DENIED', 'REQUEST_DENIED'],
    ['INVALID_REQUEST', 'INVALID_REQUEST'],
    ['UNKNOWN_ERROR', 'UNKNOWN_ERROR'],
    ['UNAVAILABLE', 'UNKNOWN_ERROR'],
    ['INTERNAL', 'UNKNOWN_ERROR'],
    ['DEADLINE_EXCEEDED', 'UNKNOWN_ERROR'],
    ['UNKNOWN', 'UNKNOWN_ERROR'],
  ])('code %s gives %s with no predictions', async (code, status) => {
    const { places, control } = setup();
    control.onSuggest('Paris', fakeMapsError(code));
    expect(await fetchPredictions(places, { input: 'Paris' })).toEqual({
      status,
      predictions: [],
    });
  });

  it('a deferred reply that is rejected maps its code', async () => {
    const { places, control } = setup();
    control.onSuggest('Paris', [paris], { deferred: true });
    const pending = fetchPredictions(places, { input: 'Paris' });
    await Promise.resolve();
    control.pending[0]?.reject(fakeMapsError('RESOURCE_EXHAUSTED'));
    expect((await pending).status).toBe('OVER_QUERY_LIMIT');
  });

  it('a rejection that is not an Error is UNKNOWN_ERROR', async () => {
    const { places } = setup();
    vi.spyOn(places.AutocompleteSuggestion, 'fetchAutocompleteSuggestions').mockReturnValue(
      Promise.reject('boom'),
    );
    expect(await fetchPredictions(places, { input: 'Paris' })).toEqual({
      status: 'UNKNOWN_ERROR',
      predictions: [],
    });
  });

  it.each(['reject', 'throw'] as const)(
    'client validation in %s mode gives INVALID_REQUEST without rejecting',
    async (validation) => {
      const { places, control } = setup({ validation });
      const legacy = { input: 'ab', inputOffset: 5 } as AutocompletionRequest;
      const result = fetchPredictions(places, legacy);
      await expect(result).resolves.toEqual({ status: 'INVALID_REQUEST', predictions: [] });
      expect(suggestRequests(control)).toEqual([]);
    },
  );

  it('a synchronous throw of fetchAutocompleteSuggestions does not escape', async () => {
    const { places } = setup();
    vi.spyOn(places.AutocompleteSuggestion, 'fetchAutocompleteSuggestions').mockImplementation(
      () => {
        throw fakeMapsError('PERMISSION_DENIED');
      },
    );
    expect(await fetchPredictions(places, { input: 'Paris' })).toEqual({
      status: 'REQUEST_DENIED',
      predictions: [],
    });
  });

  it('a missing request resolves INVALID_REQUEST', async () => {
    const { places } = setup();
    const result = fetchPredictions(places, undefined as unknown as AutocompletionRequest);
    await expect(result).resolves.toEqual({ status: 'INVALID_REQUEST', predictions: [] });
  });

  it('a places object without AutocompleteSuggestion does not reject', async () => {
    const result = fetchPredictions({} as Lib, { input: 'Paris' });
    await expect(result).resolves.toEqual({ status: 'INVALID_REQUEST', predictions: [] });
  });
});
