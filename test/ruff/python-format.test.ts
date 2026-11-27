import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { formatPyjinhxTemplate } from "../../src/core/format.ts";
import { nodeSpawn } from "../../src/core/manifest-runner.ts";
import { formatPythonBlock, Ruff, stdinFilename, type RuffCommand } from "../../src/core/python-format.ts";

// These run the real ruff found on PATH. Without one they skip, unless PJX_REQUIRE_RUFF is set (CI).
const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));
const available = spawnSync("ruff", ["--version"]).status === 0;
if (!available && process.env.PJX_REQUIRE_RUFF) throw new Error("PJX_REQUIRE_RUFF is set and ruff is not on PATH");
const opts = available ? {} : { skip: "ruff is not on PATH" };

const PATH_RUFF: RuffCommand = { command: "ruff", args: [] };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "pjx-ruff-"));

function pipeline(file: string, cwd: string, candidates = [PATH_RUFF], sortImports = true) {
  const log: string[] = [];
  const ruff = new Ruff(nodeSpawn, (l) => log.push(l));
  const body = (b: string) => ruff.format(b, { filename: stdinFilename(file), cwd, candidates: async () => candidates, sortImports });
  return { log, body, python: (text: string) => formatPythonBlock(text, body, (l) => log.push(l)) };
}

for (const name of ["16-python-block", "17-python-after-markup"]) {
  test(`the whole pipeline on ${name}`, opts, async () => {
    const input = fs.readFileSync(`${fixtures}templates/${name}.pjx`, "utf8");
    const expected = fs.readFileSync(`${fixtures}expected-ruff/${name}.pjx`, "utf8");
    const dir = tmp();
    const { python } = pipeline(path.join(dir, `${name}.pjx`), dir);
    const once = formatPyjinhxTemplate(await python(input));
    assert.equal(once, expected);
    assert.equal(formatPyjinhxTemplate(await python(once)), once);
    assert.equal(await python(formatPyjinhxTemplate(input)), once);
  });
}

test("the configuration is found from the file name, not the cwd", opts, async () => {
  const project = tmp();
  const elsewhere = tmp();
  fs.writeFileSync(path.join(project, "pyproject.toml"), '[tool.ruff.format]\nquote-style = "single"\n');
  fs.mkdirSync(path.join(project, "ui"));
  const { python } = pipeline(path.join(project, "ui/card.pjx"), elsewhere);
  assert.equal(await python('{#python\nx = "a"\n#}\n'), "{#python\nx = 'a'\n#}\n");
});

test("a body ruff cannot parse is left alone and logged", opts, async () => {
  const dir = tmp();
  const { python, log } = pipeline(path.join(dir, "a.pjx"), dir);
  const input = "{#python\ndef f(:\n#}\n";
  assert.ok((await python(input)) === input);
  assert.equal(log.filter((l) => l.includes("exit 2")).length, 1);
});

test("a #} that ruff would write into the body is refused", opts, async () => {
  const dir = tmp();
  const { python, log } = pipeline(path.join(dir, "a.pjx"), dir);
  const input = '{#python\nx = "#" "}"\n#}\n';
  assert.ok((await python(input)) === input);
  assert.ok(log.some((l) => l.includes("#}")));
});

test("ruff's line-ending setting cannot make a mixed file", opts, async () => {
  const project = tmp();
  fs.writeFileSync(path.join(project, "pyproject.toml"), '[tool.ruff.format]\nline-ending = "lf"\n');
  const { python } = pipeline(path.join(project, "a.pjx"), project);
  const result = await python("{#python\r\nx=1\r\ny=2\r\n#}\r\n<p>a</p>\r\n");
  assert.equal(result, "{#python\r\nx = 1\r\ny = 2\r\n#}\r\n<p>a</p>\r\n");
});

test("ruff's cr-lf setting cannot put carriage returns into an LF file", opts, async () => {
  const project = tmp();
  fs.writeFileSync(path.join(project, "pyproject.toml"), '[tool.ruff.format]\nline-ending = "cr-lf"\n');
  const log: string[] = [];
  const ruff = new Ruff(nodeSpawn, (l) => log.push(l));
  const filename = stdinFilename(path.join(project, "a.pjx"));
  // The setting is read: on its own, ruff answers with CRLF.
  assert.equal(await ruff.format("x=1\n", { filename, cwd: project, candidates: async () => [PATH_RUFF] }), "x = 1\r\n");
  const result = await formatPythonBlock("{#python\nx=1\n#}\n<p>a</p>\n", (b) => ruff.format(b, { filename, cwd: project, candidates: async () => [PATH_RUFF] }));
  assert.equal(result, "{#python\nx = 1\n#}\n<p>a</p>\n");
});

test("non-ASCII text comes back as it went", opts, async () => {
  const dir = tmp();
  const { python } = pipeline(path.join(dir, "a.pjx"), dir);
  assert.equal(await python('{#python\nname="café ☕"\n#}\n'), '{#python\nname = "café ☕"\n#}\n');
});

