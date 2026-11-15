import {
  type AllowEntry,
  compareTraces,
  type FakeControl,
  fakeMapsError,
  hookSubject,
  type LegacyControl,
  loadFixture,
  runScenario,
  type Step,
  type Trace,
} from '@places-compat/core/testing';
import React from 'react';
import * as upstream from 'upstream-upa';
import { describe, expect, it } from 'vitest';
import * as ours from '../../src';
import { allowlist } from './allowlist';

type Control = FakeControl | LegacyControl;
type LegacyStatus = `${google.maps.places.PlacesServiceStatus}`;

const react17 = React.version.startsWith('17.');
const UNMOUNTED_UPDATE = "Warning: Can't perform a React state update on an unmounted component";

interface Scenario {
  name: string;
  steps: Step[];
  fixtures?: string[];
  props?: Record<string, unknown>;
  setup?(control: Control): void;
  replacementFake?: 'legacy' | 'new';
  allow?: AllowEntry[];
  differsAt?: number[];
  updatesAfterUnmount?: boolean;
}

const type = (text: string): Step => ({ type: 'type', text });
const advance = (ms = 200): Step => ({ type: 'advance', ms });
const call = (name: string, ...args: unknown[]): Step => ({ type: 'call', name, args });
const resolve = (index: number): Step => ({ type: 'resolve', index });

function isNewFake(control: Control): control is FakeControl {
  return 'onSuggest' in control;
}

function deferredReplies(replies: [input: string, slug: string][]): (control: Control) => void {
  return (control) => {
    for (const [input, slug] of replies) {
      const { legacy, new: next } = loadFixture(slug);
      if (isNewFake(control)) {
        control.onSuggest(input, next.suggestions, { deferred: true });
      } else {
        const reply = legacy.status === 'OK' ? legacy.predictions : legacy.status;
        control.onPredictions(input, reply, { deferred: true });
      }
    }
  };
}

function deferredFixtures(...slugs: string[]): (control: Control) => void {
  return deferredReplies(slugs.map((slug) => [inputOf(slug), slug]));
}

function failing(legacyStatus: LegacyStatus, error: Error): (control: Control) => void {
  return (control) => {
    if (isNewFake(control)) control.onSuggest(() => true, error);
    else control.onPredictions(() => true, legacyStatus);
  };
}

function inputOf(slug: string): string {
  return loadFixture(slug).request.input;
}

function optionsOf(slug: string): Record<string, unknown> {
  const { input: _input, ...rest } = loadFixture(slug).request;
  return rest;
}

const searches: Scenario[] = [
  'paris-geocode',
  'amoeba',
  'rpa-mock-suggestions',
  'sf-geocode',
  'details-full',
  'no-secondary-text',
  'matches-main-only',
].map((slug) => ({
  name: `search with results (${slug})`,
  fixtures: [slug],
  props: { requestOptions: optionsOf(slug) },
  steps: [type(inputOf(slug)), advance()],
}));

const failures: { status: LegacyStatus; error: Error }[] = [
  { status: 'REQUEST_DENIED', error: fakeMapsError('PERMISSION_DENIED') },
  { status: 'REQUEST_DENIED', error: fakeMapsError('UNAUTHENTICATED') },
  { status: 'OVER_QUERY_LIMIT', error: fakeMapsError('RESOURCE_EXHAUSTED') },
  { status: 'INVALID_REQUEST', error: fakeMapsError('INVALID_ARGUMENT') },
  { status: 'NOT_FOUND', error: fakeMapsError('NOT_FOUND') },
  { status: 'UNKNOWN_ERROR', error: fakeMapsError('INTERNAL') },
  { status: 'INVALID_REQUEST', error: new Error('client side validation') },
];

const statuses: Scenario[] = failures.map(({ status, error }) => ({
  name: `error status ${status} (${(error as { code?: string }).code ?? 'no code'})`,
  setup: failing(status, error),
  steps: [type('Paris'), advance()],
}));

