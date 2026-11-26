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
- No HTML features inside slot values.
- The HTML service does not auto-close tags here; the language configuration's pairs
  cover the common case.
- CSS and JS problems are not reported in `.pjx` files: the editor only computes them
  for a shown document.

### Formatting
- Re-indents the HTML/Jinja structure (two-space) and **explodes** slotted component
  tags: each attribute on its own line, the slot value formatted recursively, and the
  closing `>` / `/>` on its own line.
- Always keeps a blank line between a `{#def … #}` header and the rest of the file.
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
  `src/core/html-structure.ts`) is treated as non-rendering. That is wrong for
  elements styled `display: inline-block` (e.g. inline-block `<li>` menus can gain
  gaps).
- Whitespace inside slot values is re-laid out.

## Commands

| Command | Description |
|---------|-------------|
| `PyJinHx: Format Slotted Component Tags` | Format the active component template. |

## Requirements

VS Code (or Cursor) `^1.80.0`. No other extension is needed: the Jinja grammar is
bundled (see `THIRD_PARTY_NOTICES.md`).

## Development

```bash
npm install
npm run check    # type-check (tsc --noEmit)
npm test         # unit tests (node --test; requires Node >= 23.6)
npm run build    # bundle to dist/extension.cjs
npm run package  # produce a .vsix
node scripts/sync-pyjinhx.mjs [--check] [<pyjinhx checkout>]  # vendor pyjinhx's block grammar and corpus
UPDATE_SNAPSHOTS=1 npm test  # rewrite the grammar goldens in test/grammar/snapshots
```

## License

MIT — see the `LICENSE` file in the repository.
