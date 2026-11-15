import {
  actCompat,
  createFakeGoogle,
  type FakeControl,
  fakeMapsError,
  renderHookCompat,
  type SuggestionJson,
} from '@places-compat/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HookArgs, Suggestion } from '../src/types';
import usePlacesAutocomplete from '../src/usePlacesAutocomplete';

const NOW = new Date('2026-03-01T12:00:00Z').getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

let control: FakeControl;
let uninstall: () => void;

function renderUpa(initialProps: HookArgs = {}) {
  return renderHookCompat((props: HookArgs) => usePlacesAutocomplete(props), { initialProps });
}

type Handle = ReturnType<typeof renderUpa>;

function suggestion(placeId: string, text: string): SuggestionJson {
  return { placePrediction: { placeId, text: { text } } };
}

function suggestInputs(): string[] {
  return control.calls
    .filter((call) => call.kind === 'suggest')
    .map((call) => (call.request as { input: string }).input);
}

async function search({ result }: Handle, value: string): Promise<number> {
  await actCompat(() => result.current.setValue(value));
  await actCompat(() => {
    vi.advanceTimersByTime(200);
  });
  return Date.now();
}

function stored(key = 'upa'): unknown {
  const raw = sessionStorage.getItem(key);
  return raw === null ? null : JSON.parse(raw);
}

function storedEntry(data: Suggestion[], maxAge: number) {
  return { data, maxAge };
}

const handWritten: Suggestion = {
  description: 'Paris, France',
  matched_substrings: [{ length: 3, offset: 0 }],
  place_id: 'stored-paris',
  structured_formatting: {
    main_text: 'Paris',
    main_text_matched_substrings: [{ length: 3, offset: 0 }],
    secondary_text: 'France',
  },
  terms: [
    { offset: 0, value: 'Paris' },
    { offset: 7, value: 'France' },
  ],
  types: ['locality', 'political', 'geocode'],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  sessionStorage.clear();
  const fake = createFakeGoogle();
  control = fake.control;
  control.onSuggest('par', [suggestion('p1', 'Paris, France')]);
  control.onSuggest('lon', [suggestion('p2', 'London, UK')]);
  uninstall = fake.install();
});

