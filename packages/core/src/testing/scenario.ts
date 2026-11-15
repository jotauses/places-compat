import { vi } from 'vitest';
import { createLegacyFakeGoogle } from './fake-legacy';
import { createFakeGoogle, fakeMapsError } from './fake-new';
import { applyFixture, loadFixture } from './fixtures';
import { collapseRepeats, normalize, normalizeConsoleArgs } from './normalize';
import { actCompat } from './render';
import type {
  FakeControl,
  LegacyControl,
  Mounted,
  PendingReply,
  Step,
  Subject,
  Trace,
  TraceEntry,
} from './types';

export interface ScenarioOptions {
  subject: Subject;
  fake: 'legacy' | 'new';
  steps: Step[];
  props?: Record<string, unknown>;
  fixtures?: string[];
  setup?(control: FakeControl | LegacyControl): void;
  strict?: boolean;
}

export const SCENARIO_TIME = new Date('2026-01-01T00:00:00Z');

const FAKED_TIMERS = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'Date',
] as const;

const MAX_INLINE = 60;

function inline(value: unknown): string {
  const text = JSON.stringify(normalize(value));
  return text.length <= MAX_INLINE ? text : '...';
}

export function stepLabel(step: Step): string {
  switch (step.type) {
    case 'type':
      return `type ${JSON.stringify(step.text)}`;
    case 'key':
      return `key ${step.key}`;
    case 'hover':
    case 'click':
    case 'resolve':
      return `${step.type} ${step.index}`;
    case 'reject':
      return step.code === undefined ? `reject ${step.index}` : `reject ${step.index} ${step.code}`;
    case 'advance':
      return `advance ${step.ms}`;
    case 'call': {
      const args = step.args ?? [];
      if (args.length === 0) return `call ${step.name}`;
      const text = inline(args);
      return `call ${step.name}(${text === '...' ? text : text.slice(1, -1)})`;
    }
    case 'rerender':
      return `rerender ${inline(step.props)}`;
    default:
      return step.type;
  }
}

const ENDPOINTS: Record<PendingReply['kind'], string> = {
  suggest: 'PLACES_AUTOCOMPLETE',
  predictions: 'PLACES_AUTOCOMPLETE',
  queryPredictions: 'PLACES_AUTOCOMPLETE',
  fetchFields: 'PLACES_GET_PLACE',
  details: 'PLACES_GET_PLACE',
  geocode: 'GEOCODER_GEOCODE',
};

function pendingAt(control: FakeControl | LegacyControl, index: number): PendingReply {
  const pending = control.pending[index];
  if (!pending) {
    throw new Error(`No pending reply number ${index}: ${control.pending.length} so far.`);
  }
  return pending;
}

function settlePending(control: FakeControl | LegacyControl, step: Step): void {
  if (step.type === 'resolve') pendingAt(control, step.index).resolve();
  else if (step.type === 'reject') {
    const pending = pendingAt(control, step.index);
    pending.reject(
      step.code === undefined ? undefined : fakeMapsError(step.code, ENDPOINTS[pending.kind]),
    );
  }
}

type ConsoleEntry = TraceEntry['console'][number];

function captureConsole(buffer: ConsoleEntry[]): () => void {
  const original = { error: console.error, warn: console.warn };
  console.error = (...args: unknown[]) => {
    buffer.push({ level: 'error', args: normalizeConsoleArgs(args) });
  };
  console.warn = (...args: unknown[]) => {
    buffer.push({ level: 'warn', args: normalizeConsoleArgs(args) });
  };
  return () => {
    console.error = original.error;
    console.warn = original.warn;
  };
}

function noop(): void {}

function clearSessionStorage(): void {
  try {
    sessionStorage.clear();
  } catch {}
}

export async function runScenario(opts: ScenarioOptions): Promise<Trace> {
  const trace: Trace = [];
  const consoleBuffer: ConsoleEntry[] = [];
  const cleanups: (() => void)[] = [];
  let mounted: Mounted | undefined;

  const record = (step: number, label: string) => {
    const current = mounted as Mounted;
    const entry: TraceEntry = {
      step,
      label,
      settled: normalize(current.snapshot()),
      loading: collapseRepeats(current.loadingSeen()),
      callbacks: current.callbacks().map(({ name, args }) => ({
        name,
        args: normalize(args) as unknown[],
      })),
      console: consoleBuffer.splice(0),
    };
    trace.push(JSON.parse(JSON.stringify(entry)) as TraceEntry);
  };

  const teardown = async (): Promise<unknown[]> => {
    const errors: unknown[] = [];
    const attempt = (fn: () => void) => {
      try {
        fn();
      } catch (error) {
        errors.push(error);
      }
    };
    if (mounted) {
      attempt((mounted as Mounted).unmount);
      await actCompat(noop).catch((error: unknown) => errors.push(error));
    }
    for (const cleanup of cleanups.reverse()) attempt(cleanup);
    return errors;
  };

  try {
    vi.useFakeTimers({ toFake: [...FAKED_TIMERS] });
    cleanups.push(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
    });
    vi.setSystemTime(SCENARIO_TIME);
    clearSessionStorage();
    cleanups.push(clearSessionStorage);

    const fake = opts.fake === 'legacy' ? createLegacyFakeGoogle() : createFakeGoogle();
    cleanups.push(fake.install());
    for (const slug of opts.fixtures ?? []) applyFixture(fake.control, loadFixture(slug));
    opts.setup?.(fake.control);

    cleanups.push(captureConsole(consoleBuffer));

    const env = {
      google: fake.google,
      props: opts.props ?? {},
      control: fake.control,
      ...(opts.strict === undefined ? {} : { strict: opts.strict }),
    };
    mounted = await opts.subject.mount(env);
    await actCompat(noop);
    mounted.loadingSeen();

    for (let index = 0; index < opts.steps.length; index++) {
      const step = opts.steps[index] as Step;
      const current = mounted as Mounted;
      if (step.type === 'advance') {
        await actCompat(async () => {
          await vi.advanceTimersByTimeAsync(step.ms);
        });
      } else if (step.type === 'resolve' || step.type === 'reject') {
        await actCompat(() => settlePending(fake.control, step));
      } else {
        await current.act(step);
        await actCompat(noop);
      }
      record(index, stepLabel(step));
    }
  } catch (error) {
    await teardown();
    throw error;
  }
  const errors = await teardown();
  if (errors.length > 0) throw errors[0];
  return trace;
}
