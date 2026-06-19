export interface ParsedDoubleQuoted {
  content: string;
  closeIndex: number;
}

/**
 * Read the contents of a double-quoted attribute value starting at the opening
 * quote, skipping over nested single-quoted regions and `{{ … }}` interpolations
 * so an embedded quote does not terminate the value early.
 */
export function readDoubleQuotedContent(text: string, openQuoteIndex: number): ParsedDoubleQuoted | null {
  let index = openQuoteIndex + 1;
  while (index < text.length) {
    const character = text[index];
    if (character === '"') {
      return { content: text.slice(openQuoteIndex + 1, index), closeIndex: index };
    }
    if (character === "'") {
      index += 1;
      while (index < text.length && text[index] !== "'") {
        index += 1;
      }
      index += 1;
      continue;
    }
    if (character === "{" && text[index + 1] === "{") {
      index += 2;
      while (index < text.length - 1 && !(text[index] === "}" && text[index + 1] === "}")) {
        index += 1;
      }
      index += 2;
      continue;
    }
    index += 1;
  }
  return null;
}

/** True when an attribute value's trimmed content looks like HTML/component markup (a slot). */
export function isHtmlSlotValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith("<")) {
    return false;
  }
  return /<(?:\/|[A-Za-z])/.test(trimmed);
}
