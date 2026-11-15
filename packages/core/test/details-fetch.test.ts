import { describe, expect, it, vi } from 'vitest';
import { fetchDetails } from '../src/details';
import { ALL_PLACE_FIELDS } from '../src/fields';
import { createSession } from '../src/session';
import { createFakeGoogle, fakeMapsError } from '../src/testing/fake-new';
import type { PlaceJson } from '../src/testing/types';

type Lib = google.maps.PlacesLibrary;
type PlaceDetailsRequest = google.maps.places.PlaceDetailsRequest;

function setup(opts?: Parameters<typeof createFakeGoogle>[0]) {
  const fake = createFakeGoogle(opts);
  const places = fake.google.maps.places as unknown as Lib;
  const placeOptions: google.maps.places.PlaceOptions[] = [];
  const Original = places.Place;
  class RecordingPlace extends Original {
    constructor(options: google.maps.places.PlaceOptions) {
      placeOptions.push({ ...options });
      super(options);
    }
  }
  (places as { Place: unknown }).Place = RecordingPlace;
  return { ...fake, places, placeOptions };
}

function fetchCalls(control: ReturnType<typeof setup>['control']) {
  return control.calls.filter((call) => call.kind === 'fetchFields');
}

const cafe: PlaceJson = {
  id: 'cafe',
  displayName: 'Cafe',
  formattedAddress: '1 Main St',
  location: { lat: 1, lng: 2 },
  rating: 4.5,
};

describe('fetchDetails: request', () => {
  it.each([
    ['no placeId', {}],
    ['an empty placeId', { placeId: '' }],
    ['a placeId that is not a string', { placeId: 5 }],
  ])('%s is INVALID_REQUEST without calling Google', async (_label, req) => {
    const { places, control, placeOptions } = setup();
    const result = await fetchDetails(places, req as unknown as PlaceDetailsRequest);
    expect(result).toEqual({ status: 'INVALID_REQUEST', result: null });
    expect(control.calls).toEqual([]);
    expect(placeOptions).toEqual([]);
  });

  it('a missing request is INVALID_REQUEST', async () => {
    const { places } = setup();
    const result = await fetchDetails(places, undefined as unknown as PlaceDetailsRequest);
    expect(result).toEqual({ status: 'INVALID_REQUEST', result: null });
  });

  it('fetches the mapped fields and returns only the requested keys', async () => {
    const { places, control } = setup();
    control.onFetchFields('cafe', cafe);
    const { status, result } = await fetchDetails(places, {
      placeId: 'cafe',
      fields: ['name', 'formatted_address', 'place_id'],
    });
    expect(status).toBe('OK');
    expect(result).toEqual({ formatted_address: '1 Main St', place_id: 'cafe', name: 'Cafe' });
    expect(fetchCalls(control).map((call) => call.request)).toEqual([
      { placeId: 'cafe', fields: ['displayName', 'formattedAddress'] },
    ]);
  });

  it('without fields asks for the full mapped list (CORE-13)', async () => {
    const { places, control } = setup();
    control.onFetchFields('cafe', cafe);
    const { status, result } = await fetchDetails(places, { placeId: 'cafe' });
    expect(status).toBe('OK');
    const requested = (fetchCalls(control)[0]?.request as { fields?: string[] } | undefined)
      ?.fields;
    expect(requested).toEqual(ALL_PLACE_FIELDS.filter((field) => field !== 'id'));
    expect(result).toMatchObject({ name: 'Cafe', place_id: 'cafe', rating: 4.5 });
  });

  it('leaves unsupported names out of the request (CORE-12)', async () => {
    const { places, control } = setup();
    control.onFetchFields('cafe', cafe);
    const { result } = await fetchDetails(places, { placeId: 'cafe', fields: ['icon', 'name'] });
    expect(result).toEqual({ name: 'Cafe' });
    expect(fetchCalls(control).map((call) => call.request)).toEqual([
      { placeId: 'cafe', fields: ['displayName'] },
    ]);
  });

  it('only unsupported names: OK with an empty result and no fetchFields call', async () => {
    const { places, control } = setup();
    const fetchFields = vi.spyOn(places.Place.prototype, 'fetchFields');
    const result = await fetchDetails(places, {
      placeId: 'cafe',
      fields: ['icon', 'permanently_closed'],
    });
    expect(result).toEqual({ status: 'OK', result: {} });
    expect(fetchFields).not.toHaveBeenCalled();
    expect(fetchCalls(control)).toEqual([]);
  });

  it('passes language and region to the Place without a session', async () => {
    const { places, control, placeOptions } = setup();
    control.onFetchFields('cafe', cafe);
    await fetchDetails(places, { placeId: 'cafe', fields: ['name'], language: 'es', region: 'mx' });
    expect(placeOptions).toEqual([{ id: 'cafe', requestedLanguage: 'es', requestedRegion: 'mx' }]);
  });

  it('leaves out an absent or null language and region', async () => {
    const { places, control, placeOptions } = setup();
    control.onFetchFields('cafe', cafe);
    await fetchDetails(places, { placeId: 'cafe', fields: ['name'], language: null });
    expect(placeOptions).toEqual([{ id: 'cafe' }]);
  });

  it('never passes a sessionToken to fetchFields', async () => {
    const { places, control } = setup();
    control.onFetchFields('cafe', cafe);
    const fetchFields = vi.spyOn(places.Place.prototype, 'fetchFields');
    const token = new places.AutocompleteSessionToken();
    await fetchDetails(places, { placeId: 'cafe', fields: ['name'], sessionToken: token });
    expect(fetchFields).toHaveBeenCalledWith({ fields: ['displayName'] });
    expect(fetchCalls(control)[0]).not.toHaveProperty('tokenId');
  });
});

