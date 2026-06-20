// Returns the char range of a leading {#def ... #} header, else null.
// The header must be the first non-whitespace content.
export function findDefHeaderRange(text: string): { start: number; end: number } | null {
  // Skip leading whitespace to find the first non-whitespace position.
  let start = 0;
  while (start < text.length && /\s/.test(text[start])) {
    start += 1;
  }

  // Must open with {# (optionally with whitespace-control dash).
  if (text[start] !== "{" || text[start + 1] !== "#") {
    return null;
  }

  // Check for {#-?\s*def\b — mirror of the DEF_HEADER regex in html-structure.ts.
  const slice = text.slice(start);
  if (!/^\{#-?\s*def\b/.test(slice)) {
    return null;
  }

  // Find the closing #}.
  const closeIndex = text.indexOf("#}", start + 2);
  if (closeIndex === -1) {
    return null;
  }

  return { start, end: closeIndex + 2 };
}
