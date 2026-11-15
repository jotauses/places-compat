import type { FakeControl, PlaceJson, SuggestionJson } from '@places-compat/core/testing';
import { createFakeGoogle } from '@places-compat/core/testing';
import { fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AutocompleteShim, createAutocompleteShim } from '../../src/widget/shim';
import { STYLE_ATTRIBUTE } from '../../src/widget/styles';

function suggestion(placeId: string, main: string, secondary: string): SuggestionJson {
  return {
    placePrediction: {
      placeId,
      text: { text: `${main}, ${secondary}`, matches: [{ startOffset: 0, endOffset: 3 }] },
      structuredFormat: {
        mainText: { text: main, matches: [{ startOffset: 0, endOffset: 3 }] },
        secondaryText: { text: secondary },
      },
      types: ['locality'],
    },
  };
}

const PARIS = suggestion('paris-id', 'Paris', 'France');
const PARMA = suggestion('parma-id', 'Parma', 'Italy');

const PARIS_PLACE: PlaceJson = {
  id: 'paris-id',
  displayName: 'Paris',
  formattedAddress: 'Paris, France',
  location: { lat: 48.85, lng: 2.35 },
};

let cleanup: (() => void)[] = [];

interface Setup {
  control: FakeControl;
  input: HTMLInputElement;
  shim: AutocompleteShim;
}

function setup(
  options?: google.maps.places.AutocompleteOptions,
  prepare?: (el: HTMLInputElement) => void,
): Setup {
  const fake = createFakeGoogle();
  cleanup.push(fake.install());
  const places = fake.google.maps.places as unknown as google.maps.PlacesLibrary;
  const input = document.createElement('input');
  prepare?.(input);
  document.body.appendChild(input);
  const shim = createAutocompleteShim(input, places, options);
  cleanup.push(() => shim.destroy());
  return { control: fake.control, input, shim };
}

const type = (input: HTMLInputElement, value: string) =>
  fireEvent.input(input, { target: { value } });
const items = () => Array.from(document.querySelectorAll<HTMLElement>('.pac-item'));
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const suggestCalls = (control: FakeControl) => control.calls.filter((c) => c.kind === 'suggest');
const kinds = (control: FakeControl) => control.calls.map((c) => c.kind);

