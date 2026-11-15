import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeLatLng, FakeLatLngBounds } from '../../src/testing/fake-latlng';
import { createLegacyFakeGoogle } from '../../src/testing/fake-legacy';
import { fakeMapsError } from '../../src/testing/fake-new';

type Prediction = google.maps.places.AutocompletePrediction;

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

const prediction = (input: string): Prediction =>
  ({
    description: `${input}, France`,
    place_id: `id-${input}`,
    matched_substrings: [],
    structured_formatting: {
      main_text: input,
      main_text_matched_substrings: [],
      secondary_text: 'France',
    },
    terms: [],
    types: ['locality'],
  }) as Prediction;

function setup(opts?: Parameters<typeof createLegacyFakeGoogle>[0]) {
  const fake = createLegacyFakeGoogle(opts);
  return { fake, places: fake.google.maps.places, control: fake.control };
}

function makeInput(placeholder?: string): HTMLInputElement {
  const input = document.createElement('input');
  if (placeholder !== undefined) input.placeholder = placeholder;
  return input;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createLegacyFakeGoogle: shape', () => {
  it('has the legacy classes and no new API, event or importLibrary', () => {
    const { fake, places } = setup();
    for (const name of [
      'AutocompleteService',
      'PlacesService',
      'Autocomplete',
      'AutocompleteSessionToken',
    ] as const) {
      expect(places[name]).toBeTypeOf('function');
    }
    expect(places.PlacesServiceStatus.OVER_QUERY_LIMIT).toBe('OVER_QUERY_LIMIT');
    const maps = fake.google.maps as unknown as Record<string, unknown>;
    expect((places as unknown as Record<string, unknown>).AutocompleteSuggestion).toBeUndefined();
    expect(maps.event).toBeUndefined();
    expect(maps.importLibrary).toBeUndefined();
    expect(maps.LatLng).toBe(FakeLatLng);
    expect(maps.LatLngBounds).toBe(FakeLatLngBounds);
    expect(fake.google.maps.GeocoderStatus.ZERO_RESULTS).toBe('ZERO_RESULTS');
  });

  it("has no google.maps.places with places: 'absent'", () => {
    const { fake } = setup({ places: 'absent' });
    expect(fake.google.maps.places).toBeUndefined();
    expect(fake.google.maps.Geocoder).toBeTypeOf('function');
  });

  it('installs on globalThis and window and uninstalls', () => {
    const { fake } = setup();
    const uninstall = fake.install();
    expect(globalThis.google).toBe(fake.google);
    expect((window as unknown as { google: unknown }).google).toBe(fake.google);
    uninstall();
    expect('google' in globalThis).toBe(false);
  });

  it('records constructions and session tokens with an increasing seq', () => {
    const { places, control } = setup();
    const container = document.createElement('div');
    new places.AutocompleteService();
    new places.PlacesService(container);
    new places.AutocompleteSessionToken();
    new places.Autocomplete(makeInput(), { fields: ['place_id'] });
    expect(control.calls).toEqual([
      { seq: 1, kind: 'construct', target: 'AutocompleteService', request: undefined },
      { seq: 2, kind: 'construct', target: 'PlacesService', request: container },
      { seq: 3, kind: 'newToken', request: undefined },
      { seq: 4, kind: 'construct', target: 'Autocomplete', request: { fields: ['place_id'] } },
    ]);
  });
});

