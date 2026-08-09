import { describe, expect, it } from "vitest";

import type { BlockDocument } from "../src/contracts/block-document.js";
import { createLayoutPlan } from "../src/presentation/layout-plan.js";
import { renderComponentArticle } from "../src/presentation/component-renderer.js";
import { createBaselineReadingPlan } from "../src/reading/reading-plan.js";
import { candidatesFor, loadThemeLibraries, loadThemeLibrary } from "../src/theme/theme-library.js";
import { validateBlockDocument } from "../src/validation/schema-validator.js";
import { readJson } from "./helpers.js";

const themeIds = [
  "tuo-content-method",
  "tuo-digital-efficiency",
  "tuo-forest-order",
  "tuo-insight-logic",
  "tuo-magazine-cards",
  "tuo-quiet-lifestyle",
  "tuo-whitespace-narrative",
] as const;

describe("reading-first WeChat presentation pipeline", () => {
  it("loads the seven registered TUO theme packages with a 20px canvas rail", async () => {
    const libraries = await loadThemeLibraries();
    expect(libraries.map((library) => library.manifest.id)).toEqual([...themeIds]);
    for (const library of libraries) {
      expect(library.manifest.tokens).toMatchObject({ canvas: { padding: expect.stringMatching(/20px/u) } });
      expect(library.components.map((component) => component.id)).toEqual([
        "masthead", "heading", "subheading", "minor", "lead", "prose", "focus",
        "list", "quote", "callout", "cta", "image", "ending",
      ]);
      expect(library.components.every((component) => component.templateHtml.includes("<slot name=") || component.kind === "image")).toBe(true);
    }
  });

  it("keeps ordinary paragraphs on the quiet theme baseline while gestures own spacing", async () => {
    const document = await fixture("fixtures/agent-workflow/opinion-knowledge/block-document.json");
    const reading = createBaselineReadingPlan(document);
    for (const library of await loadThemeLibraries()) {
      const layout = createLayoutPlan(document, reading, library);
      for (const [index, block] of document.blocks.entries()) {
        if (block.type !== "paragraph") continue;
        expect(layout.items[index]).toMatchObject({ componentId: "prose", variantId: "source" });
      }
      expect(new Set(layout.items.map((item) => item.rhythmToken)).size).toBeGreaterThan(1);
    }
  });

  it("accepts a sparse legal enhancement and rejects an illegal one", async () => {
    const document = validateBlockDocument({
      specVersion: "1.0",
      id: "sparse-selection",
      blocks: [
        { id: "title", type: "article-title", role: "title", content: "标题", importance: 1, sourceOrder: 0 },
        { id: "body", type: "paragraph", role: "key-insight", content: "真正重要的判断。", importance: 0.9, sourceOrder: 1, relationToPrevious: "before-strong-block", sectionId: "main" },
      ],
    });
    const reading = createBaselineReadingPlan(document);
    const library = await loadThemeLibrary("tuo-insight-logic");
    expect(candidatesFor(document.blocks[1]!, reading.items[1]!, library).map((candidate) => candidate.id)).toContain("focus:source");
    const layout = createLayoutPlan(document, reading, library, {
      selections: [{ blockId: "body", componentId: "focus", variantId: "source", reason: "唯一核心判断" }],
    });
    expect(layout.items[1]).toMatchObject({ componentId: "focus", variantId: "source", reason: "唯一核心判断" });
    expect(() => createLayoutPlan(document, reading, library, {
      selections: [{ blockId: "body", componentId: "quote", variantId: "source", reason: "illegal" }],
    })).toThrow(/illegal component candidate/u);
  });

  it("renders all themes as 375px previews with exact outer 20px rails and one spacing owner", async () => {
    const document = await fixture("fixtures/agent-workflow/literary-prose/block-document.json");
    const reading = createBaselineReadingPlan(document);
    for (const themeId of themeIds) {
      const library = await loadThemeLibrary(themeId);
      const result = renderComponentArticle(document, createLayoutPlan(document, reading, library), library);
      expect(result.contentIntegrity.valid).toBe(true);
      expect(result.previewHtml).toContain("width:375px");
      expect(result.cleanPreviewHtml).toContain("width:375px");
      expect(result.canonicalHtml).toMatch(/padding:0 20px \d+px/u);
      expect(result.canonicalHtml).toContain("margin-top:0;margin-bottom:0");
      expect(result.canonicalHtml).toContain("padding-left:0;padding-right:0");
      expect(result.wechatHtml).not.toMatch(/data-|<slot\b|<\/?(?:html|head|body|style|script)\b|\sclass=|\sid=/iu);
    }
  });

  it("binds structured lists and quotes without changing source text", async () => {
    const document = validateBlockDocument({
      specVersion: "1.0",
      id: "structured-reading",
      blocks: [
        { id: "title", type: "article-title", role: "title", content: "# 结构化阅读", importance: 1, sourceOrder: 0 },
        {
          id: "quote", type: "quote", role: "evidence", content: "> 判断来自事实。\n> —— 编辑手记", importance: 0.7, sourceOrder: 1, relationToPrevious: "new-argument",
          structure: { content: "判断来自事实。", hasAttribution: true, attribution: "—— 编辑手记" },
        },
        {
          id: "list", type: "list", role: "steps", content: "3. 明确问题\n4. 先做验证", importance: 0.7, sourceOrder: 2, relationToPrevious: "continuation",
          structure: { ordered: true, items: [{ ordinal: 3, content: "明确问题" }, { ordinal: 4, content: "先做验证" }] },
        },
        { id: "body", type: "paragraph", role: "body", content: "普通正文继续承担主要阅读。", importance: 0.5, sourceOrder: 3, relationToPrevious: "continuation" },
      ],
    });
    const reading = createBaselineReadingPlan(document);
    const library = await loadThemeLibrary("tuo-content-method");
    const result = renderComponentArticle(document, createLayoutPlan(document, reading, library), library);
    expect(result.contentIntegrity.valid).toBe(true);
    expect(result.wechatHtml).toContain("<blockquote");
    expect(result.wechatHtml).toMatch(/<ol[^>]*start="3"/u);
    expect(result.wechatHtml).toContain("—— 编辑手记");
  });

  it("rejects unsafe source image URLs", async () => {
    const document = validateBlockDocument({
      specVersion: "1.0",
      id: "unsafe-image",
      blocks: [{
        id: "image", type: "image", role: "image", content: "危险图片", importance: 0.7, sourceOrder: 0,
        structure: { src: "javascript:alert(1)", alt: "危险图片", hasCaption: false },
      }],
    });
    const reading = createBaselineReadingPlan(document);
    const library = await loadThemeLibrary("tuo-magazine-cards");
    expect(() => renderComponentArticle(document, createLayoutPlan(document, reading, library), library)).toThrow(/unsafe URI scheme/u);
  });
});

async function fixture(file: string): Promise<BlockDocument> {
  return validateBlockDocument(await readJson(file));
}
