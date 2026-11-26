/** `python -m pyjinhx.manifest`, version 1, as the editor uses it. No `vscode` import. */

export interface Position {
  /** 0-based; the manifest's lines are 1-based. */
  line: number;
  /** 0-based UTF-16 units, as the manifest has them. */
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export type LiteralValue = string | number | boolean;

export interface Prop {
  name: string;
  annotation: string | null;
  required: boolean;
  default: string | null;
  literalValues: LiteralValue[] | null;
  slot: boolean;
  children: boolean;
  range: Range;
}

export interface Member {
  name: string;
  kind: string;
  range: Range;
}

export interface ClassInfo {
  path: string;
  qualname: string;
  range: Range;
}

export interface Component {
  tag: string;
  kind: string;
  builtin: boolean;
  documentPath: string;
  classInfo: ClassInfo | null;
  props: Prop[];
  members: Member[];
  hasStaleDefHeader: boolean;
  /** The file the component's blocks and header props are in: the class's, else the document's. */
  sourcePath: string;
}

export interface Diagnostic {
  path: string;
  range: Range;
  severity: string;
  code: string;
  message: string;
}

export class ManifestError extends Error {
  readonly kind: "bad-output" | "version";
  constructor(kind: "bad-output" | "version", message: string) {
    super(message);
    this.kind = kind;
  }
}

export const SUPPORTED_VERSION = 1;

export class Manifest {
  readonly pyjinhxVersion: string;
  readonly components: Component[];
  readonly diagnostics: Diagnostic[];
  private readonly tags = new Map<string, Component>();

  constructor(components: Component[], diagnostics: Diagnostic[], pyjinhxVersion = "") {
    this.components = components;
    this.diagnostics = diagnostics;
    this.pyjinhxVersion = pyjinhxVersion;
    // A project's own component wins over a builtin of the same tag.
    for (const c of [...components].sort((a, b) => Number(b.builtin) - Number(a.builtin))) this.tags.set(c.tag, c);
  }

  byTag(tag: string): Component | undefined {
    return this.tags.get(tag);
  }

  /** The components whose document or class is the file at `path`. */
  forPath(path: string): Component[] {
    return this.components.filter((c) => c.documentPath === path || c.classInfo?.path === path);
  }

  diagnosticsFor(path: string): Diagnostic[] {
    return this.diagnostics.filter((d) => d.path === path);
  }
}

/** `base` with what the manifest of one buffer says about `path` in place of what it said. */
export function overlay(base: Manifest, path: string, buffer: Manifest): Manifest {
  const own = (c: Component) => c.documentPath === path || c.classInfo?.path === path;
  return new Manifest(
    [...base.components.filter((c) => !own(c)), ...buffer.components.filter(own)],
    [...base.diagnostics.filter((d) => d.path !== path), ...buffer.diagnostics.filter((d) => d.path === path)],
    base.pyjinhxVersion,
  );
}

type Json = Record<string, any>;

const range = (r: Json): Range => ({
  start: { line: r.start.line - 1, character: r.start.column },
  end: { line: r.end.line - 1, character: r.end.column },
});

const prop = (p: Json): Prop => ({
  name: p.name,
  annotation: p.annotation ?? null,
  required: !!p.required,
  default: p.default ?? null,
  literalValues: p.literal_values ?? null,
  slot: !!p.slot,
  children: !!p.children,
  range: range(p.range),
});

function component(c: Json): Component {
  const classInfo = c.class ? { path: c.class.path, qualname: c.class.qualname, range: range(c.class.range) } : null;
  return {
    tag: c.tag,
    kind: c.kind,
    builtin: !!c.builtin,
    documentPath: c.document.path,
    classInfo,
    props: (c.props ?? []).map(prop),
    members: (c.members ?? []).map((m: Json) => ({ name: m.name, kind: m.kind, range: range(m.range) })),
    hasStaleDefHeader: !!c.has_stale_def_header,
    sourcePath: classInfo?.path ?? c.document.path,
  };
}

export function parseManifest(text: string): Manifest {
  let json: Json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ManifestError("bad-output", "the output is not JSON");
  }
  if (!json || typeof json !== "object" || Array.isArray(json) || !Array.isArray(json.components)) {
    throw new ManifestError("bad-output", "the output is not a manifest");
  }
  if (json.manifest_version !== SUPPORTED_VERSION) {
    throw new ManifestError("version", `manifest_version ${json.manifest_version} is not supported (this extension reads ${SUPPORTED_VERSION})`);
  }
  const diagnostics = (json.diagnostics ?? []).map((d: Json) => ({ path: d.path, range: range(d.range), severity: d.severity, code: d.code, message: d.message }));
  return new Manifest(json.components.map(component), diagnostics, json.pyjinhx_version);
}
