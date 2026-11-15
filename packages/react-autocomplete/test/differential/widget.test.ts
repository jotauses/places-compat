import {
  type AllowEntry,
  compareTraces,
  loadFixture,
  runScenario,
  type Step,
  type Trace,
  widgetSubject,
} from '@places-compat/core/testing';
import * as upstream from 'upstream-rga';
import { afterEach, describe, expect, it } from 'vitest';
import * as replacement from '../../src/index';
import { widgetAllow } from './allowlist';

type PlaceResult = google.maps.places.PlaceResult;

const details = loadFixture('details-full').detailsLegacy as PlaceResult;

function pick(keys: (keyof PlaceResult)[]): PlaceResult {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = details[key];
  return out as PlaceResult;
}

const defaultFieldsPlace: PlaceResult = {
  ...pick(['address_components', 'place_id', 'formatted_address']),
  geometry: { location: details.geometry?.location } as google.maps.places.PlaceGeometry,
};

const restrictedOptions = {
  fields: ['place_id', 'name'],
  componentRestrictions: { country: 'es' },
  bounds: { north: 41, south: 40, east: -3, west: -4 },
};

async function compare(
  steps: Step[],
  props: Record<string, unknown> = {},
  allow: AllowEntry[] = widgetAllow,
): Promise<{ original: Trace; result: ReturnType<typeof compareTraces> }> {
  const original = await runScenario({
    subject: widgetSubject(upstream),
    fake: 'legacy',
    props,
    steps,
  });
  const ours = await runScenario({
    subject: widgetSubject(replacement),
    fake: 'new',
    fixtures: ['details-full'],
    props,
    steps,
  });
  return { original, result: compareTraces(original, ours, allow) };
}

function callbackNames(trace: Trace): string[][] {
  return trace.map((entry) => entry.callbacks.map((call) => call.name));
}

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('usePlacesWidget against the original', () => {
  it('gives the same callbacks, place arguments and setter calls', async () => {
    const steps: Step[] = [
      { type: 'type', text: 'Example' },
      { type: 'call', name: 'selectPlace', args: [defaultFieldsPlace] },
      { type: 'type', text: 'Example' },
      { type: 'call', name: 'enterWithoutSelection' },
      { type: 'unmount' },
    ];
    const { original, result } = await compare(steps);

    expect(result).toEqual({ diffs: [], unusedAllow: [] });
    expect(callbackNames(original)).toEqual([
      [
        'autocomplete.setFields',
        'autocomplete.setBounds',
        'autocomplete.setComponentRestrictions',
        'autocomplete.setOptions',
      ],
      ['onPlaceSelected', 'onPlaceSelected'],
      [],
      ['onPlaceSelected', 'onPlaceSelected'],
      [],
    ]);
  });

  it('calls the same setters when the options change after mount', async () => {
    const props = { options: restrictedOptions };
    const steps: Step[] = [
      { type: 'rerender', props },
      { type: 'rerender', props },
      { type: 'type', text: 'Example' },
      { type: 'call', name: 'selectPlace', args: [pick(['place_id', 'name'])] },
      { type: 'unmount' },
    ];
    const { original, result } = await compare(steps);

    expect(result).toEqual({ diffs: [], unusedAllow: [] });
    expect(callbackNames(original).slice(0, 2)).toEqual([
      [
        'autocomplete.setFields',
        'autocomplete.setBounds',
        'autocomplete.setComponentRestrictions',
        'autocomplete.setOptions',
        'autocomplete.setFields',
        'autocomplete.setBounds',
        'autocomplete.setComponentRestrictions',
        'autocomplete.setOptions',
      ],
      ['autocomplete.setOptions'],
    ]);
  });

  it('passes the mount options to the same setters', async () => {
    const props = { options: { ...restrictedOptions, strictBounds: true } };
    const steps: Step[] = [
      { type: 'type', text: 'Example' },
      { type: 'call', name: 'selectPlace', args: [pick(['place_id', 'name'])] },
      { type: 'rerender', props },
      { type: 'unmount' },
    ];
    const { original, result } = await compare(steps, props);

    expect(result).toEqual({ diffs: [], unusedAllow: [] });
    expect(original[0]?.callbacks.find((call) => call.name === 'autocomplete.setOptions')).toEqual({
      name: 'autocomplete.setOptions',
      args: [{ strictBounds: true }],
    });
  });
});
