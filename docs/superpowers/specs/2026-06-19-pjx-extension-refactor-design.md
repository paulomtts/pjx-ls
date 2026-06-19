# PyJinHX VSCode Extension — Refactor Design

**Date:** 2026-06-19
**Status:** Approved (architecture); pending implementation plan

## Goal

Refactor the existing PyJinHX VSCode/Cursor extension (`pyjinhx-highlight/`) into a
clean, layered, TypeScript codebase with unit tests, without changing its
externally observable behavior. The extension provides two things and will
continue to provide exactly those two things:

1. **Syntax highlighting** for the PyJinHX framework (PascalCase component tags,
   `{#def … #}` signature headers, `{{ … }}` interpolation, HTML-in-slot values)
   via TextMate grammars.
2. **Template formatting** for component templates (slot-value expansion +
   structural HTML/Jinja re-indentation) via a pure formatting engine wired into
   VSCode.

**Out of scope:** No Language Server (LSP), no new runtime features (diagnostics,
hover, completion), no grammar-codegen. This is a reorganization + hardening pass,
not a feature expansion.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Target architecture | Reorganize as-is — grammar + formatter extension, no LSP |
| Language / tooling | TypeScript + build step (esbuild) + `@types/vscode` |
| Tests | Formatter (core) logic, Node's built-in `node:test` runner |
| Test fixtures | All `.html` components from `~/Code/nori/.../new/` (+ sibling `.py` for slot reference) |
| Cleanup | Delete all 16 `.vsix`; flatten `pyjinhx-highlight/` to repo root |
| `bin/format-file.js` CLI | Remove (redundant with the VSCode formatter) |

## Architecture

Two layers: a dependency-free formatting **core** and a thin **VSCode adapter**,
wired by a small activation entrypoint (the composition root).

```
src/
  extension.ts              # activate()/deactivate() — wires adapter to VSCode (thin)
  config.ts                 # constants: language ids, file extensions, settings keys
  vscode/                   # adapter layer — the ONLY code that imports `vscode`
    component-template.ts   # isComponentTemplate(): path + extension + language-id guards
    formatting.ts           # format provider, onWillSave hook, formatSlots command, TextEdit building
  core/                     # domain — NO `vscode` import, fully unit-testable
    format.ts               # formatPyjinhxTemplate() orchestrator
    slots.ts                # slot-value expansion (from format-slots.js)
    html-structure.ts       # tokenizer + structural re-indent (from format-html-structure.js)
syntaxes/                   # 7 TextMate grammars (assets — moved, otherwise unchanged)
test/
  fixtures/components/...    # imported nori .html (+ sibling .py)
  core/*.test.ts            # node:test unit tests
language-configuration.json
package.json
tsconfig.json
esbuild config
.vscodeignore
.gitignore
```

### Layer responsibilities

- **`core/`** — Pure string-in/string-out functions. Knows nothing about VSCode,
  the filesystem, or documents. This is the formatting engine lifted verbatim (in
  behavior) from `format-slots.js` + `format-html-structure.js`, split into
  `slots.ts`, `html-structure.ts`, and a `format.ts` orchestrator. 100% of unit
  tests target this layer.
- **`vscode/`** — The only modules permitted to `import * as vscode`. Translates
  between the VSCode API (documents, edits, config, save events, commands) and the
  pure core. `component-template.ts` holds the scope guard; `formatting.ts` holds
  the provider/hook/command registrations and turns a formatted string into a
  full-document `TextEdit`.
- **`extension.ts`** — Composition root. `activate()` constructs the output
  channel and registers the adapter's contributions against `context.subscriptions`.

### Data flow

```
VSCode save/format/command
        │
        ▼
vscode/ adapter ── reads document text + pyjinhx config
        │
        ▼
core/format.ts (pure) ── formatSlottedPascalTags → formatHtmlStructure
        │
        ▼
vscode/ adapter ── if result ≠ original, build full-document TextEdit
        │
        ▼
VSCode applies edit
```

The core never receives a `vscode.TextDocument` — only its text.

## Invariants to preserve

These define correctness. Each becomes one or more `node:test` cases. The refactor
must not change any of them.

1. **Idempotency.** Formatting already-formatted text yields a byte-identical
   string (the adapter then emits no edit). Essential for format-on-save not to
   thrash.