describe('AutocompleteService.getPlacePredictions', () => {
  it('calls back (array, OK) and then resolves { predictions }', async () => {
    const { places, control } = setup();
    const predictions = [prediction('Paris')];
    control.onPredictions('Paris', predictions);
    const order: string[] = [];
    const callback = vi.fn(() => order.push('callback'));
    const response = await new places.AutocompleteService()
      .getPlacePredictions({ input: 'Paris' }, callback)
      .then((value) => {
        order.push('promise');
        return value;
      });
    expect(callback).toHaveBeenCalledWith(predictions, 'OK');
    expect(response).toEqual({ predictions });
    expect(order).toEqual(['callback', 'promise']);
    expect(control.calls[control.calls.length - 1]).toEqual({
      seq: 2,
      kind: 'predictions',
      request: { input: 'Paris' },
    });
  });

  it('calls back (null, ZERO_RESULTS) without a handler and resolves { predictions: [] }', async () => {
    const { places } = setup();
    const callback = vi.fn();
    await expect(
      new places.AutocompleteService().getPlacePredictions({ input: 'x' }, callback),
    ).resolves.toEqual({ predictions: [] });
    expect(callback).toHaveBeenCalledWith(null, 'ZERO_RESULTS');
  });

  it('gives (null, status) for a status reply and rejects with MapsRequestError', async () => {
    const { places, control } = setup();
    control.onPredictions('x', 'OVER_QUERY_LIMIT');
    const callback = vi.fn();
    const promise = new places.AutocompleteService().getPlacePredictions({ input: 'x' });
    await expect(promise).rejects.toMatchObject({
      name: 'MapsRequestError',
      code: 'OVER_QUERY_LIMIT',
      endpoint: 'PLACES_AUTOCOMPLETE',
    });
    await new places.AutocompleteService()
      .getPlacePredictions({ input: 'x' }, callback)
      .catch(() => {});
    expect(callback).toHaveBeenCalledWith(null, 'OVER_QUERY_LIMIT');
  });

  it('rejects UNKNOWN_ERROR with MapsServerError', async () => {
    const { places, control } = setup();
    control.onPredictions('x', 'UNKNOWN_ERROR');
    await expect(
      new places.AutocompleteService().getPlacePredictions({ input: 'x' }),
    ).rejects.toMatchObject({ name: 'MapsServerError', code: 'UNKNOWN_ERROR' });
  });

  it('leaves no unhandled rejection when a callback was given', async () => {
    const { places, control } = setup();
    control.onPredictions('x', 'REQUEST_DENIED');
    const callback = vi.fn();
    new places.AutocompleteService().getPlacePredictions({ input: 'x' }, callback);
    await flushMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callback).toHaveBeenCalledWith(null, 'REQUEST_DENIED');
  });

  it('uses the first matching handler with times left', async () => {
    const { places, control } = setup();
    control.onPredictions('Paris', [prediction('first')], { times: 1 });
    control.onPredictions(/^Par/, [prediction('second')]);
    control.onPredictions((request) => request.language === 'fr', 'NOT_FOUND');
    const service = new places.AutocompleteService();
    const callback = vi.fn();
    service.getPlacePredictions({ input: 'Paris' }, callback);
    service.getPlacePredictions({ input: 'Paris' }, callback);
    service.getPlacePredictions({ input: 'Lyon', language: 'fr' }, callback);
    service.getPlacePredictions({ input: 'Lyon' }, callback);
    await flushMicrotasks();
    expect(
      callback.mock.calls.map(([preds, status]) => [preds?.[0]?.place_id ?? null, status]),
    ).toEqual([
      ['id-first', 'OK'],
      ['id-second', 'OK'],
      [null, 'NOT_FOUND'],
      [null, 'ZERO_RESULTS'],
    ]);
  });

  it('hands out a copy of the reply array', async () => {
    const { places, control } = setup();
    const predictions = [prediction('a')];
    control.onPredictions('a', predictions);
    const { predictions: received } = await new places.AutocompleteService().getPlacePredictions({
      input: 'a',
    });
    expect(received).toEqual(predictions);
    expect(received).not.toBe(predictions);
  });
});

