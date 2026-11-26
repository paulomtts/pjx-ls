import { getLanguageService, newHTMLDataProvider, type CompletionItem, type Hover, type HTMLDataV1, type IAttributeData } from "vscode-html-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { Component, Manifest, Prop } from "./manifest.ts";
import type { Scan, Tag } from "./regions.ts";

const signature = (c: Component) => `${c.tag}(${c.props.map(propText).join(", ")})`;
const propText = (p: Prop) => `${p.name}${p.annotation ? `: ${p.annotation}` : ""}${p.default !== null ? ` = ${p.default}` : ""}`;
const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function attribute(p: Prop): IAttributeData {
  const notes = [p.required && "required", p.slot && "slot", p.children && "children"].filter(Boolean).join(", ");
  return {
    name: p.name,
    description: { kind: "markdown", value: `\`${propText(p)}\`${notes ? `  \n${notes}` : ""}` },
    // `v` is the HTML data format's name for an attribute that takes no value.
    ...(p.annotation?.trim() === "bool" ? { valueSet: "v" } : {}),
    values: (p.literalValues ?? []).map((v) => ({ name: String(v) })),
  };
}

/** The manifest as HTML custom data: a tag per component, an attribute per prop. */
export function customData(manifest: Manifest): HTMLDataV1 {
  return {
    version: 1.1,
    tags: manifest.components.map((c) => ({
      name: c.tag,
      description: { kind: "markdown", value: `\`\`\`python\n${signature(c)}\n\`\`\`\n${c.kind} component, \`${fileName(c.sourcePath)}\`` },
      attributes: c.props.map(attribute),
    })),
  };
}

const services = new WeakMap<Manifest, ReturnType<typeof getLanguageService>>();
function serviceFor(manifest: Manifest) {
  let service = services.get(manifest);
  if (!service) {
    service = getLanguageService({ useDefaultDataProvider: false, customDataProviders: [newHTMLDataProvider("pjx", customData(manifest))] });
    services.set(manifest, service);
  }
  return service;
}

// pyjinhx renders `Card-header` and `Card.Item` as `Card`; the part after the component's
// name is blanked so the HTML service sees the tag the manifest knows.
function asComponentNames(html: string, tags: Tag[]): string {
  let out = html;
  for (const tag of tags) {
    if (tag.componentName === null) continue;
    const from = tag.nameRange.start + tag.componentName.length;
    out = out.slice(0, from) + " ".repeat(tag.nameRange.end - from) + out.slice(tag.nameRange.end);
  }
  return out;
}

function prepare(manifest: Manifest, html: string, scan: Scan, offset: number) {
  const doc = TextDocument.create("pjx:view", "html", 0, asComponentNames(html, scan.tags));
  const service = serviceFor(manifest);
  return { doc, service, html: service.parseHTMLDocument(doc), position: doc.positionAt(offset) };
}

const tagAt = (scan: Scan, offset: number) => scan.tags.find((t) => !t.closing && t.range.start < offset && offset <= t.range.end);

/** Completion of component tags, their props and `Literal` values at `offset` in the HTML view. */
export function componentCompletions(manifest: Manifest, html: string, scan: Scan, offset: number): CompletionItem[] {
  const tag = tagAt(scan, offset);
  // Inside the part of a name after the component's own, there is nothing to complete.
  if (tag?.componentName != null && offset > tag.nameRange.start + tag.componentName.length && offset <= tag.nameRange.end) return [];
  const { doc, service, html: parsed, position } = prepare(manifest, html, scan, offset);
  const required = new Set(manifest.byTag(tag?.componentName ?? "")?.props.filter((p) => p.required).map((p) => p.name));
  // `data-` is the service's own entry for any element; the HTML service of the editor offers it already.
  return service.doComplete(doc, position, parsed).items.filter((item) => item.label !== "data-").map((item) => ({ ...item, sortText: `${required.has(item.label) ? 0 : 1}${item.label}` }));
}

export function componentHover(manifest: Manifest, html: string, scan: Scan, offset: number): Hover | null {
  const { doc, service, html: parsed, position } = prepare(manifest, html, scan, offset);
  return service.doHover(doc, position, parsed);
}
