// Ported from react-places-autocomplete 7.3.0 src/tests/onChangeProp.test.js. MIT License, Copyright (c) 2016 Ken Hibino.
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mountComponent, setupGoogleMock } from './setup';

setupGoogleMock();

describe('onChange prop', () => {
  it('handles user typing in input field', () => {
    const onChangeHandler = vi.fn();
    const wrapper = mountComponent({
      value: '',
      onChange: onChangeHandler,
    });
    const input = wrapper.input();
    fireEvent.change(input, { target: { value: 's' } });
    expect(onChangeHandler).toHaveBeenCalledTimes(1);
    expect(onChangeHandler).toBeCalledWith('s');
  });

  it('handles user pasting multiple characters in input field', () => {
    const onChangeHandler = vi.fn();
    const wrapper = mountComponent({
      value: '',
      onChange: onChangeHandler,
    });
    const input = wrapper.input();
    fireEvent.change(input, { target: { value: 'New York' } });
    expect(onChangeHandler).toHaveBeenCalledTimes(1);
    expect(onChangeHandler).toBeCalledWith('New York');
  });
});
