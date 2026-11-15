import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAutocompleteServiceShim, createPlacesServiceShim } from '../src/services';
import { createSession } from '../src/session';
import { createFakeGoogle, fakeMapsError } from '../src/testing/fake-new';
import type { SuggestionJson } from '../src/testing/types';

type Lib = google.maps.PlacesLibrary;
type Prediction = google.maps.places.AutocompletePrediction;
type Status = google.maps.places.PlacesServiceStatusString;

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setup() {
  const fake = createFakeGoogle();
  const places = fake.google.maps.places as unknown as Lib;
  const legacy = {
    AutocompleteService: vi.fn(),
    PlacesService: vi.fn(),
    Autocomplete: vi.fn(),
  };
  Object.assign(places, legacy);
  const session = createSession(places);
  const autocomplete = createAutocompleteServiceShim(places, session);
  const service = createPlacesServiceShim(places, session);
  return { ...fake, places, legacy, session, autocomplete, service };
}

const paris: SuggestionJson = {
  placePrediction: {
    placeId: 'paris',
    text: { text: 'Paris, France', matches: [{ endOffset: 5 }] },
    structuredFormat: { mainText: { text: 'Paris' }, secondaryText: { text: 'France' } },
    types: ['locality'],
  },
};

describe('AutocompleteService shim: getPlacePredictions', () => {
  it('OK: callback gets the predictions first, then the promise resolves them', async () => {
    const { control, autocomplete } = setup();
    control.onSuggest('Paris', [paris]);
    const log: string[] = [];
    const callback = vi.fn((predictions: Prediction[] | null, status: Status) => {
      log.push(`callback ${status} ${predictions?.length}`);
    });
    const response = await autocomplete
      .getPlacePredictions({ input: 'Paris' }, callback)
      .then((value) => {
        log.push('resolved');
        return value;
      });
    expect(log).toEqual(['callback OK 1', 'resolved']);
    const predictions = callback.mock.calls[0]?.[0];
    expect(predictions?.[0]).toMatchObject({ place_id: 'paris', description: 'Paris, France' });
    expect(response.predictions).toBe(predictions);
  });

  it('OK without a callback resolves the predictions', async () => {
    const { control, autocomplete } = setup();
    control.onSuggest('Paris', [paris]);
    const { predictions } = await autocomplete.getPlacePredictions({ input: 'Paris' });
    expect(predictions.map((p) => p.place_id)).toEqual(['paris']);
  });

  it('a null callback is ignored', async () => {
    const { control, autocomplete } = setup();
    control.onSuggest('Paris', [paris]);
    const request = autocomplete.getPlacePredictions(
      { input: 'Paris' },
      null as unknown as undefined,
    );
    await expect(request).resolves.toMatchObject({ predictions: [{ place_id: 'paris' }] });
  });

  it('ZERO_RESULTS: callback gets null, the promise resolves an empty list', async () => {
    const { autocomplete } = setup();
    const callback = vi.fn();
    const response = await autocomplete.getPlacePredictions({ input: 'nothing' }, callback);
    expect(callback).toHaveBeenCalledWith(null, 'ZERO_RESULTS');
    expect(response).toEqual({ predictions: [] });
  });

  it.each([
    ['INVALID_ARGUMENT', 'INVALID_REQUEST', 'MapsRequestError'],
    ['NOT_FOUND', 'NOT_FOUND', 'MapsRequestError'],
    ['RESOURCE_EXHAUSTED', 'OVER_QUERY_LIMIT', 'MapsRequestError'],
    ['PERMISSION_DENIED', 'REQUEST_DENIED', 'MapsRequestError'],
    ['INTERNAL', 'UNKNOWN_ERROR', 'MapsServerError'],
  ])(
    'code %s: callback gets (null, %s) and the promise rejects a %s',
    async (code, status, name) => {
      const { control, autocomplete } = setup();
      control.onSuggest('Paris', fakeMapsError(code));
      const callback = vi.fn();
      const error = await autocomplete.getPlacePredictions({ input: 'Paris' }, callback).then(
        () => undefined,
        (reason: unknown) => reason,
      );
      expect(callback).toHaveBeenCalledWith(null, status);
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({ name, code: status, endpoint: 'PLACES_AUTOCOMPLETE' });
    },
  );

  it('without a callback the rejection reaches the caller', async () => {
    const { control, autocomplete } = setup();
    control.onSuggest('Paris', fakeMapsError('UNAVAILABLE'));
    await expect(autocomplete.getPlacePredictions({ input: 'Paris' })).rejects.toMatchObject({
      name: 'MapsServerError',
      code: 'UNKNOWN_ERROR',
      endpoint: 'PLACES_AUTOCOMPLETE',
    });
  });

  it('with a callback a rejected promise left alone causes no unhandled rejection', async () => {
    const { control, autocomplete } = setup();
    control.onSuggest('Paris', fakeMapsError('PERMISSION_DENIED'));
    const callback = vi.fn();
    // The returned promise is dropped on purpose; vitest fails the run on an unhandled rejection.
    void autocomplete.getPlacePredictions({ input: 'Paris' }, callback);
    await flushMicrotasks();
    await nextTask();
    expect(callback).toHaveBeenCalledWith(null, 'REQUEST_DENIED');
  });

  it('with a callback the returned promise still rejects for a caller that awaits it', async () => {
    const { control, autocomplete } = setup();
    control.onSuggest('Paris', fakeMapsError('NOT_FOUND'));
    const request = autocomplete.getPlacePredictions({ input: 'Paris' }, vi.fn());
    await expect(request).rejects.toMatchObject({ name: 'MapsRequestError', code: 'NOT_FOUND' });
  });

  it('client validation errors reach the callback as INVALID_REQUEST', async () => {
    const { autocomplete } = setup();
    const callback = vi.fn();
    const request = { input: 'ab', inputOffset: 9 } as google.maps.places.AutocompletionRequest;
    await expect(autocomplete.getPlacePredictions(request, callback)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(callback).toHaveBeenCalledWith(null, 'INVALID_REQUEST');
  });

  it('forwards the sessionToken and remembers the predictions in the session', async () => {
    const { control, autocomplete, session } = setup();
    const token = session.newToken();
    control.onSuggest('Paris', [paris]);
    await autocomplete.getPlacePredictions({ input: 'Paris', sessionToken: token });
    expect(control.calls.find((call) => call.kind === 'suggest')?.tokenId).toBe('token-1');
    session.placeFor({ placeId: 'paris' });
    expect(control.calls.filter((call) => call.kind === 'toPlace')).toHaveLength(1);
  });
});

describe('AutocompleteService shim: getQueryPredictions (RGA-05)', () => {
  it('OK: callback gets place predictions and the method returns nothing', async () => {
    const { control, autocomplete } = setup();
    control.onSuggest('Paris', [paris]);
    const callback = vi.fn();
    expect(autocomplete.getQueryPredictions({ input: 'Paris' }, callback)).toBeUndefined();
    await flushMicrotasks();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ place_id: 'paris' })]);
    expect(callback.mock.calls[0]?.[1]).toBe('OK');
  });

  it('ZERO_RESULTS: callback gets null', async () => {
    const { autocomplete } = setup();
    const callback = vi.fn();
    autocomplete.getQueryPredictions({ input: 'nothing' }, callback);
    await flushMicrotasks();
    expect(callback).toHaveBeenCalledWith(null, 'ZERO_RESULTS');
  });

  it('an error reaches the callback with null and causes no unhandled rejection', async () => {
    const { control, autocomplete } = setup();
    control.onSuggest('Paris', fakeMapsError('RESOURCE_EXHAUSTED'));
    const callback = vi.fn();
    autocomplete.getQueryPredictions({ input: 'Paris' }, callback);
    await flushMicrotasks();
    await nextTask();
    expect(callback).toHaveBeenCalledWith(null, 'OVER_QUERY_LIMIT');
  });
});

