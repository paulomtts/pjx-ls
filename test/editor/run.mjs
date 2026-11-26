import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const executable = process.env.PJX_EDITOR_PATH || undefined;
const editor = executable && path.basename(executable) === "cursor" ? "cursor" : "code";
// One private profile per editor, so neither ever reads or writes the developer's own.
const cache = path.join(root, ".vscode-test", editor);
const home = path.join(cache, "home");
const outdir = path.join(cache, "suite");

// The extension host loads CommonJS, so the TypeScript suite is bundled first.
fs.rmSync(outdir, { recursive: true, force: true });
await build({
  entryPoints: [
    path.join(root, "test/editor/suite/index.ts"),
    path.join(root, "test/editor/suite/*.test.ts"),
  ],
  outdir,
  outExtension: { ".js": ".cjs" },
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  external: ["vscode", "mocha"],
});

// Cursor's launcher names its window class and desktop file "cursor", so a test run
// would join the developer's running instance. A copy of its entry point under another
// desktop name, started by electron directly, keeps the run apart.
function cursorLauncher(binary) {
  const app = path.join(path.dirname(fs.realpathSync(binary)), "resources/app");
  // Each patch must change the text: isolation must never silently fail.
  const patch = (text, from, to) => {
    if (!text.includes(from)) throw new Error(`cursor.mjs no longer contains ${from}; update the launcher in test/editor/run.mjs`);
    return text.replace(from, to);
  };
  let entry = fs.readFileSync(path.join(app, "cursor.mjs"), "utf8");
  entry = patch(entry, "import.meta.dirname", JSON.stringify(app));
  entry = patch(entry, 'new URL("./package.json", import.meta.url)', `new URL(${JSON.stringify(`file://${app}/package.json`)})`);
  entry = patch(entry, 'name + ".desktop"', '"pjxtest.desktop"');
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, "cursor.mjs"), entry);
  const script = path.join(cache, "cursor-test");
  fs.writeFileSync(
    script,
    `#!/bin/sh\nexec ${process.env.PJX_ELECTRON || "/usr/lib/electron42/electron"} --class=pjxtest ${path.join(cache, "cursor.mjs")} --password-store=basic "$@"\n`,
    { mode: 0o755 },
  );
  return script;
}

// The editor's IPC socket lives under the user data dir and must fit in 107 bytes.
const userData = path.join(cache, "user-data");
if (userData.length > 80) throw new Error(`${userData} is too long for the editor's IPC socket; run from a shorter path`);

await runTests({
  vscodeExecutablePath: editor === "cursor" ? cursorLauncher(executable) : executable,
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(outdir, "index.cjs"),
  extensionTestsEnv: {
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, "config"),
    XDG_CACHE_HOME: path.join(home, "cache"),
    XDG_DATA_HOME: path.join(home, "data"),
    XDG_STATE_HOME: path.join(home, "state"),
  },
  launchArgs: [
    path.join(root, "test/fixtures/project"),
    `--user-data-dir=${userData}`,
    `--extensions-dir=${path.join(cache, "extensions")}`,
  ],
});
