import type { ScopedToken } from "./tokenize.ts";

export interface Block {
  keyword: string;
  open_line: number;
  close_line: number | null;
}

const BLOCK_SCOPE = /^meta\.block\.(\w+)\.pyjinhx$/;

/** The pjx blocks a tokenized document holds, read from scopes alone. */
export function blocksOf(tokens: ScopedToken[]): Block[] {
  const blocks: Block[] = [];
  let open: Block | null = null;
  for (const { line, scopes } of tokens) {
    const keyword = scopes.map((scope) => BLOCK_SCOPE.exec(scope)?.[1]).find(Boolean);
    if (keyword && scopes.includes("keyword.control.pyjinhx")) {
      open = { keyword, open_line: line, close_line: null };
      blocks.push(open);
    } else if (open && scopes.includes("punctuation.definition.block.end.pyjinhx")) {
      open.close_line = line;
      open = null;
    }
  }
  return blocks;
}
