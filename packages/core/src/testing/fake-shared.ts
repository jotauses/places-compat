import { toLatLng, toLatLngBounds } from './fake-latlng';
import type { Match, PendingReply, ReplyOpts } from './types';

export function matches<R>(match: Match<R>, request: R, key: unknown): boolean {
  if (typeof match === 'function') return match(request);
  if (typeof key !== 'string') return false;
  if (typeof match === 'string') return match === key;
  match.lastIndex = 0;
  return match.test(key);
}

interface Handler<R, V> {
  match: Match<R>;
  reply: V;
  left: number;
  opts: ReplyOpts;
}

export class Handlers<R, V> {
  private readonly list: Handler<R, V>[] = [];

  add(match: Match<R>, reply: V, opts: ReplyOpts = {}): void {
    this.list.push({ match, reply, left: opts.times ?? Number.POSITIVE_INFINITY, opts });
  }

  take(request: R, key: unknown): { reply: V; opts: ReplyOpts } | undefined {
    for (const handler of this.list) {
      if (handler.left <= 0 || !matches(handler.match, request, key)) continue;
      handler.left -= 1;
      return { reply: handler.reply, opts: handler.opts };
    }
    return undefined;
  }

  clear(): void {
    this.list.length = 0;
  }
}

export class ReplyEngine<C extends { seq: number }> {
  readonly calls: C[] = [];
  readonly pending: PendingReply[] = [];
  private seq = 0;
  private epoch = 0;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  record(entry: Omit<C, 'seq'>): number {
    this.seq += 1;
    this.calls.push({ ...entry, seq: this.seq } as C);
    return this.seq;
  }

  schedule(
    kind: PendingReply['kind'],
    seq: number,
    opts: ReplyOpts,
    deliver: () => void,
    fail: (error?: Error) => void,
  ): void {
    const epoch = this.epoch;
    const live = () => epoch === this.epoch;
    if (opts.deferred) {
      let settled = false;
      const settle = (run: () => void) => {
        if (settled || !live()) return;
        settled = true;
        run();
      };
      this.pending.push({
        seq,
        kind,
        resolve: () => settle(deliver),
        reject: (error?: Error) => settle(() => fail(error)),
      });
      return;
    }
    if (opts.delayMs !== undefined) {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        if (live()) deliver();
      }, opts.delayMs);
      this.timers.add(timer);
      return;
    }
    if (opts.sync) {
      deliver();
      return;
    }
    queueMicrotask(() => {
      if (live()) deliver();
    });
  }

  reset(): void {
    this.epoch += 1;
    this.seq = 0;
    this.calls.length = 0;
    this.pending.length = 0;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }
}

export const REQUEST_ERROR_CODES: readonly string[] = [
  'INVALID_ARGUMENT',
  'OUT_OF_RANGE',
  'FAILED_PRECONDITION',
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'NOT_FOUND',
  'ALREADY_EXISTS',
  'ABORTED',
  'RESOURCE_EXHAUSTED',
  'INVALID_REQUEST',
  'OVER_QUERY_LIMIT',
  'REQUEST_DENIED',
  'ZERO_RESULTS',
];

export type FakeMapsError = Error & { code: string; endpoint: string };

export function mapsError(code: string, endpoint: string, message: string): FakeMapsError {
  const error = new Error(message) as FakeMapsError;
  error.name = REQUEST_ERROR_CODES.includes(code) ? 'MapsRequestError' : 'MapsServerError';
  error.code = code;
  error.endpoint = endpoint;
  return error;
}

export function codeOf(error: unknown, allowed: readonly string[], fallback: string): string {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && allowed.includes(code) ? code : fallback;
}

export const PLACES_STATUS = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  OK: 'OK',
  OVER_QUERY_LIMIT: 'OVER_QUERY_LIMIT',
  REQUEST_DENIED: 'REQUEST_DENIED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  ZERO_RESULTS: 'ZERO_RESULTS',
} as const;

