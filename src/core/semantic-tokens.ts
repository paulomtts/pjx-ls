import type { Legend } from "./python-server.ts";
import { inBody, type PythonView } from "./python-view.ts";

/** What the extension announces to the editor: standard names only, so every theme has a colour. */
export const LEGEND = {
  tokenTypes: ["namespace", "type", "class", "enum", "typeParameter", "parameter", "variable", "property", "enumMember", "function", "method", "keyword", "decorator"],
  tokenModifiers: ["declaration", "definition", "readonly", "static", "async", "defaultLibrary"],
} as const;

// Not standard types; they resolve to the colour of `parameter` where they are known.
const RENAMED: Record<string, string> = { selfParameter: "parameter", clsParameter: "parameter" };

/** The server's token data in LEGEND's numbering, without tokens outside the body or of a type LEGEND lacks. */
export function translateTokens(data: number[], from: Legend, view: PythonView): number[] {
  const types = from.tokenTypes.map((name) => LEGEND.tokenTypes.indexOf((RENAMED[name] ?? name) as never));
  const modifiers = from.tokenModifiers.map((name) => LEGEND.tokenModifiers.indexOf(name as never));
  const out: number[] = [];
  let line = 0;
  let column = 0;
  let outLine = 0;
  let outColumn = 0;
  for (let i = 0; i < data.length; i += 5) {
    line += data[i];
    column = data[i] ? data[i + 1] : column + data[i + 1];
    const type = types[data[i + 3]];
    if (type === undefined || type < 0 || !inBody(view, line)) continue;
    let bits = 0;
    modifiers.forEach((to, bit) => {
      if (to >= 0 && data[i + 4] & (1 << bit)) bits |= 1 << to;
    });
    out.push(line - outLine, line === outLine ? column - outColumn : column, data[i + 2], type, bits);
    [outLine, outColumn] = [line, column];
  }
  return out;
}
