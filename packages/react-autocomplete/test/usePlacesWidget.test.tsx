import { NEW_API_HINT } from '@places-compat/core';
import {
  actCompat,
  applyFixture,
  createFakeGoogle,
  type FakeControl,
  loadFixture,
  renderCompat,
} from '@places-compat/core/testing';
import { fireEvent } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import {
  GOOGLE_MAP_SCRIPT_BASE_URL,
  GOOGLE_NOT_FOUND,
  INPUT_NOT_HTML,
  PLACES_NOT_LOADED,
  SCRIPT_CALLBACK,
} from '../src/constants';
import type { ReactGoogleAutocompleteProps } from '../src/types';
import usePlacesWidget from '../src/usePlacesWidget';
import { isBrowser } from '../src/utils';
import { type AutocompleteShim, createAutocompleteShim } from '../src/widget/shim';

vi.mock('../src/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils')>();
  return { ...actual, isBrowser: vi.fn(actual.isBrowser) };
});

vi.mock('../src/widget/shim', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/widget/shim')>();
  const setters = [
    'setBounds',
    'setComponentRestrictions',
    'setFields',
    'setOptions',
    'setTypes',
  ] as const;
  return {
    ...actual,
    createAutocompleteShim: vi.fn((...args: Parameters<typeof actual.createAutocompleteShim>) => {
      const shim = actual.createAutocompleteShim(...args);
      for (const name of setters) vi.spyOn(shim, name);
      return shim;
    }),
  };
});

const DEFAULT_FIELDS = ['address_components', 'geometry.location', 'place_id', 'formatted_address'];
const BASE = GOOGLE_MAP_SCRIPT_BASE_URL;

type Props = ReactGoogleAutocompleteProps & { ref?: unknown };
type Handle = ReturnType<typeof usePlacesWidget<HTMLInputElement>>;

let uninstall: (() => void) | undefined;
let errorSpy: MockInstance<typeof console.error>;

function install(opts: Parameters<typeof createFakeGoogle>[0] = {}) {
  const fake = createFakeGoogle(opts);
  uninstall = fake.install();
  return fake;
}

function Field(props: { config: Props; seen: Handle[]; as?: 'textarea' }) {
  const handle = usePlacesWidget<HTMLInputElement>(props.config);
  props.seen.push(handle);
  return props.as === 'textarea'
    ? React.createElement('textarea', {
        ref: handle.ref as unknown as React.Ref<HTMLTextAreaElement>,
      })
    : React.createElement('input', { ref: handle.ref });
}

function mount(config: Props, opts: { strict?: boolean; as?: 'textarea' } = {}) {
  const seen: Handle[] = [];
  const element = (next: Props) =>
    React.createElement(
      Field,
      opts.as ? { config: next, seen, as: opts.as } : { config: next, seen },
    );
  const rendered = renderCompat(element(config), opts.strict ? { strict: true } : {});
  const input = rendered.container.querySelector('input, textarea') as HTMLInputElement;
  return {
    input,
    seen,
    shim: () =>
      seen[seen.length - 1]?.autocompleteRef.current as unknown as AutocompleteShim | null,
    rerender: (next: Props) => rendered.rerender(element(next)),
    unmount: () => rendered.unmount(),
  };
}

function flush(): Promise<void> {
  return actCompat(() => {});
}

function containers(): Element[] {
  return Array.from(document.querySelectorAll('.pac-container'));
}

async function type(input: HTMLInputElement, text: string): Promise<void> {
  await actCompat(() => {
    fireEvent.input(input, { target: { value: text } });
  });
}

async function pick(index = 0): Promise<void> {
  const item = document.querySelectorAll('.pac-item')[index];
  if (!item) throw new Error(`no .pac-item at ${index}`);
  await actCompat(() => {
    fireEvent.mouseDown(item);
  });
}

function withExample(control: FakeControl) {
  const fixture = loadFixture('details-full');
  applyFixture(control, fixture);
  control.onSuggest(fixture.request.input, fixture.new.suggestions, { times: 10 });
  if (fixture.detailsNew) {
    control.onFetchFields(fixture.detailsNew.id, fixture.detailsNew, { times: 10 });
  }
  return fixture;
}

