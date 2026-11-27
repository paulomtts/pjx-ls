import { defHeaderRange, scan, type Attribute, type Range, type Region, type Scan, type Tag } from "./regions.ts";
import { isHtmlSlotValue } from "./slots.ts";

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
  /** Whether two or more line breaks (a blank line) precede this token in the source. */
  blankBefore: boolean;
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

/** Whether the whitespace before `start` holds two or more line breaks. */
function blankLineBefore(text: string, start: number): boolean {
  let breaks = 0;
  for (let i = start - 1; i >= 0 && /\s/.test(text[i]); i -= 1) if (text[i] === "\n") breaks += 1;
  return breaks >= 2;
}

/** `complete` is false when something is never closed, or a tag and a `{% raw %}` region overlap. */
function tokenize(text: string, s: Scan = scan(text)): { tokens: Token[]; complete: boolean } {
  const tokens: Token[] = [];
  const all = s.unterminated ? null : atoms(s);
  if (!all) return { tokens, complete: false };
  const header = defHeaderRange(text, s);
  const python = s.blocks.find((b) => b.keyword === "python");
  const add = (start: number, token: Omit<Token, "spaceBefore" | "newlineBefore" | "blankBefore">): void => {
    let back = start;
    while (back > 0 && /\s/.test(text[back - 1]) && text[back - 1] !== "\n") back -= 1;
    tokens.push({
      ...token,
      spaceBefore: start === 0 || /\s/.test(text[start - 1]),
      newlineBefore: back > 0 && text[back - 1] === "\n",
      blankBefore: blankLineBefore(text, start),
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

/** A run of a tag's inside with no whitespace outside attribute values and Jinja; `attribute` when it is exactly one. */
interface Piece extends Range {
  attribute?: Attribute;
}

/** The value of an attribute written `name="value"` (spaces around `=` allowed, nothing else between); null for any other form. */
function doubleQuoted(text: string, attribute: Attribute): string | null {
  const value = attribute.value;
  if (!value || text[value.start - 1] !== '"' || text[value.end] !== '"') return null;
  if (!/^\s*=\s*$/.test(text.slice(attribute.nameRange.end, value.start - 1))) return null;
  return text.slice(value.start, value.end);
}

function attributeEnd(text: string, attribute: Attribute): number {
  if (!attribute.value) return attribute.nameRange.end;
  const quoted = text[attribute.value.start - 1] === '"' || text[attribute.value.start - 1] === "'";
  return Math.min(text.length, attribute.value.end + (quoted ? 1 : 0));
}

function pieces(text: string, tag: Tag, regions: Region[]): Piece[] {
  const end = tag.range.end - (tag.selfClosing ? 2 : 1);
  const spans: (Range & { attribute?: Attribute })[] = [
    ...tag.attributes.map((attribute) => ({ start: attribute.nameRange.start, end: attributeEnd(text, attribute), attribute })),
    ...regions.filter((r) => r.start >= tag.nameRange.end && r.end <= end),
  ].sort((a, b) => a.start - b.start);
  const found: Piece[] = [];
  let p = tag.nameRange.end;
  while (p < end) {
    if (/\s/.test(text[p])) {
      p += 1;
      continue;
    }
    const start = p;
    let only: Piece["attribute"];
    let count = 0;
    while (p < end && !/\s/.test(text[p])) {
      const span = spans.find((s) => s.start === p);
      if (span && span.end > p) {
        only = span.attribute;
        count += 1;
        p = Math.min(span.end, end);
      } else {
        count += 2;
        p += 1;
      }
    }
    found.push({ start, end: p, attribute: count === 1 ? only : undefined });
  }
  return found;
}

const isSlot = (value: string | null): value is string => value !== null && isHtmlSlotValue(value);

const tagHasSlot = (text: string, tag: Tag): boolean => tag.attributes.some((a) => isSlot(doubleQuoted(text, a)));

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
function renderExplodedTag(text: string, tag: Tag, regions: Region[], baseIndent: string): string {
  const attrIndent = baseIndent + INDENT;
  const lines: string[] = [`${baseIndent}<${tag.name}`];

  for (const piece of pieces(text, tag, regions)) {
    // Glued to the name, it is part of the name (`<h{{ level }}`).
    if (piece.start === tag.nameRange.end) {
      lines[0] += text.slice(piece.start, piece.end);
      continue;
    }
    const value = piece.attribute ? doubleQuoted(text, piece.attribute) : null;
    if (isSlot(value) && canReindent(value)) {
      lines.push(`${attrIndent}${piece.attribute!.name}="`);
      const formatted = formatPyjinhxTemplate(value).replace(/\n+$/, "");
      for (const line of formatted.split("\n")) {
        lines.push(line.trim().length ? attrIndent + INDENT + line : "");
      }
      lines.push(`${attrIndent}"`);
    } else if (value !== null) {
      lines.push(`${attrIndent}${piece.attribute!.name}="${value}"`);
    } else {
      lines.push(attrIndent + text.slice(piece.start, piece.end));
    }
  }

  lines.push(baseIndent + (tag.selfClosing ? "/>" : ">"));
  return lines.join("\n");
}

// ── Structural re-indentation ──────────────────────────────────────────────

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
  // A blank line is kept between siblings, never first or last in its parent.
  const startsScope = (token: Token | undefined): boolean => {
    if (token?.type === "open") return true;
    const kind = token?.type === "jinja" ? jinjaTag(token.value)?.kind : undefined;
    return kind === "open" || kind === "mid";
  };
  const endsScope = (token: Token): boolean => {
    const kind = token.type === "jinja" ? jinjaTag(token.value)?.kind : undefined;
    return token.type === "close" || kind === "close" || kind === "mid";
  };
  const emit = (index: number, line: string): void => {
    const glued =
      !tokens[index].spaceBefore &&
      lines.length > 0 &&
      lines[lines.length - 1] !== "" &&
      !isBlockTag(tokens[index]) && !isBlockTag(tokens[index - 1]);
    if (glued) {
      lines[lines.length - 1] += line.trimStart();
    } else {
      const blank = tokens[index].blankBefore && lines.length > 0 && lines[lines.length - 1] !== "";
      if (blank && !startsScope(tokens[index - 1]) && !endsScope(tokens[index])) lines.push("");
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
      if (tagHasSlot(text, token.tag!) && !touchesText(tokens, index)) {
        emit(index, renderExplodedTag(text, token.tag!, s.regions, baseIndent));
      } else {
        emit(index, baseIndent + token.value.trim());
      }
      continue;
    }

    if (token.type === "open") {
      if (tagHasSlot(text, token.tag!) && !touchesText(tokens, index)) {
        emit(index, renderExplodedTag(text, token.tag!, s.regions, baseIndent));
        depth += 1;
        continue;
      }

      const inlineElement = tryInlineElement(tokens, index);
      if (inlineElement) {
        emit(index, baseIndent + inlineElement.value.trim());
        index = inlineElement.endIndex;
        continue;
      }

      // A tag written over several lines keeps its other lines, `>` included, as written.
      const [first, ...rest] = token.value.trim().split("\n");
      emit(index, [baseIndent + first.trimStart(), ...rest].join("\n"));
      depth += 1;
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
