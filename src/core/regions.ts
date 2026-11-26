/**
 * One pass over a .pjx document: its Jinja regions, its inline blocks and the
 * first block error (as pyjinhx reports them), and its HTML tags, comments and
 * script/style bodies. Ranges are offsets into the text given, which is never
 * altered: a byte order mark and CRs stay where they are.
 */

export interface Range {
  start: number;
  end: number;
}

export interface Region extends Range {
  kind: "expression" | "statement" | "comment" | "raw";
  /** A raw region's text between `{% raw %}` and `{% endraw %}`. */
  body?: Range;
}

export interface Attribute {
  name: string;
  nameRange: Range;
  /** The text between the quotes, or the unquoted value; null for a bare attribute. */
  value: Range | null;
}

export interface Tag {
  name: string;
  /** A PascalCase name, which pyjinhx resolves to a component. */
  component: boolean;
  closing: boolean;
  selfClosing: boolean;
  range: Range;
  nameRange: Range;
  attributes: Attribute[];
}

export interface Embedded {
  tag: "script" | "style";
  body: Range;
}

export type BlockKeyword = "def" | "css" | "js" | "python";

export interface Block {
  keyword: BlockKeyword;
  /** `{#` and the keyword. */
  opener: Range;
  /** After the opener's line up to the closer; for `def`, the signature. */
  body: Range;
  /** The `#}`. */
  closer: Range;
  /** 1-based lines, as the conformance corpus records them. */
  openLine: number;
  bodyLines: [number, number] | null;
  closeLine: number;
}

export interface BlockError {
  code:
    | "python-block-early-close"
    | "second-block"
    | "text-after-closer"
    | "closer-not-at-line-start"
    | "unclosed-block"
    | "stray-comment-close";
  line: number;
}

export interface Scan {
  /** Empty when `error` is set, as in the corpus. */
  blocks: Block[];
  error: BlockError | null;
  regions: Region[];
  htmlComments: Range[];
  embedded: Embedded[];
  tags: Tag[];
}

// Jinja's lexer reads left to right, so a `{#` is a comment only outside raw
// regions and `{{ }}` / `{% %}` tags, whose strings may hold any delimiter.
// This is pyjinhx's own expression (pyjinhx/sfc.py), so both agree on where
// comments are; an unclosed delimiter swallows the rest of the text.
const STRING = String.raw`'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"`;
const LEXEME = new RegExp(
  [
    String.raw`(?<raw>\{%[-+]?\s*raw\s*[-+]?%\}.*?\{%[-+]?\s*endraw\s*[-+]?%\})`,
    String.raw`(?<rawOpen>\{%[-+]?\s*raw\s*[-+]?%\}.*)`,
    String.raw`(?<expression>\{\{(?:${STRING}|[^'"])*?\}\})`,
    String.raw`(?<statement>\{%(?:${STRING}|[^'"])*?%\})`,
    String.raw`\{#(?<comment>.*?)#\}`,
    String.raw`(?<unclosed>\{#python[ \t\r]*(?:\n|(?![\s\S])))`,
    String.raw`(?<swallow>\{[{%#].*)`,
  ].join("|"),
  "gs",
);
const RAW_OPEN = /^\{%[-+]?\s*raw\s*[-+]?%\}/;
const RAW_CLOSE = /\{%[-+]?\s*endraw\s*[-+]?%\}$/;
const PYTHON_OPENER = /python[ \t\r]*(?:\n|(?![\s\S]))/y;
const COMPONENT = /^[A-Z](?=[A-Za-z0-9]*[a-z])[A-Za-z0-9]*$/;

interface Lexeme {
  region: Region;
  /** The text of a closed comment. */
  comment: string | null;
  /** A `{#python` opener with no `#}` after it. */
  unclosedOpener: boolean;
}

export function scan(text: string): Scan {
  const base = text.startsWith("﻿") ? 1 : 0;
  const lexemes = lex(text, base);
  const regions = lexemes.map((l) => l.region);
  const { blocks, error } = findBlocks(text, base, lexemes);
  return { blocks, error, regions, ...scanHtml(maskRegions(text, regions)) };
}

function lex(text: string, base: number): Lexeme[] {
  const lexemes: Lexeme[] = [];
  LEXEME.lastIndex = base;
  for (let m = LEXEME.exec(text); m; m = LEXEME.exec(text)) {
    lexemes.push({
      region: regionOf(m),
      comment: m.groups!.comment ?? null,
      unclosedOpener: m.groups!.unclosed !== undefined,
    });
  }
  return lexemes;
}

