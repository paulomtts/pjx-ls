const OPENER = /^\s*\{#-?\s*python\s*$/;
const CLOSER = /^\s*-?#\}\s*$/;

export interface PythonBlock {
  openStart: number;
  contentStart: number;
  contentEnd: number;
  afterClose: number;
  openLine: number;
  closeLine: number;
}

/**
 * Locate the leading `{# python … #}` block. The opener must be the first
 * non-whitespace line and stand alone; the block closes at the first later line
 * whose only non-whitespace content is `#}` (so an inline `#}` inside Python is
 * safe). Returns null when there is no opener or the block is unterminated —
 * the editor tolerates in-progress edits; the pyjinhx loader is the strict gate.
 */
export function findPythonBlock(text: string): PythonBlock | null {
  const lines = text.split("\n");

  let openLine = 0;
  while (openLine < lines.length && lines[openLine].trim() === "") {
    openLine += 1;
  }
  if (openLine >= lines.length || !OPENER.test(lines[openLine])) {
    return null;
  }

  let closeLine = -1;
  for (let line = openLine + 1; line < lines.length; line += 1) {
    if (CLOSER.test(lines[line])) {
      closeLine = line;
      break;
    }
  }
  if (closeLine === -1) {
    return null;
  }

  const offsetOfLine = (line: number): number => {
    let offset = 0;
    for (let i = 0; i < line; i += 1) {
      offset += lines[i].length + 1; // + the split "\n"
    }
    return offset;
  };

  const openStart = offsetOfLine(openLine) + lines[openLine].indexOf("{");
  const contentStart = offsetOfLine(openLine + 1);
  const contentEnd = offsetOfLine(closeLine);
  const afterClose = offsetOfLine(closeLine + 1);

  return { openStart, contentStart, contentEnd, afterClose, openLine, closeLine };
}
