import React from 'react';
import * as rga from 'upstream-rga';
import * as rgaService from 'upstream-rga/lib/usePlacesAutocompleteService';
import * as rpa from 'upstream-rpa';
import * as upa from 'upstream-upa';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFixture } from '../../src/testing/fixtures';
import { runScenario, SCENARIO_TIME, stepLabel } from '../../src/testing/scenario';
import { hookSubject } from '../../src/testing/subjects/hook';
import { rpaSubject } from '../../src/testing/subjects/rpa';
import { serviceHookSubject } from '../../src/testing/subjects/service-hook';
import { moduleExport, unwrapModule } from '../../src/testing/subjects/shared';
import { RECORDED_SETTERS, widgetSubject } from '../../src/testing/subjects/widget';
import type {
  FakeControl,
  LegacyControl,
  Mounted,
  Step,
  Subject,
  TraceEntry,
} from '../../src/testing/types';

type Env = Parameters<Subject['mount']>[0];

interface ProbeHooks {
  mount?(env: Env, log: (name: string, ...args: unknown[]) => void): void;
  act?(step: Step, env: Env, log: (name: string, ...args: unknown[]) => void): unknown;
  unmount?(): void;
  snapshot?(): unknown;
  loading?: boolean[];
}

function probe(hooks: ProbeHooks = {}): Subject & { env: Env | undefined; unmounts: number } {
  const subject = {
    name: 'probe',
    env: undefined as Env | undefined,
    unmounts: 0,
    mount(env: Env): Mounted {
      subject.env = env;
      const calls: { name: string; args: unknown[] }[] = [];
      const log = (name: string, ...args: unknown[]) => calls.push({ name, args });
      hooks.mount?.(env, log);
      return {
        act: (step) => {
          hooks.act?.(step, env, log);
        },
        snapshot: () => (hooks.snapshot ? hooks.snapshot() : { now: Date.now() }),
        loadingSeen: () => (hooks.loading ? hooks.loading.splice(0) : []),
        callbacks: () => calls.splice(0),
        unmount: () => {
          subject.unmounts++;
          hooks.unmount?.();
        },
      };
    },
  };
  return subject;
}

const call = (name: string, args?: unknown[]): Step =>
  args ? { type: 'call', name, args } : { type: 'call', name };

function names(entry: TraceEntry | undefined): string[] {
  return (entry?.callbacks ?? []).map((callback) => callback.name);
}

afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
});

describe('stepLabel', () => {
  it('gives a readable label for every step type', () => {
    const cases: [Step, string][] = [
      [{ type: 'type', text: 'Paris' }, 'type "Paris"'],
      [{ type: 'key', key: 'ArrowDown' }, 'key ArrowDown'],
      [{ type: 'hover', index: 1 }, 'hover 1'],
      [{ type: 'click', index: 0 }, 'click 0'],
      [{ type: 'focus' }, 'focus'],
      [{ type: 'blur' }, 'blur'],
      [{ type: 'advance', ms: 200 }, 'advance 200'],
      [{ type: 'resolve', index: 2 }, 'resolve 2'],
      [{ type: 'reject', index: 0 }, 'reject 0'],
      [{ type: 'reject', index: 0, code: 'OVER_QUERY_LIMIT' }, 'reject 0 OVER_QUERY_LIMIT'],
      [call('clearSuggestions'), 'call clearSuggestions'],
      [call('setValue', ['a', false]), 'call setValue("a",false)'],
      [call('selectPlace', [{ long: 'x'.repeat(80) }]), 'call selectPlace(...)'],
      [{ type: 'rerender', props: { debounce: 0 } }, 'rerender {"debounce":0}'],
      [{ type: 'unmount' }, 'unmount'],
    ];
    for (const [step, label] of cases) expect(stepLabel(step)).toBe(label);
  });
});

