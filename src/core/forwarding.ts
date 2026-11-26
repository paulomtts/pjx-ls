import type { Scan } from "./regions.ts";

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

const within = (start: number, end: number, offset: number) => start <= offset && offset <= end;

/** Whether the view has the source's own character at `offset`, so the HTML service may be asked. */
export function forwardable(text: string, scan: Scan, offset: number): boolean {
  if (scan.unclosedPython && offset >= scan.unclosedPython.start) return false;
  for (const b of scan.blocks) {
    if (b.keyword !== "css" && b.keyword !== "js") continue;
    if (within(b.body.start, b.closer.start, offset)) return true;
    const lineEnd = text.indexOf("\n", b.closer.end);
    if (within(b.opener.start, b.body.start, offset) || within(b.closer.start, lineEnd === -1 ? text.length : lineEnd, offset)) return false;
  }
  return !scan.regions.some((r) => (r.body ? !within(r.body.start, r.body.end, offset) && within(r.start, r.end, offset) : r.start <= offset && offset < r.end));
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
