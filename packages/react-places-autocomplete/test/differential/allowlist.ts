import type { AllowEntry } from '@places-compat/core/testing';

export const allowlist: AllowEntry[] = [
  {
    id: 'RPA-01',
    path: /^(settled\.renderArg\.suggestions\[\d+\]|callbacks\[\d+\]\.args\[2\])\.id$/,
    reason: 'The new API has no prediction id, so suggestion.id is undefined.',
  },
  {
    id: 'RPA-02',
    path: /^settled\.itemProps\[\d+\]\.key$/,
    reason: 'The item key comes from suggestion.placeId, as on upstream master.',
  },
  {
    id: 'RPA-03',
    path: /^settled\.itemProps\[\d+\]\.id$/,
    reason: 'Each item gets its own DOM id built from its placeId.',
  },
];
