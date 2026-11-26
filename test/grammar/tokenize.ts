import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vsctm from "vscode-textmate";
import oniguruma from "vscode-oniguruma";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../..", import.meta.url));
const vendored = (file: string) => `${root}test/fixtures/grammars/${file}`;

const pkg = JSON.parse(readFileSync(`${root}package.json`, "utf8"));
const injections = new Map<string, string[]>();
for (const grammar of pkg.contributes.grammars) {
  for (const target of grammar.injectTo ?? []) {
    injections.set(target, [...(injections.get(target) ?? []), grammar.scopeName]);
  }
}

const paths = new Map<string, string>([
  ["text.html.basic", vendored("html.tmLanguage.json")],
  ["source.css", vendored("css.tmLanguage.json")],
  ["source.js", vendored("JavaScript.tmLanguage.json")],
  ["source.python", vendored("MagicPython.tmLanguage.json")],
  ["source.regexp.python", vendored("MagicRegExp.tmLanguage.json")],
]);
for (const grammar of pkg.contributes.grammars) {
  paths.set(grammar.scopeName, `${root}${grammar.path}`);
}

const wasm = readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm")).buffer;
const onigLib = oniguruma.loadWASM(wasm).then(() => ({
  createOnigScanner: (patterns: string[]) => new oniguruma.OnigScanner(patterns),
  createOnigString: (text: string) => new oniguruma.OnigString(text),
}));

/** The extension's own grammars plus the vendored HTML, CSS, JavaScript and Python grammars. */
const registry = new vsctm.Registry({
  onigLib,
  loadGrammar: async (scope) => {
    const path = paths.get(scope);
    return path ? vsctm.parseRawGrammar(readFileSync(path, "utf8"), path) : null;
  },
  getInjections: (scope) => injections.get(scope),
});

export type RootScope = "text.pyjinhx" | "source.python";

export interface ScopedToken {
  /** 1-based line of the token. */
  line: number;
  text: string;
  scopes: string[];
}

/** Tokenize a whole document (a `.pjx` file by default) with the real grammar stack. */
export async function tokenizePjx(source: string, rootScope: RootScope = "text.pyjinhx"): Promise<ScopedToken[]> {
  const grammar = await registry.loadGrammar(rootScope);
  if (!grammar) throw new Error(`${rootScope} grammar failed to load`);
  let stack = vsctm.INITIAL;
  const tokens: ScopedToken[] = [];
  for (const [index, line] of source.split("\n").entries()) {
    const result = grammar.tokenizeLine(line, stack);
    stack = result.ruleStack;
    for (const token of result.tokens) {
      tokens.push({ line: index + 1, text: line.slice(token.startIndex, token.endIndex), scopes: token.scopes });
    }
  }
  return tokens;
}

export const scopesOf = (tokens: ScopedToken[], text: string): string[] =>
  tokens.find((token) => token.text === text)?.scopes ?? [];
