# PyJinHX Extension Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the PyJinHX VSCode extension into a layered TypeScript codebase (pure `core/` formatter + thin `vscode/` adapter) with `node:test` unit tests and a golden-file behavior contract, preserving externally observable behavior exactly.

**Architecture:** Two layers. `src/core/` is dependency-free string-in/string-out formatting (ported verbatim in behavior from the existing JS). `src/vscode/` is the only code that touches the `vscode` runtime API; `src/extension.ts` is the composition root. TextMate grammars stay as JSON assets. Tests run on Node ≥23.6's native `.ts` type-stripping — no test build step.

**Tech Stack:** TypeScript (ESM, `"type":"module"`), esbuild (bundle → CJS `dist/extension.cjs`), `@types/vscode`, Node built-in `node:test`, `@vscode/vsce` for packaging.

## Global Constraints

- `package.json` `"type": "module"`; VSCode entry is `"main": "./dist/extension.cjs"` (CJS bundle). Verified: VSCode requires CJS; `node --test` needs ESM to run `.ts`.
- Node ≥23.6 runs `.ts` ESM directly (verified on v26.2.0). Relative imports inside `src/`/`test/` MUST use explicit `.ts` extensions (e.g. `import { INDENT } from "../config.ts"`).
- Behavior-preserving: the new `formatPyjinhxTemplate` MUST reproduce the existing formatter's output **byte-for-byte** for every fixture and every verified case below. Known behavioral quirks (inline whitespace loss, trailing-space artifact, asymmetric `>`, shape-based slot detection) are **locked in by tests, not fixed**.
- `INDENT` is exactly two spaces `"  "`.
- The `if (content === formattedContent)` guard in slot formatting is **live** (slot-stage idempotency guard) — keep it.
- Extension package `name` stays `pyjinhx-slot-highlight` (update continuity); only `displayName`/`description` reworded.
- Grammar files in `syntaxes/` and the language-configuration JSON are content-unchanged (only moved/renamed + package.json path updates).
- Activation: replace `activationEvents: ["*"]` with `onLanguage:` events for `pyjinhx`, `html`, `jinja`, `jinja-html`.

**Verified fixture facts (from empirical characterization):**
- 21 `.html` components under `~/Code/nori/app/adapters/web/components/new`. All 21 are idempotent: `format(format(x)) === format(x)`.
- 7 are already canonical (`format(x) === x`): `logo.html`, `message_bubble.html`, `search_box.html`, `chat_thread.html`, `archived_conversation.html`, `conversation_item.html`, `account_menu.html`.
- The other 14 change on first pass (mostly children of `{% if/elif/else/for %}` indent one extra level).

---

### Task 1: Capture the behavior contract (fixtures + golden outputs)

Freeze current behavior as data **before** any code changes, using the existing JS formatter as the oracle.

**Files:**
- Create: `test/fixtures/components/**` (21 `.html` + 16 `.py`, copied from nori, structure preserved)
- Create: `test/fixtures/expected/**` (21 golden `.html`, one per input)
- Create: `scripts/gen-goldens.mjs` (throwaway generator, committed for reproducibility)

**Interfaces:**
- Produces: a `test/fixtures/components/<relpath>.html` for every input and a matching `test/fixtures/expected/<relpath>.html` = `formatPyjinhxTemplate(input)` per the **existing** `pyjinhx-highlight/format-slots.js`.

- [ ] **Step 1: Copy nori fixtures (html + py), excluding caches/assets**

```bash
cd /home/mtts/Code/pjx-ls
SRC=/home/mtts/Code/nori/app/adapters/web/components/new
DST=test/fixtures/components
mkdir -p "$DST"
# copy .html and .py preserving tree; skip __pycache__, css, js, png
( cd "$SRC" && find . \( -name '*.html' -o -name '*.py' \) -not -path '*__pycache__*' -print0 ) \
  | ( cd "$SRC" && cpio -0 -pdm "/home/mtts/Code/pjx-ls/$DST" )
find "$DST" -name '*.html' | wc -l   # expect 21
find "$DST" -name '*.py'   | wc -l   # expect 16
```

Expected: `21` then `16`.

- [ ] **Step 2: Write the golden generator**

Create `scripts/gen-goldens.mjs`:

```js
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { globSync } from "node:fs";

const require = createRequire(import.meta.url);
// Oracle = the EXISTING formatter (CommonJS), still present at this point.
const { formatPyjinhxTemplate } = require("../pyjinhx-highlight/format-slots.js");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inputs = globSync("test/fixtures/components/**/*.html", { cwd: root });
let count = 0;
for (const rel of inputs) {
  const input = readFileSync(join(root, rel), "utf8");
  const golden = formatPyjinhxTemplate(input);
  const outRel = rel.replace("test/fixtures/components/", "test/fixtures/expected/");
  mkdirSync(join(root, dirname(outRel)), { recursive: true });
  writeFileSync(join(root, outRel), golden, "utf8");
  count += 1;
}
console.log(`wrote ${count} goldens`);
```

- [ ] **Step 3: Generate goldens and assert idempotency of the oracle**

```bash
cd /home/mtts/Code/pjx-ls
node scripts/gen-goldens.mjs            # expect: wrote 21 goldens
# Re-run on the goldens themselves to confirm the oracle is a fixed point:
node -e '
const {createRequire}=require("module");
const r=createRequire(process.cwd()+"/x");
const {formatPyjinhxTemplate}=r("./pyjinhx-highlight/format-slots.js");
const {readFileSync}=require("fs");
const {globSync}=require("fs");
let bad=0;
for(const f of globSync("test/fixtures/expected/**/*.html")){
  const g=readFileSync(f,"utf8");
  if(formatPyjinhxTemplate(g)!==g){console.error("NON-IDEMPOTENT",f);bad++;}
}
console.log(bad===0?"all goldens are fixed points":("FAIL "+bad));
'
```

Expected: `wrote 21 goldens` then `all goldens are fixed points`.

- [ ] **Step 4: Commit**

```bash
git add test/fixtures scripts/gen-goldens.mjs
git commit -m "test: import nori components as fixtures + generate golden outputs from existing formatter"
```

