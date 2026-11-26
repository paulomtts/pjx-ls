import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// The layout of pjx-ls. (xarch only reads Python, so these rules are checked here.)
//
// src/core/       Pure logic: what the extension knows of a .pjx file, a manifest and an interpreter.
//                 May import only core/ and node: modules, never vscode.
//                 Litmus: can it be tested with node --test alone, with no editor running?
// src/vscode/     Thin adapters that turn core/'s answers into VS Code providers, commands, diagnostics
//                 and status, one file per editor feature. May import core/, vscode and node:.
//                 Litmus: does it register with or call the vscode API?
// src/extension.ts  Wiring: activate() creates the shared services and registers each vscode/ feature.
const MAY_IMPORT: Record<string, RegExp> = {
  core: /^(\.\/|node:)/,
  vscode: /^(\.\/|\.\.\/core\/|node:|vscode$)/,
};

// Matches `from "x"`, `import "x"`, `require("x")` and `import("x")`, in either quote style.
const imports = (path: string) => [...readFileSync(path, "utf8").matchAll(/\b(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);

for (const [part, allowed] of Object.entries(MAY_IMPORT)) {
  test(`src/${part}/ imports only what the layout allows`, () => {
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