describe('runScenario mechanics', () => {
  it('records one entry per step: entry i is steps[i], with the step label', async () => {
    const trace = await runScenario({
      subject: probe(),
      fake: 'legacy',
      steps: [call('one'), { type: 'advance', ms: 5 }],
    });
    expect(trace.map((entry) => [entry.step, entry.label])).toEqual([
      [0, 'call one'],
      [1, 'advance 5'],
    ]);
    await expect(runScenario({ subject: probe(), fake: 'legacy', steps: [] })).resolves.toEqual([]);
  });

  it('puts the mount callbacks and console in entry 0 and drops the mount loading', async () => {
    const loading: boolean[] = [];
    const subject = probe({
      loading,
      mount: (_env, log) => {
        loading.push(true);
        log('at mount');
        console.warn('warned at mount');
      },
      act: (_step, _env, log) => {
        loading.push(false);
        log('in step');
      },
    });
    const trace = await runScenario({ subject, fake: 'legacy', steps: [call('a'), call('b')] });
    expect(trace.map((entry) => [names(entry), entry.loading])).toEqual([
      [['at mount', 'in step'], [false]],
      [['in step'], [false]],
    ]);
    expect(trace[0]?.console).toEqual([{ level: 'warn', args: ['warned at mount'] }]);
    expect(trace[1]?.console).toEqual([]);
  });

  it('hands the subject the fake, props, strict flag and control, after fixtures and setup', async () => {
    const subject = probe();
    let seen: FakeControl | LegacyControl | undefined;
    await runScenario({
      subject,
      fake: 'legacy',
      steps: [],
      props: { debounce: 0 },
      strict: true,
      fixtures: ['paris-geocode'],
      setup: (control) => {
        seen = control;
        (control as LegacyControl).onPredictions('Lyon', 'OVER_QUERY_LIMIT');
      },
    });
    const env = subject.env as Env;
    expect(env.props).toEqual({ debounce: 0 });
    expect(env.strict).toBe(true);
    expect(env.control).toBe(seen);
    expect(typeof (env.control as LegacyControl).selectPlace).toBe('function');
    expect(typeof env.google.maps.places.AutocompleteService).toBe('function');
  });

  it('uses the new fake, empty props and no strict flag by default', async () => {
    const subject = probe();
    await runScenario({ subject, fake: 'new', steps: [] });
    const env = subject.env as Env;
    expect(env.props).toEqual({});
    expect('strict' in env).toBe(false);
    expect(typeof (env.control as FakeControl).onSuggest).toBe('function');
  });

  it('installs the fake as the global google for the whole script', async () => {
    let during: unknown;
    const subject = probe({
      mount: (env) => {
        during = (globalThis as { google?: unknown }).google === env.google;
      },
    });
    await runScenario({ subject, fake: 'legacy', steps: [] });
    expect(during).toBe(true);
  });

  it('fixes the system time and only moves timers on advance steps', async () => {
    const subject = probe({
      act: (step, _env, log) => {
        if (step.type === 'call') setTimeout(() => log('fired', Date.now()), 100);
      },
    });
    const start = SCENARIO_TIME.getTime();
    const trace = await runScenario({
      subject,
      fake: 'legacy',
      steps: [call('arm'), { type: 'advance', ms: 99 }, { type: 'advance', ms: 1 }],
    });
    expect(trace.map((entry) => entry.settled)).toEqual([
      { now: start },
      { now: start + 99 },
      { now: start + 100 },
    ]);
    expect(names(trace[0])).toEqual([]);
    expect(names(trace[1])).toEqual([]);
    expect(trace[2]?.callbacks).toEqual([{ name: 'fired', args: [start + 100] }]);
  });

  it('flushes promise chains of a step before recording it', async () => {
    const subject = probe({
      act: (_step, _env, log) => {
        void Promise.resolve()
          .then(() => undefined)
          .then(() => undefined)
          .then(() => queueMicrotask(() => log('late')));
      },
    });
    const trace = await runScenario({ subject, fake: 'legacy', steps: [call('go')] });
    expect(names(trace[0])).toEqual(['late']);
  });

  it('lets promise work interleave with timers inside an advance step', async () => {
    const subject = probe({
      act: (_step, _env, log) => {
        setTimeout(() => {
          void Promise.resolve().then(() => {
            log('first');
            setTimeout(() => log('second'), 10);
          });
        }, 10);
      },
    });
    const trace = await runScenario({
      subject,
      fake: 'legacy',
      steps: [call('go'), { type: 'advance', ms: 20 }],
    });
    expect(names(trace[1])).toEqual(['first', 'second']);
  });

  it('collapses consecutive repeats of loading and normalises callback arguments', async () => {
    const loading: boolean[] = [];
    const subject = probe({
      loading,
      act: (_step, _env, log) => {
        loading.push(false, true, true, false, false);
        log('cb', undefined, () => 0, document.createElement('input'));
      },
    });
    const trace = await runScenario({ subject, fake: 'legacy', steps: [call('go')] });
    expect(trace[0]?.loading).toEqual([false, true, false]);
    expect(trace[0]?.callbacks).toEqual([
      { name: 'cb', args: ['[undefined]', '[fn]', '[element input]'] },
    ]);
  });

  it('captures console.error and console.warn per step without printing them', async () => {
    const printed = vi.fn();
    const original = { error: console.error, warn: console.warn };
    console.error = printed;
    console.warn = printed;
    try {
      const subject = probe({
        mount: () => console.warn('at mount'),
        act: () => {
          console.error('Status: ', 'ZERO_RESULTS', () => 0);
          console.warn(new Error('careful'));
        },
      });
      const trace = await runScenario({ subject, fake: 'legacy', steps: [call('go'), call('x')] });
      expect(trace[0]?.console).toEqual([
        { level: 'warn', args: ['at mount'] },
        { level: 'error', args: ['Status: ', 'ZERO_RESULTS', '[fn]'] },
        { level: 'warn', args: ['Error: careful'] },
      ]);
      expect(trace[1]?.console).toHaveLength(2);
      expect(printed).not.toHaveBeenCalled();
      expect(console.error).toBe(printed);
      expect(console.warn).toBe(printed);
    } finally {
      console.error = original.error;
      console.warn = original.warn;
    }
  });

  it('delivers deferred replies in the order the resolve steps give', async () => {
    const subject = probe({
      act: (step, env, log) => {
        if (step.type !== 'call') return;
        const service = new env.google.maps.places.AutocompleteService();
        for (const input of ['a', 'b', 'c']) {
          void service.getPlacePredictions({ input }, (_predictions, status) =>
            log(`reply ${input}`, status),
          );
        }
      },
    });
    const trace = await runScenario({
      subject,
      fake: 'legacy',
      setup: (control) => (control as LegacyControl).onPredictions(/./, [], { deferred: true }),
      steps: [
        call('ask'),
        { type: 'resolve', index: 2 },
        { type: 'resolve', index: 0 },
        { type: 'reject', index: 1, code: 'OVER_QUERY_LIMIT' },
      ],
    });
    expect(trace.map((entry) => entry.callbacks)).toEqual([
      [],
      [{ name: 'reply c', args: ['OK'] }],
      [{ name: 'reply a', args: ['OK'] }],
      [{ name: 'reply b', args: ['OVER_QUERY_LIMIT'] }],
    ]);
  });

  it('rejects a legacy reply without a code as UNKNOWN_ERROR', async () => {
    const subject = probe({
      act: (step, env, log) => {
        if (step.type !== 'call') return;
        const service = new env.google.maps.places.AutocompleteService();
        void service.getPlacePredictions({ input: 'a' }, (_p, status) => log('reply', status));
      },
    });
    const trace = await runScenario({
      subject,
      fake: 'legacy',
      setup: (control) => (control as LegacyControl).onPredictions('a', [], { deferred: true }),
      steps: [call('ask'), { type: 'reject', index: 0 }],
    });
    expect(trace[1]?.callbacks).toEqual([{ name: 'reply', args: ['UNKNOWN_ERROR'] }]);
  });

  it('rejects a new-API reply with fakeMapsError(code) and the endpoint of its kind', async () => {
    const subject = probe({
      act: (step, env, log) => {
        if (step.type !== 'call') return;
        const { AutocompleteSuggestion } = env.google.maps.places;
        AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: 'a' }).catch(
          (error: unknown) => log('rejected', error),
        );
      },
    });
    const trace = await runScenario({
      subject,
      fake: 'new',
      setup: (control) => (control as FakeControl).onSuggest('a', [], { deferred: true }),
      steps: [call('ask'), { type: 'reject', index: 0, code: 'NOT_FOUND' }],
    });
    expect(trace[1]?.callbacks).toEqual([
      {
        name: 'rejected',
        args: [
          {
            name: 'MapsRequestError',
            message: 'Error in fetching AutocompleteSuggestions: NOT_FOUND',
            code: 'NOT_FOUND',
            endpoint: 'PLACES_AUTOCOMPLETE',
          },
        ],
      },
    ]);
  });

  it('fails a resolve step that names no pending reply', async () => {
    await expect(
      runScenario({ subject: probe(), fake: 'legacy', steps: [{ type: 'resolve', index: 0 }] }),
    ).rejects.toThrow('No pending reply number 0: 0 so far.');
  });

  it('clears sessionStorage before and after the script', async () => {
    sessionStorage.setItem('upa', 'stale');
    let before: string | null = 'unset';
    const subject = probe({
      mount: () => {
        before = sessionStorage.getItem('upa');
      },
      act: () => sessionStorage.setItem('upa', 'written'),
    });
    await runScenario({ subject, fake: 'legacy', steps: [call('write')] });
    expect(before).toBeNull();
    expect(sessionStorage.getItem('upa')).toBeNull();
  });

  it('restores timers, console, the global google and unmounts after a run', async () => {
    const previous = { marker: true };
    (globalThis as { google?: unknown }).google = previous;
    const original = { error: console.error, warn: console.warn };
    try {
      const subject = probe();
      await runScenario({ subject, fake: 'legacy', steps: [] });
      expect(subject.unmounts).toBe(1);
      expect(vi.isFakeTimers()).toBe(false);
      expect((globalThis as { google?: unknown }).google).toBe(previous);
      expect(console.error).toBe(original.error);
      expect(console.warn).toBe(original.warn);
    } finally {
      delete (globalThis as { google?: unknown }).google;
    }
  });

  it('cleans up the same way when a step throws, and rethrows the step error', async () => {
    const original = { error: console.error, warn: console.warn };
    sessionStorage.clear();
    const subject = probe({
      act: (step) => {
        sessionStorage.setItem('k', 'v');
        if (step.type === 'focus') throw new Error('step failed');
      },
    });
    await expect(
      runScenario({ subject, fake: 'legacy', steps: [call('ok'), { type: 'focus' }] }),
    ).rejects.toThrow('step failed');
    expect(subject.unmounts).toBe(1);
    expect(vi.isFakeTimers()).toBe(false);
    expect('google' in globalThis).toBe(false);
    expect(console.error).toBe(original.error);
    expect(console.warn).toBe(original.warn);
    expect(sessionStorage.getItem('k')).toBeNull();
  });

  it('still cleans up when the mount throws', async () => {
    const subject: Subject = {
      name: 'broken',
      mount: () => {
        throw new Error('mount failed');
      },
    };
    await expect(runScenario({ subject, fake: 'new', steps: [] })).rejects.toThrow('mount failed');
    expect(vi.isFakeTimers()).toBe(false);
    expect('google' in globalThis).toBe(false);
  });

  it('reports an unmount error after the rest of the cleanup ran', async () => {
    const subject = probe({
      unmount: () => {
        throw new Error('unmount failed');
      },
    });
    await expect(runScenario({ subject, fake: 'legacy', steps: [] })).rejects.toThrow(
      'unmount failed',
    );
    expect(vi.isFakeTimers()).toBe(false);
    expect('google' in globalThis).toBe(false);
  });

  it('keeps the step error when the unmount also fails', async () => {
    const subject = probe({
      act: () => {
        throw new Error('step failed');
      },
      unmount: () => {
        throw new Error('unmount failed');
      },
    });
    await expect(runScenario({ subject, fake: 'legacy', steps: [call('x')] })).rejects.toThrow(
      'step failed',
    );
  });

  it('gives a trace that survives a JSON round trip', async () => {
    const subject = probe({ snapshot: () => ({ fn: () => 0, missing: undefined }) });
    const trace = await runScenario({ subject, fake: 'legacy', steps: [call('x')] });
    expect(trace[0]?.settled).toEqual({ fn: '[fn]', missing: '[undefined]' });
    expect(JSON.parse(JSON.stringify(trace))).toEqual(trace);
  });
});

