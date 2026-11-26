// Runs the real `python -m pyjinhx.manifest` on test/fixtures/project and stores the result
// with the project's location replaced by @ROOT@, so the fixture is the same on every machine.
// Usage: node scripts/gen-manifest-fixture.mjs [python]   (default: PJX_PYTHON, then python3)
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = path.join(root, "test/fixtures/project");
const python = process.argv[2] ?? process.env.PJX_PYTHON ?? "python3";

const manifest = JSON.parse(execFileSync(python, ["-m", "pyjinhx.manifest", project], { encoding: "utf8" }));
// Builtins live in site-packages, so they differ between installs and are not under test.
// The version of the installed package differs between machines and is only logged.
delete manifest.pyjinhx_version;
manifest.components = manifest.components.filter((c) => !c.builtin);
manifest.diagnostics = manifest.diagnostics.filter((d) => d.path.startsWith(project));
const text = JSON.stringify(manifest, null, 2).replaceAll(project, "@ROOT@");
fs.writeFileSync(path.join(root, "test/fixtures/manifest/project.json"), text + "\n");
console.log(`${manifest.components.length} components`);
