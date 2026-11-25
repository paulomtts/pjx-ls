import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import type { ScopedToken } from "./tokenize.ts";

const snapshotDir = fileURLToPath(new URL("./snapshots/", import.meta.url));

/** One line per non-blank token: line, quoted text, then its scopes below the root. */
export function dumpTokens(tokens: ScopedToken[]): string {
  return tokens
    .filter((token) => token.text.trim())
    .map((token) => `${token.line}: ${JSON.stringify(token.text)} ${token.scopes.slice(1).join(" ")}\n`)
    .join("");
}

/** Compare `actual` with `snapshots/<name>.txt`; `UPDATE_SNAPSHOTS=1` rewrites it. */
export function assertSnapshot(name: string, actual: string): void {
  const path = `${snapshotDir}${name}.txt`;
  if (process.env.UPDATE_SNAPSHOTS) {
    mkdirSync(snapshotDir, { recursive: true });
    writeFileSync(path, actual);
    return;
  }
  assert.ok(existsSync(path), `no snapshot ${name}; run with UPDATE_SNAPSHOTS=1`);
  assert.equal(actual, readFileSync(path, "utf8"), `snapshot ${name} differs; rerun with UPDATE_SNAPSHOTS=1`);
}
