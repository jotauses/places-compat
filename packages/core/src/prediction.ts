import { synthesizeTerms } from './terms';

interface RangeLike {
  startOffset?: number | null;
  endOffset: number;
}

function toSubstrings(
  ranges: readonly RangeLike[] | null | undefined,
): google.maps.places.PredictionSubstring[] {
  return (ranges ?? []).map((range) => {
    const offset = range.startOffset ?? 0;
    return { length: range.endOffset - offset, offset };
  });
}

export function toLegacyPrediction(
  p: google.maps.places.PlacePrediction,
): google.maps.places.AutocompletePrediction {
  const description = p.text.text;
  const main = p.mainText;
  const secondary = p.secondaryText;
  const mainMatches = main ? toSubstrings(main.matches) : [];
  let matched = toSubstrings(p.text.matches);
  if (matched.length === 0 && mainMatches.length > 0 && main && description.startsWith(main.text)) {
    matched = toSubstrings(main.matches);
  }
  const prediction = { description } as google.maps.places.AutocompletePrediction;
  const distance = p.distanceMeters;
  if (distance !== null && distance !== undefined) prediction.distance_meters = distance;
  prediction.matched_substrings = matched;
  prediction.place_id = p.placeId;
  prediction.structured_formatting = {
    main_text: main ? main.text : description,
    main_text_matched_substrings: mainMatches,
    secondary_text: secondary ? secondary.text : '',
  };
  prediction.terms = synthesizeTerms(description);
  prediction.types = (p.types ?? []).slice();
  return prediction;
}