---

### Task 2: Flatten to repo root, delete cruft, scaffold TypeScript toolchain

**Files:**
- Move: `pyjinhx-highlight/syntaxes/` → `syntaxes/`; `pyjinhx-highlight/pyjinhx-language-configuration.json` → `language-configuration.json`
- Delete: `pyjinhx-highlight/` (incl. `extension.js`, `format-slots.js`, `format-html-structure.js`, `bin/`, all 16 `*.vsix`, its `package.json`, `.gitignore`, `.vscodeignore`)
- Create: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `.gitignore`, `.vscodeignore`, `README.md`

**Interfaces:**
- Produces: `npm run build` → `dist/extension.cjs`; `npm test` → `node --test`; `npm run check` → `tsc --noEmit`. Grammar/config paths at repo root.

- [ ] **Step 1: Move grammars + language config to root, then delete the old extension dir**

```bash
cd /home/mtts/Code/pjx-ls
git mv pyjinhx-highlight/syntaxes syntaxes
git mv pyjinhx-highlight/pyjinhx-language-configuration.json language-configuration.json
git rm -r --quiet pyjinhx-highlight
ls syntaxes | wc -l        # expect 7
test -f language-configuration.json && echo "lang-config at root OK"
test ! -e pyjinhx-highlight && echo "old dir gone OK"
```

Expected: `7`, `lang-config at root OK`, `old dir gone OK`.

