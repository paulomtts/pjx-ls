export const STUB_MISSING = "stub-missing";
export const STUB_STALE = "stub-stale";
export const GENERATE_STUB_COMMAND = "pyjinhx.generateStub";

/** The arguments of `python` that write the `.pyi` stubs of these documents. */
export const stubgenArgs = (...files: string[]) => ["-m", "pyjinhx.stubgen", ...files];

const isStubCode = (code: unknown) => code === STUB_MISSING || code === STUB_STALE;

/** The diagnostics a stub can fix: the manifest's own, by code. */
export const needsStub = (d: { code?: unknown; source?: string }) => d.source === "pyjinhx" && isStubCode(d.code);

/**
 * Which documents stubgen should be run for on its own. A document is left alone while
 * a run for it is in flight, and after a run that did not clear its diagnostic, until
 * it is saved again.
 */
export class AutoStubs {
  private readonly running = new Set<string>();
  private readonly tried = new Set<string>();

  /** The documents to run for now, given the manifest's diagnostics; they count as running. */
  next(diagnostics: { path: string; code?: unknown }[]): string[] {
    const wanted = new Set(diagnostics.filter((d) => isStubCode(d.code)).map((d) => d.path));
    // A document that no longer reports a stub is fixed: forget it.
    for (const path of this.tried) if (!wanted.has(path)) this.tried.delete(path);
    const files = [...wanted].filter((path) => !this.running.has(path) && !this.tried.has(path));
    files.forEach((path) => this.running.add(path));
    return files;
  }

  /** A run for these documents ended, however it ended. */
  finished(files: string[]): void {
    files.forEach((path) => (this.running.delete(path), this.tried.add(path)));
  }

  /** The document was saved: it may be tried again. */
  saved(path: string): void {
    this.tried.delete(path);
  }
}
