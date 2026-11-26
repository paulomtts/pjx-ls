import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { Lane, nodeSpawn } from "../../src/core/manifest-runner.ts";
import { parseManifest } from "../../src/core/manifest.ts";
import { manifestText, PROJECT } from "./fixture.ts";

const fake = path.resolve(PROJECT, "../fake-python.mjs");
const stored = parseManifest(manifestText());

test("the fake interpreter answers a path run with the whole project", async () => {
  const outcome = await new Lane(nodeSpawn).run(fake, [PROJECT]);
  assert.ok("manifest" in outcome);
  assert.deepEqual(outcome.manifest.components, stored.components);
});

test("and a --stdin run with the entries of that file only", async () => {
  const file = `${PROJECT}/ui/badge.pjx`;
  const outcome = await new Lane(nodeSpawn).run(fake, ["--stdin", "--filename", file], "<b/>");
  assert.ok("manifest" in outcome);
  assert.deepEqual(outcome.manifest.components.map((c) => c.tag), ["Badge"]);
});

test("a --stdin run answers from the text it was given", async () => {
  const file = `${PROJECT}/ui/alert.pjx`;
  const run = async (text: string) => {
    const outcome = await new Lane(nodeSpawn).run(fake, ["--stdin", "--filename", file], text);
    assert.ok("manifest" in outcome);
    return outcome.manifest.byTag("Alert")!.props.map((p) => p.name);
  };
  assert.deepEqual(await run("<p/>"), ["tone", "dismissible", "body"]);
  assert.deepEqual(await run("{#def typed: int #}"), ["typed"]);
});

test("a command that does not exist is no-interpreter", async () => {
  const outcome = await new Lane(nodeSpawn).run("/nonexistent/python", []);
  assert.ok("failure" in outcome && outcome.failure.kind === "no-interpreter");
});

// Contract: what the real command prints for the fixture project is what is stored. Set
// PJX_PYTHON to an interpreter with pyjinhx 1.17+ to run it (CI installs pyjinhx for this).
test("the real pyjinhx prints what the stored manifest holds", { skip: !process.env.PJX_PYTHON && "PJX_PYTHON is not set" }, async () => {
  const outcome = await new Lane(nodeSpawn, 30_000).run(process.env.PJX_PYTHON!, [PROJECT]);
  assert.ok("manifest" in outcome, JSON.stringify(outcome));
  const own = outcome.manifest.components.filter((c) => !c.builtin);
  assert.deepEqual(own, stored.components);
  assert.deepEqual(outcome.manifest.diagnostics.filter((d) => d.path.startsWith(PROJECT)), stored.diagnostics);
});
