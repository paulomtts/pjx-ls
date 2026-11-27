import { scan } from "./regions.ts";

/** Formats a Python module whose lines end in `\n`; null means "leave it as it is". */
export type FormatBody = (body: string) => Promise<string | null>;

/**
 * `text` with the body of its `{#python` block replaced by what `format` answers.
 * Returns `text` itself when there is no sound block with a body, when `format`
 * declines or throws, or when the answer could not be put back safely.
 */
export async function formatPythonBlock(text: string, format: FormatBody, log: (line: string) => void = () => {}): Promise<string> {
  const s = scan(text);
  const block = s.blocks.find((b) => b.keyword === "python");
  if (s.error || !block || block.bodyLines === null) return text;
  const crlf = text.includes("\r\n");
  if (crlf && /(?<!\r)\n/.test(text)) return text;
  const body = text.slice(block.body.start, block.body.end);
  if (body.trim() === "") return text;

  const sent = body.replaceAll("\r\n", "\n");
  let answer: string | null;
  try {
    answer = await format(sent);
  } catch (error) {
    log(`formatting the {#python body failed: ${error instanceof Error ? error.message : error}`);
    return text;
  }
  if (answer === null) return text;
  let out = answer.replaceAll("\r\n", "\n");
  if (out === sent || out.trim() === "") return text;
  // `#}` inside the body would close the block early, so such an answer is not used.
  if (out.includes("#}")) {
    log("ruff's output holds `#}`, which would close the block early; the body is left as it was");
    return text;
  }
  if (!out.endsWith("\n")) out += "\n";
  return text.slice(0, block.body.start) + (crlf ? out.replaceAll("\n", "\r\n") : out) + text.slice(block.body.end);
}

/** Whether ruff is run at all: only when asked for, and never in an untrusted workspace. */
export const usesRuff = (setting: unknown, trusted: boolean): boolean => trusted && setting === "ruff";
