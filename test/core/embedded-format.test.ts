import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyEdits, embeddedBodies, formatEmbedded, type FormatSource } from "../../src/core/embedded-format.ts";
import { formatPyjinhxTemplate } from "../../src/core/format.ts";

const bodiesOf = (text: string) => embeddedBodies(text).map((b) => [b.kind, text.slice(b.range.start, b.range.end), b.tagStart, b.skip]);
const kinds = (text: string) => embeddedBodies(text).map((b) => [b.kind, b.skip]);
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../fixtures/templates/${name}`, import.meta.url)), "utf8");

test("a css and a js block after markup", () => {
  const text = "<p>x</p>\n{#css\n.a{}\n#}\n{#js\nlet a=1\n#}\n";
  assert.deepEqual(bodiesOf(text), [
    ["css", ".a{}\n", null, null],
    ["js", "let a=1\n", null, null],
  ]);
});

test("an indented closer stays out of the range", () => {
  const text = "{#css\n.a{}\n  #}\n";
  assert.deepEqual(bodiesOf(text), [["css", ".a{}\n", null, null]]);
});

test("closer on the body line, empty and blank bodies are no body", () => {
  assert.deepEqual(bodiesOf("{#css\n.a{}#}\n"), []);
  assert.deepEqual(bodiesOf("{#js\n#}\n"), []);
  assert.deepEqual(bodiesOf("{#js\n \n\n#}\n"), []);
});

test("a block body with Jinja is still a body", () => {
  assert.deepEqual(kinds("{#css\n.a{color:{{ x }}}\n{% if a %}\n#}\n"), [["css", null]]);
});

test("elements at depth 0 and nested, and a multi-line open tag", () => {
  const text = '<style>\n.a{}\n</style>\n<div>\n  <script\n    type="module"\n    defer>\nlet a=1\n</script></div>\n';
  const bodies = embeddedBodies(text);
  assert.deepEqual(bodies.map((b) => b.kind), ["css", "js"]);
  assert.equal(bodies[0].tagStart, 0);
  assert.equal(bodies[1].tagStart, text.indexOf("<script"));
  assert.equal(bodies[1].line, 5);
});

test("script types", () => {
  for (const open of ['<SCRIPT TYPE="Module">', '<script type="text/javascript">', "<script type=''>", "<script>"]) {
    assert.deepEqual(kinds(`${open}\nlet a=1\n</script>`), [["js", null]], open);
  }
  for (const open of ['<script type="application/json">', '<script type="importmap">', '<script type="text/x-template">', '<script type="{{ t }}">']) {
    assert.deepEqual(kinds(`${open}\nlet a=1\n</script>`), [], open);
  }
});

test("style types and lang", () => {
  assert.deepEqual(kinds('<style type="text/css" media="print">\n.a{}\n</style>'), [["css", null]]);
  assert.deepEqual(kinds('<style lang="scss">\n.a{}\n</style>'), []);
  assert.deepEqual(kinds('<style type="text/less">\n.a{}\n</style>'), []);
});

test("one-line and blank element bodies are no body", () => {
  assert.deepEqual(kinds("<script>go()</script>"), []);
  assert.deepEqual(kinds('<script src="x.js"></script>'), []);
  assert.deepEqual(kinds("<style>\n \n</style>"), []);
});

test("an element body with Jinja is skipped", () => {
  for (const jinja of ["{{ x }}", "{% if a %}", "{# note #}", "{{ x"]) {
    assert.deepEqual(kinds(`<script>\nlet a = ${jinja}\n</script>`), [["js", "it holds Jinja"]], jinja);
  }
});

test("raw, comments and slot values", () => {
  assert.deepEqual(kinds("{% raw %}<style>\n.a{}\n</style>{% endraw %}"), [["css", "it holds Jinja"]]);
  assert.deepEqual(kinds("<!-- <style>\n.a{}\n</style> -->"), []);
  assert.deepEqual(kinds('<Card body="<style>\n.a{}\n</style>"/>'), []);
});

test("the fixtures after the pjx rules", () => {
  const one = formatPyjinhxTemplate(fixture("18-css-js-blocks.pjx"));
  assert.deepEqual(kinds(one), [["css", null], ["js", null]]);
  const two = formatPyjinhxTemplate(fixture("19-style-script.pjx"));
  assert.deepEqual(kinds(two), [["css", null], ["js", null], ["js", "it holds Jinja"]]);
});

const to = (out: string | null) => {
  const seen: string[] = [];
  const format: FormatSource = async (s) => (seen.push(s), out);
  return { format, seen };
};
const echo: FormatSource = async (s) => s;
const run = (text: string, format: FormatSource, kind: "css" | "js" = "css") => formatEmbedded(text, { [kind]: format });

test("applyEdits", () => {
  assert.equal(applyEdits("abc", []), "abc");
  const edits = [
    { start: 0, end: 1, newText: "X" },
    { start: 2, end: 2, newText: "-" },
    { start: 3, end: 3, newText: "!" },
  ];
  assert.equal(applyEdits("abc", edits), "Xb-c!");
  assert.equal(applyEdits("abc", [...edits].reverse()), "Xb-c!");
  assert.equal(applyEdits("abc", [{ start: 1, end: 2, newText: "" }]), "ac");
});

test("a css block is handed over dedented and put back in column 0", async () => {
  const { format, seen } = to(".a {\n  color: red\n}");
  const text = "<p>x</p>\n{#css\n\n  .a{color:red}\n  #}\n";
  const result = await run(text, format);
  assert.deepEqual(seen, [".a{color:red}\n"]);
  assert.equal(result, "<p>x</p>\n{#css\n.a {\n  color: red\n}\n  #}\n");
  assert.ok(result === (await run(result, echo)));
});

test("a style under an indented tag", async () => {
  const text = "<div>\n  <style>\n.a{}\n\n.b{}\n</style>\n</div>\n";
  const result = await run(text, to(".a {}\n\n.b {}\n").format);
  assert.equal(result, "<div>\n  <style>\n    .a {}\n\n    .b {}\n  </style>\n</div>\n");
});

test("a glued open tag keeps what follows its close tag", async () => {
  const result = await run("  <span><style>\n.a{}\n</style></span>\n", to(".a {}").format);
  assert.equal(result, "  <span><style>\n    .a {}\n  </style></span>\n");
});

test("two glued elements read each other's indentation", async () => {
  const text = "  <style>\n.a{}\n</style><script>\nlet a=1\n</script>\n";
  const result = await formatEmbedded(text, { css: to(".a {}").format, js: to("let a = 1").format });
  assert.equal(result, "  <style>\n    .a {}\n  </style><script>\n    let a = 1\n  </script>\n");
});

test("a multi-line open tag", async () => {
  const text = '<div>\n  <script\n    type="module"\n    defer>\nlet a=1\n</script>\n</div>\n';
  const result = await run(text, to("let a = 1").format, "js");
  assert.equal(result, '<div>\n  <script\n    type="module"\n    defer>\n    let a = 1\n  </script>\n</div>\n');
});

test("an answer's edges do not matter", async () => {
  const text = "{#css\n.a{}\n#}\n";
  const a = await run(text, to("\n\n.a {}  \n\n\n").format);
  const b = await run(text, to(".a {}").format);
  assert.equal(a, b);
});

test("a clean body follows its tag", async () => {
  const text = "<div>\n  <style>\n.a {}\n</style>\n</div>\n";
  assert.equal(await run(text, echo), "<div>\n  <style>\n    .a {}\n  </style>\n</div>\n");
});

test("a kind without a formatter is not sent", async () => {
  const { format, seen } = to("x");
  const logs: string[] = [];
  const text = "{#js\nlet a\n#}\n";
  assert.ok((await formatEmbedded(text, { css: format }, (l) => logs.push(l))) === text);
  assert.deepEqual(seen, []);
  assert.deepEqual(logs, []);
  assert.ok((await formatEmbedded(text, {})) === text);
});

test("a formatter that fails leaves its body and not the others", async () => {
  const text = "<style>\n.a{}\n</style>\n{#css\n.b{}\n#}\n";
  for (const bad of [null, "", " \n "]) {
    let n = 0;
    const result = await run(text, async () => (n++ === 0 ? bad : ".b {}"));
    assert.equal(result, "<style>\n.a{}\n</style>\n{#css\n.b {}\n#}\n");
  }
  const logs: string[] = [];
  let n = 0;
  const result = await formatEmbedded(text, { css: async () => { if (n++ === 0) throw new Error("boom"); return ".b {}"; } }, (l) => logs.push(l));
  assert.equal(result, "<style>\n.a{}\n</style>\n{#css\n.b {}\n#}\n");
  assert.equal(logs.length, 1);
  assert.match(logs[0], /line 1.*boom/);
});

test("an answer that would break its container is not used", async () => {
  const block = "{#css\n.a{}\n#}\n";
  const logs: string[] = [];
  assert.ok((await formatEmbedded(block, { css: to("/* #} */").format }, (l) => logs.push(l))) === block);
  assert.equal(logs.length, 1);
  for (const bad of ["a</STYLE>", "a {{", "a {%", "a {#"]) {
    const text = "<style>\n.a{}\n</style>\n";
    assert.ok((await run(text, to(bad).format)) === text, bad);
  }
});

test("an element body with Jinja is not sent", async () => {
  const { format, seen } = to("x");
  const logs: string[] = [];
  const text = "<p></p>\n<script>\nlet a = {{ v }}\n</script>\n";
  assert.ok((await formatEmbedded(text, { js: format }, (l) => logs.push(l))) === text);
  assert.deepEqual(seen, []);
  assert.deepEqual(logs, ["js body (line 2): it holds Jinja; left as it is"]);
});

test("strings that span lines", async () => {
  const lit = "const s = `a\n  b`;\n";
  const column0 = `{#js\n${lit}#}\n`;
  assert.equal(await run(column0, echo, "js"), column0);
  assert.equal((await run(column0, to("X").format, "js")), "{#js\nX\n#}\n");
  for (const text of [`<script>\n${lit}</script>\n`, `{#js\n  const s = \`a\n  b\`;\n#}\n`, "{#js\n  let a = 'x\\\n y'\n#}\n"]) {
    const { format, seen } = to("X");
    assert.ok((await run(text, format, "js")) === text, text);
    assert.deepEqual(seen, []);
  }
  const { format, seen } = to("X");
  await run("<script>\nlet a = `one` + `two`\n</script>\n", format, "js");
  assert.equal(seen.length, 1);
});

