import { test } from "node:test";
import assert from "node:assert/strict";
import { parseManifest, Manifest, type Component } from "../../src/core/manifest.ts";
import { componentCompletions, componentHover, shadowedAttributes } from "../../src/core/component-service.ts";
import { scan } from "../../src/core/regions.ts";
import { manifestText } from "./fixture.ts";

const manifest = parseManifest(manifestText());

// `|` marks the cursor.
function at(marked: string) {
  const offset = marked.indexOf("|");
  const text = marked.replace("|", "");
  return { text, scan: scan(text), offset };
}
const complete = (marked: string, m = manifest) => {
  const { text, scan, offset } = at(marked);
  return componentCompletions(m, text, scan, offset);
};
const labels = (marked: string) => complete(marked).map((i) => i.label);
const hover = (marked: string) => {
  const { scan, offset } = at(marked);
  return componentHover(manifest, scan, offset)?.markdown ?? null;
};

test("<Ba and a bare < offer components, each tag once", () => {
  assert.ok(labels("<Ba|").includes("Badge"));
  assert.ok(labels("<|").includes("Modal"));
  const all = labels("<|");
  assert.equal(new Set(all).size, all.length);
  assert.ok(!all.includes("div"));
});

test("a lowercase start is not a component: <button never offers Button", () => {
  const button = (rank: Partial<Component>) => ({ ...manifest.byTag("Badge")!, tag: "Button", ...rank });
  const m = new Manifest([button({})], []);
  assert.deepEqual(complete("<button |", m), []);
  assert.deepEqual(componentHover(m, scan("<button>"), 3), null);
  assert.equal(complete("<Butt|", m).length, 1);
});

test("duplicate tags are listed once, the replacing or project component answering", () => {
  const base = manifest.byTag("Badge")!;
  const m = new Manifest([{ ...base, builtin: true, kind: "py-template" }, base, { ...base, kind: "template", replaces: true }, { ...base, tag: "Other" }], []);
  assert.deepEqual(complete("<|", m).map((e) => e.label), ["Badge", "Other"]);
  assert.equal(m.byTag("Badge")!.kind, "template");
});

test("inside <Badge the props are offered, required ones first", () => {
  const items = complete("<Badge |");
  assert.deepEqual(items.map((i) => i.label), ["label", "tone", "count"]);
  assert.deepEqual([...items].sort((a, b) => a.sortText.localeCompare(b.sortText))[0].label, "label");
});

test("props already written are not offered again, and the one being typed is replaced", () => {
  assert.deepEqual(labels('<Badge label="x" |'), ["tone", "count"]);
  const item = complete("<Badge to|").find((i) => i.label === "tone")!;
  assert.deepEqual(item.replace, { start: 7, end: 9 });
});

test("Jinja in an earlier attribute does not stop the props", () => {
  assert.ok(labels('<Badge label="{{ x }}" |').includes("tone"));
});

test("inside tone=\" the Literal values are offered", () => {
  assert.deepEqual(labels('<Badge tone="|'), ["calm", "late"]);
  assert.deepEqual(labels('<Badge tone="ca|" label="x">'), ["calm", "late"]);
  assert.deepEqual(labels('<Badge label="|'), []);
});

test("a boolean prop is a bare attribute, the others take a value", () => {
  const items = complete("<Alert |");
  assert.equal(items.find((i) => i.label === "dismissible")!.snippet, undefined);
  assert.equal(items.find((i) => i.label === "tone")!.snippet, 'tone="$1"');
  assert.equal(items.find((i) => i.label === "tone")!.retrigger, true);
});

test("Badge-header and Badge.Item are the Badge component", () => {
  assert.ok(labels("<Badge-header |").includes("tone"));
  assert.ok(labels("<Badge.Item |").includes("tone"));
  assert.deepEqual(labels("<Badge-he|ader"), []);
});

