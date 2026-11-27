import { defHeaderRange, scan, type Range, type Scan, type Tag } from "./regions.ts";
import { isHtmlSlotValue, readDoubleQuotedContent } from "./slots.ts";

export const INDENT = "  ";

const JINJA_TAG_NAME = /^\{%[-+]?\s*(\w+)/;
const INLINE_SET = /^\{%[-+]?\s*set\s+[\w\s,().]+=/;
const JINJA_BLOCKS = new Set(["if", "for", "macro", "block", "filter", "with", "call", "set"]);
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);

type TokenType = "opaque" | "jinja" | "jinja_expr" | "open" | "close" | "self_close" | "text";

interface Token {
  type: TokenType;
  value: string;
  name?: string;
  /** The scanner's tag, for an open or self-closing tag. */
  tag?: Tag;
  /** The `{#def` header, which a blank line follows. */
  header?: boolean;
  /** The `{#python` block, whose opener stays in column 0. */
  python?: boolean;
  /** Whether a line break precedes this token in the source. */
  newlineBefore: boolean;
  /** Whether whitespace (or the start of the text) precedes this token in the source. */
  spaceBefore: boolean;
}

interface JinjaTag {
  kind: "open" | "mid" | "close";
  name: string;
}

/** Classify a `{% … %}` tag; undefined for tags that do not affect nesting. */
function jinjaTag(value: string): JinjaTag | undefined {
  const name = JINJA_TAG_NAME.exec(value.trim())?.[1];
  if (!name) return undefined;
  if (name === "elif" || name === "else") return { kind: "mid", name };
  if (name.startsWith("end") && JINJA_BLOCKS.has(name.slice(3))) {
    return { kind: "close", name: name.slice(3) };
  }
  // `{% set x = 1 %}` is a statement; only the bare `{% set x %}` form opens a block.
  if (JINJA_BLOCKS.has(name) && !(name === "set" && INLINE_SET.test(value.trim()))) {
    return { kind: "open", name };
  }
  return undefined;
}

/** Elements kept byte for byte, with the scanner's script and style elements. */
const VERBATIM_ELEMENTS = new Set(["textarea", "pre"]);

interface Atom extends Range {
  type: TokenType;
  tag?: Tag;
}

const REGION_TOKEN = { expression: "jinja_expr", statement: "jinja", comment: "jinja", raw: "opaque" } as const;

/** The scanner's regions, comments and tags in document order; a verbatim element is one atom. Null when one has no close tag. */
function atoms(s: Scan): Atom[] | null {
  const found: Atom[] = [
    ...s.regions.map((r) => ({ start: r.start, end: r.end, type: REGION_TOKEN[r.kind] })),
    ...s.htmlComments.map((c) => ({ ...c, type: "opaque" as const })),
  ];
  const bodyEnd = new Map(s.embedded.map((e) => [e.body.start, e.body.end]));
  for (let i = 0; i < s.tags.length; i += 1) {
    const tag = s.tags[i];
    const name = tag.name.toLowerCase();
    if (tag.closing) {
      found.push({ ...tag.range, type: "close", tag });
    } else if (tag.selfClosing || VOID_ELEMENTS.has(name)) {
      found.push({ ...tag.range, type: "self_close", tag });
    } else if (bodyEnd.has(tag.range.end) || VERBATIM_ELEMENTS.has(name)) {
      // A script or style ends where the scanner ends its body; a pre or textarea at its next close tag.
      const end = bodyEnd.get(tag.range.end);
      const close = s.tags.findIndex(
        (t, j) => j > i && (end === undefined ? t.closing && t.name.toLowerCase() === name : t.range.start === end),
      );
      if (close === -1) return null;
      found.push({ start: tag.range.start, end: s.tags[close].range.end, type: "opaque" });
      i = close;
    } else {
      found.push({ ...tag.range, type: "open", tag });
    }
  }
  return found.sort((a, b) => a.start - b.start || b.end - a.end);
}

/** `complete` is false when something is never closed, or a tag and a `{% raw %}` region overlap. */
function tokenize(text: string, s: Scan = scan(text)): { tokens: Token[]; complete: boolean } {
  const tokens: Token[] = [];
  const all = s.unterminated ? null : atoms(s);
  if (!all) return { tokens, complete: false };
  const header = defHeaderRange(text, s);
  const python = s.blocks.find((b) => b.keyword === "python");
  const add = (start: number, token: Omit<Token, "spaceBefore" | "newlineBefore">): void => {
    let back = start;
    while (back > 0 && /\s/.test(text[back - 1]) && text[back - 1] !== "\n") back -= 1;
    tokens.push({
      ...token,
      spaceBefore: start === 0 || /\s/.test(text[start - 1]),
      newlineBefore: back > 0 && text[back - 1] === "\n",
    });
  };
  const addText = (start: number, end: number): void => {
    const gap = text.slice(start, end);
    const value = gap.trim();
    if (value) add(start + gap.length - gap.trimStart().length, { type: "text", value });
  };

  let at = 0;
  for (const atom of all) {
    // Inside the atom before it: Jinja in a tag, markup in a comment or a raw region.
    if (atom.start < at) {
      if (atom.end > at) return { tokens, complete: false };
      continue;
    }
    addText(at, atom.start);
    add(atom.start, {
      type: atom.type,
      value: text.slice(atom.start, atom.end),
      name: atom.tag?.name,
      tag: atom.tag,
      header: atom.start === header?.start,
      python: atom.start === python?.opener.start,
    });
    at = atom.end;
  }
  addText(at, text.length);
  return { tokens, complete: true };
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

  const nameMatch = inner.match(/^\s*([A-Za-z][\w:.-]*)/);
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
 * Re-indenting prefixes every line, so a slot value with a multi-line token
 * (comment, script, pre, css block...) would change its bytes: keep it verbatim.
 */
function canReindent(slotValue: string): boolean {
  const { tokens, complete } = tokenize(slotValue);
  return complete && isBalanced(tokens) && !tokens.some((token) => token.value.includes("\n"));
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
    if (isHtmlSlotValue(attr.value) && canReindent(attr.value)) {
      lines.push(`${attrIndent}${attr.name}="`);
      const formatted = formatPyjinhxTemplate(attr.value).replace(/\n+$/, "");
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

function hasElementChildren(tokens: Token[], startIndex: number): boolean {
  for (let index = startIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "open" || token.type === "opaque") return true;
    if (token.type === "self_close") continue;
    if (token.type === "close") return false;
  }
  return false;
}

function tryInlineElement(tokens: Token[], startIndex: number): { endIndex: number; value: string } | null {
  const openToken = tokens[startIndex];
  if (openToken.type !== "open") return null;

  // Edge whitespace inside a block-level element collapses; elsewhere it renders.
  const keepEdges = !isBlockTag(openToken);
  let inner = "";
  for (let index = startIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "close" && token.name === openToken.name) {
      const trailing = keepEdges && token.spaceBefore ? " " : "";
      return { endIndex: index, value: `${openToken.value}${inner}${trailing}${token.value}` };
    }
    if (token.type === "text" || token.type === "jinja_expr") {
      inner += (token.spaceBefore && (inner || keepEdges) ? " " : "") + token.value;
      continue;
    }
    return null;
  }
  return null;
}

const BLOCK_ELEMENTS = new Set([
  "html", "head", "body", "title", "meta", "link", "script", "style", "address", "article", "aside",
  "blockquote", "details", "dd", "div", "dl", "dt", "fieldset", "figure", "footer", "form", "h1",
  "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section",
  "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);

/** Whitespace next to a block-level tag collapses, so a line break there never renders. */
function isBlockTag(token: Token | undefined): boolean {
  if (!token) return true;
  const isTag = token.type === "open" || token.type === "close" || token.type === "self_close";
  return isTag && BLOCK_ELEMENTS.has(token.name?.toLowerCase() ?? "");
}

const isTextual = (token: Token | undefined) => token?.type === "text" || token?.type === "jinja_expr";

/**
 * Exploding a tag breaks the line before it, and after it when it is self-closing
 * (an open tag's content stays glued to its `>`): that shows next to glued text.
 */
function touchesText(tokens: Token[], index: number): boolean {
  const next = tokens[index + 1];
  const after = tokens[index].type === "self_close" && next && !next.spaceBefore && isTextual(next);
  return (!tokens[index].spaceBefore && isTextual(tokens[index - 1])) || Boolean(after);
}

/** True when every tag and Jinja block opens and closes in matching order. */
function isBalanced(tokens: Token[]): boolean {
  const stack: string[] = [];
  for (const token of tokens) {
    if (token.type === "open") {
      stack.push(`<${token.name?.toLowerCase()}`);
    } else if (token.type === "close") {
      if (stack.pop() !== `<${token.name?.toLowerCase()}`) return false;
    } else if (token.type === "jinja") {
      const tag = jinjaTag(token.value);
      if (tag?.kind === "open") stack.push(tag.name);
      if (tag?.kind === "close" && stack.pop() !== tag.name) return false;
      if (tag?.kind === "mid" && !["if", "for"].includes(stack[stack.length - 1])) return false;
    }
  }
  return stack.length === 0;
}

/** A `{#def` closer followed by more text on its line means the header was not what it seems. */
function hasTextAfterHeader(tokens: Token[]): boolean {
  return tokens.some(
    (token, index) =>
      token.header &&
      index + 1 < tokens.length &&
      !tokens[index + 1].newlineBefore,
  );
}

/**
 * Format a PyJinHx template: structural HTML/Jinja re-indentation with slot-aware
 * tag explosion (slotted component tags lay their attributes one-per-line and
 * recursively format their slot values).
 */
export function formatPyjinhxTemplate(text: string): string {
  if (!text.includes("\r\n")) return formatLf(text);
  // A file mixing CRLF and bare LF cannot be restored byte-for-byte.
  if (/(?<!\r)\n/.test(text)) return text;
  return formatLf(text.replaceAll("\r\n", "\n")).replaceAll("\n", "\r\n");
}

/** Format with `\n` line endings, restoring the document's own EOL afterwards. */
function formatLf(text: string): string {
  // Blank lines before a leading `{#` comment or header are the author's layout.
  const lead = /^(?:[ \t]*\n)+(?=[ \t]*\{#)/.exec(text)?.[0];
  if (lead) return lead + formatLf(text.slice(lead.length));
  const s = scan(text);
  // A block error: the Python and CSS/JS steps leave the text alone, and so does this one.
  if (s.error) return text;
  const { tokens, complete } = tokenize(text, s);
  if (tokens.length === 0 || !complete || !isBalanced(tokens) || hasTextAfterHeader(tokens)) {
    return text;
  }

  const lines: string[] = [];
  let depth = 0;

  // A token with no whitespace before it joins the previous line unless one side
  // is a block-level tag: a new line between other neighbours would add a space
  // to the rendered output.
  const emit = (index: number, line: string): void => {
    const glued =
      !tokens[index].spaceBefore &&
      lines.length > 0 &&
      lines[lines.length - 1] !== "" &&
      !isBlockTag(tokens[index]) && !isBlockTag(tokens[index - 1]);
    if (glued) {
      lines[lines.length - 1] += line.trimStart();
    } else {
      lines.push(line);
    }
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const baseIndent = INDENT.repeat(depth);

    if (token.type === "opaque") {
      emit(index, baseIndent + token.value);
      continue;
    }

    if (token.type === "jinja") {
      const trimmed = token.value.trim();
      const kind = jinjaTag(trimmed)?.kind;
      const level = kind === "close" || kind === "mid" ? Math.max(0, depth - 1) : depth;
      emit(index, (token.python ? "" : INDENT.repeat(level)) + trimmed);
      if (kind === "open") depth += 1;
      if (kind === "close") depth = level;
      // A {#def … #} header is always separated from the rest of the file by a
      // blank line (a trailing one is removed by the final trimEnd()).
      if (token.header) {
        lines.push("");
      }
      continue;
    }

    if (token.type === "jinja_expr" || token.type === "text") {
      emit(index, baseIndent + token.value.trim());
      continue;
    }

    if (token.type === "close") {
      depth = Math.max(0, depth - 1);
      emit(index, INDENT.repeat(depth) + token.value.trim());
      continue;
    }

    if (token.type === "self_close") {
      const parsed = parseTag(token.value);
      if (tagHasSlot(parsed) && !touchesText(tokens, index)) {
        emit(index, renderExplodedTag(parsed, baseIndent));
      } else {
        emit(index, baseIndent + token.value.trim());
      }
      continue;
    }

    if (token.type === "open") {
      const parsed = parseTag(token.value);
      if (tagHasSlot(parsed) && !touchesText(tokens, index)) {
        emit(index, renderExplodedTag(parsed, baseIndent));
        depth += 1;
        continue;
      }

      const inlineElement = tryInlineElement(tokens, index);
      if (inlineElement) {
        emit(index, baseIndent + inlineElement.value.trim());
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
        emit(index, rest ? `${firstLine}\n${rest}` : firstLine);
        if (trailingBracket) {
          lines.push(baseIndent + trailingBracket);
        }
      } else {
        emit(index, baseIndent + tagText + trailingBracket);
      }
      depth += 1;
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
