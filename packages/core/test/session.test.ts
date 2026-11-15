import { describe, expect, it, vi } from 'vitest';
import { fetchDetails } from '../src/details';
import { fetchPredictions } from '../src/predictions';
import { createSession, type Session, sharedSession } from '../src/session';
import { createFakeGoogle } from '../src/testing/fake-new';
import type { SuggestionJson } from '../src/testing/types';

type Lib = google.maps.PlacesLibrary;

function setup() {
  const fake = createFakeGoogle();
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

function suggestion(placeId: string): SuggestionJson {
  return { placePrediction: { placeId, text: { text: `${placeId}, Somewhere` } } };
}

async function livePredictions(
  setupResult: ReturnType<typeof setup>,
  ids: string[],
  token?: google.maps.places.AutocompleteSessionToken,
): Promise<google.maps.places.PlacePrediction[]> {
  const { places, control } = setupResult;
  control.onSuggest('q', ids.map(suggestion), { times: 1 });
  const request: google.maps.places.AutocompleteRequest = { input: 'q' };
  if (token) request.sessionToken = token;
  const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
  return suggestions.map((s) => s.placePrediction as google.maps.places.PlacePrediction);
}

function toPlaceCalls(control: ReturnType<typeof setup>['control']) {
  return control.calls.filter((call) => call.kind === 'toPlace');
}

describe('createSession', () => {
  it('newToken builds a new AutocompleteSessionToken each time', () => {
    const env = setup();
    const session = createSession(env.places);
    const first = session.newToken();
    const second = session.newToken();
    expect(first).toBeInstanceOf(env.places.AutocompleteSessionToken);
    expect(second).not.toBe(first);
    expect(env.control.calls.filter((call) => call.kind === 'newToken')).toHaveLength(2);
  });

  it('placeFor an id outside the registry builds a plain Place with no undefined keys', () => {
    const env = setup();
    const place = createSession(env.places).placeFor({ placeId: 'unknown' });
    expect(place).toBeInstanceOf(env.places.Place);
    expect(place.id).toBe('unknown');
    expect(env.placeOptions).toEqual([{ id: 'unknown' }]);
    expect(toPlaceCalls(env.control)).toHaveLength(0);
  });

  it('placeFor an id outside the registry passes language and region to the Place', () => {
    const env = setup();
    const place = createSession(env.places).placeFor({
      placeId: 'unknown',
      language: 'es',
      region: 'mx',
    });
    expect(place.requestedLanguage).toBe('es');
    expect(place.requestedRegion).toBe('mx');
    expect(env.placeOptions).toEqual([
      { id: 'unknown', requestedLanguage: 'es', requestedRegion: 'mx' },
    ]);
  });

  it('placeFor leaves out a null language and region', () => {
    const env = setup();
    createSession(env.places).placeFor({ placeId: 'unknown', language: null, region: null });
    expect(env.placeOptions).toEqual([{ id: 'unknown' }]);
  });

  it('placeFor a remembered id returns prediction.toPlace() with the session token', async () => {
    const env = setup();
    const session = createSession(env.places);
    const token = session.newToken();
    const [prediction] = await livePredictions(env, ['a'], token);
    session.remember(prediction as google.maps.places.PlacePrediction);
    const place = session.placeFor({ placeId: 'a' });
    expect(place.id).toBe('a');
    expect(env.placeOptions).toEqual([]);
    expect(toPlaceCalls(env.control)).toEqual([
      expect.objectContaining({ request: { placeId: 'a' }, tokenId: 'token-1' }),
    ]);
  });

  it.each([
    ['no language or region asked', {}],
    ['null language and region', { language: null, region: null }],
    ['the same language and region', { language: 'en', region: 'gb' }],
    ['only the same language', { language: 'en' }],
    ['only the same region', { region: 'gb' }],
    ['the same region in upper case', { region: 'GB' }],
    ["'UK', the ccTLD of the remembered 'gb'", { region: 'UK' }],
    ["'uk', the ccTLD of the remembered 'gb'", { region: 'uk' }],
  ])('placeFor uses toPlace() with %s', async (_label, ctx) => {
    const env = setup();
    const session = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a'], session.newToken());
    session.remember(prediction as google.maps.places.PlacePrediction, {
      language: 'en',
      region: 'gb',
    });
    session.placeFor({ placeId: 'a', ...ctx });
    expect(toPlaceCalls(env.control)).toHaveLength(1);
  });

  it.each<[string, { language?: string; region?: string }]>([
    ['a different language', { language: 'fr' }],
    ['a different region', { region: 'fr' }],
    ['a different language with the same region', { language: 'fr', region: 'gb' }],
  ])('placeFor builds a new Place for %s (CORE-14)', async (_label, ctx) => {
    const env = setup();
    const session = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a'], session.newToken());
    session.remember(prediction as google.maps.places.PlacePrediction, {
      language: 'en',
      region: 'gb',
    });
    session.placeFor({ placeId: 'a', ...ctx });
    expect(toPlaceCalls(env.control)).toHaveLength(0);
    const expected: google.maps.places.PlaceOptions = { id: 'a' };
    if (ctx.language) expected.requestedLanguage = ctx.language;
    if (ctx.region) expected.requestedRegion = ctx.region;
    expect(env.placeOptions).toEqual([expected]);
  });

  it('a remembered region UK matches a details request for gb', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a'], session.newToken());
    session.remember(prediction as google.maps.places.PlacePrediction, { region: 'UK' });
    session.placeFor({ placeId: 'a', region: 'gb' });
    expect(toPlaceCalls(env.control)).toHaveLength(1);
  });

  it('a region asked for when none was remembered builds a new Place', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a'], session.newToken());
    session.remember(prediction as google.maps.places.PlacePrediction);
    session.placeFor({ placeId: 'a', region: 'ES' });
    expect(toPlaceCalls(env.control)).toHaveLength(0);
    expect(env.placeOptions).toEqual([{ id: 'a', requestedRegion: 'ES' }]);
  });

  it('a language asked for when none was remembered builds a new Place', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a'], session.newToken());
    session.remember(prediction as google.maps.places.PlacePrediction);
    session.placeFor({ placeId: 'a', language: 'en' });
    expect(toPlaceCalls(env.control)).toHaveLength(0);
  });

  it('re-remembering an id replaces its prediction and context', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [first] = await livePredictions(env, ['a'], session.newToken());
    const [second] = await livePredictions(env, ['a'], session.newToken());
    session.remember(first as google.maps.places.PlacePrediction, { language: 'en' });
    session.remember(second as google.maps.places.PlacePrediction, { language: 'de' });
    session.placeFor({ placeId: 'a', language: 'de' });
    expect(toPlaceCalls(env.control)).toEqual([expect.objectContaining({ tokenId: 'token-2' })]);
  });

  it('keeps the last 100 ids: the 101st evicts the oldest', async () => {
    const env = setup();
    const session = createSession(env.places);
    const ids = Array.from({ length: 101 }, (_, i) => `p${i}`);
    const predictions = await livePredictions(env, ids, session.newToken());
    for (const prediction of predictions) session.remember(prediction);
    session.placeFor({ placeId: 'p0' });
    expect(toPlaceCalls(env.control)).toHaveLength(0);
    session.placeFor({ placeId: 'p1' });
    session.placeFor({ placeId: 'p100' });
    expect(toPlaceCalls(env.control).map((call) => call.request)).toEqual([
      { placeId: 'p1' },
      { placeId: 'p100' },
    ]);
  });

  it('100 ids fit without eviction', async () => {
    const env = setup();
    const session = createSession(env.places);
    const ids = Array.from({ length: 100 }, (_, i) => `p${i}`);
    for (const prediction of await livePredictions(env, ids)) session.remember(prediction);
    session.placeFor({ placeId: 'p0' });
    expect(toPlaceCalls(env.control)).toHaveLength(1);
  });

  it('re-remembering an id moves it to the end of the eviction order', async () => {
    const env = setup();
    const session = createSession(env.places);
    const ids = Array.from({ length: 101 }, (_, i) => `p${i}`);
    const predictions = await livePredictions(env, ids);
    for (const prediction of predictions.slice(0, 100)) session.remember(prediction);
    session.remember(predictions[0] as google.maps.places.PlacePrediction);
    session.remember(predictions[100] as google.maps.places.PlacePrediction);
    session.placeFor({ placeId: 'p0' });
    session.placeFor({ placeId: 'p1' });
    expect(toPlaceCalls(env.control).map((call) => call.request)).toEqual([{ placeId: 'p0' }]);
  });

  it('each createSession has its own registry', async () => {
    const env = setup();
    const one = createSession(env.places);
    const two = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a']);
    one.remember(prediction as google.maps.places.PlacePrediction);
    two.placeFor({ placeId: 'a' });
    expect(toPlaceCalls(env.control)).toHaveLength(0);
    expect(createSession(env.places)).not.toBe(one);
  });
});

