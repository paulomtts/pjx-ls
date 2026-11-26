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
- Each answer is printed as a `SPIKE <label> <json>` line on the test output.
- Run it once with VS Code and once with `PJX_EDITOR_PATH=/usr/share/cursor/cursor`; the
  two may differ.

## Results

pending
