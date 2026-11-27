#!/usr/bin/env node
// Stands in for `python` in tests: prints the stored manifest of test/fixtures/project for
// `-m pyjinhx.manifest`, the way the real command would for the files of that project.
// For `-m ruff format --stdin-filename <f>.py -` it plays a tiny ruff: `x=1` becomes `x = 1`; a body
// holding SYNTAX fails like a parse error (exit 2) and one holding NOMODULE like a missing module.
// For `-m ruff check --select I001 --fix-only --stdin-filename <f>.py -` it sorts the leading run of
// `import <name>` lines and changes nothing else (SYNTAX passes through with exit 0, as in ruff).
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.join(here, "project");
const manifest = JSON.parse(fs.readFileSync(path.join(here, "manifest/project.json"), "utf8").replaceAll("@ROOT@", project));

const args = process.argv.slice(2);
if (args[0] === "-m" && args[1] === "ruff") {
  const formatting = args[2] === "format" && args[3] === "--stdin-filename" && args[4]?.endsWith(".py") && args[5] === "-";
  const sorting = args.slice(2, 6).join(" ") === "check --select I001 --fix-only" && args[6] === "--stdin-filename" && args[7]?.endsWith(".py") && args[8] === "-";
  if (!formatting && !sorting) {
    console.error(`fake-python: unexpected ruff arguments ${args.join(" ")}`);
    process.exit(1);
  }
  const target = formatting ? args[4] : args[7];
  if (process.env.PJX_FAKE_LOG) fs.appendFileSync(process.env.PJX_FAKE_LOG, `ruff ${formatting ? "format" : "check"} ${target} cwd=${process.cwd()}\n`);
  const stdin = fs.readFileSync(0, "utf8");
  if (stdin.includes("NOMODULE")) {
    console.error("fake-python: No module named ruff");
    process.exit(1);
  }
  if (sorting) {
    const lines = stdin.split("\n");
    let end = 0;
    while (end < lines.length && /^import \w+$/.test(lines[end])) end++;
    process.stdout.write([...lines.slice(0, end).sort(), ...lines.slice(end)].join("\n"));
    process.exit(0);
  }
  if (stdin.includes("SYNTAX")) {
    console.error(`error: Failed to parse ${target}`);
    process.exit(2);
  }
  process.stdout.write(stdin.trim().replace(/^(\w+)[ \t]*=[ \t]*(.+)$/gm, "$1 = $2") + "\n");
process.exit(0);
}
if (args[0] !== "-m" || args[1] !== "pyjinhx.manifest") {
  console.error(`fake-python: unexpected arguments ${args.join(" ")}`);
  process.exit(1);
}
if (process.env.PJX_FAKE_LOG) fs.appendFileSync(process.env.PJX_FAKE_LOG, `${args.slice(2).join(" ")}\n`);
const file = args.includes("--stdin") ? args[args.indexOf("--filename") + 1] : null;
if (file) {
  // What the buffer says shows in the answer: a template's props become the name after its `{#def`.
  const typed = /\{#def\s+(\w+)/.exec(fs.readFileSync(0, "utf8"))?.[1];
  manifest.components = manifest.components.filter((c) => c.document.path === file || c.class?.path === file);
  manifest.diagnostics = manifest.diagnostics.filter((d) => d.path === file);
  for (const c of manifest.components) if (typed && c.kind === "template") c.props = [{ ...c.props[0], name: typed, required: true, literal_values: null, slot: false, children: false, annotation: "int", default: null }];
}
process.stdout.write(JSON.stringify(manifest));
