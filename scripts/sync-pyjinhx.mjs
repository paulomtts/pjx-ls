// Vendor pyjinhx's block grammar and its conformance corpus into test/fixtures/pyjinhx/.
//
// usage: node scripts/sync-pyjinhx.mjs [--check] [<pyjinhx checkout>]
//
// The checkout defaults to $PYJINHX_PATH, then ../libs/pyjinhx. --check copies
// nothing: it exits 1 and lists the files that differ from the checkout.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(root, "test/fixtures/pyjinhx");
const args = process.argv.slice(2);
const check = args.includes("--check");
const checkout = resolve(args.find((arg) => !arg.startsWith("--")) ?? process.env.PYJINHX_PATH ?? join(root, "../libs/pyjinhx"));

const sources = {
  "block_grammar.json": join(checkout, "pyjinhx/block_grammar.json"),
  ...Object.fromEntries(
    readdirSync(join(checkout, "tests/fixtures/block_grammar")).map((name) => [
      `corpus/${name}`,
      join(checkout, "tests/fixtures/block_grammar", name),
    ]),
  ),
};
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const hashes = Object.fromEntries(Object.entries(sources).map(([name, path]) => [name, sha256(path)]));

if (check) {
  const vendored = new Map();
  const walk = (dir, prefix = "") => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (prefix || entry.name === "block_grammar.json") vendored.set(`${prefix}${entry.name}`, sha256(join(dir, entry.name)));
    }
  };
  walk(dest);
  const differing = [...new Set([...Object.keys(hashes), ...vendored.keys()])].filter((name) => hashes[name] !== vendored.get(name));
  if (differing.length) {
    console.error(`differs from ${checkout}:\n${differing.map((name) => `  ${name}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`up to date with ${checkout}`);
} else {
  rmSync(join(dest, "corpus"), { recursive: true, force: true });
  mkdirSync(join(dest, "corpus"), { recursive: true });
  for (const [name, path] of Object.entries(sources)) cpSync(path, join(dest, name));
  const git = (...gitArgs) => execFileSync("git", ["-C", checkout, ...gitArgs], { encoding: "utf8" }).trim();
  const version = /^version\s*=\s*"(.+)"/m.exec(readFileSync(join(checkout, "pyproject.toml"), "utf8"))?.[1];
  const source = {
    commit: git("rev-parse", "HEAD"),
    pyjinhx_version: version,
    block_grammar_version: JSON.parse(readFileSync(sources["block_grammar.json"], "utf8")).version,
    sha256: hashes,
  };
  writeFileSync(join(dest, "SOURCE.json"), `${JSON.stringify(source, null, 2)}\n`);
  console.log(`vendored ${Object.keys(sources).length} files from ${source.commit}`);
}
