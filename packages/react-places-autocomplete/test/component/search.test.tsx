import {
  actCompat,
  applyFixture,
  createFakeGoogle,
  type FakeControl,
  fakeMapsError,
  loadFixture,
  renderCompat,
} from '@places-compat/core/testing';
import { fireEvent } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import PlacesAutocomplete from '../../src/PlacesAutocomplete';

type Props = React.ComponentProps<typeof PlacesAutocomplete>;
type RenderArg = Parameters<Props['children']>[0];

const ON_ERROR_MESSAGE =
  '[react-places-autocomplete]: error happened when fetching data from Google Maps API.\nPlease check the docs here (https://developers.google.com/maps/documentation/javascript/places#place_details_responses)\nStatus: ';

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

function mount(props: Partial<Props> = {}) {
  const onChange = vi.fn();
  const seen: RenderArg[] = [];
  const children = (arg: RenderArg) => {
    seen.push(arg);
    return (
      <div>
        <input {...(arg.getInputProps() as React.InputHTMLAttributes<HTMLInputElement>)} />
        {arg.suggestions.map((suggestion) => {
          const { key, ...rest } = arg.getSuggestionItemProps(suggestion);
          return (
            <div key={String(key)} {...(rest as React.HTMLAttributes<HTMLDivElement>)}>
              {suggestion.description}
            </div>
          );
        })}
      </div>
    );
  };
  const element = (extra: Partial<Props>) => (
    <Controlled extra={extra} record={onChange} render={children} />
  );
  const rendered = renderCompat(element(props));
  const input = () => rendered.container.querySelector('input') as HTMLInputElement;
  return {
    ...rendered,
    input,
    onChange,
    latest: () => seen[seen.length - 1] as RenderArg,
    loadingValues: () => seen.map((arg) => arg.loading),
    rerender: (next: Partial<Props>) => rendered.rerender(element(next)),
  };
}

async function search(input: HTMLInputElement, text: string, wait = 200): Promise<void> {
  fireEvent.change(input, { target: { value: text } });
  await actCompat(() => {
    vi.advanceTimersByTime(wait);
  });
}

function suggestCalls(control: FakeControl) {
  return control.calls.filter((call) => call.kind === 'suggest');
}

let control: FakeControl;
let uninstall: () => void;
let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const fake = createFakeGoogle();
  control = fake.control;
  uninstall = fake.install();
  applyFixture(control, loadFixture('rpa-mock-suggestions'));
});

afterEach(() => {
  uninstall();
  consoleError.mockRestore();
  vi.useRealTimers();
});

describe('suggestions', () => {
  it('maps predictions to suggestions in the original shape', async () => {
    const { input, latest } = mount();
    await search(input(), 'San Francisco');

    const { suggestions } = latest();
    expect(suggestions).toHaveLength(5);
    const [first] = suggestions;
    expect(Object.keys(first as object)).toEqual([
      'id',
      'description',
      'placeId',
      'active',
      'index',
      'formattedSuggestion',
      'matchedSubstrings',
      'terms',
      'types',
    ]);
    expect(first).toEqual({
      id: undefined,
      description: 'San Francisco, CA, USA',
      placeId: 'ChIJIQBpAG2ahYAR_6128GcTUEo',
      active: false,
      index: 0,
      formattedSuggestion: { mainText: 'San Francisco', secondaryText: 'CA, USA' },
      matchedSubstrings: [{ length: 13, offset: 0 }],
      terms: expect.any(Array),
      types: ['locality', 'political', 'geocode'],
    });
    expect(suggestions.map((suggestion) => suggestion.index)).toEqual([0, 1, 2, 3, 4]);
    expect(suggestions.every((suggestion) => suggestion.id === undefined)).toBe(true);
  });

  it('marks only the first suggestion active with highlightFirstSuggestion', async () => {
    const { input, latest } = mount({ highlightFirstSuggestion: true });
    await search(input(), 'San Francisco');
    expect(latest().suggestions.map((suggestion) => suggestion.active)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(input().getAttribute('aria-activedescendant')).toBe(
      'PlacesAutocomplete__suggestion-ChIJIQBpAG2ahYAR_6128GcTUEo',
    );
  });

  it('sets loading while the request is in flight', async () => {
    control.reset();
    control.onSuggest('San Francisco', [], { deferred: true });
    const { input, latest, loadingValues } = mount({ onError: () => {} });
    await search(input(), 'San Francisco');
    expect(latest().loading).toBe(true);

    await actCompat(() => {
      control.pending[0]?.resolve();
    });
    expect(latest().loading).toBe(false);
    expect(loadingValues()).toContain(true);
  });

  it('forwards every search option and adds no session token', async () => {
    const { input } = mount({
      searchOptions: {
        componentRestrictions: { country: 'fr' },
        language: 'fr',
        types: ['geocode'],
      },
    });
    await search(input(), 'Paris');
    const calls = suggestCalls(control);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.request).toEqual({
      input: 'Paris',
      includedRegionCodes: ['fr'],
      includedPrimaryTypes: ['geocode'],
      language: 'fr',
    });
    expect(control.calls.some((call) => call.kind === 'newToken')).toBe(false);
  });

  it('forwards a session token the caller provides', async () => {
    const sessionToken = new google.maps.places.AutocompleteSessionToken();
    const { input } = mount({ searchOptions: { sessionToken } });
    await search(input(), 'Paris');
    const request = suggestCalls(control)[0]?.request as { sessionToken?: unknown } | undefined;
    expect(request?.sessionToken).toBe(sessionToken);
  });

  it('applies responses in the order they arrive', async () => {
    control.reset();
    control.onSuggest('San', loadFixture('rpa-mock-suggestions').new.suggestions.slice(0, 2), {
      deferred: true,
    });
    control.onSuggest('San Francisco', loadFixture('rpa-mock-suggestions').new.suggestions, {
      deferred: true,
    });
    const { input, latest } = mount();
    await search(input(), 'San');
    await search(input(), 'San Francisco');

    await actCompat(() => {
      control.pending[1]?.resolve();
    });
    expect(latest().suggestions).toHaveLength(5);
    await actCompat(() => {
      control.pending[0]?.resolve();
    });
    expect(latest().suggestions).toHaveLength(2);
  });
});

