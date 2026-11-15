import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, expect, it } from 'vitest';

afterEach(() => {
  cleanup();
});

it('mounts an element into the DOM', () => {
  const { container, getByText } = render(<p>hello</p>);
  const node = getByText('hello');
  expect(container.contains(node)).toBe(true);
  expect(document.body.contains(node)).toBe(true);
});
