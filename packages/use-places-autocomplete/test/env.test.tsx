import {
  actCompat,
  applyFixture,
  compareTraces,
  createFakeGoogle,
  type FakeControl,
  hookSubject,
  loadFixture,
  renderHookCompat,
  runScenario,
} from '@places-compat/core/testing';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePlacesAutocomplete, * as ours from '../src';
import type { HookArgs } from '../src/types';

type Scope = Record<string, unknown>;

const scope = window as unknown as Scope;

function suggestCalls(control: FakeControl): number {
  return control.calls.filter((entry) => entry.kind === 'suggest').length;
}

describe('StrictMode', () => {
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
    delete scope.initMap;
    vi.useRealTimers();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  function installFake(): FakeControl {
    const fake = createFakeGoogle();
    applyFixture(fake.control, loadFixture('paris-geocode'));
    uninstall = fake.install();
    return fake.control;
  }

  function renderStrict(args: HookArgs) {
    return renderHookCompat((props: HookArgs) => usePlacesAutocomplete(props), {
      initialProps: args,
      strict: true,
    });
  }

  it('is ready after mount and runs one search per setValue', async () => {
    const control = installFake();
    const { result, unmount } = renderStrict({});
    await actCompat(() => {});
    expect(result.current.ready).toBe(true);

    await actCompat(() => result.current.setValue('Paris'));
    await actCompat(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(suggestCalls(control)).toBe(1);
    expect(result.current.value).toBe('Paris');
    expect(result.current.suggestions.status).toBe('OK');
    expect(result.current.suggestions.data).toHaveLength(5);
    expect(result.current.suggestions.loading).toBe(false);

    await actCompat(() => result.current.setValue('Paris, F', false));
    await actCompat(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(suggestCalls(control)).toBe(1);
    unmount();
  });

  it('gives the same trace as a normal mount', async () => {
    const run = (strict: boolean) =>
      runScenario({
        subject: hookSubject(ours),
        fake: 'new',
        fixtures: ['paris-geocode'],
        strict,
        steps: [
          { type: 'type', text: 'Paris' },
          { type: 'advance', ms: 200 },
          { type: 'call', name: 'clearSuggestions' },
          { type: 'type', text: 'Paris' },
          { type: 'advance', ms: 200 },
        ],
      });
    const normal = await run(false);
    const strict = await run(true);
    expect(compareTraces(normal, strict, [])).toEqual({ diffs: [], unusedAllow: [] });
  });

  it('keeps the callback on window across the remount and removes it on unmount', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderStrict({ callbackName: 'initMap' });
    await actCompat(() => {});

    expect(result.current.ready).toBe(false);
    expect(scope.initMap).toBe(result.current.init);

    const control = installFake();
    await actCompat(() => (scope.initMap as () => void)());
    expect(result.current.ready).toBe(true);

    await actCompat(() => result.current.setValue('Paris'));
    await actCompat(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(suggestCalls(control)).toBe(1);

    unmount();
    expect('initMap' in scope).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('calls init directly when google is already loaded, even with callbackName', async () => {
    installFake();
    const { result, unmount } = renderStrict({ callbackName: 'initMap' });
    await actCompat(() => {});

    expect(result.current.ready).toBe(true);
    expect('initMap' in scope).toBe(false);
    unmount();
  });
});

function Field(props: HookArgs): React.ReactElement {
  const { ready, value, suggestions } = usePlacesAutocomplete(props);
  return (
    <input
      value={value}
      readOnly
      disabled={!ready}
      data-status={suggestions.status}
      data-count={suggestions.data.length}
    />
  );
}

describe('renderToString', () => {
  afterEach(() => {
    delete scope.google;
    vi.restoreAllMocks();
  });

  it('renders the initial state without touching window.google or sessionStorage', () => {
    const googleRead = vi.fn(() => undefined);
    Object.defineProperty(window, 'google', { configurable: true, get: googleRead });
    const storage = [
      vi.spyOn(Storage.prototype, 'getItem'),
      vi.spyOn(Storage.prototype, 'setItem'),
      vi.spyOn(Storage.prototype, 'removeItem'),
      vi.spyOn(Storage.prototype, 'clear'),
    ];

    const html = renderToString(<Field defaultValue="Paris" callbackName="initMap" />);

    expect(html).toContain('value="Paris"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('data-status=""');
    expect(html).toContain('data-count="0"');
    expect(googleRead).not.toHaveBeenCalled();
    for (const spy of storage) expect(spy).not.toHaveBeenCalled();
    expect('initMap' in scope).toBe(false);
  });
});