describe('PlacesService shim: getDetails', () => {
  it('OK: callback gets the result and the method returns nothing', async () => {
    const { control, service } = setup();
    control.onFetchFields('cafe', { id: 'cafe', displayName: 'Cafe' });
    const callback = vi.fn();
    expect(service.getDetails({ placeId: 'cafe', fields: ['name'] }, callback)).toBeUndefined();
    await flushMicrotasks();
    expect(callback).toHaveBeenCalledWith({ name: 'Cafe' }, 'OK');
  });

  it('an error calls back (null, status)', async () => {
    const { service } = setup();
    const callback = vi.fn();
    service.getDetails({ placeId: 'missing', fields: ['name'] }, callback);
    await flushMicrotasks();
    expect(callback).toHaveBeenCalledWith(null, 'NOT_FOUND');
  });

  it('no placeId calls back (null, INVALID_REQUEST) without calling Google', async () => {
    const { control, service } = setup();
    const callback = vi.fn();
    service.getDetails({} as google.maps.places.PlaceDetailsRequest, callback);
    await flushMicrotasks();
    expect(callback).toHaveBeenCalledWith(null, 'INVALID_REQUEST');
    expect(control.calls).toEqual([]);
  });

  it('a prediction from the autocomplete shim closes its session', async () => {
    const { control, autocomplete, service, session } = setup();
    const token = session.newToken();
    control.onSuggest('Paris', [paris]);
    control.onFetchFields('paris', { id: 'paris', displayName: 'Paris' });
    await autocomplete.getPlacePredictions({ input: 'Paris', sessionToken: token });
    const callback = vi.fn();
    service.getDetails({ placeId: 'paris', fields: ['name'] }, callback);
    await flushMicrotasks();
    expect(callback).toHaveBeenCalledWith({ name: 'Paris' }, 'OK');
    expect(control.sessions.get('token-1')?.closed).toBe(true);
  });

  it('accepts an attribution container and ignores it', async () => {
    const { places, session, control } = setup();
    const container = document.createElement('div');
    const service = createPlacesServiceShim(places, session, container);
    control.onFetchFields('cafe', { id: 'cafe', displayName: 'Cafe' });
    const callback = vi.fn();
    service.getDetails({ placeId: 'cafe', fields: ['name'] }, callback);
    await flushMicrotasks();
    expect(callback).toHaveBeenCalledWith({ name: 'Cafe' }, 'OK');
    expect(container.childNodes).toHaveLength(0);
  });
});

