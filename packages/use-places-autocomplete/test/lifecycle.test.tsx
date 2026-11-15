import {
  actCompat,
  createFakeGoogle,
  type FakeControl,
  renderCompat,
  renderHookCompat,
  type SuggestionJson,
} from '@places-compat/core/testing';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HookArgs, HookReturn } from '../src/types';
import usePlacesAutocomplete from '../src/usePlacesAutocomplete';

type FakeOptions = Parameters<typeof createFakeGoogle>[0];
type Fake = ReturnType<typeof createFakeGoogle>;
type Importer = (name: string) => Promise<unknown>;
type ActivityProps = { mode: 'visible' | 'hidden'; children?: React.ReactNode };
type ActGlobal = { IS_REACT_ACT_ENVIRONMENT?: boolean };

const Activity = (React as unknown as { Activity?: React.ComponentType<ActivityProps> }).Activity;
const major = Number(React.version.split('.')[0]);
const scope = window as unknown as Record<string, unknown>;
const uninstalls: (() => void)[] = [];

function installed(opts?: FakeOptions): Fake {
  const fake = createFakeGoogle(opts);
  uninstalls.push(fake.install());
  return fake;
}

function mapsOf(fake: Fake): { importLibrary: Importer } {
  return fake.google.maps as unknown as { importLibrary: Importer };
}

function suggestion(placeId: string, text: string): SuggestionJson {
  return { placePrediction: { placeId, text: { text } } };
}

function suggestCalls(control: FakeControl) {
  return control.calls.filter((call) => call.kind === 'suggest');
}

function suggestedInputs(control: FakeControl): string[] {
  return suggestCalls(control).map((call) => (call.request as { input: string }).input);
}

function placeIds(state: HookReturn): string[] {
  return state.suggestions.data.map((item) => item.place_id);
}

function storedInputs(): string[] {
  return Object.keys(JSON.parse(sessionStorage.getItem('upa') ?? '{}') as object);
}

async function advance(ms: number) {
  await actCompat(() => {
    vi.advanceTimersByTime(ms);
  });
}

function renderUpa(initialProps: HookArgs = {}) {
  return renderHookCompat((props: HookArgs) => usePlacesAutocomplete(props), { initialProps });
}

type Latest = { current: HookReturn | null };

function Probe({ latest }: { latest: Latest }) {
  latest.current = usePlacesAutocomplete();
  return null;
}

function LayoutInitField({ latest, order }: { latest: Latest; order: string[] }) {
  const state = usePlacesAutocomplete({ initOnMount: false });
  latest.current = state;
  const { init } = state;
  React.useLayoutEffect(() => {
    order.push('layout');
    init();
  }, [init, order]);
  React.useEffect(() => {
    order.push('passive');
  }, [order]);
  return null;
}

function renderInActivity() {
  const ActivityBoundary = Activity as React.ComponentType<ActivityProps>;
  const latest: Latest = { current: null };
  const ui = (mode: ActivityProps['mode']) =>
    React.createElement(ActivityBoundary, { mode }, React.createElement(Probe, { latest }));
  const rendered = renderCompat(ui('visible'));
  return {
    get state(): HookReturn {
      return latest.current as HookReturn;
    },
    hide: () => rendered.rerender(ui('hidden')),
    show: () => rendered.rerender(ui('visible')),
    unmount: () => rendered.unmount(),
  };
}

async function mountWithoutAct(element: React.ReactElement): Promise<() => void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  if (major >= 18) {
    const clientEntry = 'react-dom/client';
    const { createRoot } = (await import(/* @vite-ignore */ clientEntry)) as {
      createRoot(node: Element): { render(ui: React.ReactElement): void; unmount(): void };
    };
    const root = createRoot(container);
    root.render(element);
    return () => {
      root.unmount();
      container.remove();
    };
  }
  const legacyEntry = 'react-dom';
  const ReactDOM = (await import(/* @vite-ignore */ legacyEntry)) as {
    render(ui: React.ReactElement, node: Element): void;
    unmountComponentAtNode(node: Element): boolean;
  };
  ReactDOM.render(element, container);
  return () => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  };
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  while (uninstalls.length > 0) uninstalls.pop()?.();
  delete scope.google;
  sessionStorage.clear();
});

