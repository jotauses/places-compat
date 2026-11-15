import {
  actCompat,
  createFakeGoogle,
  createLegacyFakeGoogle,
  type FakeControl,
  fakeMapsError,
  renderHookCompat,
  type SuggestionJson,
} from '@places-compat/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApiErr, newApiErr } from '../src/messages';
import type { HookArgs, RequestOptions } from '../src/types';
import usePlacesAutocomplete from '../src/usePlacesAutocomplete';
import { getDetails } from '../src/utils';

type FakeOptions = Parameters<typeof createFakeGoogle>[0];

const scope = window as unknown as Record<string, unknown>;
const uninstalls: (() => void)[] = [];

function installed(opts?: FakeOptions) {
  const fake = createFakeGoogle(opts);
  uninstalls.push(fake.install());
  return fake;
}

function renderUpa(initialProps: HookArgs = {}, strict = false) {
  return renderHookCompat((props: HookArgs) => usePlacesAutocomplete(props), {
    initialProps,
    ...(strict ? { strict: true } : {}),
  });
}

function suggestion(placeId: string, text: string): SuggestionJson {
  return { placePrediction: { placeId, text: { text } } };
}

function suggestCalls(control: FakeControl) {
  return control.calls.filter((call) => call.kind === 'suggest');
}

function importCalls(control: FakeControl) {
  return control.calls.filter((call) => call.kind === 'importLibrary');
}

async function advance(ms: number) {
  await actCompat(() => {
    vi.advanceTimersByTime(ms);
  });
}

async function flush() {
  await actCompat(() => {});
}

function silenceErrors() {
  return vi.spyOn(console, 'error').mockImplementation(() => {});
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  while (uninstalls.length > 0) uninstalls.pop()?.();
  delete scope.google;
  delete scope.initMap;
  sessionStorage.clear();
});

describe('defaults', () => {
  it('starts not ready with an empty value and empty suggestions', () => {
    const errors = vi.spyOn(console, 'error');
    const { result } = renderUpa({ initOnMount: false });

    expect(result.current.ready).toBe(false);
    expect(result.current.value).toBe('');
    expect(result.current.suggestions).toEqual({ loading: false, status: '', data: [] });
    expect(errors).not.toHaveBeenCalled();
  });

  it('starts with defaultValue as the value', () => {
    const { result } = renderUpa({ defaultValue: 'Paris', initOnMount: false });

    expect(result.current.value).toBe('Paris');
  });

  it('works when called without arguments', () => {
    installed();
    const { result } = renderHookCompat(() => usePlacesAutocomplete());

    expect(result.current.ready).toBe(true);
    expect(result.current.value).toBe('');
  });
});