describe('module helpers', () => {
  it('unwraps a namespace whose default is an ES-module-shaped exports object', () => {
    const hook = () => 0;
    const exportsObject = Object.defineProperty({ default: hook }, '__esModule', { value: true });
    expect(unwrapModule({ default: exportsObject })).toBe(exportsObject);
    expect(moduleExport({ default: exportsObject }, 'default', 's')).toBe(hook);
    expect(unwrapModule({ default: { __esModule: true, named: 1 } })).toEqual({
      __esModule: true,
      named: 1,
    });
  });

  it('leaves a plain namespace alone', () => {
    const hook = () => 0;
    const namespace = { default: hook, usePlacesWidget: hook };
    expect(unwrapModule(namespace)).toBe(namespace);
    const objectDefault = { default: { value: 1 } };
    expect(unwrapModule(objectDefault)).toBe(objectDefault);
  });

  it('fails clearly when the export is missing', () => {
    expect(() => moduleExport({}, 'usePlacesWidget', 'widgetSubject')).toThrow(
      'widgetSubject: the module has no function "usePlacesWidget"',
    );
  });
});

describe('hookSubject', () => {
  it('forwards calls and reads the cache under the cacheKey prop', async () => {
    const trace = await runScenario({
      subject: hookSubject(upa),
      fake: 'legacy',
      fixtures: ['paris-geocode'],
      props: { debounce: 0 },
      steps: [
        call('setValue', ['Paris']),
        { type: 'advance', ms: 0 },
        call('clearCache'),
        call('setValue', ['Paris', false]),
        { type: 'rerender', props: { debounce: 0, cacheKey: 'other' } },
        call('init'),
        { type: 'unmount' },
      ],
    });
    const settled = trace.map((entry) => entry.settled as Record<string, unknown>);
    expect((settled[1]?.suggestions as { status: string } | undefined)?.status).toBe('OK');
    expect(Object.keys(settled[1]?.storage as object)).toEqual(['Paris']);
    expect(settled[2]?.storage).toBeNull();
    expect(settled[4]?.storage).toBeNull();
    expect(settled[6]?.ready).toBe(true);
  });

  it('shows a cache entry that is not JSON as the raw string', async () => {
    const trace = await runScenario({
      subject: hookSubject(upa),
      fake: 'legacy',
      props: { cacheKey: 'raw' },
      steps: [{ type: 'rerender', props: { cacheKey: 'raw' } }],
      setup: () => {
        sessionStorage.setItem('raw', 'not json');
      },
    });
    expect((trace[0]?.settled as { storage: unknown } | undefined)?.storage).toBe('not json');
  });

  it('refuses unknown calls and steps that do not apply', async () => {
    const subject = hookSubject(upa);
    await expect(runScenario({ subject, fake: 'legacy', steps: [call('nope')] })).rejects.toThrow(
      'call nope does not apply to hookSubject',
    );
    await expect(
      runScenario({ subject, fake: 'legacy', steps: [{ type: 'key', key: 'Enter' }] }),
    ).rejects.toThrow('step key does not apply to hookSubject');
  });
});

