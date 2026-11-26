import * as assert from "node:assert";
import * as vscode from "vscode";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// `|` in `marked` is where the cursor is; the rest is the document.
async function open(marked: string): Promise<{ doc: vscode.TextDocument; position: vscode.Position }> {
  const offset = marked.indexOf("|");
  const doc = await vscode.workspace.openTextDocument({ language: "pyjinhx", content: marked.replace("|", "") });
  return { doc, position: doc.positionAt(offset) };
}

function labels(list: vscode.CompletionList | undefined): string[] {
  return (list?.items ?? []).map((i) => (typeof i.label === "string" ? i.label : i.label.label));
}

async function complete(marked: string): Promise<string[]> {
  const { doc, position } = await open(marked);
  const list = await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", doc.uri, position);
  return labels(list);
}

// The language servers start lazily, so a positive test asks until the label shows up.
async function completes(marked: string, label: string): Promise<void> {
  let found: string[] = [];
  for (let attempt = 0; attempt < 20 && !found.includes(label); attempt++) {
    found = await complete(marked);
    if (!found.includes(label)) await wait(500);
  }
  assert.ok(found.includes(label), `${label} among ${found.length} items`);
}

// Applies the item the way the editor does: its range, or the word before the cursor.
async function apply(marked: string, label: string): Promise<string> {
  const { doc, position } = await open(marked);
  let item: vscode.CompletionItem | undefined;
  for (let attempt = 0; attempt < 20 && !item; attempt++) {
    const list = await vscode.commands.executeCommand<vscode.CompletionList>("vscode.executeCompletionItemProvider", doc.uri, position);
    item = list?.items.find((i) => (typeof i.label === "string" ? i.label : i.label.label) === label);
    if (!item) await wait(500);
  }
  assert.ok(item, `${label} offered`);
  const range = item.range instanceof vscode.Range ? item.range : (item.range?.replacing ?? doc.getWordRangeAtPosition(position)!);
  const text = typeof item.insertText === "string" ? item.insertText : (item.insertText?.value ?? label);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, range, text.replace(/\$\{?\d+(:[^}]*)?\}?/g, ""));
  await vscode.workspace.applyEdit(edit);
  return doc.getText();
}

suite("forwarding", () => {
  test("<di completes div", () => completes("<di|", "div"));
  test("colo in a {#css body completes color", () => completes("{#css\na { colo| }\n#}\n", "color"));
  test("document. in a {#js body lists getElementById", () => completes("{#js\ndocument.|\n#}\n", "getElementById"));
  test("colo in <style> completes color", () => completes("<style>\na { colo| }\n</style>\n", "color"));
  test("document. in <script> lists getElementById", () => completes("<script>\ndocument.|\n</script>\n", "getElementById"));

  test("nothing from the HTML service inside {#python or a Jinja comment", async () => {
    assert.ok(!(await complete("{#python\n<di|\n#}\n")).includes("div"));
    assert.ok(!(await complete("{# <di| #}\n")).includes("div"));
    assert.ok(!(await complete("<p>{{ <di| }}</p>\n")).includes("div"));
  });

  test("hover on a tag and on a css property", async () => {
    for (const [marked, text] of [
      ["<d|iv></div>\n", "div element"],
      ["{#css\n.a { col|or: red; }\n#}\n", "color"],
    ]) {
      const { doc, position } = await open(marked);
      let hover = "";
      for (let attempt = 0; attempt < 20 && !hover.includes(text); attempt++) {
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", doc.uri, position);
        hover = hovers.flatMap((h) => h.contents).map((c) => (typeof c === "string" ? c : c.value)).join("\n");
        if (!hover.includes(text)) await wait(500);
      }
      assert.ok(hover.includes(text), `${text} in hover`);
    }
  });

  test("document colors are found in a {#css body and mapped to the source", async () => {
    const { doc } = await open("{#css\n.a { color: #ff0000; }\n#}\n");
    let colors: vscode.ColorInformation[] = [];
    for (let attempt = 0; attempt < 20 && !colors.length; attempt++) {
      colors = await vscode.commands.executeCommand<vscode.ColorInformation[]>("vscode.executeDocumentColorProvider", doc.uri);
      if (!colors.length) await wait(500);
    }
    assert.strictEqual(colors.length, 1);
    assert.strictEqual(doc.getText(colors[0].range), "#ff0000");
  });

  test("a completion on a css opener line with markup keeps the markup", async () => {
    const text = await apply("<p>{#css\n.a { colo| }\n#}\n", "color");
    assert.ok(text.startsWith("<p>{#css\n.a { color"), text);
  });

  test("a completion on a closer line edits the source, not the tag", async () => {
    const text = await apply("{#js\ndocument.getElementB|#}\n", "getElementById");
    assert.ok(/^\{#js\ndocument\.getElementById#\}\n$/.test(text.replace(/\(.*\)/, "")), text);
  });

  test("a hover range is the source text the service meant (the declaration)", async () => {
    const { doc, position } = await open("{#css\n.a { col|or: red; }\n#}\n");
    let hovers: vscode.Hover[] = [];
    for (let attempt = 0; attempt < 20 && !hovers.length; attempt++) {
      hovers = await vscode.commands.executeCommand<vscode.Hover[]>("vscode.executeHoverProvider", doc.uri, position);
      if (!hovers.length) await wait(500);
    }
    assert.strictEqual(doc.getText(hovers[0].range), "color: red");
  });

  test("nothing from the HTML service inside a tag that holds an unclosed {{", async () => {
    const found = await complete("<div {{ at|");
    assert.ok(!found.includes("class") && !found.includes("id"), found.slice(0, 5).join());
  });

  test("CRLF documents are forwarded at the same positions", () => completes("{#css\r\na { colo| }\r\n#}\r\n", "color"));
});