describe('fetchDetails: session', () => {
  it('a place outside the registry goes through session.placeFor', async () => {
    const { places, control, placeOptions } = setup();
    const session = createSession(places);
    const placeFor = vi.spyOn(session, 'placeFor');
    control.onFetchFields('cafe', cafe);
    const { status } = await fetchDetails(
      places,
      { placeId: 'cafe', fields: ['name'], language: 'es', region: null },
      { session },
    );
    expect(status).toBe('OK');
    expect(placeFor).toHaveBeenCalledWith({ placeId: 'cafe', language: 'es' });
    expect(placeOptions).toEqual([{ id: 'cafe', requestedLanguage: 'es' }]);
  });

  it('a remembered place is fetched through toPlace() and closes the session', async () => {
    const { places, control, placeOptions } = setup();
    const session = createSession(places);
    const token = session.newToken();
    control.onSuggest('Ca', [{ placePrediction: { placeId: 'cafe', text: { text: 'Cafe' } } }]);
    const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: 'Ca',
      sessionToken: token,
    });
    session.remember(suggestions[0]?.placePrediction as google.maps.places.PlacePrediction);
    control.onFetchFields('cafe', cafe);
    const { status, result } = await fetchDetails(
      places,
      { placeId: 'cafe', fields: ['name'] },
      { session },
    );
    expect({ status, result }).toEqual({ status: 'OK', result: { name: 'Cafe' } });
    expect(placeOptions).toEqual([]);
    expect(fetchCalls(control)[0]?.tokenId).toBe('token-1');
    expect(control.sessions.get('token-1')?.closed).toBe(true);
  });
});

describe('fetchDetails: errors', () => {
  it('no reply from Google is NOT_FOUND with a null result', async () => {
    const { places } = setup();
    expect(await fetchDetails(places, { placeId: 'missing', fields: ['name'] })).toEqual({
      status: 'NOT_FOUND',
      result: null,
    });
  });

  it.each([
    ['INVALID_ARGUMENT', 'INVALID_REQUEST'],
    ['PERMISSION_DENIED', 'REQUEST_DENIED'],
    ['UNAUTHENTICATED', 'REQUEST_DENIED'],
    ['RESOURCE_EXHAUSTED', 'OVER_QUERY_LIMIT'],
    ['NOT_FOUND', 'NOT_FOUND'],
    ['INTERNAL', 'UNKNOWN_ERROR'],
    ['UNAVAILABLE', 'UNKNOWN_ERROR'],
  ])('code %s gives %s', async (code, status) => {
    const { places, control } = setup();
    control.onFetchFields('cafe', fakeMapsError(code, 'PLACES_GET_PLACE'));
    expect(await fetchDetails(places, { placeId: 'cafe', fields: ['name'] })).toEqual({
      status,
      result: null,
    });
  });

  it('a deferred reply rejected later maps its code', async () => {
    const { places, control } = setup();
    control.onFetchFields('cafe', cafe, { deferred: true });
    const pending = fetchDetails(places, { placeId: 'cafe', fields: ['name'] });
    await Promise.resolve();
    control.pending[0]?.reject(fakeMapsError('PERMISSION_DENIED', 'PLACES_GET_PLACE'));
    expect(await pending).toEqual({ status: 'REQUEST_DENIED', result: null });
  });

  it.each(['reject', 'throw'] as const)(
    'a fetchFields that fails in %s mode does not escape',
    async (validation) => {
      const { places } = setup({ validation });
      vi.spyOn(places.Place.prototype, 'fetchFields').mockImplementation(() => {
        const error = new Error('Unknown fields requested: nope');
        if (validation === 'throw') throw error;
        return Promise.reject(error);
      });
      const result = fetchDetails(places, { placeId: 'cafe', fields: ['name'] });
      await expect(result).resolves.toEqual({ status: 'INVALID_REQUEST', result: null });
    },
  );

  it('a Place constructor that throws does not escape', async () => {
    const places = {
      Place: class {
        constructor() {
          throw new Error("Place requires an 'id' or a 'resourceName'.");
        }
      },
    } as unknown as Lib;
    const result = fetchDetails(places, { placeId: 'cafe' });
    await expect(result).resolves.toEqual({ status: 'INVALID_REQUEST', result: null });
  });

  it('a rejection that is not an Error is UNKNOWN_ERROR', async () => {
    const { places } = setup();
    vi.spyOn(places.Place.prototype, 'fetchFields').mockReturnValue(Promise.reject('boom'));
    expect(await fetchDetails(places, { placeId: 'cafe', fields: ['name'] })).toEqual({
      status: 'UNKNOWN_ERROR',
      result: null,
    });
  });
});
