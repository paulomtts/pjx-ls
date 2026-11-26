#!/usr/bin/env node
// Stands in for `python` in tests: prints the stored manifest of test/fixtures/project for
// `-m pyjinhx.manifest`, the way the real command would for the files of that project.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.join(here, "project");
const manifest = JSON.parse(fs.readFileSync(path.join(here, "manifest/project.json"), "utf8").replaceAll("@ROOT@", project));

const args = process.argv.slice(2);
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
