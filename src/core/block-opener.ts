const OPEN_BLOCK = /\{#(?:css|js|python|def)\b/;
const OPEN_ELEMENT = /<(script|style)\b[^>]*>/gi;

// Closed regions whose text is not markup: tag mentions inside them are not tags.
// Closed pjx blocks go too, so a block left in the text is an open one.
const NOT_MARKUP = new RegExp(
  [
    String.raw`<!--[\s\S]*?(?:-->|$)`,
    String.raw`\{#(?:css|js|python|def)\b[\s\S]*?#\}`,
    String.raw`\{#(?!(?:css|js|python|def)\b)[\s\S]*?(?:#\}|$)`,
    String.raw`\{%[-+]?\s*raw\s*-?%\}[\s\S]*?(?:\{%[-+]?\s*endraw\s*[-+]?%\}|$)`,
    String.raw`\{\{[\s\S]*?(?:\}\}|$)`,
    String.raw`\{%[\s\S]*?(?:%\}|$)`,
    String.raw`=\s*(?:"[^"]*"|'[^']*')`,
  ].join("|"),
  "g",
);

/** True when `source` ends inside a pjx block body or a `<script>`/`<style>` element. */
function endsInCode(source: string): boolean {
  const text = source.replace(NOT_MARKUP, "");
  if (OPEN_BLOCK.test(text)) return true;
  const element = [...text.matchAll(OPEN_ELEMENT)].at(-1);
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

export interface Keystroke {
  offset: number;
  text: string;
  rangeLength: number;
}

/** Remembers the last change to one document, so only an editor-inserted `{}` counts. */
export class BraceTracker {
  private last: Keystroke | null = null;

  /** Feed each single change with the document text after it; returns a `}` offset to delete, or null. */
  onChange(change: Keystroke, text: string): number | null {
    const previous = this.last;
    this.last = change;
    const typedHash = change.text === "#" && change.rangeLength === 0;
    const afterAutoClose = previous?.text === "{}" && previous.offset === change.offset - 1;
    return typedHash && afterAutoClose ? strayBraceAfterBlockOpener(text, change.offset) : null;
  }

  /** Any change this tracker cannot read (several cursors, a replace) forgets the last one. */
  reset(): void {
    this.last = null;
  }
}
