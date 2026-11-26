import { Manifest, type Component, type Prop } from "./manifest.ts";
import { scan } from "./regions.ts";

// pyjinhx's own test for a component stem (`is_component_stem`): snake_case words.
const STEM = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const pascal = (stem: string) => stem.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("");

// The top-level commas of a signature: not inside brackets or strings.
function splitParameters(text: string, base: number): { text: string; start: number }[] {
  const parts: { text: string; start: number }[] = [];
  let depth = 0;
  let quote = "";
  let from = 0;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c !== undefined && "([{".includes(c)) depth++;
    else if (c !== undefined && ")]}".includes(c)) depth--;
    else if ((c === "," && depth === 0) || i === text.length) {
      parts.push({ text: text.slice(from, i), start: base + from });
      from = i + 1;
    }
  }
  return parts.filter((p) => p.text.trim());
}

function propOf(text: string, start: number, position: (offset: number) => { line: number; character: number }): Prop | null {
  const m = /^(\s*)([A-Za-z_]\w*)\s*(?::\s*([^=]*?))?\s*(?:=\s*(.*?))?\s*$/s.exec(text);
  if (!m) return null;
  const from = start + m[1].length;
  const annotation = m[3] ?? null;
  const literals = annotation && /^Literal\[(.*)\]$/s.exec(annotation.trim());
  return {
    name: m[2],
    annotation,
    required: m[4] === undefined,
    default: m[4] ?? null,
    literalValues: literals ? [...literals[1].matchAll(/(["'])(.*?)\1/g)].map((q) => q[2]) : null,
    slot: /\bSlot\b/.test(annotation ?? ""),
    children: /\bChildren\b/.test(annotation ?? ""),
    range: { start: position(from), end: position(from + m[2].length) },
  };
}

function component(path: string, text: string): Component | null {
  const stem = path.slice(path.lastIndexOf("/") + 1).replace(/\.pjx$/, "");
  if (!STEM.test(stem)) return null;
  const header = scan(text).blocks.find((b) => b.keyword === "def");
  const lineStarts = [0, ...[...text.matchAll(/\n/g)].map((m) => m.index + 1)];
  const position = (offset: number) => {
    const line = lineStarts.filter((s) => s <= offset).length - 1;
    return { line, character: offset - lineStarts[line] };
  };
  const props = header ? splitParameters(text.slice(header.body.start, header.body.end), header.body.start).flatMap((p) => propOf(p.text, p.start, position) ?? []) : [];
  return { tag: pascal(stem), kind: "template", builtin: false, documentPath: path, classInfo: null, props, members: [], hasStaleDefHeader: false, replaces: false, sourcePath: path };
}

/** What can be known of a project's components without pyjinhx: a tag per `.pjx` file and the props of its header. */
export function fallbackManifest(files: { path: string; text: string }[]): Manifest {
  return new Manifest(files.flatMap((f) => component(f.path, f.text) ?? []), []);
}
