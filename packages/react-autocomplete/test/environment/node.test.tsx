// @vitest-environment node
import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Global = Record<string, unknown>;

const TRAPPED = ['document', 'window'] as const;

let touched: string[] = [];

beforeEach(() => {
  touched = [];
  for (const name of TRAPPED) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        touched.push(name);
        return undefined;
      },
    });
  }
  vi.resetModules();
});

afterEach(() => {
  for (const name of TRAPPED) delete (globalThis as Global)[name];
});

describe('in a node environment', () => {
  it('has no DOM', () => {
    expect(Object.getOwnPropertyDescriptor(globalThis, 'document')?.get).toBeTypeOf('function');
    expect(touched).toEqual([]);
  });

  it('imports the entry without touching document or window', async () => {
    const mod = await import('../../src/index');
    expect(mod.default).toBeTypeOf('object');
    expect(mod.usePlacesWidget).toBeTypeOf('function');
    expect(touched).toEqual([]);
  });

  it('imports the service hook entries without touching document or window', async () => {
    const service = await import('../../src/usePlacesAutocompleteService');
    const alias = await import('../../src/usePlacesService');
    expect(service.default).toBeTypeOf('function');
    expect(alias.default).toBe(service.default);
    expect(touched).toEqual([]);
  });

  it('renders the component to a string', async () => {
    const mod = await import('../../src/index');
    const Component = mod.default as unknown as React.ComponentType<Record<string, unknown>>;
    const html = renderToString(
      <Component apiKey="test-key" onPlaceSelected={() => {}} placeholder="City" />,
    );
    expect(html).toMatch(/^<input\b[^>]*placeholder="City"[^>]*\/?>$/);
    expect(touched).toEqual([]);
  });
});