describe('rpaSubject', () => {
  const steps = (...rest: Step[]): Step[] => [
    { type: 'type', text: 'San Francisco' },
    { type: 'advance', ms: 200 },
    ...rest,
  ];

  it('hovers and clicks suggestions and records onSelect', async () => {
    const trace = await runScenario({
      subject: rpaSubject(rpa),
      fake: 'legacy',
      fixtures: ['rpa-mock-suggestions'],
      steps: steps({ type: 'hover', index: 1 }, { type: 'click', index: 1 }),
    });
    const hovered = trace[2]?.settled as { renderArg: { suggestions: { active: boolean }[] } };
    expect(hovered.renderArg.suggestions.map((s) => s.active)).toEqual([
      false,
      true,
      false,
      false,
      false,
    ]);
    const selected = trace[3]?.callbacks[0];
    expect(selected?.name).toBe('onSelect');
    expect(selected?.args.slice(0, 2)).toEqual([
      'San Francisco International Airport (SFO), San Francisco, CA, USA',
      'ChIJVVVVVYx3j4ARP-3NGldc8qQ',
    ]);
  });

  it('clears suggestions on blur and keeps them on focus', async () => {
    const trace = await runScenario({
      subject: rpaSubject(rpa),
      fake: 'legacy',
      fixtures: ['rpa-mock-suggestions'],
      steps: steps({ type: 'focus' }, { type: 'blur' }),
    });
    const count = (entry: TraceEntry | undefined) =>
      (entry?.settled as { renderArg: { suggestions: unknown[] } } | undefined)?.renderArg
        .suggestions.length;
    expect(count(trace[2])).toBe(5);
    expect(count(trace[3])).toBe(0);
  });

  it('records onError, or lets the default console.error run with onError: "default"', async () => {
    const run = (props: Record<string, unknown>) =>
      runScenario({
        subject: rpaSubject(rpa),
        fake: 'legacy',
        fixtures: ['zero-results'],
        props,
        steps: [
          { type: 'type', text: 'qqqzzzxxx' },
          { type: 'advance', ms: 200 },
        ],
      });
    const recorded = await run({});
    expect(recorded[1]?.callbacks).toEqual([{ name: 'onError', args: ['ZERO_RESULTS', '[fn]'] }]);
    expect(recorded[1]?.console).toEqual([]);
    const fallback = await run({ onError: 'default' });
    expect(fallback[1]?.callbacks).toEqual([]);
    expect(fallback[1]?.console).toHaveLength(1);
    expect(fallback[1]?.console[0]?.args[0]).toContain('[react-places-autocomplete]');
    expect(fallback[1]?.console[0]?.args[1]).toBe('ZERO_RESULTS');
  });

  it('takes a new value from a rerender and unmounts', async () => {
    const trace = await runScenario({
      subject: rpaSubject(rpa),
      fake: 'legacy',
      props: { value: 'start' },
      steps: [
        { type: 'focus' },
        { type: 'rerender', props: { value: 'next' } },
        { type: 'unmount' },
      ],
    });
    const value = (entry: TraceEntry | undefined) =>
      (entry?.settled as { inputProps: { value: string } } | undefined)?.inputProps.value;
    expect(value(trace[0])).toBe('start');
    expect(value(trace[1])).toBe('next');
    expect(value(trace[2])).toBe('next');
  });

  it('fails clearly on a missing item, a missing input and steps that do not apply', async () => {
    const subject = rpaSubject(rpa);
    await expect(
      runScenario({ subject, fake: 'legacy', steps: [{ type: 'hover', index: 0 }] }),
    ).rejects.toThrow('rpaSubject: there is no suggestion number 0');
    await expect(
      runScenario({ subject, fake: 'legacy', steps: [{ type: 'unmount' }, { type: 'focus' }] }),
    ).rejects.toThrow('rpaSubject: the input is not mounted');
    await expect(runScenario({ subject, fake: 'legacy', steps: [call('x')] })).rejects.toThrow(
      'step call does not apply to rpaSubject',
    );
  });
});

