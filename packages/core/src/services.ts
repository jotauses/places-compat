import { fetchDetails } from './details';
import { fetchPredictions } from './predictions';
import type { Session } from './session';
import type { LegacyStatus } from './status';

type Lib = google.maps.PlacesLibrary;
type AutocompletePrediction = google.maps.places.AutocompletePrediction;
type AutocompletionRequest = google.maps.places.AutocompletionRequest;
type StatusString = google.maps.places.PlacesServiceStatusString;

const REQUEST_ERRORS: readonly string[] = [
  'INVALID_REQUEST',
  'NOT_FOUND',
  'OVER_QUERY_LIMIT',
  'REQUEST_DENIED',
];

function statusError(status: LegacyStatus): Error {
  const error = new Error(`PLACES_AUTOCOMPLETE: ${status}`) as Error & {
    code: string;
    endpoint: string;
  };
  error.name = REQUEST_ERRORS.indexOf(status) !== -1 ? 'MapsRequestError' : 'MapsServerError';
  error.code = status;
  error.endpoint = 'PLACES_AUTOCOMPLETE';
  return error;
}

function ignore(): void {}

// A caller's callback that throws is its own bug: rethrow it outside every promise chain.
function invoke(callback: () => void): void {
  try {
    callback();
  } catch (error) {
    setTimeout(() => {
      throw error;
    }, 0);
  }
}

export function createAutocompleteServiceShim(
  places: Lib,
  session: Session,
): google.maps.places.AutocompleteService {
  function predict(
    request: AutocompletionRequest,
    callback: ((predictions: AutocompletePrediction[] | null, status: StatusString) => void) | null,
  ): Promise<google.maps.places.AutocompleteResponse> {
    const promise = fetchPredictions(places, request, { session }).then(
      ({ status, predictions }) => {
        const ok = status === 'OK';
        if (callback) invoke(() => callback(ok ? predictions : null, status as StatusString));
        if (ok || status === 'ZERO_RESULTS') return { predictions };
        throw statusError(status);
      },
    );
    // The callback already saw the status, so a status rejection must not go unhandled.
    if (callback) promise.catch(ignore);
    return promise;
  }

  const shim = {
    getPlacePredictions(
      request: AutocompletionRequest,
      callback?: (predictions: AutocompletePrediction[] | null, status: StatusString) => void,
    ) {
      return predict(request, callback ?? null);
    },
    getQueryPredictions(
      request: google.maps.places.QueryAutocompletionRequest,
      callback: (
        predictions: google.maps.places.QueryAutocompletePrediction[] | null,
        status: StatusString,
      ) => void,
    ): void {
      const promise = predict(
        request as AutocompletionRequest,
        callback as (predictions: AutocompletePrediction[] | null, status: StatusString) => void,
      );
      promise.catch(ignore);
    },
  };
  return shim as unknown as google.maps.places.AutocompleteService;
}

function unavailable(method: string): () => never {
  return () => {
    throw new Error(`PlacesService.${method} is not available with Places API (New).`);
  };
}

export function createPlacesServiceShim(
  places: Lib,
  session: Session,
  _attrContainer?: HTMLDivElement,
): google.maps.places.PlacesService {
  const shim = {
    getDetails(
      request: google.maps.places.PlaceDetailsRequest,
      callback: (result: google.maps.places.PlaceResult | null, status: StatusString) => void,
    ): void {
      void fetchDetails(places, request, { session }).then(({ status, result }) => {
        invoke(() => callback(status === 'OK' ? result : null, status as StatusString));
      });
    },
    textSearch: unavailable('textSearch'),
    nearbySearch: unavailable('nearbySearch'),
    findPlaceFromQuery: unavailable('findPlaceFromQuery'),
    findPlaceFromPhoneNumber: unavailable('findPlaceFromPhoneNumber'),
  };
  return shim as unknown as google.maps.places.PlacesService;
}
