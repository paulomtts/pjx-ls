# Changelog

All notable changes to the **PyJinHx** extension are documented here. This project
adheres to [Semantic Versioning](https://semver.org/).

## 0.11.0

### Changed
- The formatter reads the file with the same scanner as the rest of the extension, so the
  Python, CSS/JS and markup steps of Format Document agree on where a tag, a comment or a
  block is.
- The command is now titled "PyJinHx: Format Document". Its id, `pyjinhx.formatSlots`,
  is unchanged, so keybindings keep working.
- A legacy `{# def … #}` header gets its blank line only when it is the first thing in the
  file, as in pyjinhx.
- A file with a block error (a second block, a stray `#}`, text after a closer, …) is not
  formatted, like the Python and CSS/JS steps.
- A block's opener and closer always stand on their own lines.
- One blank line between siblings is kept; the `>` of a tag written over several lines
  stays where it was; an element written as open tag, content, close tag is no longer
  joined into one line.

### Fixed
- A `<` that starts no tag (`a < b`), a `>` inside Jinja in a tag (`{% if a > b %}`), and
  Jinja strings holding `}}`, `>` or a quote in an attribute no longer stop the file from
  being formatted.
- A slotted tag with an apostrophe in another attribute is exploded; a single-quoted
  value, `#ref="a b"` and Jinja between attributes are kept as written instead of being
  split at their spaces.
- A `<script>` with `</script>` in a Jinja string is formatted; `</scripts>` no longer
  closes a `<script>`.
- An indented `{#python` comment is no longer moved to column 0, where it became a block.

## 0.10.0

### Added
- The formatter (Format Document, the command, format on save) now formats the body of
  a `{#css` or `{#js` block and of a `<style>` or `<script>` element with the editor's
  own CSS and JavaScript formatters, with the editor's indentation and its `css.format.*`
  and `javascript.format.*` settings. A block's body starts in column 0; an element's body
  stands one level inside its tag. A second run changes nothing.
- `pyjinhx.format.css` and `pyjinhx.format.js` (both default `true`).
- Left as they are, quietly (one line in the PyJinHx output): a body with Jinja in it, a
  `<script>` whose `type` is not JavaScript, `<style lang>`, a one-line body, a body that
  would be shifted and holds a multi-line template literal, and every body when the
  editor's CSS or TypeScript extension is off. In an untrusted workspace CSS is formatted
  and JS is not (the editor turns its TypeScript extension off there).

### Changed
- Formatting a `.pjx` whose CSS or JS bodies are not as the editor's formatters would
  write them now changes those bodies; set `pyjinhx.format.css` / `pyjinhx.format.js` to
  `false` to keep them. The built-in CSS formatter is not Prettier: set
  `css.format.newlineBetweenRules` to `false` and `css.format.spaceAroundSelectorSeparator`
  to `true` to keep a Prettier-style stylesheet as it is.

## 0.9.0

### Added
- The formatter (Format Document, the command, format on save) now sorts the imports of and
  formats the body of
  a `{#python` block with the project's `ruff format`, found as `<interpreter> -m ruff`
  and then as `ruff` on `PATH`, with the project's ruff configuration. The opener and
  the closing `#}` are not touched, CRLF files stay CRLF, and a second run changes
  nothing.
- `pyjinhx.format.python` (`ruff`, the default, or `off`).
- `pyjinhx.format.sortImports` (default `true`): the imports of the block are sorted
  with ruff's `I001` fix before formatting. If that step fails, the body is still
  formatted.
- The body is left exactly as it is when ruff is not installed, cannot parse it,
  takes more than 5 s, or would write a `#}` into it; the reason is one line in the
  PyJinHx output. When ruff is not found at all, one information message per session
  offers a **Turn off** button (it sets `pyjinhx.format.python` to `off` where the
  setting was resolved from: the workspace folder or workspace if it was set there,
  else the user settings). Other failures never show a notification. In an untrusted
  workspace ruff is not run.

### Changed
- Formatting a `.pjx` whose `{#python` body is not ruff-clean now changes that body.

### Fixed
- Output of the interpreter is decoded as one UTF-8 stream, so a non-ASCII character
  can no longer be damaged at a chunk boundary.

## 0.8.0

### Added
- Hover, go to definition, completion (with the server's detail and documentation on the
  selected item) and signature help inside `{#python` blocks, from the same private
  basedpyright server. They answer only on the block's body lines; everywhere else the
  existing component, HTML, CSS and JS providers answer as before.
- Go to definition on a sibling component that resolves to its generated `.pyi` stub opens
  the component's `.pjx` at the same position instead (stubs keep every line).
- Auto-import completions are not offered: their edit would land outside the block.

## 0.7.1

### Added
- Diagnostics inside `{#python` blocks, from the same private basedpyright server, shown
  with source `basedpyright` on the block's lines only. basedpyright, not pjx-ls, reads the
  project's `pyrightconfig.json`, `[tool.pyright]` or `[tool.basedpyright]`; with any of
  them the fallback setting is ignored, and a config without `typeCheckingMode` gets
  basedpyright's own, louder `recommended`, so set it there. Only a project with no such
  config gets `standard`.
  A diagnostic that overlaps one pyjinhx already reports on the same range is not shown
  twice, and a list computed for older text is never painted onto newer text.
- `pyjinhx.pythonBlock.diagnostics` (default on) and `pyjinhx.pythonBlock.typeCheckingMode`
  (`off`, `basic`, `standard`, `strict`, `recommended`, `all`; default `standard`, used only
  when the project configures nothing).
- "Unnecessary" hints (an unused parameter) fade the name as in a `.py` file and do not
  appear in the Problems panel.

## 0.7.0

### Added
- Names inside a `{#python` block are coloured by type (semantic tokens), as in a `.py`
  file: classes, properties, parameters, functions, enum members. They come from a private
  basedpyright 1.40.2 language server bundled in the extension (about 6 MB more), started
  the first time a `.pjx` with a block is open, with a 256 MB heap limit; expect about
  300 MB of memory while it runs. Sibling components resolve through their stubs, and
  changed `.py` and `.pyi` files recolour open blocks.
- `pyjinhx.pythonBlock.enabled` (default on; off stops the server) and
  `pyjinhx.pythonBlock.serverPath` (another basedpyright `langserver.index.js`).
- The status bar tooltip says when the block's server is off (untrusted workspace, or
  stopped after three crashes).

### Tests
- `npm run test:lsp` drives the bundled server over stdio. The editor tests now refuse to
  start on Linux unless `WAYLAND_DISPLAY` is unset and run Electron on X11.

## 0.6.0

### Added
- `pyjinhx.generateStubs` (default on): the stub of a single-file component is written
  automatically when the manifest reports `stub-missing` or `stub-stale`, on opening the
  folder and after a save. Documents found together are done in one `pyjinhx.stubgen` run.
  A failed run is logged once and not retried until the document is saved again. The quick
  fix stays for when the setting is off, and now covers `stub-stale` too.

## 0.5.2

### Tests
- A regression test pins that a `{#python` block is scoped like a plain `.py`, including the
  import lines right after the opener. No grammar change.

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