describe('inside a hidden Activity', () => {
  it.skipIf(!Activity)(
    'becomes ready when shown after the library loaded while hidden',
    async () => {
      const fake = installed({ places: 'viaImportLibrary' });
      const maps = mapsOf(fake);
      const load = maps.importLibrary;
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      maps.importLibrary = (name) => gate.then(() => load(name));

      const view = renderInActivity();
      expect(view.state.ready).toBe(false);

      await actCompat(() => view.hide());
      await actCompat(() => release());
      expect(fake.control.calls.filter((call) => call.kind === 'importLibrary')).toHaveLength(1);
      expect(view.state.ready).toBe(false);

      await actCompat(() => view.show());
      expect(view.state.ready).toBe(true);
      view.unmount();
    },
  );

  it.skipIf(!Activity)('applies a response that arrived while hidden once shown', async () => {
    vi.useFakeTimers();
    const fake = installed();
    fake.control.onSuggest('par', [suggestion('p1', 'Paris, France')], { deferred: true });
    const view = renderInActivity();
    expect(view.state.ready).toBe(true);
    await actCompat(() => view.state.setValue('par'));
    await advance(200);
    expect(view.state.suggestions.loading).toBe(true);

    await actCompat(() => view.hide());
    await actCompat(() => fake.control.pending[0]?.resolve());
    expect(view.state.suggestions).toEqual({ loading: true, status: '', data: [] });
    expect(storedInputs()).toEqual(['par']);

    await actCompat(() => view.show());
    expect(view.state.suggestions).toMatchObject({ loading: false, status: 'OK' });
    expect(placeIds(view.state)).toEqual(['p1']);
    view.unmount();
  });

  it.skipIf(!Activity)(
    'runs a debounced search that came due while hidden once shown',
    async () => {
      vi.useFakeTimers();
      const fake = installed();
      fake.control.onSuggest('par', [suggestion('p1', 'Paris, France')]);
      const view = renderInActivity();
      await actCompat(() => view.state.setValue('par'));

      await actCompat(() => view.hide());
      await advance(200);
      expect(suggestCalls(fake.control)).toHaveLength(0);

      await actCompat(() => view.show());
      expect(suggestCalls(fake.control)).toHaveLength(0);

      await advance(199);
      expect(suggestCalls(fake.control)).toHaveLength(0);
      await advance(1);
      expect(suggestCalls(fake.control)).toHaveLength(1);
      expect(view.state.suggestions).toMatchObject({ loading: false, status: 'OK' });
      expect(placeIds(view.state)).toEqual(['p1']);
      view.unmount();
    },
  );

  it.skipIf(!Activity)(
    'prefers a search held while hidden over the earlier response that arrives meanwhile',
    async () => {
      vi.useFakeTimers();
      const fake = installed();
      fake.control.onSuggest('a', [suggestion('a1', 'Amsterdam, Netherlands')], { deferred: true });
      fake.control.onSuggest('ab', [suggestion('ab1', 'Aberdeen, UK')]);
      const view = renderInActivity();
      await actCompat(() => view.state.setValue('a'));
      await advance(200);
      await actCompat(() => view.state.setValue('ab'));

      await actCompat(() => view.hide());
      await advance(200);
      expect(suggestedInputs(fake.control)).toEqual(['a']);
      await actCompat(() => fake.control.pending[0]?.resolve());

      await actCompat(() => view.show());
      expect(view.state.suggestions).toEqual({ loading: true, status: '', data: [] });

      await advance(200);
      expect(suggestedInputs(fake.control)).toEqual(['a', 'ab']);
      expect(view.state.suggestions).toMatchObject({ loading: false, status: 'OK' });
      expect(placeIds(view.state)).toEqual(['ab1']);
      view.unmount();
    },
  );

  it.skipIf(!Activity)(
    'keeps the later response when both arrive out of order while hidden',
    async () => {
      vi.useFakeTimers();
      const fake = installed();
      fake.control.onSuggest('a', [suggestion('a1', 'Amsterdam, Netherlands')], { deferred: true });
      fake.control.onSuggest('ab', [suggestion('ab1', 'Aberdeen, UK')], { deferred: true });
      const view = renderInActivity();
      await actCompat(() => view.state.setValue('a'));
      await advance(200);
      await actCompat(() => view.state.setValue('ab'));
      await advance(200);
      expect(fake.control.pending).toHaveLength(2);

      await actCompat(() => view.hide());
      await actCompat(() => fake.control.pending[1]?.resolve());
      await actCompat(() => fake.control.pending[0]?.resolve());
      expect(view.state.suggestions).toEqual({ loading: true, status: '', data: [] });

      await actCompat(() => view.show());
      expect(view.state.suggestions).toMatchObject({ loading: false, status: 'OK' });
      expect(placeIds(view.state)).toEqual(['ab1']);
      expect(storedInputs()).toEqual(['ab']);
      expect(suggestedInputs(fake.control)).toEqual(['a', 'ab']);
      view.unmount();
    },
  );

  it.skipIf(!Activity)(
    'searches the value typed while hidden instead of the search held before it',
    async () => {
      vi.useFakeTimers();
      const fake = installed();
      fake.control.onSuggest('pa', [suggestion('pa1', 'Pamplona, Spain')]);
      fake.control.onSuggest('par', [suggestion('par1', 'Paris, France')]);
      const view = renderInActivity();
      await actCompat(() => view.state.setValue('pa'));

      await actCompat(() => view.hide());
      await advance(200);
      await actCompat(() => view.state.setValue('par'));
      await actCompat(() => view.show());
      await advance(200);

      expect(suggestedInputs(fake.control)).toEqual(['par']);
      expect(view.state.value).toBe('par');
      expect(placeIds(view.state)).toEqual(['par1']);
      view.unmount();
    },
  );

  it.skipIf(!Activity)('clears for an empty value typed while hidden', async () => {
    vi.useFakeTimers();
    const fake = installed();
    fake.control.onSuggest('pa', [suggestion('pa1', 'Pamplona, Spain')]);
    const view = renderInActivity();
    await actCompat(() => view.state.setValue('pa'));

    await actCompat(() => view.hide());
    await advance(200);
    await actCompat(() => view.state.setValue(''));
    await actCompat(() => view.show());
    await advance(200);

    expect(suggestedInputs(fake.control)).toEqual([]);
    expect(view.state.value).toBe('');
    expect(view.state.suggestions).toEqual({ loading: false, status: '', data: [] });
    view.unmount();
  });

  it.skipIf(!Activity)(
    'shows the newest response held while hidden until the held search answers',
    async () => {
      vi.useFakeTimers();
      const fake = installed();
      fake.control.onSuggest('a', [suggestion('a1', 'Amsterdam, Netherlands')], { deferred: true });
      fake.control.onSuggest('ab', [suggestion('ab1', 'Aberdeen, UK')], { deferred: true });
      fake.control.onSuggest('abc', [suggestion('abc1', 'Abcoude, Netherlands')], {
        deferred: true,
      });
      const view = renderInActivity();
      await actCompat(() => view.state.setValue('a'));
      await advance(200);
      await actCompat(() => view.state.setValue('ab'));
      await advance(200);
      await actCompat(() => view.state.setValue('abc'));

      await actCompat(() => view.hide());
      await actCompat(() => fake.control.pending[0]?.resolve());
      await advance(200);
      await actCompat(() => fake.control.pending[1]?.resolve());

      await actCompat(() => view.show());
      expect(placeIds(view.state)).toEqual(['ab1']);

      await advance(200);
      expect(suggestedInputs(fake.control)).toEqual(['a', 'ab', 'abc']);
      await actCompat(() => fake.control.pending[2]?.resolve());
      expect(placeIds(view.state)).toEqual(['abc1']);
      view.unmount();
    },
  );
});

