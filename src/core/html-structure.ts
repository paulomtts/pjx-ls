import { INDENT } from "../config.ts";
import { isHtmlSlotValue, readDoubleQuotedContent } from "./slots.ts";

const JINJA_BLOCK_OPEN = /^\{%\s*(?:if|for|macro|block|filter|raw)\b/;
const JINJA_BLOCK_MID = /^\{%\s*(?:elif|else)\b/;
const JINJA_BLOCK_CLOSE = /^\{%\s*end(?:if|for|macro|block|filter|raw)\b/;
const DEF_HEADER = /^\{#-?\s*def\b/;

type TokenType = "jinja" | "jinja_expr" | "open" | "close" | "self_close" | "text";

export interface Token {
  type: TokenType;
  value: string;
  name?: string;
}

interface Parsed {
  value: string;
  endIndex: number;
}

function readQuotedString(text: string, startIndex: number, quote: string): Parsed | null {
  let index = startIndex + 1;
  let value = quote;
  while (index < text.length) {
    const character = text[index];
    value += character;
    if (character === quote) {
      return { value, endIndex: index };
    }
    if (character === "{" && text[index + 1] === "{") {
      index += 2;
      while (index < text.length - 1 && !(text[index] === "}" && text[index + 1] === "}")) {
        value += text[index];
        index += 1;
      }
      if (index < text.length) {
        value += text[index];
        index += 1;
      }
      if (index < text.length) {
        value += text[index];
      }
      index += 1;
      continue;
    }
    index += 1;
  }
  return null;
}

function readTag(text: string, startIndex: number): Parsed | null {
  let index = startIndex + 1;
  let value = "<";
  while (index < text.length) {
    const character = text[index];
    value += character;
    if (character === '"') {
      const parsed = readQuotedString(text, index, '"');
      if (!parsed) {
        return null;
      }
      value = text.slice(startIndex, parsed.endIndex + 1);
      index = parsed.endIndex + 1;
      continue;
    }
    if (character === "'") {
      const parsed = readQuotedString(text, index, "'");
      if (!parsed) {
        return null;
      }
      value = text.slice(startIndex, parsed.endIndex + 1);
      index = parsed.endIndex + 1;
      continue;
    }
    if (character === ">") {
      return { value, endIndex: index };
    }
    index += 1;
  }
  return null;
}

function readJinja(text: string, startIndex: number, marker: string, endMarker: string): Parsed | null {
  const endIndex = text.indexOf(endMarker, startIndex + marker.length);
  if (endIndex === -1) {
    return null;
  }
  return {
    value: text.slice(startIndex, endIndex + endMarker.length),
    endIndex: endIndex + endMarker.length - 1,
  };
}

function tagName(tagValue: string): string {
  const match = tagValue.match(/^<\/?\s*([A-Za-z][A-Za-z0-9]*)/);
  return match ? match[1] : "";
}

export function tokenizeHtmlTemplate(text: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < text.length) {
    const character = text[index];

    if (character === "{" && text[index + 1] === "#") {
      const parsed = readJinja(text, index, "{#", "#}");
      if (!parsed) break;
      tokens.push({ type: "jinja", value: parsed.value });
      index = parsed.endIndex + 1;
      continue;
    }
    if (character === "{" && text[index + 1] === "%") {
      const parsed = readJinja(text, index, "{%", "%}");
      if (!parsed) break;
      tokens.push({ type: "jinja", value: parsed.value });
      index = parsed.endIndex + 1;
      continue;
    }
    if (character === "{" && text[index + 1] === "{") {
      const parsed = readJinja(text, index, "{{", "}}");
      if (!parsed) break;
      tokens.push({ type: "jinja_expr", value: parsed.value });
      index = parsed.endIndex + 1;
      continue;
    }
    if (character === "<") {
      const parsed = readTag(text, index);
      if (!parsed) break;
      const tagValue = parsed.value.trim();
      if (tagValue.startsWith("</")) {
        tokens.push({ type: "close", value: tagValue, name: tagName(tagValue) });
      } else if (tagValue.endsWith("/>")) {
        tokens.push({ type: "self_close", value: tagValue, name: tagName(tagValue) });
      } else {
        tokens.push({ type: "open", value: tagValue, name: tagName(tagValue) });
      }
      index = parsed.endIndex + 1;
      continue;
    }
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    const textStart = index;
    while (index < text.length) {
      const nextCharacter = text[index];
      if (nextCharacter === "<") break;
      if (
        nextCharacter === "{" &&
        (text[index + 1] === "#" || text[index + 1] === "%" || text[index + 1] === "{")
      ) {
        break;
      }
      index += 1;
    }
    if (index > textStart) {
      const textValue = text.slice(textStart, index).trim();
      if (textValue.length > 0) {
        tokens.push({ type: "text", value: textValue });
      }
      continue;
    }
    index += 1;
  }

  return tokens;
}

// ── Tag attribute parsing & slot-aware rendering ───────────────────────────

interface TagAttr {
  name: string;
  /** null for a valueless/bare attribute (e.g. `disabled`). */
  value: string | null;
}

interface ParsedTag {
  name: string;
  attrs: TagAttr[];
  selfClose: boolean;
}

/** Parse an opening or self-closing tag into its name and attributes. */
function parseTag(tagValue: string): ParsedTag {
  const trimmed = tagValue.trim();
  const selfClose = trimmed.endsWith("/>");
  const inner = trimmed.slice(1, selfClose ? -2 : -1);

  const nameMatch = inner.match(/^\s*([A-Za-z][\w:-]*)/);
  const name = nameMatch ? nameMatch[1] : "";
  let index = nameMatch ? nameMatch[0].length : 0;
  const attrs: TagAttr[] = [];

  while (index < inner.length) {
    while (index < inner.length && /\s/.test(inner[index])) index += 1;
    if (index >= inner.length) break;

    const rest = inner.slice(index);
    const quoted = rest.match(/^([\w:@.-]+)\s*=\s*"/);
    if (quoted) {
      const openQuoteIndex = index + quoted[0].length - 1;
      const parsed = readDoubleQuotedContent(inner, openQuoteIndex);
      if (!parsed) break;
      attrs.push({ name: quoted[1], value: parsed.content });
      index = parsed.closeIndex + 1;
      continue;
    }

    const bare = rest.match(/^([^\s]+)/);
    if (!bare) break;
    attrs.push({ name: bare[1], value: null });
    index += bare[0].length;
  }

  return { name, attrs, selfClose };
}

function tagHasSlot(parsed: ParsedTag): boolean {
  return parsed.attrs.some((attr) => attr.value !== null && isHtmlSlotValue(attr.value));
}

/**
 * Render a slotted tag in "exploded" form: tag name alone, each attribute on its
 * own indented line, slot values recursively formatted, and the closing
 * `>` / `/>` on its own line at the tag's indent.
 */
function renderExplodedTag(parsed: ParsedTag, baseIndent: string): string {
  const attrIndent = baseIndent + INDENT;
  const lines: string[] = [`${baseIndent}<${parsed.name}`];

  for (const attr of parsed.attrs) {
    if (attr.value === null) {
      lines.push(attrIndent + attr.name);
      continue;
    }
    if (isHtmlSlotValue(attr.value)) {
      lines.push(`${attrIndent}${attr.name}="`);
      const formatted = formatHtmlStructure(attr.value).replace(/\n+$/, "");
      for (const line of formatted.split("\n")) {
        lines.push(line.trim().length ? attrIndent + INDENT + line : "");
      }
      lines.push(`${attrIndent}"`);
      continue;
    }
    lines.push(`${attrIndent}${attr.name}="${attr.value}"`);
  }

  lines.push(baseIndent + (parsed.selfClose ? "/>" : ">"));
  return lines.join("\n");
}

// ── Structural re-indentation ──────────────────────────────────────────────

function jinjaDepthDelta(value: string): number {
  const trimmed = value.trim();
  if (JINJA_BLOCK_CLOSE.test(trimmed)) return -1;
  if (JINJA_BLOCK_OPEN.test(trimmed)) return 1;
  if (JINJA_BLOCK_MID.test(trimmed)) return 0;
  return 0;
}

function hasElementChildren(tokens: Token[], startIndex: number): boolean {
  let depth = 0;
  for (let index = startIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "jinja") {
      depth += jinjaDepthDelta(token.value);
      continue;
    }
    if (token.type === "open") return true;
    if (token.type === "self_close") continue;
    if (token.type === "close") return false;
  }
  return false;
}

function tryInlineElement(tokens: Token[], startIndex: number): { endIndex: number; value: string } | null {
  const openToken = tokens[startIndex];
  if (openToken.type !== "open") return null;

  let inner = "";
  for (let index = startIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "close" && token.name === openToken.name) {
      return { endIndex: index, value: `${openToken.value}${inner}${token.value}` };
    }
    if (token.type === "text" || token.type === "jinja_expr") {
      inner += token.value;
      continue;
    }
    return null;
  }
  return null;
}

export function formatHtmlStructure(text: string): string {
  const tokens = tokenizeHtmlTemplate(text);
  if (tokens.length === 0) {
    return text;
  }

  const lines: string[] = [];
  let depth = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const baseIndent = INDENT.repeat(depth);

    if (token.type === "jinja") {
      const trimmed = token.value.trim();
      if (JINJA_BLOCK_CLOSE.test(trimmed)) {
        depth = Math.max(0, depth - 1);
        lines.push(INDENT.repeat(depth) + trimmed);
        continue;
      }
      if (JINJA_BLOCK_MID.test(trimmed)) {
        depth = Math.max(0, depth - 1);
        lines.push(INDENT.repeat(depth) + trimmed);
        depth += 1;
        continue;
      }
      if (JINJA_BLOCK_OPEN.test(trimmed)) {
        lines.push(INDENT.repeat(depth) + trimmed);
        depth += 1;
        continue;
      }
      lines.push(INDENT.repeat(depth) + trimmed);
      // A {#def … #} header is always separated from the rest of the file by a
      // blank line (a trailing one is removed by the final trimEnd()).
      if (DEF_HEADER.test(trimmed)) {
        lines.push("");
      }
      continue;
    }

    if (token.type === "jinja_expr" || token.type === "text") {
      lines.push(baseIndent + token.value.trim());
      continue;
    }

    if (token.type === "close") {
      depth = Math.max(0, depth - 1);
      lines.push(INDENT.repeat(depth) + token.value.trim());
      continue;
    }

    if (token.type === "self_close") {
      const parsed = parseTag(token.value);
      if (tagHasSlot(parsed)) {
        lines.push(renderExplodedTag(parsed, baseIndent));
      } else {
        lines.push(baseIndent + token.value.trim());
      }
      continue;
    }

    if (token.type === "open") {
      const parsed = parseTag(token.value);
      if (tagHasSlot(parsed)) {
        lines.push(renderExplodedTag(parsed, baseIndent));
        depth += 1;
        continue;
      }

      const inlineElement = tryInlineElement(tokens, index);
      if (inlineElement) {
        lines.push(baseIndent + inlineElement.value.trim());
        index = inlineElement.endIndex;
        continue;
      }

      const childElements = hasElementChildren(tokens, index);
      let tagText = token.value.trim();
      let trailingBracket = "";

      if (childElements && tagText.endsWith(">") && !tagText.endsWith("/>")) {
        tagText = tagText.slice(0, -1).trimEnd();
        trailingBracket = ">";
      }

      if (tagText.includes("\n")) {
        const parts = tagText.split("\n");
        const firstLine = baseIndent + parts[0].trimStart();
        const rest = parts.slice(1).join("\n");
        lines.push(rest ? `${firstLine}\n${rest}` : firstLine);
        if (trailingBracket) {
          lines.push(baseIndent + trailingBracket);
        }
      } else {
        lines.push(baseIndent + tagText + trailingBracket);
      }
      depth += 1;
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
