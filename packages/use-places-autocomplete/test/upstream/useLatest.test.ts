// Ported from use-places-autocomplete 4.0.1, src/__tests__/useLatest.ts. MIT License, Copyright (c) 2020 Welly Shen.
import { renderHookCompat } from '@places-compat/core/testing';
import { describe, expect, it } from 'vitest';
import useLatest from '../../src/useLatest';

describe('useLatest', () => {
  it('should return correctly', () => {
    const val = 'test';
    const { result } = renderHookCompat(() => useLatest(val));
    expect(result.current.current).toBe(val);
  });
});