> Note: the existing `pyjinhx-highlight/format-slots.js` was the golden oracle in Task 1; goldens are now committed, so deleting the JS is safe — the goldens are the contract.

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "pyjinhx-slot-highlight",
  "displayName": "PyJinHx",
  "description": "Syntax highlighting and template formatting for the PyJinHx Python framework (PascalCase component tags, slots, {#def#} headers, interpolation).",
  "version": "0.1.16",
  "publisher": "nori",
  "license": "MIT",
  "type": "module",
  "main": "./dist/extension.cjs",
  "engines": { "vscode": "^1.80.0" },
  "scripts": {
    "build": "node esbuild.config.mjs",
    "watch": "node esbuild.config.mjs --watch",
    "check": "tsc --noEmit",
    "test": "node --test",
    "package": "npm run check && npm run build && vsce package"
  },
  "activationEvents": [
    "onLanguage:pyjinhx",
    "onLanguage:html",
    "onLanguage:jinja",
    "onLanguage:jinja-html"
  ],
  "categories": ["Formatters", "Programming Languages"],
  "contributes": {
    "commands": [
      { "command": "pyjinhx.formatSlots", "title": "PyJinHx: Format Slotted Component Tags" }
    ],
    "configuration": {
      "title": "PyJinHx",
      "properties": {
        "pyjinhx.formatSlotsOnSave": {
          "type": "boolean",
          "default": true,
          "description": "Expand single-line quoted slot values that contain a PascalCase component tag when saving component templates."
        }
      }
    },
    "languages": [
      {
        "id": "pyjinhx",
        "extensions": [".pjx"],
        "aliases": ["PyJinHx", "pjx"],
        "configuration": "./language-configuration.json"
      }
    ],
    "grammars": [
      { "language": "pyjinhx", "scopeName": "text.pyjinhx", "path": "./syntaxes/pyjinhx.json" },
      { "scopeName": "pyjinhx.injection", "path": "./syntaxes/pyjinhx-injection.json", "injectTo": ["text.html.basic", "text.html.jinja", "text.pyjinhx"] },
      { "scopeName": "pyjinhx.injection.tags", "path": "./syntaxes/pyjinhx-injection-tags.json", "injectTo": ["text.html.basic", "text.html.jinja", "text.pyjinhx"] },
      { "scopeName": "pyjinhx.injection.def-header", "path": "./syntaxes/pyjinhx-injection-def-header.json", "injectTo": ["text.html.basic", "text.html.jinja", "text.pyjinhx"] },
      { "scopeName": "pyjinhx.injection.def-header-in-comment", "path": "./syntaxes/pyjinhx-injection-def-header-in-comment.json", "injectTo": ["text.html.basic", "text.html.jinja", "text.pyjinhx"] },
      { "scopeName": "pyjinhx.injection.interpolation", "path": "./syntaxes/pyjinhx-injection-interpolation.json", "injectTo": ["text.html.basic", "text.html.jinja", "text.pyjinhx"] },
      { "scopeName": "pyjinhx.injection.interpolation-in-jinja", "path": "./syntaxes/pyjinhx-injection-interpolation-in-jinja.json", "injectTo": ["text.html.basic", "text.html.jinja", "text.pyjinhx"] }
    ]
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/vscode": "^1.80.0",
    "@vscode/vsce": "^3.0.0",
    "esbuild": "^0.24.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2b: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": ["node", "vscode"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 2c: Write `esbuild.config.mjs`**

```js
import { build, context } from "esbuild";

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  external: ["vscode"],
  outfile: "dist/extension.cjs",
  sourcemap: true,
};

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("esbuild watching…");
} else {
  await build(options);
  console.log("built dist/extension.cjs");
}
```

- [ ] **Step 2d: Write `.gitignore`, `.vscodeignore`, `README.md`**

`.gitignore`:
```
node_modules/
dist/
*.vsix
```

`.vscodeignore` (ship only the bundle + assets):
```
.vscode/**
src/**
test/**
docs/**
scripts/**
node_modules/**
.gitignore
.vscodeignore
esbuild.config.mjs
tsconfig.json
**/*.ts
**/*.map
```

`README.md`:
```markdown
# PyJinHx VSCode Extension

Syntax highlighting and template formatting for the [PyJinHx](https://github.com/paulomtts/pyjinhx) framework.

- **Highlighting:** PascalCase component tags, `{#def … #}` signature headers, `{{ … }}` interpolation, HTML-in-slot values (TextMate grammars in `syntaxes/`).
- **Formatting:** slot-value expansion + HTML/Jinja structural re-indentation for component templates under `**/components/**`.

See `docs/codebase-guide.md` for an architecture walkthrough.
```

- [ ] **Step 3: Install deps and verify toolchain wiring**

```bash
cd /home/mtts/Code/pjx-ls
npm install
node -e 'console.log("type:", JSON.parse(require("fs").readFileSync("package.json")).type)'  # expect type: module
```

Expected: install succeeds; `type: module`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: flatten to repo root, delete vsix/bin/legacy JS, scaffold TS toolchain"
```

---

### Task 3: Core — `config.ts` + `html-structure.ts` (TDD)

**Files:**
- Create: `src/config.ts`
- Create: `src/core/html-structure.ts`
- Test: `test/core/html-structure.test.ts`

**Interfaces:**
- Produces: `INDENT: string` and the id/extension/segment/command constants from `config.ts`; `formatHtmlStructure(text: string): string` and `tokenizeHtmlTemplate(text: string): Token[]` from `html-structure.ts`.

- [ ] **Step 1: Write `src/config.ts`** (constants used across layers)

```ts
export const INDENT = "  ";

export const TEMPLATE_LANGUAGE_IDS: ReadonlySet<string> = new Set([
  "html",
  "jinja",
  "jinja-html",
  "pyjinhx",
]);
export const TEMPLATE_EXTENSIONS = [".html", ".pjx"] as const;
export const COMPONENTS_PATH_SEGMENT = "/components/";

export const OUTPUT_CHANNEL_NAME = "PyJinHx";
export const CONFIG_SECTION = "pyjinhx";
export const FORMAT_ON_SAVE_KEY = "formatSlotsOnSave";
export const FORMAT_SLOTS_COMMAND = "pyjinhx.formatSlots";
```

- [ ] **Step 2: Write the failing test** `test/core/html-structure.test.ts`

These assertions are the EXACT verified outputs of the existing formatter (including the inline whitespace-loss quirk — intentional behavior lock).

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatHtmlStructure } from "../../src/core/html-structure.ts";

test("nested block elements indent 2 spaces per level", () => {
  assert.equal(
    formatHtmlStructure("<div><div><p>Hello world text content here</p></div></div>"),
    "<div>\n  <div>\n    <p>Hello world text content here</p>\n  </div>\n</div>\n",
  );
});

test("inline element collapses text+expr children WITHOUT separators (known quirk)", () => {
  assert.equal(
    formatHtmlStructure("<p>Hello {{ name }} world</p>"),
    "<p>Hello{{ name }}world</p>\n",
  );
});

test("expr-only element stays inline", () => {
  assert.equal(formatHtmlStructure("<span>{{ value }}</span>"), "<span>{{ value }}</span>\n");
});

test("self-closing tag does not change depth", () => {
  assert.equal(
    formatHtmlStructure("<div><PJXDivider/></div>"),
    "<div>\n  <PJXDivider/>\n</div>\n",
  );
});

test("single-line open tag with element children keeps '>' attached", () => {
  assert.equal(
    formatHtmlStructure('<div class="card" id="main" data-x="1"><span>{{ a }}</span></div>'),
    '<div class="card" id="main" data-x="1">\n  <span>{{ a }}</span>\n</div>\n',
  );
});

test("mixed text + element children go block", () => {
  assert.equal(
    formatHtmlStructure("<div>some leading text<span>child element here</span></div>"),
    "<div>\n  some leading text\n  <span>child element here</span>\n</div>\n",
  );
});

test("jinja if block nests and dedents", () => {
  assert.equal(
    formatHtmlStructure("<div>{% if x %}{{ a }}{% endif %}</div>"),
    "<div>\n  {% if x %}\n    {{ a }}\n  {% endif %}\n</div>\n",
  );
});

test("if/elif/else mid tags realign to the if column", () => {
  const input =
    "<div>\n{% if a %}\n<span>A</span>\n{% elif b %}\n<span>B</span>\n{% else %}\n<span>C</span>\n{% endif %}\n</div>";
  assert.equal(
    formatHtmlStructure(input),
    "<div>\n  {% if a %}\n    <span>A</span>\n  {% elif b %}\n    <span>B</span>\n  {% else %}\n    <span>C</span>\n  {% endif %}\n</div>\n",
  );
});

test("filter block open/close depth", () => {
  assert.equal(
    formatHtmlStructure("{% filter upper %}\n<span>txt</span>\n{% endfilter %}"),
    "{% filter upper %}\n  <span>txt</span>\n{% endfilter %}\n",
  );
});

test("interpolation containing < and quotes is not mis-tokenized", () => {
  assert.equal(
    formatHtmlStructure("<div>\n{{ 'a' if x < y else 'b' }}\n</div>"),
    "<div>{{ 'a' if x < y else 'b' }}</div>\n",
  );
});

test("empty input returned unchanged", () => {
  assert.equal(formatHtmlStructure(""), "");
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `node --test test/core/html-structure.test.ts`
Expected: FAIL — `Cannot find module '../../src/core/html-structure.ts'`.

- [ ] **Step 4: Write `src/core/html-structure.ts`** (verbatim-behavior port of `format-html-structure.js`, typed + ESM)

```ts
import { INDENT } from "../config.ts";

const JINJA_BLOCK_OPEN = /^\{%\s*(?:if|for|macro|block|filter|raw)\b/;
const JINJA_BLOCK_MID = /^\{%\s*(?:elif|else)\b/;
const JINJA_BLOCK_CLOSE = /^\{%\s*end(?:if|for|macro|block|filter|raw)\b/;

type TokenType = "jinja" | "jinja_expr" | "open" | "close" | "self_close" | "text";

export interface Token {
  type: TokenType;
  value: string;
  name?: string;
}

interface Parsed {
  value: string;
  endIndex: number;
}

function readQuotedString(text: string, startIndex: number, quote: string): Parsed | null {
  let index = startIndex + 1;
  let value = quote;
  while (index < text.length) {
    const character = text[index];
    value += character;
    if (character === quote) {
      return { value, endIndex: index };
    }
    if (character === "{" && text[index + 1] === "{") {
      index += 2;
      while (index < text.length - 1 && !(text[index] === "}" && text[index + 1] === "}")) {
        value += text[index];
        index += 1;
      }
      if (index < text.length) {
        value += text[index];
        index += 1;
      }
      if (index < text.length) {
        value += text[index];
      }
      index += 1;
      continue;
    }
    index += 1;
  }
  return null;
}

function readTag(text: string, startIndex: number): Parsed | null {
  let index = startIndex + 1;
  let value = "<";
  while (index < text.length) {
    const character = text[index];
    value += character;
    if (character === '"') {
      const parsed = readQuotedString(text, index, '"');
      if (!parsed) {
        return null;
      }
      value = text.slice(startIndex, parsed.endIndex + 1);
      index = parsed.endIndex + 1;
      continue;
    }
    if (character === "'") {
      const parsed = readQuotedString(text, index, "'");
      if (!parsed) {
        return null;
      }
      value = text.slice(startIndex, parsed.endIndex + 1);
      index = parsed.endIndex + 1;
      continue;
    }
    if (character === ">") {
      return { value, endIndex: index };
    }
    index += 1;
  }
  return null;
}

function readJinja(text: string, startIndex: number, marker: string, endMarker: string): Parsed | null {
  const endIndex = text.indexOf(endMarker, startIndex + marker.length);
  if (endIndex === -1) {
    return null;
  }
  return {
    value: text.slice(startIndex, endIndex + endMarker.length),
    endIndex: endIndex + endMarker.length - 1,
  };
}

function tagName(tagValue: string): string {
  const match = tagValue.match(/^<\/?([A-Za-z][A-Za-z0-9]*)/);
  return match ? match[1] : "";
}

export function tokenizeHtmlTemplate(text: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < text.length) {
    const character = text[index];

    if (character === "{" && text[index + 1] === "#") {
      const parsed = readJinja(text, index, "{#", "#}");
      if (!parsed) break;
      tokens.push({ type: "jinja", value: parsed.value });
      index = parsed.endIndex + 1;
      continue;
    }
    if (character === "{" && text[index + 1] === "%") {
      const parsed = readJinja(text, index, "{%", "%}");
      if (!parsed) break;
      tokens.push({ type: "jinja", value: parsed.value });
      index = parsed.endIndex + 1;
      continue;
    }
    if (character === "{" && text[index + 1] === "{") {
      const parsed = readJinja(text, index, "{{", "}}");
      if (!parsed) break;
      tokens.push({ type: "jinja_expr", value: parsed.value });
      index = parsed.endIndex + 1;
      continue;
    }
    if (character === "<") {
      const parsed = readTag(text, index);
      if (!parsed) break;
      const tagValue = parsed.value.trim();
      if (tagValue.startsWith("</")) {
        tokens.push({ type: "close", value: tagValue, name: tagName(tagValue) });
      } else if (tagValue.endsWith("/>")) {
        tokens.push({ type: "self_close", value: tagValue, name: tagName(tagValue) });
      } else {
        tokens.push({ type: "open", value: tagValue, name: tagName(tagValue) });
      }
      index = parsed.endIndex + 1;
      continue;
    }
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    const textStart = index;
    while (index < text.length) {
      const nextCharacter = text[index];
      if (nextCharacter === "<") break;
      if (
        nextCharacter === "{" &&
        (text[index + 1] === "#" || text[index + 1] === "%" || text[index + 1] === "{")
      ) {
        break;
      }
      index += 1;
    }
    if (index > textStart) {
      const textValue = text.slice(textStart, index).trim();
      if (textValue.length > 0) {
        tokens.push({ type: "text", value: textValue });
      }
      continue;
    }
    index += 1;
  }

  return tokens;
}

function jinjaDepthDelta(value: string): number {
  const trimmed = value.trim();
  if (JINJA_BLOCK_CLOSE.test(trimmed)) return -1;
  if (JINJA_BLOCK_OPEN.test(trimmed)) return 1;
  if (JINJA_BLOCK_MID.test(trimmed)) return 0;
  return 0;
}

function hasElementChildren(tokens: Token[], startIndex: number): boolean {
  let depth = 0;
  for (let index = startIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "jinja") {
      depth += jinjaDepthDelta(token.value);
      continue;
    }
    if (token.type === "open") return true;
    if (token.type === "self_close") continue;
    if (token.type === "close") return false;
  }
  return false;
}

function tryInlineElement(tokens: Token[], startIndex: number): { endIndex: number; value: string } | null {
  const openToken = tokens[startIndex];
  if (openToken.type !== "open") return null;

  let inner = "";
  for (let index = startIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "close" && token.name === openToken.name) {
      return { endIndex: index, value: `${openToken.value}${inner}${token.value}` };
    }
    if (token.type === "text" || token.type === "jinja_expr") {
      inner += token.value;
      continue;
    }
    return null;
  }
  return null;
}

export function formatHtmlStructure(text: string): string {
  const tokens = tokenizeHtmlTemplate(text);
  if (tokens.length === 0) {
    return text;
  }

  const lines: string[] = [];
  let depth = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const baseIndent = INDENT.repeat(depth);

    if (token.type === "jinja") {
      const trimmed = token.value.trim();
      if (JINJA_BLOCK_CLOSE.test(trimmed)) {
        depth = Math.max(0, depth - 1);
        lines.push(INDENT.repeat(depth) + trimmed);
        continue;
      }
      if (JINJA_BLOCK_MID.test(trimmed)) {
        depth = Math.max(0, depth - 1);
        lines.push(INDENT.repeat(depth) + trimmed);
        depth += 1;
        continue;
      }
      if (JINJA_BLOCK_OPEN.test(trimmed)) {
        lines.push(INDENT.repeat(depth) + trimmed);
        depth += 1;
        continue;
      }
      lines.push(INDENT.repeat(depth) + trimmed);
      continue;
    }

    if (token.type === "jinja_expr" || token.type === "text") {
      lines.push(baseIndent + token.value.trim());
      continue;
    }

    if (token.type === "close") {
      depth = Math.max(0, depth - 1);
      lines.push(INDENT.repeat(depth) + token.value.trim());
      continue;
    }

    if (token.type === "self_close") {
      lines.push(baseIndent + token.value.trim());
      continue;
    }

    if (token.type === "open") {
      const inlineElement = tryInlineElement(tokens, index);
      if (inlineElement) {
        lines.push(baseIndent + inlineElement.value.trim());
        index = inlineElement.endIndex;
        continue;
      }

      const childElements = hasElementChildren(tokens, index);
      let tagText = token.value.trim();
      let trailingBracket = "";

      if (childElements && tagText.endsWith(">") && !tagText.endsWith("/>")) {
        tagText = tagText.slice(0, -1).trimEnd();
        trailingBracket = ">";
      }

      if (tagText.includes("\n")) {
        const parts = tagText.split("\n");
        const firstLine = baseIndent + parts[0].trimStart();
        const rest = parts.slice(1).join("\n");
        lines.push(rest ? `${firstLine}\n${rest}` : firstLine);
        if (trailingBracket) {
          lines.push(baseIndent + trailingBracket);
        }
      } else {
        lines.push(baseIndent + tagText + trailingBracket);
      }
      depth += 1;
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `node --test test/core/html-structure.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/core/html-structure.ts test/core/html-structure.test.ts
git commit -m "feat(core): port HTML/Jinja structure formatter to TypeScript with tests"
```

---

### Task 4: Core — `slots.ts` (TDD)

**Files:**
- Create: `src/core/slots.ts`
- Test: `test/core/slots.test.ts`

**Interfaces:**
- Consumes: `INDENT` from `src/config.ts`.
- Produces: `formatSlottedPascalTags(text: string): string`, `isHtmlSlotValue(value: string): boolean`, `splitHtmlFragments(text: string): string[]`, `formatInnerSlotContent(content: string, innerIndent: string): string`.

- [ ] **Step 1: Write the failing test** `test/core/slots.test.ts`

Verified outputs of the existing slot stage (note: `formatSlottedPascalTags` alone does NOT add a trailing newline — that comes later from `formatHtmlStructure`).

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatSlottedPascalTags,
  isHtmlSlotValue,
  splitHtmlFragments,
} from "../../src/core/slots.ts";

test("inline HTML slot value is expanded onto its own lines", () => {
  assert.equal(
    formatSlottedPascalTags(`<PJXButton start="<PJXIcon name='plus'/>">Add</PJXButton>`),
    `<PJXButton \nstart="\n  <PJXIcon name='plus'/>\n">Add</PJXButton>`,
  );
});

test("plain string attribute is left untouched", () => {
  assert.equal(
    formatSlottedPascalTags(`<PJXButton variant="secondary">Add</PJXButton>`),
    `<PJXButton variant="secondary">Add</PJXButton>`,
  );
});

test("non-'<' leading text is not treated as HTML", () => {
  assert.equal(
    formatSlottedPascalTags(`<PJXButton label="Click <here>">Add</PJXButton>`),
    `<PJXButton label="Click <here>">Add</PJXButton>`,
  );
});

test("already-canonical slot value triggers the idempotency guard (no change)", () => {
  // content === formattedContent path: value already equals its canonical form.
  const input = `<Card body="\n  <p>Hi</p>\n" />`;
  assert.equal(formatSlottedPascalTags(input), input);
});

test("isHtmlSlotValue trims before testing for '<'", () => {
  assert.equal(isHtmlSlotValue("\n  <p>Hi</p>\n"), true);
  assert.equal(isHtmlSlotValue("secondary"), false);
  assert.equal(isHtmlSlotValue("Click <here>"), false);
  assert.equal(isHtmlSlotValue("</div>"), true);
});

test("splitHtmlFragments splits on '><' boundaries", () => {
  assert.deepEqual(splitHtmlFragments("<a/><b/>"), ["<a/>", "<b/>"]);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `node --test test/core/slots.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/core/slots.ts`** (verbatim-behavior port of the slot functions in `format-slots.js`)

```ts
import { INDENT } from "../config.ts";

interface ParsedDoubleQuoted {
  content: string;
  closeIndex: number;
}

function readDoubleQuotedContent(text: string, openQuoteIndex: number): ParsedDoubleQuoted | null {
  let index = openQuoteIndex + 1;
  while (index < text.length) {
    const character = text[index];
    if (character === '"') {
      return { content: text.slice(openQuoteIndex + 1, index), closeIndex: index };
    }
    if (character === "'") {
      index += 1;
      while (index < text.length && text[index] !== "'") {
        index += 1;
      }
      index += 1;
      continue;
    }
    if (character === "{" && text[index + 1] === "{") {
      index += 2;
      while (index < text.length - 1 && !(text[index] === "}" && text[index + 1] === "}")) {
        index += 1;
      }
      index += 2;
      continue;
    }
    index += 1;
  }
  return null;
}

export function isHtmlSlotValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith("<")) {
    return false;
  }
  return /<(?:\/|[A-Za-z])/.test(trimmed);
}

export function splitHtmlFragments(text: string): string[] {
  return text
    .replace(/></g, ">\n<")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function formatInnerSlotContent(content: string, innerIndent: string): string {
  const fragments = splitHtmlFragments(content.trim());
  if (fragments.length === 0) {
    return `\n${innerIndent}\n`;
  }
  return `\n${fragments.map((fragment) => `${innerIndent}${fragment}`).join("\n")}\n`;
}

export function formatSlottedPascalTags(text: string): string {
  const replacements: { start: number; end: number; replacement: string }[] = [];
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const equalsQuote = text.indexOf('="', searchFrom);
    if (equalsQuote === -1) {
      break;
    }

    const lineStart = text.lastIndexOf("\n", equalsQuote) + 1;
    const beforeAttribute = text.slice(lineStart, equalsQuote);
    const attributeMatch = beforeAttribute.match(/([\w-]+)\s*$/);
    if (!attributeMatch) {
      searchFrom = equalsQuote + 2;
      continue;
    }

    const attributeName = attributeMatch[1];
    const attributeNameStart = lineStart + beforeAttribute.length - attributeName.length;
    const openQuoteIndex = equalsQuote + 1;
    const parsed = readDoubleQuotedContent(text, openQuoteIndex);
    if (!parsed) {
      searchFrom = equalsQuote + 2;
      continue;
    }

    const { content, closeIndex } = parsed;
    if (!isHtmlSlotValue(content)) {
      searchFrom = closeIndex + 1;
      continue;
    }

    const lineIndent = beforeAttribute.match(/^(\s*)/)?.[1] ?? "";
    const contentBeforeAttribute = text.slice(lineStart, attributeNameStart);
    const beforeTrimmed = contentBeforeAttribute.trim();
    const attributeIndent =
      beforeTrimmed.length > 0 && /[\w-]+\s*=/.test(beforeTrimmed)
        ? lineIndent + INDENT
        : lineIndent;
    const innerIndent = attributeIndent + INDENT;
    const formattedContent = `${formatInnerSlotContent(content, innerIndent)}${attributeIndent}`;

    if (content === formattedContent) {
      searchFrom = closeIndex + 1;
      continue;
    }

    let prefix = "";
    if (contentBeforeAttribute.trim().length > 0 && !contentBeforeAttribute.endsWith("\n")) {
      prefix = `\n${attributeIndent}`;
    }

    replacements.push({
      start: attributeNameStart,
      end: closeIndex + 1,
      replacement: `${prefix}${attributeName}="${formattedContent}"`,
    });
    searchFrom = closeIndex + 1;
  }

  replacements.sort((left, right) => right.start - left.start);
  let result = text;
  for (const { start, end, replacement } of replacements) {
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return result;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `node --test test/core/slots.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/slots.ts test/core/slots.test.ts
git commit -m "feat(core): port slot-value expansion to TypeScript with tests"
```

---

### Task 5: Core — `format.ts` orchestrator + golden behavior-contract suite (TDD)

**Files:**
- Create: `src/core/format.ts`
- Test: `test/core/format.test.ts`
- Test: `test/core/goldens.test.ts`

**Interfaces:**
- Consumes: `formatSlottedPascalTags` (`slots.ts`), `formatHtmlStructure` (`html-structure.ts`).
- Produces: `formatPyjinhxTemplate(text: string): string` = `formatHtmlStructure(formatSlottedPascalTags(text))`.

- [ ] **Step 1: Write the failing tests**

`test/core/format.test.ts` (end-to-end verified pairs incl. the canonical-slot guard and quote safety):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPyjinhxTemplate } from "../../src/core/format.ts";

test("end-to-end inline slot expansion adds trailing newline", () => {
  assert.equal(
    formatPyjinhxTemplate(`<Card body="<p>Hi</p>" />`),
    `<Card \nbody="\n  <p>Hi</p>\n" />\n`,
  );
});

test("already-canonical slot only gains a trailing newline", () => {
  assert.equal(
    formatPyjinhxTemplate(`<Card body="\n  <p>Hi</p>\n" />`),
    `<Card body="\n  <p>Hi</p>\n" />\n`,
  );
});

test("self-closing component with quoted interpolation survives intact", () => {
  const input = `<SidebarItem active="{{ 'true' if a == b else 'false' }}" center="{{ title }}"/>`;
  assert.equal(formatPyjinhxTemplate(input), `${input}\n`);
});

test("def header stays on its own line", () => {
  assert.equal(
    formatPyjinhxTemplate(
      `{#def conversation: str, title: str, active: bool = False #}\n<div class="x">\n<span>hi</span>\n</div>`,
    ),
    `{#def conversation: str, title: str, active: bool = False #}\n<div class="x">\n  <span>hi</span>\n</div>\n`,
  );
});
```

`test/core/goldens.test.ts` (the byte-for-byte behavior contract over all 21 fixtures):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, globSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatPyjinhxTemplate } from "../../src/core/format.ts";

const root = join(fileURLToPath(new URL("../..", import.meta.url)));
const inputs = globSync("test/fixtures/components/**/*.html", { cwd: root });

test("there are 21 component fixtures", () => {
  assert.equal(inputs.length, 21);
});

for (const rel of inputs) {
  const goldenRel = rel.replace("test/fixtures/components/", "test/fixtures/expected/");
  test(`golden: ${rel}`, () => {
    const input = readFileSync(join(root, rel), "utf8");
    const golden = readFileSync(join(root, goldenRel), "utf8");
    const out = formatPyjinhxTemplate(input);
    assert.equal(out, golden, "formatter output must match the committed golden");
    assert.equal(formatPyjinhxTemplate(out), out, "formatter must be idempotent");
  });
}
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `node --test test/core/format.test.ts test/core/goldens.test.ts`
Expected: FAIL — `src/core/format.ts` not found.

- [ ] **Step 3: Write `src/core/format.ts`**

```ts
import { formatSlottedPascalTags } from "./slots.ts";
import { formatHtmlStructure } from "./html-structure.ts";

export function formatPyjinhxTemplate(text: string): string {
  return formatHtmlStructure(formatSlottedPascalTags(text));
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `node --test test/core/format.test.ts test/core/goldens.test.ts`
Expected: PASS — 4 format tests + 22 golden tests (21 files + the count check). Every fixture matches its golden and is idempotent.

- [ ] **Step 5: Run the full suite**

Run: `node --test`
Expected: PASS — all core suites green.

- [ ] **Step 6: Commit**

```bash
git add src/core/format.ts test/core/format.test.ts test/core/goldens.test.ts
git commit -m "feat(core): add format orchestrator + golden behavior-contract suite (21 fixtures)"
```

---

### Task 6: VSCode adapter — `component-template.ts` (TDD)

The scope guard. Kept testable by depending only on a minimal document shape and a **type-only** vscode import (erased at runtime), so it runs under `node:test` without the vscode host.

**Files:**
- Create: `src/vscode/component-template.ts`
- Test: `test/vscode/component-template.test.ts`

**Interfaces:**
- Consumes: `TEMPLATE_LANGUAGE_IDS`, `TEMPLATE_EXTENSIONS`, `COMPONENTS_PATH_SEGMENT` from `src/config.ts`.
- Produces: `interface TemplateDocumentLike { uri: { scheme: string; fsPath: string }; fileName: string; languageId: string }` and `isComponentTemplate(document: TemplateDocumentLike): boolean`.

- [ ] **Step 1: Write the failing test** `test/vscode/component-template.test.ts`

Encodes the verified guard: scheme==='file' AND extension in {.html,.pjx} AND normalized path includes '/components/' AND languageId in {html,jinja,jinja-html,pyjinhx}.

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isComponentTemplate } from "../../src/vscode/component-template.ts";

const make = (over = {}) => ({
  uri: { scheme: "file", fsPath: "/proj/app/components/x/y.html" },
  fileName: "/proj/app/components/x/y.html",
  languageId: "html",
  ...over,
});

test("accepts a file-scheme html under /components/", () => {
  assert.equal(isComponentTemplate(make()), true);
});

test("accepts .pjx with pyjinhx language", () => {
  assert.equal(
    isComponentTemplate(make({ fileName: "/proj/components/a.pjx", uri: { scheme: "file", fsPath: "/proj/components/a.pjx" }, languageId: "pyjinhx" })),
    true,
  );
});

test("rejects non-file scheme", () => {
  assert.equal(isComponentTemplate(make({ uri: { scheme: "untitled", fsPath: "/proj/components/x/y.html" } })), false);
});

test("rejects path without /components/", () => {
  assert.equal(
    isComponentTemplate(make({ fileName: "/proj/app/pages/y.html", uri: { scheme: "file", fsPath: "/proj/app/pages/y.html" } })),
    false,
  );
});

test("rejects wrong extension", () => {
  assert.equal(
    isComponentTemplate(make({ fileName: "/proj/components/x/y.css", uri: { scheme: "file", fsPath: "/proj/components/x/y.css" } })),
    false,
  );
});

test("rejects unsupported languageId", () => {
  assert.equal(isComponentTemplate(make({ languageId: "css" })), false);
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `node --test test/vscode/component-template.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/vscode/component-template.ts`**

```ts
import { sep } from "node:path";
import {
  COMPONENTS_PATH_SEGMENT,
  TEMPLATE_EXTENSIONS,
  TEMPLATE_LANGUAGE_IDS,
} from "../config.ts";

export interface TemplateDocumentLike {
  uri: { scheme: string; fsPath: string };
  fileName: string;
  languageId: string;
}

function isTemplateExtension(fileName: string): boolean {
  return TEMPLATE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

export function isComponentTemplate(document: TemplateDocumentLike): boolean {
  if (document.uri.scheme !== "file") {
    return false;
  }
  if (!isTemplateExtension(document.fileName)) {
    return false;
  }
  const normalizedPath = document.uri.fsPath.split(sep).join("/");
  if (!normalizedPath.includes(COMPONENTS_PATH_SEGMENT)) {
    return false;
  }
  return TEMPLATE_LANGUAGE_IDS.has(document.languageId);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `node --test test/vscode/component-template.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/vscode/component-template.ts test/vscode/component-template.test.ts
git commit -m "feat(vscode): add testable component-template scope guard"
```

---

### Task 7: VSCode adapter — `formatting.ts` + `extension.ts` (wire-up + build)

VSCode runtime glue (provider, save hook, command, output channel). Not unit-tested under `node:test` (needs the vscode host, out of scope per the tests decision); verified by `tsc --noEmit` type-checking and a successful esbuild bundle that loads as CJS.

**Files:**
- Create: `src/vscode/formatting.ts`
- Create: `src/extension.ts`

**Interfaces:**
- Consumes: `formatPyjinhxTemplate` (`core/format.ts`), `isComponentTemplate` (`vscode/component-template.ts`), constants (`config.ts`).
- Produces: `registerFormatting(context: vscode.ExtensionContext, output: vscode.OutputChannel): void`; `activate(context)`, `deactivate()` from `extension.ts`.

- [ ] **Step 1: Write `src/vscode/formatting.ts`**

```ts
import * as vscode from "vscode";
import { formatPyjinhxTemplate } from "../core/format.ts";
import { isComponentTemplate } from "./component-template.ts";
import { CONFIG_SECTION, FORMAT_ON_SAVE_KEY, FORMAT_SLOTS_COMMAND } from "../config.ts";

const TEMPLATE_SELECTOR: vscode.DocumentSelector = [
  { language: "html", scheme: "file" },
  { language: "jinja", scheme: "file" },
  { language: "jinja-html", scheme: "file" },
  { language: "pyjinhx", scheme: "file" },
];

function fullDocumentEdit(document: vscode.TextDocument, formattedText: string): vscode.TextEdit {
  const lastLine = document.lineAt(document.lineCount - 1);
  const fullRange = new vscode.Range(document.positionAt(0), lastLine.range.end);
  return vscode.TextEdit.replace(fullRange, formattedText);
}

/** Returns the formatted text only if it differs from the current document, else null. */
function nextFormattedText(document: vscode.TextDocument): string | null {
  if (!isComponentTemplate(document)) {
    return null;
  }
  const formatted = formatPyjinhxTemplate(document.getText());
  return formatted === document.getText() ? null : formatted;
}

export function registerFormatting(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(TEMPLATE_SELECTOR, {
      provideDocumentFormattingEdits(document) {
        const formatted = nextFormattedText(document);
        return formatted === null ? [] : [fullDocumentEdit(document, formatted)];
      },
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument((event) => {
      const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
      if (!config.get(FORMAT_ON_SAVE_KEY, true)) {
        return;
      }
      const formatted = nextFormattedText(event.document);
      if (formatted === null) {
        return;
      }
      output.appendLine(`Formatting slots before save: ${event.document.uri.fsPath}`);
      event.waitUntil(Promise.resolve([fullDocumentEdit(event.document, formatted)]));
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(FORMAT_SLOTS_COMMAND, async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const formatted = nextFormattedText(editor.document);
      if (formatted === null) {
        return;
      }
      await editor.edit((builder) => {
        builder.replace(
          new vscode.Range(
            editor.document.positionAt(0),
            editor.document.lineAt(editor.document.lineCount - 1).range.end,
          ),
          formatted,
        );
      });
    }),
  );
}
```

- [ ] **Step 2: Write `src/extension.ts`**

```ts
import * as vscode from "vscode";
import { OUTPUT_CHANNEL_NAME } from "./config.ts";
import { registerFormatting } from "./vscode/formatting.ts";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  output.appendLine("PyJinHx extension activated.");
  context.subscriptions.push(output);
  registerFormatting(context, output);
}

export function deactivate(): void {}
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: no errors (exit 0).

- [ ] **Step 4: Build the bundle and confirm it is loadable CJS**

```bash
npm run build
test -f dist/extension.cjs && echo "bundle exists"
# The bundle externalizes 'vscode'; stub it so require() resolves, then assert exports.
node --input-type=commonjs -e '
const Module = require("module");
const orig = Module._load;
Module._load = (req, parent, isMain) => (req === "vscode" ? {} : orig(req, parent, isMain));
const ext = require("./dist/extension.cjs");
if (typeof ext.activate !== "function" || typeof ext.deactivate !== "function") {
  throw new Error("activate/deactivate not exported");
}
console.log("bundle exports activate/deactivate OK");
'
```

Expected: `built dist/extension.cjs`, `bundle exists`, `bundle exports activate/deactivate OK`.

- [ ] **Step 5: Commit**

```bash
git add src/vscode/formatting.ts src/extension.ts
git commit -m "feat(vscode): wire formatting provider, save hook, and command into activation"
```

---

### Task 8: Codebase guide documentation

**Files:**
- Create: `docs/codebase-guide.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Write `docs/codebase-guide.md`**

Content MUST cover, accurately reflecting the final code:
1. **What the extension does** — highlighting (TextMate grammars) + formatting (component templates under `**/components/**`).
2. **Layered architecture** — a diagram: `extension.ts` (composition root) → `src/vscode/` (adapter, only layer importing `vscode`) → `src/core/` (pure formatter). State the dependency rule: `core/` never imports `vscode`.
3. **File-by-file tour** — `config.ts`, `core/slots.ts`, `core/html-structure.ts`, `core/format.ts`, `vscode/component-template.ts`, `vscode/formatting.ts`, `extension.ts`, `syntaxes/*`.
4. **How formatting works** — pipeline `formatSlottedPascalTags` → `formatHtmlStructure`; the inline-vs-block rule; Jinja depth keywords (`if/for/macro/block/filter/raw`, `elif/else`, `end*`); the scope guard.
5. **The seven invariants** (copied from the spec) and **the golden-file contract** (`test/fixtures/components` → `test/fixtures/expected`, regenerate with `scripts/gen-goldens.mjs`).
6. **Known limitations / future work** — the 5 behavioral quirks from the spec (inline whitespace loss, trailing-space artifact, asymmetric `>`, dropped whitespace-only text, shape-based slot detection), each flagged as deliberately preserved.
7. **Dev workflow** — `npm install`, `npm run check`, `npm test`, `npm run build`, `npm run package`; Node ≥23.6 requirement for `.ts` tests; how to add a fixture (drop file in `components/`, regenerate goldens, run tests).

- [ ] **Step 2: Commit**

```bash
git add docs/codebase-guide.md
git commit -m "docs: add codebase guide (architecture, formatting pipeline, invariants, dev workflow)"
```

---

### Task 9: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full gate**

```bash
cd /home/mtts/Code/pjx-ls
npm run check && node --test && npm run build
```

Expected: type-check clean; all tests pass (core + vscode suites, incl. 21 goldens); bundle built.

- [ ] **Step 2: Package smoke test (does not publish)**

```bash
npx vsce package --no-dependencies 2>&1 | tail -n 5 || echo "vsce reported issues — inspect output"
ls *.vsix 2>/dev/null && echo "vsix built" || echo "no vsix (acceptable if vsce flags non-blocking metadata)"
rm -f *.vsix
```

Expected: either a `.vsix` is produced, or `vsce` prints only non-blocking metadata warnings (e.g. missing icon/repository). Record the outcome.

- [ ] **Step 3: Confirm cleanup is complete**

```bash
test ! -e pyjinhx-highlight && echo "no legacy dir"
git ls-files '*.vsix' | wc -l   # expect 0 tracked vsix
find . -path ./node_modules -prune -o -name '*.vsix' -print   # expect none
```

Expected: `no legacy dir`, `0`, no stray vsix.

- [ ] **Step 4: Final commit (if anything pending)**

```bash
git add -A && git commit -m "chore: final verification pass" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Highlighting preserved → grammars moved unchanged, package.json paths updated (Task 2). ✓
- Formatting preserved byte-for-byte → golden contract over 21 fixtures + verified unit cases (Tasks 3–5). ✓
- Layered architecture (core/ pure, vscode/ adapter, extension.ts root) → Tasks 3–7. ✓
- Import nori components as fixtures → Task 1. ✓
- Cleanup (.vsix, bin/, flatten) → Task 2. ✓
- Invariants identified → encoded as tests (idempotency, scope guard, slot rule, quote safety, structure rules, config; grammar scopes left to grammars). ✓
- Stale/wrong code → `activationEvents:["*"]` fixed (Task 2), metadata reworded (Task 2); dead-branch claim RETRACTED and guarded by test (Task 4). ✓
- Unit tests (node:test, formatter logic) → Tasks 3–6. ✓
- TypeScript + esbuild + `"type":"module"` + CJS bundle → Task 2, proven in Task 7. ✓
- Codebase guide → Task 8. ✓

**Placeholder scan:** No TBD/TODO; all code and expected outputs are concrete and verified.

**Type consistency:** `formatPyjinhxTemplate`, `formatSlottedPascalTags`, `formatHtmlStructure`, `isHtmlSlotValue`, `splitHtmlFragments`, `formatInnerSlotContent`, `isComponentTemplate`, `TemplateDocumentLike`, `registerFormatting`, `activate`/`deactivate`, and the `config.ts` constant names are used consistently across tasks and match their definitions.