describe('onError', () => {
  it('reports ZERO_RESULTS and keeps the current suggestions', async () => {
    control.onSuggest('nothing here', []);
    const onError = vi.fn();
    const { input, latest } = mount({ onError });
    await search(input(), 'San Francisco');
    expect(latest().suggestions).toHaveLength(5);

    await search(input(), 'nothing here');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('ZERO_RESULTS', expect.any(Function));
    expect(latest().suggestions).toHaveLength(5);
    expect(latest().loading).toBe(false);

    const clear = onError.mock.calls[0]?.[1] as () => void;
    await actCompat(() => clear());
    expect(latest().suggestions).toHaveLength(0);
  });

  it('reports an error status and keeps the current suggestions', async () => {
    control.onSuggest('denied', fakeMapsError('PERMISSION_DENIED'));
    const onError = vi.fn();
    const { input, latest } = mount({ onError });
    await search(input(), 'San Francisco');
    await search(input(), 'denied');
    expect(onError).toHaveBeenCalledWith('REQUEST_DENIED', expect.any(Function));
    expect(latest().suggestions).toHaveLength(5);
  });

  it('logs with console.error by default', async () => {
    control.onSuggest('nothing here', []);
    const { input } = mount();
    await search(input(), 'nothing here');
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(ON_ERROR_MESSAGE, 'ZERO_RESULTS');
  });

  it('keeps the original default onError signature', () => {
    const { onError } = PlacesAutocomplete.defaultProps;
    expect(onError.length).toBe(2);
    onError('OVER_QUERY_LIMIT', () => {});
    expect(consoleError).toHaveBeenCalledWith(ON_ERROR_MESSAGE, 'OVER_QUERY_LIMIT');
  });
});

describe('unmount', () => {
  it('ignores a response that arrives after unmount', async () => {
    control.reset();
    control.onSuggest('San Francisco', [], { deferred: true });
    const onError = vi.fn();
    const { input, unmount } = mount({ onError });
    await search(input(), 'San Francisco');
    unmount();

    await actCompat(() => {
      control.pending[0]?.resolve();
    });
    expect(onError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('ignores suggestions that arrive after unmount', async () => {
    control.reset();
    control.onSuggest('San Francisco', loadFixture('rpa-mock-suggestions').new.suggestions, {
      deferred: true,
    });
    const { input, unmount } = mount();
    await search(input(), 'San Francisco');
    unmount();
    await actCompat(() => {
      control.pending[0]?.resolve();
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('cancels a pending debounced search', async () => {
    const { input, unmount } = mount();
    fireEvent.change(input(), { target: { value: 'San Francisco' } });
    unmount();
    await actCompat(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(suggestCalls(control)).toHaveLength(0);
  });
});

describe('debounce', () => {
  it('waits for the debounce prop before searching', async () => {
    const { input } = mount({ debounce: 500 });
    await search(input(), 'San Francisco', 499);
    expect(suggestCalls(control)).toHaveLength(0);
    await actCompat(() => {
      vi.advanceTimersByTime(1);
    });
    expect(suggestCalls(control)).toHaveLength(1);
  });

  it('searches once for a burst of keystrokes with the last value', async () => {
    const { input } = mount();
    await search(input(), 'S', 100);
    await search(input(), 'Sa', 100);
    await search(input(), 'San Francisco', 200);
    expect(suggestCalls(control).map((call) => call.request)).toEqual([{ input: 'San Francisco' }]);
  });

  it('keeps the wait it was created with when the prop changes', async () => {
    const { input, rerender } = mount({ debounce: 200 });
    rerender({ debounce: 1000 });
    await search(input(), 'San Francisco', 200);
    expect(suggestCalls(control)).toHaveLength(1);
  });
});

describe('input changes', () => {
  it('calls onChange and does not search with shouldFetchSuggestions false', async () => {
    const { input, onChange, latest } = mount({ shouldFetchSuggestions: false });
    await search(input(), 'San Francisco');
    expect(onChange).toHaveBeenCalledWith('San Francisco');
    expect(suggestCalls(control)).toHaveLength(0);
    expect(latest().suggestions).toHaveLength(0);
  });

  it('clears suggestions at once and does not search when the value becomes empty', async () => {
    const { input, onChange, latest } = mount();
    await search(input(), 'San Francisco');
    expect(latest().suggestions).toHaveLength(5);

    fireEvent.change(input(), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(latest().suggestions).toHaveLength(0);
    await actCompat(() => {
      vi.advanceTimersByTime(200);
    });
    expect(suggestCalls(control)).toHaveLength(1);
  });

  it('does not search when the value is empty by the time the debounce fires', async () => {
    const { input, rerender } = mount();
    fireEvent.change(input(), { target: { value: 'San' } });
    rerender({ value: '' });
    await actCompat(() => {
      vi.advanceTimersByTime(200);
    });
    expect(suggestCalls(control)).toHaveLength(0);
  });
});
