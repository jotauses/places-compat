// Ported from react-places-autocomplete 7.3.0 src/tests/loading.test.js. MIT License, Copyright (c) 2016 Ken Hibino.
import { actCompat, loadFixture, renderCompat } from '@places-compat/core/testing';
import { fireEvent } from '@testing-library/react';
import * as React from 'react';
import { expect, test, vi } from 'vitest';
import PlacesAutocomplete, { type PropTypes } from '../../src';
import { DEBOUNCE, setupGoogleMock } from './setup';

const getControl = setupGoogleMock();

function Controlled({ children }: { children: PropTypes['children'] }): React.ReactElement {
  const [value, setValue] = React.useState('');
  return (
    <PlacesAutocomplete
      highlightFirstSuggestion={false}
      onChange={setValue}
      onSelect={() => {}}
      shouldFetchSuggestions={true}
      value={value}
    >
      {children}
    </PlacesAutocomplete>
  );
}

function distinctInOrder<T>(values: T[]): T[] {
  return values.filter((value, i) => i === 0 || value !== values[i - 1]);
}

test('loading prop check', async () => {
  const control = getControl();
  control.onSuggest('test', loadFixture('rpa-mock-suggestions').new.suggestions, {
    deferred: true,
  });
  const childProp = vi.fn<PropTypes['children']>(({ getInputProps }) => (
    <div>
      <input {...getInputProps()} />
      Test Render
    </div>
  ));
  const { container } = renderCompat(<Controlled>{childProp}</Controlled>);

  fireEvent.change(container.querySelector('input') as HTMLInputElement, {
    target: { value: 'test' },
  });
  await actCompat(() => {
    vi.advanceTimersByTime(DEBOUNCE);
  });
  expect(control.pending).toHaveLength(1);
  await actCompat(() => {
    control.pending[0]?.resolve();
  });

  const loading = childProp.mock.calls.map(([arg]) => arg.loading);
  expect(distinctInOrder(loading)).toEqual([false, true, false]);
  expect(childProp.mock.lastCall?.[0]).toMatchObject({ loading: false });
});