describe('init', () => {
  it('is ready at once with a googleMaps option that has the new API', () => {
    const fake = createFakeGoogle();
    const { result } = renderUpa({ googleMaps: fake.google.maps });

    expect(result.current.ready).toBe(true);
    expect(importCalls(fake.control)).toHaveLength(0);
  });

  it('is ready at once with a global google.maps that has the new API', () => {
    installed();
    const { result } = renderUpa();

    expect(result.current.ready).toBe(true);
  });

  it('falls back to the global when the googleMaps option has no places library', async () => {
    vi.useFakeTimers();
    const partial = createFakeGoogle({ places: 'absent', importLibrary: false });
    const global = installed();
    global.control.onSuggest('par', [suggestion('p1', 'Paris, France')]);
    const errors = silenceErrors();
    const { result } = renderUpa({ googleMaps: partial.google.maps });

    expect(result.current.ready).toBe(true);
    await actCompat(() => result.current.setValue('par'));
    await advance(200);

    expect(suggestCalls(global.control)).toHaveLength(1);
    expect(result.current.suggestions.status).toBe('OK');
    expect(errors).not.toHaveBeenCalled();
  });

  it('prefers a ready global over loading through the googleMaps option', () => {
    const lazy = createFakeGoogle({ places: 'viaImportLibrary' });
    installed();
    const { result } = renderUpa({ googleMaps: lazy.google.maps });

    expect(result.current.ready).toBe(true);
    expect(importCalls(lazy.control)).toHaveLength(0);
  });

  it('loads the places library through importLibrary and then becomes ready', async () => {
    const fake = installed({ places: 'viaImportLibrary' });
    const { result } = renderUpa();

    expect(result.current.ready).toBe(false);
    await flush();

    expect(result.current.ready).toBe(true);
    expect(importCalls(fake.control).map((call) => call.request)).toEqual(['places']);
  });

  it('loads through the googleMaps option before the global when both have importLibrary', async () => {
    const option = createFakeGoogle({ places: 'viaImportLibrary' });
    const global = installed({ places: 'viaImportLibrary' });
    const { result } = renderUpa({ googleMaps: option.google.maps });
    await flush();

    expect(result.current.ready).toBe(true);
    expect(importCalls(option.control)).toHaveLength(1);
    expect(importCalls(global.control)).toHaveLength(0);
  });

  it('loads through the global when the googleMaps option has no importLibrary', async () => {
    const option = createFakeGoogle({ places: 'absent', importLibrary: false });
    const global = installed({ places: 'viaImportLibrary' });
    const { result } = renderUpa({ googleMaps: option.google.maps });
    await flush();

    expect(result.current.ready).toBe(true);
    expect(importCalls(global.control)).toHaveLength(1);
  });

  it('logs the new API message once and stays not ready when importLibrary rejects', async () => {
    const errors = silenceErrors();
    installed({ places: 'absent' });
    const { result } = renderUpa();
    await flush();

    expect(result.current.ready).toBe(false);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledWith(newApiErr);
  });

  it('logs the new API message when importLibrary resolves a library without the new API', async () => {
    const errors = silenceErrors();
    installed({ places: 'legacyOnly' });
    const { result } = renderUpa();
    await flush();

    expect(result.current.ready).toBe(false);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledWith(newApiErr);
  });

  it('logs the new API message when only the legacy library is present and there is no importLibrary', () => {
    const errors = silenceErrors();
    const legacy = createLegacyFakeGoogle();
    uninstalls.push(legacy.install());
    const { result } = renderUpa();

    expect(result.current.ready).toBe(false);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledWith(newApiErr);
  });

  it('logs the load message exactly when there is no google at all', () => {
    const errors = silenceErrors();
    const { result } = renderUpa();

    expect(result.current.ready).toBe(false);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledWith(loadApiErr);
    expect(newApiErr.startsWith(`${loadApiErr}\n`)).toBe(true);
  });

  it('logs the load message when google.maps has neither places nor importLibrary', () => {
    const errors = silenceErrors();
    installed({ places: 'absent', importLibrary: false });
    const { result } = renderUpa();

    expect(result.current.ready).toBe(false);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledWith(loadApiErr);
  });

  it('does nothing more when init is called again after it became ready', async () => {
    const errors = silenceErrors();
    const fake = installed({ places: 'viaImportLibrary' });
    const { result } = renderUpa();
    await flush();
    await actCompat(() => result.current.init());
    await actCompat(() => result.current.init());

    expect(result.current.ready).toBe(true);
    expect(importCalls(fake.control)).toHaveLength(1);
    expect(errors).not.toHaveBeenCalled();
  });

  it('does not call importLibrary twice when init runs again during a load', async () => {
    const fake = installed({ places: 'viaImportLibrary' });
    const { result } = renderUpa();
    result.current.init();
    result.current.init();
    await flush();

    expect(result.current.ready).toBe(true);
    expect(importCalls(fake.control)).toHaveLength(1);
  });

  it('never goes back to not ready once ready', async () => {
    const errors = silenceErrors();
    const fake = createFakeGoogle();
    const { result, rerender } = renderUpa({ googleMaps: fake.google.maps });
    expect(result.current.ready).toBe(true);

    rerender({});
    await actCompat(() => result.current.init());

    expect(result.current.ready).toBe(true);
    expect(errors).not.toHaveBeenCalled();
  });

  it('does not update state when the load finishes after unmount', async () => {
    const errors = silenceErrors();
    const fake = installed({ places: 'viaImportLibrary' });
    const { unmount } = renderUpa();
    unmount();
    await flush();

    expect(importCalls(fake.control)).toHaveLength(1);
    expect(errors).not.toHaveBeenCalled();
  });

  it('does not update state when init is called on a loaded hook after unmount', async () => {
    const errors = vi.spyOn(console, 'error');
    installed();
    const { result, unmount } = renderUpa();
    const last = result.current;
    expect(last.ready).toBe(true);

    unmount();
    await actCompat(() => last.init());

    expect(result.current).toBe(last);
    expect(errors).not.toHaveBeenCalled();
  });
});

