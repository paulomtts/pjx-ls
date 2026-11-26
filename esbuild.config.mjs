import { build, context } from "esbuild";

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  // The UMD build of vscode-html-languageservice requires its files by relative path.
  mainFields: ["module", "main"],
  target: "node18",
  external: ["vscode"],
  outfile: "dist/extension.cjs",
  sourcemap: process.argv.includes("--watch"),
};

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("esbuild watching…");
} else {
  await build(options);
  console.log("built dist/extension.cjs");
}
