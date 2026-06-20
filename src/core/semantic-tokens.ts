// Re-encode semantic tokens from the Python server's legend onto our own.
//
// We forward Pylance's semantic tokens for the `{# python #}` block (via a real
// mirror `.py` file). Pylance encodes its tokens against ITS legend; VS Code
// will decode ours against the legend WE register. So we translate by token-type
// NAME — preserving Pylance's classification (and therefore the theme's colors)
// exactly, rather than inventing any coloring of our own.

/** The legend we register our provider with — the standard VS Code set. */
export const SEMANTIC_TOKEN_TYPES: string[] = [
  "namespace", "class", "enum", "interface", "struct", "typeParameter", "type",
  "parameter", "variable", "property", "enumMember", "decorator", "event",
  "function", "method", "macro", "label", "comment", "string", "keyword",
  "number", "regexp", "operator",
];

export const SEMANTIC_TOKEN_MODIFIERS: string[] = [
  "declaration", "definition", "readonly", "static", "deprecated", "abstract",
  "async", "modification", "documentation", "defaultLibrary",
];

/**
 * Pylance/pyright emit a few non-standard type names; map them to the closest
 * standard type so they still get colored (e.g. `cls`/`self` → parameter).
 */
const TYPE_ALIASES: Record<string, string> = {
  selfParameter: "parameter",
  clsParameter: "parameter",
  magicFunction: "function",
  builtinConstant: "variable",
  module: "namespace",
};

export interface TokenLegend {
  tokenTypes: string[];
  tokenModifiers: string[];
}

/**
 * Translate LSP-encoded semantic-token `data` from the `from` legend to the `to`
 * legend. Token positions are preserved exactly (the mirror file is 1:1
 * line-mapped to the `.pjx`). A token whose type name has no equivalent in `to`
 * is dropped, so it keeps its TextMate grammar color rather than a wrong one.
 */
export function reencodeSemanticTokens(
  data: readonly number[],
  from: TokenLegend,
  to: TokenLegend,
): number[] {
  const toTypeIndex = new Map(to.tokenTypes.map((name, index) => [name, index]));
  const toModBit = new Map(to.tokenModifiers.map((name, index) => [name, index]));

  interface AbsToken {
    line: number;
    char: number;
    length: number;
    type: number;
    mods: number;
  }
  const tokens: AbsToken[] = [];

  let line = 0;
  let char = 0;
  for (let i = 0; i + 4 < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaChar = data[i + 1];
    const length = data[i + 2];
    const fromType = data[i + 3];
    const fromMods = data[i + 4];

    if (deltaLine > 0) {
      line += deltaLine;
      char = deltaChar;
    } else {
      char += deltaChar;
    }

    let typeName = from.tokenTypes[fromType];
    if (typeName !== undefined && !toTypeIndex.has(typeName)) {
      typeName = TYPE_ALIASES[typeName];
    }
    const newType = typeName !== undefined ? toTypeIndex.get(typeName) : undefined;
    if (newType === undefined) {
      continue; // unknown type → leave it to the grammar layer
    }

    let newMods = 0;
    for (let bit = 0; bit < from.tokenModifiers.length; bit += 1) {
      if ((fromMods & (1 << bit)) !== 0) {
        const toBit = toModBit.get(from.tokenModifiers[bit]);
        if (toBit !== undefined) {
          newMods |= 1 << toBit;
        }
      }
    }

    tokens.push({ line, char, length, type: newType, mods: newMods });
  }

  const out: number[] = [];
  let prevLine = 0;
  let prevChar = 0;
  for (const token of tokens) {
    const deltaLine = token.line - prevLine;
    const deltaChar = deltaLine === 0 ? token.char - prevChar : token.char;
    out.push(deltaLine, deltaChar, token.length, token.type, token.mods);
    prevLine = token.line;
    prevChar = token.char;
  }
  return out;
}
