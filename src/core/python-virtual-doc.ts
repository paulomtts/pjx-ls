import { findPythonBlock } from "./python-block.ts";

export function isOffsetInPythonBlock(text: string, offset: number): boolean {
  const block = findPythonBlock(text);
  if (!block) return false;
  return offset >= block.contentStart && offset < block.contentEnd;
}

export function buildPythonVirtualContent(text: string): string {
  const block = findPythonBlock(text);
  if (!block) return "";

  const lines = text.split("\n");
  const out = lines.map((line, index) =>
    index > block.openLine && index < block.closeLine ? line : "",
  );
  return out.join("\n");
}
