import * as assert from "node:assert";
import * as vscode from "vscode";

// M2 spike: does the built-in HTML service answer for a custom-scheme virtual document?
// Findings are written up in docs/plans/notes-m2-spike.md. Tests a and b assert what
// M2 depends on; c and d only record what the editor answered (see the SPIKE lines).

const HTML = [
  "<!doctype html>",
  "<div cl></div>", // 1
  "<style>", // 2
  "  a { colo: red; }", // 3
  "  b { color: red; }", // 4
  "</style>",
  "<script>", // 6
  "  document.", // 7
  "  document.getElementById('x');", // 8
  "  var n = ;", // 9
  "</script>",
  "",
].join("\n");

const provider: vscode.TextDocumentContentProvider = {
  provideTextDocumentContent: () => HTML,
};

function log(label: string, value: unknown): void {
  console.log(`SPIKE ${label} ${JSON.stringify(value)}`);
}

function labels(list: vscode.CompletionList | undefined): string[] {
  return (list?.items ?? []).map((i) => (typeof i.label === "string" ? i.label : i.label.label));
}

function hoverText(hovers: vscode.Hover[]): string {
  return hovers
    .flatMap((h) => h.contents)
    .map((c) => (typeof c === "string" ? c : c.value))
    .join("\n");
}

async function open(path: string): Promise<vscode.TextDocument> {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(`pjx-embedded:${path}`));
  await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
  return doc;
}

async function complete(uri: vscode.Uri, line: number, character: number): Promise<string[]> {
  // The language servers start lazily; give the first request a few tries.
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = await vscode.commands.executeCommand<vscode.CompletionList>(
      "vscode.executeCompletionItemProvider",
      uri,
      new vscode.Position(line, character),
    );
    if (labels(list).length) return labels(list);
    await new Promise((r) => setTimeout(r, 500));
  }
  return [];
}

async function hover(uri: vscode.Uri, line: number, character: number): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      "vscode.executeHoverProvider",
      uri,
      new vscode.Position(line, character),
    );
    if (hovers?.length) return hoverText(hovers);
    await new Promise((r) => setTimeout(r, 500));
  }
  return "";
}

suite("spike: pjx-embedded virtual documents", () => {
  let registration: vscode.Disposable;

  suiteSetup(() => {
    registration = vscode.workspace.registerTextDocumentContentProvider("pjx-embedded", provider);
  });
  suiteTeardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    registration.dispose();
  });

  test("a: html completion and hover on a .html virtual document", async () => {
    const doc = await open("/view.html");
    log("a.languageId", doc.languageId);
    const completions = await complete(doc.uri, 1, 7);
    log("a.completion", { count: completions.length, sample: completions.slice(0, 8) });
    const tagHover = await hover(doc.uri, 1, 2);
    log("a.hover", tagHover.slice(0, 120));
    assert.ok(completions.includes("class"), "attribute completion");
    assert.ok(tagHover.length > 0, "tag hover");
  });

  test("b: css and js modes answer inside <style> and <script>", async () => {
    const doc = await open("/view.html");
    const css = await complete(doc.uri, 3, 8);
    log("b.css.completion", { count: css.length, hasColor: css.includes("color") });
    const cssHover = await hover(doc.uri, 4, 6);
    log("b.css.hover", cssHover.slice(0, 120));
    const js = await complete(doc.uri, 7, 11);
    log("b.js.completion", { count: js.length, hasGetElementById: js.includes("getElementById") });
    const jsHover = await hover(doc.uri, 8, 14);
    log("b.js.hover", jsHover.slice(0, 160));
    assert.ok(css.includes("color"), "css completion");
    assert.ok(cssHover.length > 0, "css hover");
    assert.ok(js.includes("getElementById"), "js completion");
    assert.ok(jsHover.length > 0, "js hover");
  });

  test("c: what answers for a .js virtual document (expected: nothing)", async () => {
    const doc = await open("/view.js");
    log("c.languageId", doc.languageId);
    const list = await vscode.commands.executeCommand<vscode.CompletionList>(
      "vscode.executeCompletionItemProvider",
      doc.uri,
      new vscode.Position(7, 11),
    );
    await new Promise((r) => setTimeout(r, 3000));
    const retry = await vscode.commands.executeCommand<vscode.CompletionList>(
      "vscode.executeCompletionItemProvider",
      doc.uri,
      new vscode.Position(7, 11),
    );
    log("c.completion", { first: labels(list).length, retry: labels(retry).length });
  });

  test("d: which diagnostics the view gets", async () => {
    const doc = await open("/view.html");
    let diagnostics = vscode.languages.getDiagnostics(doc.uri);
    for (let attempt = 0; attempt < 20 && !diagnostics.length; attempt++) {
      await new Promise((r) => setTimeout(r, 500));
      diagnostics = vscode.languages.getDiagnostics(doc.uri);
    }
    log(
      "d.diagnostics",
      diagnostics.map((d) => ({ line: d.range.start.line, source: d.source, message: d.message })),
    );
  });
});
