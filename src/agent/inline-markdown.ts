import type { BlockMark } from "../contracts/block-document.js";

export interface InlineMarkdown {
  text: string;
  marks: BlockMark[];
}

interface Token {
  raw: string;
  content: string;
  type: BlockMark["type"];
}

/**
 * Extract author-facing inline semantics before component selection. This
 * matches the desktop workflow's bold, italic, highlight, underline,
 * strike-through and inline-code conventions. Marks are deliberately
 * non-overlapping: with nested syntax, the outer author instruction wins.
 */
export function parseInlineMarkdown(value: string): InlineMarkdown {
  const marks: BlockMark[] = [];
  let text = "";
  let cursor = 0;
  const pattern = /`[^`\n]+`|\*\*[^*\n][\s\S]*?\*\*|==[^=\n][\s\S]*?==|<u>[^<\n][\s\S]*?<\/u>|\+\+[^+\n][\s\S]*?\+\+|~~[^~\n][\s\S]*?~~|\*[^*\n][\s\S]*?\*/gu;

  for (const match of value.matchAll(pattern)) {
    const token = tokenFrom(match[0]!);
    if (!token) continue;
    const start = match.index ?? 0;
    text += value.slice(cursor, start);
    const markStart = text.length;
    text += displayMarkdownText(token.content);
    marks.push({ type: token.type, start: markStart, end: text.length });
    cursor = start + token.raw.length;
  }
  return { text: text + value.slice(cursor), marks };
}

export function displayMarkdownText(value: string): string {
  return parseInlineMarkdown(value).text;
}

function tokenFrom(raw: string): Token | undefined {
  if (raw.startsWith("**")) return { raw, content: raw.slice(2, -2), type: "strong" };
  if (raw.startsWith("==")) return { raw, content: raw.slice(2, -2), type: "highlight" };
  if (raw.startsWith("<u>")) return { raw, content: raw.slice(3, -4), type: "underline" };
  if (raw.startsWith("++")) return { raw, content: raw.slice(2, -2), type: "underline" };
  if (raw.startsWith("~~")) return { raw, content: raw.slice(2, -2), type: "strike" };
  if (raw.startsWith("`")) return { raw, content: raw.slice(1, -1), type: "code" };
  if (raw.startsWith("*")) return { raw, content: raw.slice(1, -1), type: "emphasis" };
  return undefined;
}
