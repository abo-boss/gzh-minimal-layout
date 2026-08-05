import type { BlockMark } from "../contracts/block-document.js";

export interface InlineMarkdown {
  text: string;
  marks: BlockMark[];
}

export function parseInlineMarkdown(value: string): InlineMarkdown {
  const marks: BlockMark[] = [];
  let text = "";
  let cursor = 0;
  const pattern = /\*\*([^*\n][\s\S]*?)\*\*|\*([^*\n][\s\S]*?)\*/gu;

  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0;
    text += value.slice(cursor, start);
    const content = match[1] ?? match[2] ?? "";
    const markStart = text.length;
    text += content;
    marks.push({ type: match[1] === undefined ? "emphasis" : "strong", start: markStart, end: text.length });
    cursor = start + match[0].length;
  }
  return { text: text + value.slice(cursor), marks };
}

export function displayMarkdownText(value: string): string {
  return parseInlineMarkdown(value).text;
}
