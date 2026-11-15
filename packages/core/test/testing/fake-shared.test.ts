import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FakeLatLng,
  FakeLatLngBounds,
  toLatLng,
  toLatLngBounds,
} from '../../src/testing/fake-latlng';
import {
  codeOf,
  createGeocoderClass,
  type GeocodeReply,
  Handlers,
  installGoogle,
  mapsError,
  matches,
  ReplyEngine,
  wrapGeometry,
} from '../../src/testing/fake-shared';

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe('matches', () => {
  it('compares a string with the key', () => {
    expect(matches('Paris', {}, 'Paris')).toBe(true);
    expect(matches('Paris', {}, 'Pari')).toBe(false);
  });

  it('tests a RegExp on the key, also a global one twice in a row', () => {
    const pattern = /^par/gi;
    expect(matches(pattern, {}, 'Paris')).toBe(true);
    expect(matches(pattern, {}, 'Paris')).toBe(true);
    expect(matches(/^lon/, {}, 'Paris')).toBe(false);
  });

  it('passes the request to a function', () => {
    const request = { input: 'a', language: 'fr' };
    expect(matches((r: typeof request) => r.language === 'fr', request, 'a')).toBe(true);
  });

  it('never matches a string or RegExp when the key is not a string', () => {
    expect(matches('x', {}, undefined)).toBe(false);
    expect(matches(/x/, {}, null)).toBe(false);
  });
});

describe('Handlers', () => {
  it('picks the first matching handler with times left', () => {
    const handlers = new Handlers<{ input: string }, string>();
    handlers.add('a', 'first', { times: 1 });
    handlers.add(/a/, 'second', { times: 2 });
    handlers.add(() => true, 'fallback');
    const take = () => handlers.take({ input: 'a' }, 'a')?.reply;
    expect([take(), take(), take(), take(), take()]).toEqual([
      'first',
      'second',
      'second',
      'fallback',
      'fallback',
    ]);
  });

  it('skips handlers that do not match and returns undefined when none does', () => {
    const handlers = new Handlers<{ input: string }, string>();
    handlers.add('b', 'b');
    expect(handlers.take({ input: 'a' }, 'a')).toBeUndefined();
    expect(handlers.take({ input: 'b' }, 'b')).toEqual({ reply: 'b', opts: {} });
  });

  it('never uses a handler registered with times: 0', () => {
    const handlers = new Handlers<object, string>();
    handlers.add('a', 'never', { times: 0 });
    expect(handlers.take({}, 'a')).toBeUndefined();
  });

  it('forgets every handler on clear()', () => {
    const handlers = new Handlers<object, string>();
    handlers.add('a', 'a');
    handlers.clear();
    expect(handlers.take({}, 'a')).toBeUndefined();
  });
});

