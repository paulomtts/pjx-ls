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

const wasm = readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm")).buffer;
const onigLib = oniguruma.loadWASM(wasm).then(() => ({
  createOnigScanner: (patterns: string[]) => new oniguruma.OnigScanner(patterns),
  createOnigString: (text: string) => new oniguruma.OnigString(text),
}));

/**
 * The extension's own grammars plus HTML, and optionally the vendored Jinja
 * grammars: users without a Jinja extension get the first set only.
 */
function makeRegistry(withJinja: boolean): vsctm.Registry {
  const paths = new Map<string, string>([["text.html.basic", vendored("html.tmLanguage.json")]]);
  if (withJinja) {
    paths.set("text.html.jinja", vendored("jinja-html.json"));
    paths.set("source.jinja", vendored("jinja.json"));
  }
  for (const grammar of pkg.contributes.grammars) {
    paths.set(grammar.scopeName, `${root}${grammar.path}`);
  }
  return new vsctm.Registry({
    onigLib,
    loadGrammar: async (scope) => {
      const path = paths.get(scope);
      return path ? vsctm.parseRawGrammar(readFileSync(path, "utf8"), path) : null;
    },
    getInjections: (scope) => injections.get(scope),
  });
}

const registries = { jinja: makeRegistry(true), plain: makeRegistry(false) };
export type GrammarMode = keyof typeof registries;
export const GRAMMAR_MODES = Object.keys(registries) as GrammarMode[];

export interface ScopedToken {
  text: string;
  scopes: string[];
}

/** Tokenize a whole `.pjx` document with the real pyjinhx grammar stack. */
export async function tokenizePjx(source: string, mode: GrammarMode = "jinja"): Promise<ScopedToken[]> {
  const grammar = await registries[mode].loadGrammar("text.pyjinhx");
  if (!grammar) throw new Error("text.pyjinhx grammar failed to load");
  let stack = vsctm.INITIAL;
  const tokens: ScopedToken[] = [];
  for (const line of source.split("\n")) {
    const result = grammar.tokenizeLine(line, stack);
    stack = result.ruleStack;
    for (const token of result.tokens) {
      tokens.push({ text: line.slice(token.startIndex, token.endIndex), scopes: token.scopes });
    }
  }
  return tokens;
}

export const scopesOf = (tokens: ScopedToken[], text: string): string[] =>
  tokens.find((token) => token.text === text)?.scopes ?? [];
