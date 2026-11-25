import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../../scripts/sync-pyjinhx.mjs", import.meta.url));
const vendoredDir = fileURLToPath(new URL("../fixtures/pyjinhx/", import.meta.url));

const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
const sync = (...args: string[]) => spawnSync("node", [script, ...args], { encoding: "utf8" });
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

function fakeCheckout(): string {
  const dir = mkdtempSync(join(tmpdir(), "pjx-sync-"));
  mkdirSync(join(dir, "pyjinhx"));
  mkdirSync(join(dir, "tests/fixtures/block_grammar/nested"), { recursive: true });
  writeFileSync(join(dir, "pyjinhx/block_grammar.json"), '{"version": 1}\n');
  writeFileSync(join(dir, "pyproject.toml"), '[project]\nversion = "9.9.9"\n');
  writeFileSync(join(dir, "tests/fixtures/block_grammar/a.pjx"), "<p></p>\n");
  writeFileSync(join(dir, "tests/fixtures/block_grammar/nested/b.json"), "{}\n");
  git(dir, "init", "-q");
  git(dir, "add", "-A");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "x");
  return dir;
}
const freshDest = () => mkdtempSync(join(tmpdir(), "pjx-dest-"));

test("sync copies the grammar and corpus, including subdirectories, and records the source", () => {
  const checkout = fakeCheckout();
  const dest = freshDest();
  const run = sync("--dest", dest, checkout);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(readFileSync(join(dest, "corpus/nested/b.json"), "utf8"), "{}\n");
  const source = JSON.parse(readFileSync(join(dest, "SOURCE.json"), "utf8"));
  const commit = git(checkout, "rev-parse", "HEAD");
  assert.equal(source.commit, commit);
  assert.equal(source.ref, commit);
  assert.equal(source.pyproject_version, "9.9.9");
  assert.equal(source.block_grammar_version, 1);
  assert.equal(source.sha256["corpus/nested/b.json"], sha256(join(dest, "corpus/nested/b.json")));
});

test("a tagged checkout records the tag as its ref", () => {
  const checkout = fakeCheckout();
  git(checkout, "tag", "v9.9.9");
  const dest = freshDest();
  assert.equal(sync("--dest", dest, checkout).status, 0);
  assert.equal(JSON.parse(readFileSync(join(dest, "SOURCE.json"), "utf8")).ref, "v9.9.9");
});

test("a dirty checkout is refused and nothing is written", () => {
  const checkout = fakeCheckout();
  writeFileSync(join(checkout, "pyjinhx/block_grammar.json"), '{"version": 2}\n');
  const dest = freshDest();
  const run = sync("--dest", dest, checkout);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /uncommitted/);
  assert.deepEqual(readdirSync(dest), []);
});

test("a failed sync leaves the previous corpus in place", () => {
  const good = fakeCheckout();
  const dest = freshDest();
  assert.equal(sync("--dest", dest, good).status, 0);
  const broken = fakeCheckout();
  git(broken, "rm", "-rq", "tests");
  git(broken, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "drop corpus");
  assert.notEqual(sync("--dest", dest, broken).status, 0);
  assert.equal(readFileSync(join(dest, "corpus/a.pjx"), "utf8"), "<p></p>\n");
});

test("--check lists differing files and exits 1; a match exits 0", () => {
  const checkout = fakeCheckout();
  const dest = freshDest();
  sync("--dest", dest, checkout);
  assert.equal(sync("--check", "--dest", dest, checkout).status, 0);
  writeFileSync(join(dest, "corpus/a.pjx"), "changed\n");
  const run = sync("--check", "--dest", dest, checkout);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /corpus\/a\.pjx/);
});

test("the vendored files match the hashes recorded in SOURCE.json", () => {
  const source = JSON.parse(readFileSync(join(vendoredDir, "SOURCE.json"), "utf8"));
  assert.match(source.commit, /^[0-9a-f]{40}$/);
  assert.ok(source.ref);
  for (const [name, hash] of Object.entries<string>(source.sha256)) {
    assert.equal(sha256(join(vendoredDir, name)), hash, name);
  }
});
