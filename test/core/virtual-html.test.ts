import { test } from "node:test";
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { scan } from "../../src/core/regions.ts";
import { virtualHtml } from "../../src/core/virtual-html.ts";

test("markup is left alone", () => {
  const text = `<div class="a">\n  <Card title="x"/>\n</div>\n`;
  assert.equal(virtualHtml(text), text);
});

test("{#css and {#js blocks become style and script elements", () => {
  assert.equal(virtualHtml("<p></p>\n{#css\n.a { color: red; }\n#}\n"), "<p></p>\n<style>\n.a { color: red; }\n</style>\n");
  assert.equal(virtualHtml("  {#js  \n  f();\n  #}\n"), "  <script>\n  f();\n  </script>\n");
});

test("a css opener after markup keeps the markup", () => {
  assert.equal(virtualHtml("<p>{#css\na{}\n#}"), "<p><style>\na{}\n</style>");
});

test("text after a css closer is blanked", () => {
  assert.equal(virtualHtml("{#css\na{}\n#} <p></p>\n"), `<style>\na{}\n</style>${" ".repeat(8)}\n`);
});

test("a closer after body text keeps the text", () => {
  assert.equal(virtualHtml("{#css\na{}#}\n"), "<style>\na{}</style>\n");
});

test("CRs survive on block lines", () => {
  assert.equal(virtualHtml("{#css\r\na{}\r\n#}\r\n"), "<style>\r\na{}\r\n</style>\r\n");
});

test("def and python blocks are blanked line by line", () => {
  const view = virtualHtml("{#def a: int #}\n{#python\nx = 1\n#}\n<p></p>");
  assert.equal(view, `${" ".repeat(15)}\n${" ".repeat(8)}\n${" ".repeat(5)}\n${"  "}\n<p></p>`);
});

test("Jinja comments and statements are blanked", () => {
  assert.equal(virtualHtml("<p>{# a\nb #}{% if x %}y{% endif %}</p>"), `<p>${" ".repeat(4)}\n${" ".repeat(4)}${" ".repeat(10)}y${" ".repeat(11)}</p>`);
});

test("an expression in markup or an attribute value is blanked", () => {
  assert.equal(virtualHtml(`<a href="{{ u }}">{{ t }}</a>`), `<a href="${" ".repeat(7)}">${" ".repeat(7)}</a>`);
});

test("an expression in a script or style body becomes an identifier", () => {
  assert.equal(virtualHtml("<script>f({{ a }});</script>"), "<script>f(_______);</script>");
  assert.equal(virtualHtml("<style>a { color: {{ c }}; }</style>"), "<style>a { color: _______; }</style>");
});

test("a multi-line expression in a script is one identifier and blank lines", () => {
  assert.equal(virtualHtml("<script>\n{{ a\n b }}\n</script>"), "<script>\n____\n     \n</script>");
});

test("the script of a view with a multi-line expression parses", () => {
  const view = virtualHtml("<script>\nf({{ a\n  | b }}, 2);\n</script>");
  const js = view.slice(view.indexOf("<script>") + 8, view.indexOf("</script>"));
  const source = ts.createSourceFile("view.js", js, ts.ScriptTarget.ES2022);
  assert.deepEqual((source as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics, []);
});

test("a closer and the next opener may share a line", () => {
  assert.equal(virtualHtml("{#js\nf();\n#}{#css\n.a{}\n#}\n"), "<script>\nf();\n</script><style>\n.a{}\n</style>\n");
  assert.equal(virtualHtml("{#js\nf();\n#} {#css\n.a{}\n#}\n"), "<script>\nf();\n</script> <style>\n.a{}\n</style>\n");
});

test("a block error does not remove the other css and js", () => {
  const view = virtualHtml("{#css\na{}\n#}\n{#css\nb{}\n#}\n{#js\nf();\n#}\n");
  assert.ok(view.includes("<style>\na{}\n</style>"));
  assert.ok(view.includes("<script>\nf();\n</script>"));
});

test("an unclosed {#python is blanked to the end", () => {
  assert.equal(virtualHtml("<p></p>\n{#python\nx = '<b>'\n"), `<p></p>\n${" ".repeat(8)}\n${" ".repeat(11)}\n`);
});

test("a large document is converted in linear time", () => {
  const line = "<script>f({{ a }});</script>\n<div>{{ b }}</div>\n";
  const text = line.repeat(40_000);
  const started = performance.now();
  const view = virtualHtml(text);
  assert.equal(view.length, text.length);
  assert.ok(performance.now() - started < 3000);
});

test("a statement in a script body is blanked", () => {
  assert.equal(virtualHtml("<script>{% if a %}f();{% endif %}</script>"), `<script>${" ".repeat(10)}f();${" ".repeat(11)}</script>`);
});

test("nothing in a css or js block body is Jinja", () => {
  assert.equal(virtualHtml("{#js\nf({{ a }}); {% b %}\n#}"), "<script>\nf({{ a }}); {% b %}\n</script>");
});

test("raw delimiters are blanked and the body is kept", () => {
  assert.equal(virtualHtml("{% raw %}<b>{{ x }}</b>{% endraw %}"), `${" ".repeat(9)}<b>{{ x }}</b>${" ".repeat(12)}`);
});

test("a byte order mark is blanked", () => {
  assert.equal(virtualHtml("﻿<p></p>"), " <p></p>");
});

// The properties every view has, whatever the document.
const root = fileURLToPath(new URL("../fixtures/", import.meta.url));
const documents = [
  ...globSync("pyjinhx/corpus/*.pjx", { cwd: root }),
  ...globSync("templates/*.pjx", { cwd: root }),
  ...globSync("expected/*.pjx", { cwd: root }),
].sort();

// The offsets a view may rewrite: Jinja regions and the lines of css/js openers and closers.
function rewritable(text: string): Set<number> {
  const { regions, blocks } = scan(text);
  const offsets = new Set<number>(text.startsWith("﻿") ? [0] : []);
  const add = (start: number, end: number) => {
    for (let i = start; i < end; i++) offsets.add(i);
  };
  const lineEnd = (from: number) => (text.indexOf("\n", from) + 1 || text.length + 1) - 1;
  for (const r of regions) {
    if (r.body) {
      add(r.start, r.body.start);
      add(r.body.end, r.end);
    } else add(r.start, r.end);
  }
  for (const b of blocks.filter((b) => b.keyword === "css" || b.keyword === "js")) {
    add(b.opener.start, lineEnd(b.opener.start));
    add(b.closer.start, lineEnd(b.closer.start));
  }
  return offsets;
}

for (const file of documents) {
  test(`view of ${file} keeps lines and unrewritten characters`, () => {
    const text = readFileSync(root + file, "utf8");
    const view = virtualHtml(text);
    const lines = text.split("\n");
    const viewLines = view.split("\n");
    assert.equal(viewLines.length, lines.length);
    const free = rewritable(text);
    let offset = 0;
    lines.forEach((line, row) => {
      for (let col = 0; col < line.length; col++) {
        if (!free.has(offset + col)) assert.equal(viewLines[row][col], line[col], `line ${row + 1}, column ${col + 1}`);
      }
      offset += line.length + 1;
    });
  });
}

test("astral characters keep their length", () => {
  assert.equal(virtualHtml("<p>😀{{ x }}😀</p>"), `<p>😀${" ".repeat(7)}😀</p>`);
});
