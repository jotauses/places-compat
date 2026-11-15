import { loadFixture, type Step, type Trace, type TraceEntry } from '@places-compat/core/testing';
import { expect } from 'vitest';

export type ErrorStatus =
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'OVER_QUERY_LIMIT'
  | 'REQUEST_DENIED'
  | 'UNKNOWN_ERROR';

export type Reply =
  | { input: string; predictions: number; deferred?: boolean; ids?: boolean }
  | { input: string; status: 'ZERO_RESULTS'; deferred?: boolean }
  | { input: string; status: ErrorStatus; code: string; deferred?: boolean };

export interface Script {
  name: string;
  steps: Step[];
  props?: Record<string, unknown>;
  replies?: Reply[];
  strict?: boolean;
  placesAfterCallback?: boolean;
  placesThroughImportLibrary?: boolean;
  check?(original: Trace): void;
}

const fixture = loadFixture('rpa-mock-suggestions');

export const QUERY = fixture.request.input;
export const LEGACY_PREDICTIONS = fixture.legacy.predictions;
export const NEW_SUGGESTIONS = fixture.new.suggestions;
export const CALLBACK = 'initPlacesAutocomplete';

interface Settled {
  renderArg: { loading: boolean; suggestions: { id: unknown; placeId: string; active: boolean }[] };
  inputProps: { disabled: boolean };
  globalCallback?: string;
}

function at(trace: Trace, index: number): TraceEntry {
  const entry = trace[index < 0 ? trace.length + index : index];
  if (!entry) throw new Error(`The trace has no entry ${index}`);
  return entry;
}

function settled(trace: Trace, index: number): Settled {
  return at(trace, index).settled as Settled;
}

function suggestionCount(trace: Trace, index: number): number {
  return settled(trace, index).renderArg.suggestions.length;
}

function activeIndex(trace: Trace, index: number): number {
  return settled(trace, index).renderArg.suggestions.findIndex((suggestion) => suggestion.active);
}

function callbacks(trace: Trace, index: number): unknown[] {
  return at(trace, index).callbacks.map(({ name, args }) => [name, ...args]);
}

function selected(index: number): unknown[] {
  const prediction = LEGACY_PREDICTIONS[index] as google.maps.places.AutocompletePrediction;
  return [
    'onSelect',
    prediction.description,
    prediction.place_id,
    expect.objectContaining({ placeId: prediction.place_id, index }),
  ];
}

const search: Step[] = [
  { type: 'type', text: QUERY },
  { type: 'advance', ms: 200 },
];

const all: Reply = { input: QUERY, predictions: LEGACY_PREDICTIONS.length };

function key(name: 'ArrowDown' | 'ArrowUp' | 'Enter' | 'Escape' | 'Tab'): Step {
  return { type: 'key', key: name };
}

function times(count: number, step: Step): Step[] {
  return Array.from({ length: count }, () => step);
}

const ERROR_CODES: { status: ErrorStatus; code: string }[] = [
  { status: 'INVALID_REQUEST', code: 'INVALID_ARGUMENT' },
  { status: 'REQUEST_DENIED', code: 'PERMISSION_DENIED' },
  { status: 'OVER_QUERY_LIMIT', code: 'RESOURCE_EXHAUSTED' },
  { status: 'NOT_FOUND', code: 'NOT_FOUND' },
  { status: 'UNKNOWN_ERROR', code: 'INTERNAL' },
];

