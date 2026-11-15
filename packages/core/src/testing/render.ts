import * as RTL from '@testing-library/react';
import React from 'react';

type Wrapper = React.ComponentType<{ children?: React.ReactNode }>;

interface HookHandle<P, R> {
  result: { current: R };
  rerender(props?: P): void;
  unmount(): void;
}

type HookRenderer = <P, R>(
  hook: (props: P) => R,
  options: { initialProps?: P; wrapper?: Wrapper },
) => HookHandle<P, R>;

const major = Number(React.version.split('.')[0]);

const legacyRenderHook: HookRenderer | undefined =
  major < 18 ? await loadLegacyRenderHook() : undefined;

async function loadLegacyRenderHook(): Promise<HookRenderer> {
  const mod = (await import('@testing-library/react-hooks/dom')) as unknown as {
    renderHook?: HookRenderer;
    default?: { renderHook: HookRenderer };
  };
  const renderHook = mod.renderHook ?? mod.default?.renderHook;
  if (!renderHook) throw new Error('@testing-library/react-hooks/dom has no renderHook');
  return renderHook;
}

// StrictMode must be the root element: React 19 skips the effect remount when a component renders it.
const StrictWrapper = React.StrictMode as Wrapper;

function wrap(ui: React.ReactElement, strict: boolean | undefined): React.ReactElement {
  return strict ? React.createElement(React.StrictMode, null, ui) : ui;
}

export function renderCompat(
  ui: React.ReactElement,
  opts: { strict?: boolean } = {},
): { container: HTMLElement; rerender(ui: React.ReactElement): void; unmount(): void } {
  const rendered = RTL.render(wrap(ui, opts.strict));
  return {
    container: rendered.container,
    rerender: (next) => rendered.rerender(wrap(next, opts.strict)),
    unmount: () => rendered.unmount(),
  };
}

export function renderHookCompat<P, R>(
  hook: (props: P) => R,
  opts: { initialProps?: P; strict?: boolean } = {},
): { result: { current: R }; rerender(props?: P): void; unmount(): void } {
  const options: { initialProps?: P; wrapper?: Wrapper } = {};
  if ('initialProps' in opts) options.initialProps = opts.initialProps as P;
  if (opts.strict) options.wrapper = StrictWrapper;
  const rendered = legacyRenderHook
    ? legacyRenderHook(hook, options)
    : (RTL as unknown as { renderHook: HookRenderer }).renderHook(hook, options);
  // RTL 16 rerenders with undefined props when called without arguments; react-hooks keeps them.
  let lastProps = opts.initialProps;
  return {
    result: rendered.result,
    rerender: (props) => {
      if (props !== undefined) lastProps = props;
      rendered.rerender(lastProps);
    },
    unmount: () => rendered.unmount(),
  };
}

const MICROTASK_TURNS = 50;

export async function actCompat(fn: () => void | Promise<void>): Promise<void> {
  await RTL.act(async () => {
    await fn();
    for (let turn = 0; turn < MICROTASK_TURNS; turn++) await Promise.resolve();
  });
}
