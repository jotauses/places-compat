import { toRegionCode } from './request';

type Lib = google.maps.PlacesLibrary;
type Place = google.maps.places.Place;
type PlacePrediction = google.maps.places.PlacePrediction;
type Token = google.maps.places.AutocompleteSessionToken;

export interface PredictionContext {
  language?: string;
  region?: string;
  token?: Token;
}

export interface Session {
  newToken(): Token;
  remember(p: PlacePrediction, ctx?: PredictionContext): void;
  placeFor(req: { placeId: string; language?: string | null; region?: string | null }): Place;
  release(place: Place, fetched: boolean): void;
}

const REGISTRY_SIZE = 100;

interface Entry {
  prediction: PlacePrediction;
  language: string | undefined;
  region: string | undefined;
  token: Token | undefined;
  busy: boolean;
}

function matches(requested: string | null | undefined, remembered: string | undefined): boolean {
  return requested === undefined || requested === null || requested === remembered;
}

function sameRegion(requested: string | null | undefined, remembered: string | undefined): boolean {
  if (requested === undefined || requested === null) return true;
  return remembered !== undefined && toRegionCode(requested) === toRegionCode(remembered);
}

export function createSession(places: Lib): Session {
  const registry = new Map<string, Entry>();
  const issued = new WeakMap<Place, Entry>();
  const closed = new WeakSet<Token>();
  const inFlight = new WeakSet<Token>();

  return {
    newToken() {
      return new places.AutocompleteSessionToken();
    },
    remember(p, ctx) {
      const placeId = p.placeId;
      const token = ctx?.token;
      if (token && closed.has(token)) return;
      registry.delete(placeId);
      registry.set(placeId, {
        prediction: p,
        language: ctx?.language,
        region: ctx?.region,
        token,
        busy: false,
      });
      while (registry.size > REGISTRY_SIZE) {
        registry.delete(registry.keys().next().value as string);
      }
    },
    placeFor(req) {
      const entry = registry.get(req.placeId);
      if (
        entry &&
        !entry.busy &&
        !(entry.token && inFlight.has(entry.token)) &&
        matches(req.language, entry.language) &&
        sameRegion(req.region, entry.region)
      ) {
        const place = entry.prediction.toPlace();
        entry.busy = true;
        if (entry.token) inFlight.add(entry.token);
        issued.set(place, entry);
        return place;
      }
      const options: google.maps.places.PlaceOptions = { id: req.placeId };
      if (req.language !== undefined && req.language !== null) {
        options.requestedLanguage = req.language;
      }
      if (req.region !== undefined && req.region !== null) options.requestedRegion = req.region;
      return new places.Place(options);
    },
    release(place, fetched) {
      const entry = issued.get(place);
      if (!entry) return;
      issued.delete(place);
      entry.busy = false;
      if (entry.token) inFlight.delete(entry.token);
      if (!fetched) return;
      if (registry.get(entry.prediction.placeId) === entry) {
        registry.delete(entry.prediction.placeId);
      }
      const token = entry.token;
      if (!token) return;
      closed.add(token);
      for (const [placeId, other] of Array.from(registry)) {
        if (other.token === token) registry.delete(placeId);
      }
    },
  };
}

const shared = new WeakMap<object, Session>();

export function sharedSession(places: Lib): Session {
  let session = shared.get(places);
  if (!session) {
    session = createSession(places);
    shared.set(places, session);
  }
  return session;
}