describe('a callback that throws', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function fakeTimeouts(): void {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
  }

  const boom = new Error('user bug');
  const throwing = () => {
    throw boom;
  };

  it('getPlacePredictions still resolves on OK and the error is thrown on its own', async () => {
    fakeTimeouts();
    const { control, autocomplete } = setup();
    control.onSuggest('Paris', [paris]);
    const response = await autocomplete.getPlacePredictions({ input: 'Paris' }, throwing);
    expect(response.predictions.map((p) => p.place_id)).toEqual(['paris']);
    expect(() => vi.runOnlyPendingTimers()).toThrow(boom);
  });

  it('getPlacePredictions still rejects with the status error, not the callback error', async () => {
    fakeTimeouts();
    const { control, autocomplete } = setup();
    control.onSuggest('Paris', fakeMapsError('PERMISSION_DENIED'));
    const request = autocomplete.getPlacePredictions({ input: 'Paris' }, throwing);
    await expect(request).rejects.toMatchObject({ name: 'MapsRequestError' });
    expect(() => vi.runOnlyPendingTimers()).toThrow(boom);
  });

  it('getPlacePredictions with the promise dropped does not swallow the error', async () => {
    fakeTimeouts();
    const { control, autocomplete } = setup();
    control.onSuggest('Paris', [paris]);
    void autocomplete.getPlacePredictions({ input: 'Paris' }, throwing);
    await flushMicrotasks();
    expect(() => vi.runOnlyPendingTimers()).toThrow(boom);
  });

  it('getQueryPredictions does not swallow the error', async () => {
    fakeTimeouts();
    const { control, autocomplete } = setup();
    control.onSuggest('Paris', [paris]);
    autocomplete.getQueryPredictions({ input: 'Paris' }, throwing);
    await flushMicrotasks();
    expect(() => vi.runOnlyPendingTimers()).toThrow(boom);
  });

  it('getDetails reports the error the same way, with no unhandled rejection', async () => {
    fakeTimeouts();
    const { control, service } = setup();
    control.onFetchFields('cafe', { id: 'cafe', displayName: 'Cafe' });
    service.getDetails({ placeId: 'cafe', fields: ['name'] }, throwing);
    await flushMicrotasks();
    expect(() => vi.runOnlyPendingTimers()).toThrow(boom);
  });

  it('a callback that returns normally schedules nothing', async () => {
    fakeTimeouts();
    const { control, autocomplete, service } = setup();
    control.onSuggest('Paris', [paris]);
    control.onFetchFields('cafe', { id: 'cafe', displayName: 'Cafe' });
    await autocomplete.getPlacePredictions({ input: 'Paris' }, vi.fn());
    service.getDetails({ placeId: 'cafe', fields: ['name'] }, vi.fn());
    await flushMicrotasks();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('PlacesService shim: methods with no successor (RGA-06)', () => {
  type Method = 'textSearch' | 'nearbySearch' | 'findPlaceFromQuery' | 'findPlaceFromPhoneNumber';
  const call = (service: google.maps.places.PlacesService, method: Method, callback: () => void) =>
    (service[method] as (request: unknown, cb: () => void) => void)({ query: 'cafe' }, callback);

  it.each([
    'textSearch',
    'nearbySearch',
    'findPlaceFromQuery',
    'findPlaceFromPhoneNumber',
  ] as const)('%s throws synchronously', (method) => {
    const { service } = setup();
    const callback = vi.fn();
    expect(() => call(service, method, callback)).toThrow(
      new Error(`PlacesService.${method} is not available with Places API (New).`),
    );
    expect(callback).not.toHaveBeenCalled();
  });

  it('nothing is forwarded to a legacy PlacesService present on the places object', async () => {
    const { legacy, service, control } = setup();
    const textSearch = vi.fn();
    legacy.PlacesService.mockImplementation(() => ({ textSearch }));
    for (const method of [
      'textSearch',
      'nearbySearch',
      'findPlaceFromQuery',
      'findPlaceFromPhoneNumber',
    ] as const) {
      expect(() => call(service, method, vi.fn())).toThrow(Error);
    }
    await flushMicrotasks();
    expect(legacy.PlacesService).not.toHaveBeenCalled();
    expect(textSearch).not.toHaveBeenCalled();
    expect(control.calls).toEqual([]);
  });
});

describe('shims never use the legacy classes', () => {
  it('no legacy constructor runs through any shim method', async () => {
    const { control, autocomplete, service, legacy } = setup();
    control.onSuggest('Paris', [paris]);
    control.onFetchFields('paris', { id: 'paris', displayName: 'Paris' });
    await autocomplete.getPlacePredictions({ input: 'Paris' }, vi.fn());
    autocomplete.getQueryPredictions({ input: 'Paris' }, vi.fn());
    service.getDetails({ placeId: 'paris' }, vi.fn());
    await flushMicrotasks();
    expect(legacy.AutocompleteService).not.toHaveBeenCalled();
    expect(legacy.PlacesService).not.toHaveBeenCalled();
    expect(legacy.Autocomplete).not.toHaveBeenCalled();
  });

  it('the shims are plain objects, not instances of the legacy classes', () => {
    const { autocomplete, service, legacy } = setup();
    expect(autocomplete).not.toBeInstanceOf(legacy.AutocompleteService);
    expect(service).not.toBeInstanceOf(legacy.PlacesService);
    expect(Object.getPrototypeOf(autocomplete)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(service)).toBe(Object.prototype);
  });
});
