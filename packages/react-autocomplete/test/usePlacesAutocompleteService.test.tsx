import { NEW_API_HINT } from '@places-compat/core';
import {
  actCompat,
  applyFixture,
  createFakeGoogle,
  type FakeControl,
  loadFixture,
  renderCompat,
  renderHookCompat,
} from '@places-compat/core/testing';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import {
  GOOGLE_MAP_SCRIPT_BASE_URL,
  GOOGLE_NOT_FOUND,
  PLACES_NOT_LOADED,
  SCRIPT_CALLBACK,
} from '../src/constants';
import type { usePlacesAutocompleteServiceConfig } from '../src/types';
import usePlacesAutocompleteService from '../src/usePlacesAutocompleteService';
import { isBrowser } from '../src/utils';

vi.mock('../src/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils')>();
  return { ...actual, isBrowser: vi.fn(actual.isBrowser) };
});

type Config = usePlacesAutocompleteServiceConfig;
type Result = ReturnType<typeof usePlacesAutocompleteService>;

const BASE = GOOGLE_MAP_SCRIPT_BASE_URL;

let uninstall: (() => void) | undefined;
let errorSpy: MockInstance<typeof console.error>;

function install(opts: Parameters<typeof createFakeGoogle>[0] = {}) {
  const fake = createFakeGoogle(opts);
  uninstall = fake.install();
  return fake;
}

function render(config: Config, opts: { strict?: boolean } = {}) {
  const seen: Result[] = [];
  const handle = renderHookCompat(
    (props: Config) => {
      const result = usePlacesAutocompleteService(props);
      seen.push(result);
      return result;
    },
    { initialProps: config, ...opts },
  );
  return { ...handle, seen };
}

function callsOf(control: FakeControl, kind: FakeControl['calls'][number]['kind']) {
  return control.calls.filter((call) => call.kind === kind);
}

function suggestRequests(control: FakeControl) {
  return callsOf(control, 'suggest').map(
    (call) => call.request as google.maps.places.AutocompleteRequest,
  );
}

function flush(): Promise<void> {
  return actCompat(() => {});
}

function advance(ms: number): Promise<void> {
  return actCompat(() => {
    vi.advanceTimersByTime(ms);
  });
}

function act(fn: () => void): Promise<void> {
  return actCompat(fn);
}

function injectedScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll('script'));
}

function scriptCallback(): () => void {
  return (window as unknown as Record<string, () => void>)[SCRIPT_CALLBACK] as () => void;
}

