import * as upstream from 'upstream-rga';
import { expect, it } from 'vitest';
import { runScenario } from '../../src/testing/scenario';
import { widgetSubject } from '../../src/testing/subjects/widget';
import stored from './__traces__/widget.json';
import { widgetScript } from './scripts';

it('usePlacesWidget on the legacy fake matches the stored trace', async () => {
  const trace = await runScenario({
    subject: widgetSubject(upstream),
    fake: 'legacy',
    ...widgetScript,
  });
  expect(JSON.parse(JSON.stringify(trace))).toEqual(stored);
});
