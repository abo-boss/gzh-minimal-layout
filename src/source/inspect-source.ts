import { createHash } from "node:crypto";

import type {
  SourceFormat,
  SourceKindHint,
  SourceManifest,
  SourceSegmentationMode,
  SourceSegment,
} from "./source-manifest.js";

export interface InspectSourceOptions {
  sourceId: string;
  format: SourceFormat;
  segmentation?: SourceSegmentationMode;
}

export function inspectSource(
  sourceText: string,
  options: InspectSourceOptions,
): SourceManifest {
  const requested = options.segmentation ?? "auto";
  const blankLineSpans = nonBlankSpans(sourceText);
  const lineSpans = nonBlankLineSpans(sourceText);
  const semanticMarkdownSpans = options.format === "markdown"
    ? markdownBlockSpans(sourceText)
    : blankLineSpans;
  const useLineFallback =
    requested === "auto" &&
    blankLineSpans.length === 1 &&
    lineSpans.length > 1;
  const resolved = requested === "lines" || useLineFallback ? "lines" : "blank-lines";
  // Markdown has block grammar that a blank-line splitter cannot see: a table,
  // quote or list is one source unit even when it contains multiple lines.
  // The external segmentation vocabulary remains stable; the manifest's
  // kindHint and exact spans carry the richer semantic fact.
  const spans = resolved === "lines" ? lineSpans : semanticMarkdownSpans;
  const segments = spans.map<SourceSegment>(({ startOffset, endOffset }, index) => {
    const content = sourceText.slice(startOffset, endOffset);
    return {
      id: `source-${String(index + 1).padStart(3, "0")}`,
      sourceOrder: index,
      kindHint: inferKindHint(content, options.format),
      content,
      startOffset,
      endOffset,
      contentHash: sha256(content),
    };
  });

  return {
    specVersion: "1.0",
    sourceId: options.sourceId,
    format: options.format,
    contentHash: sha256(sourceText),
    segmentation: {
      requested,
      resolved,
      ...(useLineFallback
        ? {
            reason:
              "blank-line segmentation produced one segment while multiple non-empty lines were present",
          }
        : {}),
    },
    segments,
  };
}

export function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function nonBlankSpans(sourceText: string): Array<{
  startOffset: number;
  endOffset: number;
}> {
  const lines = sourceLines(sourceText);
  const spans: Array<{ startOffset: number; endOffset: number }> = [];
  let startOffset: number | undefined;
  let endOffset = 0;

  for (const line of lines) {
    if (line.content.trim().length === 0) {
      if (startOffset !== undefined) {
        spans.push({ startOffset, endOffset });
        startOffset = undefined;
      }
      continue;
    }
    startOffset ??= line.startOffset;
    endOffset = line.contentEndOffset;
  }
  if (startOffset !== undefined) spans.push({ startOffset, endOffset });
  return spans;
}

function nonBlankLineSpans(sourceText: string): Array<{
  startOffset: number;
  endOffset: number;
}> {
  return sourceLines(sourceText)
    .filter((line) => line.content.trim().length > 0)
    .map((line) => ({
      startOffset: line.startOffset,
      endOffset: line.contentEndOffset,
    }));
}

function sourceLines(sourceText: string): Array<{
  content: string;
  startOffset: number;
  contentEndOffset: number;
}> {
  const lines: Array<{
    content: string;
    startOffset: number;
    contentEndOffset: number;
  }> = [];
  let offset = 0;
  while (offset < sourceText.length) {
    const newline = sourceText.indexOf("\n", offset);
    const rawEnd = newline === -1 ? sourceText.length : newline;
    const contentEndOffset = rawEnd > offset && sourceText[rawEnd - 1] === "\r"
      ? rawEnd - 1
      : rawEnd;
    lines.push({
      content: sourceText.slice(offset, contentEndOffset),
      startOffset: offset,
      contentEndOffset,
    });
    offset = newline === -1 ? sourceText.length : newline + 1;
  }
  return lines;
}

function inferKindHint(content: string, format: SourceFormat): SourceKindHint {
  if (format === "plain-text") return "paragraph";
  const firstLine = content.split(/\r?\n/u, 1)[0] ?? "";
  if (/^#{1,6}\s/u.test(firstLine)) return "heading";
  if (/^>\s?/u.test(firstLine)) return "quote";
  if (/^(?:[-+*]|\d+[.)])\s/u.test(firstLine)) return "list";
  if (/^```/u.test(firstLine)) return "code";
  if (/^!\[[^\]]*\]\([^\s)]+(?:\s+[^)]*)?\)\s*$/u.test(firstLine)) return "image";
  if (/^\|/u.test(firstLine) && /\|/u.test(content.split(/\r?\n/u)[1] ?? "")) return "table";
  if (/^(?:---+|___+|\*\*\*+)\s*$/u.test(firstLine)) return "divider";
  return "paragraph";
}

function markdownBlockSpans(sourceText: string): Array<{ startOffset: number; endOffset: number }> {
  const lines = sourceLines(sourceText);
  const spans: Array<{ startOffset: number; endOffset: number }> = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.content.trim()) {
      index += 1;
      continue;
    }
    const startOffset = line.startOffset;
    let endIndex = index;
    if (/^```/u.test(line.content.trim())) {
      endIndex += 1;
      while (endIndex < lines.length && !/^```/u.test(lines[endIndex]!.content.trim())) endIndex += 1;
      if (endIndex < lines.length) endIndex += 1;
    } else if (isMarkdownTableStart(lines, index)) {
      endIndex += 2;
      while (endIndex < lines.length && /^\|.*\|\s*$/u.test(lines[endIndex]!.content.trim())) endIndex += 1;
    } else if (/^>\s?/u.test(line.content)) {
      endIndex += 1;
      while (endIndex < lines.length && /^>\s?/u.test(lines[endIndex]!.content)) endIndex += 1;
    } else if (isListLine(line.content)) {
      endIndex += 1;
      while (endIndex < lines.length && (isListLine(lines[endIndex]!.content) || /^\s{2,}\S/u.test(lines[endIndex]!.content))) endIndex += 1;
    } else if (isStandaloneMarkdownBlock(line.content)) {
      endIndex += 1;
    } else {
      endIndex += 1;
      while (
        endIndex < lines.length
        && lines[endIndex]!.content.trim()
        && !isStandaloneMarkdownBlock(lines[endIndex]!.content)
        && !isListLine(lines[endIndex]!.content)
        && !/^>\s?/u.test(lines[endIndex]!.content)
        && !isMarkdownTableStart(lines, endIndex)
      ) endIndex += 1;
    }
    const last = lines[Math.max(index, endIndex - 1)]!;
    spans.push({ startOffset, endOffset: last.contentEndOffset });
    index = Math.max(endIndex, index + 1);
  }
  return spans;
}

function isStandaloneMarkdownBlock(value: string): boolean {
  const line = value.trim();
  return /^#{1,6}\s/u.test(line)
    || /^```/u.test(line)
    || /^(?:---+|___+|\*\*\*+)\s*$/u.test(line)
    || /^!\[[^\]]*\]\([^\s)]+(?:\s+[^)]*)?\)\s*$/u.test(line);
}

function isListLine(value: string): boolean {
  return /^\s*(?:[-+*]|\d+[.)、])\s+/u.test(value);
}

function isMarkdownTableStart(lines: ReturnType<typeof sourceLines>, index: number): boolean {
  const first = lines[index]?.content.trim() ?? "";
  const separator = lines[index + 1]?.content.trim() ?? "";
  return /^\|.*\|\s*$/u.test(first) && /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(separator);
}
