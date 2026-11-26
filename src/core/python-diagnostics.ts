import type { Range } from "./manifest.ts";
import { inBody, type PythonView } from "./python-view.ts";
import type { ServerDiagnostic } from "./python-server.ts";

const before = (a: Range["end"], b: Range["start"]) => a.line < b.line || (a.line === b.line && a.character < b.character);

// Two ranges overlap when neither ends before the other starts; touching ends do not.
function overlaps(a: Range, b: Range): boolean {
  const zero = (r: Range) => r.start.line === r.end.line && r.start.character === r.end.character;
  // A zero-width range overlaps a range that contains its position, ends included.
  if (zero(a) || zero(b)) return !before(a.end, b.start) && !before(b.end, a.start);
  return before(a.start, b.end) && before(b.start, a.end);
}

/**
 * The server's diagnostics to show for a view: those that lie wholly on body lines and
 * that no manifest diagnostic already covers.
 */
export function blockDiagnostics(items: ServerDiagnostic[], view: PythonView, manifestRanges: Range[]): ServerDiagnostic[] {
  return items.filter(
    ({ range }) => inBody(view, range.start.line) && inBody(view, range.end.line) && !manifestRanges.some((m) => overlaps(range, m)),
  );
}
