import type { Range } from "./manifest.ts";

// stubgen puts this comment on the block's opener line, which is any line of the stub.
export const STUB_MARKER = /^# pyjinhx\.stubgen: generated from (.+\.pjx); do not edit/m;

/** A location in a stub that stubgen wrote is the same position in its .pjx: stubs keep every line. */
export function toSource(
  location: { uri: string; range: Range },
  textOf: (uri: string) => string | undefined,
): { uri: string; range: Range } {
  if (!location.uri.endsWith(".pyi")) return location;
  const name = STUB_MARKER.exec(textOf(location.uri) ?? "")?.[1];
  if (!name) return location;
  return { ...location, uri: location.uri.slice(0, location.uri.lastIndexOf("/") + 1) + encodeURIComponent(name) };
}
