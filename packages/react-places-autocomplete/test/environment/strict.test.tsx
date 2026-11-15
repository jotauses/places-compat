import {
  actCompat,
  applyFixture,
  createFakeGoogle,
  type FakeControl,
  loadFixture,
  renderCompat,
} from '@places-compat/core/testing';
import { fireEvent } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlacesAutocomplete from '../../src/index';

type Props = React.ComponentProps<typeof PlacesAutocomplete>;

const CALLBACK = 'initPlacesInStrictMode';
const fixture = loadFixture('rpa-mock-suggestions');
const globals = window as unknown as Record<string, unknown>;

let uninstall: (() => void) | undefined;

function install(places: 'present' | 'viaImportLibrary' = 'present'): FakeControl {
  const fake = createFakeGoogle({ places });
  uninstall = fake.install();
  applyFixture(fake.control, fixture);
  return fake.control;
}

function Field({
  extra,
  onSelect,
}: {
  extra: Partial<Props>;
  onSelect: (...args: unknown[]) => void;
}): React.ReactElement {
  const [value, setValue] = React.useState('');
  return (
    <PlacesAutocomplete value={value} onChange={setValue} onSelect={onSelect} {...extra}>
      {({ getInputProps, getSuggestionItemProps, suggestions }) => (
        <div>
          <input {...getInputProps()} />
          {suggestions.map((suggestion) => {
            const { key, ...item } = getSuggestionItemProps(suggestion);
            return (
              <div key={key} {...item}>
                {suggestion.description}
              </div>
            );
          })}
        </div>
      )}
    </PlacesAutocomplete>
  );
}

function mountStrict(extra: Partial<Props> = {}) {
  const onSelect = vi.fn();
  const rendered = renderCompat(<Field extra={extra} onSelect={onSelect} />, { strict: true });
  const input = () => rendered.container.querySelector('input') as HTMLInputElement;
  const options = () => rendered.container.querySelectorAll('[role="option"]');
  return { ...rendered, input, options, onSelect };
}

async function search(input: HTMLInputElement): Promise<void> {
  fireEvent.change(input, { target: { value: fixture.request.input } });
  await actCompat(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
}

function count(control: FakeControl, kind: FakeControl['calls'][number]['kind']): number {
  return control.calls.filter((call) => call.kind === kind).length;
}

describe('StrictMode', () => {
  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
    delete globals[CALLBACK];
    vi.useRealTimers();
  });

  it('searches with one request after mounting, unmounting and mounting again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const control = install();
    mountStrict().unmount();
    await actCompat(() => {});

    const view = mountStrict();
    await actCompat(() => {});
    await search(view.input());

    expect(count(control, 'suggest')).toBe(1);
    expect(view.options()).toHaveLength(fixture.new.suggestions.length);

    fireEvent.keyDown(view.input(), { key: 'ArrowDown' });
    fireEvent.keyDown(view.input(), { key: 'Enter' });
    const first = fixture.legacy.predictions[0] as google.maps.places.AutocompletePrediction;
    expect(view.onSelect).toHaveBeenCalledTimes(1);
    expect(view.onSelect).toHaveBeenCalledWith(
      first.description,
      first.place_id,
      expect.objectContaining({ placeId: first.place_id, index: 0 }),
    );
    expect(view.options()).toHaveLength(0);
    view.unmount();
  });

  it('cancels the pending search when the component unmounts', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const control = install();
    const view = mountStrict();
    await actCompat(() => {});
    fireEvent.change(view.input(), { target: { value: fixture.request.input } });
    view.unmount();
    await actCompat(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(count(control, 'suggest')).toBe(0);
  });

  it('loads Places once through importLibrary', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const control = install('viaImportLibrary');
    const view = mountStrict();
    await actCompat(() => {});
    await search(view.input());

    expect(control.calls.filter((call) => call.request === 'places')).toHaveLength(1);
    expect(count(control, 'suggest')).toBe(1);
    expect(view.options()).toHaveLength(fixture.new.suggestions.length);
    view.unmount();
  });

  it('keeps window[googleCallbackName] registered across the remount and removes it on unmount', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const control = install('viaImportLibrary');
    const view = mountStrict({ googleCallbackName: CALLBACK });
    await actCompat(() => {});

    expect(typeof globals[CALLBACK]).toBe('function');
    expect(view.input().disabled).toBe(true);
    expect(count(control, 'importLibrary')).toBe(0);

    await actCompat(() => {
      (globals[CALLBACK] as () => void)();
    });
    expect(view.input().disabled).toBe(false);

    await search(view.input());
    expect(count(control, 'importLibrary')).toBe(1);
    expect(count(control, 'suggest')).toBe(1);
    expect(view.options()).toHaveLength(fixture.new.suggestions.length);

    view.unmount();
    expect(globals[CALLBACK]).toBeUndefined();
  });

  it('initialises at mount without registering the callback when Places is loaded', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const control = install();
    const view = mountStrict({ googleCallbackName: CALLBACK });
    await actCompat(() => {});

    expect(globals[CALLBACK]).toBeUndefined();
    expect(view.input().disabled).toBe(false);
    await search(view.input());
    expect(count(control, 'suggest')).toBe(1);
    view.unmount();
  });
});
