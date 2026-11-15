// Ported from react-places-autocomplete 7.3.0 src/tests/helpers/setup.js and testHelpers.js. MIT License, Copyright (c) 2016 Ken Hibino.
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
import { afterEach, beforeEach, vi } from 'vitest';
import PlacesAutocomplete, { type PropTypes } from '../../src';

export type RenderArg = Parameters<PropTypes['children']>[0];

export const mockSuggestions = [
  {
    active: false,
    description: 'San Francisco, CA, USA',
    id: '1b9ea3c094d3ac23c9a3afa8cd4d8a41f05de50a',
    index: 0,
    placeId: 'ChIJIQBpAG2ahYAR_6128GcTUEo',
    matchedSubstrings: [{ length: 13, offset: 0 }],
    formattedSuggestion: {
      mainText: 'San Francisco',
      secondaryText: 'CA, USA',
    },
    terms: [
      { offset: 0, value: 'San Francisco' },
      { offset: 15, value: 'CA' },
      { offset: 19, value: 'USA' },
    ],
    types: ['locality', 'political', 'geocode'],
  },
  {
    active: false,
    description: 'San Francisco International Airport (SFO), San Francisco, CA, USA',
    id: '9c9fb107d7a776c3f6a26791b07982d7db079113',
    index: 1,
    placeId: 'ChIJVVVVVYx3j4ARP-3NGldc8qQ',
    matchedSubstrings: [{ length: 13, offset: 0 }],
    formattedSuggestion: {
      mainText: 'San Francisco International Airport (SFO)',
      secondaryText: 'San Francisco, CA, USA',
    },
    terms: [
      { offset: 0, value: 'San Francisco International Airport (SFO)' },
      { offset: 43, value: 'San Francisco' },
      { offset: 58, value: 'CA' },
      { offset: 62, value: 'USA' },
    ],
    types: ['establishment'],
  },
  {
    active: false,
    description: 'Coacalco, State of Mexico, Mexico',
    id: '33fd014a14255500805e49d7de6b7ed439d890a9',
    index: 2,
    placeId: 'ChIJmz3ukEbx0YUR_iiKUJOxHUA',
    matchedSubstrings: [{ length: 8, offset: 0 }],
    formattedSuggestion: {
      mainText: 'Coacalco',
      secondaryText: 'State of Mexico, Mexico',
    },
    terms: [
      { offset: 0, value: 'Coacalco' },
      { offset: 10, value: 'State of Mexico' },
      { offset: 27, value: 'Mexico' },
    ],
    types: ['locality', 'political', 'geocode'],
  },
  {
    active: false,
    description: "San Francisco Int'l Airport Station, San Francisco, CA, USA",
    id: 'fd59fa62088bda5c2747abbae2614bd7f6525154',
    index: 3,
    placeId: 'ChIJVVVVVYx3j4ARyN7qnq2JceQ',
    matchedSubstrings: [{ length: 13, offset: 0 }],
    formattedSuggestion: {
      mainText: "San Francisco Int'l Airport Station",
      secondaryText: 'San Francisco, CA, USA',
    },
    terms: [
      { offset: 0, value: "San Francisco Int'l Airport Station" },
      { offset: 37, value: 'San Francisco' },
      { offset: 52, value: 'CA' },
      { offset: 56, value: 'USA' },
    ],
    types: ['transit_station', 'point_of_interest', 'establishment', 'geocode'],
  },
  {
    active: false,
    description: 'San Francisco del Rincón, Guanajuato, Mexico',
    id: 'e4007a708341192d1ddd49bce5cff3dd429e3f98',
    index: 4,
    placeId: 'ChIJ3bwFNq7DK4QR1ZorLLDndeA',
    formattedSuggestion: {
      mainText: 'San Francisco del Rincón',
      secondaryText: 'Guanajuato, Mexico',
    },
    matchedSubstrings: [{ length: 13, offset: 0 }],
    terms: [
      { offset: 0, value: 'San Francisco del Rincón' },
      { offset: 26, value: 'Guanajuato' },
      { offset: 38, value: 'Mexico' },
    ],
    types: ['locality', 'political', 'geocode'],
  },
];

export const DEBOUNCE = 200;

export function setupGoogleMock(): () => FakeControl {
  let control: FakeControl | undefined;
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fake = createFakeGoogle();
    control = fake.control;
    uninstall = fake.install();
    applyFixture(control, loadFixture('rpa-mock-suggestions'));
  });

  afterEach(() => {
    uninstall?.();
    vi.useRealTimers();
  });

  return () => {
    if (!control) throw new Error('setupGoogleMock: the fake is installed in beforeEach');
    return control;
  };
}

const DEFAULT_PROPS = {
  value: '',
  onChange: () => {},
  onSelect: () => {},
  debounce: DEBOUNCE,
  highlightFirstSuggestion: false,
  shouldFetchSuggestions: true,
};

type MountProps = Partial<Omit<PropTypes, 'children'>>;

interface ControlledProps {
  props: MountProps & { value: string; onChange: (value: string) => void };
  children: PropTypes['children'];
}

function Controlled({ props, children }: ControlledProps): React.ReactElement {
  const [value, setValue] = React.useState(props.value);
  return (
    <PlacesAutocomplete
      {...props}
      value={value}
      onChange={(next) => {
        props.onChange(next);
        setValue(next);
      }}
    >
      {children}
    </PlacesAutocomplete>
  );
}

export interface Wrapper {
  container: HTMLElement;
  input(): HTMLInputElement;
  suggestionItems(): HTMLElement[];
  state(): RenderArg;
  unmount(): void;
}

export function mountComponent(props: MountProps = {}): Wrapper {
  const allProps = {
    ...DEFAULT_PROPS,
    ...props,
    value: props.value ?? DEFAULT_PROPS.value,
    onChange: props.onChange ?? DEFAULT_PROPS.onChange,
  };
  const seen: RenderArg[] = [];
  const rendered = renderCompat(
    <Controlled props={allProps}>
      {(arg) => {
        seen.push(arg);
        const { getInputProps, suggestions, getSuggestionItemProps } = arg;
        return (
          <div>
            <input {...getInputProps()} />
            <div>
              {suggestions.map((suggestion) => (
                // biome-ignore lint/correctness/useJsxKeyInIterable: getSuggestionItemProps supplies the key
                <div {...getSuggestionItemProps(suggestion, { 'data-test': 'suggestion-item' })}>
                  <span>{suggestion.description}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }}
    </Controlled>,
  );
  return {
    container: rendered.container,
    input: () => rendered.container.querySelector('input') as HTMLInputElement,
    suggestionItems: () =>
      Array.from(rendered.container.querySelectorAll<HTMLElement>('[data-test="suggestion-item"]')),
    state: () => seen[seen.length - 1] as RenderArg,
    unmount: rendered.unmount,
  };
}

export async function simulateSearch(wrapper: Wrapper): Promise<void> {
  fireEvent.change(wrapper.input(), { target: { value: 'San Francisco' } });
  await actCompat(() => {
    vi.advanceTimersByTime(DEBOUNCE);
  });
}
