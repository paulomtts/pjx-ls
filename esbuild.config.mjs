import { build, context } from "esbuild";
import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";

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
  const marker = `${to}dist/pyright-langserver.js`;
  if (existsSync(marker) && statSync(marker).mtimeMs >= statSync(`${from}dist/pyright-langserver.js`).mtimeMs) return;
  mkdirSync(`${to}dist`, { recursive: true });
  cpSync(`${from}langserver.index.js`, `${to}langserver.index.js`);
  cpSync(`${from}dist/pyright-langserver.js`, marker);
  cpSync(`${from}dist/typeshed-fallback`, `${to}dist/typeshed-fallback`, { recursive: true });
  cpSync(`${from}LICENSE.txt`, `${to}LICENSE.txt`);
  // This package is "type": "module"; without its own package.json the server dies with
  // "__dirname is not defined".
  writeFileSync(`${to}package.json`, '{"type": "commonjs"}\n');
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