afterEach(() => {
  for (const fn of cleanup.reverse()) fn();
  cleanup = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('createAutocompleteShim attach', () => {
  it('prepares the input, injects styles and creates the dropdown', () => {
    const { input } = setup();
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.classList.contains('pac-target-input')).toBe(true);
    expect(input.getAttribute('placeholder')).toBe('Enter a location');
    expect(document.head.firstElementChild?.hasAttribute(STYLE_ATTRIBUTE)).toBe(true);
    expect(document.querySelectorAll('.pac-container')).toHaveLength(1);
    expect(input.getAttribute('role')).toBe('combobox');
  });

  it('keeps an existing placeholder and classes', () => {
    const { input } = setup(undefined, (el) => {
      el.placeholder = 'Where to?';
      el.className = 'field';
    });
    expect(input.getAttribute('placeholder')).toBe('Where to?');
    expect(input.className).toBe('field pac-target-input');
  });

  it('injects the stylesheet once for two widgets', () => {
    setup();
    setup();
    expect(document.querySelectorAll(`style[${STYLE_ATTRIBUTE}]`)).toHaveLength(1);
    expect(document.querySelectorAll('.pac-container')).toHaveLength(2);
  });

  it('is a plain object without the MVCObject surface', () => {
    const { shim } = setup();
    expect(Object.getPrototypeOf(shim)).toBe(Object.prototype);
    for (const name of ['bindTo', 'get', 'set', 'notify', 'unbind']) {
      expect(name in shim).toBe(false);
    }
  });
});

describe('createAutocompleteShim options', () => {
  it('reads the initial options and reports bounds and fields', () => {
    const bounds = { south: 1, west: 2, north: 3, east: 4 };
    const { shim } = setup({ bounds, fields: ['name'] });
    expect(shim.getFields()).toEqual(['name']);
    const result = shim.getBounds();
    expect(result?.toJSON()).toEqual(bounds);
  });

  it('returns undefined bounds and fields when none were set', () => {
    const { shim } = setup();
    expect(shim.getBounds()).toBeUndefined();
    expect(shim.getFields()).toBeUndefined();
  });

  it('returns a LatLngBounds instance as it is', () => {
    const { shim } = setup();
    const bounds = new google.maps.LatLngBounds({ south: 1, west: 2, north: 3, east: 4 });
    shim.setBounds(bounds);
    expect(shim.getBounds()).toBe(bounds);
  });

  it('returns the literal when LatLngBounds is unavailable', () => {
    const { shim } = setup();
    const bounds = { south: 1, west: 2, north: 3, east: 4 };
    shim.setBounds(bounds);
    const restore = cleanup.shift() as () => void;
    restore();
    expect(shim.getBounds()).toBe(bounds);
  });

  it('sends types, country and bounds as a bias with each request', async () => {
    const { control, input, shim } = setup({ types: ['(cities)'] });
    shim.setComponentRestrictions({ country: ['fr', 'it'] });
    shim.setBounds({ south: 1, west: 2, north: 3, east: 4 });
    type(input, 'par');
    await flush();
    const request = suggestCalls(control)[0]?.request as google.maps.places.AutocompleteRequest;
    expect(request.input).toBe('par');
    expect(request.includedPrimaryTypes).toEqual(['(cities)']);
    expect(request.includedRegionCodes).toEqual(['fr', 'it']);
    expect(request.locationBias).toEqual({ south: 1, west: 2, north: 3, east: 4 });
    expect(request.locationRestriction).toBeUndefined();
  });

  it('sends strictBounds as a location restriction', async () => {
    const bounds = { south: 1, west: 2, north: 3, east: 4 };
    const { control, input } = setup({ bounds, strictBounds: true });
    type(input, 'par');
    await flush();
    const request = suggestCalls(control)[0]?.request as google.maps.places.AutocompleteRequest;
    expect(request.locationRestriction).toEqual(bounds);
    expect(request.locationBias).toBeUndefined();
  });

  it('setOptions merges only the known keys', async () => {
    const bounds = { south: 1, west: 2, north: 3, east: 4 };
    const { control, input, shim } = setup({ bounds, fields: ['name'], types: ['address'] });
    shim.setOptions({
      strictBounds: true,
      unknownKey: 1,
    } as google.maps.places.AutocompleteOptions);
    shim.setOptions(null);
    expect(shim.getFields()).toEqual(['name']);
    expect('unknownKey' in shim).toBe(false);
    type(input, 'par');
    await flush();
    const request = suggestCalls(control)[0]?.request as Record<string, unknown>;
    expect(request.locationRestriction).toEqual(bounds);
    expect(request.includedPrimaryTypes).toEqual([
      'street_address',
      'premise',
      'subpremise',
      'route',
    ]);
    expect(Object.keys(request)).not.toContain('unknownKey');

    shim.setOptions({ fields: ['place_id'], types: ['geocode'], strictBounds: false });
    expect(shim.getFields()).toEqual(['place_id']);
    type(input, 'pari');
    await flush();
    const second = suggestCalls(control)[1]?.request as Record<string, unknown>;
    expect(second.includedPrimaryTypes).toEqual(['geocode']);
    expect(second.locationBias).toEqual(bounds);
  });

  it('setters replace one option each', async () => {
    const { control, input, shim } = setup({
      types: ['(cities)'],
      componentRestrictions: { country: 'fr' },
      bounds: { south: 1, west: 2, north: 3, east: 4 },
    });
    shim.setTypes(null);
    shim.setComponentRestrictions(null);
    shim.setBounds(undefined);
    shim.setFields(['name']);
    shim.setFields(undefined);
    expect(shim.getFields()).toBeUndefined();
    type(input, 'par');
    await flush();
    const request = suggestCalls(control)[0]?.request as Record<string, unknown>;
    expect(Object.keys(request).sort()).toEqual(['input', 'sessionToken']);
  });
});

describe('createAutocompleteShim suggestions', () => {
  it('renders the predictions for what the user types, without debounce', async () => {
    const { control, input } = setup();
    control.onSuggest('pa', [PARIS, PARMA]);
    type(input, 'pa');
    expect(suggestCalls(control)).toHaveLength(1);
    await flush();
    expect(items().map((item) => item.textContent)).toEqual(['ParisFrance', 'ParmaItaly']);
    expect(document.querySelector('.pac-matched')?.textContent).toBe('Par');
  });

  it('clears the list when the input is emptied', async () => {
    const { control, input } = setup();
    control.onSuggest('pa', [PARIS]);
    type(input, 'pa');
    await flush();
    type(input, '');
    expect(suggestCalls(control)).toHaveLength(1);
    expect(items()).toHaveLength(0);
    const container = document.querySelector('.pac-container') as HTMLElement;
    expect(container.style.display).toBe('none');
  });

  it('shows an empty list on errors', async () => {
    const { control, input } = setup();
    control.onSuggest('pa', [PARIS], { times: 1 });
    control.onSuggest('par', new Error('boom'));
    type(input, 'pa');
    await flush();
    type(input, 'par');
    await flush();
    expect(items()).toHaveLength(0);
  });

  it('discards a stale response that arrives after a newer one', async () => {
    const { control, input } = setup();
    control.onSuggest('pa', [PARIS, PARMA], { deferred: true });
    control.onSuggest('par', [PARIS], { deferred: true });
    type(input, 'pa');
    type(input, 'par');
    expect(control.pending).toHaveLength(2);
    control.pending[1]?.resolve();
    await flush();
    expect(items()).toHaveLength(1);
    control.pending[0]?.resolve();
    await flush();
    expect(items()).toHaveLength(1);
    expect(items()[0]?.textContent).toBe('ParisFrance');
  });

  it('discards a response that arrives after the input was emptied', async () => {
    const { control, input } = setup();
    control.onSuggest('pa', [PARIS], { deferred: true });
    type(input, 'pa');
    type(input, '');
    control.pending[0]?.resolve();
    await flush();
    expect(items()).toHaveLength(0);
  });

  it('passes one session token with every request', async () => {
    const { control, input } = setup();
    type(input, 'p');
    type(input, 'pa');
    await flush();
    const calls = suggestCalls(control);
    expect(calls.map((c) => c.tokenId)).toEqual(['token-1', 'token-1']);
    expect(control.sessions.get('token-1')?.suggest).toBe(2);
    expect(kinds(control).filter((k) => k === 'newToken')).toHaveLength(1);
  });
});

describe('createAutocompleteShim selection', () => {
  async function showPredictions(control: FakeControl, input: HTMLInputElement) {
    control.onSuggest('pa', [PARIS, PARMA]);
    type(input, 'pa');
    await flush();
  }

  it('fetches details on selection and emits place_changed only after they arrive', async () => {
    const { control, input, shim } = setup({ fields: ['name', 'formatted_address'] });
    control.onFetchFields('paris-id', PARIS_PLACE, { deferred: true });
    await showPredictions(control, input);
    const listener = vi.fn(function (this: unknown) {
      expect(this).toBe(shim);
    });
    shim.addListener('place_changed', listener);

    fireEvent.mouseDown(items()[0] as HTMLElement);
    expect(input.value).toBe('Paris, France');
    expect((document.querySelector('.pac-container') as HTMLElement).style.display).toBe('none');
    const fetch = control.calls.find((c) => c.kind === 'fetchFields');
    expect(fetch?.request).toEqual({
      placeId: 'paris-id',
      fields: ['displayName', 'formattedAddress'],
    });
    expect(fetch?.tokenId).toBe('token-1');
    await flush();
    expect(listener).not.toHaveBeenCalled();
    expect(shim.getPlace()).toEqual({ name: 'Paris, France' });

    control.pending[0]?.resolve();
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(shim.getPlace()).toEqual({ name: 'Paris', formatted_address: 'Paris, France' });
  });

  it('closes the session with the details and renews the token afterwards', async () => {
    const { control, input } = setup({ fields: ['name'] });
    control.onFetchFields('paris-id', PARIS_PLACE);
    await showPredictions(control, input);
    fireEvent.mouseDown(items()[0] as HTMLElement);
    await flush();
    const sequence = kinds(control);
    expect(sequence.indexOf('fetchFields')).toBeLessThan(sequence.lastIndexOf('newToken'));
    expect(control.sessions.get('token-1')).toEqual({ suggest: 1, fetchFields: 1, closed: true });

    control.onSuggest('ro', [PARMA]);
    type(input, 'ro');
    await flush();
    const calls = suggestCalls(control);
    expect(calls[calls.length - 1]?.tokenId).toBe('token-2');
    expect(control.sessions.get('token-2')?.closed).toBe(false);
  });

  it('requests every field when no fields are set', async () => {
    const { control, input } = setup();
    control.onFetchFields('paris-id', PARIS_PLACE);
    await showPredictions(control, input);
    fireEvent.mouseDown(items()[0] as HTMLElement);
    const fetch = control.calls.find((c) => c.kind === 'fetchFields');
    const fields = (fetch as { request: { fields: string[] } }).request.fields;
    expect(fields).toEqual(expect.arrayContaining(['displayName', 'formattedAddress', 'location']));
    expect(fields.length).toBeGreaterThan(20);
  });

  it('selects with the keyboard', async () => {
    const { control, input, shim } = setup({ fields: ['name'] });
    control.onFetchFields('parma-id', { id: 'parma-id', displayName: 'Parma' });
    await showPredictions(control, input);
    const listener = vi.fn();
    shim.addListener('place_changed', listener);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(shim.getPlace()).toEqual({ name: 'Parma' });
  });

  it('falls back to the input text when details fail', async () => {
    const { control, input, shim } = setup({ fields: ['name'] });
    await showPredictions(control, input);
    const listener = vi.fn();
    shim.addListener('place_changed', listener);
    fireEvent.mouseDown(items()[1] as HTMLElement);
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(shim.getPlace()).toEqual({ name: 'Parma, Italy' });
    expect(kinds(control).filter((k) => k === 'newToken')).toHaveLength(2);
  });

  it('discards stale details when a newer selection started', async () => {
    const { control, input, shim } = setup({ fields: ['name'] });
    control.onFetchFields('paris-id', PARIS_PLACE, { deferred: true });
    control.onFetchFields('parma-id', { id: 'parma-id', displayName: 'Parma' }, { deferred: true });
    await showPredictions(control, input);
    const listener = vi.fn();
    shim.addListener('place_changed', listener);
    fireEvent.mouseDown(items()[0] as HTMLElement);
    type(input, 'pa');
    await flush();
    fireEvent.mouseDown(items()[1] as HTMLElement);
    expect(control.pending).toHaveLength(2);
    control.pending[1]?.resolve();
    await flush();
    control.pending[0]?.resolve();
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(shim.getPlace()).toEqual({ name: 'Parma' });
  });

  it('Enter without a selection emits a place with only the name', async () => {
    const { control, input, shim } = setup();
    await showPredictions(control, input);
    const listener = vi.fn();
    shim.addListener('place_changed', listener);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(shim.getPlace()).toEqual({ name: 'pa' });
    expect(control.calls.some((c) => c.kind === 'fetchFields')).toBe(false);
  });

  it('Enter without a selection drops pending details', async () => {
    const { control, input, shim } = setup({ fields: ['name'] });
    control.onFetchFields('paris-id', PARIS_PLACE, { deferred: true });
    await showPredictions(control, input);
    const listener = vi.fn();
    shim.addListener('place_changed', listener);
    fireEvent.mouseDown(items()[0] as HTMLElement);
    type(input, 'Paris!');
    fireEvent.keyDown(input, { key: 'Enter' });
    control.pending[0]?.resolve();
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(shim.getPlace()).toEqual({ name: 'Paris!' });
  });

  it('drops a suggestion response that arrives after a selection', async () => {
    const { control, input, shim } = setup({ fields: ['name'] });
    control.onFetchFields('paris-id', PARIS_PLACE, { times: 2 });
    control.onFetchFields('parma-id', { id: 'parma-id', displayName: 'Parma' });
    await showPredictions(control, input);
    control.onSuggest('par', [PARIS, PARMA], { deferred: true });
    type(input, 'par');
    const listener = vi.fn();
    shim.addListener('place_changed', listener);
    fireEvent.mouseDown(items()[0] as HTMLElement);
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);

    control.pending[0]?.resolve();
    await flush();
    const container = document.querySelector('.pac-container') as HTMLElement;
    expect(container.style.display).toBe('none');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(items()).toHaveLength(0);
    expect(input.value).toBe('Paris, France');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(container.style.display).toBe('none');
    for (const [, counts] of control.sessions) expect(counts.fetchFields).toBeLessThanOrEqual(1);

    control.onSuggest('pari', [PARIS, PARMA]);
    type(input, 'pari');
    await flush();
    fireEvent.mouseDown(items()[1] as HTMLElement);
    await flush();
    const fetches = control.calls.filter((c) => c.kind === 'fetchFields');
    expect(fetches.map((c) => c.tokenId)).toEqual(['token-1', 'token-2']);
    expect(control.sessions.get('token-2')).toEqual({ suggest: 1, fetchFields: 1, closed: true });
  });

  it('Enter without a selection drops a pending suggestion response', async () => {
    const { control, input } = setup();
    control.onSuggest('pa', [PARIS, PARMA], { deferred: true });
    type(input, 'pa');
    fireEvent.keyDown(input, { key: 'Enter' });
    control.pending[0]?.resolve();
    await flush();
    expect(items()).toHaveLength(0);
    expect((document.querySelector('.pac-container') as HTMLElement).style.display).toBe('none');
  });

  it('arrows after a selection do not reopen the predictions of the closed session', async () => {
    const { control, input } = setup({ fields: ['name'] });
    control.onFetchFields('paris-id', PARIS_PLACE);
    control.onFetchFields('parma-id', { id: 'parma-id', displayName: 'Parma' });
    await showPredictions(control, input);
    fireEvent.mouseDown(items()[0] as HTMLElement);
    await flush();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect((document.querySelector('.pac-container') as HTMLElement).style.display).toBe('none');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await flush();
    const fetches = control.calls.filter((c) => c.kind === 'fetchFields');
    expect(fetches.map((c) => c.tokenId)).toEqual(['token-1']);
    expect(input.value).toBe('Paris, France');
  });

  it('a late response for an old token does not replace a newer prediction', async () => {
    const { control, input } = setup({ fields: ['name'] });
    control.onSuggest('p', [PARIS], { deferred: true });
    control.onSuggest('pa', [PARIS]);
    control.onSuggest('pari', [PARIS]);
    control.onFetchFields('paris-id', PARIS_PLACE, { times: 2 });
    type(input, 'p');
    type(input, 'pa');
    await flush();
    fireEvent.mouseDown(items()[0] as HTMLElement);
    await flush();
    type(input, 'pari');
    await flush();
    control.pending[0]?.resolve();
    await flush();
    fireEvent.mouseDown(items()[0] as HTMLElement);
    await flush();
    const fetches = control.calls.filter((c) => c.kind === 'fetchFields');
    expect(fetches.map((c) => c.tokenId)).toEqual(['token-1', 'token-2']);
    expect(control.sessions.get('token-1')).toEqual({ suggest: 2, fetchFields: 1, closed: true });
    expect(control.sessions.get('token-2')).toEqual({ suggest: 1, fetchFields: 1, closed: true });
  });

  it('getPlace follows the input text until details arrive', () => {
    const { input, shim } = setup();
    expect(shim.getPlace()).toEqual({ name: '' });
    input.value = 'typed';
    expect(shim.getPlace()).toEqual({ name: 'typed' });
  });
});

