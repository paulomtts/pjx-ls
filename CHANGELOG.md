# Changelog

All notable changes to the **PyJinHx** extension are documented here. This project
adheres to [Semantic Versioning](https://semver.org/).

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
