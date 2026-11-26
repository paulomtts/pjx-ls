import { spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { LspClient, type Cancel } from "./lsp-client.ts";
import type { Range } from "./manifest.ts";

export interface ServerProcess {
  stdin: Writable;
  stdout: Readable;
  kill(): void;
  onExit(listener: (code: number | null) => void): void;
}

export interface ServerOptions {
  /** Starts the server: the real one, or a fake in tests. */
  start: () => ServerProcess;
  /** Workspace folders as file URIs. */
  folders: () => { uri: string; name: string }[];
  /** The interpreter for the folder that holds `scopeUri`, if one is known. */
  pythonPath: (scopeUri: string | undefined) => Promise<string | undefined>;
  /** The checking mode for a project that configures none. */
  typeCheckingMode: () => string;
  log: (line: string) => void;
  /** How long a server must stay up for its earlier crashes to be forgotten; default one minute. */
  stableMs?: number;
}

export interface Legend {
  tokenTypes: string[];
  tokenModifiers: string[];
}

/** One diagnostic as the server sent it. `severity` is LSP's: 1 error, 2 warning, 3 information, 4 hint. */
export interface ServerDiagnostic {
  range: Range;
  severity?: number;
  code?: string | number;
  message: string;
  tags?: number[];
  /** A link to the rule's documentation. */
  codeDescription?: { href: string };
}

type State = "idle" | "starting" | "ready" | "off";

interface Doc {
  text: string;
  version: number;
}

const MAX_CRASHES = 3;
const STABLE_MS = 60_000;
const SHUTDOWN_GRACE_MS = 2000;

/** The node arguments and script arguments that start the bundled server. */
export const serverArgs = (script: string) => ["--max-old-space-size=256", script, "--stdio"];

/** Runs the server script with the node that runs this code. */
export function nodeServer(script: string, env: NodeJS.ProcessEnv = process.env): ServerProcess {
  const child = spawn(process.execPath, serverArgs(script), { env, stdio: ["pipe", "pipe", "pipe"] });
  // Unread, a full stderr pipe would stall the server.
  child.stderr.resume();
  return {
    stdin: child.stdin,
    stdout: child.stdout,
    kill: () => void child.kill(),
    onExit: (listener) => {
      child.on("exit", (code) => listener(code));
      child.on("error", () => listener(null));
    },
  };
}

const SEMANTIC_TYPES = ["namespace", "type", "class", "enum", "interface", "struct", "typeParameter", "parameter", "variable", "property", "enumMember", "event", "function", "method", "macro", "keyword", "modifier", "comment", "string", "number", "regexp", "operator", "decorator"];
const SEMANTIC_MODIFIERS = ["declaration", "definition", "readonly", "static", "deprecated", "abstract", "async", "modification", "documentation", "defaultLibrary"];

const CLIENT_CAPABILITIES = {
  workspace: { configuration: true, workspaceFolders: true, didChangeWatchedFiles: { dynamicRegistration: false } },
  textDocument: {
    synchronization: {},
    publishDiagnostics: { versionSupport: true },
    hover: { contentFormat: ["markdown", "plaintext"] },
    completion: { completionItem: { snippetSupport: false, documentationFormat: ["markdown", "plaintext"], resolveSupport: { properties: ["documentation", "detail"] } } },
    signatureHelp: { signatureInformation: { documentationFormat: ["markdown", "plaintext"], parameterInformation: { labelOffsetSupport: true } } },
    definition: { linkSupport: true },
    semanticTokens: {
      requests: { full: true },
      tokenTypes: SEMANTIC_TYPES,
      tokenModifiers: SEMANTIC_MODIFIERS,
      formats: ["relative"],
      multilineTokenSupport: false,
      overlappingTokenSupport: false,
    },
  },
};

/**
 * One language server and the Python views open in it. The views are kept here, not in
 * the process, so a restarted server gets them all again.
 */
export class PythonServer {
  private options: ServerOptions;
  private current: State = "idle";
  private docs = new Map<string, Doc>();
  private published = new Map<string, { version: number; items: ServerDiagnostic[] }>();
  private proc: ServerProcess | undefined;
  private client: LspClient | undefined;
  private ready: Promise<boolean> = Promise.resolve(false);
  private legend: Legend | undefined;
  private crashes = 0;
  private killTimer: ReturnType<typeof setTimeout> | undefined;
  private stableTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private stateListeners: (() => void)[] = [];
  private diagnosticListeners: ((uri: string) => void)[] = [];

  constructor(options: ServerOptions) {
    this.options = options;
  }

  /** "off" after three crashes; then nothing is restarted until the extension reloads. */
  get state(): State {
    return this.current;
  }

  onDidChangeState(listener: () => void): void {
    this.stateListeners.push(listener);
  }

  onDiagnostics(listener: (uri: string) => void): void {
    this.diagnosticListeners.push(listener);
  }

  /** Opens the view, or replaces its text if it is open; starts the server if it is not running. */
  sync(uri: string, text: string): void {
    if (this.disposed || this.current === "off") return;
    const doc = this.docs.get(uri);
    if (doc?.text !== text) {
      this.docs.set(uri, { text, version: doc ? doc.version + 1 : 1 });
      // Until the server is ready, `open` sends whatever the views are by then.
      if (this.current === "ready") this.send(doc ? "didChange" : "didOpen", uri);
    }
    if (this.current === "idle") this.start();
  }

  close(uri: string): void {
    if (!this.docs.delete(uri)) return;
    this.published.delete(uri);
    if (this.current === "ready") this.client?.notify("textDocument/didClose", { textDocument: { uri } });
  }

  /** The version `sync` last gave the view. */
  versionOf(uri: string): number | undefined {
    return this.docs.get(uri)?.version;
  }

  /** The server's latest diagnostics for an open view, and the text version they are for. */
  diagnostics(uri: string): { version: number; items: ServerDiagnostic[] } | undefined {
    return this.published.get(uri);
  }

  /** Null when the server is not running or has no token support. */
  async semanticTokens(uri: string, cancel?: Cancel): Promise<{ data: number[]; legend: Legend } | null> {
    const client = this.client;
    if (!client || !(await this.ready) || !this.legend || !this.docs.has(uri)) return null;
    const legend = this.legend;
    try {
      const answer = await client.request<{ data: number[] } | null>("textDocument/semanticTokens/full", { textDocument: { uri } }, cancel);
      return answer && { data: answer.data, legend };
    } catch {
      return null;
    }
  }

  /**
   * A `.py` or `.pyi` changed on disk: the server does not watch files itself. `type` is
   * LSP's: 1 created, 2 changed, 3 deleted; the server drops its import cache only on 1.
   */
  filesChanged(changes: { uri: string; type: 1 | 2 | 3 }[]): void {
    if (this.current !== "ready" || changes.length === 0) return;
    this.client?.notify("workspace/didChangeWatchedFiles", { changes });
  }

  /** The interpreter or the settings changed: the server asks for its configuration again. */
  configurationChanged(): void {
    if (this.current === "ready") this.client?.notify("workspace/didChangeConfiguration", { settings: {} });
  }

  /** Ends the process and forgets every view; the next `sync` starts it again. */
  stop(): void {
    clearTimeout(this.stableTimer);
    const { proc, client } = this;
    this.proc = this.client = undefined;
    this.docs.clear();
    this.published.clear();
    this.ready = Promise.resolve(false);
    if (proc && client) {
      // Asked politely first; killed if it has not gone after the grace period.
      this.killTimer = setTimeout(() => proc.kill(), SHUTDOWN_GRACE_MS);
      this.killTimer.unref();
      client.request("shutdown", null).then(() => client.notify("exit", null), () => proc.kill());
    }
    this.setState("idle");
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private setState(state: State): void {
    if (state === this.current) return;
    this.current = state;
    this.stateListeners.forEach((listener) => listener());
  }

  private send(event: "didOpen" | "didChange", uri: string): void {
    const doc = this.docs.get(uri);
    if (!doc) return;
    const textDocument = { uri, version: doc.version };
    if (event === "didOpen") this.client?.notify("textDocument/didOpen", { textDocument: { ...textDocument, languageId: "python", text: doc.text } });
    else this.client?.notify("textDocument/didChange", { textDocument, contentChanges: [{ text: doc.text }] });
  }

  private start(): void {
    const proc = this.options.start();
    const client = new LspClient(proc.stdout, proc.stdin);
    this.proc = proc;
    this.client = client;
    this.legend = undefined;
    this.setState("starting");
    proc.onExit((code) => this.exited(proc, code));
    client.onError((error) => this.options.log(`handler failed: ${error}`));
    client.onRequest("workspace/configuration", (params) => this.configuration(params.items));
    client.onNotification("window/logMessage", (params) => this.options.log(String(params.message)));
    // A stopped or replaced process must not publish into the new one's state.
    client.onNotification("textDocument/publishDiagnostics", (params) => client === this.client && this.publish(params));
    this.ready = this.initialize(proc, client).catch(() => false);
  }

  private async initialize(proc: ServerProcess, client: LspClient): Promise<boolean> {
    const folders = this.options.folders();
    const result = await client.request<{ capabilities?: { semanticTokensProvider?: { legend: Legend } } }>("initialize", {
      processId: process.pid,
      rootUri: folders[0]?.uri ?? null,
      workspaceFolders: folders,
      capabilities: CLIENT_CAPABILITIES,
    });
    if (proc !== this.proc) return false;
    this.legend = result?.capabilities?.semanticTokensProvider?.legend;
    client.notify("initialized", {});
    // cursorpyright's build needed this nudge before it asked for configuration.
    client.notify("workspace/didChangeConfiguration", { settings: {} });
    // A restarted server starts every view over at version 1, and old diagnostics are void.
    this.published.clear();
    for (const doc of this.docs.values()) doc.version = 1;
    this.setState("ready");
    this.stableTimer = setTimeout(() => (this.crashes = 0), this.options.stableMs ?? STABLE_MS);
    this.stableTimer.unref();
    for (const uri of this.docs.keys()) this.send("didOpen", uri);
    return true;
  }

  // basedpyright asks for `python` and `basedpyright`; cursorpyright's build asks for the
  // `.analysis` section too, so both shapes are answered.
  private configuration(items: { section?: string; scopeUri?: string }[]): Promise<unknown[]> {
    const analysis = { diagnosticMode: "openFilesOnly", autoImportCompletions: false, typeCheckingMode: this.options.typeCheckingMode() };
    return Promise.all(
      items.map(async ({ section, scopeUri }) => {
        if (section === "python") {
          // An answer must have one entry per item, so a failure here is a null, not a rejection.
          const pythonPath = await this.options.pythonPath(scopeUri).catch(() => null);
          return pythonPath === null ? null : pythonPath === undefined ? {} : { pythonPath };
        }
        if (section === "basedpyright") return { analysis };
        if (section?.endsWith(".analysis")) return analysis;
        return {};
      }),
    );
  }

  private publish(params: { uri: string; version?: number; diagnostics: ServerDiagnostic[] }): void {
    const doc = this.docs.get(params.uri);
    if (!doc) return;
    this.published.set(params.uri, { version: params.version ?? doc.version, items: params.diagnostics });
    this.diagnosticListeners.forEach((listener) => listener(params.uri));
  }

  private exited(proc: ServerProcess, code: number | null): void {
    if (proc !== this.proc) {
      clearTimeout(this.killTimer);
      return;
    }
    this.options.log(`server exited with code ${code}`);
    clearTimeout(this.stableTimer);
    // A server that never started writes no end of stream; this rejects what waits on it.
    this.client?.close();
    this.proc = this.client = undefined;
    this.ready = Promise.resolve(false);
    this.published.clear();
    this.setState(++this.crashes >= MAX_CRASHES ? "off" : "idle");
  }
}
