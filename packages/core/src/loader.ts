type Lib = google.maps.PlacesLibrary;
type Maps = typeof google.maps;

export const MIN_MAPS_VERSION = '3.57.2';

export const NEW_API_HINT =
  'Places API (New) must be enabled and the Maps JavaScript API must be version 3.57.2 or later.';

const MESSAGES = {
  'no-places': 'The Google Maps Places library is not loaded.',
  'no-new-api': NEW_API_HINT,
};

export class PlacesUnavailableError extends Error {
  reason: 'no-places' | 'no-new-api';

  constructor(reason: 'no-places' | 'no-new-api', message: string = MESSAGES[reason]) {
    super(message);
    // Keeps instanceof working when the class is compiled down to an ES5 function.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'PlacesUnavailableError';
    this.reason = reason;
  }
}

function hasNewApi(places: unknown): places is Lib {
  return (
    typeof places === 'object' &&
    places !== null &&
    Boolean((places as { AutocompleteSuggestion?: unknown }).AutocompleteSuggestion)
  );
}

function globalMaps(): Maps | undefined {
  return (globalThis as { google?: { maps?: Maps } }).google?.maps;
}

export function getPlaces(maps: Maps | undefined = globalMaps()): Lib | undefined {
  const places: unknown = maps?.places;
  return hasNewApi(places) ? places : undefined;
}

export async function loadPlaces(maps: Maps | undefined = globalMaps()): Promise<Lib> {
  const ready = getPlaces(maps);
  if (ready) return ready;
  if (!maps || typeof maps.importLibrary !== 'function') {
    throw new PlacesUnavailableError(maps?.places ? 'no-new-api' : 'no-places');
  }
  let places: unknown;
  try {
    places = await maps.importLibrary('places');
  } catch {
    throw new PlacesUnavailableError('no-places');
  }
  if (!hasNewApi(places)) throw new PlacesUnavailableError('no-new-api');
  return places;
}
