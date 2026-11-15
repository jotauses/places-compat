import {
  type AllowEntry,
  actCompat,
  compareTraces,
  type FakeControl,
  fakeMapsError,
  type LegacyControl,
  type Mounted,
  rpaSubject,
  runScenario,
  type Step,
  type Subject,
  type Trace,
} from '@places-compat/core/testing';
import * as upstream from 'upstream-rpa';
import { describe, expect, it } from 'vitest';
import * as ours from '../../src/index';
import { allowlist } from './allowlist';
import { LEGACY_PREDICTIONS, NEW_SUGGESTIONS, type Reply, type Script, scripts } from './scripts';

type Globals = Record<string, unknown> & { google?: { maps: Record<string, unknown> } };

const globals = window as unknown as Globals;

function registerLegacy(control: LegacyControl, reply: Reply): void {
  const opts = reply.deferred ? { deferred: true } : {};
  if ('predictions' in reply) {
    const predictions = LEGACY_PREDICTIONS.slice(0, reply.predictions).map((prediction, index) =>
      reply.ids ? { ...prediction, id: `prediction-${index}` } : prediction,
    );
    control.onPredictions(reply.input, predictions, opts);
  } else {
    control.onPredictions(reply.input, reply.status, opts);
  }
}

function registerNew(control: FakeControl, reply: Reply): void {
  const opts = reply.deferred ? { deferred: true } : {};
  if ('predictions' in reply) {
    control.onSuggest(reply.input, NEW_SUGGESTIONS.slice(0, reply.predictions), opts);
  } else if ('code' in reply) {
    control.onSuggest(reply.input, fakeMapsError(reply.code), opts);
  } else {
    control.onSuggest(reply.input, [], opts);
  }
}

class HiddenPlaces {
  private places: unknown;
  private hidden = false;

  hide(): void {
    const maps = globals.google?.maps as Record<string, unknown>;
    this.places = maps.places;
    this.hidden = true;
    delete maps.places;
  }

  restore(): void {
    if (!this.hidden) return;
    this.hidden = false;
    (globals.google?.maps as Record<string, unknown>).places = this.places;
  }
}

function withGlobalCallback(base: Subject, name: string, places: HiddenPlaces): Subject {
  return {
    name: base.name,
    async mount(env): Promise<Mounted> {
      const mounted = await base.mount(env);
      return {
        ...mounted,
        async act(step: Step) {
          if (step.type !== 'call') return mounted.act(step);
          places.restore();
          const callback = globals[step.name];
          if (typeof callback !== 'function') throw new Error(`window.${step.name} is not set`);
          await actCompat(() => {
            callback(...(step.args ?? []));
          });
        },
        snapshot: () => ({
          ...(mounted.snapshot() as object),
          globalCallback: typeof globals[name],
        }),
      };
    },
  };
}

interface Run {
  trace: Trace;
  inputs: unknown[];
  importedPlaces: boolean;
}

async function run(mod: unknown, fake: 'legacy' | 'new', script: Script): Promise<Run> {
  const places = new HiddenPlaces();
  const name = script.props?.googleCallbackName;
  const subject =
    typeof name === 'string' ? withGlobalCallback(rpaSubject(mod), name, places) : rpaSubject(mod);
  let calls: { kind: string; request: unknown }[] = [];
  const trace = await runScenario({
    subject,
    fake,
    steps: script.steps,
    ...(script.props ? { props: script.props } : {}),
    ...(script.strict ? { strict: true } : {}),
    setup(control) {
      calls = control.calls;
      for (const reply of script.replies ?? []) {
        if ('onSuggest' in control) registerNew(control, reply);
        else registerLegacy(control, reply);
      }
      if (script.placesAfterCallback) places.hide();
      if (script.placesThroughImportLibrary && fake === 'new') places.hide();
    },
  });
  return {
    trace,
    inputs: calls
      .filter((call) => call.kind === 'suggest' || call.kind === 'predictions')
      .map((call) => (call.request as { input?: unknown }).input),
    importedPlaces: calls.some((call) => call.kind === 'importLibrary'),
  };
}

const used = new Set<AllowEntry>();

describe('matches react-places-autocomplete 7.3.0 on the legacy API', () => {
  for (const script of scripts) {
    it(script.name, async () => {
      const original = await run(upstream, 'legacy', script);
      const replacement = await run(ours, 'new', script);
      const { diffs, unusedAllow } = compareTraces(original.trace, replacement.trace, allowlist);
      for (const entry of allowlist) if (!unusedAllow.includes(entry)) used.add(entry);
      expect(diffs).toEqual([]);
      expect(replacement.inputs).toEqual(original.inputs);
      expect(replacement.importedPlaces).toBe(Boolean(script.placesThroughImportLibrary));
      script.check?.(original.trace);
    });
  }

  it('uses every allowlist entry', () => {
    expect(allowlist.filter((entry) => !used.has(entry)).map((entry) => entry.id)).toEqual([]);
  });
});
