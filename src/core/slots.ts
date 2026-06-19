import { INDENT } from "../config.ts";

interface ParsedDoubleQuoted {
  content: string;
  closeIndex: number;
}

function readDoubleQuotedContent(text: string, openQuoteIndex: number): ParsedDoubleQuoted | null {
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

export function isHtmlSlotValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith("<")) {
    return false;
  }
  return /<(?:\/|[A-Za-z])/.test(trimmed);
}

export function splitHtmlFragments(text: string): string[] {
  return text
    .replace(/></g, ">\n<")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function formatInnerSlotContent(content: string, innerIndent: string): string {
  const fragments = splitHtmlFragments(content.trim());
  if (fragments.length === 0) {
    return `\n${innerIndent}\n`;
  }
  return `\n${fragments.map((fragment) => `${innerIndent}${fragment}`).join("\n")}\n`;
}

export function formatSlottedPascalTags(text: string): string {
  const replacements: { start: number; end: number; replacement: string }[] = [];
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const equalsQuote = text.indexOf('="', searchFrom);
    if (equalsQuote === -1) {
      break;
    }

    const lineStart = text.lastIndexOf("\n", equalsQuote) + 1;
    const beforeAttribute = text.slice(lineStart, equalsQuote);
    const attributeMatch = beforeAttribute.match(/([\w-]+)\s*$/);
    if (!attributeMatch) {
      searchFrom = equalsQuote + 2;
      continue;
    }

    const attributeName = attributeMatch[1];
    const attributeNameStart = lineStart + beforeAttribute.length - attributeName.length;
    const openQuoteIndex = equalsQuote + 1;
    const parsed = readDoubleQuotedContent(text, openQuoteIndex);
    if (!parsed) {
      searchFrom = equalsQuote + 2;
      continue;
    }

    const { content, closeIndex } = parsed;
    if (!isHtmlSlotValue(content)) {
      searchFrom = closeIndex + 1;
      continue;
    }

    const lineIndent = beforeAttribute.match(/^(\s*)/)?.[1] ?? "";
    const contentBeforeAttribute = text.slice(lineStart, attributeNameStart);
    const beforeTrimmed = contentBeforeAttribute.trim();
    const attributeIndent =
      beforeTrimmed.length > 0 && /[\w-]+\s*=/.test(beforeTrimmed)
        ? lineIndent + INDENT
        : lineIndent;
    const innerIndent = attributeIndent + INDENT;
    const formattedContent = `${formatInnerSlotContent(content, innerIndent)}${attributeIndent}`;

    // Idempotency guard: if the slot value is already in canonical form, skip it.
    // Reachable because isHtmlSlotValue trims before its "<" check, so a value
    // like "\n  <p>Hi</p>\n" passes the HTML gate AND can equal formattedContent.
    if (content === formattedContent) {
      searchFrom = closeIndex + 1;
      continue;
    }

    let prefix = "";
    if (contentBeforeAttribute.trim().length > 0 && !contentBeforeAttribute.endsWith("\n")) {
      prefix = `\n${attributeIndent}`;
    }

    replacements.push({
      start: attributeNameStart,
      end: closeIndex + 1,
      replacement: `${prefix}${attributeName}="${formattedContent}"`,
    });
    searchFrom = closeIndex + 1;
  }

  replacements.sort((left, right) => right.start - left.start);
  let result = text;
  for (const { start, end, replacement } of replacements) {
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return result;
}
