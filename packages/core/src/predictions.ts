import { toLegacyPrediction } from './prediction';
import { toAutocompleteRequest } from './request';
import type { PredictionContext, Session } from './session';
import { type LegacyStatus, statusForList, toLegacyStatus } from './status';

type AutocompletePrediction = google.maps.places.AutocompletePrediction;
type PlacePrediction = google.maps.places.PlacePrediction;

export async function fetchPredictions(
  places: google.maps.PlacesLibrary,
  legacy: google.maps.places.AutocompletionRequest,
  opts?: { session?: Session; strictBounds?: boolean },
): Promise<{ status: LegacyStatus; predictions: AutocompletePrediction[] }> {
  let request: google.maps.places.AutocompleteRequest;
  let suggestions: google.maps.places.AutocompleteSuggestion[];
  try {
    request = toAutocompleteRequest(
      legacy,
      opts?.strictBounds ? { strictBounds: true } : undefined,
    ).request;
    ({ suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request));
  } catch (error) {
    return { status: toLegacyStatus(error), predictions: [] };
  }
  const live: PlacePrediction[] = [];
  const predictions: AutocompletePrediction[] = [];
  try {
    for (const suggestion of suggestions) {
      const prediction = suggestion.placePrediction;
      if (!prediction) continue;
      live.push(prediction);
      predictions.push(toLegacyPrediction(prediction));
    }
    const ctx: PredictionContext = {};
    if (typeof request.language === 'string') ctx.language = request.language;
    if (typeof request.region === 'string') ctx.region = request.region;
    if (typeof request.sessionToken === 'object' && request.sessionToken !== null) {
      ctx.token = request.sessionToken;
    }
    for (const prediction of live) opts?.session?.remember(prediction, ctx);
  } catch {
    return { status: 'UNKNOWN_ERROR', predictions: [] };
  }
  return { status: statusForList(predictions), predictions };
}
