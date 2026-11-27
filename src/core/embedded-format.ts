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
      skip: jinja ? "it holds Jinja" : null,
    });
  }
  return bodies.sort((a, b) => a.range.start - b.range.start);
}
