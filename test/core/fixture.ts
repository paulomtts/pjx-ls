import * as fs from "node:fs";
import * as path from "node:path";
import type { Exit, Process, Spawn } from "../../src/core/manifest-runner.ts";
import { fileURLToPath } from "node:url";

export const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/project");

/** The stored manifest of test/fixtures/project, as `python -m pyjinhx.manifest` printed it. */
export function manifestText(root = PROJECT): string {
  const stored = path.resolve(PROJECT, "../manifest/project.json");
  return fs.readFileSync(stored, "utf8").replaceAll("@ROOT@", root);
}

export interface FakeSpawn {
  spawn: Spawn;
  calls: { command: string; args: string[]; input?: string; cwd?: string; killed: boolean; finish: (e: Exit) => void; fail: (e: unknown) => void }[];
}

/** A `Spawn` that starts nothing: each call waits for the test to `finish` or `fail` it. */
export function fakeSpawn(): FakeSpawn {
  const calls: FakeSpawn["calls"] = [];
  const spawn: Spawn = (command, args, input, cwd) => {
    let finish!: (e: Exit) => void;
    let fail!: (e: unknown) => void;
    const exit = new Promise<Exit>((res, rej) => ((finish = res), (fail = rej)));
    const call = { command, args, input, cwd, killed: false, finish, fail };
    calls.push(call);
    const process: Process = { exit, kill: () => (call.killed = true) };
    return process;
  };
  return { spawn, calls };
}