describe('mount effect', () => {
  it('does nothing with initOnMount false until init is called', async () => {
    const fake = installed({ places: 'viaImportLibrary' });
    const { result } = renderUpa({ initOnMount: false, callbackName: 'initMap' });
    await flush();

    expect(result.current.ready).toBe(false);
    expect(fake.control.calls).toHaveLength(0);
    expect(scope.initMap).toBeUndefined();

    await actCompat(() => result.current.init());

    expect(result.current.ready).toBe(true);
  });

  it('exposes init as window[callbackName] when google is not loaded yet', async () => {
    const errors = silenceErrors();
    const { result } = renderUpa({ callbackName: 'initMap' });

    expect(scope.initMap).toBe(result.current.init);
    expect(result.current.ready).toBe(false);
    expect(errors).not.toHaveBeenCalled();

    installed();
    await actCompat(() => (scope.initMap as () => void)());

    expect(result.current.ready).toBe(true);
  });

  it('deletes window[callbackName] on unmount even when another instance set it', () => {
    const first = renderUpa({ callbackName: 'initMap' });
    const second = renderUpa({ callbackName: 'initMap' });

    expect(scope.initMap).toBe(second.result.current.init);
    first.unmount();

    expect(scope.initMap).toBeUndefined();
    second.unmount();
    expect(scope.initMap).toBeUndefined();
  });

  it('runs init directly when google is present, even with a callbackName', () => {
    installed();
    const { result } = renderUpa({ callbackName: 'initMap' });

    expect(result.current.ready).toBe(true);
    expect(scope.initMap).toBeUndefined();
  });

  it('runs init directly when only the googleMaps option is given with a callbackName', () => {
    const fake = createFakeGoogle();
    const { result } = renderUpa({ googleMaps: fake.google.maps, callbackName: 'initMap' });

    expect(result.current.ready).toBe(true);
    expect(scope.initMap).toBeUndefined();
  });
});

