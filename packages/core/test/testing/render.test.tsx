import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { actCompat, renderCompat, renderHookCompat } from '../../src/testing/render';

const loads = vi.hoisted(() => ({ reactHooks: 0, rtlRenderHook: 0 }));

vi.mock('@testing-library/react-hooks/dom', async (importOriginal) => {
  loads.reactHooks++;
  return importOriginal();
});

vi.mock('@testing-library/react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const renderHook = actual.renderHook as ((...args: unknown[]) => unknown) | undefined;
  if (!renderHook) return actual;
  return {
    ...actual,
    renderHook: (...args: unknown[]) => {
      loads.rtlRenderHook++;
      return renderHook(...args);
    },
  };
});

const major = Number(React.version.split('.')[0]);

const probe = { renders: 0, events: [] as string[] };

afterEach(() => {
  vi.useRealTimers();
  probe.renders = 0;
  probe.events = [];
});

function Counter({ label }: { label: string }) {
  probe.renders++;
  const [mountedAt] = React.useState(() => probe.renders);
  return (
    <span>
      {label}:{mountedAt}
    </span>
  );
}

function Probe() {
  probe.renders++;
  return <i>probe</i>;
}

function useMountEvents() {
  React.useEffect(() => {
    probe.events.push('mount');
    return () => {
      probe.events.push('cleanup');
    };
  }, []);
}

function Effect() {
  useMountEvents();
  return null;
}

function useChain() {
  const [state, setState] = React.useState('idle');
  const start = React.useCallback(() => {
    Promise.resolve()
      .then(() => Promise.resolve())
      .then(() => Promise.resolve())
      .then(() => setState('done'));
  }, []);
  return { state, start };
}

describe('module selection', () => {
  it('loads @testing-library/react-hooks only on React 17', () => {
    expect([17, 18, 19]).toContain(major);
    expect(loads.reactHooks).toBe(major === 17 ? 1 : 0);
  });

  it('uses the RTL renderHook on 18 and 19 and react-hooks on 17', () => {
    const before = loads.rtlRenderHook;
    const { result } = renderHookCompat(() => 'value');
    expect(result.current).toBe('value');
    expect(loads.rtlRenderHook - before).toBe(major === 17 ? 0 : 1);
  });
});

describe('renderCompat', () => {
  it('mounts, rerenders and unmounts', () => {
    const { container, rerender, unmount } = renderCompat(<p>hello</p>);
    expect(container.textContent).toBe('hello');
    expect(document.body.contains(container)).toBe(true);
    rerender(<p>bye</p>);
    expect(container.textContent).toBe('bye');
    unmount();
    expect(container.innerHTML).toBe('');
  });

  it('keeps component state across rerender', () => {
    const { container, rerender } = renderCompat(<Counter label="a" />);
    rerender(<Counter label="b" />);
    expect(container.textContent).toBe('b:1');
  });

  it('runs every render twice under strict mode, also after rerender', () => {
    const { rerender } = renderCompat(<Probe />, { strict: true });
    expect(probe.renders).toBe(2);
    rerender(<Probe />);
    expect(probe.renders).toBe(4);
  });

  it('renders once without strict mode', () => {
    renderCompat(<Probe />);
    expect(probe.renders).toBe(1);
  });

  it('remounts effects under strict mode only where the major does it', () => {
    const { unmount } = renderCompat(<Effect />, { strict: true });
    expect(probe.events).toEqual(major >= 18 ? ['mount', 'cleanup', 'mount'] : ['mount']);
    unmount();
    expect(probe.events[probe.events.length - 1]).toBe('cleanup');
  });
});

describe('renderHookCompat', () => {
  it('passes initialProps and new props on rerender', () => {
    const { result, rerender } = renderHookCompat((props: { n: number }) => props.n * 2, {
      initialProps: { n: 1 },
    });
    expect(result.current).toBe(2);
    rerender({ n: 5 });
    expect(result.current).toBe(10);
  });

  it('keeps the last props when rerender gets none', () => {
    const { result, rerender } = renderHookCompat((props: { n: number }) => props.n, {
      initialProps: { n: 3 },
    });
    rerender({ n: 4 });
    rerender();
    expect(result.current).toBe(4);
  });

  it('updates result through actCompat', async () => {
    const { result } = renderHookCompat(() => React.useState(0));
    await actCompat(() => {
      result.current[1](7);
    });
    expect(result.current[0]).toBe(7);
  });

  it('mounts effects once without strict mode', () => {
    renderHookCompat(useMountEvents);
    expect(probe.events).toEqual(['mount']);
  });

  it('unmounts and runs effect cleanups', () => {
    const cleanup = vi.fn();
    const { unmount } = renderHookCompat(() => React.useEffect(() => cleanup, []));
    expect(cleanup).not.toHaveBeenCalled();
    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('double-invokes the hook under strict mode', () => {
    renderHookCompat(
      () => {
        probe.renders++;
        useMountEvents();
      },
      { strict: true },
    );
    expect(probe.renders).toBe(2);
    expect(probe.events).toEqual(major >= 18 ? ['mount', 'cleanup', 'mount'] : ['mount']);
  });
});

describe('actCompat', () => {
  it('flushes pending microtasks after a sync callback', async () => {
    const { result } = renderHookCompat(useChain);
    await actCompat(() => {
      result.current.start();
    });
    expect(result.current.state).toBe('done');
  });

  it('awaits an async callback and does not hang under fake timers', async () => {
    vi.useFakeTimers();
    const { result } = renderHookCompat(useChain);
    let finished = false;
    await actCompat(async () => {
      await Promise.resolve();
      result.current.start();
      finished = true;
    });
    expect(finished).toBe(true);
    expect(result.current.state).toBe('done');
  });

  it('leaves timers to the fake clock', async () => {
    vi.useFakeTimers();
    const { result } = renderHookCompat(() => {
      const [fired, setFired] = React.useState(false);
      React.useEffect(() => {
        const id = setTimeout(() => setFired(true), 100);
        return () => clearTimeout(id);
      }, []);
      return fired;
    });
    await actCompat(() => undefined);
    expect(result.current).toBe(false);
    await actCompat(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(true);
  });

  it('propagates errors from the callback', async () => {
    await expect(
      actCompat(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});
