import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// xarch reads Python only, so the import table of architecture.yaml is checked here.
const MAY_IMPORT: Record<string, RegExp> = {
  core: /^(\.\/|node:)/,
  vscode: /^(\.\/|\.\.\/core\/|node:|vscode$)/,
};

const imports = (path: string) => [...readFileSync(path, "utf8").matchAll(/^(?:import|export)\b[^;]*?\bfrom\s+"([^"]+)"/gms)].map((m) => m[1]);

for (const [part, allowed] of Object.entries(MAY_IMPORT)) {
  test(`src/${part}/ imports only what architecture.yaml lets it`, () => {
    const folder = new URL(`../src/${part}/`, import.meta.url);
    for (const file of readdirSync(folder)) {
      for (const target of imports(new URL(file, folder).pathname)) {
        assert.match(target, allowed, `src/${part}/${file} imports ${target}`);
      }
    }
  });
}

test("src/ holds core/, vscode/ and extension.ts, nothing else", () => {
  assert.deepEqual(readdirSync(new URL("../src/", import.meta.url)).sort(), ["core", "extension.ts", "vscode"]);
});