describe('setValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('updates the value but does not search while not ready', async () => {
    const fake = installed();
    const { result } = renderUpa({ initOnMount: false });
    await actCompat(() => result.current.setValue('par'));
    await advance(200);

    expect(result.current.value).toBe('par');
    expect(suggestCalls(fake.control)).toHaveLength(0);
    expect(result.current.suggestions).toEqual({ loading: false, status: '', data: [] });
  });

  it('updates the value without searching when shouldFetchData is false', async () => {
    const fake = installed();
    const { result } = renderUpa();
    await actCompat(() => result.current.setValue('par', false));
    await advance(200);

    expect(result.current.value).toBe('par');
    expect(suggestCalls(fake.control)).toHaveLength(0);
    expect(result.current.suggestions.loading).toBe(false);
  });

  it('clears the suggestions after the delay when the value is empty', async () => {
    const fake = installed();
    fake.control.onSuggest('par', [suggestion('p1', 'Paris, France')]);
    const { result } = renderUpa();
    await actCompat(() => result.current.setValue('par'));
    await advance(200);
    expect(result.current.suggestions.data).toHaveLength(1);

    await actCompat(() => result.current.setValue(''));
    expect(result.current.value).toBe('');
    expect(result.current.suggestions.data).toHaveLength(1);

    await advance(200);

    expect(result.current.suggestions).toEqual({ loading: false, status: '', data: [] });
    expect(suggestCalls(fake.control)).toHaveLength(1);
  });

  it('sets loading only once the debounce delay has passed', async () => {
    const fake = installed();
    fake.control.onSuggest('par', [suggestion('p1', 'Paris, France')], { deferred: true });
    const { result } = renderUpa();

    await actCompat(() => result.current.setValue('par'));
    expect(result.current.suggestions.loading).toBe(false);

    await advance(199);
    expect(result.current.suggestions.loading).toBe(false);
    expect(suggestCalls(fake.control)).toHaveLength(0);

    await advance(1);
    expect(result.current.suggestions.loading).toBe(true);
    expect(suggestCalls(fake.control)).toHaveLength(1);

    await actCompat(() => fake.control.pending[0]?.resolve());
    expect(result.current.suggestions.loading).toBe(false);
    expect(result.current.suggestions.status).toBe('OK');
    expect(result.current.suggestions.data.map((item) => item.place_id)).toEqual(['p1']);
    expect(result.current.suggestions.data[0]?.description).toBe('Paris, France');
  });

  it('sends requestOptions plus the input, with legacy keys translated', async () => {
    const fake = installed();
    const requestOptions = {
      componentRestrictions: { country: ['fr', 'be'] },
      types: ['address'],
      language: 'fr',
      region: 'uk',
      radius: 100,
      unknownKey: true,
    } as unknown as RequestOptions;
    const { result } = renderUpa({ requestOptions });
    await actCompat(() => result.current.setValue('rue'));
    await advance(200);

    expect(suggestCalls(fake.control).map((call) => call.request)).toEqual([
      {
        input: 'rue',
        includedRegionCodes: ['fr', 'be'],
        includedPrimaryTypes: ['street_address', 'premise', 'subpremise', 'route'],
        language: 'fr',
        region: 'gb',
      },
    ]);
  });

  it('uses the latest requestOptions when the debounced search runs', async () => {
    const fake = installed();
    const { result, rerender } = renderUpa({ requestOptions: { language: 'en' } });
    await actCompat(() => result.current.setValue('par'));
    rerender({ requestOptions: { language: 'fr' } });
    await advance(200);

    expect(suggestCalls(fake.control).map((call) => call.request)).toEqual([
      { input: 'par', language: 'fr' },
    ]);
  });

  it.each([
    ['ZERO_RESULTS', [] as SuggestionJson[]],
    ['INVALID_REQUEST', fakeMapsError('INVALID_ARGUMENT')],
    ['REQUEST_DENIED', fakeMapsError('PERMISSION_DENIED')],
  ] as const)('reports %s with empty data, without throwing or logging', async (status, reply) => {
    const errors = vi.spyOn(console, 'error');
    const warnings = vi.spyOn(console, 'warn');
    const fake = installed();
    fake.control.onSuggest('ok', [suggestion('p1', 'Paris, France')]);
    fake.control.onSuggest('bad', reply);
    const { result } = renderUpa();
    await actCompat(() => result.current.setValue('ok'));
    await advance(200);
    expect(result.current.suggestions.data).toHaveLength(1);

    await actCompat(() => result.current.setValue('bad'));
    await advance(200);

    expect(result.current.suggestions).toEqual({ loading: false, status, data: [] });
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  });

  it('clearSuggestions resets the suggestions and keeps the value', async () => {
    const fake = installed();
    fake.control.onSuggest('par', [suggestion('p1', 'Paris, France')]);
    const { result } = renderUpa();
    await actCompat(() => result.current.setValue('par'));
    await advance(200);
    await actCompat(() => result.current.clearSuggestions());

    expect(result.current.value).toBe('par');
    expect(result.current.suggestions).toEqual({ loading: false, status: '', data: [] });
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('keeps the old delay when only the debounce prop changes', async () => {
    const fake = installed();
    const { result, rerender } = renderUpa({ debounce: 100 });
    rerender({ debounce: 500 });
    await actCompat(() => result.current.setValue('par'));
    await advance(100);

    expect(suggestCalls(fake.control)).toHaveLength(1);
  });

  it('applies a new delay when debounce changes together with cacheKey', async () => {
    const fake = installed();
    const { result, rerender } = renderUpa({ debounce: 100 });
    rerender({ debounce: 500, cacheKey: 'other' });
    await actCompat(() => result.current.setValue('par'));
    await advance(499);
    expect(suggestCalls(fake.control)).toHaveLength(0);

    await advance(1);
    expect(suggestCalls(fake.control)).toHaveLength(1);
  });

  it('applies a new delay when debounce changes together with cache', async () => {
    const fake = installed();
    const { result, rerender } = renderUpa({ debounce: 100 });
    rerender({ debounce: 500, cache: 60 });
    await actCompat(() => result.current.setValue('par'));
    await advance(499);
    expect(suggestCalls(fake.control)).toHaveLength(0);

    await advance(1);
    expect(suggestCalls(fake.control)).toHaveLength(1);
  });

  it('searches once with the last value when typing within the delay', async () => {
    const fake = installed();
    const { result } = renderUpa();
    await actCompat(() => result.current.setValue('p'));
    await advance(100);
    await actCompat(() => result.current.setValue('pa'));
    await advance(100);
    await actCompat(() => result.current.setValue('par'));
    await advance(200);

    expect(
      suggestCalls(fake.control).map((call) => (call.request as { input: string }).input),
    ).toEqual(['par']);
  });
});

