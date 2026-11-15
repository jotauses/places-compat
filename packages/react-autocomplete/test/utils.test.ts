import { NEW_API_HINT } from '@places-compat/core';
import { createFakeGoogle } from '@places-compat/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_MAP_SCRIPT_BASE_URL,
  GOOGLE_NOT_FOUND,
  PLACES_NOT_LOADED,
  SCRIPT_CALLBACK,
} from '../src/constants';
import { isBrowser, loadGoogleMapScript, withPlaces } from '../src/utils';

const BASE = GOOGLE_MAP_SCRIPT_BASE_URL;
const URL_WITH_KEY = `${BASE}?key=test-key&libraries=places`;

let uninstall: (() => void) | undefined;

function install(opts: Parameters<typeof createFakeGoogle>[0] = {}) {
  const fake = createFakeGoogle(opts);
  uninstall = fake.install();
  return fake;
}

function callbackSlot(): Record<string, unknown> {
  return window as unknown as Record<string, unknown>;
}

function scripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll('script'));
}

async function settled(promise: Promise<void>): Promise<boolean> {
  let done = false;
  void promise.then(() => {
    done = true;
  });
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
  return done;
}

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
  vi.unstubAllGlobals();
  delete callbackSlot()[SCRIPT_CALLBACK];
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('isBrowser', () => {
  it('is true with a window and a document', () => {
    expect(isBrowser()).toBe(true);
  });

  it('is false without a window', () => {
    vi.stubGlobal('window', undefined);
    expect(isBrowser()).toBe(false);
  });
});

describe('loadGoogleMapScript', () => {
  it('resolves without touching the page outside a browser', async () => {
    vi.stubGlobal('window', undefined);
    await expect(loadGoogleMapScript(BASE, URL_WITH_KEY)).resolves.toBeUndefined();
    vi.unstubAllGlobals();
    expect(scripts()).toHaveLength(0);
    expect(callbackSlot()[SCRIPT_CALLBACK]).toBeUndefined();
  });

  it('resolves at once when google.maps.api is set', async () => {
    install({ mapsApiFlag: true });
    await expect(loadGoogleMapScript(BASE, URL_WITH_KEY)).resolves.toBeUndefined();
    expect(scripts()).toHaveLength(0);
  });

  it('resolves at once when a matching script exists and google is loaded', async () => {
    const existing = document.createElement('script');
    existing.src = `${BASE}?key=other`;
    document.head.appendChild(existing);
    install();
    expect(await settled(loadGoogleMapScript(BASE, URL_WITH_KEY))).toBe(true);
    expect(scripts()).toEqual([existing]);
  });

  it('waits for the load event of a matching script when google is missing', async () => {
    const existing = document.createElement('script');
    existing.src = `${BASE}?key=other`;
    document.body.appendChild(existing);
    const promise = loadGoogleMapScript(BASE, URL_WITH_KEY);
    expect(await settled(promise)).toBe(false);
    existing.dispatchEvent(new Event('load'));
    expect(await settled(promise)).toBe(true);
    expect(scripts()).toEqual([existing]);
  });

  it('ignores scripts from other origins', async () => {
    const other = document.createElement('script');
    other.src = 'https://example.test/maps.js';
    document.head.appendChild(other);
    void loadGoogleMapScript(BASE, URL_WITH_KEY);
    expect(scripts()).toHaveLength(2);
  });

  it('appends a script with the global callback and resolves when it is called', async () => {
    const promise = loadGoogleMapScript(BASE, URL_WITH_KEY);
    const injected = document.body.querySelectorAll('script');
    expect(injected).toHaveLength(1);
    expect(injected[0]?.src).toBe(`${URL_WITH_KEY}&callback=${SCRIPT_CALLBACK}`);
    expect(injected[0]?.getAttribute('src')).not.toContain('loading=');
    expect(await settled(promise)).toBe(false);
    const callback = callbackSlot()[SCRIPT_CALLBACK];
    expect(typeof callback).toBe('function');
    (callback as () => void)();
    expect(await settled(promise)).toBe(true);
  });

  it('keeps an unencoded key verbatim and lets URLSearchParams reserialize the query', () => {
    void loadGoogleMapScript(
      BASE,
      `${BASE}?key=a&loading=async&libraries=places,geometry&language=fr`,
    );
    expect(document.body.querySelector('script')?.src).toBe(
      `${BASE}?key=a&loading=async&libraries=places%2Cgeometry&language=fr&callback=${SCRIPT_CALLBACK}`,
    );
  });

  it('replaces a callback parameter already in the url', () => {
    void loadGoogleMapScript(BASE, `${BASE}?key=test-key&callback=mine&libraries=places`);
    expect(document.body.querySelector('script')?.src).toBe(
      `${BASE}?key=test-key&callback=${SCRIPT_CALLBACK}&libraries=places`,
    );
  });
});

describe('withPlaces', () => {
  it('reports that google is missing, synchronously', () => {
    const onReady = vi.fn();
    const onError = vi.fn();
    withPlaces(onReady, onError);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(GOOGLE_NOT_FOUND);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('hands over a loaded places library synchronously', () => {
    const fake = install();
    const onReady = vi.fn();
    const onError = vi.fn();
    withPlaces(onReady, onError);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith(fake.google.maps.places);
    expect(onError).not.toHaveBeenCalled();
    expect(fake.control.calls.filter((call) => call.kind === 'importLibrary')).toHaveLength(0);
  });

  it('imports the places library when it is not loaded yet', async () => {
    const fake = install({ places: 'viaImportLibrary' });
    const onReady = vi.fn();
    const onError = vi.fn();
    withPlaces(onReady, onError);
    expect(onReady).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const places = onReady.mock.calls[0]?.[0] as google.maps.PlacesLibrary;
    expect(typeof places.AutocompleteSuggestion.fetchAutocompleteSuggestions).toBe('function');
    expect(places).toBe(fake.google.maps.places);
    expect(onError).not.toHaveBeenCalled();
  });

  it('adds the hint when only the legacy library is available', async () => {
    install({ places: 'legacyOnly' });
    const onReady = vi.fn();
    const onError = vi.fn();
    withPlaces(onReady, onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith(`${PLACES_NOT_LOADED}\n${NEW_API_HINT}`);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('uses the original message when the library cannot be loaded', async () => {
    install({ places: 'absent' });
    const onError = vi.fn();
    withPlaces(vi.fn(), onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith(PLACES_NOT_LOADED);
  });

  it('uses the original message when google has no maps namespace', async () => {
    const target = globalThis as { google?: unknown };
    target.google = {};
    uninstall = () => {
      delete target.google;
    };
    const onError = vi.fn();
    withPlaces(vi.fn(), onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith(PLACES_NOT_LOADED);
  });

  it('drops a late success after cancel', async () => {
    const fake = install({ places: 'viaImportLibrary' });
    const onReady = vi.fn();
    const onError = vi.fn();
    withPlaces(onReady, onError).cancel();
    await vi.waitFor(() => expect(fake.google.maps.places).toBeDefined());
    for (let turn = 0; turn < 10; turn++) await Promise.resolve();
    expect(onReady).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('drops a late failure after cancel', async () => {
    const fake = install({ places: 'absent' });
    const onError = vi.fn();
    withPlaces(vi.fn(), onError).cancel();
    await vi.waitFor(() =>
      expect(fake.control.calls.some((call) => call.kind === 'importLibrary')).toBe(true),
    );
    for (let turn = 0; turn < 10; turn++) await Promise.resolve();
    expect(onError).not.toHaveBeenCalled();
  });
});
