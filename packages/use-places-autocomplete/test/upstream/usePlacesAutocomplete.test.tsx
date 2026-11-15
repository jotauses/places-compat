// Ported from use-places-autocomplete 4.0.1, src/__tests__/usePlacesAutocomplete.ts. MIT License, Copyright (c) 2020 Welly Shen.
import { debounce as _debounce } from '@places-compat/core';
import {
  actCompat,
  createFakeGoogle,
  type FakeControl,
  fakeMapsError,
  renderHookCompat,
  type SuggestionJson,
} from '@places-compat/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApiErr } from '../../src/messages';
import type { HookArgs, RequestOptions } from '../../src/types';
import usePlacesAutocomplete from '../../src/usePlacesAutocomplete';

vi.mock('@places-compat/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@places-compat/core')>();
  return { ...actual, debounce: vi.fn((fn: unknown) => fn) };
});

type GoogleLike = { maps?: Record<string, unknown> };
type Scope = Record<string, unknown> & { google?: GoogleLike | undefined };

const scope = globalThis as unknown as Scope;
const hadGoogle = Object.getOwnPropertyDescriptor(scope, 'google') !== undefined;
const originalGoogle = scope.google;

const callbackName = 'initMap';
const renderHelper = (args: HookArgs = {}) =>
  renderHookCompat(() => usePlacesAutocomplete({ cache: false, ...args })).result;

const ok = 'OK';
const error = 'REQUEST_DENIED';
const prediction = (placeId: string): SuggestionJson => ({
  placePrediction: { placeId, text: { text: `Place ${placeId}` } },
});
const data = [prediction('0109')];
const suggestionsFor = (d: SuggestionJson[]) =>
  d.map((json) =>
    expect.objectContaining({
      place_id: json.placePrediction?.placeId,
      description: json.placePrediction?.text.text,
    }),
  );
const okSuggestions = {
  loading: false,
  status: ok,
  data: suggestionsFor(data),
};
const defaultSuggestions = {
  loading: false,
  status: '',
  data: [],
};
let control: FakeControl;
const getMaps = (type = 'success', d = data): GoogleLike => {
  const fake = createFakeGoogle();
  control = fake.control;
  if (type !== 'opts') {
    fake.control.onSuggest(
      () => true,
      type === 'success' ? d : fakeMapsError('PERMISSION_DENIED'),
      {
        delayMs: 500,
      },
    );
  }
  return fake.google as unknown as GoogleLike;
};
const mapsOf = (google: GoogleLike) => google.maps as Record<string, unknown>;

