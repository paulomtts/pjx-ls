# Changelog

All notable changes to the **PyJinHx** extension are documented here. This project
adheres to [Semantic Versioning](https://semver.org/).

## 0.5.1

### Added
- A **Generate stub for this document** quick fix on the `stub-missing` warning: it runs
  `python -m pyjinhx.stubgen` on the document with the same interpreter as the manifest,
  then refreshes the manifest.

## 0.5.0

### Added
- **Components from the pyjinhx manifest** (`python -m pyjinhx.manifest`, pyjinhx 1.17+):
  completion of component tags, props (required first) and `Literal` values, hover,
  go to definition for tags, props and a template's own names, completion of the
  template's own props and members inside `{{ }}`, and the manifest's diagnostics with
  their codes, from a small provider on the region scanner whose results sit beside the
  editor's own HTML ones.
- Interpreter discovery (`pyjinhx.pythonPath`, the Python extension, `.venv`, `PATH`),
  settings `pyjinhx.manifest.paths` and `pyjinhx.manifest.sysPath`, commands
  `PyJinHx: Refresh Component Manifest` and `PyJinHx: Show Output`.
- Limited mode with a `pyjinhx: limited` status bar item when pyjinhx cannot be run: tags
  and props from the `.pjx` files, no hover detail, no diagnostics.
- Workspace trust: in an untrusted workspace no interpreter is run.

### Changed
- The stale `{#def#}` header warning comes from the manifest's `has_stale_def_header`, not
  from a sibling `.py` file.
- The editor tests run in `test/fixtures/project`, with a fake interpreter.

## 0.4.0

### Added
- **Language features for HTML, CSS and JS** in `.pjx` files: completion, hover,
  signature help, definitions, document highlights and colours, forwarded to the
  editor's HTML service through a `pjx-embedded:` view of the document.
- One region scanner (`src/core/regions.ts`) for Jinja regions, `{#css`/`{#js`/
  `{#python`/`{#def` blocks with pyjinhx's error codes, tags, attributes and
  script/style bodies, tested against the vendored conformance corpus.
- An editor test suite (`npm run test:editor`) on `@vscode/test-electron`.

### Changed
- The stale `{#def#}` header diagnostic reads the header with the scanner: a `{#def` block is
  found anywhere in the document (the legacy `{# def` only as the first content), and a header
  that is never closed is not one.

## 0.3.0

### Changed
- **Highlighting is forwarded to the real grammars.** `{#css` bodies are CSS, `{#js`
  bodies JavaScript, `{#def` and `{#python` bodies Python, `{{ }}` and `{% %}` Jinja
  (bundled, `source.pyjinhx.jinja`, so no Jinja extension is needed), markup HTML.
- Scope names: blocks are `meta.block.<keyword>.pyjinhx` with `keyword.control.pyjinhx`
  and `punctuation.definition.block.{begin,end}.pyjinhx`; `{#def` prop names are
  `variable.parameter.pyjinhx`; component tags are `meta.tag.component.pyjinhx` with
  `entity.name.tag.component.pyjinhx support.class.component.pyjinhx`. The old
  `keyword.control.import.pyjinhx`, `meta.pyjinhx-def-header`, `entity.name.tag.pyjinhx`
  and the Python-placeholder scope on `{{ }}` are gone.
- A block ends at the first `#}`, as in Jinja, so an unclosed CSS brace or Python
  string can no longer swallow the closer. `{#-css`, `{# css`, `{#css x #}` and an
  indented `{#python` are plain comments; `{# def` is a header on the first line only.
- **Removed** the extension's hard-coded colours (`editor.tokenColorCustomizations`);
  themes colour the standard scopes. Emmet is not enabled by default (see the README).
- **Removed** the grammar injections into `text.html.basic` and `text.html.jinja`: the
  grammar applies to `.pjx` files and to `template = """…"""` strings in `.py` files
  only. The old `.html` and Jinja files are no longer touched.
- Slot values are only recognised on component tags.

### Fixed
- Python templates end at their closing quotes (a half-typed tag no longer colours the
  rest of the file) and only a `template` at 4 spaces or one tab is matched. That is a heuristic: a
  template at that indentation in a module-level function is matched too.
- Jinja and `{#css`/`{#js`/`{#python`/`{#def` blocks inside HTML, JS and CSS comments
  are still recognised, since they render; a mid-file `{# def` is plain comment text.
- All-caps tags (`<BR>`, `<DIV>`) are HTML, as in pyjinhx; a value after a
  Jinja-built attribute name (`data-{{ k }}="v"`) is a normal value.
- The spaced `{# def` header may follow blank lines, whitespace and one empty `{# #}`.
- `{% raw %}`/`{% endraw %}` delimiters are scoped.
- The drift check compares against the ref recorded in `SOURCE.json`; the sync script
  refuses a dirty checkout.

### Added
- Jinja inside tags, attribute values, `<script>` and `<style>`, and attribute names
  glued to Jinja (`big{% endif %}`); never inside `{#css`/`{#js`/`{#python` bodies.
- `template = r"""…"""` inside a Python class is highlighted as PyJinHx.
- `{% raw %}…{% endraw %}` suspends every pyjinhx rule.
- Typing `#` right after an auto-closed `{}` in markup removes the editor's `}`, so
  block openers leave no stray brace; `#}` on its own line outdents; `<` is an
  `autoCloseBefore` character.
- Auto-closing for `{{ }}`, `{% %}` and `<!-- -->`; folding by indentation plus `{#css`/`{#js`/`{#python`/
  `{#def` … `#}` blocks.
- `scripts/sync-pyjinhx.mjs` vendors pyjinhx's `block_grammar.json` and its
  conformance corpus; a CI job fails when they drift.

### Known issues
- Toggling comments on a block opener, closer or one-line `{#def` header changes it
  (twice can give `{# def`), and Toggle Line Comment does nothing on multi-line `{#def`
  body lines; see the README.

Also in 0.3.0, from the formatter safety work:

### Changed
- **Removed** the `pyjinhx.formatSlotsOnSave` setting and the custom on-save hook.
  Format on save now follows VS Code's own `editor.formatOnSave`, which is off unless
  you enable it (for `.pjx` only with `"[pyjinhx]": {"editor.formatOnSave": true}`).
- The formatter, its command and activation are limited to the `pyjinhx` language
  (`.pjx`); plain `.html` and Jinja files are no longer touched.

### Fixed
- Formatter safety: comments, `<script>`/`<style>`/`<textarea>`/`<pre>`, `{% raw %}`
  and `{#css`/`{#js` blocks are kept byte-for-byte; slot values holding them no longer
  grow on every save; no whitespace is added between glued inline siblings or inside
  inline elements; `%}`/`}}` inside Jinja strings, `{%+`/`{%-` tags, void elements,
  `set`/`with`/`call` blocks and CRLF files are handled; unbalanced markup is left
  unchanged.
- Minified Jinja/component runs (e.g. `{% if %}<A/>{% else %}<B/>{% endif %}`) are no
  longer split onto separate lines, since splitting changed rendered whitespace.
- Grammar: `{# … #}` comments are scoped as comments (no Python coloring of their
  body, with or without a Jinja grammar installed).

## 0.1.0 — Initial release

First public release.

### Highlighting
- PascalCase component tags (`<PJXButton/>`) colored distinctly from HTML tags.
- `{#def … #}` signature headers with Python-style coloring of parameters, types,
  strings, and literal brackets; the header markers render in the import color.
- `{{ … }}` interpolation colored like Python f-string interpolation, everywhere
  (body, attributes, and slot values).
- Slot values (markup inside an attribute) highlighted as embedded PyJinHx, with the
  wrapping quotes colored as strings.
- Injection grammars so the above also apply inside `.html` / Jinja templates.

### Formatting
- A formatter for component templates: structural HTML/Jinja re-indentation (two-space)
  with slot-aware "exploded" tags — a tag carrying a slot lays its attributes
  one-per-line and recursively formats the slot value.
- A blank line is always kept between a `{#def … #}` header and the rest of the file.
- Idempotent: formatting already-formatted output is a no-op.
- Runs on save (configurable via `pyjinhx.formatSlotsOnSave`) and via the
  **PyJinHx: Format Slotted Component Tags** command. `.pjx` files format anywhere;
  `.html` files format only under a `**/components/**` path.

### Language
- `.pjx` file association with the `pyjinhx` language, bracket/comment configuration,
  and a file icon.