describe('responses', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('ignores an earlier response that arrives after a later one', async () => {
    const fake = installed();
    fake.control.onSuggest('pa', [suggestion('p1', 'Panama')], { deferred: true });
    fake.control.onSuggest('par', [suggestion('p2', 'Paris, France')], { deferred: true });
    const { result } = renderUpa({ cache: false });
    await actCompat(() => result.current.setValue('pa'));
    await advance(200);
    await actCompat(() => result.current.setValue('par'));
    await advance(200);
    expect(fake.control.pending).toHaveLength(2);

    await actCompat(() => fake.control.pending[1]?.resolve());
    expect(result.current.suggestions.data.map((item) => item.place_id)).toEqual(['p2']);

    await actCompat(() => fake.control.pending[0]?.resolve());
    expect(result.current.suggestions).toMatchObject({ loading: false, status: 'OK' });
    expect(result.current.suggestions.data.map((item) => item.place_id)).toEqual(['p2']);
  });

  it('caches but does not show a response that arrives after unmount, without React warnings', async () => {
    const errors = vi.spyOn(console, 'error');
    const fake = installed();
    fake.control.onSuggest('par', [suggestion('p1', 'Paris, France')], { deferred: true });
    let renders = 0;
    const { result, unmount } = renderHookCompat(() => {
      renders += 1;
      return usePlacesAutocomplete();
    });
    await actCompat(() => result.current.setValue('par'));
    await advance(200);
    const before = result.current.suggestions;
    const rendersBefore = renders;
    expect(before).toEqual({ loading: true, status: '', data: [] });

    unmount();
    await actCompat(() => fake.control.pending[0]?.resolve());

    expect(result.current.suggestions).toBe(before);
    expect(renders).toBe(rendersBefore);
    expect(errors).not.toHaveBeenCalled();
    const stored = JSON.parse(sessionStorage.getItem('upa') ?? 'null') as Record<
      string,
      { data: { place_id: string }[]; maxAge: number }
    >;
    expect(Object.keys(stored)).toEqual(['par']);
    expect(stored.par?.data.map((item) => item.place_id)).toEqual(['p1']);
  });

  it('does not run a debounced search that is pending at unmount', async () => {
    const errors = vi.spyOn(console, 'error');
    const fake = installed();
    const { result, unmount } = renderUpa();
    await actCompat(() => result.current.setValue('par'));
    unmount();
    await advance(200);

    expect(suggestCalls(fake.control)).toHaveLength(0);
    expect(errors).not.toHaveBeenCalled();
  });
});

