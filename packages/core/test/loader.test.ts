import { afterEach, describe, expect, it } from 'vitest';
import {
  getPlaces,
  loadPlaces,
  MIN_MAPS_VERSION,
  NEW_API_HINT,
  PlacesUnavailableError,
} from '../src/loader';
import { createFakeGoogle } from '../src/testing/fake-new';

type Maps = typeof google.maps;

let uninstall: (() => void) | undefined;

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
});

function mapsOf(opts?: Parameters<typeof createFakeGoogle>[0]) {
  const fake = createFakeGoogle(opts);
  return { ...fake, maps: fake.google.maps };
}

function importCalls(control: ReturnType<typeof mapsOf>['control']) {
  return control.calls.filter((call) => call.kind === 'importLibrary');
}

async function reasonOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => 'resolved',
    (error: unknown) => error,
  );
}

describe('constants', () => {
  it('MIN_MAPS_VERSION is 3.57.2', () => {
    expect(MIN_MAPS_VERSION).toBe('3.57.2');
  });

  it('NEW_API_HINT is the exact text', () => {
    expect(NEW_API_HINT).toBe(
      'Places API (New) must be enabled and the Maps JavaScript API must be version 3.57.2 or later.',
    );
  });
});

describe('PlacesUnavailableError', () => {
  it.each(['no-places', 'no-new-api'] as const)(
    'keeps instanceof, name and reason %s',
    (reason) => {
      const error = new PlacesUnavailableError(reason);
      expect(error).toBeInstanceOf(PlacesUnavailableError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('PlacesUnavailableError');
      expect(error.reason).toBe(reason);
      expect(Object.prototype.toString.call(error)).toBe('[object Error]');
    },
  );

  it('no-new-api carries the hint as its message', () => {
    expect(new PlacesUnavailableError('no-new-api').message).toBe(NEW_API_HINT);
  });

  it('no-places has its own message', () => {
    expect(new PlacesUnavailableError('no-places').message).toBe(
      'The Google Maps Places library is not loaded.',
    );
  });

  it('accepts a custom message', () => {
    expect(new PlacesUnavailableError('no-places', 'custom').message).toBe('custom');
  });
});

describe('getPlaces', () => {
  it('returns maps.places when it has AutocompleteSuggestion', () => {
    const { maps } = mapsOf();
    expect(getPlaces(maps)).toBe(maps.places);
  });

  it('returns undefined when maps.places only has the legacy classes', () => {
    expect(getPlaces(mapsOf({ places: 'legacyOnly' }).maps)).toBeUndefined();
  });

  it('returns undefined when maps.places is missing', () => {
    expect(getPlaces(mapsOf({ places: 'absent' }).maps)).toBeUndefined();
  });

  it('returns undefined before importLibrary has loaded the library', () => {
    expect(getPlaces(mapsOf({ places: 'viaImportLibrary' }).maps)).toBeUndefined();
  });

  it('returns undefined for undefined maps', () => {
    expect(getPlaces(undefined)).toBeUndefined();
  });

  it('defaults to globalThis.google.maps', () => {
    const fake = mapsOf();
    uninstall = fake.install();
    expect(getPlaces()).toBe(fake.maps.places);
  });

  it('defaults to undefined when there is no globalThis.google', () => {
    expect(getPlaces()).toBeUndefined();
  });
});

describe('loadPlaces', () => {
  it('resolves with maps.places at once when the new API is there', async () => {
    const { maps, control } = mapsOf();
    await expect(loadPlaces(maps)).resolves.toBe(maps.places);
    expect(importCalls(control)).toEqual([]);
  });

  it("otherwise awaits importLibrary('places') and resolves with its result", async () => {
    const { maps, control } = mapsOf({ places: 'viaImportLibrary' });
    const places = await loadPlaces(maps);
    expect(typeof places.AutocompleteSuggestion.fetchAutocompleteSuggestions).toBe('function');
    expect(importCalls(control).map((call) => call.request)).toEqual(['places']);
  });

  it('importLibrary returning a legacy object rejects with no-new-api', async () => {
    const { maps } = mapsOf({ places: 'legacyOnly' });
    const error = await reasonOf(loadPlaces(maps));
    expect(error).toBeInstanceOf(PlacesUnavailableError);
    expect(error).toMatchObject({ reason: 'no-new-api', message: NEW_API_HINT });
  });

  it('importLibrary resolving nothing rejects with no-new-api', async () => {
    const maps = { importLibrary: () => Promise.resolve(undefined) } as unknown as Maps;
    expect(await reasonOf(loadPlaces(maps))).toMatchObject({ reason: 'no-new-api' });
  });

  it('importLibrary rejecting rejects with no-places', async () => {
    const { maps } = mapsOf({ places: 'absent' });
    const error = await reasonOf(loadPlaces(maps));
    expect(error).toBeInstanceOf(PlacesUnavailableError);
    expect(error).toMatchObject({ reason: 'no-places' });
  });

  it('importLibrary throwing synchronously rejects with no-places', async () => {
    const maps = {
      importLibrary: () => {
        throw new Error('boom');
      },
    } as unknown as Maps;
    expect(await reasonOf(loadPlaces(maps))).toMatchObject({ reason: 'no-places' });
  });

  it('no importLibrary with legacy maps.places rejects with no-new-api', async () => {
    const { maps } = mapsOf({ places: 'legacyOnly', importLibrary: false });
    expect(await reasonOf(loadPlaces(maps))).toMatchObject({ reason: 'no-new-api' });
  });

  it('no importLibrary and no maps.places rejects with no-places', async () => {
    const { maps } = mapsOf({ places: 'absent', importLibrary: false });
    expect(await reasonOf(loadPlaces(maps))).toMatchObject({ reason: 'no-places' });
  });

  it('no importLibrary with the new API present still resolves', async () => {
    const { maps } = mapsOf({ importLibrary: false });
    await expect(loadPlaces(maps)).resolves.toBe(maps.places);
  });

  it('undefined maps rejects with no-places', async () => {
    const error = await reasonOf(loadPlaces(undefined));
    expect(error).toBeInstanceOf(PlacesUnavailableError);
    expect(error).toMatchObject({ reason: 'no-places' });
  });

  it('defaults to globalThis.google.maps', async () => {
    const fake = mapsOf({ places: 'viaImportLibrary' });
    uninstall = fake.install();
    const places = await loadPlaces();
    expect(places).toBe(fake.maps.places);
  });

  it('rejects with no-places when there is no globalThis.google', async () => {
    expect(await reasonOf(loadPlaces())).toMatchObject({ reason: 'no-places' });
  });
});