describe('ReplyEngine', () => {
  type Call = { seq: number; kind: string; request: unknown };

  it('records calls synchronously with a strictly increasing seq', () => {
    const engine = new ReplyEngine<Call>();
    expect(engine.record({ kind: 'a', request: 1 })).toBe(1);
    expect(engine.record({ kind: 'b', request: 2 })).toBe(2);
    expect(engine.calls).toEqual([
      { seq: 1, kind: 'a', request: 1 },
      { seq: 2, kind: 'b', request: 2 },
    ]);
  });

  it('delivers in a microtask by default, also under fake timers', async () => {
    vi.useFakeTimers();
    const engine = new ReplyEngine<Call>();
    const deliver = vi.fn();
    engine.schedule('suggest', 1, {}, deliver, vi.fn());
    expect(deliver).not.toHaveBeenCalled();
    await flushMicrotasks();
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('delivers inside the call with sync: true', () => {
    const engine = new ReplyEngine<Call>();
    const deliver = vi.fn();
    engine.schedule('predictions', 1, { sync: true }, deliver, vi.fn());
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('delivers after setTimeout(delayMs), driven by fake timers', async () => {
    vi.useFakeTimers();
    const engine = new ReplyEngine<Call>();
    const deliver = vi.fn();
    engine.schedule('suggest', 1, { delayMs: 300 }, deliver, vi.fn());
    await flushMicrotasks();
    vi.advanceTimersByTime(299);
    expect(deliver).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('queues deferred replies in pending and settles them in any order, once', () => {
    const engine = new ReplyEngine<Call>();
    const order: string[] = [];
    const fail = vi.fn();
    engine.schedule('suggest', 1, { deferred: true }, () => order.push('first'), fail);
    engine.schedule('geocode', 2, { deferred: true }, () => order.push('second'), fail);
    expect(engine.pending.map((entry) => [entry.seq, entry.kind])).toEqual([
      [1, 'suggest'],
      [2, 'geocode'],
    ]);
    engine.pending[1]?.resolve();
    engine.pending[0]?.resolve();
    engine.pending[0]?.resolve();
    engine.pending[0]?.reject();
    expect(order).toEqual(['second', 'first']);
    expect(fail).not.toHaveBeenCalled();
    expect(engine.pending).toHaveLength(2);
  });

  it('passes the reject() error, or undefined, to fail', () => {
    const engine = new ReplyEngine<Call>();
    const fail = vi.fn();
    engine.schedule('suggest', 1, { deferred: true }, vi.fn(), fail);
    engine.schedule('suggest', 2, { deferred: true }, vi.fn(), fail);
    const error = new Error('boom');
    engine.pending[0]?.reject(error);
    engine.pending[1]?.reject();
    expect(fail.mock.calls).toEqual([[error], [undefined]]);
  });

  it('gives deferred priority over delayMs and sync', async () => {
    vi.useFakeTimers();
    const engine = new ReplyEngine<Call>();
    const deliver = vi.fn();
    engine.schedule('suggest', 1, { deferred: true, delayMs: 10, sync: true }, deliver, vi.fn());
    vi.advanceTimersByTime(100);
    await flushMicrotasks();
    expect(deliver).not.toHaveBeenCalled();
    expect(engine.pending).toHaveLength(1);
  });

  it('reset() clears calls and pending, restarts seq and drops replies in flight', async () => {
    vi.useFakeTimers();
    const engine = new ReplyEngine<Call>();
    const calls = engine.calls;
    const deliver = vi.fn();
    engine.record({ kind: 'a', request: 1 });
    engine.schedule('suggest', 1, {}, deliver, vi.fn());
    engine.schedule('suggest', 1, { delayMs: 5 }, deliver, vi.fn());
    engine.schedule('suggest', 1, { deferred: true }, deliver, vi.fn());
    const stale = engine.pending[0];
    engine.reset();
    stale?.resolve();
    vi.advanceTimersByTime(10);
    await flushMicrotasks();
    expect(deliver).not.toHaveBeenCalled();
    expect(engine.pending).toEqual([]);
    expect(engine.calls).toBe(calls);
    expect(calls).toEqual([]);
    expect(engine.record({ kind: 'b', request: 2 })).toBe(1);
  });
});

describe('mapsError and codeOf', () => {
  it('names 4xx-like codes MapsRequestError and the rest MapsServerError', () => {
    for (const code of ['INVALID_ARGUMENT', 'PERMISSION_DENIED', 'NOT_FOUND', 'REQUEST_DENIED']) {
      expect(mapsError(code, 'E', 'm').name).toBe('MapsRequestError');
    }
    for (const code of ['UNKNOWN', 'INTERNAL', 'UNAVAILABLE', 'UNKNOWN_ERROR']) {
      expect(mapsError(code, 'E', 'm').name).toBe('MapsServerError');
    }
    const error = mapsError('NOT_FOUND', 'PLACES_GET_PLACE', 'message');
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ code: 'NOT_FOUND', endpoint: 'PLACES_GET_PLACE' });
    expect(error.message).toBe('message');
  });

  it('reads an allowed code from a reason and falls back otherwise', () => {
    expect(codeOf({ code: 'A' }, ['A'], 'F')).toBe('A');
    expect(codeOf({ code: 'B' }, ['A'], 'F')).toBe('F');
    expect(codeOf(undefined, ['A'], 'F')).toBe('F');
    expect(codeOf(new Error('x'), ['A'], 'F')).toBe('F');
  });
});

describe('FakeLatLng and FakeLatLngBounds', () => {
  it('builds a LatLng from numbers, a literal or another instance', () => {
    const fromNumbers = new FakeLatLng(48.85, 2.35);
    const fromLiteral = new FakeLatLng({ lat: 48.85, lng: 2.35 });
    const fromInstance = new FakeLatLng(fromLiteral);
    for (const point of [fromNumbers, fromLiteral, fromInstance]) {
      expect([point.lat(), point.lng()]).toEqual([48.85, 2.35]);
    }
    expect(new FakeLatLng(1).lng()).toBe(0);
  });

  it('implements toJSON, equals, toString and toUrlValue', () => {
    const point = new FakeLatLng(48.856614, 2.3522219);
    expect(point.toJSON()).toEqual({ lat: 48.856614, lng: 2.3522219 });
    expect(point.equals({ lat: 48.856614, lng: 2.3522219 })).toBe(true);
    expect(point.equals(new FakeLatLng(0, 0))).toBe(false);
    expect(point.equals(null)).toBe(false);
    expect(point.toString()).toBe('(48.856614, 2.3522219)');
    expect(point.toUrlValue()).toBe('48.856614,2.352222');
    expect(point.toUrlValue(2)).toBe('48.86,2.35');
  });

  it('builds bounds from a literal, two corners or another instance', () => {
    const literal = { south: 1, west: 2, north: 3, east: 6 };
    const fromLiteral = new FakeLatLngBounds(literal);
    const fromCorners = new FakeLatLngBounds({ lat: 1, lng: 2 }, new FakeLatLng(3, 6));
    const fromInstance = new FakeLatLngBounds(fromLiteral as unknown as google.maps.LatLngBounds);
    for (const bounds of [fromLiteral, fromCorners, fromInstance]) {
      expect(bounds.toJSON()).toEqual(literal);
      expect(bounds.getSouthWest().toJSON()).toEqual({ lat: 1, lng: 2 });
      expect(bounds.getNorthEast().toJSON()).toEqual({ lat: 3, lng: 6 });
      expect(bounds.getCenter().toJSON()).toEqual({ lat: 2, lng: 4 });
    }
  });

  it('uses one point for both corners when ne is missing, and empty corners without args', () => {
    expect(new FakeLatLngBounds({ lat: 1, lng: 2 }).toJSON()).toEqual({
      south: 1,
      west: 2,
      north: 1,
      east: 2,
    });
    expect(new FakeLatLngBounds().toJSON()).toEqual({
      south: 1,
      west: 180,
      north: -1,
      east: -180,
    });
  });

  it('wraps literals and passes instances through', () => {
    const point = new FakeLatLng(1, 2);
    expect(toLatLng(point)).toBe(point);
    expect(toLatLng({ lat: 1, lng: 2 })).toBeInstanceOf(FakeLatLng);
    const bounds = new FakeLatLngBounds({ south: 0, west: 0, north: 1, east: 1 });
    const asGoogle = bounds as unknown as google.maps.LatLngBounds;
    expect(toLatLngBounds(asGoogle)).toBe(bounds);
    expect(toLatLngBounds({ south: 0, west: 0, north: 1, east: 1 })).toBeInstanceOf(
      FakeLatLngBounds,
    );
  });
});

describe('wrapGeometry', () => {
  it('turns location, viewport and bounds literals into instances on a copy', () => {
    const result = {
      place_id: 'x',
      geometry: {
        location: { lat: 1, lng: 2 },
        viewport: { south: 0, west: 0, north: 2, east: 3 },
        bounds: { south: 0, west: 0, north: 1, east: 1 },
        location_type: 'APPROXIMATE',
      },
    };
    const wrapped = wrapGeometry(result) as unknown as {
      geometry: { location: FakeLatLng; viewport: FakeLatLngBounds; bounds: FakeLatLngBounds };
    };
    expect(wrapped).not.toBe(result);
    expect(wrapped.geometry.location.lat()).toBe(1);
    expect(wrapped.geometry.viewport.getNorthEast().lng()).toBe(3);
    expect(wrapped.geometry.bounds.getNorthEast().lat()).toBe(1);
    expect(wrapped.geometry).toMatchObject({ location_type: 'APPROXIMATE' });
    expect(result.geometry.location).toEqual({ lat: 1, lng: 2 });
  });

  it('returns a result without geometry unchanged', () => {
    const result = { name: 'x' };
    expect(wrapGeometry(result)).toBe(result);
  });
});

describe('createGeocoderClass', () => {
  type Call = { seq: number; kind: string; request: unknown };

  function setup() {
    const engine = new ReplyEngine<Call>();
    const handlers = new Handlers<google.maps.GeocoderRequest, GeocodeReply>();
    const Geocoder = createGeocoderClass(engine, handlers);
    return { engine, handlers, geocoder: new Geocoder() };
  }

  const result = {
    place_id: 'p1',
    geometry: { location: { lat: 1, lng: 2 }, viewport: { south: 0, west: 0, north: 2, east: 3 } },
  } as unknown as google.maps.GeocoderResult;

  it('matches on address, wraps geometry and calls back before resolving', async () => {
    const { engine, handlers, geocoder } = setup();
    handlers.add('Paris', [result]);
    const order: string[] = [];
    const callback = vi.fn((_results: unknown, _status: string) => order.push('callback'));
    const response = await geocoder.geocode({ address: 'Paris' }, callback).then((value) => {
      order.push('promise');
      return value;
    });
    expect(order).toEqual(['callback', 'promise']);
    expect(callback.mock.calls[0]?.[1]).toBe('OK');
    expect(response.results[0]?.geometry.location.lat()).toBe(1);
    expect(response.results[0]?.geometry.viewport.getNorthEast().lng()).toBe(3);
    expect(engine.calls).toEqual([{ seq: 1, kind: 'geocode', request: { address: 'Paris' } }]);
  });

  it('matches on placeId when there is no address', async () => {
    const { handlers, geocoder } = setup();
    handlers.add('p1', [result]);
    await expect(geocoder.geocode({ placeId: 'p1' })).resolves.toMatchObject({
      results: [{ place_id: 'p1' }],
    });
  });

  it('gives ([], ZERO_RESULTS) without a handler and rejects only the promise', async () => {
    const { geocoder } = setup();
    await expect(geocoder.geocode({ address: 'nowhere' })).rejects.toMatchObject({
      name: 'MapsRequestError',
      code: 'ZERO_RESULTS',
      endpoint: 'GEOCODER_GEOCODE',
    });
  });

  it('attaches a catch when a callback is given, so nothing goes unhandled', async () => {
    const { geocoder } = setup();
    const callback = vi.fn();
    geocoder.geocode({ address: 'nowhere' }, callback);
    await flushMicrotasks();
    expect(callback).toHaveBeenCalledWith([], 'ZERO_RESULTS');
  });

  it('gives (null, status) for a status reply and ZERO_RESULTS for an empty array', async () => {
    const { handlers, geocoder } = setup();
    handlers.add('denied', { status: 'REQUEST_DENIED' });
    handlers.add('weird', { status: 'NOPE' });
    handlers.add('empty', []);
    const callback = vi.fn();
    geocoder.geocode({ address: 'denied' }, callback);
    geocoder.geocode({ address: 'weird' }, callback);
    geocoder.geocode({ address: 'empty' }, callback);
    await flushMicrotasks();
    expect(callback.mock.calls).toEqual([
      [null, 'REQUEST_DENIED'],
      [null, 'UNKNOWN_ERROR'],
      [[], 'ZERO_RESULTS'],
    ]);
  });

  it('resolves { results: [] } for a { status: OK } reply', async () => {
    const { handlers, geocoder } = setup();
    handlers.add('ok', { status: 'OK' });
    await expect(geocoder.geocode({ address: 'ok' })).resolves.toEqual({ results: [] });
  });

  it('maps a deferred reject to the error code status or UNKNOWN_ERROR', async () => {
    const { engine, handlers, geocoder } = setup();
    handlers.add(() => true, [result], { deferred: true });
    const callback = vi.fn();
    const first = geocoder.geocode({ address: 'a' }, callback);
    const second = geocoder.geocode({ address: 'b' });
    const error = Object.assign(new Error('quota'), { code: 'OVER_QUERY_LIMIT' });
    engine.pending[0]?.reject(error);
    engine.pending[1]?.reject();
    await expect(first).rejects.toBe(error);
    await expect(second).rejects.toMatchObject({ code: 'UNKNOWN_ERROR', name: 'MapsServerError' });
    expect(callback).toHaveBeenCalledWith(null, 'OVER_QUERY_LIMIT');
  });
});

describe('installGoogle', () => {
  it('sets globalThis.google, which is window.google, and deletes it on uninstall', () => {
    const value = { maps: {} };
    const uninstall = installGoogle(value);
    expect((globalThis as { google?: unknown }).google).toBe(value);
    expect((window as unknown as { google?: unknown }).google).toBe(value);
    uninstall();
    expect('google' in globalThis).toBe(false);
    uninstall();
    expect('google' in globalThis).toBe(false);
  });

  it('restores the previous value', () => {
    const previous = { maps: { previous: true } };
    const target = globalThis as { google?: unknown };
    target.google = previous;
    try {
      const uninstall = installGoogle({ maps: {} });
      uninstall();
      expect(target.google).toBe(previous);
    } finally {
      delete target.google;
    }
  });
});
