import { build, context } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  external: ["vscode"],
  outfile: "dist/extension.cjs",
  sourcemap: process.argv.includes("--watch"),
};

// The private basedpyright server the extension starts for `{#python` blocks. It keeps the
// package's layout: langserver.index.js finds the rest relative to itself.
function copyServer() {
  const from = "node_modules/basedpyright/";
  const to = "dist/basedpyright/";
  const { version } = JSON.parse(readFileSync(`${from}package.json`, "utf8"));
  // The copy records the version it came from, so a bumped pin is copied again and `--watch` stays fast.
  const copied = existsSync(`${to}package.json`) && JSON.parse(readFileSync(`${to}package.json`, "utf8")).version;
  if (copied === version) return;
  rmSync(to, { recursive: true, force: true });
  mkdirSync(`${to}dist`, { recursive: true });
  cpSync(`${from}langserver.index.js`, `${to}langserver.index.js`);
  cpSync(`${from}dist/pyright-langserver.js`, `${to}dist/pyright-langserver.js`);
  cpSync(`${from}dist/typeshed-fallback`, `${to}dist/typeshed-fallback`, { recursive: true });
  cpSync(`${from}LICENSE.txt`, `${to}LICENSE.txt`);
  // This package is "type": "module"; without its own package.json the server dies with
  // "__dirname is not defined". Written last: it marks the copy as complete.
  writeFileSync(`${to}package.json`, JSON.stringify({ type: "commonjs", version }) + "\n");
}

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  copyServer();
  await ctx.watch();
  console.log("esbuild watching…");
} else {
  await build(options);
  copyServer();
  console.log("built dist/extension.cjs");
}
