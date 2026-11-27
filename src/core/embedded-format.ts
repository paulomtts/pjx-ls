import { INDENT } from "./format.ts";
import { scan as scanText, type Range, type Scan } from "./regions.ts";

export type Kind = "css" | "js";

export interface Body {
  kind: Kind;
  /** What is replaced: a block's lines up to the whitespace before `#}`; an element's text between its tags. */
  range: Range;
  /** Where the element's open tag starts; null for a block. */
  tagStart: number | null;
  /** 1-based line of the opener or the open tag, for the output channel. */
  line: number;
  /** Why this body is not formatted; null when it is. */
  skip: string | null;
}

const BLANK = /^\s*$/;
const SCRIPT_TYPES = new Set(["", "module", "text/javascript", "application/javascript"]);

const lineOf = (text: string, offset: number) => text.slice(0, offset).split("\n").length;

/** The css and js bodies of `text` (LF line endings), in document order. */
export function embeddedBodies(text: string, scan: Scan = scanText(text)): Body[] {
  const bodies: Body[] = [];
  for (const block of scan.blocks) {
    if ((block.keyword !== "css" && block.keyword !== "js") || block.bodyLines === null) continue;
    const body = text.slice(block.body.start, block.body.end);
    if (BLANK.test(body)) continue;
    const end = block.body.end - (/[ \t]*$/.exec(body)?.[0].length ?? 0);
    bodies.push({ kind: block.keyword, range: { start: block.body.start, end }, tagStart: null, line: block.openLine, skip: null });
  }
  for (const element of scan.embedded) {
    const body = text.slice(element.body.start, element.body.end);
    if (!body.includes("\n") || BLANK.test(body)) continue;
    const tag = scan.tags.find((t) => t.range.end === element.body.start);
    if (!tag) continue;
    const attribute = (name: string) => {
      const found = tag.attributes.find((a) => a.name.toLowerCase() === name);
      return found === undefined ? undefined : found.value ? text.slice(found.value.start, found.value.end) : "";
    };
    const type = attribute("type")?.trim().toLowerCase();
    if (element.tag === "script" ? !SCRIPT_TYPES.has(type ?? "") : (type !== undefined && type !== "text/css") || attribute("lang") !== undefined) continue;
    const jinja = scan.regions.some((r) => r.start < element.body.end && r.end > element.body.start);
    bodies.push({
      kind: element.tag === "style" ? "css" : "js",
      range: element.body,
      tagStart: tag.range.start,
      line: lineOf(text, tag.range.start),
      // With no close tag the body runs to the end of the text, over the markup after it.
      skip: jinja ? "it holds Jinja" : element.body.end === text.length ? "it has no close tag" : null,
    });
  }
  return bodies.sort((a, b) => a.range.start - b.range.start);
}

/** Formats a stylesheet or script that starts in column 0 and whose lines end in `\n`; null means "leave it as it is". */
export type FormatSource = (source: string) => Promise<string | null>;

/** A kind with no formatter is not touched and not reported. */
export type Formatters = Partial<Record<Kind, FormatSource>>;

export interface Edit extends Range {
  newText: string;
}

/** `text` with `edits` applied; the edits are offsets into `text` and do not overlap. */
export function applyEdits(text: string, edits: Edit[]): string {
  let result = "";
  let at = 0;
  for (const edit of [...edits].sort((a, b) => a.start - b.start || a.end - b.end)) {
    result += text.slice(at, edit.start) + edit.newText;
    at = edit.end;
  }
  return result + text.slice(at);
}

const LEADING_BLANK_LINES = /^(?:[ \t]*\n)+/;

const trimBody = (body: string) => body.replace(LEADING_BLANK_LINES, "").trimEnd();

function commonPrefix(lines: string[]): string {
  let prefix: string | null = null;
  for (const line of lines) {
    if (line.trim() === "") continue;
    const own = /^[ \t]*/.exec(line)![0];
    if (prefix === null) prefix = own;
    else {
      let i = 0;
      while (i < prefix.length && prefix[i] === own[i]) i++;
      prefix = prefix.slice(0, i);
    }
  }
  return prefix ?? "";
}

// Whitespace moved into a multi-line template literal or a backslash-continued string is data.
const spansLines = (lines: string[], kind: Kind) =>
  lines.some((l) => l.endsWith("\\") || (kind === "js" && (l.match(/(?<!\\)`/g)?.length ?? 0) % 2 === 1));

/** The formatted lines of one body, or null when it is left as it is (and why, in the log). */
async function formatBody(text: string, body: Body, format: FormatSource, log: (line: string) => void): Promise<string[] | null> {
  const keep = (why: string) => {
    log(`${body.kind} body (line ${body.line}): ${why}; left as it is`);
    return null;
  };
  if (body.skip) return keep(body.skip);
  const lines = trimBody(text.slice(body.range.start, body.range.end)).split("\n");
  const prefix = commonPrefix(lines);
  if ((prefix !== "" || body.tagStart !== null) && spansLines(lines, body.kind)) return keep("a string spans lines");
  // A blank line shorter than the prefix becomes empty; an unshifted body is sent as it is (a blank line may be in a string).
  const sent = lines.map((l) => (l.startsWith(prefix) ? l.slice(prefix.length) : "")).join("\n") + "\n";
  let answer: string | null;
  try {
    answer = await format(sent);
  } catch (error) {
    return keep(`the formatter failed: ${error instanceof Error ? error.message : error}`);
  }
  if (answer === null) return null;
  const out = trimBody(answer.replaceAll("\r\n", "\n"));
  if (out === "") return keep("the formatter answered nothing");
  if (body.tagStart === null ? out.includes("#}") : /<\/(?:style|script)/i.test(out) || /\{[{%#]/.test(out)) {
    return keep("the answer holds a delimiter that would end or change the body");
  }
  return out.split("\n");
}

/**
 * `text` with the body of every css and js block and element replaced by what its
 * formatter answers, laid out for its place. Returns `text` itself when nothing changes.
 */
export async function formatEmbedded(text: string, formatters: Formatters, log: (line: string) => void = () => {}): Promise<string> {
  if (!formatters.css && !formatters.js) return text;
  if (text.includes("\r\n")) {
    if (/(?<!\r)\n/.test(text)) return text;
    const lf = text.replaceAll("\r\n", "\n");
    const result = await formatEmbedded(lf, formatters, log);
    return result === lf ? text : result.replaceAll("\n", "\r\n");
  }
  const s = scanText(text);
  if (s.error) return text;
  const bodies = embeddedBodies(text, s).filter((b) => formatters[b.kind]);
  const answers = await Promise.all(bodies.map((b) => formatBody(text, b, formatters[b.kind]!, log)));
  let result = "";
  let at = 0;
  bodies.forEach((body, i) => {
    const lines = answers[i];
    result += text.slice(at, body.range.start);
    at = body.range.end;
    if (lines === null) {
      result += text.slice(body.range.start, body.range.end);
    } else if (body.tagStart === null) {
      result += lines.join("\n") + "\n";
    } else {
      const tagAt = result.length - (body.range.start - body.tagStart);
      const indent = /^[ \t]*/.exec(result.slice(result.lastIndexOf("\n", tagAt - 1) + 1))![0];
      result += "\n" + lines.map((l) => (l ? indent + INDENT + l : "")).join("\n") + "\n" + indent;
    }
  });
  result += text.slice(at);
  return result === text ? text : result;
}