describe('sessions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('fetches details through the prediction, with the token given in requestOptions', async () => {
    const fake = installed();
    fake.control.onSuggest('par', [suggestion('p1', 'Paris, France')]);
    fake.control.onFetchFields('p1', { id: 'p1', displayName: 'Paris' });
    const sessionToken = new fake.google.maps.places.AutocompleteSessionToken();
    const { result } = renderUpa({ requestOptions: { sessionToken } });
    await actCompat(() => result.current.setValue('par'));
    await advance(200);

    const [suggest] = suggestCalls(fake.control);
    const tokenId = suggest?.tokenId;
    expect(tokenId).toEqual(expect.any(String));
    expect(fake.control.sessions.get(tokenId as string)?.closed).toBe(false);

    await expect(getDetails({ placeId: 'p1', fields: ['name'] })).resolves.toEqual({
      name: 'Paris',
    });

    const detailCalls = fake.control.calls.filter(
      (call) => call.kind === 'toPlace' || call.kind === 'fetchFields',
    );
    expect(detailCalls.map(({ kind, tokenId: id }) => ({ kind, id }))).toEqual([
      { kind: 'toPlace', id: tokenId },
      { kind: 'fetchFields', id: tokenId },
    ]);
    expect(fake.control.sessions.get(tokenId as string)).toEqual({
      suggest: 1,
      fetchFields: 1,
      closed: true,
    });
  });

  it('fetches details for a prediction served from the cache without a prediction object', async () => {
    const first = installed();
    first.control.onSuggest('par', [suggestion('p1', 'Paris, France')]);
    const earlier = renderUpa();
    await actCompat(() => earlier.result.current.setValue('par'));
    await advance(200);
    expect(earlier.result.current.suggestions.status).toBe('OK');
    earlier.unmount();
    uninstalls.pop()?.();

    const fake = installed();
    fake.control.onFetchFields('p1', { id: 'p1', displayName: 'Paris' });
    const { result } = renderUpa();
    await actCompat(() => result.current.setValue('par'));
    await advance(200);

    expect(suggestCalls(fake.control)).toHaveLength(0);
    expect(result.current.suggestions.data.map((item) => item.place_id)).toEqual(['p1']);

    await expect(getDetails({ placeId: 'p1', fields: ['name'] })).resolves.toEqual({
      name: 'Paris',
    });
    expect(fake.control.calls.map((call) => call.kind)).toEqual(['fetchFields']);
    expect(fake.control.calls[0]?.tokenId).toBeUndefined();
  });
});

describe('StrictMode', () => {
  it('becomes ready and searches once per setValue', async () => {
    vi.useFakeTimers();
    const fake = installed();
    const { result } = renderUpa({}, true);

    expect(result.current.ready).toBe(true);
    await actCompat(() => result.current.setValue('pa'));
    await advance(200);
    expect(suggestCalls(fake.control)).toHaveLength(1);

    await actCompat(() => result.current.setValue('par'));
    await advance(200);
    expect(suggestCalls(fake.control)).toHaveLength(2);
  });

  it('becomes ready after an importLibrary load', async () => {
    const fake = installed({ places: 'viaImportLibrary' });
    const { result } = renderUpa({}, true);
    await flush();

    expect(result.current.ready).toBe(true);
    expect(importCalls(fake.control)).toHaveLength(1);
  });
});