afterEach(() => {
  uninstall();
  vi.useRealTimers();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('cache storage', () => {
  it('writes the original shape under the literal default key with a one day maxAge', async () => {
    const handle = renderUpa();
    const searchedAt = await search(handle, 'par');
    const { data } = handle.result.current.suggestions;

    expect(searchedAt).toBe(NOW + 200);
    expect(data).toHaveLength(1);
    expect(sessionStorage.getItem('upa')).toBe(
      JSON.stringify({ par: { data, maxAge: searchedAt + DAY_MS } }),
    );
  });

  it('writes under a custom cacheKey with maxAge from the cache seconds', async () => {
    const handle = renderUpa({ cacheKey: 'places:fr', cache: 60 });
    const parisAt = await search(handle, 'par');
    const paris = handle.result.current.suggestions.data;
    vi.setSystemTime(NOW + 5000);
    const londonAt = await search(handle, 'lon');
    const london = handle.result.current.suggestions.data;

    expect(londonAt - parisAt).toBe(5000);
    expect(sessionStorage.getItem('upa')).toBeNull();
    expect(stored('places:fr')).toEqual({
      par: storedEntry(paris, parisAt + 60_000),
      lon: storedEntry(london, londonAt + 60_000),
    });
  });

  it('stores plain JSON data that round-trips unchanged', async () => {
    const handle = renderUpa();
    await search(handle, 'par');
    const { data } = handle.result.current.suggestions;
    const entry = (stored() as Record<string, { data: Suggestion[] }>).par;

    expect(JSON.parse(JSON.stringify(data))).toStrictEqual(data);
    expect(entry?.data).toStrictEqual(data);
  });
});

describe('cache hits', () => {
  it('serves a fresh entry without calling Google', async () => {
    const handle = renderUpa();
    await search(handle, 'par');
    const first = handle.result.current.suggestions.data;
    await search(handle, 'lon');
    await search(handle, 'par');

    expect(suggestInputs()).toEqual(['par', 'lon']);
    expect(handle.result.current.suggestions).toEqual({
      loading: false,
      status: 'OK',
      data: first,
    });
  });

  it('reads an entry written by use-places-autocomplete 4.0.1 as a hit', async () => {
    sessionStorage.setItem(
      'upa',
      JSON.stringify({ par: { data: [handWritten], maxAge: NOW + 1000 } }),
    );
    const handle = renderUpa();
    await search(handle, 'par');

    expect(suggestInputs()).toEqual([]);
    expect(handle.result.current.suggestions).toEqual({
      loading: false,
      status: 'OK',
      data: [handWritten],
    });
  });

  it('treats an entry whose maxAge equals the search time as fresh', async () => {
    sessionStorage.setItem(
      'upa',
      JSON.stringify({ par: { data: [handWritten], maxAge: NOW + 200 } }),
    );
    const handle = renderUpa();
    await search(handle, 'par');

    expect(suggestInputs()).toEqual([]);
  });

  it('ignores requestOptions in the key', async () => {
    const handle = renderUpa({ requestOptions: { language: 'en' } });
    await search(handle, 'par');
    handle.rerender({
      requestOptions: { language: 'fr', componentRestrictions: { country: 'fr' } },
    });
    await search(handle, 'par');

    expect(suggestInputs()).toEqual(['par']);
    expect(Object.keys(stored() as object)).toEqual(['par']);
  });
});

describe('cache expiry and writes', () => {
  it('prunes expired entries and fetches them again', async () => {
    sessionStorage.setItem(
      'upa',
      JSON.stringify({
        par: { data: [handWritten], maxAge: NOW + 199 },
        old: { data: [handWritten], maxAge: NOW - 1000 },
        lon: { data: [handWritten], maxAge: NOW + 1000 },
      }),
    );
    const handle = renderUpa();
    const searchedAt = await search(handle, 'par');

    expect(suggestInputs()).toEqual(['par']);
    expect(handle.result.current.suggestions.data[0]?.place_id).toBe('p1');
    const after = stored() as Record<string, { maxAge: number }>;
    expect(Object.keys(after).sort()).toEqual(['lon', 'par']);
    expect(after.par?.maxAge).toBe(searchedAt + DAY_MS);
    expect(after.lon?.maxAge).toBe(NOW + 1000);
  });

  it('refetches an entry once its own cache time has passed', async () => {
    const handle = renderUpa({ cache: 10 });
    const searchedAt = await search(handle, 'par');
    vi.setSystemTime(searchedAt + 10_000 - 200);
    await search(handle, 'par');
    expect(suggestInputs()).toEqual(['par']);

    vi.setSystemTime(searchedAt + 10_001 - 200);
    await search(handle, 'par');
    expect(suggestInputs()).toEqual(['par', 'par']);
  });

  it.each([
    ['ZERO_RESULTS', [] as SuggestionJson[]],
    ['REQUEST_DENIED', fakeMapsError('PERMISSION_DENIED')],
    ['UNKNOWN_ERROR', fakeMapsError('INTERNAL')],
  ] as const)('does not write a %s response', async (status, reply) => {
    control.onSuggest('nowhere', reply);
    const handle = renderUpa();
    await search(handle, 'nowhere');
    await search(handle, 'nowhere');

    expect(handle.result.current.suggestions.status).toBe(status);
    expect(sessionStorage.getItem('upa')).toBeNull();
    expect(suggestInputs()).toEqual(['nowhere', 'nowhere']);
  });

  it.each([false, 0] as const)(
    'with cache %s never hits or writes but still reads storage',
    async (cache) => {
      const raw = JSON.stringify({ par: { data: [handWritten], maxAge: NOW + 1000 } });
      sessionStorage.setItem('upa', raw);
      const getItem = vi.spyOn(Storage.prototype, 'getItem');
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const handle = renderUpa({ cache });
      await search(handle, 'par');
      await search(handle, 'lon');

      expect(suggestInputs()).toEqual(['par', 'lon']);
      expect(handle.result.current.suggestions.data[0]?.place_id).toBe('p2');
      expect(getItem).toHaveBeenCalledWith('upa');
      expect(getItem).toHaveBeenCalledTimes(2);
      expect(setItem).not.toHaveBeenCalled();
      expect(sessionStorage.getItem('upa')).toBe(raw);
    },
  );
});

describe('malformed or unavailable storage', () => {
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'does not treat the inherited key %s as a hit',
    async (input) => {
      sessionStorage.setItem(
        'upa',
        JSON.stringify({ par: { data: [handWritten], maxAge: NOW + 1000 } }),
      );
      control.onSuggest(input, [suggestion('p3', 'Somewhere')]);
      const handle = renderUpa();
      await search(handle, input);

      expect(suggestInputs()).toEqual([input]);
      expect(handle.result.current.suggestions.status).toBe('OK');
      expect(handle.result.current.suggestions.data.map((item) => item.place_id)).toEqual(['p3']);
    },
  );

  it.each([
    ['invalid JSON', '{not json'],
    ['null', 'null'],
    ['a number', '42'],
    ['a string', '"cached"'],
    ['an array', '[1,2]'],
    ['an entry that is null', JSON.stringify({ par: null })],
    ['an entry without maxAge', JSON.stringify({ par: { data: [] } })],
  ])('searches normally when storage holds %s', async (_label, raw) => {
    sessionStorage.setItem('upa', raw);
    const handle = renderUpa();
    await search(handle, 'par');

    expect(suggestInputs()).toEqual(['par']);
    expect(handle.result.current.suggestions.status).toBe('OK');
    expect(Object.keys(stored() as object)).toContain('par');
  });

  it('searches normally when storage holds an entry that is null and cache is off', async () => {
    sessionStorage.setItem('upa', JSON.stringify({ par: null }));
    const handle = renderUpa({ cache: false });
    await search(handle, 'par');

    expect(suggestInputs()).toEqual(['par']);
    expect(handle.result.current.suggestions.status).toBe('OK');
  });

  it('keeps searching and clearing when every storage method throws', async () => {
    const denied = () => {
      throw new Error('storage denied');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(denied);
    const errors = vi.spyOn(console, 'error');
    const handle = renderUpa();
    await search(handle, 'par');

    expect(handle.result.current.suggestions.status).toBe('OK');
    expect(handle.result.current.suggestions.data[0]?.place_id).toBe('p1');
    expect(() => handle.result.current.clearCache()).not.toThrow();
    expect(() => handle.result.current.clearCache('other')).not.toThrow();
    expect(errors).not.toHaveBeenCalled();
  });

  it('keeps searching when reading sessionStorage itself throws', async () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const handle = renderUpa();
    await search(handle, 'par');

    expect(handle.result.current.suggestions.status).toBe('OK');
    expect(() => handle.result.current.clearCache()).not.toThrow();
  });
});

describe('clearCache', () => {
  it('removes the default key, or the key it is given', () => {
    sessionStorage.setItem('upa', '{}');
    sessionStorage.setItem('other', '{}');
    const { result } = renderUpa();

    result.current.clearCache('other');
    expect(sessionStorage.getItem('other')).toBeNull();
    expect(sessionStorage.getItem('upa')).toBe('{}');

    result.current.clearCache();
    expect(sessionStorage.getItem('upa')).toBeNull();
  });

  it('removes the custom cacheKey by default', () => {
    sessionStorage.setItem('upa', '{}');
    sessionStorage.setItem('mine', '{}');
    const { result } = renderUpa({ cacheKey: 'mine' });

    result.current.clearCache();

    expect(sessionStorage.getItem('mine')).toBeNull();
    expect(sessionStorage.getItem('upa')).toBe('{}');
  });

  it('makes the next search fetch again', async () => {
    const handle = renderUpa();
    await search(handle, 'par');
    handle.result.current.clearCache();
    await search(handle, 'par');

    expect(suggestInputs()).toEqual(['par', 'par']);
  });
});
