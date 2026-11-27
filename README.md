# PyJinHx — VS Code / Cursor extension

Syntax highlighting and an opinionated formatter for the
[PyJinHx](https://github.com/paulomtts/pyjinhx) Python component framework — Jinja +
HTML templates with PascalCase components, slots, and `{#def … #}` signature headers.

Works on `.pjx` files. Plain `.html`/Jinja files are never touched by the formatter
or its command.

## Features

### Highlighting
Each region is tokenized by the grammar of its own language, so your theme colours it
the way it colours that language everywhere else.

| Region | Grammar |
|---|---|
| Markup and attributes | VS Code's HTML grammar |
| `{{ … }}`, `{% … %}`, `{% raw %}` | the bundled Jinja grammar (`source.pyjinhx.jinja`) |
| `{#css` … `#}` and `<style>` | CSS |
| `{#js` … `#}` and `<script>` | JavaScript |
| `{#def` … `#}` and `{#python` … `#}` | Python (prop names in `{#def` are `variable.parameter`) |
| `template = """…"""` in a `.py` file | PyJinHx (blocks, component tags, Jinja) |

- **Blocks** follow Jinja: the first `#}` ends a block, as it ends any comment. The
  keyword touches `{#` (`{# css` and `{#-css` are plain comments), `{#css` and `{#js`
  end their line, and `{#python` opens in column 0.
- **Component tags** — PascalCase tags get `entity.name.tag.component` plus
  `support.class.component`, the scopes themes already colour for JSX components.
  A markup-valued attribute (a slot) is highlighted as embedded PyJinHx.
- **Jinja everywhere it renders** — inside tags, attribute values, `<script>` and
  `<style>`, but never inside a `{#css`/`{#js`/`{#python` body or a comment.
- Component tags are scoped `support.class.component`, so most themes colour them like
  classes. That is intended.
- The extension no longer ships colour overrides; colours come from your theme.
- The block grammar and test corpus are vendored from PyJinHx
  (`scripts/sync-pyjinhx.mjs`) and CI fails when they drift.

### Language features
Completion, hover, signature help, go to definition, document highlights and colour
swatches for HTML, CSS and JavaScript in `.pjx` files, answered by the editor's own
services: the document is shown to the HTML service as plain HTML, with Jinja,
`{#def` and `{#python` blanked and `{#css`/`{#js` blocks as `<style>`/`<script>`.

- JavaScript intelligence is the HTML service's embedded mode: one file, DOM typings, no
  project imports (the TypeScript service does not serve custom schemes).
- Nothing is offered inside Jinja, `{#def`, `{#python` or the `{#css`/`{#js` tag lines.
- No HTML features inside slot values, and no relative path completion for `href`/`src`
  (the view has no directory).
- The view is a `pjx-embedded:` HTML document, so other extensions that act on HTML
  (Emmet, Tailwind, AI assistants) may contribute to it too.
- The HTML service does not auto-close tags here; the language configuration's pairs
  cover the common case.
- CSS and JS problems are not reported in `.pjx` files: the editor only computes them
  for a shown document.

### Components (needs pyjinhx 1.17 or later)
Component tags and props are read from `python -m pyjinhx.manifest`, which reads your
project statically and imports nothing.

- Completion of component tags (next to the HTML ones), of a component's props (required
  ones first, booleans without a value) and of `Literal` values inside `tone="`.
- Hover on a tag or a prop: the component's signature, the prop's annotation and default.
- Go to definition: a tag goes to its class (or to the `.pjx` of a template-only
  component), an attribute to its prop, and a name in `{{ }}` or `{% %}` to the prop or
  member of the template's own component.
- Inside `{{ }}`, the template's own props and members are completed where an expression
  begins. Nothing else in Jinja is.
- Diagnostics from the manifest (grammar errors, invalid headers, tag collisions, stub
  warnings) with their pyjinhx code, and a warning on a `{#def` header that a Python class
  makes stale.
- `Card-header` and `Card.Item` are the `Card` component, as pyjinhx renders them (the
  grammar still colours them as plain custom elements).
- Only PascalCase tags are components: `<button>` is never `Button`, and the HTML service's
  own completions (HTML tags and attributes, close tags) are left to it.

The manifest is read when the folder opens, and again 300 ms after a `.pjx`, `.py` or
`.pyi` file is saved, created or deleted. The active unsaved document is sent on stdin,
so completion follows what you type. The interpreter is `pyjinhx.pythonPath`, else the
Python extension's environment (if installed), else `.venv` in the folder, else `python3`.
Settings: `pyjinhx.pythonPath`, `pyjinhx.generateStubs`, `pyjinhx.format.python`, `pyjinhx.format.sortImports`, `pyjinhx.manifest.paths`, `pyjinhx.manifest.sysPath`.

