import type { Component, Manifest, Prop, Range } from "./manifest.ts";
import type { Range as Span, Scan, Tag } from "./regions.ts";

export interface Entry {
  label: string;
  kind: "component" | "prop" | "value";
  detail?: string;
  /** Markdown. */
  documentation?: string;
  /** Inserted in place of the label, as an editor snippet. */
  snippet?: string;
  /** The text the entry replaces, as offsets. */
  replace: Span;
  sortText: string;
  /** Ask for completions again once inserted, for the value that follows. */
  retrigger?: boolean;
}

const propText = (p: Prop) => `${p.name}${p.annotation ? `: ${p.annotation}` : ""}${p.default !== null ? ` = ${p.default}` : ""}`;
const signature = (c: Component) => `${c.tag}(${c.props.map(propText).join(", ")})`;
const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const inside = (r: Span, offset: number) => r.start <= offset && offset <= r.end;

const tagDocs = (c: Component) => `\`\`\`python\n${signature(c)}\n\`\`\`\n${c.kind} component, \`${fileName(c.sourcePath)}\``;
const propDocs = (p: Prop) => {
  const notes = [p.required && "required", p.slot && "slot", p.children && "children"].filter(Boolean).join(", ");
  return `\`${propText(p)}\`${notes ? `  \n${notes}` : ""}`;
};

/** The component and the part of the tag's name that names it: pyjinhx renders `Card-header` as `Card`. */
function componentOf(manifest: Manifest, tag: Tag): { component: Component; name: Span } | null {
  const component = tag.componentName === null ? undefined : manifest.byTag(tag.componentName);
  return component ? { component, name: { start: tag.nameRange.start, end: tag.nameRange.start + tag.componentName!.length } } : null;
}

// The tag being written at `offset`, if it is an opening one and the cursor is before its `>`.
function tagAt(text: string, scan: Scan, offset: number): Tag | undefined {
  return scan.tags.find((t) => !t.closing && t.range.start < offset && (offset < t.range.end || (offset === t.range.end && text[t.range.end - 1] !== ">")));
}

// `<` in a script, a stylesheet or a block body is code, not a tag.
const inCode = (scan: Scan, offset: number) => [...scan.embedded, ...scan.blocks].some((b) => inside(b.body, offset));

/** Completion of component tags, of the props of the tag the cursor is in, and of their `Literal` values. */
export function componentCompletions(manifest: Manifest, text: string, scan: Scan, offset: number): Entry[] {
  if (inCode(scan, offset)) return [];
  const tag = tagAt(text, scan, offset);
  if (!tag) {
    const typed = /<([A-Za-z0-9]*)$/.exec(text.slice(0, offset));
    return typed ? tags(manifest, { start: offset - typed[1].length, end: offset }, typed[1]) : [];
  }
  if (inside(tag.nameRange, offset)) {
    const prefix = text.slice(tag.nameRange.start, offset);
    const named = tag.componentName === null ? 0 : tag.componentName.length;
    return named && offset > tag.nameRange.start + named ? [] : tags(manifest, { start: tag.nameRange.start, end: tag.nameRange.start + (named || tag.name.length) }, prefix);
  }
  const own = componentOf(manifest, tag)?.component;
  if (!own) return [];
  const value = tag.attributes.find((a) => a.value && inside(a.value, offset));
  if (value) {
    const prop = own.props.find((p) => p.name === value.name);
    return (prop?.literalValues ?? []).map((v) => ({ label: String(v), kind: "value", replace: value.value!, sortText: String(v) }));
  }
  const typing = tag.attributes.find((a) => inside(a.nameRange, offset));
  // An attribute that already has its `=` is renamed, not given another value.
  const bare = typing !== undefined && text[typing.nameRange.end] === "=";
  const used = new Set(tag.attributes.filter((a) => a !== typing).map((a) => a.name));
  return own.props.filter((p) => !used.has(p.name)).map((p) => ({
    label: p.name,
    kind: "prop",
    detail: p.annotation ?? undefined,
    documentation: propDocs(p),
    // A boolean is written as a bare attribute; anything else takes a value.
    snippet: bare || p.annotation?.trim() === "bool" ? undefined : `${p.name}="$1"`,
    replace: typing?.nameRange ?? { start: offset, end: offset },
    sortText: `${p.required ? 0 : 1}${p.name}`,
    retrigger: !!p.literalValues,
  }));
}

// Each tag once, those the typed name starts, whatever its case (`<but` finds `Button`). Props and
// hover stay for PascalCase tags, so `<button ` never gets `Button`'s.
function tags(manifest: Manifest, replace: Span, prefix: string): Entry[] {
  return manifest.tagList().filter((c) => c.tag.toLowerCase().startsWith(prefix.toLowerCase())).map((c) => ({ label: c.tag, kind: "component", detail: `${c.kind} component`, documentation: tagDocs(c), replace, sortText: c.tag }));
}

/** Hover on a component tag or one of its props. */
export function componentHover(manifest: Manifest, scan: Scan, offset: number): { markdown: string; range: Span } | null {
  if (inCode(scan, offset)) return null;
  const tag = scan.tags.find((t) => t.range.start < offset && offset <= t.range.end);
  const found = tag && componentOf(manifest, tag);
  if (!tag || !found) return null;
  if (inside(tag.nameRange, offset)) return { markdown: tagDocs(found.component), range: found.name };
  const attribute = tag.attributes.find((a) => inside(a.nameRange, offset));
  const prop = found.component.props.find((p) => p.name === attribute?.name);
  return attribute && prop ? { markdown: propDocs(prop), range: attribute.nameRange } : null;
}

/**
 * The names of the props of the component whose tag the cursor is in, at an attribute name: what
 * the HTML service's own entry of that name (a global `title`) must not shadow.
 */
export function shadowedAttributes(manifest: Manifest, text: string, scan: Scan, offset: number): Set<string> {
  const tag = inCode(scan, offset) ? undefined : tagAt(text, scan, offset);
  if (!tag || inside(tag.nameRange, offset) || tag.attributes.some((a) => a.value && inside(a.value, offset))) return new Set();
  return new Set(componentOf(manifest, tag)?.component.props.map((p) => p.name));
}

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
  const found = componentOf(manifest, tag);
  if (!found) return null;
  const { component, name } = found;
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
  // A name in `{{ }}` counts even inside a tag's attribute value.
  if (inJinja(text, scan, offset)) {
    const word = wordAt(text, offset);
    const name = word && text.slice(word.start, word.end);
    for (const c of ownComponents(manifest, path)) {
      const found = [...c.props, ...c.members].find((m) => m.name === name);
      if (found) return { origin: word!, target: { path: c.sourcePath, range: found.range } };
    }
    return null;
  }
  const tag = scan.tags.find((t) => inside(t.range, offset));
  return tag ? inTag(manifest, tag, offset) : null;
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
