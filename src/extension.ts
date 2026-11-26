import * as vscode from "vscode";
import { OUTPUT_CHANNEL_NAME } from "./config.ts";
import { registerFormatting } from "./vscode/formatting.ts";
import { Views } from "./vscode/virtual-documents.ts";
import { registerForwarding } from "./vscode/forwarding.ts";
import { registerTyping } from "./vscode/typing.ts";
import { registerDiagnostics } from "./vscode/diagnostics.ts";
import { Manifests } from "./vscode/manifest-service.ts";
import { registerPjxFeatures } from "./vscode/pjx-features.ts";
import { registerStatus } from "./vscode/status.ts";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  output.appendLine("PyJinHx extension activated.");
  context.subscriptions.push(output);
  registerFormatting(context);
  registerTyping(context);
  const views = new Views();
  views.register(context);
  registerForwarding(context, views);
  const manifests = new Manifests(output);
  context.subscriptions.push(
    manifests,
    vscode.commands.registerCommand("pyjinhx.refreshManifest", () => manifests.refresh()),
    vscode.commands.registerCommand("pyjinhx.showOutput", () => output.show()),
  );
  registerPjxFeatures(context, manifests, views);
  registerDiagnostics(context, manifests);
  registerStatus(context, manifests);
}

export function deactivate(): void {}
