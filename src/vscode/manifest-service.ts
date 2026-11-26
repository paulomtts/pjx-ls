import * as path from "node:path";
import * as vscode from "vscode";
import { TEMPLATE_LANGUAGE_ID } from "../config.ts";
import { nodeSpawn } from "../core/manifest-runner.ts";
import { ManifestSession } from "../core/manifest-session.ts";
import type { Manifest } from "../core/manifest.ts";
import { findPython, onPythonEnvironmentChange } from "./python-env.ts";

const SOURCE_PATTERN = "**/*.{pjx,py,pyi}";
const SKIPPED = "**/{node_modules,.venv,venv,.git,__pycache__}/**";

/** The path of a file as the manifest writes it: absolute, with forward slashes. */
export const manifestPath = (uri: vscode.Uri) => uri.fsPath.replaceAll("\\", "/");
const isSource = (document: vscode.TextDocument) => document.uri.scheme === "file" && (document.languageId === TEMPLATE_LANGUAGE_ID || document.languageId === "python");

/** One manifest session per workspace folder, fed by saves, file changes and the active unsaved document. */
export class Manifests implements vscode.Disposable {
  private readonly sessions = new Map<string, ManifestSession>();
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private readonly subscriptions: vscode.Disposable[] = [this.changed];
  private readonly output: vscode.OutputChannel;

  constructor(output: vscode.OutputChannel) {
    this.output = output;
    const watcher = vscode.workspace.createFileSystemWatcher(SOURCE_PATTERN);
    const refreshFor = (uri: vscode.Uri) => this.sessionFor(uri)?.requestFull();
    this.subscriptions.push(
      watcher,
      watcher.onDidCreate(refreshFor),
      watcher.onDidDelete(refreshFor),
      watcher.onDidChange(refreshFor),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.sync()),
      vscode.workspace.onDidGrantWorkspaceTrust(() => void this.refresh()),
      vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration("pyjinhx") && void this.refresh()),
      vscode.workspace.onDidChangeTextDocument(({ document }) => this.edited(document)),
      vscode.workspace.onDidSaveTextDocument((document) => this.sessionFor(document.uri)?.settle(manifestPath(document.uri))),
      vscode.workspace.onDidCloseTextDocument((document) => this.sessionFor(document.uri)?.settle(manifestPath(document.uri))),
    );
    void onPythonEnvironmentChange(() => void this.refresh()).then((d) => d && this.subscriptions.push(d));
    this.sync();
  }

  private sync(): void {
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const [key, session] of this.sessions) {
      if (!folders.some((f) => f.uri.toString() === key)) (session.dispose(), this.sessions.delete(key));
    }
    for (const folder of folders) {
      if (!this.sessions.has(folder.uri.toString())) this.sessions.set(folder.uri.toString(), this.create(folder));
    }
  }

  private create(folder: vscode.WorkspaceFolder): ManifestSession {
    const settings = vscode.workspace.getConfiguration("pyjinhx", folder.uri);
    const absolute = (list: string[]) => list.map((p) => path.resolve(folder.uri.fsPath, p));
    const session = new ManifestSession({
      folder: manifestPath(folder.uri),
      spawn: nodeSpawn,
      python: () => findPython(folder),
      settings: () => ({ paths: absolute(settings.get<string[]>("manifest.paths", [])), sysPath: absolute(settings.get<string[]>("manifest.sysPath", [])) }),
      trusted: () => vscode.workspace.isTrusted,
      files: () => this.pjxFiles(folder),
      log: (line) => this.output.appendLine(`[${folder.name}] ${line}`),
      onChange: () => this.changed.fire(),
    });
    void session.refresh();
    return session;
  }

  private async pjxFiles(folder: vscode.WorkspaceFolder): Promise<{ path: string; text: string }[]> {
    const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*.pjx"), SKIPPED, 5000);
    const read = async (uri: vscode.Uri) => ({ path: manifestPath(uri), text: Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8") });
    return Promise.all(uris.map(read));
  }

  private edited(document: vscode.TextDocument): void {
    if (!isSource(document) || !document.isDirty || document !== vscode.window.activeTextEditor?.document) return;
    this.sessionFor(document.uri)?.requestBuffer(manifestPath(document.uri), () => document.getText());
  }

  private sessionFor(uri: vscode.Uri): ManifestSession | undefined {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    return folder && this.sessions.get(folder.uri.toString());
  }

  manifestFor(uri: vscode.Uri): Manifest | undefined {
    return this.sessionFor(uri)?.manifest;
  }

  /** Why the folder of `uri` is in limited mode, or undefined when pyjinhx answers for it. */
  limitedReason(uri: vscode.Uri): string | undefined {
    const mode = this.sessionFor(uri)?.mode;
    return mode?.kind === "limited" ? mode.reason : undefined;
  }

  /** Runs the full manifest of every folder now. */
  async refresh(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((s) => s.refresh()));
  }

  dispose(): void {
    this.sessions.forEach((s) => s.dispose());
    this.subscriptions.forEach((d) => d.dispose());
  }
}
