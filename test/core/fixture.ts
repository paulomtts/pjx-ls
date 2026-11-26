import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/project");

/** The stored manifest of test/fixtures/project, as `python -m pyjinhx.manifest` printed it. */
export function manifestText(root = PROJECT): string {
  const stored = path.resolve(PROJECT, "../manifest/project.json");
  return fs.readFileSync(stored, "utf8").replaceAll("@ROOT@", root);
}