const scenarios: Scenario[] = [
  ...searches,
  {
    name: 'search with loading visible until the reply arrives',
    setup: deferredFixtures('paris-geocode'),
    steps: [type('Paris'), advance(), resolve(0)],
  },
  {
    name: 'zero results',
    fixtures: ['zero-results'],
    steps: [type(inputOf('zero-results')), advance()],
  },
  ...statuses,
  {
    name: 'cache hit for the same text',
    fixtures: ['paris-geocode'],
    steps: [type('Paris'), advance(), call('clearSuggestions'), type('Paris'), advance()],
  },
  {
    name: 'clearCache forces a new search',
    fixtures: ['paris-geocode'],
    steps: [type('Paris'), advance(), call('clearCache'), type('Paris'), advance()],
  },
  {
    name: 'cache disabled with an own key and a longer debounce',
    fixtures: ['paris-geocode'],
    props: { cache: false, cacheKey: 'places', debounce: 500 },
    steps: [type('Paris'), advance(), advance(300), type('Paris'), advance(500)],
  },
  {
    name: 'clearSuggestions after results',
    fixtures: ['paris-geocode'],
    steps: [type('Paris'), advance(), call('clearSuggestions')],
  },
  {
    name: 'clearSuggestions while a request is in flight',
    setup: deferredFixtures('paris-geocode'),
    steps: [type('Paris'), advance(), call('clearSuggestions'), resolve(0)],
  },
  {
    name: 'setValue without fetching',
    fixtures: ['paris-geocode'],
    steps: [call('setValue', 'Paris', false), advance()],
  },
  {
    name: 'empty value clears the suggestions',
    fixtures: ['paris-geocode'],
    steps: [type('Paris'), advance(), type(''), advance()],
  },
  {
    name: 'typing inside the debounce window searches once',
    fixtures: ['paris-geocode'],
    steps: [type('P'), advance(100), type('Paris'), advance()],
  },
  {
    name: 'initOnMount false waits for init',
    fixtures: ['paris-geocode'],
    props: { initOnMount: false, defaultValue: 'Par' },
    steps: [type('Paris'), advance(), call('init'), type('Paris'), advance()],
  },
  {
    name: 'in-order responses',
    setup: deferredReplies([
      ['a', 'rpa-mock-suggestions'],
      ['ab', 'paris-geocode'],
    ]),
    steps: [type('a'), advance(), type('ab'), advance(), resolve(0), resolve(1)],
  },
  {
    name: 'out-of-order responses',
    setup: deferredFixtures('rpa-mock-suggestions', 'paris-geocode'),
    steps: [type('San Francisco'), advance(), type('Paris'), advance(), resolve(1), resolve(0)],
    allow: allowlist.outOfOrder,
    differsAt: [5],
  },
  {
    name: 'late response after the input is cleared',
    setup: deferredFixtures('paris-geocode'),
    steps: [type('Paris'), advance(), type(''), advance(), resolve(0)],
    allow: allowlist.lateAfterClear,
    differsAt: [4],
  },
  {
    name: 'late response after a cache hit',
    fixtures: ['paris-geocode'],
    setup: deferredFixtures('sf-geocode'),
    steps: [
      type('Paris'),
      advance(),
      call('clearSuggestions'),
      type(inputOf('sf-geocode')),
      advance(),
      type('Paris'),
      advance(),
      resolve(0),
    ],
    allow: allowlist.lateAfterCacheHit,
    differsAt: [7],
  },
  {
    name: 'unmount with a request in flight',
    setup: deferredFixtures('paris-geocode'),
    steps: [type('Paris'), advance(), { type: 'unmount' }, resolve(0)],
    updatesAfterUnmount: true,
  },
  {
    name: 'unmount with a debounced search pending',
    fixtures: ['paris-geocode'],
    steps: [type('Paris'), { type: 'unmount' }, advance()],
    allow: allowlist.unmountPending,
    differsAt: [2],
    updatesAfterUnmount: true,
  },
  {
    name: 'search for an inherited property name',
    steps: [type('constructor'), advance()],
    allow: allowlist.inheritedKey,
    differsAt: [1],
  },
  {
    name: 'both libraries on the legacy fake',
    fixtures: ['paris-geocode'],
    replacementFake: 'legacy',
    steps: [type('Paris'), advance()],
    allow: allowlist.legacyFake,
    differsAt: [0, 1],
  },
];

async function traces(scenario: Scenario, strict: boolean): Promise<[Trace, Trace]> {
  const shared = {
    steps: scenario.steps,
    ...(scenario.fixtures ? { fixtures: scenario.fixtures } : {}),
    ...(scenario.props ? { props: scenario.props } : {}),
    ...(scenario.setup ? { setup: scenario.setup } : {}),
    ...(strict ? { strict: true } : {}),
  };
  const original = await runScenario({ subject: hookSubject(upstream), fake: 'legacy', ...shared });
  const replacement = await runScenario({
    subject: hookSubject(ours),
    fake: scenario.replacementFake ?? 'new',
    ...shared,
  });
  return [original, replacement];
}

function unmountWarningSteps(trace: Trace): number[] {
  return trace
    .filter((entry) =>
      entry.console.some((line) => String(line.args[0]).startsWith(UNMOUNTED_UPDATE)),
    )
    .map((entry) => entry.step);
}

function sortedUnique(steps: number[]): number[] {
  return Array.from(new Set(steps)).sort((a, b) => a - b);
}

function expectations(
  scenario: Scenario,
  original: Trace,
): { allow: AllowEntry[]; differsAt: number[] } {
  const allow = scenario.allow ?? [];
  const differsAt = scenario.differsAt ?? [];
  const warnedAt = scenario.updatesAfterUnmount ? unmountWarningSteps(original) : [];
  if (warnedAt.length === 0) return { allow, differsAt };
  return {
    allow: [...allow, ...allowlist.unmountWarning],
    differsAt: sortedUnique([...differsAt, ...warnedAt]),
  };
}

function stepsWithDiffs(original: Trace, replacement: Trace): number[] {
  return sortedUnique(compareTraces(original, replacement, []).diffs.map((diff) => diff.step));
}

for (const strict of [false, true]) {
  describe(strict ? 'differential under StrictMode' : 'differential', () => {
    for (const scenario of scenarios) {
      it(scenario.name, async () => {
        const [original, replacement] = await traces(scenario, strict);
        if (!react17) expect(unmountWarningSteps(original)).toEqual([]);
        expect(unmountWarningSteps(replacement)).toEqual([]);
        const { allow, differsAt } = expectations(scenario, original);
        const { diffs, unusedAllow } = compareTraces(original, replacement, allow);
        expect(diffs).toEqual([]);
        expect(unusedAllow).toEqual([]);
        expect(stepsWithDiffs(original, replacement)).toEqual(differsAt);
      });
    }
  });
}
