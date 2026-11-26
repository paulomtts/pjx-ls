# M2 spike: does the editor's HTML service answer for a virtual document?

Plan: `docs/plans/2026-11-26-m1-m5.md`, M2 task 2.

Forwarding (M2 task 6) only works if the built-in HTML service answers requests made
through `vscode.execute...Provider` for a `pjx-embedded:` document. This spike tests that
before any forwarding code is written.

## Questions

1. Does the HTML service answer completion and hover for a `pjx-embedded:/view.html`
   document served by a `TextDocumentContentProvider`?
2. Do its embedded CSS and JS modes answer inside `<style>` and `<script>` there?
3. Does anything answer for a `pjx-embedded:/view.js` document? Expected: no, because the
   TypeScript service does not serve custom schemes.
4. Does `vscode.languages.getDiagnostics` return diagnostics for the view?

If 1 or 2 fail, stop and re-plan: the fallback is to bundle `vscode-html-languageservice`
and `vscode-css-languageservice`.

## Test design

`test/editor/suite/spike.test.ts`, run by `npm run test:editor`. One in-memory document
registered under the scheme `pjx-embedded`, opened as `/view.html` and `/view.js`:

```html
<!doctype html>
<div cl></div>            line 1: attribute completion after "cl", hover on "div"
<style>
  a { colo: red; }        line 3: property completion after "colo"
  b { color: red; }       line 4: hover on "color"
</style>
<script>
  document.               line 7: member completion
  document.getElementById('x');   line 8: hover on getElementById
  var n = ;               line 9: syntax error, for question 4
</script>
```

- Servers start lazily, so each request is retried up to 20 times, 500 ms apart.
- Tests a and b assert (`class` completes, `color` completes, `getElementById` completes,
  every hover is non-empty). Tests c and d only log, so one run always yields all four
  answers.
- Tests a2 and d2 repeat a and d on a document that is opened but never shown, because
  the real forwarding provider will work on documents nobody looks at.
- `PJX_SKIP_SPIKE=1` skips the suite, so CI can drop it once these notes hold the results.
- Each answer is printed as a `SPIKE <label> <json>` line on the test output.
- Run it once with VS Code and once with `PJX_EDITOR_PATH=/usr/share/cursor/cursor`; the
  two may differ.

## Risks

- The suite never opens a plain `.html` file. Opening one starts the HTML language
  server, which has pulled the hidden test workspace into the developer's view twice. Only
  `pjx-embedded:` documents and `.pjx` files are opened.
- A `pjx-embedded:` document with language id `html` may start that server as well. The
  run should note whether it does (does a window appear, is the server's output channel
  created); if it does, forwarding opens a window-visible side effect to avoid or accept.

## Results

Run in Cursor (electron 42, via the generated `pjxtest` launcher on the hidden workspace;
`PJX_EDITOR_PATH=/usr/share/cursor/cursor npm run test:editor`, 7 passing). A first attempt
was killed by the watchdog after tests a, a2 and b because an unrelated workspace switch
happened (1 to 12); the second run completed with no watchdog kill. Downloaded VS Code
was not run: it cannot take the `pjxtest` app id.

| Q | Answer | Evidence |
|---|---|---|
| a | yes | `SPIKE a.languageId "html"`, `a.completion {"count":151,...}` (has `class`), `a.hover "The div element has no special meaning at all..."` |
| a2 | yes, hidden document too | `a2.completion {"count":151,"hasClass":true}`, `a2.hover "The div element has no special meaning at all..."` |
| b | yes | `b.css.completion {"count":889,"hasColor":true}`, `b.css.hover "Sets the color of an element's text..."`, `b.js.completion {"count":273,"hasGetElementById":true}`, `b.js.hover "```typescript\nany\n```"` |
| c | no language service | the `.js` document answers only word-based completions of its own text: `c.completion {"first":["a","b","cl","colo","color","div","doctype","document","getElementById",...]}` (identical on retry; those are the words of the document) |
| d | yes, for a shown document | `d.diagnostics [{"line":3,"source":"css","message":"Unknown property: 'colo'"},{"line":9,"source":"javascript","message":"Expression expected."}]` |
| d2 | none for a hidden document | `d2.diagnostics []` after 10 s |

The JS hover is the type `any`: the HTML service's embedded JS mode has DOM typings but
no project context, as the plan expected.

## Decision

GO for forwarding (tasks 5 and 6): the HTML service, with embedded CSS and JS, answers
through `vscode.execute...Provider` for a `pjx-embedded:` `.html` document, shown or not.
No window or workspace change was seen from the virtual `.html` document (the watchdog
saw no off-workspace window), so it is not known to start a visible side effect.

Task 7 (diagnostics from the view) is NOT reliable: diagnostics exist only while the
view is shown in an editor, and forwarding works on documents nobody shows (d2). It is
not built; the idea needs a different design (own `vscode-css-languageservice`).
