const OPEN_BLOCK = /\{#(?:css|js|python|def)\b/g;
const OPEN_ELEMENT = /<(script|style)\b[^>]*>/gi;

const lastMatch = (pattern: RegExp, text: string) => [...text.matchAll(pattern)].at(-1);

/** True when `text` ends inside a pjx block body or a `<script>`/`<style>` element. */
function endsInCode(text: string): boolean {
  const block = lastMatch(OPEN_BLOCK, text);
  if (block && !text.includes("#}", block.index)) return true;
  const element = lastMatch(OPEN_ELEMENT, text);
  return !!element && !new RegExp(`</${element[1]}`, "i").test(text.slice(element.index));
}

/**
 * After the user typed `#` at `offset` of `text`: the offset of the `}` to delete, or null.
 * Typing `{` auto-closes to `{}`, so `{#css` would otherwise leave a stray `}`. Only
 * markup counts: `{#` in CSS, JS or Python bodies is ordinary code.
 */
export function strayBraceAfterBlockOpener(text: string, offset: number): number | null {
  const typedInsideBraces = text[offset] === "#" && text[offset - 1] === "{" && text[offset + 1] === "}";
  return typedInsideBraces && !endsInCode(text.slice(0, offset - 1)) ? offset + 1 : null;
}
