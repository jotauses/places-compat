// Ported from use-places-autocomplete 4.0.1, src/__tests__/debounce.ts. MIT License, Copyright (c) 2020 Welly Shen.
import { debounce } from '@places-compat/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('debounce', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should trigger function immediately', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);
    debouncedFn();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalled();
  });
});
