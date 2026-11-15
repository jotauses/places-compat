export function createAttribution(doc: Document): HTMLDivElement {
  const element = doc.createElement('div');
  element.className = 'pac-attribution';
  element.setAttribute('translate', 'no');
  element.setAttribute('aria-hidden', 'true');
  element.textContent = 'Google Maps';
  return element;
}
