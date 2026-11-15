// Ported from react-places-autocomplete 7.3.0 src/tests/helpers.test.js. MIT License, Copyright (c) 2016 Ken Hibino.
import { describe, expect, it, vi } from 'vitest';
import { compose } from '../../src/compose';

describe('compose', () => {
  it('returns composed function', () => {
    const func1 = vi.fn();
    const func2 = vi.fn();
    const composedFunc = compose(func1, func2);
    composedFunc('one');

    expect(func1.mock.calls.length).toBe(1);
    expect(func2.mock.calls.length).toBe(1);
    expect(func1).toBeCalledWith('one');
    expect(func2).toBeCalledWith('one');
  });

  it('with multiple functions and arguments', () => {
    const func1 = vi.fn();
    const func2 = vi.fn();
    const func3 = vi.fn();
    const composedFunc = compose(func1, func2, func3);
    composedFunc('one', 'two');

    expect(func1.mock.calls.length).toBe(1);
    expect(func2.mock.calls.length).toBe(1);
    expect(func3.mock.calls.length).toBe(1);
    expect(func1).toBeCalledWith('one', 'two');
    expect(func2).toBeCalledWith('one', 'two');
    expect(func3).toBeCalledWith('one', 'two');
  });
});
