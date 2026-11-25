# M1 manual checklist (for the PR description)

Token colours cannot be asserted by a test, so check these by hand in Cursor before
release. Open `test/fixtures/grammar-samples/` files (`03-css-js.pjx`, `05-edge.pjx`)
and a `.py` file with a `template = """…"""` (`06-inline.py`).

Themes: Dark+, one light theme (for example Light+), and the maintainer's theme.

For each theme:

- [ ] `{#css` body: property names, values and selectors are coloured like a `.css` file.
- [ ] `{#js` body: keywords and strings are coloured like a `.js` file.
- [ ] `{#def` and `{#python` bodies are coloured like Python; prop names in `{#def`
      (`title:`) read as parameters.
- [ ] The `{#css` / `#}` markers read as a keyword, not as comment text.
- [ ] A prose comment (`{# css tweaks #}`, `{#cssx`) is a comment colour throughout.
- [ ] `{{ … }}` and `{% … %}` are Jinja-coloured, also inside attribute values, `<script>`
      and `<style>`; `{% raw %}` regions are plain.
- [ ] A component tag (`<Card/>`) has a different colour from `<div>`, and the colour
      comes from the theme (no extension override).
- [ ] A slot value (`footer="<b>ok</b>"`) shows HTML tags inside the string quotes.
- [ ] In the `.py` file, the template body is coloured as PyJinHx and the code around
      it as Python.

Editor behaviour (Cursor):

- [ ] Inside a `{#css` body, "Toggle Line Comment" writes `/* */`; in `{#js`, `//`;
      in `{#python` and `{#def`, `#`.
- [ ] With `"emmet.includeLanguages": {"pyjinhx": "html"}` set, `div.a` + Tab expands in markup (Emmet is off by default).
- [ ] Typing `{{`, `{%` auto-closes with ` }}`, ` %}`; typing `{#css` leaves no stray `}`.
- [ ] Folding: indented tags and `{% if %}` bodies fold by indentation; `{#css` ... `#}` folds as a block.
