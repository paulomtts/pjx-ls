// Vendor pyjinhx's block grammar and its conformance corpus into test/fixtures/pyjinhx/.
//
// usage: node scripts/sync-pyjinhx.mjs [--check] [--dest <dir>] [<pyjinhx checkout>]
//
// The checkout defaults to $PYJINHX_PATH, then ../libs/pyjinhx, and must be clean.
// SOURCE.json records the commit and a `ref` (the tag when HEAD is tagged, else the
// commit) that CI checks out. --check copies nothing: it exits 1 and lists the files
// that differ from the checkout.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const check = args.includes("--check");
const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const dest = resolve(valueOf("--dest") ?? join(root, "test/fixtures/pyjinhx"));
const positional = args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--dest");
const checkout = resolve(positional[0] ?? process.env.PYJINHX_PATH ?? join(root, "../libs/pyjinhx"));

const git = (...gitArgs) => execFileSync("git", ["-C", checkout, ...gitArgs], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Every file under `dir`, as paths relative to it. */
const walk = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)));

if (git("status", "--porcelain")) {
  console.error(`${checkout} has uncommitted changes; sync from a clean checkout`);
  process.exit(1);
}

const corpusDir = join(checkout, "tests/fixtures/block_grammar");
const sources = {
  "block_grammar.json": join(checkout, "pyjinhx/block_grammar.json"),
  ...Object.fromEntries(walk(corpusDir).map((name) => [`corpus/${name}`, join(corpusDir, name)])),
};
const hashes = Object.fromEntries(Object.entries(sources).map(([name, path]) => [name, sha256(path)]));

if (check) {
  const vendored = Object.fromEntries(
    walk(dest).filter((name) => name !== "SOURCE.json").map((name) => [name, sha256(join(dest, name))]),
  );
  const differing = [...new Set([...Object.keys(hashes), ...Object.keys(vendored)])].filter((name) => hashes[name] !== vendored[name]);
  if (differing.length) {
    console.error(`differs from ${checkout}:\n${differing.map((name) => `  ${name}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`up to date with ${checkout}`);
} else {
  const commit = git("rev-parse", "HEAD");
  let tag = null;
  try {
    tag = git("describe", "--tags", "--exact-match", "HEAD");
  } catch {}
  const source = {
    commit,
    ref: tag ?? commit,
    tag,
    pyproject_version: /^version\s*=\s*"(.+)"/m.exec(readFileSync(join(checkout, "pyproject.toml"), "utf8"))?.[1],
    block_grammar_version: JSON.parse(readFileSync(sources["block_grammar.json"], "utf8")).version,
    sha256: hashes,
  };

  // Stage everything first so a failed copy cannot leave the old files half-deleted.
  const staging = `${dest}.staging`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  try {
    for (const [name, path] of Object.entries(sources)) {
      mkdirSync(dirname(join(staging, name)), { recursive: true });
      cpSync(path, join(staging, name));
    }
    writeFileSync(join(staging, "SOURCE.json"), `${JSON.stringify(source, null, 2)}\n`);
    mkdirSync(dest, { recursive: true });
    for (const name of ["corpus", "block_grammar.json", "SOURCE.json"]) {
      rmSync(join(dest, name), { recursive: true, force: true });
      renameSync(join(staging, name), join(dest, name));
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  console.log(`vendored ${Object.keys(sources).length} files from ${source.ref}`);
}
