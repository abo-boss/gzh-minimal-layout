import type { BlockDocument, SourceSpan } from "../contracts/block-document.js";
import type { SourceManifest, SourceSegment } from "../source/source-manifest.js";
import type { ValidationIssue } from "./validation-error.js";

export type SourceSpanErrorCode =
  | "SOURCE_SPAN_OUT_OF_RANGE"
  | "SOURCE_SPAN_SEGMENT_MISMATCH"
  | "SOURCE_SPAN_OVERLAP"
  | "SOURCE_SPAN_GAP"
  | "SOURCE_SPAN_REORDERED"
  | "SOURCE_SPAN_CONTENT_MISMATCH"
  | "SOURCE_SPAN_DUPLICATED"
  | "SOURCE_REF_SPAN_INCONSISTENT";

export interface SourceCoverageEntry {
  valid: boolean;
  blockIds: string[];
  gaps: Array<{ startOffset: number; endOffset: number }>;
  overlaps: Array<{ startOffset: number; endOffset: number; blockIds: string[] }>;
}

export interface SourceSpanValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  sourceCoverage: Record<string, SourceCoverageEntry>;
}

interface Consumption extends SourceSpan {
  blockId: string;
  blockIndex: number;
  spanIndex: number;
}

export function validateSourceSpans(
  document: BlockDocument,
  manifest: SourceManifest,
): SourceSpanValidationResult {
  const issues: ValidationIssue[] = [];
  const segments = new Map(manifest.segments.map((segment) => [segment.id, segment]));
  const bySource = new Map<string, Consumption[]>();
  const sourceEnd = manifest.segments.at(-1)?.endOffset ?? 0;
  let previousGlobalStart = -1;

  for (const [blockIndex, block] of document.blocks.entries()) {
    const exactSpans = block.sourceSpans;
    const spans = exactSpans ?? legacySpans(block.sourceRefs ?? [], segments);
    if (!block.sourceRefs?.length) {
      add(issues, "SOURCE_REF_SPAN_INCONSISTENT", `/blocks/${blockIndex}/sourceRefs`, "Blocks must declare sourceRefs alongside sourceSpans.");
      continue;
    }
    const spanRefs = [...new Set(spans.map((span) => span.sourceRef))];
    if (!sameArray(block.sourceRefs, spanRefs)) {
      add(issues, "SOURCE_REF_SPAN_INCONSISTENT", `/blocks/${blockIndex}/sourceSpans`, "sourceRefs must exactly match the ordered Source Segments used by sourceSpans.");
    }

    let previousEnd = -1;
    const extracted: string[] = [];
    for (const [spanIndex, span] of spans.entries()) {
      const segment = segments.get(span.sourceRef);
      const path = `/blocks/${blockIndex}/sourceSpans/${spanIndex}`;
      if (span.startOffset >= span.endOffset || span.startOffset < 0) {
        add(issues, "SOURCE_SPAN_OUT_OF_RANGE", path, "Source Span must use a non-empty [startOffset, endOffset) range.");
        continue;
      }
      if (span.endOffset > sourceEnd) {
        add(issues, "SOURCE_SPAN_OUT_OF_RANGE", path, `Source Span exceeds the manifest source range [0, ${sourceEnd}).`);
      }
      if (!segment) {
        add(issues, "SOURCE_SPAN_SEGMENT_MISMATCH", `${path}/sourceRef`, `Source Segment ${span.sourceRef} does not exist.`);
        continue;
      }
      if (span.startOffset < segment.startOffset || span.endOffset > segment.endOffset) {
        add(issues, "SOURCE_SPAN_SEGMENT_MISMATCH", path, `Span must stay inside ${segment.id} [${segment.startOffset}, ${segment.endOffset}).`);
        continue;
      }
      if (span.startOffset < previousEnd || span.startOffset < previousGlobalStart) {
        add(issues, "SOURCE_SPAN_REORDERED", path, "Source Spans must follow source order.");
      }
      previousEnd = span.endOffset;
      previousGlobalStart = Math.max(previousGlobalStart, span.startOffset);
      extracted.push(segment.content.slice(
        span.startOffset - segment.startOffset,
        span.endOffset - segment.startOffset,
      ));
      const entries = bySource.get(span.sourceRef) ?? [];
      entries.push({ ...span, blockId: block.id, blockIndex, spanIndex });
      bySource.set(span.sourceRef, entries);
    }
    const expectedContent = exactSpans
      ? extracted.join("")
      : extracted.join("\n\n");
    if (spans.length > 0 && expectedContent !== block.content) {
      add(issues, "SOURCE_SPAN_CONTENT_MISMATCH", `/blocks/${blockIndex}/content`, "Block content must exactly equal the concatenated Source Span text.");
    }
  }

  const sourceCoverage: Record<string, SourceCoverageEntry> = {};
  for (const segment of manifest.segments) {
    const entries = (bySource.get(segment.id) ?? []).sort(
      (left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset,
    );
    const gaps: SourceCoverageEntry["gaps"] = [];
    const overlaps: SourceCoverageEntry["overlaps"] = [];
    let cursor = segment.startOffset;
    for (const entry of entries) {
      if (entry.startOffset > cursor) {
        gaps.push({ startOffset: cursor, endOffset: entry.startOffset });
      }
      if (entry.startOffset < cursor) {
        const overlap = { startOffset: entry.startOffset, endOffset: Math.min(cursor, entry.endOffset) };
        overlaps.push({ ...overlap, blockIds: entries.filter((candidate) => candidate.startOffset < overlap.endOffset && candidate.endOffset > overlap.startOffset).map((candidate) => candidate.blockId) });
        add(issues, "SOURCE_SPAN_OVERLAP", `/blocks/${entry.blockIndex}/sourceSpans/${entry.spanIndex}`, `${segment.id} contains overlapping Source Spans.`);
        add(issues, "SOURCE_SPAN_DUPLICATED", `/blocks/${entry.blockIndex}/sourceSpans/${entry.spanIndex}`, `${segment.id} characters are consumed more than once.`);
      }
      cursor = Math.max(cursor, entry.endOffset);
    }
    if (cursor < segment.endOffset) gaps.push({ startOffset: cursor, endOffset: segment.endOffset });
    for (const gap of gaps) {
      add(issues, "SOURCE_SPAN_GAP", `/sourceCoverage/${segment.id}`, `${segment.id} has an unconsumed range [${gap.startOffset}, ${gap.endOffset}).`);
    }
    sourceCoverage[segment.id] = {
      valid: gaps.length === 0 && overlaps.length === 0,
      blockIds: [...new Set(entries.map((entry) => entry.blockId))],
      gaps,
      overlaps,
    };
  }
  return { valid: issues.length === 0, issues, sourceCoverage };
}

function legacySpans(
  sourceRefs: string[],
  segments: Map<string, SourceSegment>,
): SourceSpan[] {
  return sourceRefs.flatMap((sourceRef) => {
    const segment = segments.get(sourceRef);
    return segment ? [{ sourceRef, startOffset: segment.startOffset, endOffset: segment.endOffset }] : [];
  });
}

function sameArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function add(issues: ValidationIssue[], code: SourceSpanErrorCode, path: string, message: string): void {
  if (!issues.some((issue) => issue.code === code && issue.path === path && issue.message === message)) {
    issues.push({ code, path, message });
  }
}
