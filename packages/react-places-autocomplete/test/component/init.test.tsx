import { NEW_API_HINT } from '@places-compat/core';
import {
  actCompat,
  applyFixture,
  createFakeGoogle,
  type FakeControl,
  loadFixture,
  renderCompat,
} from '@places-compat/core/testing';
import { act, fireEvent } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import PlacesAutocomplete from '../../src/PlacesAutocomplete';

type Props = React.ComponentProps<typeof PlacesAutocomplete>;

const MAPS_ERROR =
  '[react-places-autocomplete]: Google Maps JavaScript API library must be loaded. See: https://github.com/kenny-hibino/react-places-autocomplete#load-google-library';
const PLACES_ERROR =
  '[react-places-autocomplete]: Google Maps Places library must be loaded. Please add `libraries=places` to the src URL. See: https://github.com/kenny-hibino/react-places-autocomplete#load-google-library';

const CALLBACK = 'initPlacesForTest';

const globals = globalThis as unknown as Record<string, unknown>;

class Boundary extends React.Component<
  { children: React.ReactNode; onCatch(error: unknown): void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onCatch(error);
  }

  override render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

interface ControlledProps {
  extra: Partial<Props>;
  record(value: string): void;
  render: Props['children'];
}

function Controlled({ extra, record, render }: ControlledProps): React.ReactElement {
  const [value, setValue] = React.useState('');
  return (
    <PlacesAutocomplete
      value={value}
      onChange={(next) => {
        record(next);
        setValue(next);
      }}
      {...extra}
    >
      {render}
    </PlacesAutocomplete>
  );
}

const renderList: Props['children'] = ({ getInputProps, getSuggestionItemProps, suggestions }) => (
  <div>
    <input {...(getInputProps() as React.InputHTMLAttributes<HTMLInputElement>)} />
    {suggestions.map((suggestion) => {
      const { key, ...rest } = getSuggestionItemProps(suggestion);
      return (
        <div key={String(key)} {...(rest as React.HTMLAttributes<HTMLDivElement>)}>
          {suggestion.description}
        </div>
      );
    })}
  </div>
);

function mount(props: Partial<Props> = {}, strict = false) {
  const onChange = vi.fn();
  const rendered = renderCompat(
    <Controlled extra={props} record={onChange} render={renderList} />,
    { strict },
  );
  const input = () => rendered.container.querySelector('input') as HTMLInputElement;
  const options = () => rendered.container.querySelectorAll('[role="option"]');
  return { ...rendered, input, options, onChange };
}

function mountFailing(props: Partial<Props> = {}): unknown[] {
  const caught: unknown[] = [];
  renderCompat(
    <Boundary onCatch={(error) => caught.push(error)}>
      <PlacesAutocomplete value="" onChange={() => {}} {...props}>
        {() => null}
      </PlacesAutocomplete>
    </Boundary>,
  );
  return caught;
}

function suggestCalls(control: FakeControl) {
  return control.calls.filter((call) => call.kind === 'suggest');
}

function type(input: HTMLInputElement, text: string): void {
  fireEvent.change(input, { target: { value: text } });
}

let uninstall: (() => void) | undefined;
let consoleError: MockInstance<typeof console.error>;

function install(options: Parameters<typeof createFakeGoogle>[0] = {}): FakeControl {
  const fake = createFakeGoogle(options);
  uninstall = fake.install();
  return fake.control;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
  delete globals[CALLBACK];
  consoleError.mockRestore();
  vi.useRealTimers();
});