export const scripts: Script[] = [
  {
    name: 'searches and selects with the keyboard',
    replies: [all],
    steps: [...search, key('ArrowDown'), key('ArrowDown'), key('Enter')],
    check: (trace) => expect(callbacks(trace, -1)).toEqual([selected(1)]),
  },
  {
    name: 'selects with the mouse',
    replies: [all],
    steps: [
      ...search,
      { type: 'hover', index: 2 },
      { type: 'click', index: 2 },
      { type: 'advance', ms: 0 },
    ],
    check: (trace) => expect(callbacks(trace, 3)).toEqual([selected(2)]),
  },
  {
    name: 'moves from a hovered suggestion with the arrows',
    replies: [all],
    steps: [
      ...search,
      { type: 'hover', index: 3 },
      key('ArrowDown'),
      key('ArrowUp'),
      key('ArrowUp'),
      key('Enter'),
    ],
    check: (trace) => expect(callbacks(trace, -1)).toEqual([selected(2)]),
  },
  {
    name: 'clears the suggestions on Escape',
    replies: [all],
    steps: [...search, key('ArrowDown'), key('Escape'), key('ArrowDown'), key('Enter')],
    check: (trace) => {
      expect(suggestionCount(trace, 3)).toBe(0);
      expect(callbacks(trace, -1)).toEqual([
        ['onSelect', LEGACY_PREDICTIONS[0]?.description, null, null],
      ]);
    },
  },
  {
    name: 'clears the suggestions on blur',
    replies: [all],
    steps: [...search, { type: 'hover', index: 1 }, { type: 'blur' }, key('ArrowUp'), key('Enter')],
    check: (trace) => expect(suggestionCount(trace, 3)).toBe(0),
  },
  {
    name: 'passes both ends with the arrows and restores the typed value',
    replies: [all],
    steps: [
      ...search,
      key('ArrowUp'),
      key('ArrowDown'),
      key('ArrowDown'),
      key('ArrowUp'),
      ...times(LEGACY_PREDICTIONS.length, key('ArrowDown')),
      key('ArrowDown'),
      key('Enter'),
    ],
    check: (trace) => {
      expect(activeIndex(trace, 2)).toBe(LEGACY_PREDICTIONS.length - 1);
      expect(activeIndex(trace, 3)).toBe(-1);
      expect(callbacks(trace, 3)).toEqual([['onChange', QUERY]]);
      expect(callbacks(trace, 5)).toEqual([['onChange', QUERY]]);
    },
  },
  {
    name: 'calls onSelect with the value and no suggestion on Enter with nothing active',
    replies: [all],
    steps: [key('Enter'), ...search, key('Enter')],
    check: (trace) => {
      expect(callbacks(trace, 0)).toEqual([['onSelect', '', null, null]]);
      expect(callbacks(trace, -1)).toEqual([['onSelect', QUERY, null, null]]);
    },
  },
  {
    name: 'ignores Tab',
    replies: [all],
    steps: [...search, key('ArrowDown'), key('Tab')],
  },
  {
    name: 'clears the suggestions when the input is emptied',
    replies: [all],
    steps: [...search, { type: 'type', text: '' }, { type: 'advance', ms: 200 }, key('ArrowDown')],
    check: (trace) => expect(suggestionCount(trace, 2)).toBe(0),
  },
  {
    name: 'reports ZERO_RESULTS through onError and keeps the suggestions',
    replies: [all, { input: 'Nowhere', status: 'ZERO_RESULTS' }],
    steps: [
      ...search,
      { type: 'type', text: 'Nowhere' },
      { type: 'advance', ms: 200 },
      key('ArrowDown'),
      key('Enter'),
    ],
    check: (trace) => {
      expect(callbacks(trace, 3)).toEqual([['onError', 'ZERO_RESULTS', '[fn]']]);
      expect(suggestionCount(trace, 3)).toBe(LEGACY_PREDICTIONS.length);
    },
  },
  ...ERROR_CODES.map(
    ({ status, code }): Script => ({
      name: `reports ${status} through onError`,
      replies: [all, { input: 'Broken', status, code }],
      steps: [
        ...search,
        { type: 'type', text: 'Broken' },
        { type: 'advance', ms: 200 },
        key('Escape'),
      ],
      check: (trace) => expect(callbacks(trace, 3)).toEqual([['onError', status, '[fn]']]),
    }),
  ),
  {
    name: 'logs the status with the default onError',
    props: { onError: 'default' },
    replies: [{ input: 'Broken', status: 'REQUEST_DENIED', code: 'PERMISSION_DENIED' }],
    steps: [
      { type: 'type', text: 'Broken' },
      { type: 'advance', ms: 200 },
    ],
    check: (trace) => {
      expect(at(trace, 1).callbacks).toEqual([]);
      expect(at(trace, 1).console).toEqual([
        { level: 'error', args: [expect.stringContaining('Status: '), 'REQUEST_DENIED'] },
      ]);
    },
  },
  {
    name: 'highlights the first suggestion',
    props: { highlightFirstSuggestion: true },
    replies: [all],
    steps: [
      ...search,
      key('ArrowDown'),
      key('ArrowUp'),
      key('ArrowUp'),
      key('Enter'),
      { type: 'type', text: 'San' },
      ...search,
      key('Enter'),
    ],
    check: (trace) => {
      expect(activeIndex(trace, 1)).toBe(0);
      expect(callbacks(trace, -1)).toEqual([selected(0)]);
    },
  },
  {
    name: 'does not fetch while shouldFetchSuggestions is false',
    props: { shouldFetchSuggestions: false },
    replies: [all],
    steps: [
      ...search,
      key('ArrowDown'),
      key('Enter'),
      { type: 'rerender', props: { shouldFetchSuggestions: true } },
      { type: 'type', text: 'San' },
      ...search,
    ],
    check: (trace) => {
      expect(suggestionCount(trace, 1)).toBe(0);
      expect(suggestionCount(trace, -1)).toBe(LEGACY_PREDICTIONS.length);
    },
  },
  {
    name: 'waits for the debounce prop',
    props: { debounce: 500 },
    replies: [all],
    steps: [
      { type: 'type', text: 'San' },
      { type: 'advance', ms: 300 },
      { type: 'type', text: QUERY },
      { type: 'advance', ms: 300 },
      { type: 'advance', ms: 200 },
    ],
    check: (trace) => {
      expect(suggestionCount(trace, 3)).toBe(0);
      expect(suggestionCount(trace, 4)).toBe(LEGACY_PREDICTIONS.length);
    },
  },
  {
    name: 'keeps the debounce it was mounted with',
    replies: [all],
    steps: [
      { type: 'rerender', props: { debounce: 1000 } },
      { type: 'type', text: QUERY },
      { type: 'advance', ms: 200 },
    ],
    check: (trace) => expect(suggestionCount(trace, 2)).toBe(LEGACY_PREDICTIONS.length),
  },
  {
    name: 'fetches on the next timer tick with a zero debounce',
    props: { debounce: 0 },
    replies: [all],
    steps: [{ type: 'type', text: QUERY }, { type: 'advance', ms: 0 }, key('ArrowDown')],
    check: (trace) => {
      expect(suggestionCount(trace, 0)).toBe(0);
      expect(suggestionCount(trace, 1)).toBe(LEGACY_PREDICTIONS.length);
    },
  },
  {
    name: 'fetches once for quick typing',
    replies: [all],
    steps: [
      { type: 'type', text: 'S' },
      { type: 'advance', ms: 150 },
      { type: 'type', text: QUERY },
      { type: 'advance', ms: 150 },
      { type: 'advance', ms: 50 },
    ],
  },
  {
    name: 'shows loading until the reply arrives',
    replies: [{ ...all, deferred: true }],
    steps: [...search, { type: 'resolve', index: 0 }, key('ArrowDown')],
    check: (trace) => {
      expect(at(trace, 1).loading).toEqual([true]);
      expect(at(trace, 2).loading).toEqual([false]);
      expect(suggestionCount(trace, 2)).toBe(LEGACY_PREDICTIONS.length);
    },
  },
  {
    name: 'applies replies in the order they arrive',
    replies: [
      { input: 'San', predictions: 2, deferred: true },
      { ...all, deferred: true },
    ],
    steps: [
      { type: 'type', text: 'San' },
      { type: 'advance', ms: 200 },
      ...search,
      { type: 'resolve', index: 1 },
      { type: 'resolve', index: 0 },
      key('ArrowUp'),
    ],
    check: (trace) => expect(suggestionCount(trace, 5)).toBe(2),
  },
  {
    name: 'stops loading when a deferred request fails',
    replies: [{ input: QUERY, status: 'ZERO_RESULTS', deferred: true }],
    steps: [...search, { type: 'reject', index: 0, code: 'OVER_QUERY_LIMIT' }],
    check: (trace) => {
      expect(at(trace, 2).loading).toEqual([false]);
      expect(callbacks(trace, 2)).toEqual([['onError', 'OVER_QUERY_LIMIT', '[fn]']]);
    },
  },
  {
    name: 'leaves suggestion.id undefined',
    replies: [{ ...all, ids: true }],
    steps: [...search, key('ArrowDown'), key('Enter')],
    check: (trace) => expect(settled(trace, 1).renderArg.suggestions[0]?.id).toBe('prediction-0'),
  },
  {
    name: 'initialises at mount with googleCallbackName when Places is loaded',
    props: { googleCallbackName: CALLBACK },
    replies: [all],
    steps: [...search, key('ArrowDown'), key('Enter'), { type: 'unmount' }],
    check: (trace) => {
      expect(trace.map((entry) => (entry.settled as Settled).globalCallback)).not.toContain(
        'function',
      );
      expect(callbacks(trace, 3)).toEqual([selected(0)]);
    },
  },
  {
    name: 'waits for the googleCallbackName callback',
    props: { googleCallbackName: CALLBACK },
    placesAfterCallback: true,
    replies: [all],
    steps: [
      { type: 'advance', ms: 0 },
      { type: 'call', name: CALLBACK },
      ...search,
      key('ArrowDown'),
      key('Enter'),
      { type: 'unmount' },
    ],
    check: (trace) => {
      expect(settled(trace, 0)).toMatchObject({
        inputProps: { disabled: true },
        globalCallback: 'function',
      });
      expect(settled(trace, 1).inputProps.disabled).toBe(false);
      expect(settled(trace, -1).globalCallback).toBe('undefined');
    },
  },
  {
    name: 'behaves the same when Places loads through importLibrary',
    placesThroughImportLibrary: true,
    replies: [all],
    steps: [...search, key('ArrowDown'), key('Enter')],
  },
  {
    name: 'searches and selects in StrictMode',
    strict: true,
    replies: [all],
    steps: [...search, key('ArrowDown'), key('Enter')],
  },
  {
    name: 'waits for the googleCallbackName callback in StrictMode',
    strict: true,
    props: { googleCallbackName: CALLBACK },
    placesAfterCallback: true,
    replies: [all],
    steps: [
      { type: 'call', name: CALLBACK },
      ...search,
      key('ArrowDown'),
      key('Enter'),
      { type: 'unmount' },
    ],
  },
];
