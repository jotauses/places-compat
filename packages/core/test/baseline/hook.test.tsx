import React from 'react';
import * as upstream from 'upstream-upa';
import { expect, it } from 'vitest';
import { runScenario } from '../../src/testing/scenario';
import { hookSubject } from '../../src/testing/subjects/hook';
import stored from './__traces__/hook.json';
import storedReact17 from './__traces__/hook.react17.json';
import { hookScript } from './scripts';

// React 17 renders the loading: true state inside the advance step; 18 and 19 batch it in act.
const expected = React.version.startsWith('17.') ? storedReact17 : stored;

it('use-places-autocomplete on the legacy fake matches the stored trace', async () => {
  const trace = await runScenario({
    subject: hookSubject(upstream),
    fake: 'legacy',
    ...hookScript,
  });
  expect(JSON.parse(JSON.stringify(trace))).toEqual(expected);
});
