import React from 'react';
import * as upstream from 'upstream-rpa';
import { expect, it } from 'vitest';
import { runScenario } from '../../src/testing/scenario';
import { rpaSubject } from '../../src/testing/subjects/rpa';
import stored from './__traces__/rpa.json';
import storedReact17 from './__traces__/rpa.react17.json';
import { rpaScript } from './scripts';

// React 17 renders the loading: true state inside the advance step; 18 and 19 batch it in act.
const expected = React.version.startsWith('17.') ? storedReact17 : stored;

it('react-places-autocomplete on the legacy fake matches the stored trace', async () => {
  const trace = await runScenario({ subject: rpaSubject(upstream), fake: 'legacy', ...rpaScript });
  expect(JSON.parse(JSON.stringify(trace))).toEqual(expected);
});