function suggestCalls(control: FakeControl) {
  return control.calls.filter((call) => call.kind === 'suggest');
}

function scripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll('script'));
}

function callback(): () => void {
  return (window as unknown as Record<string, () => void>)[SCRIPT_CALLBACK] as () => void;
}

function setterCalls(shim: AutocompleteShim | null, name: keyof AutocompleteShim): unknown[][] {
  return vi.mocked(shim?.[name] as (...args: unknown[]) => unknown).mock.calls;
}

function clearSetters(shim: AutocompleteShim | null): void {
  for (const name of [
    'setBounds',
    'setComponentRestrictions',
    'setFields',
    'setOptions',
    'setTypes',
  ] as const) {
    vi.mocked(shim?.[name] as (...args: unknown[]) => unknown).mockClear();
  }
}

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(createAutocompleteShim).mockClear();
});

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
  errorSpy.mockRestore();
  vi.mocked(isBrowser).mockReset();
  vi.mocked(isBrowser).mockImplementation(() => typeof window !== 'undefined');
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>)[SCRIPT_CALLBACK];
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('mounting without apiKey', () => {
  it('builds the widget synchronously on the input when places is loaded', () => {
    install();
    const view = mount({});
    expect(view.shim()).not.toBeNull();
    expect(view.input.classList.contains('pac-target-input')).toBe(true);
    expect(containers()).toHaveLength(1);
    expect(scripts()).toHaveLength(0);
    expect(createAutocompleteShim).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('passes the default options to the widget', () => {
    const fake = install();
    const view = mount({});
    const [input, places, config] = vi.mocked(createAutocompleteShim).mock.calls[0] ?? [];
    expect(input).toBe(view.input);
    expect(places).toBe(fake.google.maps.places);
    expect(config).toEqual({ fields: DEFAULT_FIELDS, types: ['(cities)'], bounds: undefined });
    expect(Object.keys(config ?? {})).not.toContain('componentRestrictions');
  });

  it('passes custom options, including componentRestrictions when set', () => {
    const fake = install();
    const bounds = { north: 2, south: 1, east: 2, west: 1 };
    mount({
      options: {
        types: ['address'],
        fields: ['name'],
        bounds,
        componentRestrictions: { country: 'fr' },
        strictBounds: true,
      },
    });
    const config = vi.mocked(createAutocompleteShim).mock.calls[0]?.[2];
    expect(config).toEqual({
      strictBounds: true,
      fields: ['name'],
      types: ['address'],
      bounds,
      componentRestrictions: { country: 'fr' },
    });
    expect(fake.control.calls.filter((call) => call.kind === 'newToken')).toHaveLength(1);
  });

  it('waits for importLibrary when places is not on google.maps yet', async () => {
    install({ places: 'viaImportLibrary' });
    const view = mount({});
    expect(view.shim()).toBeNull();
    await flush();
    expect(view.shim()).not.toBeNull();
    expect(containers()).toHaveLength(1);
  });

  it('does nothing outside a browser', () => {
    install();
    vi.mocked(isBrowser).mockReturnValue(false);
    const ref = { current: null };
    const view = mount({ ref });
    expect(view.shim()).toBeNull();
    expect(ref.current).toBeNull();
    expect(containers()).toHaveLength(0);
    expect(view.input.getAttribute('autocomplete')).toBeNull();
  });
});

describe('mounting with apiKey', () => {
  it('injects the script with the exact URL and builds the widget once it loads', async () => {
    const view = mount({ apiKey: 'test-key' });
    const injected = scripts();
    expect(injected).toHaveLength(1);
    expect(injected[0]?.src).toBe(
      `${BASE}?libraries=places&key=test-key&callback=${SCRIPT_CALLBACK}`,
    );
    expect(injected[0]?.parentNode).toBe(document.body);
    expect(view.shim()).toBeNull();
    install();
    await actCompat(() => callback()());
    expect(view.shim()).not.toBeNull();
    expect(containers()).toHaveLength(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('adds language, joins libraries and uses a custom base URL', () => {
    mount({
      apiKey: 'test-key',
      language: 'fr',
      libraries: ['places', 'geometry'],
      googleMapsScriptBaseUrl: 'https://maps.example.test/js',
    });
    expect(scripts()[0]?.src).toBe(
      `https://maps.example.test/js?libraries=places%2Cgeometry&key=test-key&language=fr&callback=${SCRIPT_CALLBACK}`,
    );
  });

  it('does not encode the apiKey', () => {
    mount({ apiKey: 'test-key&loading=async' });
    expect(scripts()[0]?.src).toBe(
      `${BASE}?libraries=places&key=test-key&loading=async&callback=${SCRIPT_CALLBACK}`,
    );
  });

  it('skips the script when google.maps.api is already there', async () => {
    install({ mapsApiFlag: true });
    const view = mount({ apiKey: 'test-key' });
    expect(view.shim()).toBeNull();
    await flush();
    expect(scripts()).toHaveLength(0);
    expect(view.shim()).not.toBeNull();
  });

  it('ignores a script that loads after unmount', async () => {
    const view = mount({ apiKey: 'test-key' });
    view.unmount();
    install();
    await actCompat(() => callback()());
    expect(createAutocompleteShim).not.toHaveBeenCalled();
    expect(containers()).toHaveLength(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('ignores apiKey and language changes after mount', async () => {
    const view = mount({ apiKey: 'test-key' });
    view.rerender({ apiKey: 'other-key', language: 'de' });
    expect(scripts()).toHaveLength(1);
    install();
    await actCompat(() => callback()());
    expect(createAutocompleteShim).toHaveBeenCalledTimes(1);
  });
});

describe('errors', () => {
  it('reports a missing google', () => {
    const view = mount({});
    expect(errorSpy.mock.calls).toEqual([[GOOGLE_NOT_FOUND]]);
    expect(view.shim()).toBeNull();
  });

  it('reports a missing google after the script loads', async () => {
    mount({ apiKey: 'test-key' });
    await actCompat(() => callback()());
    expect(errorSpy.mock.calls).toEqual([[GOOGLE_NOT_FOUND]]);
  });

  it('reports missing places when importLibrary is not available', async () => {
    install({ places: 'absent', importLibrary: false });
    mount({});
    await flush();
    expect(errorSpy.mock.calls).toEqual([[PLACES_NOT_LOADED]]);
  });

  it('reports places that fail to import', async () => {
    install({ places: 'absent' });
    mount({});
    await flush();
    expect(errorSpy.mock.calls).toEqual([[PLACES_NOT_LOADED]]);
  });

  it('adds the hint when only the legacy places library is available', async () => {
    install({ places: 'legacyOnly' });
    const view = mount({});
    await flush();
    expect(errorSpy.mock.calls).toEqual([[`${PLACES_NOT_LOADED}\n${NEW_API_HINT}`]]);
    expect(view.shim()).toBeNull();
    expect(containers()).toHaveLength(0);
  });

  it('reports a ref that is not an input', () => {
    install();
    const view = mount({}, { as: 'textarea' });
    expect(errorSpy.mock.calls).toEqual([[INPUT_NOT_HTML]]);
    expect(view.shim()).toBeNull();
    expect(containers()).toHaveLength(0);
  });

  it('does not report a pending import cancelled by unmount', async () => {
    install({ places: 'legacyOnly' });
    const view = mount({});
    view.unmount();
    await flush();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not build a widget when the import finishes after unmount', async () => {
    install({ places: 'viaImportLibrary' });
    const view = mount({});
    view.unmount();
    await flush();
    expect(createAutocompleteShim).not.toHaveBeenCalled();
    expect(containers()).toHaveLength(0);
  });
});

describe('ref prop', () => {
  it('fills an empty object ref with the input', () => {
    install();
    const ref: { current: HTMLInputElement | null } = { current: null };
    const view = mount({ ref });
    expect(ref.current).toBe(view.input);
  });

  it('leaves an object ref that already has a value', () => {
    install();
    const other = document.createElement('input');
    const ref = { current: other };
    mount({ ref });
    expect(ref.current).toBe(other);
  });

  it('does not call a callback ref', () => {
    install();
    const ref = vi.fn();
    mount({ ref });
    expect(ref).not.toHaveBeenCalled();
  });

  it('returns the input in ref and the widget in autocompleteRef', () => {
    install();
    const view = mount({});
    const handle = view.seen[view.seen.length - 1];
    expect(handle?.ref.current).toBe(view.input);
    expect(handle?.autocompleteRef.current).toBe(view.shim());
    expect(typeof view.shim()?.getPlace).toBe('function');
  });
});

describe('onPlaceSelected', () => {
  it('receives the place, the input element and the widget, twice per selection', async () => {
    const { control } = install();
    withExample(control);
    const onPlaceSelected = vi.fn();
    const view = mount({ onPlaceSelected });
    await type(view.input, 'Example');
    expect(document.querySelectorAll('.pac-item').length).toBeGreaterThan(0);
    await pick();
    expect(onPlaceSelected).toHaveBeenCalledTimes(2);
    const [place, input, autocomplete] = onPlaceSelected.mock.calls[0] ?? [];
    expect(input).toBe(view.input);
    expect(autocomplete).toBe(view.shim());
    expect(Object.keys(place as object).sort()).toEqual(
      ['address_components', 'formatted_address', 'geometry', 'place_id'].sort(),
    );
    expect(Object.keys((place as google.maps.places.PlaceResult).geometry ?? {})).toEqual([
      'location',
    ]);
    expect(onPlaceSelected.mock.calls[1]).toEqual(onPlaceSelected.mock.calls[0]);
  });

  it('receives { name } when Enter is pressed without a highlighted item', async () => {
    install();
    const onPlaceSelected = vi.fn();
    const view = mount({ onPlaceSelected });
    view.input.value = 'Somewhere';
    await actCompat(() => {
      fireEvent.keyDown(view.input, { key: 'Enter' });
    });
    expect(onPlaceSelected).toHaveBeenCalledTimes(2);
    expect(onPlaceSelected.mock.calls[0]?.[0]).toEqual({ name: 'Somewhere' });
  });

  it('fires once per selection when the widget is built after mount', async () => {
    const { control } = install({ places: 'viaImportLibrary' });
    withExample(control);
    const onPlaceSelected = vi.fn();
    const view = mount({ onPlaceSelected });
    await flush();
    await type(view.input, 'Example');
    await pick();
    expect(onPlaceSelected).toHaveBeenCalledTimes(1);
  });

  it('keeps the same listeners when the callback does not change', async () => {
    const { control } = install();
    withExample(control);
    const onPlaceSelected = vi.fn();
    const view = mount({ onPlaceSelected });
    view.rerender({ onPlaceSelected });
    view.rerender({ onPlaceSelected });
    await type(view.input, 'Example');
    await pick();
    expect(onPlaceSelected).toHaveBeenCalledTimes(2);
  });

  it('subscribes the new callback when its identity changes', async () => {
    const { control } = install();
    withExample(control);
    const first = vi.fn();
    const second = vi.fn();
    const view = mount({ onPlaceSelected: first });
    view.rerender({ onPlaceSelected: second });
    await type(view.input, 'Example');
    await pick();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(second.mock.calls[0]?.[1]).toBe(view.input);
  });

  it('stops calling a callback that is removed later', async () => {
    const { control } = install();
    withExample(control);
    const first = vi.fn();
    const view = mount({ onPlaceSelected: first });
    view.rerender({});
    await type(view.input, 'Example');
    await pick();
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('works without a callback', async () => {
    const { control } = install();
    withExample(control);
    const view = mount({});
    await type(view.input, 'Example');
    await pick();
    expect(view.shim()?.getPlace().place_id).toBe('synthetic-details-full');
  });
});

describe('autofill', () => {
  it('sets autocomplete to new-password once the widget turns it off', async () => {
    install();
    const view = mount({});
    await flush();
    expect(view.input.getAttribute('autocomplete')).toBe('new-password');
  });

  it('uses a custom inputAutocompleteValue', async () => {
    install();
    const view = mount({ inputAutocompleteValue: 'one-time-code' });
    await flush();
    expect(view.input.getAttribute('autocomplete')).toBe('one-time-code');
  });

  it('applies the value when the widget is built after the script loads', async () => {
    const view = mount({ apiKey: 'test-key' });
    install();
    await actCompat(() => callback()());
    expect(view.input.getAttribute('autocomplete')).toBe('new-password');
  });

  it('only reacts to the first change', async () => {
    install();
    const view = mount({});
    await flush();
    view.input.setAttribute('autocomplete', 'off');
    await flush();
    expect(view.input.getAttribute('autocomplete')).toBe('off');
  });

  it('leaves the attribute alone when no widget is built', async () => {
    const view = mount({});
    await flush();
    expect(view.input.getAttribute('autocomplete')).toBeNull();
  });

  it('skips the workaround without MutationObserver', async () => {
    vi.stubGlobal('MutationObserver', undefined);
    install();
    const view = mount({});
    await flush();
    expect(view.input.getAttribute('autocomplete')).toBe('off');
  });

  it('skips the workaround on an element that is not an input', async () => {
    install();
    const view = mount({}, { as: 'textarea' });
    view.input.setAttribute('autocomplete', 'off');
    await flush();
    expect(view.input.getAttribute('autocomplete')).toBe('off');
  });
});

describe('option effects', () => {
  it('calls the setters once on a synchronous mount', () => {
    install();
    const view = mount({});
    const shim = view.shim();
    expect(setterCalls(shim, 'setFields')).toEqual([[DEFAULT_FIELDS]]);
    expect(setterCalls(shim, 'setBounds')).toEqual([[undefined]]);
    expect(setterCalls(shim, 'setComponentRestrictions')).toEqual([[undefined]]);
    expect(setterCalls(shim, 'setOptions')).toEqual([[{}]]);
    expect(setterCalls(shim, 'setTypes')).toEqual([]);
  });

  it('does not call the setters on mount when the widget is built later', async () => {
    install({ places: 'viaImportLibrary' });
    const view = mount({});
    await flush();
    const shim = view.shim();
    expect(setterCalls(shim, 'setFields')).toEqual([]);
    expect(setterCalls(shim, 'setOptions')).toEqual([]);
  });

  it('calls setFields and setOptions on every render with the defaults', () => {
    install();
    const view = mount({});
    const shim = view.shim();
    clearSetters(shim);
    view.rerender({});
    expect(setterCalls(shim, 'setFields')).toEqual([[DEFAULT_FIELDS]]);
    expect(setterCalls(shim, 'setOptions')).toEqual([[{}]]);
    expect(setterCalls(shim, 'setBounds')).toEqual([]);
    expect(setterCalls(shim, 'setComponentRestrictions')).toEqual([]);
  });

  it('passes new option values to the matching setters', () => {
    install();
    const view = mount({});
    const shim = view.shim();
    clearSetters(shim);
    const bounds = { north: 2, south: 1, east: 2, west: 1 };
    const componentRestrictions = { country: ['fr', 'be'] };
    const fields = ['place_id'];
    view.rerender({
      options: { bounds, componentRestrictions, fields, strictBounds: true, types: ['address'] },
    });
    expect(setterCalls(shim, 'setFields')).toEqual([[fields]]);
    expect(setterCalls(shim, 'setBounds')).toEqual([[bounds]]);
    expect(setterCalls(shim, 'setComponentRestrictions')).toEqual([[componentRestrictions]]);
    expect(setterCalls(shim, 'setOptions')).toEqual([[{ strictBounds: true }]]);
    expect(setterCalls(shim, 'setTypes')).toEqual([]);
  });

  it('skips setters whose value keeps its identity', () => {
    install();
    const fields = ['place_id'];
    const bounds = { north: 2, south: 1, east: 2, west: 1 };
    const view = mount({ options: { fields, bounds } });
    const shim = view.shim();
    clearSetters(shim);
    view.rerender({ options: { fields, bounds } });
    expect(setterCalls(shim, 'setFields')).toEqual([]);
    expect(setterCalls(shim, 'setBounds')).toEqual([]);
    expect(setterCalls(shim, 'setOptions')).toEqual([[{}]]);
  });

  it('ignores a change of types after mount', async () => {
    const { control } = install();
    const view = mount({});
    view.rerender({ options: { types: ['address'] } });
    expect(setterCalls(view.shim(), 'setTypes')).toEqual([]);
    await type(view.input, 'Par');
    const request = suggestCalls(control)[0]?.request as google.maps.places.AutocompleteRequest;
    expect(request.includedPrimaryTypes).toEqual(['(cities)']);
  });
});

describe('unmount', () => {
  it('removes the dropdown, the listeners and the widget', async () => {
    const { control } = withFake();
    const onPlaceSelected = vi.fn();
    const view = mount({ onPlaceSelected });
    const handle = view.seen[view.seen.length - 1];
    expect(containers()).toHaveLength(1);
    view.unmount();
    expect(containers()).toHaveLength(0);
    expect(handle?.autocompleteRef.current).not.toBeNull();
    fireEvent.input(view.input, { target: { value: 'Example' } });
    fireEvent.keyDown(view.input, { key: 'Enter' });
    await flush();
    expect(suggestCalls(control)).toHaveLength(0);
    expect(onPlaceSelected).not.toHaveBeenCalled();
  });
});

interface Seen {
  mounted?: unknown;
  cleanup?: unknown;
  place?: unknown;
}

function Probe(props: { seen: Seen; onHandle: (handle: Handle) => void }) {
  const handle = usePlacesWidget<HTMLInputElement>({});
  props.onHandle(handle);
  const { autocompleteRef } = handle;
  const { seen } = props;
  React.useEffect(() => {
    seen.mounted = autocompleteRef.current;
    return () => {
      seen.cleanup = autocompleteRef.current;
      seen.place = autocompleteRef.current?.getPlace();
    };
  }, [autocompleteRef, seen]);
  return React.createElement('input', { ref: handle.ref });
}

describe('autocompleteRef after unmount', () => {
  it('still holds the widget for cleanups that run later', () => {
    withFake();
    const seen: Seen = {};
    let handle: Handle | undefined;
    const rendered = renderCompat(
      React.createElement(Probe, {
        seen,
        onHandle: (next: Handle) => {
          handle = next;
        },
      }),
    );
    expect(seen.mounted).toBeTruthy();
    rendered.unmount();
    expect(seen.cleanup).toBe(seen.mounted);
    expect(seen.place).toEqual({ name: '' });
    expect(handle?.autocompleteRef.current).toBe(seen.mounted);
    expect(containers()).toHaveLength(0);
  });

  it('points at the new widget after a StrictMode remount', async () => {
    const { control } = withFake();
    const onPlaceSelected = vi.fn();
    const view = mount({ onPlaceSelected }, { strict: true });
    expect(containers()).toHaveLength(1);
    const { results } = vi.mocked(createAutocompleteShim).mock;
    expect(view.shim()).toBe(results[results.length - 1]?.value);
    await type(view.input, 'Example');
    expect(suggestCalls(control)).toHaveLength(1);
  });
});

describe('StrictMode', () => {
  it('leaves one dropdown and calls onPlaceSelected as often as without it', async () => {
    const counts: number[] = [];
    for (const strict of [false, true]) {
      const { control } = install();
      withExample(control);
      const onPlaceSelected = vi.fn();
      const view = mount({ onPlaceSelected }, { strict });
      expect(containers()).toHaveLength(1);
      await type(view.input, 'Example');
      await pick();
      counts.push(onPlaceSelected.mock.calls.length);
      view.unmount();
      uninstall?.();
      uninstall = undefined;
      document.body.innerHTML = '';
    }
    expect(counts).toEqual([2, 2]);
  });

  it('injects one script and builds one widget with apiKey', async () => {
    const onPlaceSelected = vi.fn();
    const view = mount({ apiKey: 'test-key', onPlaceSelected }, { strict: true });
    expect(scripts()).toHaveLength(1);
    withFake();
    await actCompat(() => callback()());
    expect(containers()).toHaveLength(1);
    expect(createAutocompleteShim).toHaveBeenCalledTimes(1);
    await type(view.input, 'Example');
    await pick();
    expect(onPlaceSelected).toHaveBeenCalledTimes(1);
  });
});

function withFake() {
  const fake = install();
  withExample(fake.control);
  return fake;
}
