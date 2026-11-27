import { test } from "node:test";
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { scan } from "../../src/core/regions.ts";
import { formatPythonBlock, usesRuff, type FormatBody } from "../../src/core/python-format.ts";

const to = (out: string | null) => {
  const seen: string[] = [];
  const format: FormatBody = async (b) => (seen.push(b), out);
  return { format, seen };
};
const echo: FormatBody = async (b) => b;

test("the body is handed over and the answer put back", async () => {
  const input = "{#python\nx=1\n#}\n<p>{{ x }}</p>\n";
  const { format, seen } = to("x = 1\n");
  const result = await formatPythonBlock(input, format);
  assert.equal(result, "{#python\nx = 1\n#}\n<p>{{ x }}</p>\n");
  assert.deepEqual(seen, ["x=1\n"]);
  const again = await formatPythonBlock(result, echo);
  assert.equal(result, again);
  assert.ok(result === again);
});

test("blank padding is sent as it is", async () => {
  const { format, seen } = to("x = 1\n");
  assert.equal(await formatPythonBlock("{#python\n\n\nx=1\n\n#}\n", format), "{#python\nx = 1\n#}\n");
  assert.equal(seen[0], "\n\nx=1\n\n");
});

test("CRLF is sent as LF and put back as CRLF", async () => {
  const input = "{#python\r\nx=1\r\ny=2\r\n#}\r\n<p>a</p>\r\n";
  for (const answer of ["x = 1\ny = 2\n", "x = 1\r\ny = 2\r\n"]) {
    const { format, seen } = to(answer);
    const result = await formatPythonBlock(input, format);
    assert.equal(seen[0], "x=1\ny=2\n");
    assert.equal(result, "{#python\r\nx = 1\r\ny = 2\r\n#}\r\n<p>a</p>\r\n");
    assert.ok(!/(?<!\r)\n/.test(result));
  }
});

test("an LF document stays free of carriage returns", async () => {
  const result = await formatPythonBlock("{#python\nx=1\n#}\n", to("x = 1\r\n").format);
  assert.ok(!result.includes("\r"));
});

test("a byte order mark stays first and the body is formatted", async () => {
  assert.equal(await formatPythonBlock("﻿{#python\nx=1\n#}\n", to("x = 1\n").format), "﻿{#python\nx = 1\n#}\n");
});

test("the closer line and what follows are byte-identical", async () => {
  const input = "{#python\nx=1\n#}\n<p>  a </p>\n";
  const result = await formatPythonBlock(input, to("x = 1\n").format);
  assert.equal(result.slice(result.indexOf("#}")), input.slice(input.indexOf("#}")));
});

test("an answer without a final line break keeps the closer in column 0", async () => {
  assert.equal(await formatPythonBlock("{#python\nx=1\n#}\n<p>a</p>\n", to("x = 1").format), "{#python\nx = 1\n#}\n<p>a</p>\n");
});

test("no line break after the closer is fine", async () => {
  assert.equal(await formatPythonBlock("{#python\nx=1\n#}", to("x = 1\n").format), "{#python\nx = 1\n#}");
});

test("a block after markup and a css block: only the python body changes", async () => {
  const input = "<ul class=\"rows\"><li>a</li></ul>\n{#css\n.rows{margin:0}\n#}\n{#python\n\n\nimport os\nrows=[ 'a','b' ]\n\n#}\n";
  const result = await formatPythonBlock(input, to("import os\n\nrows = []\n").format);
  assert.equal(result, "<ul class=\"rows\"><li>a</li></ul>\n{#css\n.rows{margin:0}\n#}\n{#python\nimport os\n\nrows = []\n#}\n");
});

test("nothing is sent for what has no sound body", async () => {
  const cases = [
    "<p>a</p>\n",
    "{#css\na{b:c}\n#}\n",
    "{#python\n#}\n",
    "{#python\n   \n\n  \n#}\n",
    "{#python\nx=1\n",
    "{#python\nx=1\n  #}\n",
    "{#python\nx = 1 #}\n",
    "{#python\nx=1\n#} tail\n",
    "{#python\nx=1\n#}\n{#python\ny=2\n#}\n",
    "{#python\r\nx=1\n#}\r\n",
  ];
  for (const input of cases) {
    const { format, seen } = to("x = 1\n");
    assert.ok((await formatPythonBlock(input, format)) === input, JSON.stringify(input));
    assert.equal(seen.length, 0, JSON.stringify(input));
  }
});

test("the same text comes back when the answer cannot be used", async () => {
  const input = "{#python\nx=1\n#}\n<p>a</p>\n";
  for (const answer of [null, "x=1\n", "", "\n"]) assert.ok((await formatPythonBlock(input, to(answer).format)) === input, String(answer));

  const lines: string[] = [];
  assert.ok((await formatPythonBlock(input, to('x = "#}"\n').format, (l) => lines.push(l))) === input);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes("#}"));

  const failed: string[] = [];
  const reject: FormatBody = async () => {
    throw new Error("boom");
  };
  assert.ok((await formatPythonBlock(input, reject, (l) => failed.push(l))) === input);
  assert.equal(failed.length, 1);
});

test("a document with a {#def header is formatted too", async () => {
  const result = await formatPythonBlock("{#def a: int #}\n{#python\nx=1\n#}\n", to("x = 1\n").format);
  assert.equal(result, "{#def a: int #}\n{#python\nx = 1\n#}\n");
});

const corpus = fileURLToPath(new URL("../fixtures/pyjinhx/corpus/", import.meta.url));
for (const file of globSync("*.pjx", { cwd: corpus }).sort()) {
  const name = basename(file, ".pjx");
  test(`corpus: ${name}`, async () => {
    const input = readFileSync(corpus + file, "utf8");
    const expected = JSON.parse(readFileSync(corpus + name + ".json", "utf8"));
    const block = (expected.blocks as { keyword: string; body_lines?: [number, number] | null }[]).find((b) => b.keyword === "python");
    assert.ok((await formatPythonBlock(input, echo)) === input);
    // pyjinhx and the scanner disagree here by design; the corpus test pins that.
    if ("known_gap" in expected) return;

    const { format, seen } = to("pass\n");
    const result = await formatPythonBlock(input, format);
    const lines = block?.body_lines;
    const before = input.split(/\r?\n/);
    const mixed = input.includes("\r\n") && /(?<!\r)\n/.test(input);
    const blank = !!lines && before.slice(lines[0] - 1, lines[1]).every((l) => l.trim() === "");
    if (expected.error === null && lines && !blank && !mixed) {
      assert.deepEqual(result.split(/\r?\n/), [...before.slice(0, lines[0] - 1), "pass", ...before.slice(lines[1])]);
      const after = scan(result);
      assert.equal(after.error, null);
      assert.deepEqual(after.blocks.find((b) => b.keyword === "python")!.bodyLines, [lines[0], lines[0]]);
    } else {
      assert.ok(result === input);
      assert.equal(seen.length, 0);
    }
  });
}

test("ruff runs only when asked for and trusted", () => {
  assert.equal(usesRuff("ruff", true), true);
  for (const [setting, trusted] of [["ruff", false], ["off", true], [undefined, true], ["black", true]] as const) assert.equal(usesRuff(setting, trusted), false);
});
