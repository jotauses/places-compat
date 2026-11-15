import * as upstream from 'upstream-rga/lib/usePlacesAutocompleteService';
import { expect, it } from 'vitest';
import { runScenario } from '../../src/testing/scenario';
import { serviceHookSubject } from '../../src/testing/subjects/service-hook';
import stored from './__traces__/service-hook.json';
import { serviceHookScript } from './scripts';

it('usePlacesAutocompleteService on the legacy fake matches the stored trace', async () => {
  const trace = await runScenario({
    subject: serviceHookSubject(upstream),
    fake: 'legacy',
    ...serviceHookScript,
  });
  expect(JSON.parse(JSON.stringify(trace))).toEqual(stored);
});
