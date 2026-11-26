# M5 spike: which transport gives Python intelligence inside a `{#python` block?

Date: 2026-11-26. Roadmap: `docs/plans/2026-11-26-m1-m5.md`, M5 task 5. Plan that follows
from these notes: `docs/plans/2026-11-26-m5.md`.

The whole spike ran headless: a Node script spoke LSP over stdio to three servers. No
editor was started. What only a live editor can answer is listed under "Not measured".

## Answer

**A private basedpyright process, bundled with the extension, spoken to over stdio by a
small client in `src/core/`.** The Python view of the document is opened in the server's
memory under the `.pjx` file's own URI, so positions and locations need no translation.

Not plain Pyright: the open-source `pyright` server has **no semantic tokens** at all
(measured), and semantic tokens are the first thing M5b must deliver. basedpyright (MIT)
has them, and cursorpyright, the maintainer's Python server, is itself a basedpyright fork
(it logs `basedpyright language server 1.32.1`) with the same token legend.

## Setup

- Script: session scratchpad `m5-spike/spike.mjs` (not kept; the headless test of plan
  task 4 replaces it). A hand-written JSON-RPC client of about 60 lines: `initialize`,
  `workspace/configuration` answered with `python.pythonPath`, `didOpen`, then the requests.
- Servers: `basedpyright` 1.40.2 and `pyright` 1.1.414 from npm, and cursorpyright 1.0.13's
  own `dist/server.js` run with `node … --stdio` (to read what a `.py` file gets in the
  maintainer's Cursor, without starting Cursor).
- Project: pyjinhx at `617c67aa`, workspace root `/home/mtts/Code/libs/pyjinhx`, interpreter
  `.venv/bin/python` (Python 3.13.9, pyjinhx installed editable). For anything that writes
  (stubgen), a copy of `examples/` in the scratchpad with the same `[tool.pyright]` table.
- Documents: `examples/todo/components/total/total.pjx` (17 lines) and
  `item_list/item_list.pjx` (29 lines, imports the sibling component `ItemRow`).
- Python view: `scan()` from `src/core/regions.ts` finds the `python` block; every
  character outside `block.body` becomes a blank, line breaks stay. Same lines, same
  columns, as `virtual-html.ts` does for HTML.
- Machine: Node 26.13.1, Linux. Times are wall-clock milliseconds from request to response.

## Results

### 1. Semantic tokens

| Server | `semanticTokensProvider` | Tokens for `total.pjx` |
|---|---|---|
| pyright 1.1.414 | **none** | - |
| basedpyright 1.40.2 | `{full: true}` (no range, no delta) | 28, all inside the body |
| cursorpyright 1.0.13 (basedpyright 1.32.1) | `{full: true}` | 27, all inside the body |

Both basedpyright builds announce the same legend:

```
types:     namespace type class enum typeParameter parameter variable property enumMember
           function method keyword decorator selfParameter clsParameter
modifiers: declaration definition readonly static async defaultLibrary builtin classMember parameter
```

Tokens of `total.pjx` from the private basedpyright (line:column, 1-based lines):

```
 2:34 TodoAppContext  class              7:6  Total  class [declaration]
 3:31 Keys            enum               7:38 Keys   enum
 4:20 ReactiveComponent class            7:43 TODOS  enumMember
10:4  count           property [static,classMember]
10:11 int             class [defaultLibrary,builtin]
12:4  @  decorator    12:5 classmethod decorator
13:8  load            method [declaration,classMember]
13:13 cls             clsParameter [declaration,parameter]
13:18 ctx             parameter [declaration,parameter]
13:23 TodoAppContext  class
15:15 cls             clsParameter [parameter]
15:19 count           parameter [parameter]     (keyword argument)
15:25 ctx             parameter [parameter]
15:29 store           variable
```

plus `namespace` for each segment of the imported module paths.

Against cursorpyright on the same text, 3 tokens differ, none in the names the maintainer
asked about (`TodoAppContext` class, `Keys` enum, `TODOS` enumMember, `count` property are
identical):

| Token | basedpyright 1.40.2 | cursorpyright (1.32.1) | Colour in Default Dark Modern |
|---|---|---|---|
| `react` (class keyword) | `parameter` | no token | light blue / grammar colour |
| `count` in `cls(count=…)` | `parameter` | `variable` | both light blue |
| `store` in `ctx.store` | `variable` | `property` | both light blue |

So the block will be coloured like a `.py` file to within version drift of the same
server family.

### 2. Sibling components and stubs

`item_list.pjx` has `from examples.todo.components.item_row import ItemRow`; that package's
`__init__.py` imports from `item_row/item_row`, which is the `.pjx`.

| State | `ItemRow` | Diagnostics |
|---|---|---|
| no `item_row.pyi` | `(import) ItemRow: Unknown`, no definition, 43 tokens | `"ItemRow" is unknown import symbol` |
| after `python -m pyjinhx.stubgen examples/todo` | full class hover, token type `class`, 47 tokens | none from the import |

- **Stubs are required, and they are enough.** No virtual module mapping is needed. M5a
  (0.6.0, `pyjinhx.generateStubs`) writes them, so M5b can assume they exist.
- Relative imports (`from ..item_row.item_row import ItemRow`, `from ...keys import Keys`)
  resolve the same way.
- Go to definition on `ItemRow` answers `item_row/item_row.pyi:9`. The stub keeps every
  line (its line 9 is the `.pjx`'s line 9; first line is
  `# pyjinhx.stubgen: generated from item_row.pjx; do not edit`). A location in such a stub
  can be rewritten to the `.pjx` at the same position.
- **The server does not notice a stub rewritten on disk.** After the stub changed, hover
  was still the old text 2.5 s later; it was correct right after a
  `workspace/didChangeWatchedFiles` notification. The extension must send that
  notification for changed `.py` and `.pyi` files.

### 3. The document's URI

| Opened as | Tokens, hover, completion, imports | Own-document definition answers |
|---|---|---|
| `<dir>/item_list.py` (does not exist) | work | `item_list.py:14` (must be mapped back) |
| `<dir>/item_list.pjx`, `languageId: python` | identical | `item_list.pjx:14` (nothing to map) |
| a path outside the workspace | identical, imports still resolve | the outside path |

The `.pjx` URI is chosen: the answers are the same and no URI is ever translated. An
existing `item_list.pyi` beside the document does no harm in either form.

### 4. Other requests (private basedpyright, `item_list.pjx`, stubs present)

| Request | Result | First ms | Warm ms (median of 10) |
|---|---|---|---|
| hover `TodoAppContext` | `class TodoAppContext(store: Any)` plus docstring | 6 | 0.5 |
| definition `TodoAppContext` | `examples/todo/context.py:10` | 0.7 | 0.2 |
| definition `cls` | same document, line 14 | 0.2 | 0.1 |
| completion after a typed `Keys.` | 125 items, has `TODOS`, `TODO_LIST` | 18 | 2 |
| signature help after a typed `TodoAppContext(` | `(store: Any) -> TodoAppContext` | 2.4 | 0.3 |
| hover / definition `ItemRow` | class signature / the stub, line 9 | 108 / 12 | 0.2 / 4 |
| diagnostics | `21:24 "store" is not a known attribute of "None"` (pushed) | - | - |

Quirk, the same in cursorpyright: inside the class keyword `react={Keys.TODOS}`, hover says
`(function) TODOS: Unknown` and completion right after that dot is empty. Plain pyright
answers both. It is the server family's behaviour in a `.py` file too, so it is left alone.

### 5. Cost

| Measure | Value |
|---|---|
| Spawn to `initialize` answered | 127 to 158 ms |
| Spawn to first semantic tokens (pyjinhx project) | 1.0 to 1.6 s (0.89 to 1.4 s of it the first analysis) |
| Same, fixture with only stdlib imports and no interpreter | 0.35 s |
| Tokens after an edit (full-text `didChange`, 20 edits) | median 86 to 155 ms, max 243 ms; 6 ms in the stdlib fixture |
| RSS after `initialize` | 87 MB |
| RSS after first tokens | 270 MB |
| RSS after 20 edits and all probes, no heap limit | 526 to 591 MB |
| Same with `--max-old-space-size=256` | 379 MB, edits 111 to 118 ms |
| Same with `--max-old-space-size=192` | 289 MB, edits 125 ms |
| `--max-old-space-size=128` | the server died |
| pyright 1.1.414 for comparison (no tokens) | 277 MB |

The memory is the analysis of pydantic and pyjinhx, not the workspace: a 19-file copy costs
the same as the 613-file repository. The plan starts the server with
`--max-old-space-size=256`.

With no interpreter at all (`python.pythonPath` pointing nowhere) the server still answers
from its bundled typeshed and the workspace's own modules, so tests and CI need no Python.

### 6. Bundle or require?

| | Size | Notes |
|---|---|---|
| `basedpyright` npm package | 42 MB unpacked | MIT |
| What the server needs: `langserver.index.js`, `dist/pyright-langserver.js`, `dist/typeshed-fallback/` | 33 MB unpacked, **5.8 MB zipped** | no source maps, no CLI |
| The extension today | about 0.13 MB | |

Found while trying the bundled layout: pjx-ls's `package.json` has `"type": "module"`, so
the copied `langserver.index.js` fails with `__dirname is not defined` until a
`package.json` holding `{"type": "commonjs"}` sits beside it. With that file it starts.

Recommendation: bundle, pinned to an exact version, with a setting for another server.
Requiring an install would leave the feature off for most users (the maintainer's machine
has no `basedpyright` on `PATH` or in the project environment), and a pinned version makes
the token goldens deterministic.

### 7. Mapping the legend to the theme

- Neither `ms-python.python` 2025.6.1 nor cursorpyright contributes `semanticTokenScopes`,
  so nothing about Python's semantic colours is tied to the language id `python`. The same
  token type names under the language `pyjinhx` are coloured the same way.
- Default Dark Modern includes Dark+ and Dark (Visual Studio); the latter sets
  `semanticHighlighting: true`, and none of the three has a `semanticTokenColors` rule for
  these types. VS Code then colours a semantic token by its built-in fallback scope:
  `class`, `enum`, `namespace`, `type` to `entity.name.type…`/`entity.name.namespace`
  (`#4EC9B0`, teal); `variable`, `parameter`, `property` to `variable…` (`#9CDCFE`, light
  blue); `enumMember` to `variable.other.enummember` (`#4FC1FF`); `function`, `method`,
  `decorator` to `entity.name.function…` (`#DCDCAA`).
- The names stay white today because the block's text is under `meta.embedded`, which Dark
  (Visual Studio) colours `#D4D4D4`.
- `selfParameter` and `clsParameter` are not standard types. cursorpyright registers them
  with `superType: parameter`; where it is not installed they would be unknown. The plan
  renames both to `parameter`, which is the colour they resolve to anyway, and drops the
  non-standard modifiers (`builtin`, `classMember`, `parameter`), so the extension's legend
  holds standard names only.
- Merging with the grammar needs no work: a `DocumentSemanticTokensProvider` for the
  language `pyjinhx` returns tokens only where the view has text, which is the block's
  body. Everywhere else the TextMate grammar's colours stay.

### 8. Diagnostics for the block (added after the maintainer chose to show them)

Script `m5-spike/diag.mjs`: every `examples/todo` component opened as its Python view in
one basedpyright 1.40.2 session (`--max-old-space-size=256`), stubs present, six seconds
allowed for the pushes.

| Project configuration | Extension's answer for `typeCheckingMode` | Per component |
|---|---|---|
| `[tool.pyright] typeCheckingMode = "standard"` (pyjinhx's own) | none | **1** |
| none | none (basedpyright's default, `recommended`) | **5, 5, 10, 9, 5** |
| none | `standard` | **1** |
| `standard` | `strict` | 1: the project's file wins over the setting |

`app.pjx` has no block and gets nothing. The one diagnostic under `standard`, in all five
components:

```
clear_button.pjx 15:33-15:38  error  reportOptionalMemberAccess  "store" is not a known attribute of "None"
counter.pjx      15:33-15:38  error  reportOptionalMemberAccess  "store" is not a known attribute of "None"
item_list.pjx    21:24-21:29  error  reportOptionalMemberAccess  "store" is not a known attribute of "None"
item_row.pjx     26:19-26:24  error  reportOptionalMemberAccess  "store" is not a known attribute of "None"
total.pjx        15:29-15:34  error  reportOptionalMemberAccess  "store" is not a known attribute of "None"
```

- It is a real error in the example, not noise from the view: `load` takes
  `ctx: TodoAppContext | None = None` and reads `ctx.store` unchecked. cursorpyright's
  server reports the identical diagnostic for the same text, so a `.py` file with this
  body shows it too. Fixing the example (a guard, or a non-optional `ctx`) is a pyjinhx
  change, outside this plan.
- What `recommended` adds with no project configuration, all warnings:
  `reportImplicitOverride` on every `load`, `reportAny` on each use of the untyped
  `store` (3 to 6 per component), `reportUnknownMemberType` and
  `reportUnknownArgumentType` in `item_list.pjx`. That is the noise to avoid: the
  extension must name a mode when the project names none.
- Every diagnostic lay on a body line; none was reported on a blanked line, and none for
  any other file (`diagnosticMode: openFilesOnly`).
- Diagnostics are pushed (`textDocument/publishDiagnostics`); the server announces no
  `diagnosticProvider`, so there is nothing to pull.
- basedpyright 1.40.2 asks for the configuration sections `python` and `basedpyright`
  (the whole section, so the answer is `{analysis: {…}}`); cursorpyright's build asks for
  `python`, `cursorpyright.analysis` and `cursorpyright`.
- **cursorpyright's own default is `typeCheckingMode: "off"`**
  (`cursorpyright.analysis.typeCheckingMode` in its `package.json`), not `standard`. In a
  project with no Pyright configuration, a `.py` file in the maintainer's Cursor shows no
  type errors. The plan still falls back to `standard`, as the maintainer asked, and makes
  it a setting; see the plan's open decision 7.

## The alternative: a shadow `.py` file answered by the editor's own Python server

Idea: write the Python view to a real file in the extension's workspace storage, open it
with `vscode.workspace.openTextDocument`, and ask
`vscode.provideDocumentSemanticTokens` / `vscode.execute…Provider` for it. cursorpyright
serves `{scheme: file, language: python}`, so it would answer.

Measured (headless, cursorpyright's server, document opened under a path outside the
workspace): imports of the workspace's modules and of the stubs still resolve, tokens are
complete (46 of 46), 764 ms cold, 69 ms after an edit.

| | Shadow file + the editor's server | Private basedpyright (chosen) |
|---|---|---|
| Second server process | no | yes: 270 to 380 MB |
| Bundle size | 0 | +5.8 MB zipped |
| Colours equal to a `.py` | exactly, same server and settings | same family; 3 minor tokens differed across versions |
| Writes files | one per open `.pjx`, rewritten on every edit | nothing |
| Keeping it current | file write, then wait for the editor to reload the document; or edit the shadow and save it. Lag and dirty-document risk on every keystroke | `didChange` in memory |
| Problems panel | the Python server reports the shadow's own diagnostics under the shadow's path; the todo example would show one ghost entry per open component | nothing leaks |
| Own-document locations | point into the shadow, must be mapped back | already the `.pjx` |
| Works without a Python extension, or with one that has no semantic tokens | no | yes |
| Depends on | another extension's selector, start-up and multi-root rules | a pinned server |
| Tested headlessly | no, every step needs a live editor | yes, end to end |

The shadow file wins on memory and on exactness of colour. It loses on everything a user
would notice when it goes wrong: ghost diagnostics that cannot be suppressed without
changing the user's Python settings (ruled out in the roadmap), stale colours while the
file catches up, and silence for anyone without a matching Python extension. Decision D4
already accepts a private process. **Chosen: private basedpyright.**

Also looked at and rejected: starting cursorpyright's own `dist/server.js` as the private
server. It works over stdio (that is how the reference tokens above were taken), costs no
bundle size and matches a `.py` exactly. But it is another vendor's file under a
proprietary licence, at a path that changes with every update, and it exists only in
Cursor.

## Not measured (needs a live editor)

No editor was started for this spike. For the implementer, under `xvfb-run -a` with
`--ozone-platform=x11`, as the plan's testing section describes:

1. `ELECTRON_RUN_AS_NODE=1 <process.execPath> --max-old-space-size=256 dist/basedpyright/langserver.index.js --stdio`
   starts the server from inside the extension host (this is how language clients start
   Node servers; the spike used plain `node`).
2. In a `.pjx` with a block, "Developer: Inspect Editor Tokens and Scopes" on
   `TodoAppContext`, `count` and `TODOS` shows a semantic token type (`class`, `property`,
   `enumMember`) and the same foreground as the same name in `examples/todo/context.py`.
3. `vscode.commands.executeCommand("vscode.provideDocumentSemanticTokens", pjxUri)` returns
   the provider's tokens (this is what the editor test of plan task 6 asserts).
4. Outside the block, colours are unchanged while the provider is registered.
5. Typing in the block recolours without visible lag or flicker at about 100 ms per answer.
6. cursorpyright stays silent about the `.pjx` (it should: its selector is `python`).
