import { createFakeGoogle } from '@places-compat/core/testing';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { SCRIPT_CALLBACK } from '../../src/constants';
import ReactGoogleAutocomplete from '../../src/index';
import usePlacesAutocompleteService from '../../src/usePlacesAutocompleteService';
import { STYLE_ATTRIBUTE } from '../../src/widget/styles';

const Component = ReactGoogleAutocomplete as unknown as React.ComponentType<
  Record<string, unknown>
>;

let uninstall: (() => void) | undefined;

function ServiceProbe(): React.ReactElement {
  const { placePredictions, placesAutocompleteService } = usePlacesAutocompleteService({
    apiKey: 'test-key',
    sessionToken: true,
  });
  return (
    <span data-ready={String(placesAutocompleteService !== null)}>{placePredictions.length}</span>
  );
}

function sideEffects() {
  return {
    styles: document.querySelectorAll(`style[${STYLE_ATTRIBUTE}]`).length,
    scripts: document.querySelectorAll('script').length,
    containers: document.querySelectorAll('.pac-container').length,
    callback: SCRIPT_CALLBACK in window,
  };
}

const NONE = { styles: 0, scripts: 0, containers: 0, callback: false };

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('renderToString', () => {
  it('returns an input and injects nothing', () => {
    const html = renderToString(
      <Component apiKey="test-key" onPlaceSelected={() => {}} className="field" />,
    );

    expect(html).toMatch(/^<input\b[^>]*class="field"[^>]*\/?>$/);
    expect(sideEffects()).toEqual(NONE);
  });

  it('does not build a widget when Google is already loaded', () => {
    const fake = createFakeGoogle();
    uninstall = fake.install();

    const html = renderToString(<Component onPlaceSelected={() => {}} />);

    expect(html).toMatch(/^<input\b/);
    expect(sideEffects()).toEqual(NONE);
    expect(fake.control.calls).toEqual([]);
  });

  it('renders the service hook without loading anything', () => {
    const fake = createFakeGoogle();
    uninstall = fake.install();

    const html = renderToString(<ServiceProbe />);

    expect(html).toMatch(/^<span data-ready="false"[^>]*>0<\/span>$/);
    expect(sideEffects()).toEqual(NONE);
    expect(fake.control.calls).toEqual([]);
  });
});