test("CRLF", async () => {
  const text = "<p>a</p>\r\n{#css\r\n.a{}\r\n.b{}\r\n#}\r\n";
  for (const answer of [".a {}\n.b {}\n", ".a {}\r\n.b {}\r\n"]) {
    const { format, seen } = to(answer);
    const result = await run(text, format);
    assert.deepEqual(seen, [".a{}\n.b{}\n"]);
    assert.equal(result, "<p>a</p>\r\n{#css\r\n.a {}\r\n.b {}\r\n#}\r\n");
  }
  const mixed = "{#css\r\n.a{}\n#}\n";
  assert.ok((await run(mixed, to("x").format)) === mixed);
});

test("a byte order mark stays; a block error leaves the text", async () => {
  assert.equal(await run("\uFEFF{#css\n.a{}\n#}\n", to(".a {}").format), "\uFEFF{#css\n.a {}\n#}\n");
  for (const text of ["{#css\n.a{}\n#}\n{#css\n.b{}\n#}\n", "<p></p>\n#}\n", "{#python\nx=1\n<style>\n.a{}\n</style>\n"]) {
    assert.ok((await run(text, to("x").format)) === text, text);
  }
});

test("three bodies, the middle one kept, each in its own place", async () => {
  const text = "<style>\n.a{}\n</style>\n<style lang=\"scss\">\n.b{}\n</style>\n{#css\n.c{}\n#}\n";
  const answers = [".a {\n  color: red\n}", ".c {\n  color: blue;\n  top: 0\n}"];
  let n = 0;
  const result = await run(text, async () => answers[n++]);
  assert.equal(result, '<style>\n  .a {\n    color: red\n  }\n</style>\n<style lang="scss">\n.b{}\n</style>\n{#css\n.c {\n  color: blue;\n  top: 0\n}\n#}\n');
});

