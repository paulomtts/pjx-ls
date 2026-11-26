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
});