describe('init errors', () => {
  it('throws the first error when window.google is missing', () => {
    const caught = mountFailing();
    expect(caught).toHaveLength(1);
    expect((caught[0] as Error).message).toBe(MAPS_ERROR);
  });

  it('throws the second error when there is no places library and no importLibrary', () => {
    install({ places: 'absent', importLibrary: false });
    const caught = mountFailing();
    expect((caught[0] as Error).message).toBe(PLACES_ERROR);
  });

  it('throws the second error when google.maps itself is missing', () => {
    globals.google = {};
    uninstall = () => {
      delete globals.google;
    };
    const caught = mountFailing();
    expect((caught[0] as Error).message).toBe(PLACES_ERROR);
  });

  it('adds the hint line when only the legacy places library is loaded', () => {
    install({ places: 'legacyOnly', importLibrary: false });
    const caught = mountFailing();
    expect((caught[0] as Error).message).toBe(`${PLACES_ERROR}\n${NEW_API_HINT}`);
  });

  it('leaves the input enabled and throws nothing when the new library is present', () => {
    install();
    const { input } = mount();
    expect(input().disabled).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('loading through importLibrary', () => {
  it('runs one search with the current value once the library has loaded', async () => {
    const control = install({ places: 'viaImportLibrary' });
    applyFixture(control, loadFixture('rpa-mock-suggestions'));
    const { input, options } = mount();
    expect(input().disabled).toBe(false);

    type(input(), 'San');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    type(input(), 'San Francisco');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(suggestCalls(control)).toHaveLength(0);

    await actCompat(async () => {});

    expect(control.calls.filter((call) => call.kind === 'importLibrary')).toHaveLength(1);
    expect(suggestCalls(control).map((call) => call.request)).toEqual([{ input: 'San Francisco' }]);
    expect(options()).toHaveLength(5);
    expect(input().disabled).toBe(false);
  });

  it('loads once and searches once under StrictMode', async () => {
    const control = install({ places: 'viaImportLibrary' });
    applyFixture(control, loadFixture('rpa-mock-suggestions'));
    const { input, options } = mount({}, true);
    type(input(), 'San Francisco');
    act(() => {
      vi.advanceTimersByTime(200);
    });

    await actCompat(async () => {});

    expect(control.calls.filter((call) => call.kind === 'importLibrary')).toHaveLength(1);
    expect(suggestCalls(control)).toHaveLength(1);
    expect(options()).toHaveLength(5);
  });

  it('runs no search after loading when none was requested', async () => {
    const control = install({ places: 'viaImportLibrary' });
    mount();
    await actCompat(async () => {});
    expect(suggestCalls(control)).toHaveLength(0);
  });

  it('searches right away once the library is loaded', async () => {
    const control = install({ places: 'viaImportLibrary' });
    applyFixture(control, loadFixture('rpa-mock-suggestions'));
    const { input, options } = mount();
    await actCompat(async () => {});

    type(input(), 'San Francisco');
    await actCompat(() => {
      vi.advanceTimersByTime(200);
    });

    expect(suggestCalls(control)).toHaveLength(1);
    expect(options()).toHaveLength(5);
  });

  it('logs the second error instead of throwing when the library cannot be loaded', async () => {
    const control = install({ places: 'absent' });
    const { input } = mount();
    type(input(), 'San Francisco');
    act(() => {
      vi.advanceTimersByTime(200);
    });

    await actCompat(async () => {});

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(PLACES_ERROR);
    expect(suggestCalls(control)).toHaveLength(0);
    expect(input().disabled).toBe(false);
  });

  it('logs the hint line when importLibrary only returns the legacy library', async () => {
    install({ places: 'legacyOnly' });
    mount();
    await actCompat(async () => {});
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(`${PLACES_ERROR}\n${NEW_API_HINT}`);
  });

  it('ignores a load that finishes after unmount', async () => {
    install({ places: 'absent' });
    const { unmount } = mount();
    unmount();
    await actCompat(async () => {});
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('ignores a successful load that finishes after unmount', async () => {
    const control = install({ places: 'viaImportLibrary' });
    const { input, unmount } = mount();
    type(input(), 'San Francisco');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    unmount();
    await actCompat(async () => {});
    expect(suggestCalls(control)).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('googleCallbackName', () => {
  it('waits for the callback when places is not loaded yet', async () => {
    const { input } = mount({ googleCallbackName: CALLBACK });
    expect(typeof globals[CALLBACK]).toBe('function');
    expect(input().disabled).toBe(true);

    install();
    act(() => {
      (globals[CALLBACK] as () => void)();
    });
    expect(input().disabled).toBe(false);
  });

  it('loads through importLibrary when the callback runs', async () => {
    const control = install({ places: 'viaImportLibrary' });
    applyFixture(control, loadFixture('rpa-mock-suggestions'));
    const { input, options } = mount({ googleCallbackName: CALLBACK });
    expect(input().disabled).toBe(true);
    expect(control.calls).toHaveLength(0);

    await actCompat(() => {
      (globals[CALLBACK] as () => void)();
    });
    expect(input().disabled).toBe(false);

    type(input(), 'San Francisco');
    await actCompat(() => {
      vi.advanceTimersByTime(200);
    });
    expect(options()).toHaveLength(5);
  });

  it('removes the callback on unmount', () => {
    const { unmount } = mount({ googleCallbackName: CALLBACK });
    expect(CALLBACK in globals).toBe(true);
    unmount();
    expect(CALLBACK in globals).toBe(false);
  });

  it('initialises at mount and sets no callback when places is already loaded', () => {
    install();
    const { input, unmount } = mount({ googleCallbackName: CALLBACK });
    expect(CALLBACK in globals).toBe(false);
    expect(input().disabled).toBe(false);
    unmount();
    expect(CALLBACK in globals).toBe(false);
  });

  it('throws from the callback when the places library is still missing', () => {
    mount({ googleCallbackName: CALLBACK });
    install({ places: 'absent', importLibrary: false });
    expect(() => (globals[CALLBACK] as () => void)()).toThrow(PLACES_ERROR);
  });
});
