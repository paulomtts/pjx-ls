import type { Component, Range } from "./manifest.ts";
import type { Manifest } from "./manifest.ts";
import type { Range as Span, Scan, Tag } from "./regions.ts";

export interface Target {
  path: string;
  range: Range;
}

export interface Definition {
  /** The text the definition is of, as offsets. */
  origin: Span;
  target: Target;
}

export interface NameItem {
  label: string;
  kind: "property" | "method";
  detail: string;
  /** The word typed so far, as offsets. */
  replace: Span;
}

const WORD = /[A-Za-z_][A-Za-z0-9_]*/y;
const inside = (r: Span, offset: number) => r.start <= offset && offset <= r.end;
const start = { line: 0, character: 0 };

// The identifier around `offset`, if it is not an attribute of something (`x.name`).
function wordAt(text: string, offset: number): Span | null {
  let from = offset;
  while (from > 0 && /\w/.test(text[from - 1])) from--;
  WORD.lastIndex = from;
  const found = WORD.exec(text);
  if (!found || found.index + found[0].length < offset) return null;
  return text[from - 1] === "." ? null : { start: from, end: from + found[0].length };
}

const ownComponents = (manifest: Manifest, path: string) => manifest.forPath(path);

function tagDefinition(c: Component): Target {
  return c.classInfo ? { path: c.classInfo.path, range: c.classInfo.range } : { path: c.documentPath, range: { start, end: start } };
}

function inTag(manifest: Manifest, tag: Tag, offset: number): Definition | null {
  const component = tag.componentName === null ? undefined : manifest.byTag(tag.componentName);
  if (!component) return null;
  const name = { start: tag.nameRange.start, end: tag.nameRange.start + tag.componentName!.length };
  if (inside(tag.nameRange, offset)) return { origin: name, target: tagDefinition(component) };
  const attribute = tag.attributes.find((a) => inside(a.nameRange, offset));
  const prop = component.props.find((p) => p.name === attribute?.name);
  return attribute && prop ? { origin: attribute.nameRange, target: { path: component.sourcePath, range: prop.range } } : null;
}

// A half-typed `{{ ` runs to the end of the text, so only a region that ends in its closer has one.
function inJinja(text: string, scan: Scan, offset: number) {
  return scan.regions.find((r) => {
    if (r.kind !== "expression" && r.kind !== "statement") return false;
    const closed = text.slice(r.end - 2, r.end) === (r.kind === "expression" ? "}}" : "%}") && r.end - r.start >= 4;
    return r.start + 2 <= offset && offset <= (closed ? r.end - 2 : r.end);
  });
}

/** Where the tag, attribute or own prop or member at `offset` is defined. */
export function definitionAt(manifest: Manifest, path: string, text: string, scan: Scan, offset: number): Definition | null {
  const tag = scan.tags.find((t) => !t.closing && inside(t.range, offset));
  if (tag) return inTag(manifest, tag, offset);
  if (!inJinja(text, scan, offset)) return null;
  const word = wordAt(text, offset);
  if (!word) return null;
  const name = text.slice(word.start, word.end);
  for (const c of ownComponents(manifest, path)) {
    const found = [...c.props, ...c.members].find((m) => m.name === name);
    if (found) return { origin: word, target: { path: c.sourcePath, range: found.range } };
  }
  return null;
}

// Where a Jinja expression may begin: not after `.` (an attribute) or `|` (a filter), not in
// a string, and not the keyword that opens a `{% %}` statement.
function startsExpression(text: string, regionStart: number, word: Span, statement: boolean): boolean {
  const before = text.slice(regionStart + 2, word.start);
  const prior = before.replace(/\s+$/, "").slice(-1);
  if (prior === "." || prior === "|") return false;
  if ((before.match(/(?<!\\)'/g)?.length ?? 0) % 2 || (before.match(/(?<!\\)"/g)?.length ?? 0) % 2) return false;
  return !statement || /\S/.test(before.replace(/^[-+]/, ""));
}

/** The own props and members of the document's components, where an expression begins. */
export function nameCompletions(manifest: Manifest, path: string, text: string, scan: Scan, offset: number): NameItem[] {
  const region = inJinja(text, scan, offset);
  if (!region) return [];
  const word = wordAt(text, offset) ?? { start: offset, end: offset };
  if (!startsExpression(text, region.start, word, region.kind === "statement")) return [];
  return ownComponents(manifest, path).flatMap((c) => [
    ...c.props.map((p): NameItem => ({ label: p.name, kind: "property", detail: p.annotation ?? "", replace: word })),
    ...c.members.map((m): NameItem => ({ label: m.name, kind: m.kind === "method" || m.kind === "classmethod" ? "method" : "property", detail: m.kind, replace: word })),
  ]);
}