test("a 300 KB body round-trips with only the bad line changed", opts, async () => {
  const dir = tmp();
  const { python } = pipeline(path.join(dir, "a.pjx"), dir);
  const lines = Array.from({ length: 50_000 }, () => "x = 1");
  lines[25_000] = "y=2";
  const result = await python(`{#python\n${lines.join("\n")}\n#}\n`);
  lines[25_000] = "y = 2";
  assert.equal(result, `{#python\n${lines.join("\n")}\n#}\n`);
});

test("the second candidate answers when the first has no ruff module", opts, async () => {
  const dir = tmp();
  const nothing: RuffCommand = { command: process.execPath, args: ["-e", "process.stderr.write('x: No module named ruff'); process.exit(1)", "--"] };
  const { python } = pipeline(path.join(dir, "a.pjx"), dir, [nothing, PATH_RUFF]);
  assert.equal(await python("{#python\nx=1\n#}\n"), "{#python\nx = 1\n#}\n");
});

// Import sorting: each result is also checked to be stable under a second run.
async function twice(python: (t: string) => Promise<string>, input: string): Promise<string> {
  const once = await python(input);
  assert.equal(await python(once), once);
  return once;
}
const project = (toml: string) => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "pyproject.toml"), toml);
  return dir;
};

test("imports are sorted, then formatted; sortImports false keeps their order", opts, async () => {
  const dir = tmp();
  const input = "{#python\nimport sys\nimport os\nx=1\n#}\n";
  assert.equal(await twice(pipeline(path.join(dir, "a.pjx"), dir).python, input), "{#python\nimport os\nimport sys\n\nx = 1\n#}\n");
  assert.equal(await twice(pipeline(path.join(dir, "a.pjx"), dir, [PATH_RUFF], false).python, input), "{#python\nimport sys\nimport os\n\nx = 1\n#}\n");
});

test("the project's isort table applies, whatever the cwd", opts, async () => {
  const dir = project('[tool.ruff.lint.isort]\nknown-first-party = ["zzz_mine"]\n');
  const { python } = pipeline(path.join(dir, "a.pjx"), tmp());
  const result = await twice(python, "{#python\nfrom zzz_mine import a\nimport attr\nimport os\n#}\n");
  assert.equal(result, "{#python\nimport os\n\nimport attr\n\nfrom zzz_mine import a\n#}\n");
});

test("the project's other lint rules add no fix", opts, async () => {
  const dir = project('[tool.ruff.lint]\nselect = ["F", "UP"]\nextend-select = ["Q"]\n');
  const { python } = pipeline(path.join(dir, "a.pjx"), dir);
  const result = await twice(python, "{#python\nimport unused\nimport os\nfrom typing import List\nx: List[int] = [1]\n#}\n");
  assert.ok(result.includes("import unused") && result.includes("List[int]"));
  assert.ok(result.indexOf("import os") < result.indexOf("import unused"));
});

test("required-imports are not inserted", opts, async () => {
  const dir = project('[tool.ruff.lint.isort]\nrequired-imports = ["from __future__ import annotations"]\n');
  const { python } = pipeline(path.join(dir, "a.pjx"), dir);
  const result = await twice(python, "{#python\nimport sys\nimport os\n#}\n");
  assert.ok(!result.includes("__future__"));
  assert.ok(result.indexOf("import os") < result.indexOf("import sys"));
});

test("# isort: skip_file keeps the order, the body is still formatted", opts, async () => {
  const dir = tmp();
  const { python } = pipeline(path.join(dir, "a.pjx"), dir);
  assert.equal(await twice(python, "{#python\n# isort: skip_file\nimport sys\nimport os\nx=1\n#}\n"), "{#python\n# isort: skip_file\nimport sys\nimport os\n\nx = 1\n#}\n");
});

test("a body that does not parse is left alone with one log line", opts, async () => {
  const dir = tmp();
  const { python, log } = pipeline(path.join(dir, "a.pjx"), dir);
  const input = "{#python\nimport sys\nimport os\ndef f(:\n#}\n";
  assert.ok((await python(input)) === input);
  const lines = log.filter((l) => !l.includes("ok in"));
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes("ruff format") && lines[0].includes("exit 2"));
});

test("a broken pyproject.toml leaves the body alone, one line per step", opts, async () => {
  const dir = project("[tool.ruff\n");
  const { python, log } = pipeline(path.join(dir, "a.pjx"), dir);
  const input = "{#python\nimport sys\nimport os\n#}\n";
  assert.ok((await python(input)) === input);
  assert.equal(log.filter((l) => l.startsWith("ruff check") && l.includes("exit 2")).length, 1);
  assert.equal(log.filter((l) => l.startsWith("ruff format") && l.includes("exit 2")).length, 1);
});

test("a #} that the pair would write refuses the whole answer, imports included", opts, async () => {
  const dir = tmp();
  const { python, log } = pipeline(path.join(dir, "a.pjx"), dir);
  const input = '{#python\nimport sys\nimport os\nx = "#" "}"\n#}\n';
  assert.ok((await python(input)) === input);
  assert.ok(log.some((l) => l.includes("#}")));
});

test("a CRLF document is sorted and stays CRLF", opts, async () => {
  const dir = tmp();
  const { python } = pipeline(path.join(dir, "a.pjx"), dir);
  assert.equal(await twice(python, "{#python\r\nimport sys\r\nimport os\r\n#}\r\n"), "{#python\r\nimport os\r\nimport sys\r\n#}\r\n");
});