test("nothing is offered for an unknown tag, plain HTML, a closing tag or after the >", () => {
  assert.deepEqual(labels("<Nope |"), []);
  assert.deepEqual(labels("<div |"), []);
  assert.deepEqual(labels("</Ba|"), []);
  assert.deepEqual(labels("<Badge>|"), []);
  assert.deepEqual(labels("<p>text|"), []);
});

test("no HTML items: close tags and HTML attributes are the HTML service's", () => {
  assert.ok(complete("<Badge |").every((e) => e.kind === "prop"));
  assert.ok(complete("<Badge><|").every((e) => e.kind === "component"));
});

test("hover on a tag shows the signature and kind", () => {
  const text = hover("<Ba|dge label='x'></Badge>")!;
  assert.match(text, /Badge\(label: str, tone: Literal\["calm", "late"\] = "calm", count: int = 0\)/);
  assert.match(text, /split/);
  assert.ok(hover("<Badge-he|ader>"));
});

test("hover on a prop shows its annotation and default", () => {
  assert.match(hover("<Badge to|ne='calm'>")!, /tone: Literal\["calm", "late"\] = "calm"/);
  assert.equal(hover("<di|v>"), null);
  assert.equal(hover("<Badge zz|z='1'>"), null);
});

test("a {#css or {#js block above the cursor changes nothing", () => {
  const above = "{#css\n.a { color: red; }\n#}\n{#js\nlet x = 1;\n#}\n";
  assert.ok(labels(above + "<Ba|").includes("Badge"));
  assert.deepEqual(labels(above + "<Badge |"), ["label", "tone", "count"]);
  assert.deepEqual(labels(above + '<Badge tone="|'), ["calm", "late"]);
  assert.match(hover(above + "<Alert></Alert>\n<Ba|dge>")!, /^```python\nBadge\(/);
  const { text, scan: parsed, offset } = at(above + "<Badge to|ne='calm'>");
  assert.equal(text.slice(...Object.values(componentHover(manifest, parsed, offset)!.range) as [number, number]), "tone");
});

test("< in a script, a style or a js/css/python block body is code, not a tag", () => {
  assert.deepEqual(labels("{#js\nif (a <B|)\n#}\n"), []);
  assert.deepEqual(labels("{#css\na <B|\n#}\n"), []);
  assert.deepEqual(labels("{#python\nx = a <B|\n#}\n<p/>"), []);
  assert.deepEqual(labels("<script>if (a <B|)</script>"), []);
  assert.deepEqual(labels("<style>a <B|</style>"), []);
  assert.ok(labels("<script></script><Ba|").includes("Badge"));
});

test("choosing a prop on an attribute that has its value renames it", () => {
  const item = complete('<Badge to|ne="calm">').find((i) => i.label === "tone")!;
  assert.equal(item.snippet, undefined);
  assert.deepEqual(item.replace, { start: 7, end: 11 });
});

test("a tag is offered whatever the case of what is typed: <but finds Button", () => {
  const m = new Manifest([{ ...manifest.byTag("Badge")!, tag: "Button" }], []);
  assert.deepEqual(complete("<but|", m).map((e) => e.label), ["Button"]);
  assert.deepEqual(complete("<x|", m), []);
});

test("the props of the component are what the HTML service's entries must not shadow", () => {
  const shadow = (marked: string) => {
    const { text, scan: parsed, offset } = at(marked);
    return [...shadowedAttributes(manifest, text, parsed, offset)];
  };
  assert.deepEqual(shadow("<Badge |"), ["label", "tone", "count"]);
  assert.deepEqual(shadow("<Badge-x to|"), ["label", "tone", "count"]);
  assert.deepEqual(shadow("<div |"), []);
  assert.deepEqual(shadow("<Badge|"), []);
  assert.deepEqual(shadow('<Badge tone="|'), []);
  assert.deepEqual(shadow("<script>if (a <Badge |</script>"), []);
});
