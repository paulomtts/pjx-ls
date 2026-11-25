Vendored TextMate grammars used only by `test/grammar/`.

From `microsoft/vscode`, tag `1.105.0` (MIT, Copyright (c) 2015 - present Microsoft
Corporation, https://github.com/microsoft/vscode/blob/1.105.0/LICENSE.txt):

- `html.tmLanguage.json`
- `css.tmLanguage.json`
- `JavaScript.tmLanguage.json`
- `MagicPython.tmLanguage.json`, `MagicRegExp.tmLanguage.json`

Re-fetch a grammar with
`curl -L https://raw.githubusercontent.com/microsoft/vscode/<tag>/extensions/<css|javascript|python>/syntaxes/<file>`
and bump the tag here for all of them together.

`jinja.json`, `jinja-html.json`: the Jinja extension grammars (MIT).
