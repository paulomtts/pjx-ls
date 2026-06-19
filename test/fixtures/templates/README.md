# Progressive formatter fixtures

Purpose-built PyJinHx templates that exercise the formatter one feature at a time,
from simplest to most complex. Each `NN-name.pjx` here has a reviewed golden output
at `../expected/NN-name.pjx`. `test/core/goldens.test.ts` asserts every input
formats to its golden **and** that each golden is a fixed point (idempotent).

The inputs are intentionally written collapsed/minimal so the formatter has visible
work to do; the goldens show the result.

| # | Fixture | Exercises |
|---|---------|-----------|
| 01 | `plain-element` | Plain HTML nesting → 2-space indentation per level |
| 02 | `interpolation` | `{{ }}` in attributes and as an expr-only (inline) child |
| 03 | `def-header` | `{#def … #}` signature header kept on its own line |
| 04 | `component-tag` | A self-closing PascalCase component; plain string attr not expanded |
| 05 | `nesting-depth` | Four levels of nesting + a self-closing component |
| 06 | `jinja-for` | `{% for %}` block depth and body indentation |
| 07 | `jinja-if-elif-else` | `{% if/elif/else %}` mid-tag realignment |
| 08 | `nested-jinja` | `{% if %}` containing `{% for %}` — compounded depth |
| 09 | `slot-inline-expansion` | A single-line HTML slot value expanded across lines |
| 10 | `slot-nested-markup` | A slot value with multiple nested fragments |
| 11 | `quote-safety` | Single quotes + `{{ }}` inside double-quoted attrs survive intact |
| 12 | `realistic-component` | Capstone: def header + slots + components + nested Jinja |
| 13 | `known-limitation-inline-whitespace` | **Intentionally** demonstrates a preserved quirk |

## Notes on behavior

- **09 / 10 / 12** show slot-aware "exploded" formatting: a component tag with an
  HTML-valued (slot) attribute puts its name alone on the first line, every
  attribute one-per-line, the slot value recursively formatted, and the closing
  `>` / `/>` on its own line. Tags without a slot stay on one line.
- **10** note: `<PJXBadge>New</PJXBadge>` stays inline because its only child is
  text — the same inline rule applied everywhere (e.g. `<p>text</p>`).
- **13** shows the inline whitespace-loss quirk: `Hello {{ name }}, welcome` →
  `Hello{{ name }}, welcome` (inline children are concatenated without separators).

When the formatter's behavior is intentionally changed, delete the affected
golden(s), re-run `node scripts/gen-goldens.mjs`, review the new output, and commit
it as a visible behavior change.
