import { findPythonBlock } from "./python-block.ts";

/**
 * Returns `true` when `offset` falls inside the content of the `{# python #}`
 * block in `text` (exclusive of the opening/closing fence lines themselves).
 */
export function isOffsetInPythonBlock(text: string, offset: number): boolean {
  const block = findPythonBlock(text);
  if (!block) return false;
  return offset >= block.contentStart && offset < block.contentEnd;
}

/**
 * Builds a virtual Python file from a `.pjx` source: lines inside the
 * `{# python #}` block are kept verbatim; all other lines are replaced with
 * empty strings so that line numbers remain stable for editor features.
 */
export function buildPythonVirtualContent(text: string): string {
  const block = findPythonBlock(text);
  if (!block) return "";

  const lines = text.split("\n");
  const out = lines.map((line, index) =>
    index > block.openLine && index < block.closeLine ? line : "",
  );
  return out.join("\n");
}
