// Ported from react-places-autocomplete 7.3.0 src/tests/childrenProp.test.js. MIT License, Copyright (c) 2016 Ken Hibino.
import { renderCompat } from '@places-compat/core/testing';
import * as React from 'react';
import { expect, test, vi } from 'vitest';
import PlacesAutocomplete from '../../src';
import { setupGoogleMock } from './setup';

setupGoogleMock();

test('children prop gets called once on initial render', () => {
  const childrenProp = vi.fn().mockReturnValue(null);

  renderCompat(
    <PlacesAutocomplete value="" onChange={() => {}}>
      {childrenProp}
    </PlacesAutocomplete>,
  );

  expect(childrenProp.mock.calls.length).toBe(1);
});