describe('createAutocompleteShim listeners', () => {
  it('remove detaches a listener and can be called twice', () => {
    const { input, shim } = setup();
    const kept = vi.fn();
    const dropped = vi.fn();
    shim.addListener('place_changed', kept);
    const handle = shim.addListener('place_changed', dropped);
    handle.remove();
    handle.remove();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(kept).toHaveBeenCalledTimes(1);
    expect(dropped).not.toHaveBeenCalled();
  });

  it('a listener removed by an earlier one is not called', () => {
    const { input, shim } = setup();
    const later = vi.fn();
    let handle: { remove(): void } | undefined;
    shim.addListener('place_changed', () => handle?.remove());
    handle = shim.addListener('place_changed', later);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(later).not.toHaveBeenCalled();
  });

  it('other event names and non-functions get a no-op remover', () => {
    const { input, shim } = setup();
    const handler = vi.fn();
    const handle = shim.addListener('bounds_changed', handler);
    expect(() => handle.remove()).not.toThrow();
    const bad = shim.addListener('place_changed', 'nope' as unknown as () => void);
    expect(() => bad.remove()).not.toThrow();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('a throwing listener does not stop the others and is rethrown later', () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const { input, shim } = setup();
    const after = vi.fn();
    shim.addListener('place_changed', () => {
      throw new Error('listener failed');
    });
    shim.addListener('place_changed', after);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(after).toHaveBeenCalledTimes(1);
    expect(() => vi.runOnlyPendingTimers()).toThrow('listener failed');
  });

  it('is not driven by google.maps.event', () => {
    const { shim } = setup();
    const listener = vi.fn();
    shim.addListener('place_changed', listener);
    const maps = google.maps as unknown as { event?: unknown };
    expect(maps.event).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('createAutocompleteShim destroy', () => {
  it('stops listening, removes the dropdown and drops pending results', async () => {
    const { control, input, shim } = setup({ fields: ['name'] });
    control.onSuggest('pa', [PARIS], { times: 1 });
    control.onSuggest('par', [PARIS], { deferred: true });
    control.onFetchFields('paris-id', PARIS_PLACE, { deferred: true });
    type(input, 'pa');
    await flush();
    const listener = vi.fn();
    shim.addListener('place_changed', listener);
    fireEvent.mouseDown(items()[0] as HTMLElement);
    type(input, 'par');
    const sent = suggestCalls(control).length;

    shim.destroy();
    shim.destroy();
    expect(document.querySelector('.pac-container')).toBeNull();
    expect(input.hasAttribute('role')).toBe(false);
    for (const reply of control.pending) reply.resolve();
    await flush();
    expect(listener).not.toHaveBeenCalled();
    expect(document.querySelector('.pac-item')).toBeNull();

    type(input, 'paris');
    await flush();
    expect(suggestCalls(control)).toHaveLength(sent);
  });
});