**Stubs.** With `pyjinhx.generateStubs` on (the default), a `.pjx` with a `{#python` block
gets its `<name>.pyi` written beside it, as `python -m pyjinhx.stubgen` does, whenever the
manifest reports the stub missing or stale: on opening the folder and after a save. The
documents found at once are done in one run. If a run fails, the error goes to the
PyJinHx output channel and it is not retried until the document is saved again. With the
setting off, the warning stays and offers a **Generate stub for this document** quick fix.

**Python block intelligence.** Names inside a `{#python` block are coloured by what they
are (classes, properties, parameters, functions, enum members), as in a `.py` file. The
colours come from a private [basedpyright](https://github.com/DetachHead/basedpyright)
language server bundled with the extension (pinned to 1.40.2) and started only when a
`.pjx` with a block is open, with a 256 MB heap limit (about 300 MB of memory in use). The
server is shown the block as a Python file with the same lines and columns as the
`.pjx`, so nothing is translated back. A sibling component's class resolves through its
`.pyi` stub (see **Stubs**), and a change to a `.py` or `.pyi` file recolours the open
blocks. Everything outside the block keeps the grammar's colours. Needs a trusted
workspace (the server asks your interpreter for its search paths). If the server stops
three times it is left off until the window reloads, and the status bar tooltip says so.
Settings: `pyjinhx.pythonBlock.enabled` (default on; off stops the server) and
`pyjinhx.pythonBlock.serverPath` (another basedpyright `langserver.index.js`).
Inside the block's lines you also get **hover**, **go to definition**, **completion** and
**signature help**. Go to definition on a sibling component lands on its `.pjx`, not its
generated `.pyi` stub. Auto-import completions are not offered (their edit would land
outside the block). In the markup, the `{#css`/`{#js` blocks and Jinja the other providers
answer as before.

The same server reports **diagnostics** for the block's lines (source `basedpyright`).
pjx-ls does not read your Pyright configuration: basedpyright does. If the project has a
`pyrightconfig.json`, a `[tool.pyright]` table or a `[tool.basedpyright]` table, the server
ignores `pyjinhx.pythonBlock.typeCheckingMode` completely, and a config that does not set
`typeCheckingMode` gets basedpyright's own default, `recommended`, which is much louder
(5 diagnostics against 1 in one measured project whose `[tool.pyright]` only set
`include`). Set `typeCheckingMode` in the project config. Only a project with none of those
configs uses `pyjinhx.pythonBlock.typeCheckingMode` (default `standard`; `off` makes the
block as quiet as a `.py` file in a project without Pyright configuration, which is
Cursor's own default). A diagnostic on a range where pyjinhx already reports something is
left out. Turn them off with `pyjinhx.pythonBlock.diagnostics`; the colours stay.

**Limited mode.** When pyjinhx cannot be run (not installed, older than 1.17, no
interpreter, an untrusted workspace) the status bar says `pyjinhx: limited`. Tags and
props then come from the `.pjx` file names and `{#def` headers only: tag and prop
completion, hover (the header's signature) and go to definition work; a component whose
props are in a `.py` file (split, `template = ...`, `{#python`) has none there, and there
are no diagnostics. Call-site checks
(unknown tag, unknown or missing prop) wait for pyjinhx to report them. An untrusted
workspace also runs no ruff, so `{#python` bodies are not formatted there.

### Formatting
- Re-indents the HTML/Jinja structure (two-space) and **explodes** slotted component
  tags: each attribute on its own line, the slot value formatted recursively, and the
  closing `>` / `/>` on its own line.
- Always keeps a blank line between a `{#def … #}` header and the rest of the file.
- Formats the body of a `{#python` block with **ruff** (`ruff format`), using the
  project's own ruff configuration (`pyproject.toml`, `ruff.toml`). Imports in the
  block are sorted first (ruff's `I001` fix with the project's
  `[tool.ruff.lint.isort]` settings; no other lint rule is run, whatever the project
  selects). `pyjinhx.format.sortImports: false` turns the sorting off; a
  `# isort: skip_file` line does it for one block. ruff is looked for as
  `<interpreter> -m ruff` in the project's environment, then as `ruff` on `PATH`; it is
  not bundled. Without ruff, on a body ruff cannot parse, and in an untrusted workspace
  the body is left exactly as it is and the rest of the file is still formatted; the
  reason is in **PyJinHx: Show Output**. When ruff is not found at all, one message
  per session offers a **Turn off** button. `pyjinhx.format.python: "off"` turns it off.
- **Idempotent** — running it again changes nothing.
- Available as **Format Document**, the **PyJinHx: Format Slotted Component Tags**
  command, and **format-on-save** (opt-in through VS Code's own setting, see below).

## Setup

Install from the Marketplace. Formatting on save is off by default; enable it for
`.pjx` only, in your settings:

```jsonc
"[pyjinhx]": {
  "editor.formatOnSave": true
}
```

A global `"editor.formatOnSave": true` also formats `.pjx` files. The extension is the only formatter registered for `.pjx`, so VS Code uses it
automatically; add `"editor.defaultFormatter": "paulomtts.pyjinhx-syntax-support"` to
the same block if you have other formatters installed.

On save the file is formatted first and written second, so the `.pyi` stub (see
**Stubs**) is generated from the formatted block.

`.pjx` files are formatted anywhere. The extension does not register for the `html`,
`jinja` or `jinja-html` languages, so it never competes with their formatters.

## Emmet

Emmet is not enabled for `.pjx` by default: it cannot tell markup from a `{{ }}`
expression or a `{#js`/`{#python` body, so it would offer abbreviations (`a.b`,
`os.path`) inside code. To use it in markup anyway, add this to your settings:

```jsonc
"emmet.includeLanguages": { "pyjinhx": "html" }
```

## Typing

`{` auto-closes to `{}`. When you then type `#` in markup, the extension removes the `}`
the editor just inserted, so `{#css` and `{#def` openers leave no stray brace. A `}` you
typed or that was already there stays. It acts on a single-cursor `#` keystroke only, and
not inside block bodies, `<script>` or `<style>` (tag mentions in comments and
`{% raw %}` regions do not count). Typing `#}` on its own line outdents it, so a
`{#python` closer lands in column 0.

This handler, the bracket pairs and the folding apply to `.pjx` files only. Inside
`template = """…"""` in a `.py` file the document language is Python, so the editor uses
Python's configuration there; only the highlighting is PyJinHx.

## Known limitations

- `{#css` and `{#js` bodies are not formatted yet.
- The Python body is formatted as a module of its own: ruff is told the file is
  `<name>.py` beside the `.pjx`, and `exclude` patterns are not applied to it.
- Import sorting follows `unfixable` and `per-file-ignores` but not `ignore`, and a
  project's `required-imports` are not added to a block.
- A workspace folder with no `.pjx` file does not run the manifest until one exists, so a
  folder of `template = ...` components in `.py` files only gets no component features.
- There is no component completion, hover or definition inside slot values
  (`<Card body="<Ba|">`).
- Do not toggle comments on a block opener, closer or one-line header line
  (`{#def … #}`, `{#css`, `{#js`, `{#python`, `#}`). The editor sees those lines as a
  `{# #}` comment: the first toggle strips the delimiters, and toggling again can turn
  `{#def` into `{# def`, silently making the header a plain comment. No configuration
  fixes this, and an override would have to take over the comment keys for the whole
  language.
- Toggle Line Comment works on the body lines of `{#css` (`/* */`), `{#js` (`//`) and
  `{#python` (`#`). On the body lines of a multi-line `{#def` it did nothing in a
  hands-on test, although the grammar and the language mapping are identical to
  `{#python`'s; comment those lines by hand.
- `{{` and `{%` auto-close inside `{#css`/`{#js`/`{#python` bodies, where Jinja does not
  render; the editor offers no per-region switch for that.
- A `template = """…"""` at 4 spaces (or one tab) is highlighted as PyJinHx wherever it
  appears, including inside a module-level function; TextMate cannot tell a class body
  from a function body.
- In `<style>` and CSS comments, Jinja names can pick up a theme's `source.css variable`
  colour, because the injected Jinja still sits inside the CSS scope.

- Whitespace next to block-level tags (the `BLOCK_ELEMENTS` list in
  `src/core/format.ts`) is treated as non-rendering. That is wrong for
  elements styled `display: inline-block` (e.g. inline-block `<li>` menus can gain
  gaps).
- Whitespace inside slot values is re-laid out.

## Commands

| Command | Description |
|---------|-------------|
| `PyJinHx: Format Slotted Component Tags` | Format the active component template. |
| `PyJinHx: Refresh Component Manifest` | Read the manifest again now. |
| `PyJinHx: Show Output` | Open the log: the commands run and how long they took. |

## Requirements

VS Code (or Cursor) `^1.80.0`. No other extension is needed: the Jinja grammar is
bundled (see `THIRD_PARTY_NOTICES.md`). Component features need pyjinhx 1.17 or later in
the project's Python environment.

## Development

```bash
npm install
npm run check    # type-check (tsc --noEmit)
npm test         # unit tests (node --test; requires Node >= 23.6)
npm run build    # bundle to dist/extension.cjs, plus the basedpyright server in dist/basedpyright
npm run test:lsp # drive the bundled server headlessly (after build)
xvfb-run -a env -u WAYLAND_DISPLAY npm run test:editor  # editor tests, only ever under Xvfb on Linux
npm run package  # produce a .vsix
node scripts/gen-manifest-fixture.mjs <python>  # regenerate test/fixtures/manifest/project.json with the real pyjinhx
PJX_PYTHON=<python> npm test  # also runs the contract test against the real pyjinhx
node scripts/sync-pyjinhx.mjs [--check] [<pyjinhx checkout>]  # vendor pyjinhx's block grammar and corpus
UPDATE_SNAPSHOTS=1 npm test  # rewrite the grammar goldens in test/grammar/snapshots
```

## License

MIT — see the `LICENSE` file in the repository.
