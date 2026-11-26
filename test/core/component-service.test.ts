import { test } from "node:test";
import assert from "node:assert/strict";
import { parseManifest } from "../../src/core/manifest.ts";
import { componentCompletions, componentHover, customData } from "../../src/core/component-service.ts";
import { scan } from "../../src/core/regions.ts";
import { virtualHtml } from "../../src/core/virtual-html.ts";
import { manifestText } from "./fixture.ts";

const manifest = parseManifest(manifestText());

// `|` marks the cursor; the HTML view is what the editor's HTML service would be given.
function at(marked: string) {
  const offset = marked.indexOf("|");
  const text = marked.replace("|", "");
  const parsed = scan(text);
  return { html: virtualHtml(text, parsed), scan: parsed, offset };
}
const complete = (marked: string) => {
  const { html, scan, offset } = at(marked);
  return componentCompletions(manifest, html, scan, offset);
};
const labels = (marked: string) => complete(marked).map((i) => i.label);
const hover = (marked: string) => {
  const { html, scan, offset } = at(marked);
  const result = componentHover(manifest, html, scan, offset);
  return result ? (result.contents as { value: string }).value : null;
};

test("custom data lists a tag per component with its props as attributes", () => {
  const badge = customData(manifest).tags!.find((t) => t.name === "Badge")!;
  assert.deepEqual(badge.attributes.map((a) => a.name), ["label", "tone", "count"]);
  assert.deepEqual(badge.attributes[1].values, [{ name: "calm" }, { name: "late" }]);
  const alert = customData(manifest).tags!.find((t) => t.name === "Alert")!;
  assert.equal(alert.attributes.find((a) => a.name === "dismissible")!.valueSet, "v");
});

test("<Ba offers Badge and only components, not HTML tags", () => {
  assert.ok(labels("<Ba|").includes("Badge"));
  assert.ok(!labels("<Ba|").includes("div"));
  assert.ok(labels("<|").includes("Modal"));
});

test("inside <Badge the props are offered, required ones first", () => {
  const items = complete("<Badge |");
  assert.deepEqual(items.map((i) => i.label), ["label", "tone", "count"]);
  const order = [...items].sort((a, b) => a.sortText!.localeCompare(b.sortText!)).map((i) => i.label);
  assert.deepEqual(order.slice(0, 1), ["label"]);
});

test("Jinja in an earlier attribute does not stop the props", () => {
  assert.ok(labels('<Badge label="{{ x }}" |').includes("tone"));
});

test("inside tone=\" the Literal values are offered", () => {
  assert.deepEqual(labels('<Badge tone="|'), ["calm", "late"]);
});

test("a boolean prop is a valueless attribute", () => {
  const item = complete("<Alert |").find((i) => i.label === "dismissible")!;
  assert.ok(!(item.textEdit as { newText: string }).newText.includes("="));
});

test("Card-header is the Card component: its props are offered", () => {
  assert.ok(labels("<Badge-header |").includes("tone"));
  assert.ok(labels("<Badge.Item |").includes("tone"));
});

test("nothing is offered for an unknown tag", () => {
  assert.deepEqual(labels("<Nope |"), []);
});

test("hover on a tag shows the signature and kind", () => {
  const text = hover("<Ba|dge label='x'></Badge>")!;
  assert.match(text, /Badge\(label: str, tone: Literal\["calm", "late"\] = "calm", count: int = 0\)/);
  assert.match(text, /split/);
});

test("hover on a prop shows its annotation and default", () => {
  assert.match(hover("<Badge to|ne='calm'>")!, /tone: Literal\["calm", "late"\] = "calm"/);
  assert.equal(hover("<di|v>"), null);
});
