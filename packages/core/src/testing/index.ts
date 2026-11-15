export { compareTraces } from './compare';
export { createLegacyFakeGoogle } from './fake-legacy';
export { createFakeGoogle, fakeMapsError } from './fake-new';
export { applyFixture, loadFixture } from './fixtures';
export { actCompat, renderCompat, renderHookCompat } from './render';
export { runScenario } from './scenario';
export { hookSubject } from './subjects/hook';
export { rpaSubject } from './subjects/rpa';
export { serviceHookSubject } from './subjects/service-hook';
export { widgetSubject } from './subjects/widget';
export type {
  AllowEntry,
  FakeControl,
  Fixture,
  FixtureMeta,
  LegacyControl,
  Match,
  Mounted,
  PendingReply,
  PlaceJson,
  ReplyOpts,
  Step,
  Subject,
  SuggestionJson,
  Trace,
  TraceEntry,
} from './types';
