import React from 'react';
import * as rga from 'upstream-rga';
import * as rgaService from 'upstream-rga/lib/usePlacesAutocompleteService';
import * as rpa from 'upstream-rpa';
import * as upa from 'upstream-upa';
import { describe, expect, it } from 'vitest';
import { runScenario } from '../../src/testing/scenario';
import { hookSubject } from '../../src/testing/subjects/hook';
import { rpaSubject } from '../../src/testing/subjects/rpa';
import { serviceHookSubject } from '../../src/testing/subjects/service-hook';
import { widgetSubject } from '../../src/testing/subjects/widget';
import type { Trace } from '../../src/testing/types';
import hookTrace from './__traces__/hook.json';
import hookTraceReact17 from './__traces__/hook.react17.json';
import rpaTrace from './__traces__/rpa.json';
import rpaTraceReact17 from './__traces__/rpa.react17.json';
import serviceHookTrace from './__traces__/service-hook.json';
import widgetTrace from './__traces__/widget.json';
import { hookScript, rpaScript, serviceHookScript, widgetScript } from './scripts';

const react17 = React.version.startsWith('17.');

const roundTrip = (trace: Trace): Trace => JSON.parse(JSON.stringify(trace)) as Trace;

describe('the originals under StrictMode', () => {
  it('use-places-autocomplete gives the same trace', async () => {
    const trace = await runScenario({
      subject: hookSubject(upa),
      fake: 'legacy',
      strict: true,
      ...hookScript,
    });
    expect(roundTrip(trace)).toEqual(react17 ? hookTraceReact17 : hookTrace);
  });

  it('react-places-autocomplete gives the same trace', async () => {
    const trace = await runScenario({
      subject: rpaSubject(rpa),
      fake: 'legacy',
      strict: true,
      ...rpaScript,
    });
    expect(roundTrip(trace)).toEqual(react17 ? rpaTraceReact17 : rpaTrace);
  });

  it('usePlacesAutocompleteService gives the same trace', async () => {
    const trace = await runScenario({
      subject: serviceHookSubject(rgaService),
      fake: 'legacy',
      strict: true,
      ...serviceHookScript,
    });
    expect(roundTrip(trace)).toEqual(serviceHookTrace);
  });

  it('usePlacesWidget repeats the mount setters on 18 and 19, where effects run twice', async () => {
    const trace = roundTrip(
      await runScenario({
        subject: widgetSubject(rga),
        fake: 'legacy',
        strict: true,
        ...widgetScript,
      }),
    );
    const expected = roundTrip(widgetTrace as Trace);
    const first = expected[0] as Trace[number];
    if (!react17) first.callbacks = [...first.callbacks, ...first.callbacks];
    expect(trace).toEqual(expected);
  });
});
