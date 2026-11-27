import * as path from "node:path";
import type { Cancel } from "./lsp-client.ts";
import type { Exit, Spawn } from "./manifest-runner.ts";
import { scan } from "./regions.ts";

/** Formats a Python module whose lines end in `\n`; null means "leave it as it is". */
export type FormatBody = (body: string) => Promise<string | null>;

/**
 * `text` with the body of its `{#python` block replaced by what `format` answers.
 * Returns `text` itself when there is no sound block with a body, when `format`
 * declines or throws, or when the answer could not be put back safely.
 */
export async function formatPythonBlock(text: string, format: FormatBody, log: (line: string) => void = () => {}): Promise<string> {
  const s = scan(text);
  const block = s.blocks.find((b) => b.keyword === "python");
  if (s.error || !block || block.bodyLines === null) return text;
  const crlf = text.includes("\r\n");
  if (crlf && /(?<!\r)\n/.test(text)) return text;
  const body = text.slice(block.body.start, block.body.end);
  if (body.trim() === "") return text;

  const sent = body.replaceAll("\r\n", "\n");
  let answer: string | null;
  try {
    answer = await format(sent);
  } catch (error) {
    log(`formatting the {#python body failed: ${error instanceof Error ? error.message : error}`);
    return text;
  }
  if (answer === null) return text;
  let out = answer.replaceAll("\r\n", "\n");
  if (out === sent || out.trim() === "") return text;
  // `#}` inside the body would close the block early, so such an answer is not used.
  if (out.includes("#}")) {
    log("ruff's output holds `#}`, which would close the block early; the body is left as it was");
    return text;
  }
  if (!out.endsWith("\n")) out += "\n";
  return text.slice(0, block.body.start) + (crlf ? out.replaceAll("\n", "\r\n") : out) + text.slice(block.body.end);
}

/** Whether ruff is run at all: only when asked for, and never in an untrusted workspace. */
export const usesRuff = (setting: unknown, trusted: boolean): boolean => trusted && setting === "ruff";

/** A way to start ruff: `{ command: python, args: ["-m", "ruff"] }` or `{ command: "/usr/bin/ruff", args: [] }`. */
export interface RuffCommand {
  command: string;
  args: string[];
}

/** The name ruff is told the body has: `<name>.py` beside the `.pjx`, so the project's ruff configuration applies. */
export const stdinFilename = (pjxPath: string): string => path.join(path.dirname(pjxPath), `${path.basename(pjxPath, path.extname(pjxPath))}.py`);

export const ruffArgs = (filename: string): string[] => ["format", "--stdin-filename", filename, "-"];

/** ruff's import sorting alone, as a fix: the project's other lint rules are not run. */
export const sortArgs = (filename: string): string[] => ["check", "--select", "I001", "--fix-only", "--stdin-filename", filename, "-"];

export interface RuffRequest {
  /** From `stdinFilename`. */
  filename: string;
  cwd: string;
  /** In the order to try: the interpreter's module, then the one on `PATH`. Asked only when nothing is remembered for `cwd`. */
  candidates: () => Promise<RuffCommand[]>;
  cancel?: Cancel;
  /** Hears what was tried, at the moment (once per cwd) that no candidate could be started. */
  onMissing?: (tried: string) => void;
  /** Sort the imports before formatting. */
  sortImports?: boolean;
}

type Run = Exit | "missing" | "timeout" | "cancelled" | { failure: string };
type Label = "ruff check" | "ruff format";
type Deadline = { at?: number };

const shown = (c: RuffCommand) => [c.command, ...c.args].join(" ");

/** Runs ruff on a module given on stdin (sorting its imports, then formatting it), remembering per cwd which command works. */
export class Ruff {
  private readonly found = new Map<string, RuffCommand>();
  private readonly told = new Set<string>();

  private readonly spawn: Spawn;
  private readonly log: (line: string) => void;
  private readonly timeoutMs: number;

  constructor(spawn: Spawn, log: (line: string) => void, timeoutMs = 5_000) {
    this.spawn = spawn;
    this.log = log;
    this.timeoutMs = timeoutMs;
  }

