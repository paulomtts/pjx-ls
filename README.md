# PyJinHx — VS Code / Cursor extension

Syntax highlighting and an opinionated formatter for the
[PyJinHx](https://github.com/paulomtts/pyjinhx) Python component framework — Jinja +
HTML templates with PascalCase components, slots, and `{#def … #}` signature headers.

Works on `.pjx` files and on PyJinHx component templates written as `.html`/Jinja.

## Features

### Highlighting
- **Component tags** — PascalCase tags like `<PJXButton/>` are colored distinctly
  from plain HTML elements, wherever they appear (including inside slots).
- **`{#def … #}` headers** — parameters, types, strings, and literal brackets are
  colored Python-style; the header markers use the import color.
- **Interpolation** — `{{ … }}` is colored like a Python f-string interpolation, in
  body text, attributes, and slot values alike.
- **Slots** — a markup-valued attribute is highlighted as embedded PyJinHx (tags,
  attributes, text) with the wrapping quotes colored as strings.

### Formatting
- Re-indents the HTML/Jinja structure (two-space) and **explodes** slotted component
  tags: each attribute on its own line, the slot value formatted recursively, and the
  closing `>` / `/>` on its own line.
- Always keeps a blank line between a `{#def … #}` header and the rest of the file.
- **Idempotent** — running it again changes nothing.
- Available as **Format Document**, the **PyJinHx: Format Slotted Component Tags**
  command, and **format-on-save**.

## Setup

Install from the Marketplace, then to format `.pjx` on save add to your settings:

```jsonc
"[pyjinhx]": {
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "paulomtts.pyjinhx-syntax-support"
}
```

`.pjx` files are formatted anywhere. `.html`/Jinja templates are formatted only when
their path contains `/components/`, to avoid reformatting unrelated HTML.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `pyjinhx.formatSlotsOnSave` | `true` | Format PyJinHx component templates on save. |

## Commands

| Command | Description |
|---------|-------------|
| `PyJinHx: Format Slotted Component Tags` | Format the active component template. |

## Requirements

VS Code (or Cursor) `^1.80.0`. Jinja block highlighting is enhanced if a Jinja
grammar (e.g. *Better Jinja*) is installed, but is not required.

## Development

```bash
npm install
npm run check    # type-check (tsc --noEmit)
npm test         # unit tests (node --test; requires Node >= 23.6)
npm run build    # bundle to dist/extension.cjs
npm run package  # produce a .vsix
```

## License

MIT — see the `LICENSE` file in the repository.
