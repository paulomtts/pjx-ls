import type { Range, Scan } from "./regions.ts";

export interface Position {
  line: number;
  character: number;
}
export interface LineRange {
  start: Position;
  end: Position;
}
/** A view line that holds a synthetic `<style>`/`<script>` tag from this column on. */
export interface Span {
  line: number;
  from: number;
}

export type Mode = "cursor" | "hover";

/**
 * Whether `offset` falls in `range`. A cursor sits between characters, so it is inside
 * only strictly between the ends; hover asks about the character to its right. A range
 * that stops at the end of the text with no closing delimiter also holds the cursor there.
 */
export function inside(range: Range, offset: number, mode: Mode, openEnded = false): boolean {
  if (mode === "hover") return range.start <= offset && (offset < range.end || (openEnded && offset === range.end));
  return range.start < offset && (offset < range.end || (openEnded && offset === range.end));
}

const CLOSERS = { expression: "}}", statement: "%}", comment: "#}" } as const;

function excludedRanges(text: string, scan: Scan): { range: Range; openEnded: boolean }[] {
  const excluded: { range: Range; openEnded: boolean }[] = [];
  const add = (range: Range, openEnded = false) => excluded.push({ range, openEnded });
  if (scan.unclosedPython) add({ start: scan.unclosedPython.start, end: text.length }, true);
  const blockStarts = new Set<number>();
  for (const b of scan.blocks) {
    if (b.keyword !== "css" && b.keyword !== "js") continue;
    blockStarts.add(b.opener.start);
    const lineEnd = text.indexOf("\n", b.closer.end);
    add({ start: b.opener.start, end: b.body.start });
    add({ start: b.closer.start, end: lineEnd === -1 ? text.length : lineEnd }, true);
  }
  for (const r of scan.regions) {
    if (blockStarts.has(r.start)) continue;
    if (r.body) {
      add({ start: r.start, end: r.body.start });
      add({ start: r.body.end, end: r.end });
    } else add(r, !text.slice(r.start, r.end).endsWith(CLOSERS[r.kind as keyof typeof CLOSERS]));
  }
  return excluded;
}

/** Whether the view has the source's own text at `offset`, so the HTML service may be asked. */
export function forwardable(text: string, scan: Scan, offset: number, mode: Mode = "cursor"): boolean {
  return !excludedRanges(text, scan).some(({ range, openEnded }) => inside(range, offset, mode, openEnded));
}

const lineAndColumn = (text: string, offset: number): Span => {
  const start = offset === 0 ? 0 : text.lastIndexOf("\n", offset - 1) + 1;
  return { line: text.slice(0, offset).split("\n").length - 1, from: offset - start };
};

export function syntheticSpans(text: string, scan: Scan): Span[] {
  return scan.blocks
    .filter((b) => b.keyword === "css" || b.keyword === "js")
    .flatMap((b) => [lineAndColumn(text, b.opener.start), lineAndColumn(text, b.closer.start)]);
}

/** Whether `range` covers any of the characters the view added or rewrote on a block's tag lines. */
export function touchesSynthetic(spans: Span[], range: LineRange): boolean {
  return spans.some(({ line, from }) => {
    if (range.start.line > line || range.end.line < line) return false;
    return !(range.end.line === line && range.end.character <= from);
  });
}
