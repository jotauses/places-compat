import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '../src';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once after the wait', () => {
    const fn = vi.fn((_value: string) => {});
    const debounced = debounce(fn, 100);
    debounced('a');
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('fires once with the last arguments after a burst', () => {
    const fn = vi.fn((_value: string, _n: number) => {});
    const debounced = debounce(fn, 100);
    debounced('a', 1);
    debounced('b', 2);
    debounced('c', 3);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c', 3);
  });

  it('restarts the timer on each call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    vi.advanceTimersByTime(60);
    debounced();
    vi.advanceTimersByTime(60);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('drops the pending call on cancel', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does nothing when cancel runs with no pending call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced.cancel();
    debounced();
    vi.advanceTimersByTime(100);
    debounced.cancel();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fires normally when called after cancel', () => {
    const fn = vi.fn((_value: string) => {});
    const debounced = debounce(fn, 100);
    debounced('a');
    debounced.cancel();
    debounced('b');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('forwards this from the last call', () => {
    const seen: unknown[] = [];
    const debounced = debounce(function (this: unknown) {
      seen.push(this);
    }, 100);
    const first = { debounced };
    const second = { debounced };
    first.debounced();
    second.debounced();
    vi.advanceTimersByTime(100);
    expect(seen).toEqual([second]);
    expect(seen[0]).toBe(second);
  });

  it('runs on the next tick with a wait of 0', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 0);
    debounced();
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
