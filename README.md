# PyJinHx — VS Code / Cursor extension

Syntax highlighting, formatting, and Python tooling for the
[PyJinHx](https://github.com/paulomtts/pyjinhx) Python component framework — Jinja +
HTML templates with PascalCase components and slots.

Works on `.pjx` files and on PyJinHx component templates written as `.html`/Jinja.

## Features

### Highlighting
- **Component tags** — PascalCase tags like `<PJXButton/>` are colored distinctly
  from plain HTML elements, wherever they appear (including inside slots).
- **Interpolation** — `{{ … }}` is colored like a Python f-string interpolation, in
  body text, attributes, and slot values alike.
- **Slots** — a markup-valued attribute is highlighted as embedded PyJinHx (tags,
  attributes, text) with the wrapping quotes colored as strings.
- **`{# python … #}` blocks** — the Python code inside the block receives full
  `source.python` syntax highlighting (see [Single-file components](#single-file-components)).

### Formatting
- Re-indents the HTML/Jinja structure (two-space) and **explodes** slotted component
  tags: each attribute on its own line, the slot value formatted recursively, and the
  closing `>` / `/>` on its own line.
- `{# python … #}` blocks are left **verbatim** — the formatter never touches the
  Python code inside them.
- **Idempotent** — running it again changes nothing.
- Available as **Format Document**, the **PyJinHx: Format Slotted Component Tags**
  command, and **format-on-save**.

## Single-file components

PyJinHx `.pjx` files support an optional `{# python … #}` block that holds the
component's Python logic alongside its template:

```jinja
{# python
def greet(name: str) -> str:
    return f"Hello, {name}!"
#}

<p>{{ greet(name) }}</p>
```

### Python highlighting

The `{# python … #}` block is highlighted with full `source.python` grammar — keywords,
types, strings, decorators, and so on — without any additional setup.

### Python intellisense (completion / hover / go-to-definition)

Intellisense inside `{# python … #}` blocks is **forwarded to your installed Python
extension** (Pylance or Pyright). This means:

- **Highlighting works without a Python extension.**
- **Intellisense requires a Python extension** (e.g. *Pylance* or *Pyright*) to be
  installed and active in VS Code/Cursor.

When a Python extension is present, completion, hover, and go-to-definition requests
inside the block are delegated to it via a virtual-document that contains only the
Python content. Results are mapped back to the correct positions in the `.pjx` file.

### Stub generation on save

To keep tooling accurate, the extension can regenerate `.pyi` stub files whenever you
save a `.pjx` file. This requires `pyjinhx` to be installed in your Python environment.

| Setting | Default | Description |
|---------|---------|-------------|
| `pyjinhx.generateStubsOnSave` | `true` | Regenerate `.pyi` stubs on every save. |
| `pyjinhx.pythonPath` | `""` | Path to the Python interpreter used to run `pyjinhx.stubgen`. Empty uses `python` on `PATH`. |

Stub generation is **trust-gated**: it will not run in untrusted workspaces.

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
| `pyjinhx.generateStubsOnSave` | `true` | Regenerate `.pyi` stubs on save (requires `pyjinhx` installed). |
| `pyjinhx.pythonPath` | `""` | Python interpreter path for stub generation. Empty uses `python` on `PATH`. |

## Commands

| Command | Description |
|---------|-------------|
| `PyJinHx: Format Slotted Component Tags` | Format the active component template. |

## Requirements

VS Code (or Cursor) `^1.80.0`. Jinja block highlighting is enhanced if a Jinja
grammar (e.g. *Better Jinja*) is installed, but is not required. For Python
intellisense inside `{# python … #}` blocks, a Python extension such as
[Pylance](https://marketplace.visualstudio.com/items?itemName=ms-python.vscode-pylance)
or [Pyright](https://marketplace.visualstudio.com/items?itemName=ms-pyright.pyright)
must be installed.

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
