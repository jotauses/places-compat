import {
  actCompat,
  applyFixture,
  compareTraces,
  createFakeGoogle,
  type FakeControl,
  loadFixture,
  renderCompat,
  renderHookCompat,
  runScenario,
  type Step,
  widgetSubject,
} from '@places-compat/core/testing';
import { fireEvent } from '@testing-library/react';
import React from 'react';
import * as upstream from 'upstream-rga';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReactGoogleAutocomplete, * as replacement from '../../src/index';
import usePlacesAutocompleteService from '../../src/usePlacesAutocompleteService';
import usePlacesWidget from '../../src/usePlacesWidget';
import { STYLE_ATTRIBUTE } from '../../src/widget/styles';
import { widgetAllow } from '../differential/allowlist';

type AnyProps = Record<string, unknown>;

const Component = ReactGoogleAutocomplete as unknown as React.ComponentType<AnyProps>;
const fixture = loadFixture('details-full');

let uninstall: (() => void) | undefined;

function install(): FakeControl {
  const fake = createFakeGoogle();
  uninstall = fake.install();
  applyFixture(fake.control, fixture);
  fake.control.onSuggest(fixture.request.input, fixture.new.suggestions);
  if (fixture.detailsNew) fake.control.onFetchFields(fixture.detailsNew.id, fixture.detailsNew);
  return fake.control;
}

function HookInput(props: AnyProps): React.ReactElement {
  const { ref } = usePlacesWidget<HTMLInputElement>(props);
  return <input ref={ref} />;
}

function count(selector: string): number {
  return document.querySelectorAll(selector).length;
}

function callsOf(control: FakeControl, kind: FakeControl['calls'][number]['kind']): number {
  return control.calls.filter((call) => call.kind === kind).length;
}

async function selectExample(input: HTMLInputElement): Promise<void> {
  await actCompat(() => {
    fireEvent.input(input, { target: { value: fixture.request.input } });
  });
  const item = document.querySelector('.pac-item');
  if (!item) throw new Error('the dropdown has no .pac-item');
  await actCompat(() => {
    fireEvent.mouseDown(item);
  });
}

interface WidgetRun {
  containers: number;
  styles: number;
  selected: number;
  suggest: number;
  fetchFields: number;
  afterUnmount: number;
}

async function runWidget(
  element: (onPlaceSelected: () => void) => React.ReactElement,
  strict: boolean,
): Promise<WidgetRun> {
  const control = install();
  const onPlaceSelected = vi.fn();
  const view = renderCompat(element(onPlaceSelected), strict ? { strict: true } : {});
  await actCompat(() => {});
  const containers = count('.pac-container');
  const styles = count(`style[${STYLE_ATTRIBUTE}]`);
  await selectExample(view.container.querySelector('input') as HTMLInputElement);
  const run = {
    containers,
    styles,
    selected: onPlaceSelected.mock.calls.length,
    suggest: callsOf(control, 'suggest'),
    fetchFields: callsOf(control, 'fetchFields'),
    afterUnmount: 0,
  };
  view.unmount();
  run.afterUnmount = count('.pac-container');
  cleanup();
  return run;
}

function cleanup(): void {
  uninstall?.();
  uninstall = undefined;
  document.body.innerHTML = '';
  document.head.innerHTML = '';
}

afterEach(cleanup);

describe('StrictMode', () => {
  const widgets: [string, (onPlaceSelected: () => void) => React.ReactElement][] = [
    ['the component', (onPlaceSelected) => <Component onPlaceSelected={onPlaceSelected} />],
    ['usePlacesWidget', (onPlaceSelected) => <HookInput onPlaceSelected={onPlaceSelected} />],
  ];

  for (const [name, element] of widgets) {
    it(`${name} keeps one dropdown, one stylesheet and the same listeners`, async () => {
      const loose = await runWidget(element, false);
      const strict = await runWidget(element, true);

      expect(loose).toEqual({
        containers: 1,
        styles: 1,
        selected: 2,
        suggest: 1,
        fetchFields: 1,
        afterUnmount: 0,
      });
      expect(strict).toEqual(loose);
    });
  }

  it('usePlacesWidget gives the same trace as the original under StrictMode', async () => {
    const steps: Step[] = [
      { type: 'type', text: fixture.request.input },
      {
        type: 'call',
        name: 'selectPlace',
        args: [
          {
            address_components: fixture.detailsLegacy?.address_components,
            geometry: { location: fixture.detailsLegacy?.geometry?.location },
            place_id: fixture.detailsLegacy?.place_id,
            formatted_address: fixture.detailsLegacy?.formatted_address,
          },
        ],
      },
      { type: 'type', text: fixture.request.input },
      { type: 'call', name: 'enterWithoutSelection' },
      { type: 'unmount' },
    ];
    const original = await runScenario({
      subject: widgetSubject(upstream),
      fake: 'legacy',
      strict: true,
      steps,
    });
    const ours = await runScenario({
      subject: widgetSubject(replacement),
      fake: 'new',
      fixtures: ['details-full'],
      strict: true,
      steps,
    });

    expect(compareTraces(original, ours, widgetAllow)).toEqual({ diffs: [], unusedAllow: [] });
    expect(count('.pac-container')).toBe(0);
  });

  it('usePlacesAutocompleteService builds one set of services and sends one request', async () => {
    const results: { calls: number; predictions: number; token: boolean; containers: number }[] =
      [];
    for (const strict of [false, true]) {
      const control = install();
      applyFixture(control, loadFixture('paris-geocode'));
      vi.useFakeTimers();
      try {
        const view = renderHookCompat(usePlacesAutocompleteService, {
          initialProps: { sessionToken: true },
          ...(strict ? { strict: true } : {}),
        });
        await actCompat(() => {});
        const service = view.result.current.placesAutocompleteService;
        await actCompat(() => {
          view.result.current.getPlacePredictions({ input: 'Paris' });
        });
        await actCompat(async () => {
          await vi.advanceTimersByTimeAsync(300);
        });
        expect(view.result.current.placesAutocompleteService).toBe(service);
        results.push({
          calls: callsOf(control, 'suggest'),
          predictions: view.result.current.placePredictions.length,
          token: view.result.current.autocompleteSessionToken != null,
          containers: count('.pac-container') + count(`style[${STYLE_ATTRIBUTE}]`),
        });
        view.unmount();
      } finally {
        vi.useRealTimers();
        cleanup();
      }
    }

    expect(results[0]).toEqual({ calls: 1, predictions: 5, token: true, containers: 0 });
    expect(results[1]).toEqual(results[0]);
  });
});