  /** The formatted module (its imports sorted first when asked), or null when ruff is missing, fails, times out or is cancelled. Never rejects. */
  async format(source: string, request: RuffRequest): Promise<string | null> {
    if (request.cancel?.cancelled) return null;
    // One time limit for both steps, counted from the first spawn: looking for ruff can wake the Python extension.
    const deadline: Deadline = {};
    const name = path.basename(request.filename);
    let body = source;
    if (request.sortImports) {
      const run = await this.step("ruff check", sortArgs(request.filename), source, request, deadline);
      const sorted = this.answer(run, "ruff check", name);
      if (typeof run !== "object" || !("code" in run) || request.cancel?.cancelled) return null;
      if (sorted !== null && sorted.trim() !== "") body = sorted;
    }
    return this.answer(await this.step("ruff format", ruffArgs(request.filename), body, request, deadline), "ruff format", name);
  }

  /** Forget which command worked and what was already said: a setting or the interpreter changed. */
  forget(): void {
    this.found.clear();
    this.told.clear();
  }

  /** One ruff subcommand: the run of the first candidate that is not missing, which is then remembered. */
  private async step(label: Label, args: string[], source: string, request: RuffRequest, deadline: Deadline): Promise<Run> {
    const name = path.basename(request.filename);
    const remembered = this.found.get(request.cwd);
    if (remembered) {
      const run = await this.run(remembered, label, args, source, request, deadline);
      if (run !== "missing") return run;
      this.found.delete(request.cwd);
    }

    let candidates: RuffCommand[];
    try {
      candidates = await request.candidates();
    } catch (error) {
      this.log(`${label} ${name}: could not look for ruff: ${error instanceof Error ? error.message : error}`);
      return "missing";
    }
    for (const candidate of candidates) {
      const run = await this.run(candidate, label, args, source, request, deadline);
      if (run === "missing") continue;
      if (typeof run === "object" && "code" in run) this.found.set(request.cwd, candidate);
      return run;
    }
    if (!this.told.has(request.cwd)) {
      this.told.add(request.cwd);
      const tried = candidates.map(shown).join(", ") || "nothing";
      this.log(`ruff was not found (tried: ${tried}): {#python bodies are not formatted. Install ruff in the project's environment or on PATH, or set pyjinhx.format.python to "off".`);
      request.onMissing?.(tried);
    }
    return "missing";
  }

  private answer(run: Run, label: Label, name: string): string | null {
    if (run === "cancelled") return null;
    if (run === "timeout") this.log(`${label} ${name}: no answer after ${this.timeoutMs / 1000} s`);
    else if (typeof run === "string") return null;
    else if ("failure" in run) this.log(`${label} ${name}: ${run.failure}`);
    else if (run.code === 0) return run.stdout;
    else this.log(`${label} ${name}: exit ${run.code}: ${run.stderr.split("\n").find((l) => l.trim()) ?? "no message"}`);
    return null;
  }

  private async run(command: RuffCommand, label: Label, args: string[], source: string, request: RuffRequest, deadline: Deadline): Promise<Run> {
    if (request.cancel?.cancelled) return "cancelled";
    const started = Date.now();
    const at = (deadline.at ??= started + this.timeoutMs);
    const process = this.spawn(command.command, [...command.args, ...args], source, request.cwd);
    process.exit.catch(() => {});
    let timer: NodeJS.Timeout | undefined;
    const stop = new Promise<"timeout" | "cancelled">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), Math.max(0, at - started));
      request.cancel?.onCancel(() => resolve("cancelled"));
    });
    try {
      const result = await Promise.race([process.exit, stop]);
      if (typeof result === "string") {
        process.kill();
        return result;
      }
      if (result.code !== 0 && /No module named '?ruff/.test(result.stderr)) return "missing";
      if (result.code === 0) this.log(`${label} ${path.basename(request.filename)}: ok in ${Date.now() - started} ms (${shown(command)})`);
      return result;
    } catch (error) {
      if ((error as { code?: unknown })?.code === "ENOENT") return "missing";
      return { failure: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timer);
    }
  }
}