describe('sharedSession', () => {
  it('returns the same session for the same places object', () => {
    const { places } = setup();
    expect(sharedSession(places)).toBe(sharedSession(places));
  });

  it('returns a different session for another places object', () => {
    expect(sharedSession(setup().places)).not.toBe(sharedSession(setup().places));
  });

  it('is not one of the sessions made by createSession', () => {
    const { places } = setup();
    expect(sharedSession(places)).not.toBe(createSession(places));
  });

  it('shares its registry between callers', async () => {
    const env = setup();
    const [prediction] = await livePredictions(env, ['a']);
    sharedSession(env.places).remember(prediction as google.maps.places.PlacePrediction);
    sharedSession(env.places).placeFor({ placeId: 'a' });
    expect(toPlaceCalls(env.control)).toHaveLength(1);
  });
});

describe('session closing', () => {
  it('fetchFields on the toPlace() Place closes the session', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a'], session.newToken());
    session.remember(prediction as google.maps.places.PlacePrediction);
    env.control.onFetchFields('a', { id: 'a', displayName: 'A' });
    const { status } = await fetchDetails(
      env.places,
      { placeId: 'a', fields: ['name'] },
      { session },
    );
    expect(status).toBe('OK');
    expect(env.control.sessions.get('token-1')).toEqual({
      suggest: 1,
      fetchFields: 1,
      closed: true,
    });
    expect(env.control.calls.find((call) => call.kind === 'fetchFields')?.tokenId).toBe('token-1');
  });

  it('a place outside the registry is fetched without a token and leaves the session open', async () => {
    const env = setup();
    const session = createSession(env.places);
    await livePredictions(env, ['a'], session.newToken());
    env.control.onFetchFields('b', { id: 'b', displayName: 'B' });
    await fetchDetails(env.places, { placeId: 'b', fields: ['name'] }, { session });
    expect(env.control.sessions.get('token-1')?.closed).toBe(false);
    const fetchCall = env.control.calls.find((call) => call.kind === 'fetchFields');
    expect(fetchCall).toBeDefined();
    expect(fetchCall).not.toHaveProperty('tokenId');
  });

  it('a different language leaves the session open (CORE-14)', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a'], session.newToken());
    session.remember(prediction as google.maps.places.PlacePrediction, { language: 'en' });
    env.control.onFetchFields('a', { id: 'a', displayName: 'A' });
    await fetchDetails(env.places, { placeId: 'a', fields: ['name'], language: 'fr' }, { session });
    expect(env.control.sessions.get('token-1')?.closed).toBe(false);
  });

  it.each(['ES', 'UK', 'gb'])(
    'the same region %s on the autocomplete and details requests closes the session',
    async (region) => {
      const env = setup();
      const session = createSession(env.places);
      const sessionToken = session.newToken();
      env.control.onSuggest('Paris', [suggestion('paris')]);
      env.control.onFetchFields('paris', { id: 'paris', displayName: 'Paris' });
      await fetchPredictions(env.places, { input: 'Paris', region, sessionToken }, { session });
      const { status } = await fetchDetails(
        env.places,
        { placeId: 'paris', fields: ['name'], region },
        { session },
      );
      expect(status).toBe('OK');
      expect(toPlaceCalls(env.control)).toHaveLength(1);
      expect(env.placeOptions).toEqual([]);
      expect(env.control.sessions.get('token-1')?.closed).toBe(true);
    },
  );

  it('a failed fetchFields leaves the session open', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a'], session.newToken());
    session.remember(prediction as google.maps.places.PlacePrediction);
    const { status } = await fetchDetails(
      env.places,
      { placeId: 'a', fields: ['name'] },
      { session },
    );
    expect(status).toBe('NOT_FOUND');
    expect(env.control.sessions.get('token-1')?.closed).toBe(false);
  });
});

