import { afterEach, describe, expect, it } from 'vitest';
import { FakeLatLng, FakeLatLngBounds } from '../../src/testing/fake-latlng';
import { createLegacyFakeGoogle } from '../../src/testing/fake-legacy';
import {
  createFakeGoogle,
  FakeAutocompleteSuggestion,
  FakePlacePrediction,
} from '../../src/testing/fake-new';
import {
  collapseRepeats,
  isAutocomplete,
  isSessionToken,
  normalize,
  normalizeConsoleArgs,
} from '../../src/testing/normalize';

let uninstall: (() => void) | undefined;

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
});

describe('normalize', () => {
  it('turns functions into [fn]', () => {
    expect(normalize(() => 1)).toBe('[fn]');
    expect(normalize({ onChange() {} })).toEqual({ onChange: '[fn]' });
    expect(normalize(class {})).toBe('[fn]');
  });

  it('turns DOM elements into [element <tag>] with the tag in lower case', () => {
    expect(normalize(document.createElement('input'))).toBe('[element input]');
    expect(normalize(document.createElementNS('http://www.w3.org/2000/svg', 'SVG'))).toBe(
      '[element svg]',
    );
    expect(normalize([document.createElement('DIV')])).toEqual(['[element div]']);
  });

  it('names other DOM nodes by their node name', () => {
    expect(normalize(document.createTextNode('x'))).toBe('[node #text]');
    expect(normalize(document)).toBe('[node #document]');
  });

  it('reads objects with lat() and lng() as { lat, lng }', () => {
    expect(normalize(new FakeLatLng(1.5, -2))).toEqual({ lat: 1.5, lng: -2 });
    expect(normalize({ lat: () => 3, lng: () => 4, extra: true })).toEqual({ lat: 3, lng: 4 });
  });

  it('uses toJSON() for LatLngBounds-like objects', () => {
    const bounds = new FakeLatLngBounds({ south: 1, west: 2, north: 3, east: 4 });
    expect(normalize(bounds)).toEqual({ south: 1, west: 2, north: 3, east: 4 });
    expect(normalize({ toJSON: () => ({ a: undefined }) })).toEqual({ a: '[undefined]' });
  });

  it('turns session tokens of both fakes into [token]', () => {
    const legacy = createLegacyFakeGoogle().google.maps.places;
    const fresh = createFakeGoogle().google.maps.places;
    expect(normalize(new legacy.AutocompleteSessionToken())).toBe('[token]');
    expect(normalize(new fresh.AutocompleteSessionToken())).toBe('[token]');
    expect(normalize({ sessionToken: new fresh.AutocompleteSessionToken() })).toEqual({
      sessionToken: '[token]',
    });
  });

  it('recognises an instance of the installed AutocompleteSessionToken whatever its name', () => {
    class Renamed {}
    uninstall = createLegacyFakeGoogle().install();
    const places = (globalThis as unknown as { google: typeof google }).google.maps.places;
    (places as unknown as { AutocompleteSessionToken: unknown }).AutocompleteSessionToken = Renamed;
    expect(isSessionToken(new Renamed())).toBe(true);
    expect(isSessionToken({})).toBe(false);
    expect(isSessionToken(null)).toBe(false);
  });

  it('turns the Autocomplete widget or a shim into [autocomplete]', () => {
    const fake = createLegacyFakeGoogle();
    const widget = new fake.google.maps.places.Autocomplete(document.createElement('input'));
    expect(normalize(widget)).toBe('[autocomplete]');
    const shim = { getPlace() {}, addListener() {} };
    expect(normalize([shim])).toEqual(['[autocomplete]']);
    expect(isAutocomplete({ getPlace() {} })).toBe(false);
  });

  it('marks undefined values and keeps absent keys absent', () => {
    expect(normalize(undefined)).toBe('[undefined]');
    const out = normalize({ present: undefined }) as Record<string, unknown>;
    expect(out).toEqual({ present: '[undefined]' });
    expect('absent' in out).toBe(false);
    // biome-ignore lint/suspicious/noSparseArray: a hole is what this case checks
    expect(normalize([1, , undefined])).toEqual([1, '[undefined]', '[undefined]']);
  });

  it('keeps null, strings, booleans and finite numbers', () => {
    expect(normalize({ a: null, b: 'x', c: false, d: 1.25 })).toEqual({
      a: null,
      b: 'x',
      c: false,
      d: 1.25,
    });
  });

  it('makes values that JSON cannot hold explicit', () => {
    expect(normalize(Number.NaN)).toBe('[NaN]');
    expect(normalize(Number.POSITIVE_INFINITY)).toBe('[Infinity]');
    expect(normalize(Number.NEGATIVE_INFINITY)).toBe('[-Infinity]');
    expect(Object.is(normalize(-0), 0)).toBe(true);
    expect(normalize(BigInt(5))).toBe('[bigint 5]');
    expect(normalize(Symbol('s'))).toBe('[symbol s]');
    expect(normalize(Symbol())).toBe('[symbol ]');
  });

  it('keeps the name, message and own fields of an Error', () => {
    const error = Object.assign(new TypeError('bad'), { code: 'X' });
    expect(normalize(error)).toEqual({ name: 'TypeError', message: 'bad', code: 'X' });
  });

  it('guards cycles but repeats shared references', () => {
    const node: Record<string, unknown> = { name: 'a' };
    node.self = node;
    expect(normalize(node)).toEqual({ name: 'a', self: '[circular]' });
    const shared = { v: 1 };
    expect(normalize({ x: shared, y: shared })).toEqual({ x: { v: 1 }, y: { v: 1 } });
  });

  it('gives data that survives a JSON round trip unchanged', () => {
    const value = normalize({
      a: undefined,
      b: [() => 0, Number.NaN],
      c: new FakeLatLng(1, 2),
      d: document.createElement('span'),
    });
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  });

  it('turns a Map into its entries and a Set into its values', () => {
    expect(
      normalize(
        new Map<unknown, unknown>([
          ['a', 1],
          [{ k: 1 }, undefined],
        ]),
      ),
    ).toEqual({
      '[Map]': [
        ['a', 1],
        [{ k: 1 }, '[undefined]'],
      ],
    });
    expect(normalize({ seen: new Set(['x', () => 0]) })).toEqual({
      seen: { '[Set]': ['x', '[fn]'] },
    });
  });

  it('names class instances and reads their getters along the prototype chain', () => {
    class Base {
      get kind() {
        return 'base';
      }
      get shared() {
        return 'from base';
      }
    }
    class Point extends Base {
      x = 1;
      get sum() {
        return this.x + 1;
      }
      override get shared() {
        return 'from point';
      }
      get broken(): never {
        throw new Error('no');
      }
    }
    expect(normalize(new Point())).toEqual({
      '[class]': 'Point',
      x: 1,
      sum: 2,
      shared: 'from point',
      broken: '[throws]',
      kind: 'base',
    });
    expect(normalize(new (class {})())).toEqual({ '[class]': '[anonymous]' });
    expect(normalize(Object.assign(Object.create(null), { a: 1 }))).toEqual({ a: 1 });
  });

  it('keeps the content of a new-API suggestion, whose fields are getters', () => {
    const prediction = new FakePlacePrediction(
      {
        placeId: 'abc',
        text: { text: 'Paris, France', matches: [{ endOffset: 5 }] },
        structuredFormat: { mainText: { text: 'Paris' } },
      },
      () => ({}) as google.maps.places.Place,
    );
    const out = normalize(new FakeAutocompleteSuggestion(prediction)) as Record<string, unknown>;
    expect(out['[class]']).toBe('FakeAutocompleteSuggestion');
    expect(out.placePrediction).toMatchObject({
      '[class]': 'FakePlacePrediction',
      placeId: 'abc',
      text: { '[class]': 'FakeFormattableText', text: 'Paris, France' },
      mainText: { text: 'Paris' },
      secondaryText: null,
      distanceMeters: null,
    });
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  it('checks the lat/lng rule before toJSON, so a LatLng gives { lat, lng }', () => {
    const latLng = { lat: () => 1, lng: () => 2, toJSON: () => 'json' };
    expect(normalize(latLng)).toEqual({ lat: 1, lng: 2 });
  });
});

describe('normalizeConsoleArgs', () => {
  it('turns the first argument into a string and normalises the rest', () => {
    expect(normalizeConsoleArgs(['Status: ', undefined, () => 0])).toEqual([
      'Status: ',
      '[undefined]',
      '[fn]',
    ]);
    expect(normalizeConsoleArgs([42, { a: 1 }])).toEqual(['42', { a: 1 }]);
    expect(normalizeConsoleArgs([new Error('boom')])).toEqual(['Error: boom']);
    expect(normalizeConsoleArgs([])).toEqual([]);
  });
});

describe('collapseRepeats', () => {
  it('collapses consecutive repeats only', () => {
    expect(collapseRepeats([false, false, true, true, false, true])).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect(collapseRepeats([])).toEqual([]);
  });
});