describe('usePlacesAutocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    sessionStorage.clear();
    scope.google = getMaps();
    vi.mocked(_debounce).mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    sessionStorage.clear();
    delete scope[callbackName];
    if (hadGoogle) scope.google = originalGoogle;
    else delete scope.google;
  });

  it('should set "callbackName" correctly', () => {
    renderHelper({ callbackName });
    expect(scope[callbackName]).toBeUndefined();

    delete scope.google?.maps;
    renderHelper({ callbackName, googleMaps: mapsOf(getMaps()) });
    expect(scope[callbackName]).toBeUndefined();

    delete scope.google;
    renderHelper({ callbackName, googleMaps: mapsOf(getMaps()) });
    expect(scope[callbackName]).toBeUndefined();

    renderHelper({ callbackName });
    expect(scope[callbackName]).toEqual(expect.any(Function));
  });

  it('should delete "callbackName" when un-mount', () => {
    renderHelper({ callbackName });
    expect(scope[callbackName]).toBeUndefined();
  });

  it('should throw error when no Places API', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    delete scope.google?.maps?.places;
    delete scope.google?.maps?.importLibrary;
    renderHelper();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(loadApiErr);

    delete scope.google?.maps;
    renderHelper();
    expect(consoleError).toHaveBeenCalledTimes(2);

    delete scope.google;
    renderHelper();
    expect(consoleError).toHaveBeenCalledTimes(3);

    const result = renderHelper({ initOnMount: false });
    expect(consoleError).toHaveBeenCalledTimes(3);
    result.current.init();
    expect(consoleError).toHaveBeenCalledTimes(4);
  });

  it('should set debounce correctly', () => {
    renderHelper();
    expect(_debounce).toHaveBeenCalledWith(expect.any(Function), 200);

    const debounce = 500;
    renderHelper({ debounce });
    expect(_debounce).toHaveBeenCalledWith(expect.any(Function), debounce);
  });

  it('should set "requestOptions" correctly', async () => {
    scope.google = getMaps('opts');
    const location = { lat: 25.03, lng: 121.56 };
    const opts = { location, radius: 100 } as unknown as RequestOptions;
    const result = renderHelper({ requestOptions: opts });
    await actCompat(() => result.current.setValue('test'));
    expect(control.calls.filter(({ kind }) => kind === 'suggest')).toEqual([
      expect.objectContaining({
        request: { input: 'test', locationBias: { center: location, radius: 100 } },
      }),
    ]);
  });

  it('should return "ready" correctly', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    delete scope.google;
    let res = renderHelper({ googleMaps: mapsOf(getMaps()) });
    expect(res.current.ready).toBeTruthy();

    res = renderHelper();
    expect(res.current.ready).toBeFalsy();

    scope.google = getMaps();
    res = renderHelper();
    expect(res.current.ready).toBeTruthy();
  });

  it('should return "value" correctly', async () => {
    let result = renderHelper();
    expect(result.current.value).toBe('');

    const defaultValue = 'Welly';
    result = renderHelper({ defaultValue });
    expect(result.current.value).toBe(defaultValue);

    await actCompat(() => {
      result.current.setValue('test');
      vi.runAllTimers();
    });
    expect(result.current.value).toBe('test');
  });

  it('should return "suggestions" correctly', async () => {
    let res = renderHelper();
    expect(res.current.suggestions).toEqual(defaultSuggestions);

    await actCompat(() => res.current.setValue(''));
    expect(res.current.suggestions).toEqual(defaultSuggestions);

    await actCompat(() => res.current.setValue('test', false));
    expect(res.current.suggestions).toEqual(defaultSuggestions);

    await actCompat(() => res.current.setValue('test'));
    expect(res.current.suggestions).toEqual({
      ...defaultSuggestions,
      loading: true,
    });

    await actCompat(() => {
      res.current.setValue('test');
      vi.runAllTimers();
    });
    expect(res.current.suggestions).toEqual(okSuggestions);

    scope.google = getMaps('failure');
    res = renderHelper();
    await actCompat(() => {
      res.current.setValue('test');
      vi.runAllTimers();
    });
    expect(res.current.suggestions).toEqual({
      loading: false,
      status: error,
      data: [],
    });
  });

  it('should return "suggestions" with cache correctly', async () => {
    let res = renderHelper({ cache: 0 });
    await actCompat(() => {
      res.current.setValue('prev');
      vi.runAllTimers();
    });
    expect(res.current.suggestions).toEqual(okSuggestions);

    vi.setSystemTime(0);
    const cachedData = [prediction('1119')];
    scope.google = getMaps('success', cachedData);
    res = renderHelper({ cache: 10 });
    await actCompat(() => {
      res.current.setValue('prev');
      vi.runAllTimers();
    });
    expect(res.current.suggestions).toEqual({
      ...okSuggestions,
      data: suggestionsFor(cachedData),
    });

    scope.google = getMaps();
    res = renderHelper({ cache: 10 });
    await actCompat(() => {
      res.current.setValue('prev');
      vi.runAllTimers();
    });
    expect(res.current.suggestions).toEqual({
      ...okSuggestions,
      data: suggestionsFor(cachedData),
    });

    vi.setSystemTime(100000);
    await actCompat(() => {
      res.current.setValue('next');
      vi.runAllTimers();
    });
    await actCompat(() => {
      res.current.setValue('prev');
      vi.runAllTimers();
    });
    expect(res.current.suggestions).toEqual(okSuggestions);
  });

  it('should allow custom cache names', async () => {
    const CACHE_KEY_1 = 'cache1';
    const CACHE_KEY_2 = 'cache2';
    vi.setSystemTime(0);
    const cachedData = [prediction('1119')];
    scope.google = getMaps('success', cachedData);
    const res1 = renderHelper({ cache: 10, cacheKey: CACHE_KEY_1 });
    await actCompat(() => {
      res1.current.setValue('foo');
      vi.runAllTimers();
    });
    scope.google = getMaps();
    await actCompat(() => {
      res1.current.setValue('foo');
      vi.runAllTimers();
    });
    expect(res1.current.suggestions).toEqual({
      ...okSuggestions,
      data: suggestionsFor(cachedData),
    });

    const res2 = renderHelper({ cache: 10, cacheKey: CACHE_KEY_2 });
    await actCompat(() => {
      res2.current.setValue('foo');
      vi.runAllTimers();
    });
    expect(res2.current.suggestions).toEqual(okSuggestions);

    const res3 = renderHelper({ cache: 10, cacheKey: CACHE_KEY_1 });
    await actCompat(() => {
      res3.current.setValue('foo');
      vi.runAllTimers();
    });
    expect(res3.current.suggestions).toEqual({
      ...okSuggestions,
      data: suggestionsFor(cachedData),
    });
  });

  it('should clear cache', async () => {
    const cachedData = [prediction('1119')];
    scope.google = getMaps('success', cachedData);
    let res = renderHelper({ cache: 10 });
    await actCompat(() => {
      res.current.setValue('prev');
      vi.runAllTimers();
    });
    expect(res.current.suggestions).toEqual({
      ...okSuggestions,
      data: suggestionsFor(cachedData),
    });

    scope.google = getMaps();
    res = renderHelper({ cache: 10 });
    res.current.clearCache('other_key');
    await actCompat(() => {
      res.current.setValue('prev');
      vi.runAllTimers();
    });
    expect(res.current.suggestions).toEqual({
      ...okSuggestions,
      data: suggestionsFor(cachedData),
    });

    scope.google = getMaps();
    res = renderHelper({ cache: 10 });
    res.current.clearCache();
    await actCompat(() => {
      res.current.setValue('prev');
      vi.runAllTimers();
    });
    expect(res.current.suggestions).toEqual(okSuggestions);
  });

  it('should clear suggestions', async () => {
    const result = renderHelper();
    await actCompat(() => {
      result.current.setValue('test');
      vi.runAllTimers();
    });
    expect(result.current.suggestions).toEqual(okSuggestions);

    await actCompat(result.current.clearSuggestions);
    expect(result.current.suggestions).toEqual(defaultSuggestions);
  });

  it('should not fetch data if places API not ready', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    delete scope.google;
    const result = renderHelper();
    await actCompat(() => result.current.setValue('test'));
    expect(result.current.suggestions).toEqual(defaultSuggestions);
  });

  it('should lazily init places API', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = renderHelper({ initOnMount: false });
    await actCompat(() => result.current.setValue('test'));
    expect(result.current.suggestions).toEqual(defaultSuggestions);

    result.current.init();
    await actCompat(() => {
      result.current.setValue('test');
      vi.runAllTimers();
    });
    expect(result.current.suggestions).toEqual(okSuggestions);
  });
});