// A test formatter: trims every line and indents two spaces per open `{`.
const tidy: FormatSource = async (source) => {
  let depth = 0;
  const out = source.split("\n").map((raw) => {
    const line = raw.trim();
    if (line.startsWith("}")) depth = Math.max(0, depth - 1);
    const text = line && "  ".repeat(depth) + line;
    if (line.endsWith("{")) depth++;
    return text;
  });
  return out.join("\n");
};
const P = (x: string) => formatEmbedded(formatPyjinhxTemplate(x), { css: tidy, js: tidy });

test("the whole pipeline is a fixed point", async () => {
  const cases = [
    fixture("18-css-js-blocks.pjx"),
    fixture("19-style-script.pjx"),
    "<div>{% if a %}<div>{% if b %}<div><style>\n.a{\n   color:red;\n  .b{\n x:1}\n}\n</style></div>{% endif %}</div>{% endif %}</div>\n",
    "<main><style>\n  /* two\n     line */\n.a {\ncolor: red\n}\n</style><script>\nfunction f(){\nreturn 1\n}\n</script></main>\n{#css\n  .x{\ny:1\n}\n#}\n",
  ];
  for (const x of cases) {
    for (const input of [x, x.replaceAll("\n", "\r\n")]) {
      const once = await P(input);
      assert.equal(await P(once), once);
      assert.equal(formatPyjinhxTemplate(once), once);
    }
  }
  const out = await P(fixture("19-style-script.pjx"));
  assert.ok(out.includes("<section>\n  <style>\n    .a{color:red}\n  </style>"));
});

test("an element with no close tag is no body", async () => {
  // A half-typed `<script>` runs to the end of the text; the markup after it is not script.
  for (const text of ['<script>\nlet a=1\n<div class="x">hi</div>\n', "<style>\n.a{}\n<p>x</p>\n"]) {
    assert.deepEqual(kinds(text), [[text.startsWith("<style") ? "css" : "js", "it has no close tag"]], text);
    const { format, seen } = to("X");
    assert.ok((await formatEmbedded(text, { css: format, js: format })) === text, text);
    assert.deepEqual(seen, []);
  }
  assert.deepEqual(kinds("<script>\nlet a=1\n</SCRIPT>"), [["js", null]]);
});
