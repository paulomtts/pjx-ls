import * as vscode from "vscode";
import { OUTPUT_CHANNEL_NAME } from "./config.ts";
import { registerFormatting } from "./vscode/formatting.ts";
import { Views } from "./vscode/virtual-documents.ts";
import { registerForwarding } from "./vscode/forwarding.ts";
import { registerTyping } from "./vscode/typing.ts";
import { registerDiagnostics } from "./vscode/diagnostics.ts";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  output.appendLine("PyJinHx extension activated.");
  context.subscriptions.push(output);
  registerFormatting(context);
  registerDiagnostics(context, output);
  registerTyping(context);
  const views = new Views();
  views.register(context);
  registerForwarding(context, views);
}

export function deactivate(): void {}