describe('init before passive effects', () => {
  let actEnvironment: boolean | undefined;

  beforeEach(() => {
    actEnvironment = (globalThis as ActGlobal).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as ActGlobal).IS_REACT_ACT_ENVIRONMENT = false;
  });

  afterEach(() => {
    if (actEnvironment === undefined) delete (globalThis as ActGlobal).IS_REACT_ACT_ENVIRONMENT;
    else (globalThis as ActGlobal).IS_REACT_ACT_ENVIRONMENT = actEnvironment;
  });

  it('becomes ready when init runs in a layout effect and finds the library at once', async () => {
    const errors = vi.spyOn(console, 'error');
    installed();
    const order: string[] = [];
    const latest: Latest = { current: null };

    const unmount = await mountWithoutAct(React.createElement(LayoutInitField, { latest, order }));
    try {
      await vi.waitFor(() => {
        expect(latest.current?.ready).toBe(true);
      });
      expect(order).toEqual(['layout', 'passive']);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });

  it('becomes ready when init runs in a layout effect and loads the library', async () => {
    const errors = vi.spyOn(console, 'error');
    const fake = installed({ places: 'viaImportLibrary' });
    const maps = mapsOf(fake);
    const load = maps.importLibrary;
    const order: string[] = [];
    maps.importLibrary = (name) =>
      load(name).then((library) => {
        order.push('loaded');
        return library;
      });
    const latest: Latest = { current: null };

    const unmount = await mountWithoutAct(React.createElement(LayoutInitField, { latest, order }));
    try {
      await vi.waitFor(() => {
        expect(latest.current?.ready).toBe(true);
      });
      expect(order[0]).toBe('layout');
      expect([...order].sort()).toEqual(['layout', 'loaded', 'passive']);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      unmount();
    }
  });
});

