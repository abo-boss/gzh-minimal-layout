import { describe, expect, it } from "vitest";

import type { BlockDocument } from "../src/contracts/block-document.js";
import { inspectSource } from "../src/source/inspect-source.js";
import {
  validateArticleProfile,
  validateBlockDocument,
  validateSourceManifest,
} from "../src/validation/schema-validator.js";

const validProfile = {
  articleType: "personal-essay",
  tone: ["calm", "restrained"],
  contentDensity: "medium",
  structurePattern: "narrative-reflection",
  sectionComplexity: "medium",
};

describe("source manifest", () => {
  const source = "# 标题\n\n第一段。\n\n> 原样引用\n\n- 第一项\n- 第二项";

  it("preserves source segment text byte-for-byte", () => {
    const manifest = inspectSource(source, { sourceId: "source-test", format: "markdown" });
    expect(manifest.segments.map((segment) => segment.content)).toEqual([
      "# 标题",
      "第一段。",
      "> 原样引用",
      "- 第一项\n- 第二项",
    ]);
  });

  it("records offsets that slice the original source exactly", () => {
    const manifest = inspectSource(source, { sourceId: "source-test", format: "markdown" });
    for (const segment of manifest.segments) {
      expect(source.slice(segment.startOffset, segment.endOffset)).toBe(segment.content);
    }
    expect(() => validateSourceManifest(manifest, source)).not.toThrow();
  });

  it("generates stable document and segment hashes", () => {
    const first = inspectSource(source, { sourceId: "source-test", format: "markdown" });
    const second = inspectSource(source, { sourceId: "source-test", format: "markdown" });
    expect(second.contentHash).toBe(first.contentHash);
    expect(second.segments.map((segment) => segment.contentHash)).toEqual(
      first.segments.map((segment) => segment.contentHash),
    );
  });

  it("keeps segment order stable", () => {
    const manifest = inspectSource(source, { sourceId: "source-test", format: "markdown" });
    expect(manifest.segments.map((segment) => segment.sourceOrder)).toEqual([0, 1, 2, 3]);
  });

  it("uses Markdown syntax only as kind hints without rewriting it", () => {
    const manifest = inspectSource(source, { sourceId: "source-test", format: "markdown" });
    expect(manifest.segments.map((segment) => segment.kindHint)).toEqual([
      "heading",
      "paragraph",
      "quote",
      "list",
    ]);
    expect(manifest.segments[0]!.content.startsWith("# ")).toBe(true);
    expect(manifest.segments[2]!.content.startsWith("> ")).toBe(true);
  });
});

describe("article profile", () => {
  it("accepts a compact valid profile", () => {
    expect(validateArticleProfile(validProfile)).toMatchObject(validProfile);
  });

  it("rejects an unknown article type", () => {
    expect(() => validateArticleProfile({ ...validProfile, articleType: "marketing" })).toThrow(
      /ArticleProfile validation failed/,
    );
  });

  it("rejects more than five tone labels", () => {
    expect(() => validateArticleProfile({
      ...validProfile,
      tone: ["one", "two", "three", "four", "five", "six"],
    })).toThrow(/ArticleProfile validation failed/);
  });
});

describe("agent BlockDocument source contract", () => {
  const source = "第一段。\n\n第二段。\n\n第三段。";
  const manifest = inspectSource(source, { sourceId: "blocks-test", format: "plain-text" });
  const validDocument: BlockDocument = {
    specVersion: "1.0",
    id: "blocks-test",
    blocks: manifest.segments.map((segment, index) => ({
      id: `block-${index + 1}`,
      type: "paragraph",
      role: "narrative",
      content: segment.content,
      importance: 0.5,
      sourceOrder: index,
      relationToPrevious: index === 0 ? "default" : "continuation",
      sourceRefs: [segment.id],
      marks: [],
    })),
  };

  it("accepts the fixed relation vocabulary", () => {
    expect(() => validateBlockDocument(validDocument, manifest)).not.toThrow();
  });

  it("rejects an unknown relation", () => {
    const document = structuredClone(validDocument) as unknown as { blocks: Array<Record<string, unknown>> };
    document.blocks[1]!.relationToPrevious = "dramatic-pause";
    expect(() => validateBlockDocument(document, manifest)).toThrow(/BlockDocument validation failed/);
  });

  it("rejects a sourceRef that does not exist", () => {
    const document = structuredClone(validDocument);
    document.blocks[0]!.sourceRefs = ["source-999"];
    expect(() => validateBlockDocument(document, manifest)).toThrow(/block.unknown-source-ref/);
  });

  it("rejects Block content that differs from its source segment", () => {
    const document = structuredClone(validDocument);
    document.blocks[0]!.content = "被改写。";
    expect(() => validateBlockDocument(document, manifest)).toThrow(/block.source-content-mismatch/);
  });

  it("rejects merging non-adjacent source segments", () => {
    const document = structuredClone(validDocument);
    document.blocks = [{
      ...document.blocks[0]!,
      content: "第一段。\n\n第三段。",
      sourceRefs: ["source-001", "source-003"],
    }];
    expect(() => validateBlockDocument(document, manifest)).toThrow(/block.non-adjacent-source-refs/);
  });

  it("rejects overlapping inline mark ranges", () => {
    expect(() => validateBlockDocument({
      specVersion: "1.0",
      id: "overlapping-marks",
      blocks: [{
        id: "block-1", type: "paragraph", role: "body", content: "需要被强调的正文", importance: 0.5, sourceOrder: 0,
        marks: [{ type: "strong", start: 0, end: 5 }, { type: "keyword", start: 3, end: 7 }],
      }],
    })).toThrow(/block.overlapping-mark-range/);
  });

  it("rejects table rows whose width differs from declared headers", () => {
    expect(() => validateBlockDocument({
      specVersion: "1.0",
      id: "table-width-mismatch",
      blocks: [{
        id: "table", type: "table", role: "comparison", content: "左 | 右\n只有一格 | 补位 | 多余", importance: 0.7, sourceOrder: 0,
        structure: { headers: ["左", "右"], rows: [["只有一格", "补位", "多余"]] },
      }],
    })).toThrow(/block.structure-table-width-mismatch/);
  });
});
