import * as vscode from "vscode";
import { isComponentTemplate } from "./config.ts";
import { findPython, onPythonEnvironmentChange } from "./python-env.ts";
import { Debouncer } from "../core/debounce.ts";
import type { Cancel } from "../core/lsp-client.ts";
import { nodeServer, PythonServer } from "../core/python-server.ts";
import { pythonView, type PythonView } from "../core/python-view.ts";

/** A VS Code cancellation token as core's `Cancel`. */
export const cancelOf = (token: vscode.CancellationToken): Cancel => ({
  get cancelled() {
    return token.isCancellationRequested;
  },
  onCancel: (listener) => void token.onCancellationRequested(listener),
});

const setting = <T>(name: string, fallback: T) => vscode.workspace.getConfiguration("pyjinhx").get<T>(name, fallback);

/** The private Python server for `{#python` blocks, and the views of the open documents it is kept in step with. */
export class PythonBlocks implements vscode.Disposable {
  readonly server: PythonServer;
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private readonly subscriptions: vscode.Disposable[] = [this.changed];
  private readonly views = new Map<string, { version: number; view: PythonView | null }>();
  private readonly pendingFiles = new Map<string, 1 | 2 | 3>();
  private readonly files = new Debouncer(100, () => this.filesChanged());

  constructor(context: vscode.ExtensionContext, output: vscode.OutputChannel) {
    this.server = new PythonServer({
      start: () => {
        const script = setting("pythonBlock.serverPath", "") || context.asAbsolutePath("dist/basedpyright/langserver.index.js");
        // The extension host is Electron; this makes it run the server script as plain node.
        return nodeServer(script, { ...process.env, ELECTRON_RUN_AS_NODE: "1" });
      },
      folders: () => (vscode.workspace.workspaceFolders ?? []).map((f) => ({ uri: f.uri.toString(), name: f.name })),
      pythonPath: async (scopeUri) => {
        const folder = (scopeUri && vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(scopeUri))) || vscode.workspace.workspaceFolders?.[0];
        return folder && (await findPython(folder))?.python;
      },
      typeCheckingMode: () => "standard",
      log: (line) => output.appendLine(`[python block] ${line}`),
    });
    const watcher = vscode.workspace.createFileSystemWatcher("**/*.{py,pyi}");
    const fileChanged = (type: 1 | 2 | 3) => (uri: vscode.Uri) => {
      // A create followed by a change in one batch must still reach the server as a create.
      const key = uri.toString();
      this.pendingFiles.set(key, this.pendingFiles.get(key) === 1 && type === 2 ? 1 : type);
      this.files.schedule("files");
    };
    this.server.onDidChangeState(() => this.changed.fire());
    this.subscriptions.push(
      watcher,
      watcher.onDidCreate(fileChanged(1)),
      watcher.onDidChange(fileChanged(2)),
      watcher.onDidDelete(fileChanged(3)),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.views.delete(document.uri.toString());
        this.server.close(document.uri.toString());
      }),
      vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration("pyjinhx") && this.settingsChanged()),
      vscode.workspace.onDidGrantWorkspaceTrust(() => this.changed.fire()),
    );
    void onPythonEnvironmentChange(() => this.settingsChanged()).then((d) => d && this.subscriptions.push(d));
  }

  /** The Python view of a `.pjx` document, synced to the server; null when there is nothing to serve. */
  viewOf(document: vscode.TextDocument): PythonView | null {
    if (!isComponentTemplate(document) || this.offReason() !== undefined || !setting("pythonBlock.enabled", true)) return null;
    const uri = document.uri.toString();
    let entry = this.views.get(uri);
    if (entry?.version !== document.version) {
      entry = { version: document.version, view: pythonView(document.getText()) };
      this.views.set(uri, entry);
    }
    if (entry.view) this.server.sync(uri, entry.view.text);
    else this.server.close(uri);
    return entry.view;
  }

  /** Why the server will not run for the open documents, when that is not the user's own setting. */
  offReason(): string | undefined {
    if (!vscode.workspace.isTrusted) return "the workspace is not trusted";
    if (this.server.state === "off") return "the server stopped three times; reload the window to try again";
    return undefined;
  }

  private filesChanged(): void {
    this.server.filesChanged([...this.pendingFiles].map(([uri, type]) => ({ uri, type })));
    this.pendingFiles.clear();
    this.changed.fire();
  }

  private settingsChanged(): void {
    if (setting("pythonBlock.enabled", true)) this.server.configurationChanged();
    else this.server.stop();
    this.changed.fire();
  }

  dispose(): void {
    this.files.dispose();
    this.server.dispose();
    this.subscriptions.forEach((d) => d.dispose());
  }
}