beforeEach(() => {
  vi.useFakeTimers();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(isBrowser).mockRestore();
  errorSpy.mockRestore();
  uninstall?.();
  uninstall = undefined;
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>)[SCRIPT_CALLBACK];
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('usePlacesAutocompleteService loading', () => {
  it('returns the original shape before anything loads', async () => {
    const { result, seen } = render({});
    await flush();
    expect(seen[0]).toEqual({
      placesService: null,
      autocompleteSessionToken: null,
      placesAutocompleteService: null,
      placePredictions: [],
      isPlacePredictionsLoading: false,
      getPlacePredictions: expect.any(Function),
      queryPredictions: [],
      isQueryPredictionsLoading: false,
      getQueryPredictions: expect.any(Function),
      refreshSessionToken: expect.any(Function),
    });
    expect(Object.keys(result.current)).toEqual(Object.keys(seen[0] as Result));
  });

  it('builds the services on mount without an api key and re-renders', async () => {
    const fake = install();
    const { result, seen } = render({});
    await flush();
    expect(seen[0]?.placesAutocompleteService).toBeNull();
    expect(seen[0]?.placesService).toBeNull();
    expect(result.current.placesAutocompleteService).not.toBeNull();
    expect(typeof result.current.placesAutocompleteService?.getPlacePredictions).toBe('function');
    expect(typeof result.current.placesService?.getDetails).toBe('function');
    expect(result.current.autocompleteSessionToken).toBeNull();
    expect(injectedScripts()).toHaveLength(0);
    expect(callsOf(fake.control, 'newToken')).toHaveLength(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('keeps the service instances across renders', async () => {
    install();
    const { result, rerender } = render({});
    await flush();
    const first = result.current;
    rerender({});
    expect(result.current.placesAutocompleteService).toBe(first.placesAutocompleteService);
    expect(result.current.placesService).toBe(first.placesService);
  });

  it('injects the script with an api key and builds once the callback runs', async () => {
    install();
    const { result } = render({ apiKey: 'test-key' });
    await flush();
    const scripts = injectedScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.src).toBe(
      `${BASE}?key=test-key&libraries=places&callback=${SCRIPT_CALLBACK}`,
    );
    expect(result.current.placesAutocompleteService).toBeNull();
    await act(() => scriptCallback()());
    expect(result.current.placesAutocompleteService).not.toBeNull();
    expect(result.current.placesService).not.toBeNull();
  });

  it('builds the script url by interpolation, leaving the key unencoded', async () => {
    render({
      apiKey: 'a&loading=async',
      libraries: ['places', 'geometry'],
      language: 'fr',
      googleMapsScriptBaseUrl: 'https://maps.example.test/js',
    });
    await flush();
    expect(injectedScripts()[0]?.src).toBe(
      `https://maps.example.test/js?key=a&loading=async&libraries=places%2Cgeometry&language=fr&callback=${SCRIPT_CALLBACK}`,
    );
  });

  it('skips the script when google.maps.api is already there', async () => {
    install({ mapsApiFlag: true });
    const { result } = render({ apiKey: 'test-key' });
    await flush();
    expect(injectedScripts()).toHaveLength(0);
    expect(result.current.placesAutocompleteService).not.toBeNull();
  });

  it('loads the places library through importLibrary', async () => {
    const fake = install({ places: 'viaImportLibrary' });
    const { result } = render({});
    expect(result.current.placesAutocompleteService).toBeNull();
    await flush();
    expect(callsOf(fake.control, 'importLibrary')).toHaveLength(1);
    expect(result.current.placesAutocompleteService).not.toBeNull();
  });

  it('logs the original error when google is missing', async () => {
    const { result } = render({});
    await flush();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(GOOGLE_NOT_FOUND);
    expect(result.current.placesAutocompleteService).toBeNull();
  });

  it('logs the original error when the places library is missing', async () => {
    install({ places: 'absent' });
    const { result } = render({});
    await flush();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(PLACES_NOT_LOADED);
    expect(result.current.placesService).toBeNull();
  });

  it('adds the hint when only the legacy places library is available', async () => {
    install({ places: 'legacyOnly' });
    render({});
    await flush();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(`${PLACES_NOT_LOADED}\n${NEW_API_HINT}`);
  });

  it('does nothing when the script loads after unmount', async () => {
    const { unmount } = render({ apiKey: 'test-key' });
    await flush();
    unmount();
    await act(() => scriptCallback()());
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('drops a library that finishes importing after unmount', async () => {
    const fake = install({ places: 'viaImportLibrary' });
    const { result, unmount } = render({ sessionToken: true });
    unmount();
    await flush();
    expect(callsOf(fake.control, 'importLibrary')).toHaveLength(1);
    expect(callsOf(fake.control, 'newToken')).toHaveLength(0);
    expect(result.current.placesAutocompleteService).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('builds the services once in StrictMode', async () => {
    const fake = install();
    const { result } = render({ sessionToken: true }, { strict: true });
    await flush();
    expect(result.current.placesAutocompleteService).not.toBeNull();
    expect(callsOf(fake.control, 'newToken')).toHaveLength(1);
  });

  it('skips loading outside a browser', async () => {
    install();
    vi.mocked(isBrowser).mockReturnValue(false);
    const { result } = render({ apiKey: 'test-key' });
    await flush();
    expect(result.current.placesAutocompleteService).toBeNull();
    expect(injectedScripts()).toHaveLength(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('usePlacesAutocompleteService place predictions', () => {
  it('debounces requests by 300 ms and returns the predictions', async () => {
    const fake = install();
    const fixture = loadFixture('paris-geocode');
    applyFixture(fake.control, fixture);
    const { result } = render({});
    await flush();

    await act(() => result.current.getPlacePredictions({ input: 'Paris' }));
    expect(result.current.isPlacePredictionsLoading).toBe(true);
    expect(result.current.placePredictions).toEqual([]);

    await advance(299);
    expect(suggestRequests(fake.control)).toHaveLength(0);
    await advance(1);
    expect(suggestRequests(fake.control)).toEqual([{ input: 'Paris' }]);
    expect(result.current.isPlacePredictionsLoading).toBe(false);
    expect(result.current.placePredictions.map((p) => p.place_id)).toEqual(
      fixture.legacy.predictions.map((p) => p.place_id),
    );
    expect(result.current.placePredictions[0]?.description).toBe('Paris, France');
  });

  it('sends only the last input typed within the delay', async () => {
    const fake = install();
    const { result } = render({});
    await flush();
    await act(() => result.current.getPlacePredictions({ input: 'Pa' }));
    await advance(200);
    await act(() => result.current.getPlacePredictions({ input: 'Par' }));
    await advance(300);
    expect(suggestRequests(fake.control).map((r) => r.input)).toEqual(['Par']);
  });

  it('honours a custom debounce', async () => {
    const fake = install();
    const { result } = render({ debounce: 50 });
    await flush();
    await act(() => result.current.getPlacePredictions({ input: 'Paris' }));
    await advance(49);
    expect(suggestRequests(fake.control)).toHaveLength(0);
    await advance(1);
    expect(suggestRequests(fake.control)).toHaveLength(1);
  });

  it('uses the new delay when debounce changes and still sends the old request', async () => {
    const fake = install();
    const { result, rerender } = render({ debounce: 500 });
    await flush();
    await act(() => result.current.getPlacePredictions({ input: 'Old' }));
    rerender({ debounce: 100 });
    await act(() => result.current.getPlacePredictions({ input: 'New' }));
    await advance(100);
    expect(suggestRequests(fake.control).map((r) => r.input)).toEqual(['New']);
    await advance(500);
    expect(suggestRequests(fake.control).map((r) => r.input)).toEqual(['New', 'Old']);
  });

  it('settles a request left waiting when only debounce changes', async () => {
    const fake = install();
    applyFixture(fake.control, loadFixture('paris-geocode'));
    const { result, rerender } = render({ debounce: 500 });
    await flush();
    await act(() => result.current.getPlacePredictions({ input: 'Paris' }));
    await act(() => result.current.getQueryPredictions({ input: 'Paris' }));
    rerender({ debounce: 100 });
    await advance(2000);
    expect(result.current.isPlacePredictionsLoading).toBe(false);
    expect(result.current.placePredictions).toHaveLength(5);
    expect(result.current.isQueryPredictionsLoading).toBe(false);
    expect(result.current.queryPredictions).toHaveLength(5);
  });

  it('cancels the requests of every debounce delay on unmount', async () => {
    const fake = install();
    const { result, rerender, unmount } = render({ debounce: 500 });
    await flush();
    await act(() => result.current.getPlacePredictions({ input: 'Old' }));
    rerender({ debounce: 100 });
    await act(() => result.current.getQueryPredictions({ input: 'New' }));
    unmount();
    await advance(1000);
    expect(suggestRequests(fake.control)).toHaveLength(0);
  });

  it('clears the predictions on an empty input without calling the service', async () => {
    const fake = install();
    applyFixture(fake.control, loadFixture('paris-geocode'));
    const { result } = render({});
    await flush();
    await act(() => result.current.getPlacePredictions({ input: 'Paris' }));
    await advance(300);
    expect(result.current.placePredictions).toHaveLength(5);

    await act(() => result.current.getPlacePredictions({ input: '' }));
    expect(result.current.placePredictions).toEqual([]);
    expect(result.current.isPlacePredictionsLoading).toBe(false);
    await advance(300);
    expect(suggestRequests(fake.control)).toHaveLength(1);
  });

  it('cancels a pending request when an empty input follows', async () => {
    const fake = install();
    const { result } = render({});
    await flush();
    await act(() => result.current.getPlacePredictions({ input: 'Paris' }));
    await act(() => result.current.getPlacePredictions({ input: '' }));
    await advance(300);
    expect(suggestRequests(fake.control)).toHaveLength(0);
    expect(result.current.isPlacePredictionsLoading).toBe(false);
  });

  it('settles on an empty list when the service fails', async () => {
    const fake = install();
    fake.control.onSuggest('Paris', new Error('boom'));
    const { result } = render({});
    await flush();
    await act(() => result.current.getPlacePredictions({ input: 'Paris' }));
    await advance(300);
    expect(result.current.isPlacePredictionsLoading).toBe(false);
    expect(result.current.placePredictions).toEqual([]);
  });

  it('keeps loading when called before the services exist', async () => {
    const fake = install();
    const { result } = render({ apiKey: 'test-key' });
    await act(() => result.current.getPlacePredictions({ input: 'Paris' }));
    await advance(300);
    expect(suggestRequests(fake.control)).toHaveLength(0);
    expect(result.current.isPlacePredictionsLoading).toBe(true);
  });

  it('merges the hook options under the call options', async () => {
    const fake = install();
    const { result } = render({ options: { input: 'ignored', language: 'en', region: 'fr' } });
    await flush();
    await act(() => result.current.getPlacePredictions({ input: 'Paris', language: 'de' }));
    await advance(300);
    expect(suggestRequests(fake.control)).toEqual([
      { input: 'Paris', language: 'de', region: 'fr' },
    ]);
  });

  it('reads the current options after a rerender', async () => {
    const fake = install();
    const { result, rerender } = render({ options: { input: '', language: 'en' } });
    await flush();
    await act(() => result.current.getPlacePredictions({ input: 'Paris' }));
    rerender({ options: { input: '', language: 'fr' } });
    await advance(300);
    rerender({ options: { input: '', language: 'es' } });
    await act(() => result.current.getPlacePredictions({ input: 'Madrid' }));
    await advance(300);
    expect(suggestRequests(fake.control).map((r) => [r.input, r.language])).toEqual([
      ['Paris', 'fr'],
      ['Madrid', 'es'],
    ]);
  });

  it('ignores a response that arrives after unmount', async () => {
    const fake = install();
    fake.control.onSuggest('Paris', loadFixture('paris-geocode').new.suggestions, {
      deferred: true,
    });
    const { result, unmount } = render({});
    await flush();
    await act(() => result.current.getPlacePredictions({ input: 'Paris' }));
    await advance(300);
    expect(fake.control.pending).toHaveLength(1);
    const before = result.current;
    unmount();
    await act(() => fake.control.pending[0]?.resolve());
    expect(result.current).toBe(before);
    expect(result.current.isPlacePredictionsLoading).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('cancels the debounce on unmount', async () => {
    const fake = install();
    const { result, unmount } = render({});
    await flush();
    await act(() => result.current.getPlacePredictions({ input: 'Paris' }));
    unmount();
    await advance(300);
    expect(suggestRequests(fake.control)).toHaveLength(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('usePlacesAutocompleteService query predictions', () => {
  it('returns place predictions through getQueryPredictions', async () => {
    const fake = install();
    const fixture = loadFixture('paris-geocode');
    applyFixture(fake.control, fixture);
    const { result } = render({ debounce: 10 });
    await flush();
    expect(result.current.queryPredictions).toEqual([]);

    await act(() => result.current.getQueryPredictions({ input: 'Paris' }));
    expect(result.current.isQueryPredictionsLoading).toBe(true);
    expect(result.current.isPlacePredictionsLoading).toBe(false);
    await advance(10);
    expect(result.current.isQueryPredictionsLoading).toBe(false);
    expect(result.current.queryPredictions.map((p) => p.place_id)).toEqual(
      fixture.legacy.predictions.map((p) => p.place_id),
    );
    expect(result.current.placePredictions).toEqual([]);

    await act(() => result.current.getQueryPredictions({ input: '' }));
    expect(result.current.queryPredictions).toEqual([]);
    expect(result.current.isQueryPredictionsLoading).toBe(false);
    await advance(10);
    expect(suggestRequests(fake.control)).toHaveLength(1);
  });

  it('settles on an empty list when the query fails', async () => {
    const fake = install();
    const { result } = render({});
    await flush();
    await act(() => result.current.getQueryPredictions({ input: 'Nowhere' }));
    await advance(300);
    expect(suggestRequests(fake.control)).toHaveLength(1);
    expect(result.current.isQueryPredictionsLoading).toBe(false);
    expect(result.current.queryPredictions).toEqual([]);
  });

  it('ignores a query response after unmount', async () => {
    const fake = install();
    fake.control.onSuggest('Paris', [], { deferred: true });
    const { result, unmount } = render({});
    await flush();
    await act(() => result.current.getQueryPredictions({ input: 'Paris' }));
    await advance(300);
    unmount();
    await act(() => fake.control.pending[0]?.resolve());
    expect(result.current.isQueryPredictionsLoading).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

const Activity = (React as { Activity?: React.ComponentType<React.ActivityProps> }).Activity;

function Probe({ config, latest }: { config: Config; latest: { current: Result | null } }) {
  latest.current = usePlacesAutocompleteService(config);
  return null;
}

function renderInActivity(config: Config) {
  const latest: { current: Result | null } = { current: null };
  const Boundary = Activity as React.ComponentType<React.ActivityProps>;
  const tree = (mode: 'visible' | 'hidden') => (
    <Boundary mode={mode}>
      <Probe config={config} latest={latest} />
    </Boundary>
  );
  const view = renderCompat(tree('visible'));
  const setMode = (mode: 'visible' | 'hidden') => act(() => view.rerender(tree(mode)));
  return { latest, setMode };
}

describe.skipIf(!Activity)('usePlacesAutocompleteService hidden and shown again', () => {
  it('settles requests left waiting in the debounce while the hook was hidden', async () => {
    const fake = install();
    applyFixture(fake.control, loadFixture('paris-geocode'));
    const { latest, setMode } = renderInActivity({});
    await flush();
    await act(() => latest.current?.getPlacePredictions({ input: 'Paris' }));
    await act(() => latest.current?.getQueryPredictions({ input: 'Paris' }));
    await setMode('hidden');
    await advance(300);
    await setMode('visible');
    await advance(300);
    await flush();
    expect(latest.current?.isPlacePredictionsLoading).toBe(false);
    expect(latest.current?.placePredictions).toHaveLength(5);
    expect(latest.current?.isQueryPredictionsLoading).toBe(false);
    expect(latest.current?.queryPredictions).toHaveLength(5);
  });

  it('sends again a request whose response arrived while the hook was hidden', async () => {
    const fake = install();
    fake.control.onSuggest('Paris', loadFixture('paris-geocode').new.suggestions, {
      deferred: true,
    });
    const { latest, setMode } = renderInActivity({});
    await flush();
    await act(() => latest.current?.getPlacePredictions({ input: 'Paris' }));
    await advance(300);
    expect(fake.control.pending).toHaveLength(1);
    await setMode('hidden');
    await act(() => fake.control.pending[0]?.resolve());
    await setMode('visible');
    await advance(300);
    expect(suggestRequests(fake.control).map((r) => r.input)).toEqual(['Paris', 'Paris']);
    await act(() => fake.control.pending[1]?.resolve());
    expect(latest.current?.isPlacePredictionsLoading).toBe(false);
    expect(latest.current?.placePredictions).toHaveLength(5);
  });

  it('sends nothing again once the response was applied', async () => {
    const fake = install();
    applyFixture(fake.control, loadFixture('paris-geocode'));
    const { latest, setMode } = renderInActivity({});
    await flush();
    await act(() => latest.current?.getPlacePredictions({ input: 'Paris' }));
    await advance(300);
    await flush();
    await setMode('hidden');
    await setMode('visible');
    await advance(300);
    expect(suggestRequests(fake.control)).toHaveLength(1);
    expect(latest.current?.placePredictions).toHaveLength(5);
  });
});

describe('usePlacesAutocompleteService session tokens', () => {
  it('creates a token on load and sends it with each request', async () => {
    const fake = install();
    const { result } = render({ sessionToken: true });
    await flush();
    expect(callsOf(fake.control, 'newToken')).toHaveLength(1);
    const token = result.current.autocompleteSessionToken;
    expect(token).toBeInstanceOf(fake.google.maps.places.AutocompleteSessionToken);

    await act(() => result.current.getPlacePredictions({ input: 'Paris' }));
    await advance(300);
    await act(() => result.current.getQueryPredictions({ input: 'Lyon' }));
    await advance(300);
    const suggests = callsOf(fake.control, 'suggest');
    expect(suggests.map((call) => call.tokenId)).toEqual(['token-1', 'token-1']);
    expect(suggestRequests(fake.control)[0]?.sessionToken).toBe(token);
  });

  it('lets the call options override the token', async () => {
    const fake = install();
    const own = new fake.google.maps.places.AutocompleteSessionToken();
    const { result } = render({ sessionToken: true });
    await flush();
    await act(() => result.current.getPlacePredictions({ input: 'Paris', sessionToken: own }));
    await advance(300);
    expect(callsOf(fake.control, 'suggest')[0]?.tokenId).toBe('token-1');
    expect(callsOf(fake.control, 'newToken').map((call) => call.tokenId)).toEqual([
      'token-1',
      'token-2',
    ]);
  });

  it('refreshes the token through the session', async () => {
    const fake = install();
    const { result, rerender } = render({ sessionToken: true });
    await flush();
    const first = result.current.autocompleteSessionToken;
    await act(() => result.current.refreshSessionToken());
    rerender({ sessionToken: true });
    expect(callsOf(fake.control, 'newToken')).toHaveLength(2);
    expect(result.current.autocompleteSessionToken).not.toBe(first);

    await act(() => result.current.getPlacePredictions({ input: 'Paris' }));
    await advance(300);
    expect(callsOf(fake.control, 'suggest')[0]?.tokenId).toBe('token-2');
  });

  it('does not create or send tokens without sessionToken', async () => {
    const fake = install();
    const { result } = render({});
    await flush();
    await act(() => result.current.getPlacePredictions({ input: 'Paris' }));
    await advance(300);
    expect(callsOf(fake.control, 'newToken')).toHaveLength(0);
    expect(suggestRequests(fake.control)[0]).not.toHaveProperty('sessionToken');

    await act(() => result.current.refreshSessionToken());
    expect(callsOf(fake.control, 'newToken')).toHaveLength(1);
    await act(() => result.current.getPlacePredictions({ input: 'Lyon' }));
    await advance(300);
    expect(suggestRequests(fake.control)[1]).not.toHaveProperty('sessionToken');
  });

  it('refreshes before the script callback when places is already loaded', async () => {
    const fake = install();
    const { result } = render({ apiKey: 'test-key', sessionToken: true });
    await flush();
    await act(() => result.current.refreshSessionToken());
    expect(callsOf(fake.control, 'newToken')).toHaveLength(1);
    await act(() => scriptCallback()());
    expect(callsOf(fake.control, 'newToken')).toHaveLength(2);
    expect(result.current.autocompleteSessionToken).not.toBeNull();
  });

  it('logs instead of throwing when google is not declared, and refresh does nothing', async () => {
    expect('google' in globalThis).toBe(false);
    let thrown: unknown;
    try {
      const { result } = render({ sessionToken: true });
      await flush();
      result.current.refreshSessionToken();
      expect(result.current.autocompleteSessionToken).toBeNull();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(GOOGLE_NOT_FOUND);
  });

  it('logs instead of throwing when google.maps.places is missing', async () => {
    vi.stubGlobal('google', { maps: {} });
    let thrown: unknown;
    try {
      const { result } = render({});
      await flush();
      expect(result.current.placesAutocompleteService).toBeNull();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(PLACES_NOT_LOADED);
  });

  it('does nothing on refresh while places is unavailable', async () => {
    const { result } = render({ sessionToken: true });
    await flush();
    expect(() => result.current.refreshSessionToken()).not.toThrow();
    expect(result.current.autocompleteSessionToken).toBeNull();
  });
});

describe('usePlacesAutocompleteService placesService', () => {
  it('fetches details and closes the session of the prediction', async () => {
    const fake = install();
    const fixture = loadFixture('sf-geocode');
    applyFixture(fake.control, fixture);
    const { result } = render({ sessionToken: true });
    await flush();
    await act(() => result.current.getPlacePredictions({ input: 'San Francisco' }));
    await advance(300);
    const prediction = result.current.placePredictions[0];
    expect(prediction?.place_id).toBe('ChIJIQBpAG2ahYAR_6128GcTUEo');

    const callback = vi.fn();
    await act(() =>
      result.current.placesService?.getDetails(
        { placeId: prediction?.place_id as string, fields: ['formatted_address', 'place_id'] },
        callback,
      ),
    );
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      {
        formatted_address: fixture.detailsLegacy?.formatted_address,
        place_id: 'ChIJIQBpAG2ahYAR_6128GcTUEo',
      },
      'OK',
    );
    expect(callsOf(fake.control, 'fetchFields')[0]?.tokenId).toBe('token-1');
    expect(fake.control.sessions.get('token-1')?.closed).toBe(true);
  });

  it('throws for methods without a Places API (New) successor', async () => {
    install();
    const { result } = render({});
    await flush();
    const service = result.current.placesService as google.maps.places.PlacesService;
    expect(() => service.textSearch({ query: 'pizza' }, () => {})).toThrow(
      'PlacesService.textSearch is not available with Places API (New).',
    );
  });
});