describe('registry release', () => {
  function fetchCalls(control: ReturnType<typeof setup>['control']) {
    return control.calls.filter((call) => call.kind === 'fetchFields');
  }

  it('a second details request for a fetched place builds a Place without a token (CORE-14)', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a'], session.newToken());
    session.remember(prediction as google.maps.places.PlacePrediction);
    env.control.onFetchFields('a', { id: 'a', displayName: 'A' });
    const first = await fetchDetails(env.places, { placeId: 'a', fields: ['name'] }, { session });
    const second = await fetchDetails(env.places, { placeId: 'a', fields: ['name'] }, { session });
    expect(first).toEqual({ status: 'OK', result: { name: 'A' } });
    expect(second).toEqual({ status: 'OK', result: { name: 'A' } });
    expect(toPlaceCalls(env.control)).toHaveLength(1);
    expect(env.placeOptions).toEqual([{ id: 'a' }]);
    const [withToken, withoutToken] = fetchCalls(env.control);
    expect(withToken?.tokenId).toBe('token-1');
    expect(withoutToken).toBeDefined();
    expect(withoutToken).not.toHaveProperty('tokenId');
  });

  it('the Place built after release keeps the requested language and region', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a'], session.newToken());
    session.remember(prediction as google.maps.places.PlacePrediction, {
      language: 'en',
      region: 'gb',
    });
    env.control.onFetchFields('a', { id: 'a', displayName: 'A' });
    const request = { placeId: 'a', fields: ['name'], language: 'en', region: 'gb' };
    await fetchDetails(env.places, request, { session });
    await fetchDetails(env.places, request, { session });
    expect(toPlaceCalls(env.control)).toHaveLength(1);
    expect(env.placeOptions).toEqual([{ id: 'a', requestedLanguage: 'en', requestedRegion: 'gb' }]);
  });

  it('a failed fetchFields keeps the entry, so a retry still uses the session', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a'], session.newToken());
    session.remember(prediction as google.maps.places.PlacePrediction);
    const failed = await fetchDetails(env.places, { placeId: 'a', fields: ['name'] }, { session });
    expect(failed.status).toBe('NOT_FOUND');
    env.control.onFetchFields('a', { id: 'a', displayName: 'A' });
    const retried = await fetchDetails(env.places, { placeId: 'a', fields: ['name'] }, { session });
    expect(retried.status).toBe('OK');
    expect(toPlaceCalls(env.control)).toHaveLength(2);
    expect(env.placeOptions).toEqual([]);
    expect(fetchCalls(env.control).map((call) => call.tokenId)).toEqual(['token-1', 'token-1']);
    expect(env.control.sessions.get('token-1')?.closed).toBe(true);
  });

  it('a fetchFields that throws keeps the entry', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a'], session.newToken());
    session.remember(prediction as google.maps.places.PlacePrediction);
    const base = Object.getPrototypeOf(env.places.Place) as typeof env.places.Place;
    vi.spyOn(base.prototype, 'fetchFields').mockImplementationOnce(() => {
      throw new Error('boom');
    });
    env.control.onFetchFields('a', { id: 'a', displayName: 'A' });
    const failed = await fetchDetails(env.places, { placeId: 'a', fields: ['name'] }, { session });
    expect(failed.result).toBeNull();
    const retried = await fetchDetails(env.places, { placeId: 'a', fields: ['name'] }, { session });
    expect(retried.status).toBe('OK');
    expect(toPlaceCalls(env.control)).toHaveLength(2);
    expect(env.placeOptions).toEqual([]);
    expect(fetchCalls(env.control).map((call) => call.tokenId)).toEqual(['token-1']);
  });

  it('releasing an older Place does not drop a newer prediction for the same id', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [first] = await livePredictions(env, ['a'], session.newToken());
    const [second] = await livePredictions(env, ['a'], session.newToken());
    session.remember(first as google.maps.places.PlacePrediction);
    const older = session.placeFor({ placeId: 'a' });
    session.remember(second as google.maps.places.PlacePrediction);
    session.release(older, true);
    session.placeFor({ placeId: 'a' });
    expect(toPlaceCalls(env.control).map((call) => call.tokenId)).toEqual(['token-1', 'token-2']);
    expect(env.placeOptions).toEqual([]);
  });

  it('a newer prediction remembered while details are in flight survives', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [first] = await livePredictions(env, ['a'], session.newToken());
    const [second] = await livePredictions(env, ['a'], session.newToken());
    session.remember(first as google.maps.places.PlacePrediction);
    env.control.onFetchFields('a', { id: 'a', displayName: 'A' }, { deferred: true });
    const pending = fetchDetails(env.places, { placeId: 'a', fields: ['name'] }, { session });
    await Promise.resolve();
    session.remember(second as google.maps.places.PlacePrediction);
    env.control.pending[0]?.resolve();
    expect((await pending).status).toBe('OK');
    session.placeFor({ placeId: 'a' });
    expect(toPlaceCalls(env.control).map((call) => call.tokenId)).toEqual(['token-1', 'token-2']);
  });

  it('fields with no successor make no fetchFields call and keep the entry', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a'], session.newToken());
    session.remember(prediction as google.maps.places.PlacePrediction);
    const result = await fetchDetails(env.places, { placeId: 'a', fields: ['icon'] }, { session });
    expect(result).toEqual({ status: 'OK', result: {} });
    expect(fetchCalls(env.control)).toEqual([]);
    session.placeFor({ placeId: 'a' });
    expect(toPlaceCalls(env.control)).toHaveLength(2);
    expect(env.placeOptions).toEqual([]);
  });

  it('a details request for a place already in flight is sent without a token', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a'], session.newToken());
    session.remember(prediction as google.maps.places.PlacePrediction);
    env.control.onFetchFields('a', { id: 'a', displayName: 'A' }, { times: 2 });
    const request = { placeId: 'a', fields: ['name'] };
    const results = await Promise.all([
      fetchDetails(env.places, request, { session }),
      fetchDetails(env.places, request, { session }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['OK', 'OK']);
    expect(toPlaceCalls(env.control)).toHaveLength(1);
    expect(env.placeOptions).toEqual([{ id: 'a' }]);
    expect(fetchCalls(env.control).map((call) => call.tokenId)).toEqual(['token-1', undefined]);
    expect(env.control.sessions.get('token-1')).toEqual({
      suggest: 1,
      fetchFields: 1,
      closed: true,
    });
  });

  it('after an in-flight request fails, a retry still uses the session', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a'], session.newToken());
    session.remember(prediction as google.maps.places.PlacePrediction);
    const request = { placeId: 'a', fields: ['name'] };
    const results = await Promise.all([
      fetchDetails(env.places, request, { session }),
      fetchDetails(env.places, request, { session }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['NOT_FOUND', 'NOT_FOUND']);
    env.control.onFetchFields('a', { id: 'a', displayName: 'A' });
    const retried = await fetchDetails(env.places, request, { session });
    expect(retried.status).toBe('OK');
    expect(fetchCalls(env.control).map((call) => call.tokenId)).toEqual([
      'token-1',
      undefined,
      'token-1',
    ]);
    expect(env.control.sessions.get('token-1')?.closed).toBe(true);
  });

  it('a request for the place id alone keeps the entry for the next request', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a'], session.newToken());
    session.remember(prediction as google.maps.places.PlacePrediction);
    const idOnly = await fetchDetails(
      env.places,
      { placeId: 'a', fields: ['place_id'] },
      { session },
    );
    expect(idOnly).toEqual({ status: 'OK', result: { place_id: 'a' } });
    env.control.onFetchFields('a', { id: 'a', displayName: 'A' });
    const named = await fetchDetails(env.places, { placeId: 'a', fields: ['name'] }, { session });
    expect(named).toEqual({ status: 'OK', result: { name: 'A' } });
    expect(env.placeOptions).toEqual([]);
    expect(fetchCalls(env.control).map((call) => call.tokenId)).toEqual(['token-1']);
    expect(env.control.sessions.get('token-1')?.closed).toBe(true);
  });

  it('releasing a Place the session did not issue changes nothing', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [prediction] = await livePredictions(env, ['a'], session.newToken());
    session.remember(prediction as google.maps.places.PlacePrediction);
    session.release(new env.places.Place({ id: 'a' }), true);
    session.placeFor({ placeId: 'a' });
    expect(toPlaceCalls(env.control)).toHaveLength(1);
  });

  it('a Place built after release is not tied to any entry', async () => {
    const env = setup();
    const session = createSession(env.places);
    const [first] = await livePredictions(env, ['a'], session.newToken());
    session.remember(first as google.maps.places.PlacePrediction);
    session.release(session.placeFor({ placeId: 'a' }), true);
    const plain = session.placeFor({ placeId: 'a' });
    const [second] = await livePredictions(env, ['a'], session.newToken());
    session.remember(second as google.maps.places.PlacePrediction);
    session.release(plain, true);
    session.placeFor({ placeId: 'a' });
    expect(toPlaceCalls(env.control).map((call) => call.tokenId)).toEqual(['token-1', 'token-2']);
  });
});

