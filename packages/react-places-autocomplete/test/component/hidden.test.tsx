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
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import PlacesAutocomplete from '../../src/PlacesAutocomplete';

type Props = React.ComponentProps<typeof PlacesAutocomplete>;
type RenderArg = Parameters<Props['children']>[0];

type ActivityType = React.ComponentType<{
  mode: 'hidden' | 'visible';
  children?: React.ReactNode;
}>;

const Activity = (React as unknown as { Activity?: ActivityType }).Activity;

const SUGGESTIONS = loadFixture('rpa-mock-suggestions').new.suggestions;

function Controlled({
  extra,
  seen,
}: {
  extra: Partial<Props>;
  seen: RenderArg[];
}): React.ReactElement {
  const [value, setValue] = React.useState('');
  return (
    <PlacesAutocomplete value={value} onChange={setValue} {...extra}>
      {(arg) => {
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
      }}
    </PlacesAutocomplete>
  );
}

function view(container: HTMLElement, seen: RenderArg[]) {
  return {
    input: () => container.querySelector('input') as HTMLInputElement,
    options: () => container.querySelectorAll('[role="option"]'),
    loading: () => (seen[seen.length - 1] as RenderArg).loading,
  };
}

function suggestCalls(control: FakeControl) {
  return control.calls.filter((call) => call.kind === 'suggest');
}

async function type(input: HTMLInputElement, text: string, wait = 200): Promise<void> {
  fireEvent.change(input, { target: { value: text } });
  await actCompat(() => {
    vi.advanceTimersByTime(wait);
  });
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

describe.skipIf(!Activity)('inside a hidden Activity', () => {
  function mountInActivity(extra: Partial<Props> = {}) {
    const Boundary = Activity as ActivityType;
    const seen: RenderArg[] = [];
    const element = (mode: 'hidden' | 'visible') => (
      <Boundary mode={mode}>
        <Controlled extra={extra} seen={seen} />
      </Boundary>
    );
    const rendered = renderCompat(element('visible'));
    return {
      ...view(rendered.container, seen),
      setMode: (mode: 'hidden' | 'visible') => rendered.rerender(element(mode)),
    };
  }

  it('applies suggestions that arrive while hidden once shown again', async () => {
    control.reset();
    control.onSuggest(() => true, SUGGESTIONS, { deferred: true });
    const { input, options, loading, setMode } = mountInActivity();
    await type(input(), 'San');
    expect(loading()).toBe(true);

    await actCompat(() => setMode('hidden'));
    await actCompat(() => {
      control.pending[0]?.resolve();
    });
    await actCompat(() => setMode('visible'));

    expect(loading()).toBe(false);
    expect(options()).toHaveLength(5);
  });

  it('reports an error that arrives while hidden once shown again', async () => {
    control.reset();
    control.onSuggest(() => true, [], { deferred: true });
    const onError = vi.fn();
    const { input, loading, setMode } = mountInActivity({ onError });
    await type(input(), 'San');

    await actCompat(() => setMode('hidden'));
    await actCompat(() => {
      control.pending[0]?.resolve();
    });
    expect(onError).not.toHaveBeenCalled();
    await actCompat(() => setMode('visible'));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('ZERO_RESULTS', expect.any(Function));
    expect(loading()).toBe(false);
  });

  it('runs a search that was still debouncing when hidden once shown again', async () => {
    const { input, options, setMode } = mountInActivity();
    await type(input(), 'San Francisco', 100);

    await actCompat(() => setMode('hidden'));
    await actCompat(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(suggestCalls(control)).toHaveLength(0);
    await actCompat(() => setMode('visible'));

    expect(suggestCalls(control)).toHaveLength(1);
    expect(suggestCalls(control)[0]).toMatchObject({ request: { input: 'San Francisco' } });
    expect(options()).toHaveLength(5);
  });
});

interface Pending {
  promise: Promise<void>;
  done: boolean;
}

function Gate({ pending }: { pending: Pending | undefined }): null {
  if (pending && !pending.done) throw pending.promise;
  return null;
}

describe('inside a Suspense boundary that suspends again', () => {
  function mountInSuspense() {
    const seen: RenderArg[] = [];
    let resolve: () => void = () => {};
    const pending: Pending = {
      promise: new Promise<void>((done) => {
        resolve = done;
      }),
      done: false,
    };
    const element = (suspend: boolean) => (
      <React.Suspense fallback={<p>loading</p>}>
        <Gate pending={suspend ? pending : undefined} />
        <Controlled extra={{}} seen={seen} />
      </React.Suspense>
    );
    const rendered = renderCompat(element(false));
    return {
      ...view(rendered.container, seen),
      suspend: () => rendered.rerender(element(true)),
      release: () => {
        pending.done = true;
        resolve();
        return pending.promise;
      },
    };
  }

  it('applies suggestions that arrive while suspended once shown again', async () => {
    control.reset();
    control.onSuggest(() => true, SUGGESTIONS, { deferred: true });
    const { input, options, loading, suspend, release } = mountInSuspense();
    await type(input(), 'San');
    expect(loading()).toBe(true);

    await actCompat(() => suspend());
    await actCompat(() => {
      control.pending[0]?.resolve();
    });
    await actCompat(async () => {
      await release();
    });

    expect(loading()).toBe(false);
    expect(options()).toHaveLength(5);
  });
});
