import { actCompat, renderHookCompat } from '@places-compat/core/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import usePlacesAutocomplete, { getDetails } from '../src';

type Win = { google?: unknown };

const prediction = (placeId: string, text: string) => {
  const [main, ...rest] = text.split(', ');
  return {
    placeId,
    text: { text, matches: [] },
    mainText: { text: main, matches: [] },
    secondaryText: { text: rest.join(', '), matches: [] },
    types: ['geocode'],
    distanceMeters: null,
    toPlace: () => new window.google.maps.places.Place({ id: placeId }),
  };
};

class FakePlace {
  id: string;
  formattedAddress?: string;
  constructor({ id }: { id: string }) {
    this.id = id;
  }
  async fetchFields() {
    this.formattedAddress = '1 Example Street, Paris, France';
    return { place: this };
  }
}

function installRecipe(fetch: (request: { input: string }) => Promise<unknown>) {
  window.google = {
    maps: {
      places: {
        AutocompleteSuggestion: {
          fetchAutocompleteSuggestions: fetch,
        },
        AutocompleteSessionToken: class {},
        Place: FakePlace,
      },
    },
  } as unknown as typeof window.google;
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as Win).google;
  sessionStorage.clear();
});

it('drives the hook with the plain-object fake shown in the README', async () => {
  installRecipe(async ({ input }) => ({
    suggestions: [{ placePrediction: prediction('place-1', `${input}, Paris, France`) }],
  }));
  const { result } = renderHookCompat(() => usePlacesAutocomplete());
  expect(result.current.ready).toBe(true);

  await actCompat(() => result.current.setValue('Louvre'));
  await actCompat(async () => {
    vi.advanceTimersByTime(200);
  });

  expect(result.current.suggestions.status).toBe('OK');
  expect(result.current.suggestions.data).toHaveLength(1);
  expect(result.current.suggestions.data[0]).toMatchObject({
    place_id: 'place-1',
    description: 'Louvre, Paris, France',
    structured_formatting: { main_text: 'Louvre', secondary_text: 'Paris, France' },
  });

  await expect(getDetails({ placeId: 'place-1', fields: ['formatted_address'] })).resolves.toEqual({
    formatted_address: '1 Example Street, Paris, France',
  });
});

it('reports a rejected request with a status code as the suggestions status', async () => {
  installRecipe(async () => {
    throw Object.assign(new Error('denied'), { code: 'REQUEST_DENIED' });
  });
  const { result } = renderHookCompat(() => usePlacesAutocomplete());

  await actCompat(() => result.current.setValue('Louvre'));
  await actCompat(async () => {
    vi.advanceTimersByTime(200);
  });

  expect(result.current.suggestions).toEqual({
    loading: false,
    status: 'REQUEST_DENIED',
    data: [],
  });
});