describe('closing a session', () => {
  async function search(
    env: ReturnType<typeof setup>,
    session: ReturnType<typeof createSession>,
    ids: string[],
    token?: google.maps.places.AutocompleteSessionToken,
  ) {
    env.control.onSuggest('q', ids.map(suggestion), { times: 1 });
    const request: google.maps.places.AutocompletionRequest = { input: 'q' };
    if (token) request.sessionToken = token;
    await fetchPredictions(env.places, request, { session });
  }

  function details(env: ReturnType<typeof setup>, session: Session, placeId: string) {
    env.control.onFetchFields(placeId, { id: placeId, displayName: placeId.toUpperCase() });
    return fetchDetails(env.places, { placeId, fields: ['name'] }, { session });
  }

  function fetchTokens(control: ReturnType<typeof setup>['control']) {
    return control.calls
      .filter((call) => call.kind === 'fetchFields')
      .map((call) => (call as { tokenId?: string }).tokenId);
  }

  it('fetching one prediction drops the other predictions of the same session', async () => {
    const env = setup();
    const session = createSession(env.places);
    await search(env, session, ['a', 'b', 'c'], session.newToken());
    await details(env, session, 'a');
    await details(env, session, 'b');
    await details(env, session, 'c');
    expect(toPlaceCalls(env.control)).toHaveLength(1);
    expect(env.placeOptions).toEqual([{ id: 'b' }, { id: 'c' }]);
    expect(fetchTokens(env.control)).toEqual(['token-1', undefined, undefined]);
  });

  it('predictions of another session stay in the registry', async () => {
    const env = setup();
    const session = createSession(env.places);
    await search(env, session, ['a', 'b'], session.newToken());
    await search(env, session, ['c'], session.newToken());
    await details(env, session, 'a');
    await details(env, session, 'b');
    await details(env, session, 'c');
    expect(fetchTokens(env.control)).toEqual(['token-1', undefined, 'token-2']);
  });

  it('a later search with the closed token registers nothing', async () => {
    const env = setup();
    const session = createSession(env.places);
    const token = session.newToken();
    await search(env, session, ['a'], token);
    await details(env, session, 'a');
    await search(env, session, ['a', 'b'], token);
    await details(env, session, 'a');
    await details(env, session, 'b');
    expect(toPlaceCalls(env.control)).toHaveLength(1);
    expect(fetchTokens(env.control)).toEqual(['token-1', undefined, undefined]);
  });

  it('a later search with the closed token keeps the entry of another open session', async () => {
    const env = setup();
    const session = createSession(env.places);
    const closed = session.newToken();
    await search(env, session, ['b'], session.newToken());
    await search(env, session, ['a'], closed);
    await details(env, session, 'a');
    await search(env, session, ['b'], closed);
    await details(env, session, 'b');
    expect(fetchTokens(env.control)).toEqual(['token-1', 'token-2']);
  });

  it('while one details request of a session is in flight, the others go without a token', async () => {
    const env = setup();
    const session = createSession(env.places);
    await search(env, session, ['a', 'b'], session.newToken());
    env.control.onFetchFields('a', { id: 'a', displayName: 'A' });
    env.control.onFetchFields('b', { id: 'b', displayName: 'B' });
    const [first, second] = await Promise.all([
      fetchDetails(env.places, { placeId: 'a', fields: ['name'] }, { session }),
      fetchDetails(env.places, { placeId: 'b', fields: ['name'] }, { session }),
    ]);
    expect(first.status).toBe('OK');
    expect(second.status).toBe('OK');
    expect(fetchTokens(env.control)).toEqual(['token-1', undefined]);
  });

  it('a session token that is not an object is not tracked', async () => {
    const env = setup();
    const session = createSession(env.places);
    env.control.onSuggest('q', ['a'].map(suggestion), { times: 1 });
    const request = {
      input: 'q',
      sessionToken: 'tok',
    } as unknown as google.maps.places.AutocompletionRequest;
    await fetchPredictions(env.places, request, { session });
    expect(await details(env, session, 'a')).toEqual({ status: 'OK', result: { name: 'A' } });
  });

  it('a failed fetch keeps every prediction of the session', async () => {
    const env = setup();
    const session = createSession(env.places);
    await search(env, session, ['a', 'b'], session.newToken());
    const failed = await fetchDetails(env.places, { placeId: 'a', fields: ['name'] }, { session });
    expect(failed.status).toBe('NOT_FOUND');
    await details(env, session, 'b');
    expect(toPlaceCalls(env.control).map((call) => call.request)).toEqual([
      { placeId: 'a' },
      { placeId: 'b' },
    ]);
    expect(fetchTokens(env.control).slice(-1)).toEqual(['token-1']);
  });

  it('a request for the place id alone closes nothing', async () => {
    const env = setup();
    const session = createSession(env.places);
    await search(env, session, ['a', 'b'], session.newToken());
    await fetchDetails(env.places, { placeId: 'a', fields: ['place_id'] }, { session });
    await details(env, session, 'b');
    expect(fetchTokens(env.control)).toEqual(['token-1']);
  });

  it('predictions remembered without a token are dropped one by one', async () => {
    const env = setup();
    const session = createSession(env.places);
    await search(env, session, ['a', 'b']);
    await details(env, session, 'a');
    await details(env, session, 'b');
    await details(env, session, 'a');
    expect(toPlaceCalls(env.control)).toHaveLength(2);
    expect(env.placeOptions).toEqual([{ id: 'a' }]);
  });
});
