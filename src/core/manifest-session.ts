import { Debouncer } from "./debounce.ts";
import { fallbackManifest } from "./fallback-index.ts";
import { Lane, type Outcome, type Spawn } from "./manifest-runner.ts";
import { Manifest, overlay } from "./manifest.ts";
import type { Found } from "./python-discovery.ts";

export type Mode = { kind: "pending" } | { kind: "full" } | { kind: "limited"; reason: string };

export interface SessionOptions {
  folder: string;
  spawn: Spawn;
  python: () => Promise<Found | null>;
  /** `pyjinhx.manifest.paths` and `pyjinhx.manifest.sysPath`. */
  settings: () => { paths: string[]; sysPath: string[] };
  trusted: () => boolean;
  /** The folder's `.pjx` files, for the index used without pyjinhx. */
  files: () => Promise<{ path: string; text: string }[]>;
  log: (line: string) => void;
  onChange: () => void;
  fullDelayMs?: number;
  bufferDelayMs?: number;
  timeoutMs?: number;
}

/** The manifest of one workspace folder, kept current: a full run, and runs for unsaved buffers laid over it. */
export class ManifestSession {
  manifest = new Manifest([], []);
  mode: Mode = { kind: "pending" };
  private disk = new Manifest([], []);
  private readonly buffers = new Map<string, Manifest>();
  private readonly texts = new Map<string, () => string>();
  private readonly full: Lane;
  private readonly buffer: Lane;
  private readonly fullDebounce: Debouncer;
  private readonly bufferDebounce: Debouncer;
  private readonly o: SessionOptions;

  constructor(options: SessionOptions) {
    this.o = options;
    this.full = new Lane(options.spawn, options.timeoutMs);
    this.buffer = new Lane(options.spawn, options.timeoutMs);
    this.fullDebounce = new Debouncer(options.fullDelayMs ?? 300, () => void this.refresh());
    this.bufferDebounce = new Debouncer(options.bufferDelayMs ?? 250, (path) => void this.refreshBuffer(path));
  }

  /** Runs the full manifest now. */
  async refresh(): Promise<void> {
    if (!this.o.trusted()) return this.limit("the workspace is not trusted, so no interpreter is run");
    const found = await this.o.python();
    if (!found) return this.limit("no Python interpreter was found; set pyjinhx.pythonPath");
    const { paths, sysPath } = this.o.settings();
    const args = [...sysPath.flatMap((p) => ["--sys-path", p]), ...(paths.length ? paths : [this.o.folder])];
    const outcome = await this.timed(found.python, args, () => this.full.run(found.python, args));
    if ("superseded" in outcome) return;
    if ("failure" in outcome) return this.limit(outcome.failure.message);
    this.disk = outcome.manifest;
    this.mode = { kind: "full" };
    this.o.log(`manifest: ${outcome.manifest.components.length} components (pyjinhx ${outcome.manifest.pyjinhxVersion})`);
    this.merge();
  }

  private async refreshBuffer(path: string): Promise<void> {
    const found = this.mode.kind === "full" && this.texts.has(path) ? await this.o.python() : null;
    if (!found) return;
    const args = ["--stdin", "--filename", path, ...this.o.settings().sysPath.flatMap((p) => ["--sys-path", p])];
    const outcome = await this.timed(found.python, args, () => this.buffer.run(found.python, args, this.texts.get(path)!()));
    if ("superseded" in outcome) return;
    if ("failure" in outcome) this.buffers.delete(path);
    else this.buffers.set(path, outcome.manifest);
    this.merge();
  }

  private async timed(python: string, args: string[], run: () => Promise<Outcome>): Promise<Outcome> {
    const began = Date.now();
    const outcome = await run();
    const result = "failure" in outcome ? `failed (${outcome.failure.kind})` : "superseded" in outcome ? "superseded" : "ok";
    this.o.log(`${python} -m pyjinhx.manifest ${args.join(" ")}: ${result} in ${Date.now() - began} ms`);
    return outcome;
  }

  private async limit(reason: string): Promise<void> {
    this.o.log(`limited mode: ${reason}`);
    this.mode = { kind: "limited", reason };
    this.buffers.clear();
    this.disk = fallbackManifest(await this.o.files());
    this.merge();
  }

  private merge(): void {
    this.manifest = [...this.buffers].reduce((m, [path, buffer]) => overlay(m, path, buffer), this.disk);
    this.o.onChange();
  }

  /** A `.pjx`, `.py` or `.pyi` file was saved, created or deleted. */
  requestFull(): void {
    this.fullDebounce.schedule("full");
  }

  /** The text of an unsaved document changed; `text` is read when the run starts. */
  requestBuffer(path: string, text: () => string): void {
    this.texts.set(path, text);
    this.bufferDebounce.schedule(path);
  }

  /** The buffer matches the disk again, or is gone. */
  settle(path: string): void {
    this.texts.delete(path);
    if (this.buffers.delete(path)) this.merge();
  }

  dispose(): void {
    this.fullDebounce.dispose();
    this.bufferDebounce.dispose();
    this.full.cancel();
    this.buffer.cancel();
  }
}