2. **Scope guard.** Only documents whose path contains `/components/`, with a
   `.html` or `.pjx` extension, and a template language id
   (`html`, `jinja`, `jinja-html`, `pyjinhx`) are ever formatted. Everything else
   is left untouched.
3. **Slot expansion.** A single-line attribute value `attr="<…html…>"` is expanded
   into indented multi-line form **only** when the value is HTML
   (`isHtmlSlotValue` — trimmed value starts with `<` followed by `/` or a letter).
   Plain-string attribute values are never reflowed.
4. **Interpolation / quote safety.** While scanning for quotes and tags, `{{ … }}`
   interpolation and nested quotes (`'…'` inside `"…"`) are skipped. Content inside
   interpolation or quoted strings is never reflowed, split, or broken.
5. **Structure rules.** Two-space indentation. Elements whose children are only
   text and/or `{{ }}` expressions stay inline on one line. Jinja block tags
   adjust depth: `if/for/macro/block/filter/raw` open (+1), `elif/else` mid (0,
   re-aligned), `end*` close (-1).
6. **Grammar scopes.** PascalCase tags → `entity.name.tag.pyjinhx`; `{#def … #}`
   header → Python-ish signature scopes; `{{ }}` → `…pyjinhx-interpolation`;
   grammars inject into `text.html.basic`, `text.html.jinja`, and `text.pyjinhx`;
   `.pjx` files resolve to the `pyjinhx` language.
7. **Config.** `pyjinhx.formatSlotsOnSave` defaults to `true`; when `false`, the
   onWillSave hook does nothing.

## Stale / wrong code to drop or fix

Each item is verified by first pinning current behavior with a test (or confirming
it is genuinely dead) before changing it.

- **`activationEvents: ["*"]`** → activate on the contributed languages instead.
  Eager `"*"` activation is deprecated and slows editor startup. (Observable
  behavior unchanged for users — the formatter only acts on component templates
  anyway.)
- **Dead branch** in `formatSlottedPascalTags`: `if (content === formattedContent)
  { continue }` can never be true because `formattedContent` always begins with a
  newline. Remove after confirming via test.
- **Duplicated def-signature grammar** across `pyjinhx.json` and
  `pyjinhx-injection-def-header*.json`. Kept as hand-maintained JSON (no codegen —
  out of scope) but documented as intentionally mirrored.
- **Metadata mismatch.** `name`/`displayName` say "slot-highlight" though the
  extension both highlights and formats. The package `name`
  (`pyjinhx-slot-highlight`) is kept **stable** to preserve update continuity for
  any existing installs; only `displayName` and `description` are reworded to
  reflect highlighting + formatting.
- **Remove** `bin/format-file.js`, all 16 `.vsix` artifacts, and the nested
  `pyjinhx-highlight/` directory (flatten to repo root).

## Testing

Runner: Node's built-in `node:test` (no VSCode host needed, fast). Compiled TS or
ts-loader via `--import`/`tsx` — exact wiring decided in the implementation plan.

Coverage targets (all against `core/`):

- **Idempotency** — every imported nori fixture: `format(format(x)) === format(x)`,
  and for already-formatted fixtures `format(x) === x` where applicable.
- **Slot expansion** — inline `start="<PJXIcon name='plus'/>"` expands; plain
  `variant="secondary"` does not; nested HTML in a slot indents correctly.
- **Structure** — inline-vs-block element decisions; self-closing tags; Jinja
  `for`/`if`/`elif`/`else` depth.
- **Interpolation / quote safety** — `{{ }}` containing `<`, `>`, or quotes is not
  treated as a tag; single quotes inside double-quoted attrs are respected.

The imported nori components (`pages/`, `primitives/`, fragments, shells) provide
realistic, framework-accurate fixtures spanning slots, def-headers, loops, inline
elements, and nested structure.

## Migration / cleanup steps (high level — detailed in plan)

1. `git init` (done) and baseline commit.
2. Flatten `pyjinhx-highlight/*` to repo root; delete `.vsix` and `bin/`.
3. Introduce TypeScript: `package.json` scripts, `tsconfig.json`, esbuild bundling
   to `dist/`, `@types/vscode`.
4. Port formatter JS → `src/core/*.ts` (behavior-preserving), VSCode glue →
   `src/vscode/*.ts`, activation → `src/extension.ts`.
5. Import nori fixtures into `test/fixtures/`.
6. Write `node:test` suites; fix the identified dead/stale code under test cover.
7. Update `package.json` contributes paths, `activationEvents`, `.vscodeignore`.
