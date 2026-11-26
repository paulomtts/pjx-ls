import { scan, type Range } from "./regions.ts";

const blank = (s: string) => s.replace(/[^\r\n]/g, " ");
const fill = (s: string) => s.replace(/[^\r\n]/g, "_");

/**
 * The document as plain HTML for the editor's HTML service: the same number of
 * lines, and every character that is kept sits at its own line and column.
 * Jinja, `{#def` and `{#python` are blanked. `{{ }}` inside `<script>` and
 * `<style>` becomes an identifier of the same length, so the script and the
 * stylesheet still parse. `{#css` and `{#js` blocks become `<style>` and
 * `<script>` elements; their tags may be longer than the `{#css` and `#}` they
 * replace, which is safe because nothing but blanks follows `{#css`, and what
 * follows `#}` is blanked.
 */
export function virtualHtml(text: string): string {
  const { regions, blocks, embedded } = scan(text);
  const chars = text.split("");
  const set = (range: Range, to: (s: string) => string) => {
    chars.splice(range.start, range.end - range.start, ...to(text.slice(range.start, range.end)).split(""));
  };
  if (text.startsWith("﻿")) chars[0] = " ";

  const inEmbedded = (offset: number) => embedded.some((e) => e.body.start <= offset && offset < e.body.end);
  for (const r of regions) {
    if (r.body) {
      set({ start: r.start, end: r.body.start }, blank);
      set({ start: r.body.end, end: r.end }, blank);
    } else set(r, r.kind === "expression" && inEmbedded(r.start) ? fill : blank);
  }

  // A block's body is code, not a comment, so it comes back as written.
  for (const b of blocks) if (b.keyword === "css" || b.keyword === "js") set(b.body, (s) => s);
  const lines = chars.join("").split("\n");

  for (const b of blocks) {
    if (b.keyword !== "css" && b.keyword !== "js") continue;
    const element = b.keyword === "css" ? "style" : "script";
    const open = b.openLine - 1;
    lines[open] = lines[open].slice(0, column(text, b.opener.start)) + `<${element}>` + (lines[open].endsWith("\r") ? "\r" : "");
    const close = b.closeLine - 1;
    const at = column(text, b.closer.start);
    lines[close] = lines[close].slice(0, at) + `</${element}>` + blank(lines[close].slice(at + 2));
  }
  return lines.join("\n");
}

const column = (text: string, offset: number) => offset - (offset === 0 ? 0 : text.lastIndexOf("\n", offset - 1) + 1);
