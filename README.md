# PyJinHx VSCode Extension

Syntax highlighting and template formatting for the [PyJinHx](https://github.com/paulomtts/pyjinhx) framework.

- **Highlighting:** PascalCase component tags, `{#def … #}` signature headers, `{{ … }}` interpolation, HTML-in-slot values (TextMate grammars in `syntaxes/`).
- **Formatting:** slot-value expansion + HTML/Jinja structural re-indentation for component templates under `**/components/**`.

For an architecture walkthrough, see `docs/codebase-guide.md` in the source
repository (not shipped in the packaged extension).

## Development

```bash
npm install
npm run check   # type-check
npm test        # unit tests (Node >= 23.6)
npm run build   # bundle to dist/extension.cjs
npm run package # produce a .vsix
```
