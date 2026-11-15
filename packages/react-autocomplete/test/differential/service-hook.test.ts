import {
  type AllowEntry,
  compareTraces,
  type FakeControl,
  type LegacyControl,
  loadFixture,
  runScenario,
  type Step,
  serviceHookSubject,
  type Trace,
} from '@places-compat/core/testing';
import * as upstream from 'upstream-rga/lib/usePlacesAutocompleteService';
import { describe, expect, it } from 'vitest';
import * as replacement from '../../src/usePlacesAutocompleteService';
import { serviceHookAllow, serviceHookLoadAllow } from './allowlist';

type Control = FakeControl | LegacyControl;

interface Scenario {
  steps: Step[];
  props?: Record<string, unknown>;
  fixtures?: string[];
  setup?(control: Control): void;
}

async function compare(scenario: Scenario, allow: AllowEntry[]) {
  const shared = {
    steps: scenario.steps,
    props: scenario.props ?? {},
    fixtures: scenario.fixtures ?? [],
    ...(scenario.setup ? { setup: scenario.setup } : {}),
  };
  const original = await runScenario({
    subject: serviceHookSubject(upstream),
    fake: 'legacy',
    ...shared,
  });
  const ours = await runScenario({
    subject: serviceHookSubject(replacement),
    fake: 'new',
    ...shared,
  });
  return { original, ours, result: compareTraces(original, ours, allow) };
}

function predictionCounts(trace: Trace): number[] {
  return trace.map(
    (entry) => (entry.settled as { placePredictions: unknown[] }).placePredictions.length,
  );
}

const paris = loadFixture('paris-geocode');
const nowhere = loadFixture('zero-results').request.input;

function restrictedToFrance(control: Control): void {
  if ('onSuggest' in control) {
    const [first] = paris.new.suggestions;
    control.onSuggest(
      (request) => request.input === 'Paris' && (request.includedRegionCodes ?? []).includes('fr'),
      first ? [first] : [],
    );
    control.onSuggest('Paris', paris.new.suggestions);
  } else {
    const [first] = paris.legacy.predictions;
    control.onPredictions(
      (request) =>
        request.input === 'Paris' &&
        (request.componentRestrictions?.country as string | undefined) === 'fr',
      first ? [first] : [],
    );
    control.onPredictions('Paris', paris.legacy.predictions);
  }
}

describe('usePlacesAutocompleteService against the original', () => {
  it('gives the same predictions, loading flags and services', async () => {
    const { original, result } = await compare(
      {
        props: { sessionToken: true },
        fixtures: ['paris-geocode'],
        steps: [
          { type: 'call', name: 'getPlacePredictions', args: [{ input: 'Paris' }] },
          { type: 'advance', ms: 300 },
          { type: 'call', name: 'getQueryPredictions', args: [{ input: 'Paris' }] },
          { type: 'advance', ms: 300 },
          { type: 'call', name: 'refreshSessionToken' },
          { type: 'call', name: 'getPlacePredictions', args: [{ input: '' }] },
          { type: 'call', name: 'getQueryPredictions', args: [{ input: '' }] },
          { type: 'advance', ms: 300 },
          { type: 'unmount' },
        ],
      },
      serviceHookAllow,
    );

    expect(result).toEqual({ diffs: [], unusedAllow: [] });
    expect(predictionCounts(original)).toEqual([0, 5, 5, 5, 5, 0, 0, 0, 0]);
  });

  it('gives the same empty result when nothing matches', async () => {
    const { result } = await compare(
      {
        fixtures: ['zero-results'],
        steps: [
          { type: 'call', name: 'getPlacePredictions', args: [{ input: nowhere }] },
          { type: 'advance', ms: 300 },
          { type: 'call', name: 'getQueryPredictions', args: [{ input: nowhere }] },
          { type: 'advance', ms: 300 },
        ],
      },
      serviceHookAllow,
    );

    expect(result).toEqual({ diffs: [], unusedAllow: [] });
  });

  it('shows the services on load and reads the current options', async () => {
    const { original, ours, result } = await compare(
      {
        props: { sessionToken: true },
        setup: restrictedToFrance,
        steps: [
          { type: 'advance', ms: 0 },
          { type: 'rerender', props: { options: { componentRestrictions: { country: 'fr' } } } },
          { type: 'call', name: 'getPlacePredictions', args: [{ input: 'Paris' }] },
          { type: 'advance', ms: 300 },
        ],
      },
      serviceHookLoadAllow,
    );

    expect(result).toEqual({ diffs: [], unusedAllow: [] });
    expect(original[0]?.settled).toMatchObject({
      placesService: false,
      placesAutocompleteService: false,
      autocompleteSessionToken: null,
    });
    expect(ours[0]?.settled).toMatchObject({
      placesService: true,
      placesAutocompleteService: true,
      autocompleteSessionToken: '[token]',
    });
    expect(predictionCounts(original)).toEqual([0, 0, 0, 5]);
    expect(predictionCounts(ours)).toEqual([0, 0, 0, 1]);
  });
});