function regionOf(m: RegExpExecArray): Region {
  const g = m.groups!;
  const range = { start: m.index, end: m.index + m[0].length };
  if (g.raw !== undefined || g.rawOpen !== undefined) {
    const closeLength = g.raw === undefined ? 0 : RAW_CLOSE.exec(m[0])![0].length;
    const body = { start: range.start + RAW_OPEN.exec(m[0])![0].length, end: range.end - closeLength };
    return { kind: "raw", ...range, body };
  }
  if (g.expression !== undefined) return { kind: "expression", ...range };
  if (g.statement !== undefined) return { kind: "statement", ...range };
  if (g.comment !== undefined || g.unclosed !== undefined) return { kind: "comment", ...range };
  return { kind: m[0][1] === "{" ? "expression" : m[0][1] === "%" ? "statement" : "comment", ...range };
}

const lineAt = (text: string, offset: number) => text.slice(0, offset).split("\n").length;
const lineStart = (text: string, offset: number) => (offset === 0 ? 0 : text.lastIndexOf("\n", offset - 1) + 1);

interface Found {
  block: Block | null;
  error: BlockError | null;
}

function findBlocks(text: string, base: number, lexemes: Lexeme[]): { blocks: Block[]; error: BlockError | null } {
  const found = [
    findBlock(text, lexemes, "def"),
    findBlock(text, lexemes, "css"),
    findBlock(text, lexemes, "js"),
    findPython(text, base, lexemes),
  ];
  const blocks = found.flatMap((f) => (f.block ? [f.block] : []));
  const errors = found.flatMap((f) => (f.error ? [f.error] : []));
  const stray = blocks.some((b) => b.keyword !== "def") ? strayCloser(text, lexemes) : null;
  if (stray) errors.push(stray);
  if (errors.length) return { blocks: [], error: errors.reduce((a, b) => (b.line < a.line ? b : a)) };
  return { blocks: blocks.sort((a, b) => a.openLine - b.openLine), error: null };
}

function makeBlock(text: string, keyword: BlockKeyword, region: Range): Block {
  const opener = { start: region.start, end: region.start + 2 + keyword.length };
  const closer = { start: region.end - 2, end: region.end };
  const bodyStart = keyword === "def" ? opener.end : text.indexOf("\n", region.start) + 1;
  const openLine = lineAt(text, region.start);
  const closeLine = lineAt(text, closer.start);
  const hasBody = keyword !== "def" && closeLine - openLine > 1;
  return {
    keyword,
    opener,
    body: { start: bodyStart, end: closer.start },
    closer,
    openLine,
    bodyLines: hasBody ? [openLine + 1, closeLine - 1] : null,
    closeLine,
  };
}

// `def` takes whitespace or nothing after it; css and js must end their line, so a
// one-line prose comment such as `{#js hack #}` stays a comment.
function opens(comment: string, keyword: BlockKeyword): boolean {
  if (!comment.startsWith(keyword)) return false;
  const rest = comment.slice(keyword.length);
  return keyword === "def" ? rest === "" || /^\s/.test(rest) : /^[ \t\r]*\n/.test(rest);
}

function findBlock(text: string, lexemes: Lexeme[], keyword: "def" | "css" | "js"): Found {
  let block: Block | null = null;
  let body = "";
  for (const { region, comment } of lexemes) {
    if (comment === null || !opens(comment, keyword)) continue;
    const line = lineAt(text, region.start);
    if (block) return { block: null, error: { code: "second-block", line } };
    block = makeBlock(text, keyword, region);
    body = comment.slice(keyword.length);
  }
  // An empty block counts as no block, but still as a first one.
  return { block: body.trim() ? block : null, error: null };
}

function findPython(text: string, base: number, lexemes: Lexeme[]): Found {
  let block: Block | null = null;
  for (const { region, comment, unclosedOpener } of lexemes) {
    if (comment === null && !unclosedOpener) continue;
    PYTHON_OPENER.lastIndex = region.start + 2;
    const inColumn0 = region.start === lineStart(text, region.start) || region.start === base;
    if (!inColumn0 || !PYTHON_OPENER.test(text)) continue;
    const line = lineAt(text, region.start);
    if (unclosedOpener) return fail("unclosed-block", line);
    if (block) return fail("second-block", line);
    const error = closerError(text, region);
    if (error) return fail(error.code, error.line);
    block = makeBlock(text, "python", region);
  }
  return { block, error: null };
}

const fail = (code: BlockError["code"], line: number): Found => ({ block: null, error: { code, line } });

// The first `#}` ends the comment whatever Python thinks of it, so it must be
// alone in column 0; `-#}` would make Jinja eat the line break after it.
function closerError(text: string, region: Range): BlockError | null {
  const close = region.end - 2;
  const before = text.slice(lineStart(text, close), close);
  if (before && ["", "-", "+"].includes(before.replace(/^[ \t]+|[ \t]+$/g, ""))) {
    return { code: "closer-not-at-line-start", line: lineAt(text, close) };
  }
  if (before) return { code: "python-block-early-close", line: lineAt(text, close) };
  const lineEnd = text.indexOf("\n", region.end);
  const after = text.slice(region.end, lineEnd === -1 ? text.length : lineEnd);
  return /[^ \t\r]/.test(after) ? { code: "text-after-closer", line: lineAt(text, region.end) } : null;
}

