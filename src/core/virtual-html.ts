import { scan, type Range } from "./regions.ts";

const blank = (s: string) => s.replace(/[^\r\n]/g, " ");
// An expression is one identifier, however many lines it spans.
const identifier = (s: string) => {
  const [first, ...rest] = s.split("\n");
  return [first.replace(/[^\r\n]/g, "_"), ...rest.map(blank)].join("\n");
};

// The end of the line `from` is on, before its CR.
function lineEnd(text: string, from: number): number {
  const lf = text.indexOf("\n", from);
  if (lf === -1) return text.length;
  return text[lf - 1] === "\r" && lf - 1 >= from ? lf - 1 : lf;
}

/**
 * The document as plain HTML for the editor's HTML service. It has the same
 * number of lines, and every character it keeps sits at its own line and column.
 * Jinja, `{#def` and `{#python` are blanked, and so is an unclosed `{#python` to
 * the end. `{{ }}` inside `<script>` and `<style>` becomes an identifier, so the
 * script and the stylesheet still parse. `{#css` and `{#js` blocks become
 * `<style>` and `<script>` elements. Their tags are longer than the `{#css` and
 * `#}` they replace, which moves nothing: only blanks follow `{#css` on its line,
 * and the rest of the line after `#}` is blanked.
 */
export function virtualHtml(text: string): string {
  const { regions, blocks, embedded, unclosedPython } = scan(text);
  const limit = unclosedPython?.start ?? text.length;
  const elements = new Map(blocks.filter((b) => b.keyword === "css" || b.keyword === "js").map((b) => [b.opener.start, b]));
  const out: string[] = [];
  let position = 0;
  let blankUntil = 0;
  let next = 0;

  const skip = (to: number) => (position = to);
  const keep = (end: number) => {
    const cut = Math.min(Math.max(position, blankUntil), end);
    out.push(blank(text.slice(position, cut)), text.slice(cut, end));
    skip(end);
  };
  const replace = (range: Range, by: string) => {
    keep(range.start);
    out.push(by);
    skip(range.end);
  };
  const inEmbedded = (offset: number) => {
    while (next < embedded.length && embedded[next].body.end <= offset) next++;
    return next < embedded.length && embedded[next].body.start <= offset;
  };

  if (text.startsWith("﻿")) {
    out.push(" ");
    skip(1);
  }
  for (const r of regions) {
    if (r.start >= limit) break;
    const block = elements.get(r.start);
    const slice = text.slice(r.start, r.end);
    if (block) {
      const element = block.keyword === "css" ? "style" : "script";
      replace({ start: r.start, end: lineEnd(text, r.start) }, `<${element}>`);
      replace(block.closer, `</${element}>`);
      blankUntil = lineEnd(text, block.closer.end);
    } else if (r.body) {
      replace({ start: r.start, end: r.body.start }, blank(text.slice(r.start, r.body.start)));
      replace({ start: r.body.end, end: r.end }, blank(text.slice(r.body.end, r.end)));
    } else {
      replace(r, r.kind === "expression" && inEmbedded(r.start) ? identifier(slice) : blank(slice));
    }
  }
  keep(limit);
  out.push(blank(text.slice(limit)));
  return out.join("");
}
