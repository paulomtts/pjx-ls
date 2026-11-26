import type { Component, Manifest, Prop } from "./manifest.ts";
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

// Only a name that starts as a component's does (`<b` is not `Badge`), and each tag is listed once.
function tags(manifest: Manifest, replace: Span, prefix: string): Entry[] {
  if (prefix && !/^[A-Z]/.test(prefix)) return [];
  return manifest.tagList().map((c) => ({ label: c.tag, kind: "component", detail: `${c.kind} component`, documentation: tagDocs(c), replace, sortText: c.tag }));
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