// A `#}` left once comments, tags and raw regions are removed.
function strayCloser(text: string, lexemes: Lexeme[]): BlockError | null {
  let stripped = "";
  let position = 0;
  for (const { region } of lexemes) {
    stripped += text.slice(position, region.start) + "\n".repeat(text.slice(region.start, region.end).split("\n").length - 1);
    position = region.end;
  }
  stripped += text.slice(position);
  const index = stripped.indexOf("#}");
  return index === -1 ? null : { code: "stray-comment-close", line: lineAt(stripped, index) };
}

// Same length and lines as `text`, with every Jinja region blanked except a raw
// region's body, which is markup like any other.
function maskRegions(text: string, regions: Region[]): string {
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  let masked = "";
  let position = 0;
  for (const r of regions) {
    const spans = r.body ? [[r.start, r.body.start], [r.body.end, r.end]] : [[r.start, r.end]];
    for (const [start, end] of spans) {
      masked += text.slice(position, start) + blank(text.slice(start, end));
      position = end;
    }
  }
  return masked + text.slice(position);
}

type Html = Pick<Scan, "htmlComments" | "embedded" | "tags">;

function scanHtml(text: string): Html {
  const html: Html = { htmlComments: [], embedded: [], tags: [] };
  for (let i = text.indexOf("<"); i !== -1; i = text.indexOf("<", i)) {
    if (text.startsWith("<!--", i)) {
      const close = text.indexOf("-->", i + 4);
      const end = close === -1 ? text.length : close + 3;
      html.htmlComments.push({ start: i, end });
      i = end;
    } else if (/^<[!?]/.test(text.slice(i, i + 2))) {
      const close = text.indexOf(">", i);
      i = close === -1 ? text.length : close + 1;
    } else {
      const tag = readTag(text, i);
      if (!tag) {
        i += 1;
        continue;
      }
      html.tags.push(tag);
      i = tag.range.end;
      const name = tag.name.toLowerCase();
      if (!tag.closing && !tag.selfClosing && (name === "script" || name === "style")) {
        const close = text.slice(i).search(new RegExp(`</${name}`, "i"));
        const end = close === -1 ? text.length : i + close;
        html.embedded.push({ tag: name, body: { start: i, end } });
        i = end;
      }
    }
  }
  return html;
}

const TAG_START = /<(\/?)([A-Za-z][\w.:-]*)/y;
const ATTRIBUTE_NAME = /[^\s"'<>/=]+/y;
const UNQUOTED = /[^\s>]+/y;

function readTag(text: string, start: number): Tag | null {
  TAG_START.lastIndex = start;
  const m = TAG_START.exec(text);
  if (!m) return null;
  const nameStart = start + 1 + m[1].length;
  const tag: Tag = {
    name: m[2],
    component: COMPONENT.test(m[2]),
    closing: m[1] === "/",
    selfClosing: false,
    range: { start, end: text.length },
    nameRange: { start: nameStart, end: nameStart + m[2].length },
    attributes: [],
  };
  const skipSpace = (p: number) => p + (/^\s*/.exec(text.slice(p))![0].length);
  let p = tag.nameRange.end;
  for (;;) {
    p = skipSpace(p);
    if (p >= text.length) return tag;
    if (text[p] === ">") break;
    if (text[p] === "/") {
      tag.selfClosing = text[p + 1] === ">";
      p += 1;
      continue;
    }
    ATTRIBUTE_NAME.lastIndex = p;
    const name = ATTRIBUTE_NAME.exec(text);
    if (!name) {
      p += 1;
      continue;
    }
    const attribute: Attribute = { name: name[0], nameRange: { start: p, end: p + name[0].length }, value: null };
    tag.attributes.push(attribute);
    p = skipSpace(attribute.nameRange.end);
    if (text[p] !== "=") continue;
    p = skipSpace(p + 1);
    if (text[p] === '"' || text[p] === "'") {
      const close = text.indexOf(text[p], p + 1);
      const end = close === -1 ? text.length : close;
      attribute.value = { start: p + 1, end };
      p = close === -1 ? end : end + 1;
    } else {
      UNQUOTED.lastIndex = p;
      const value = UNQUOTED.exec(text);
      if (value) attribute.value = { start: p, end: p + value[0].length };
      p += value ? value[0].length : 0;
    }
  }
  tag.range.end = p + 1;
  return tag;
}
