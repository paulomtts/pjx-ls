import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cache = path.join(root, ".vscode-test");

// The extension host loads CommonJS, so the TypeScript suite is bundled first.
await build({
  entryPoints: [
    path.join(root, "test/editor/suite/index.ts"),
    path.join(root, "test/editor/suite/*.test.ts"),
  ],
  outdir: path.join(cache, "suite"),
  outExtension: { ".js": ".cjs" },
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  external: ["vscode", "mocha"],
});

await runTests({
  vscodeExecutablePath: process.env.PJX_EDITOR_PATH || undefined,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(cache, "suite", "index.cjs"),
  // A private profile, so the run never reads or writes the developer's own.
  launchArgs: [
    path.join(root, "test/editor/fixtures"),
    `--user-data-dir=${path.join(cache, "user-data")}`,
    `--extensions-dir=${path.join(cache, "extensions")}`,
  ],
});
