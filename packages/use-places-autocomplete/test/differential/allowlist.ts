import type { AllowEntry } from '@places-compat/core/testing';

export const allowlist = {
  outOfOrder: [
    {
      id: 'UPA-02',
      path: /^settled\.suggestions\.data\[\d+\]\./,
      reason:
        'the original replaces the newer results with the late response of the earlier search',
    },
    {
      id: 'UPA-02',
      path: /^settled\.storage(\.|\[)/,
      reason:
        'the original caches the late response and drops the entry written by the newer search',
    },
    {
      id: 'UPA-02',
      path: 'loading[0]',
      reason: 'the dropped response does not render, so no loading value is seen in that step',
    },
  ],
  lateAfterClear: [
    {
      id: 'UPA-02',
      path: 'settled.suggestions.status',
      reason: 'the original shows the late response after the clear for the empty value',
    },
    {
      id: 'UPA-02',
      path: /^settled\.suggestions\.data\[\d+\]$/,
      reason: 'the original fills the cleared suggestions with the late response',
    },
    {
      id: 'UPA-02',
      path: 'settled.storage',
      reason: 'the original caches the late response, which the replacement drops without caching',
    },
    {
      id: 'UPA-02',
      path: 'loading[0]',
      reason: 'the dropped response does not render, so no loading value is seen in that step',
    },
  ],
  lateAfterCacheHit: [
    {
      id: 'UPA-02',
      path: /^settled\.suggestions\.data\[\d+\](\.|$)/,
      reason: 'the original replaces the results of the newer cache hit with the late response',
    },
    {
      id: 'UPA-02',
      path: /^settled\.storage\["[^"]+"\]$/,
      reason: 'the original caches the late response, which the replacement drops without caching',
    },
    {
      id: 'UPA-02',
      path: 'loading[0]',
      reason: 'the dropped response does not render, so no loading value is seen in that step',
    },
  ],
  unmountWarning: [
    {
      id: 'UPA-03',
      path: 'console[0]',
      reason:
        'React 17 warns, once per component name, about the state update the original makes after unmount',
    },
  ],
  unmountPending: [
    {
      id: 'UPA-03',
      path: 'settled.storage',
      reason: 'the original still runs the debounced search after unmount and caches its response',
    },
  ],
  inheritedKey: [
    {
      id: 'UPA-04',
      path: 'settled.suggestions.status',
      reason: 'the original takes an inherited property of the cache object as a hit',
    },
    {
      id: 'UPA-04',
      path: 'settled.suggestions.data',
      reason: 'the original reads data from the inherited property, which gives undefined',
    },
  ],
  legacyFake: [
    {
      id: 'UPA-05',
      path: 'settled.ready',
      reason: 'with only the legacy places library the replacement never becomes ready',
    },
    {
      id: 'UPA-05',
      path: /^console\[\d+\]$/,
      reason:
        'the replacement logs the load error with the new API hint, once per init call (twice when StrictMode remounts)',
    },
    {
      id: 'UPA-05',
      path: /^settled\.suggestions\.(status|data\[\d+\])$/,
      reason: 'the replacement does not search while it is not ready',
    },
    {
      id: 'UPA-05',
      path: 'settled.storage',
      reason: 'nothing is cached when no search runs',
    },
    {
      id: 'UPA-05',
      path: /^loading\[\d+\]$/,
      reason: 'no loading transition happens when no search runs',
    },
  ],
} satisfies Record<string, AllowEntry[]>;
