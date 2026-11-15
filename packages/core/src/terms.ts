export function synthesizeTerms(text: string): google.maps.places.PredictionTerm[] {
  const terms: google.maps.places.PredictionTerm[] = [];
  let offset = 0;
  for (const value of text.split(', ')) {
    terms.push({ offset, value });
    offset += value.length + 2;
  }
  return terms;
}
