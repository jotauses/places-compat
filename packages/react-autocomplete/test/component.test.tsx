import { createRequire } from 'node:module';
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
import { GOOGLE_MAP_SCRIPT_BASE_URL, GOOGLE_NOT_FOUND, SCRIPT_CALLBACK } from '../src/constants';
import ReactGoogleAutocomplete from '../src/index';

const requireUpstream = createRequire(import.meta.url);

type AnyProps = Record<string, unknown>;
type RenderFn = (props: AnyProps, ref: unknown) => React.ReactElement<AnyProps>;

const Component = ReactGoogleAutocomplete as unknown as React.ComponentType<AnyProps>;

let uninstall: (() => void) | undefined;
let errorSpy: MockInstance<typeof console.error>;

function install(): FakeControl {
  const fake = createFakeGoogle();
  uninstall = fake.install();
  const fixture = loadFixture('details-full');
  applyFixture(fake.control, fixture);
  fake.control.onSuggest(fixture.request.input, fixture.new.suggestions, { times: 10 });
  if (fixture.detailsNew) {
    fake.control.onFetchFields(fixture.detailsNew.id, fixture.detailsNew, { times: 10 });
  }
  return fake.control;
}

function mount(props: AnyProps, opts: { strict?: boolean } = {}) {
  const element = (next: AnyProps) => React.createElement(Component, next);
  const rendered = renderCompat(element(props), opts.strict ? { strict: true } : {});
  const input = rendered.container.querySelector('input') as HTMLInputElement;
  return {
    container: rendered.container,
    input,
    rerender: (next: AnyProps) => rendered.rerender(element(next)),
    unmount: () => rendered.unmount(),
  };
}

function containers(): Element[] {
  return Array.from(document.querySelectorAll('.pac-container'));
}

async function select(input: HTMLInputElement): Promise<void> {
  await actCompat(() => {
    fireEvent.input(input, { target: { value: 'Example' } });
  });
  const item = document.querySelector('.pac-item');
  if (!item) throw new Error('no .pac-item');
  await actCompat(() => {
    fireEvent.mouseDown(item);
  });
}

function renderFn(component: unknown): RenderFn {
  return (component as { render: RenderFn }).render;
}

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
  errorSpy.mockRestore();
  delete (window as unknown as Record<string, unknown>)[SCRIPT_CALLBACK];
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('ReactGoogleAutocomplete', () => {
  it('renders an input with the remaining props only', () => {
    install();
    const view = mount({
      id: 'city',
      className: 'field',
      defaultValue: 'Par',
      'data-testid': 'city-input',
      apiKey: undefined,
      libraries: ['places'],
      inputAutocompleteValue: 'one-time-code',
      options: { types: ['address'] },
      googleMapsScriptBaseUrl: GOOGLE_MAP_SCRIPT_BASE_URL,
      language: 'fr',
      onPlaceSelected: () => {},
    });
    expect(view.container.children).toHaveLength(1);
    expect(view.input.id).toBe('city');
    expect(view.input.className).toBe('field pac-target-input');
    expect(view.input.value).toBe('Par');
    expect(view.input.getAttribute('data-testid')).toBe('city-input');
    for (const name of [
      'apikey',
      'libraries',
      'inputautocompletevalue',
      'options',
      'googlemapsscriptbaseurl',
      'language',
      'refprop',
    ]) {
      expect(view.input.hasAttribute(name)).toBe(false);
    }
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('keeps a placeholder passed by the caller', () => {
    install();
    const view = mount({ placeholder: 'City' });
    expect(view.input.getAttribute('placeholder')).toBe('City');
  });

  it('fills a forwarded object ref with the input', () => {
    install();
    const ref = React.createRef<HTMLInputElement>();
    const view = mount({ ref });
    expect(ref.current).toBe(view.input);
  });

  it('does not call a forwarded callback ref', () => {
    install();
    const ref = vi.fn();
    mount({ ref });
    expect(ref).not.toHaveBeenCalled();
  });

  it('calls onPlaceSelected with the place, the input and the widget, twice per selection', async () => {
    install();
    const onPlaceSelected = vi.fn();
    const view = mount({ onPlaceSelected });
    await select(view.input);
    expect(onPlaceSelected).toHaveBeenCalledTimes(2);
    const [place, input, autocomplete] = onPlaceSelected.mock.calls[0] ?? [];
    expect((place as google.maps.places.PlaceResult).place_id).toBe('synthetic-details-full');
    expect(input).toBe(view.input);
    expect(typeof (autocomplete as { getPlace(): unknown }).getPlace).toBe('function');
    expect((autocomplete as { getPlace(): unknown }).getPlace()).toBe(place);
  });

  it('loads the script with apiKey and builds the widget once it is ready', async () => {
    const onPlaceSelected = vi.fn();
    const view = mount({ apiKey: 'test-key', language: 'es', onPlaceSelected });
    const scripts = document.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.src).toBe(
      `${GOOGLE_MAP_SCRIPT_BASE_URL}?libraries=places&key=test-key&language=es&callback=${SCRIPT_CALLBACK}`,
    );
    expect(containers()).toHaveLength(0);
    install();
    await actCompat(() => {
      (window as unknown as Record<string, () => void>)[SCRIPT_CALLBACK]?.();
    });
    expect(containers()).toHaveLength(1);
    await select(view.input);
    expect(onPlaceSelected).toHaveBeenCalledTimes(1);
  });

  it('reports a missing google', () => {
    mount({});
    expect(errorSpy).toHaveBeenCalledWith(GOOGLE_NOT_FOUND);
  });

  it('sets the autofill value after the widget attaches', async () => {
    install();
    const view = mount({ inputAutocompleteValue: 'one-time-code' });
    await actCompat(() => {});
    expect(view.input.getAttribute('autocomplete')).toBe('one-time-code');
  });

  it('removes the dropdown on unmount', () => {
    install();
    const view = mount({});
    expect(containers()).toHaveLength(1);
    view.unmount();
    expect(containers()).toHaveLength(0);
  });

  it('leaves one dropdown under StrictMode and calls onPlaceSelected as often', async () => {
    install();
    const onPlaceSelected = vi.fn();
    const view = mount({ onPlaceSelected }, { strict: true });
    expect(containers()).toHaveLength(1);
    await select(view.input);
    expect(onPlaceSelected).toHaveBeenCalledTimes(2);
  });

  it('is a forwardRef component that passes the ref as refProp', () => {
    const ref = { current: null };
    const element = renderFn(ReactGoogleAutocomplete)({ id: 'a' }, ref);
    expect(element.props).toEqual({ id: 'a', refProp: ref });
  });

  it('declares the same propTypes as the original', () => {
    const upstream = requireUpstream('upstream-rga') as { default: unknown };
    const ours = renderFn(ReactGoogleAutocomplete)({}, null).type as { propTypes?: object };
    const theirs = renderFn(upstream.default)({}, null).type as { propTypes?: object };
    expect(Object.keys(ours.propTypes ?? {})).toEqual(Object.keys(theirs.propTypes ?? {}));
    expect(Object.keys(ours.propTypes ?? {})).toHaveLength(8);
  });
});
