import { spawn as spawnProcess } from "node:child_process";
import { ManifestError, parseManifest, type Manifest } from "./manifest.ts";

export interface Exit {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface Process {
  /** Rejects with an error whose `code` is "ENOENT" when the command cannot be started. */
  exit: Promise<Exit>;
  kill: () => void;
}

export type Spawn = (command: string, args: string[], input?: string) => Process;

export const nodeSpawn: Spawn = (command, args, input) => {
  const child = spawnProcess(command, args, { stdio: ["pipe", "pipe", "pipe"] });
  const exit = new Promise<Exit>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  child.stdin.on("error", () => {});
  child.stdin.end(input ?? "");
  return { exit, kill: () => child.kill() };
};

export type FailureKind = "no-interpreter" | "no-pyjinhx" | "old-pyjinhx" | "bad-output" | "version" | "failed" | "timeout";

export interface Failure {
  kind: FailureKind;
  message: string;
}

export type Outcome = { manifest: Manifest } | { failure: Failure } | { superseded: true };

function classify(exit: Exit): Failure {
  const stderr = exit.stderr.trim();
  if (/No module named '?pyjinhx\.manifest/.test(stderr)) return { kind: "old-pyjinhx", message: "the installed pyjinhx has no manifest command; upgrade to 1.17 or later" };
  if (/No module named '?pyjinhx/.test(stderr)) return { kind: "no-pyjinhx", message: "pyjinhx is not installed for this interpreter" };
  return { kind: "failed", message: `exit ${exit.code}: ${stderr.split("\n").slice(-3).join(" ") || "no message"}` };
}

/** Runs `python -m pyjinhx.manifest` one at a time: a newer run kills the one still going. */
export class Lane {
  private current: { process: Process; supersede: () => void } | null = null;
  private readonly spawn: Spawn;
  private readonly timeoutMs: number;

  constructor(spawn: Spawn, timeoutMs = 10_000) {
    this.spawn = spawn;
    this.timeoutMs = timeoutMs;
  }

  async run(python: string, args: string[], input?: string): Promise<Outcome> {
    this.cancel();
    const process = this.spawn(python, ["-m", "pyjinhx.manifest", ...args], input);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interrupted = new Promise<Outcome>((resolve) => {
      this.current = { process, supersede: () => resolve({ superseded: true }) };
      timer = setTimeout(() => {
        process.kill();
        resolve({ failure: { kind: "timeout", message: `no answer after ${this.timeoutMs / 1000} s` } });
      }, this.timeoutMs);
    });
    const finished = process.exit.then(
      (exit): Outcome => {
        if (exit.code !== 0) return { failure: classify(exit) };
        try {
          return { manifest: parseManifest(exit.stdout) };
        } catch (e) {
          if (e instanceof ManifestError) return { failure: { kind: e.kind, message: e.message } };
          throw e;
        }
      },
      (error): Outcome => ({ failure: error?.code === "ENOENT" ? { kind: "no-interpreter", message: `cannot start ${python}` } : { kind: "failed", message: String(error) } }),
    );
    try {
      return await Promise.race([finished, interrupted]);
    } finally {
      clearTimeout(timer);
      if (this.current?.process === process) this.current = null;
    }
  }

  cancel(): void {
    this.current?.process.kill();
    this.current?.supersede();
    this.current = null;
  }
}
