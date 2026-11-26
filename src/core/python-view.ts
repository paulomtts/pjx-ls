import { scan as scanText, type Scan } from "./regions.ts";

export interface PythonView {
  /** The document with everything outside the block's body blanked; same lines and columns. */
  text: string;
  /** 0-based first and last line of the body. */
  firstLine: number;
  lastLine: number;
}

// Keeps CRs and line breaks, so the line count and every column survive.
const blank = (s: string) => s.replace(/[^\r\n]/g, " ");

/** The Python view of a .pjx text, or null when there is no closed `{#python` block to serve. */
export function pythonView(text: string, scan: Scan = scanText(text)): PythonView | null {
  if (scan.error) return null;
  const block = scan.blocks.find((b) => b.keyword === "python");
  // pyjinhx rejects a document with both a def and a python block.
  if (!block?.bodyLines || scan.blocks.some((b) => b.keyword === "def")) return null;
  const { start, end } = block.body;
  return {
    text: blank(text.slice(0, start)) + text.slice(start, end) + blank(text.slice(end)),
    firstLine: block.bodyLines[0] - 1,
    lastLine: block.bodyLines[1] - 1,
  };
}

export const inBody = (view: PythonView, line: number) => line >= view.firstLine && line <= view.lastLine;

/** Whether a range lies wholly on body lines. */
export const rangeInBody = (view: PythonView, range: { start: { line: number }; end: { line: number } }) => inBody(view, range.start.line) && inBody(view, range.end.line);
