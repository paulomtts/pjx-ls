Vendored TextMate grammars used only by `test/grammar/`.

- `html.tmLanguage.json`: VS Code's HTML grammar (MIT, microsoft/vscode).
- `jinja.json`, `jinja-html.json`: the Jinja extension grammars (MIT).

CSS, JavaScript and Python grammars are deliberately not vendored: unresolved
includes are ignored, so those regions tokenize as plain text in tests.