const widgetEvents: string[] = [];

function useStandInWidget(props: { onPlaceSelected?: (...args: unknown[]) => void }) {
  const ref = React.useRef<HTMLInputElement>(null);
  const autocompleteRef = React.useRef<unknown>(null);
  const onPlaceSelected = React.useRef(props.onPlaceSelected);
  onPlaceSelected.current = props.onPlaceSelected;
  React.useEffect(() => {
    const input = ref.current as HTMLInputElement;
    const list = document.createElement('div');
    const shim = {
      getPlace: () => ({ name: input.value }),
      addListener: () => ({ remove() {} }),
      setTypes: (types: string[]) => widgetEvents.push(`setTypes ${types.join()}`),
      setFields: () => undefined,
    };
    const select = (place: unknown) => onPlaceSelected.current?.(place, input, shim);
    autocompleteRef.current = shim;
    shim.setTypes(['geocode']);
    for (const name of ['first', 'second']) {
      const item = document.createElement('div');
      item.className = 'pac-item';
      item.textContent = name;
      item.addEventListener('mousedown', () => widgetEvents.push(`mousedown ${name}`));
      item.addEventListener('mouseover', () => widgetEvents.push(`hover ${name}`));
      item.addEventListener('click', () => select({ name }));
      list.appendChild(item);
    }
    document.body.appendChild(list);
    for (const type of ['keydown', 'focus', 'blur']) {
      input.addEventListener(type, (event) => {
        const key = (event as KeyboardEvent).key;
        widgetEvents.push(key ? `${type} ${key}` : type);
        if (key === 'Enter') select({ name: input.value });
      });
    }
    return () => list.remove();
  }, []);
  return { ref, autocompleteRef };
}