describe('response order', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  async function searchTwice(fake: Fake) {
    fake.control.onSuggest('a', [suggestion('a1', 'Amsterdam, Netherlands')], { deferred: true });
    fake.control.onSuggest('ab', [suggestion('ab1', 'Aberdeen, UK')], { deferred: true });
    const handle = renderUpa();
    await actCompat(() => handle.result.current.setValue('a'));
    await advance(200);
    await actCompat(() => handle.result.current.setValue('ab'));
    await advance(200);
    expect(fake.control.pending).toHaveLength(2);
    return handle;
  }

  it('shows each response when they arrive in order', async () => {
    const fake = installed();
    const { result } = await searchTwice(fake);

    await actCompat(() => fake.control.pending[0]?.resolve());
    expect(result.current.suggestions).toMatchObject({ loading: false, status: 'OK' });
    expect(placeIds(result.current)).toEqual(['a1']);
    expect(storedInputs()).toEqual(['a']);

    await actCompat(() => fake.control.pending[1]?.resolve());
    expect(result.current.suggestions).toMatchObject({ loading: false, status: 'OK' });
    expect(placeIds(result.current)).toEqual(['ab1']);
    expect(storedInputs()).toContain('ab');
  });

  it('drops an earlier response that arrives after a later one and does not cache it', async () => {
    const fake = installed();
    const { result } = await searchTwice(fake);

    await actCompat(() => fake.control.pending[1]?.resolve());
    expect(placeIds(result.current)).toEqual(['ab1']);
    expect(storedInputs()).toEqual(['ab']);

    await actCompat(() => fake.control.pending[0]?.resolve());
    expect(result.current.suggestions).toMatchObject({ loading: false, status: 'OK' });
    expect(placeIds(result.current)).toEqual(['ab1']);
    expect(storedInputs()).toEqual(['ab']);
  });
});

describe('after unmount', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it.each(['present', 'viaImportLibrary'] as const)(
    'init does not update state once google.maps gains the new API (places %s)',
    async (places) => {
      const errors = vi.spyOn(console, 'error');
      let renders = 0;
      const { result, unmount } = renderHookCompat(() => {
        renders += 1;
        return usePlacesAutocomplete({ initOnMount: false });
      });
      expect(result.current.ready).toBe(false);
      const last = result.current;
      const rendersAtUnmount = renders;

      unmount();
      const fake = installed({ places });
      await actCompat(async () => {
        last.init();
        await Promise.resolve();
      });
      await actCompat(() => {});

      expect(fake.control.calls.filter((call) => call.kind === 'importLibrary')).toHaveLength(
        places === 'present' ? 0 : 1,
      );
      expect(result.current).toBe(last);
      expect(renders).toBe(rendersAtUnmount);
      expect(errors).not.toHaveBeenCalled();
    },
  );

  it('never applies a held response or a held search', async () => {
    const errors = vi.spyOn(console, 'error');
    const fake = installed();
    fake.control.onSuggest('a', [suggestion('a1', 'Amsterdam, Netherlands')], { deferred: true });
    fake.control.onSuggest('ab', [suggestion('ab1', 'Aberdeen, UK')]);
    let renders = 0;
    const { result, unmount } = renderHookCompat(() => {
      renders += 1;
      return usePlacesAutocomplete();
    });
    await actCompat(() => result.current.setValue('a'));
    await advance(200);
    await actCompat(() => result.current.setValue('ab'));
    const last = result.current;
    const rendersAtUnmount = renders;

    unmount();
    await actCompat(() => fake.control.pending[0]?.resolve());
    await advance(200);
    await advance(1000);

    expect(suggestCalls(fake.control)).toHaveLength(1);
    expect(storedInputs()).toEqual(['a']);
    expect(result.current).toBe(last);
    expect(result.current.suggestions).toEqual({ loading: true, status: '', data: [] });
    expect(renders).toBe(rendersAtUnmount);
    expect(errors).not.toHaveBeenCalled();
  });
});