PLACES_STATUS satisfies Record<keyof typeof google.maps.places.PlacesServiceStatus, string>;

export const GEOCODER_STATUS = {
  ERROR: 'ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  OK: 'OK',
  OVER_QUERY_LIMIT: 'OVER_QUERY_LIMIT',
  REQUEST_DENIED: 'REQUEST_DENIED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  ZERO_RESULTS: 'ZERO_RESULTS',
} as const;

GEOCODER_STATUS satisfies Record<keyof typeof google.maps.GeocoderStatus, string>;

type Geometry = {
  location?: google.maps.LatLng | google.maps.LatLngLiteral;
  viewport?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral;
  bounds?: google.maps.LatLngBounds | google.maps.LatLngBoundsLiteral;
};

export function wrapGeometry<T extends object>(result: T): T {
  const geometry = (result as { geometry?: unknown }).geometry as Geometry | null | undefined;
  if (!geometry) return result;
  const copy: Record<string, unknown> = { ...geometry };
  if (geometry.location) copy.location = toLatLng(geometry.location);
  if (geometry.viewport) copy.viewport = toLatLngBounds(geometry.viewport);
  if (geometry.bounds) copy.bounds = toLatLngBounds(geometry.bounds);
  return { ...result, geometry: copy };
}

export type GeocodeReply = google.maps.GeocoderResult[] | { status: string };

type GeocodeCall = { kind: 'geocode'; request: unknown };

export function createGeocoderClass(
  engine: ReplyEngine<{ seq: number }>,
  handlers: Handlers<google.maps.GeocoderRequest, GeocodeReply>,
): typeof google.maps.Geocoder {
  const statuses = Object.keys(GEOCODER_STATUS);
  class Geocoder {
    geocode(
      request: google.maps.GeocoderRequest,
      callback?:
        | ((
            results: google.maps.GeocoderResult[] | null,
            status: google.maps.GeocoderStatusString,
          ) => void)
        | null,
    ): Promise<google.maps.GeocoderResponse> {
      const seq = engine.record({ kind: 'geocode', request: { ...request } } satisfies GeocodeCall);
      const picked = handlers.take(request, request.address ?? request.placeId);
      const reply: GeocodeReply = picked?.reply ?? { status: 'ZERO_RESULTS' };
      const promise = new Promise<google.maps.GeocoderResponse>((resolve, reject) => {
        const finish = (status: google.maps.GeocoderStatusString, error?: Error) => {
          const results =
            status === 'OK' && Array.isArray(reply)
              ? reply.map(wrapGeometry)
              : status === 'OK' || status === 'ZERO_RESULTS'
                ? []
                : null;
          callback?.(results, status);
          if (status === 'OK') resolve({ results: results ?? [] });
          else
            reject(error ?? mapsError(status, 'GEOCODER_GEOCODE', `Geocoding failed: ${status}`));
        };
        engine.schedule(
          'geocode',
          seq,
          picked?.opts ?? {},
          () => {
            if (Array.isArray(reply)) finish(reply.length > 0 ? 'OK' : 'ZERO_RESULTS');
            else {
              const status = statuses.includes(reply.status) ? reply.status : 'UNKNOWN_ERROR';
              finish(status as google.maps.GeocoderStatusString);
            }
          },
          (error) => {
            const status = codeOf(error, statuses, 'UNKNOWN_ERROR');
            finish(status as google.maps.GeocoderStatusString, error);
          },
        );
      });
      if (callback) promise.catch(() => {});
      return promise;
    }
  }
  Geocoder.prototype.geocode satisfies google.maps.Geocoder['geocode'];
  return Geocoder;
}

export interface FakeGoogle<C> {
  google: typeof google;
  control: C;
  install(): () => void;
}

export function installGoogle(value: unknown): () => void {
  const target = globalThis as { google?: unknown };
  const had = Object.getOwnPropertyDescriptor(target, 'google') !== undefined;
  const previous = target.google;
  target.google = value;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (had) target.google = previous;
    else delete target.google;
  };
}
