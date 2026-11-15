import { loadFixture } from '../../src/testing/fixtures';
import type { Step } from '../../src/testing/types';

export interface BaselineScript {
  fixtures: string[];
  props: Record<string, unknown>;
  steps: Step[];
}

export const hookScript: BaselineScript = {
  fixtures: ['paris-geocode'],
  props: {},
  steps: [
    { type: 'type', text: 'Paris' },
    { type: 'advance', ms: 200 },
    { type: 'call', name: 'clearSuggestions' },
  ],
};

export const rpaScript: BaselineScript = {
  fixtures: ['rpa-mock-suggestions'],
  props: {},
  steps: [
    { type: 'type', text: 'San Francisco' },
    { type: 'advance', ms: 200 },
    { type: 'key', key: 'ArrowDown' },
    { type: 'key', key: 'Enter' },
  ],
};

export const widgetScript: BaselineScript = {
  fixtures: [],
  props: {},
  steps: [
    { type: 'type', text: 'Example' },
    { type: 'call', name: 'selectPlace', args: [loadFixture('details-full').detailsLegacy] },
    { type: 'call', name: 'enterWithoutSelection' },
  ],
};

export const serviceHookScript: BaselineScript = {
  fixtures: ['paris-geocode'],
  props: {},
  steps: [
    { type: 'call', name: 'getPlacePredictions', args: [{ input: 'Paris' }] },
    { type: 'advance', ms: 300 },
  ],
};
