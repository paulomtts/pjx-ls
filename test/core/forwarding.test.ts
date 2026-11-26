import { test } from "node:test";
import assert from "node:assert/strict";
import { scan, type Scan } from "../../src/core/regions.ts";
import { exclusions, isForwardable, syntheticSpans, touchesSynthetic, type Mode } from "../../src/core/forwarding.ts";

const forwardable = (text: string, parsed: Scan, offset: number, mode: Mode = "cursor") => isForwardable(exclusions(text, parsed), offset, mode);

// `|` marks the position asked about; the text has no other bar.
function at(marked: string, mode: "cursor" | "hover" = "cursor"): boolean {
  const offset = marked.indexOf("|");
  const text = marked.replace("|", "");
  return forwardable(text, scan(text), offset, mode);
}

test("markup is forwarded", () => {
  assert.ok(at("<di|v></div>"));
  assert.ok(at("<div>|</div>"));
});

test("Jinja regions are not", () => {
  assert.equal(at("<p>{{ x| }}</p>"), false);
  assert.equal(at("<p>{% i|f %}</p>"), false);
  assert.equal(at("<p>{# no|te #}</p>"), false);
  assert.equal(at("{% raw %}<b>|{% endraw %}"), true);
  assert.equal(at("{% ra|w %}"), false);
});

test("def and python blocks are not, nor an unclosed python", () => {
  assert.equal(at("{#def a: i|nt #}"), false);
  assert.equal(at("{#python\nx = 1|\n#}\n"), false);
  assert.equal(at("{#python\nx = 1|\n"), false);
});

test("a css or js body is, inclusive of the closer's start", () => {
  assert.ok(at("{#css\n.a { co|lor: red }\n#}"));
  assert.ok(at("{#js\ndocument.|\n#}"));
  assert.ok(at("{#js\nf();|#}"));
  assert.equal(at("{#js\nf();#|}"), false);
});

test("the opener line, the closer and what follows are not", () => {
  assert.equal(at("{#c|ss\n.a{}\n#}"), false);
  assert.equal(at("{#css |\n.a{}\n#}"), false);
  assert.equal(at("{#css\n.a{}\n#} <p>|</p>"), false);
});

test("script and style element bodies are", () => {
  assert.ok(at("<script>docu|ment</script>"));
  assert.ok(at("<style>a { co| }</style>"));
});

test("synthetic spans are the opener and closer lines from their columns", () => {
  const text = "<p>{#css\n.a{}\n  #}\n";
  assert.deepEqual(syntheticSpans(text, scan(text)), [
    { line: 0, from: 3 },
    { line: 2, from: 2 },
  ]);
});

test("a range touching a synthetic tag is detected", () => {
  const spans = [{ line: 0, from: 3 }, { line: 2, from: 2 }];
  const range = (a: number, b: number, c: number, d: number) => ({ start: { line: a, character: b }, end: { line: c, character: d } });
  assert.equal(touchesSynthetic(spans, range(0, 0, 0, 3)), false);
  assert.equal(touchesSynthetic(spans, range(0, 2, 0, 4)), true);
  assert.equal(touchesSynthetic(spans, range(0, 5, 0, 5)), true);
  assert.equal(touchesSynthetic(spans, range(1, 0, 1, 4)), false);
  assert.equal(touchesSynthetic(spans, range(1, 2, 2, 2)), false);
  assert.equal(touchesSynthetic(spans, range(1, 2, 2, 3)), true);
  assert.equal(touchesSynthetic(spans, range(2, 4, 2, 6)), true);
});

test("a cursor just before or after a Jinja region is in markup", () => {
  assert.ok(at("<p>|{{ x }}</p>"));
  assert.ok(at("<p>{{ x }}|</p>"));
  assert.ok(at("<p>{% x %}|<b>"));
  assert.ok(at("{% raw %}a{% endraw %}|<b>"));
  assert.ok(at("{% raw %}|a{% endraw %}"));
  assert.ok(at("{% raw %}a|{% endraw %}"));
});

test("a region that is never closed holds the cursor at the end of the text", () => {
  assert.equal(at("<p>{{ <di|"), false);
  assert.equal(at("<p>{% <di|"), false);
  assert.equal(at("<p>{# <di|"), false);
  assert.equal(at("{% raw %}<di|"), true);
  assert.equal(at("<p>{{ x }}<di|"), true);
});

test("hover asks about the character to the right", () => {
  assert.equal(at("<p>|{{ x }}</p>", "hover"), false);
  assert.ok(at("<p>{{ x }}|</p>", "hover"));
  assert.equal(at("{#css\n.a{}|#}", "hover"), false);
  assert.ok(at("{#css\n.a{|}\n#}", "hover"));
});

test("exclusions computed once answer like forwardable", () => {
  const text = "<p>{{ a }}</p>\n{#css\n.a{}\n#}<b>{% x %}</b>\n{#python\nx\n#}\n<i>{# open";
  const parsed = scan(text);
  const excluded = exclusions(text, parsed);
  for (let offset = 0; offset <= text.length; offset++) {
    for (const mode of ["cursor", "hover"] as const) {
      assert.equal(isForwardable(excluded, offset, mode), forwardable(text, parsed, offset, mode), `${mode} at ${offset}`);
    }
  }
});

test("500 asks in a document of 18k regions are quick", () => {
  const text = "<p>{{ a }}</p>{% b %}{# c #}\n".repeat(6000);
  const excluded = exclusions(text, scan(text));
  const started = performance.now();
  for (let i = 0; i < 500; i++) isForwardable(excluded, (i * 7919) % text.length, "cursor");
  assert.ok(performance.now() - started < 50);
});