describe('AutocompleteService.getQueryPredictions', () => {
  it("uses the same handlers and records 'queryPredictions'", async () => {
    const { places, control } = setup();
    control.onPredictions('pizza', [prediction('pizza')]);
    const service = new places.AutocompleteService();
    const callback = vi.fn();
    service.getQueryPredictions({ input: 'pizza' }, callback);
    service.getQueryPredictions({ input: 'none' }, callback);
    await flushMicrotasks();
    expect(callback.mock.calls).toEqual([
      [[prediction('pizza')], 'OK'],
      [null, 'ZERO_RESULTS'],
    ]);
    expect(control.calls.slice(1).map((call) => call.kind)).toEqual([
      'queryPredictions',
      'queryPredictions',
    ]);
  });
});

describe('delivery', () => {
  it('calls back in a microtask by default, also under fake timers', async () => {
    vi.useFakeTimers();
    const { places } = setup();
    const callback = vi.fn();
    new places.AutocompleteService().getQueryPredictions({ input: 'a' }, callback);
    expect(callback).not.toHaveBeenCalled();
    await flushMicrotasks();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('calls back inside the call with sync: true', () => {
    const { places, control } = setup();
    control.onPredictions('a', [prediction('a')], { sync: true });
    const callback = vi.fn();
    new places.AutocompleteService().getPlacePredictions({ input: 'a' }, callback);
    expect(callback).toHaveBeenCalledWith([prediction('a')], 'OK');
  });

  it('calls back after setTimeout(delayMs)', async () => {
    vi.useFakeTimers();
    const { places, control } = setup();
    control.onPredictions('a', [prediction('a')], { delayMs: 300 });
    const callback = vi.fn();
    new places.AutocompleteService().getPlacePredictions({ input: 'a' }, callback);
    await flushMicrotasks();
    vi.advanceTimersByTime(299);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('delivers deferred replies in any order', () => {
    const { places, control } = setup();
    control.onPredictions(() => true, [prediction('a')], { deferred: true });
    control.onDetails('p1', { place_id: 'p1' }, { deferred: true });
    const order: string[] = [];
    const service = new places.AutocompleteService();
    service.getPlacePredictions({ input: 'a' }, () => order.push('predictions'));
    new places.PlacesService(document.createElement('div')).getDetails({ placeId: 'p1' }, () =>
      order.push('details'),
    );
    service.getQueryPredictions({ input: 'b' }, () => order.push('query'));
    expect(control.pending.map(({ seq, kind }) => [seq, kind])).toEqual([
      [2, 'predictions'],
      [4, 'details'],
      [5, 'queryPredictions'],
    ]);
    control.pending[2]?.resolve();
    control.pending[0]?.resolve();
    control.pending[1]?.resolve();
    expect(order).toEqual(['query', 'predictions', 'details']);
  });

  it('calls back (null, UNKNOWN_ERROR) on reject() and uses a status code when given', async () => {
    const { places, control } = setup();
    control.onPredictions(() => true, [prediction('a')], { deferred: true });
    control.onDetails('p1', { place_id: 'p1' }, { deferred: true });
    const callback = vi.fn();
    const service = new places.AutocompleteService();
    const first = service.getPlacePredictions({ input: 'a' });
    service.getPlacePredictions({ input: 'b' }, callback);
    new places.PlacesService(document.createElement('div')).getDetails({ placeId: 'p1' }, callback);
    control.pending[0]?.reject();
    control.pending[1]?.reject(fakeMapsError('OVER_QUERY_LIMIT'));
    control.pending[2]?.reject(fakeMapsError('INTERNAL'));
    await expect(first).rejects.toMatchObject({ code: 'UNKNOWN_ERROR', name: 'MapsServerError' });
    expect(callback.mock.calls).toEqual([
      [null, 'OVER_QUERY_LIMIT'],
      [null, 'UNKNOWN_ERROR'],
    ]);
  });
});

describe('PlacesService.getDetails', () => {
  it('calls back (result, OK) with geometry literals wrapped', async () => {
    const { places, control } = setup();
    control.onDetails('p1', {
      place_id: 'p1',
      geometry: {
        location: { lat: 1, lng: 2 },
        viewport: { south: 0, west: 0, north: 1, east: 3 },
      },
    } as unknown as google.maps.places.PlaceResult);
    const callback = vi.fn();
    new places.PlacesService(document.createElement('div')).getDetails(
      { placeId: 'p1', fields: ['geometry'] },
      callback,
    );
    await flushMicrotasks();
    const [result, status] = callback.mock.calls[0] as [google.maps.places.PlaceResult, string];
    expect(status).toBe('OK');
    expect(result.geometry?.location?.lat()).toBe(1);
    expect(result.geometry?.viewport?.getNorthEast().lng()).toBe(3);
    expect(control.calls[control.calls.length - 1]).toEqual({
      seq: 2,
      kind: 'details',
      request: { placeId: 'p1', fields: ['geometry'] },
    });
  });

  it('calls back (null, status) for a status reply and (null, NOT_FOUND) without a handler', async () => {
    const { places, control } = setup();
    control.onDetails('denied', 'REQUEST_DENIED');
    const callback = vi.fn();
    const service = new places.PlacesService(document.createElement('div'));
    service.getDetails({ placeId: 'denied' }, callback);
    service.getDetails({ placeId: 'missing' }, callback);
    await flushMicrotasks();
    expect(callback.mock.calls).toEqual([
      [null, 'REQUEST_DENIED'],
      [null, 'NOT_FOUND'],
    ]);
  });
});

describe('Geocoder', () => {
  it('gives ([], ZERO_RESULTS) without a handler and wraps geometry otherwise', async () => {
    const { fake, control } = setup();
    control.onGeocode('Paris', [
      { geometry: { location: { lat: 1, lng: 2 } } } as unknown as google.maps.GeocoderResult,
    ]);
    const callback = vi.fn();
    const geocoder = new fake.google.maps.Geocoder();
    geocoder.geocode({ address: 'nowhere' }, callback);
    geocoder.geocode({ address: 'Paris' }, callback);
    await flushMicrotasks();
    expect(callback.mock.calls[0]).toEqual([[], 'ZERO_RESULTS']);
    expect(callback.mock.calls[1]?.[0][0].geometry.location.lat()).toBe(1);
    expect(control.calls.map((call) => call.kind)).toEqual(['geocode', 'geocode']);
  });
});

describe('Autocomplete', () => {
  it('sets autocomplete=off, the pac-target-input class and a default placeholder', () => {
    const { places } = setup();
    const input = makeInput();
    new places.Autocomplete(input);
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.classList.contains('pac-target-input')).toBe(true);
    expect(input.placeholder).toBe('Enter a location');
  });

  it('keeps a placeholder that is already there', () => {
    const { places } = setup();
    const input = makeInput('Where to?');
    new places.Autocomplete(input);
    expect(input.placeholder).toBe('Where to?');
  });

  it('records every setter with its argument and reflects it in the getters', () => {
    const { places, control } = setup();
    const widget = new places.Autocomplete(makeInput(), {
      bounds: { south: 0, west: 0, north: 1, east: 1 },
      fields: ['name'],
    });
    expect(widget.getFields()).toEqual(['name']);
    expect(widget.getBounds()?.getNorthEast().lat()).toBe(1);
    const bounds = { south: 1, west: 1, north: 2, east: 2 };
    widget.setBounds(bounds);
    widget.setComponentRestrictions({ country: 'fr' });
    widget.setFields(['place_id']);
    widget.setOptions({ strictBounds: true, fields: ['geometry'] });
    widget.setTypes(['(cities)']);
    expect(control.calls.slice(1)).toEqual([
      { seq: 2, kind: 'setter', target: 'setBounds', request: bounds },
      { seq: 3, kind: 'setter', target: 'setComponentRestrictions', request: { country: 'fr' } },
      { seq: 4, kind: 'setter', target: 'setFields', request: ['place_id'] },
      {
        seq: 5,
        kind: 'setter',
        target: 'setOptions',
        request: { strictBounds: true, fields: ['geometry'] },
      },
      { seq: 6, kind: 'setter', target: 'setTypes', request: ['(cities)'] },
    ]);
    expect(widget.getFields()).toEqual(['geometry']);
    expect(widget.getBounds()?.getSouthWest().lat()).toBe(1);
    widget.setBounds(undefined);
    expect(widget.getBounds()).toBeUndefined();
  });

  it('returns undefined from getPlace, getBounds and getFields before anything is set', () => {
    const { places } = setup();
    const widget = new places.Autocomplete(makeInput());
    expect(widget.getPlace()).toBeUndefined();
    expect(widget.getBounds()).toBeUndefined();
    expect(widget.getFields()).toBeUndefined();
  });

  it('selectPlace sets getPlace() and fires place_changed on the widget by index', () => {
    const { places, control } = setup();
    const first = new places.Autocomplete(makeInput());
    const second = new places.Autocomplete(makeInput());
    const onFirst = vi.fn();
    const onSecond = vi.fn(function (this: unknown) {
      return this;
    });
    first.addListener('place_changed', onFirst);
    second.addListener('place_changed', onSecond);
    second.addListener('other_event', onFirst);
    control.selectPlace(
      {
        place_id: 'p1',
        geometry: { location: { lat: 1, lng: 2 } },
      } as unknown as google.maps.places.PlaceResult,
      1,
    );
    expect(onFirst).not.toHaveBeenCalled();
    expect(onSecond).toHaveBeenCalledTimes(1);
    expect(onSecond.mock.results[0]?.value).toBe(second);
    expect(second.getPlace().place_id).toBe('p1');
    expect(second.getPlace().geometry?.location?.lng()).toBe(2);
    control.selectPlace({ place_id: 'p0' });
    expect(onFirst).toHaveBeenCalledTimes(1);
    expect(first.getPlace()).toEqual({ place_id: 'p0' });
  });

  it('enterWithoutSelection sets getPlace() to { name: input.value }', () => {
    const { places, control } = setup();
    const input = makeInput();
    const widget = new places.Autocomplete(input);
    const listener = vi.fn(() => widget.getPlace());
    widget.addListener('place_changed', listener);
    input.value = 'Some text';
    control.enterWithoutSelection();
    expect(listener.mock.results[0]?.value).toEqual({ name: 'Some text' });
  });

  it('stops calling a listener after remove()', () => {
    const { places, control } = setup();
    const widget = new places.Autocomplete(makeInput());
    const kept = vi.fn();
    const removed = vi.fn();
    widget.addListener('place_changed', kept);
    const handle = widget.addListener('place_changed', removed);
    handle.remove();
    handle.remove();
    control.selectPlace({ name: 'x' });
    expect(removed).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
  });

  it('throws when there is no Autocomplete at that index', () => {
    const { control } = setup();
    expect(() => control.selectPlace({ name: 'x' }, 0)).toThrow(
      'No Autocomplete number 0: 0 constructed so far.',
    );
    expect(() => control.enterWithoutSelection(2)).toThrow('No Autocomplete number 2');
  });
});

describe('reset', () => {
  it('clears handlers, calls and pending but keeps the widgets', async () => {
    const { places, control } = setup();
    const widget = new places.Autocomplete(makeInput());
    control.onPredictions('a', [prediction('a')], { deferred: true });
    control.onDetails('p1', 'OK');
    control.onGeocode('x', []);
    new places.AutocompleteService().getPlacePredictions({ input: 'a' });
    control.reset();
    expect([control.calls.length, control.pending.length]).toEqual([0, 0]);
    const callback = vi.fn();
    new places.AutocompleteService().getPlacePredictions({ input: 'a' }, callback);
    await flushMicrotasks();
    expect(callback).toHaveBeenCalledWith(null, 'ZERO_RESULTS');
    expect(control.calls[0]?.seq).toBe(1);
    const listener = vi.fn();
    widget.addListener('place_changed', listener);
    control.selectPlace({ name: 'kept' });
    expect(listener).toHaveBeenCalled();
  });
});