function fakeWidgetModule() {
  widgetEvents.length = 0;
  return { mod: { usePlacesWidget: useStandInWidget }, events: widgetEvents };
}

type Shim = { setFields(fields: unknown): void; setOptions(options: unknown): void };

function lockedWidget(make: () => Shim & { getPlace(): unknown }) {
  return {
    usePlacesWidget(props: { fields?: string[]; onPlaceSelected?: (...args: unknown[]) => void }) {
      const ref = React.useRef<HTMLInputElement>(null);
      const autocompleteRef = React.useRef<(Shim & { getPlace(): unknown }) | null>(null);
      React.useEffect(() => {
        autocompleteRef.current = make();
        autocompleteRef.current.setOptions({});
      }, [make]);
      React.useEffect(() => {
        const shim = autocompleteRef.current;
        shim?.setFields(props.fields);
        props.onPlaceSelected?.(shim?.getPlace(), ref.current, shim);
      }, [props.fields, props.onPlaceSelected]);
      return { ref, autocompleteRef };
    },
  };
}

class SealedShim {
  #fields: unknown[] = [];
  getPlace() {
    return { fieldCalls: this.#fields.length };
  }
  addListener() {
    return { remove() {} };
  }
  setFields(fields: unknown) {
    this.#fields.push(fields);
  }
  setOptions() {}
}

describe('widgetSubject', () => {
  it('records the setters of the legacy widget, selectPlace and enterWithoutSelection', async () => {
    const place = loadFixture('sf-geocode').detailsLegacy;
    const trace = await runScenario({
      subject: widgetSubject(rga),
      fake: 'legacy',
      props: { options: { types: ['address'], componentRestrictions: { country: 'fr' } } },
      steps: [
        { type: 'type', text: 'Lyon' },
        call('selectPlace', [place, 0]),
        call('enterWithoutSelection', [0]),
        { type: 'rerender', props: { options: { types: ['address'] } } },
        { type: 'unmount' },
      ],
    });
    expect(names(trace[0])).toEqual([
      'autocomplete.setFields',
      'autocomplete.setBounds',
      'autocomplete.setComponentRestrictions',
      'autocomplete.setOptions',
    ]);
    expect(trace[0]?.callbacks[2]?.args).toEqual([{ country: 'fr' }]);
    expect(trace.map((entry) => entry.settled)).toEqual([{}, {}, {}, {}, {}]);
    expect(trace[2]?.callbacks[0]).toEqual({
      name: 'onPlaceSelected',
      args: [{ name: 'Lyon' }, '[element input]', '[autocomplete]'],
    });
    expect(names(trace[3])).toEqual([
      'autocomplete.setFields',
      'autocomplete.setComponentRestrictions',
      'autocomplete.setOptions',
    ]);
  });

  it('drives a replacement through .pac-item clicks and DOM events', async () => {
    const { mod, events } = fakeWidgetModule();
    const trace = await runScenario({
      subject: widgetSubject(mod),
      fake: 'new',
      steps: [
        call('selectPlace', [{ ignored: true }, 1]),
        call('selectPlace'),
        { type: 'type', text: 'Rome' },
        call('enterWithoutSelection'),
        { type: 'key', key: 'ArrowDown' },
        { type: 'hover', index: 0 },
        { type: 'click', index: 0 },
        { type: 'focus' },
        { type: 'blur' },
      ],
    });
    expect(trace[0]?.callbacks).toEqual([
      { name: 'autocomplete.setTypes', args: [['geocode']] },
      { name: 'onPlaceSelected', args: [{ name: 'second' }, '[element input]', '[autocomplete]'] },
    ]);
    expect(trace[1]?.callbacks[0]?.args[0]).toEqual({ name: 'first' });
    expect(trace[3]?.callbacks[0]?.args[0]).toEqual({ name: 'Rome' });
    expect(trace[6]?.callbacks[0]?.args[0]).toEqual({ name: 'first' });
    expect(events).toEqual([
      'setTypes geocode',
      'mousedown second',
      'mousedown first',
      'keydown Enter',
      'keydown ArrowDown',
      'hover first',
      'mousedown first',
      'focus',
      'blur',
    ]);
    expect(trace.every((entry) => entry.loading.length === 0)).toBe(true);
  });

  it('records the setters of a frozen shim or a sealed class instance', async () => {
    const frozen = () =>
      Object.freeze({
        getPlace: () => ({ frozen: true }),
        addListener: () => ({ remove() {} }),
        setBounds() {},
        setComponentRestrictions() {},
        setFields() {},
        setOptions() {},
        setTypes() {},
      });
    const sealed = () => Object.preventExtensions(new SealedShim());
    const run = (make: () => Shim & { getPlace(): unknown }) =>
      runScenario({
        subject: widgetSubject(lockedWidget(make)),
        fake: 'new',
        props: { fields: ['a'] },
        steps: [{ type: 'rerender', props: { fields: ['b'] } }],
      });
    const placeArgs = (place: unknown) => [place, '[element input]', '[autocomplete]'];
    expect((await run(frozen)).map((entry) => entry.callbacks)).toEqual([
      [
        { name: 'autocomplete.setOptions', args: [{}] },
        { name: 'autocomplete.setFields', args: [['a']] },
        { name: 'onPlaceSelected', args: placeArgs({ frozen: true }) },
        { name: 'autocomplete.setFields', args: [['b']] },
        { name: 'onPlaceSelected', args: placeArgs({ frozen: true }) },
      ],
    ]);
    expect((await run(sealed)).map((entry) => entry.callbacks)).toEqual([
      [
        { name: 'autocomplete.setOptions', args: [{}] },
        { name: 'autocomplete.setFields', args: [['a']] },
        { name: 'onPlaceSelected', args: placeArgs({ fieldCalls: 1 }) },
        { name: 'autocomplete.setFields', args: [['b']] },
        { name: 'onPlaceSelected', args: placeArgs({ fieldCalls: 2 }) },
      ],
    ]);
  });

  it('records exactly the five Autocomplete setters', () => {
    expect(RECORDED_SETTERS).toEqual([
      'setBounds',
      'setComponentRestrictions',
      'setFields',
      'setOptions',
      'setTypes',
    ]);
  });

  it('fails clearly on a missing .pac-item, an unknown call and steps that do not apply', async () => {
    const { mod } = fakeWidgetModule();
    const subject = widgetSubject(mod);
    await expect(
      runScenario({ subject, fake: 'new', steps: [{ type: 'click', index: 5 }] }),
    ).rejects.toThrow('widgetSubject: there is no .pac-item number 5');
    await expect(runScenario({ subject, fake: 'new', steps: [call('nope')] })).rejects.toThrow(
      'call nope does not apply to widgetSubject',
    );
    await expect(
      runScenario({
        subject,
        fake: 'new',
        steps: [{ type: 'advance', ms: 0 }, { type: 'unmount' }],
      }),
    ).resolves.toHaveLength(2);
    await expect(
      runScenario({
        subject: widgetSubject(rga),
        fake: 'legacy',
        steps: [call('selectPlace', [{}, 3])],
      }),
    ).rejects.toThrow('No Autocomplete number 3');
  });

  it('refuses a step type that does not apply', async () => {
    const subject: Subject = widgetSubject(fakeWidgetModule().mod);
    const mounted = await subject.mount({ google: {} as typeof google, props: {} });
    try {
      await expect(
        Promise.resolve().then(() => mounted.act({ type: 'resolve', index: 0 })),
      ).rejects.toThrow('step resolve does not apply to widgetSubject');
    } finally {
      mounted.unmount();
    }
  });
});

describe('serviceHookSubject', () => {
  it('forwards type and calls, and shows the session token as [token]', async () => {
    const trace = await runScenario({
      subject: serviceHookSubject(rgaService),
      fake: 'legacy',
      fixtures: ['paris-geocode'],
      props: { sessionToken: true, debounce: 0 },
      setup: (control) => (control as LegacyControl).onPredictions('Pa', []),
      steps: [
        { type: 'type', text: 'Paris' },
        { type: 'advance', ms: 0 },
        call('refreshSessionToken'),
        call('getQueryPredictions', [{ input: 'Pa' }]),
        { type: 'advance', ms: 0 },
        { type: 'rerender', props: { sessionToken: true, debounce: 0 } },
        { type: 'unmount' },
      ],
    });
    const settled = trace.map((entry) => entry.settled as Record<string, unknown>);
    expect(trace[0]?.loading).toEqual([true]);
    expect((settled[1]?.placePredictions as unknown[] | undefined)?.length).toBe(5);
    expect(settled[1]?.autocompleteSessionToken).toBe('[token]');
    expect(settled[3]?.isQueryPredictionsLoading).toBe(true);
    expect(settled[4]?.queryPredictions).toEqual([]);
    expect(settled[4]?.isQueryPredictionsLoading).toBe(false);
    expect(settled[5]?.placesService).toBe(true);
  });

  it('refuses unknown calls and steps that do not apply', async () => {
    const subject = serviceHookSubject(rgaService);
    await expect(runScenario({ subject, fake: 'legacy', steps: [call('nope')] })).rejects.toThrow(
      'call nope does not apply to serviceHookSubject',
    );
    await expect(
      runScenario({ subject, fake: 'legacy', steps: [{ type: 'blur' }] }),
    ).rejects.toThrow('step blur does not apply to serviceHookSubject');
  });
});
