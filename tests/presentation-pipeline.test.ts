import { describe, expect, it } from "vitest";

import type { BlockDocument } from "../src/contracts/block-document.js";
import { createLayoutPlan } from "../src/presentation/layout-plan.js";
import { renderComponentArticle } from "../src/presentation/component-renderer.js";
import { createBaselineReadingPlan } from "../src/reading/reading-plan.js";
import { loadThemeLibrary, candidatesFor } from "../src/theme/theme-library.js";
import { validateBlockDocument, validateLayoutPlan, validateReadingPlan } from "../src/validation/schema-validator.js";
import { readJson } from "./helpers.js";

describe("reading-first WeChat presentation pipeline", () => {
  it("loads every reference-derived theme with its extracted rhythm and alignment contract", async () => {
    const references = [
      ["prussian-judgment", "#162A45", "14px", "78%", 72],
      ["brick-literary", "#9A3B26", "14px", "80%", 76],
      ["champagne-editorial", "#B18F6A", "15px", "82%", 72],
      ["cobalt-essay", "#1E293B", "15px", "78%", 76],
      ["minimal-magazine", "#1E293B", "15px", "80%", 84],
      ["moss-staircase", "#4A5D4E", "15px", "76%", 120],
      ["efficiency-system", "#36506B", "14px", "84%", 64],
      ["warm-card-magazine", "#9A8060", "14px", "82%", 72],
    ] as const;

    for (const [themeId, accent, bodySize, focusWidth, sectionGap] of references) {
      const library = await loadThemeLibrary(themeId);
      expect(library.manifest.tokens).toMatchObject({
        color: { accent },
        size: { body: bodySize },
        alignment: { focusWidth },
      });
      expect(library.manifest.rhythm.modes.balanced.section).toBe(sectionGap);
      expect(library.components.map((component) => component.id)).toEqual([
        "masthead", "lead-image", "lead", "heading", "subheading", "prose", "list", "quote", "ending", "cta",
      ]);
    }
  });

  it("keeps reference-specific component treatments inside theme packages", async () => {
    const efficiency = await loadThemeLibrary("efficiency-system");
    const efficiencyQuote = efficiency.components.find((component) => component.id === "quote");
    expect(efficiencyQuote?.variants.find((variant) => variant.id === "pull")).toMatchObject({
      surface: "panel",
      label: "深色卡片引用",
    });

    const champagne = await loadThemeLibrary("champagne-editorial");
    expect(champagne.components.find((component) => component.id === "masthead")?.baseStyles.root).toMatchObject({
      "background-color": "{color.accentLight}",
      "text-align": "{alignment.center}",
    });

    const moss = await loadThemeLibrary("moss-staircase");
    expect(moss.components.find((component) => component.id === "heading")?.baseStyles.root).toMatchObject({
      margin: "0 0 0 15%",
    });

    const warm = await loadThemeLibrary("warm-card-magazine");
    expect(warm.components.find((component) => component.id === "prose")?.baseStyles.root).toMatchObject({
      "border-radius": "24px",
      "background-color": "{color.paper}",
    });
  });

  it("loads schema-validated JSON metadata plus controlled HTML templates", async () => {
    const library = await loadThemeLibrary("quiet-editorial");
    expect(library.manifest.id).toBe("quiet-editorial");
    expect(library.components.map((component) => component.id)).toEqual(["masthead", "heading", "prose", "list", "quote", "ending"]);
    expect(library.components.every((component) => component.templateHtml.includes("<slot name="))).toBe(true);
  });

  it("loads the forest-order formal theme as a complete component package", async () => {
    const library = await loadThemeLibrary("forest-order");
    expect(library.manifest).toMatchObject({ id: "forest-order", name: "森序" });
    expect(library.components.map((component) => component.id)).toEqual(["masthead", "heading", "subheading", "prose", "list", "quote", "comparison", "ending", "cta"]);
    expect(library.manifest.tokens.color).toMatchObject({ forest: "#1A3224", champagne: "#C0AC92" });
    expect(library.manifest.tokens.canvas).toMatchObject({ background: "#FAFAF7", padding: "0 20px 72px" });
    expect(library.manifest.tokens.alignment).toMatchObject({ focusMargin: "0 auto", focusMaxWidth: "86%", insetPadding: "16px" });
  });

  it("loads the whitespace-journal theme with explicit alignment rails", async () => {
    const library = await loadThemeLibrary("whitespace-journal");
    expect(library.manifest).toMatchObject({ id: "whitespace-journal", name: "留白志" });
    expect(library.components.map((component) => component.id)).toEqual([
      "masthead", "lead-image", "lead", "heading", "subheading", "prose", "quote", "list", "ending", "cta",
    ]);
    expect(library.manifest.tokens.alignment).toMatchObject({
      flowMargin: "0",
      insetMargin: "0 0 0 24px",
      focusMargin: "0 auto",
      focusWidth: "82%",
      ornamentLeft: "-14px",
    });
    expect(library.manifest.tokens.canvas).toMatchObject({ background: "#F9F8F6", padding: "0 20px 72px" });
  });

  it("derives reading gestures before resolving theme-owned rhythm", async () => {
    const document = await fixture("fixtures/agent-workflow/opinion-knowledge/block-document.json");
    const reading = validateReadingPlan(createBaselineReadingPlan(document));
    const library = await loadThemeLibrary("quiet-editorial");
    const layout = validateLayoutPlan(createLayoutPlan(document, reading, library));

    expect(reading.items[0]?.gesture).toBe("anchor");
    expect(reading.items.at(-1)?.gesture).toBe("release");
    expect(layout.items.map((item) => item.gapBefore)).toEqual([0, 52, 28, 18, 10, 18, 28, 64]);

    const dense = createLayoutPlan(document, reading, library, { density: "dense" });
    const airy = createLayoutPlan(document, reading, library, { density: "airy" });
    expect(dense.items[3]!.gapBefore).toBeLessThan(layout.items[3]!.gapBefore);
    expect(layout.items[3]!.gapBefore).toBeLessThan(airy.items[3]!.gapBefore);
  });

  it("lets an Agent choose only from legal theme candidates and records the reason", async () => {
    const document = await fixture("fixtures/agent-workflow/literary-prose/block-document.json");
    const reading = createBaselineReadingPlan(document);
    const library = await loadThemeLibrary("quiet-editorial");
    const titleCandidates = candidatesFor(document.blocks[0]!, reading.items[0]!, library);
    expect(titleCandidates.map((candidate) => candidate.id)).toEqual(["masthead:editorial", "masthead:minimal"]);

    const layout = createLayoutPlan(document, reading, library, {
      selections: [{ blockId: "block-001", componentId: "masthead", variantId: "minimal", reason: "文章语气克制，降低题头装饰" }],
    });
    expect(layout.items[0]).toMatchObject({ componentId: "masthead", variantId: "minimal", reason: "文章语气克制，降低题头装饰" });
    expect(() => createLayoutPlan(document, reading, library, {
      selections: [{ blockId: "block-001", componentId: "prose", variantId: "body", reason: "illegal" }],
    })).toThrow(/illegal component candidate/u);
  });

  it("renders a 375px debug preview and a clean inline-style WeChat fragment", async () => {
    const document = await fixture("fixtures/agent-workflow/literary-prose/block-document.json");
    const reading = createBaselineReadingPlan(document);
    const library = await loadThemeLibrary("quiet-editorial");
    const layout = createLayoutPlan(document, reading, library);
    const result = renderComponentArticle(document, layout, library);

    expect(result.contentIntegrity.valid).toBe(true);
    expect(result.canonicalHtml).toMatch(/data-component-id="masthead"/u);
    expect(result.canonicalHtml).toMatch(/ending · release · ending:release · release\/64px/u);
    expect(result.previewHtml).toContain("width:375px");
    expect(result.cleanPreviewHtml).toContain("width:375px");
    expect(result.cleanPreviewHtml).not.toContain("data-debug-only");
    expect(result.wechatHtml).toContain("午后的光落在旧木桌上");
    expect(result.wechatHtml).toContain(">风从窗边经过</h1>");
    expect(result.wechatHtml).not.toContain("># 风从窗边经过</h1>");
    expect(result.wechatHtml).toContain("style=");
    expect(result.wechatHtml).not.toMatch(/data-|<\/?(?:html|head|body|style|script)\b|\sclass=|\sid=|<slot\b/iu);
  });

  it("checks content integrity from escaped text extracted from rendered HTML", async () => {
    const document: BlockDocument = {
      specVersion: "1.0",
      id: "rendered-text-integrity",
      blocks: [
        { id: "title", type: "article-title", role: "title", content: "# 标题 & 边界", importance: 1, sourceOrder: 0 },
        { id: "body", type: "paragraph", role: "body", content: "原文 <必须> \"保留\"。", importance: 0.5, sourceOrder: 1, relationToPrevious: "continuation" },
      ],
    };
    const reading = createBaselineReadingPlan(document);
    const library = await loadThemeLibrary("quiet-editorial");
    const result = renderComponentArticle(document, createLayoutPlan(document, reading, library), library);

    expect(result.contentIntegrity.valid).toBe(true);
    expect(result.wechatHtml).toContain("标题 &amp; 边界");
    expect(result.wechatHtml).toContain("原文 &lt;必须&gt; &quot;保留&quot;。");
  });

  it("binds structured list and quote slots without exposing HTML decisions to the layout", async () => {
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
      ],
    });
    const reading = createBaselineReadingPlan(document);
    const library = await loadThemeLibrary("quiet-editorial");
    const quoteCandidates = candidatesFor(document.blocks[1]!, reading.items[1]!, library);
    const listCandidates = candidatesFor(document.blocks[2]!, reading.items[2]!, library);
    const result = renderComponentArticle(document, createLayoutPlan(document, reading, library), library);

    expect(quoteCandidates[0]?.id).toBe("quote:inset");
    expect(listCandidates[0]?.id).toBe("list:editorial");
    expect(result.contentIntegrity.valid).toBe(true);
    expect(result.wechatHtml).toContain("<blockquote");
    expect(result.wechatHtml).toMatch(/<ol[^>]*start="3"/u);
    expect(result.wechatHtml).toContain("<li");
    expect(result.wechatHtml).toContain("—— 编辑手记");
    expect(result.wechatHtml).not.toMatch(/data-|<slot\b/iu);
  });

  it("falls back to prose when a list has no declared structure", async () => {
    const document = validateBlockDocument({
      specVersion: "1.0",
      id: "unstructured-list",
      blocks: [{ id: "list", type: "list", role: "list", content: "- 原始项目", importance: 0.5, sourceOrder: 0 }],
    });
    const reading = createBaselineReadingPlan(document);
    const library = await loadThemeLibrary("quiet-editorial");
    expect(candidatesFor(document.blocks[0]!, reading.items[0]!, library).map((candidate) => candidate.id)).toEqual(["prose:body"]);
  });

  it("keeps the three complete workflow fixtures renderable", async () => {
    const library = await loadThemeLibrary("quiet-editorial");
    for (const file of [
      "fixtures/agent-workflow/literary-prose/block-document.json",
      "fixtures/agent-workflow/opinion-knowledge/block-document.json",
      "fixtures/agent-workflow/personal-essay/block-document.json",
    ]) {
      const document = await fixture(file);
      const reading = createBaselineReadingPlan(document);
      const result = renderComponentArticle(document, createLayoutPlan(document, reading, library), library);
      expect(result.contentIntegrity.valid).toBe(true);
      expect(result.wechatHtml).not.toMatch(/data-|<slot\b/iu);
    }
  });

  it("renders the reference-derived forest-order theme without leaking renderer markers", async () => {
    const document = await fixture("fixtures/agent-workflow/opinion-knowledge/block-document.json");
    const reading = createBaselineReadingPlan(document);
    const library = await loadThemeLibrary("forest-order");
    const layout = createLayoutPlan(document, reading, library);
    const result = renderComponentArticle(document, layout, library);

    expect(layout.items[0]).toMatchObject({ componentId: "masthead", variantId: "cover" });
    expect(layout.items.some((item) => item.componentId === "quote" && item.variantId === "paper")).toBe(true);
    expect(result.contentIntegrity.valid).toBe(true);
    expect(result.wechatHtml).toContain("#1A3224");
    expect(result.wechatHtml).toContain("#C0AC92");
    expect(result.wechatHtml).toContain("background-color:#FAFAF7");
    expect(result.wechatHtml).toContain("<blockquote");
    expect(result.wechatHtml).not.toMatch(/data-|<slot\b/iu);
  });

  it("renders forest-order alignment tokens through its focus and inset components", async () => {
    const document = validateBlockDocument({
      specVersion: "1.0",
      id: "forest-alignment-rails",
      blocks: [
        { id: "title", type: "article-title", role: "title", content: "秩序来自关系", importance: 1, sourceOrder: 0 },
        { id: "inset", type: "callout", role: "explanation", content: "解释内容沿缩进轨出现。", importance: 0.65, sourceOrder: 1, relationToPrevious: "new-argument" },
        { id: "focus", type: "paragraph", role: "key-insight", content: "重点内容沿窄幅中轴出现。", importance: 0.8, sourceOrder: 2, relationToPrevious: "before-strong-block" },
        { id: "ending", type: "ending", role: "conclusion", content: "最后沿同一中轴收束。", importance: 0.72, sourceOrder: 3, relationToPrevious: "before-ending" },
      ],
    });
    const reading = createBaselineReadingPlan(document);
    const library = await loadThemeLibrary("forest-order");
    const layout = createLayoutPlan(document, reading, library);
    const result = renderComponentArticle(document, layout, library);

    expect(layout.items.find((item) => item.sourceBlockIds[0] === "inset")).toMatchObject({ componentId: "prose", variantId: "inset" });
    expect(layout.items.find((item) => item.sourceBlockIds[0] === "focus")).toMatchObject({ componentId: "prose", variantId: "golden" });
    expect(result.wechatHtml).toContain("padding-left:16px");
    expect(result.wechatHtml).toContain("margin:0 auto;max-width:80%");
    expect(result.contentIntegrity.valid).toBe(true);
  });

  it("renders the whitespace-journal head image and semantic alignment modes", async () => {
    const document = await fixture("fixtures/whitespace-journal/block-document.json");
    const reading = createBaselineReadingPlan(document);
    const library = await loadThemeLibrary("whitespace-journal");
    const layout = createLayoutPlan(document, reading, library);
    const result = renderComponentArticle(document, layout, library);

    expect(layout.items.find((item) => item.sourceBlockIds[0] === "lead-image")).toMatchObject({ componentId: "lead-image", variantId: "gallery" });
    expect(layout.items.find((item) => item.sourceBlockIds[0] === "lead")).toMatchObject({ componentId: "lead", variantId: "drop-cap" });
    expect(layout.items.find((item) => item.sourceBlockIds[0] === "insight")).toMatchObject({ componentId: "prose", variantId: "focus" });
    expect(layout.items.find((item) => item.sourceBlockIds[0] === "heading-1")).toMatchObject({ componentId: "heading", variantId: "numbered" });
    expect(result.contentIntegrity.valid).toBe(true);
    expect(result.wechatHtml).toContain('<img style="display:block;width:100%;height:100%;object-fit:cover" src="https://images.unsplash.com/');
    expect(result.wechatHtml).toContain('alt="光影留白"');
    expect(result.wechatHtml).toContain("LIGHT &amp; SHADOW");
    expect(result.wechatHtml).toContain("background-color:#F9F8F6");
    expect(result.wechatHtml).toContain("margin:0 auto;max-width:78%");
    expect(result.wechatHtml).toContain("left:-14px");
    expect(result.wechatHtml).toContain("margin:0 0 0 24px");
    expect(result.wechatHtml).not.toMatch(/data-|<slot\b/iu);
  });

  it("rejects unsafe source URLs before binding a theme image attribute", async () => {
    const document = validateBlockDocument({
      specVersion: "1.0",
      id: "unsafe-lead-image",
      blocks: [
        { id: "title", type: "article-title", role: "title", content: "安全头图", importance: 1, sourceOrder: 0 },
        {
          id: "image", type: "image", role: "lead-image", content: "危险图片", importance: 0.7, sourceOrder: 1, relationToPrevious: "new-argument",
          structure: { src: "javascript:alert(1)", alt: "危险图片", hasCaption: false },
        },
      ],
    });
    const reading = createBaselineReadingPlan(document);
    const library = await loadThemeLibrary("whitespace-journal");
    expect(() => renderComponentArticle(document, createLayoutPlan(document, reading, library), library)).toThrow(/unsafe URI scheme/u);
  });

  it("renders source-owned section ordinals and level-three side-line headings", async () => {
    const document = validateBlockDocument({
      specVersion: "1.0",
      id: "forest-heading-structure",
      blocks: [
        {
          id: "section", type: "heading", role: "section-heading", content: "01 秩序来自判断", importance: 0.8, sourceOrder: 0, level: 2,
          structure: { hasMarker: true, marker: "01", ordinal: 1, title: "秩序来自判断" },
        },
        {
          id: "detail", type: "heading", role: "subheading", content: "### 删掉没有功能的强调", importance: 0.65, sourceOrder: 1, level: 3, relationToPrevious: "new-argument",
          structure: { hasMarker: false, title: "删掉没有功能的强调" },
        },
      ],
    });
    const reading = createBaselineReadingPlan(document);
    const library = await loadThemeLibrary("forest-order");
    const layout = createLayoutPlan(document, reading, library);
    const result = renderComponentArticle(document, layout, library);

    expect(layout.items[0]).toMatchObject({ componentId: "heading", variantId: "section" });
    expect(layout.items[1]).toMatchObject({ componentId: "subheading", variantId: "side-line" });
    expect(result.wechatHtml).toContain(">01</span>");
    expect(result.wechatHtml).toContain("<h3");
    expect(result.contentIntegrity.valid).toBe(true);
  });

  it("replaces ordinal-only source headings with the theme marker", async () => {
    const document = validateBlockDocument({
      specVersion: "1.0",
      id: "ordinal-only-heading",
      blocks: [
        {
          id: "section", type: "heading", role: "section-heading", content: "五", importance: 0.8, sourceOrder: 0, level: 2,
          structure: { hasMarker: true, marker: "五", ordinal: 5, title: "五" },
        },
      ],
    });
    const reading = createBaselineReadingPlan(document);
    const library = await loadThemeLibrary("whitespace-journal");
    const result = renderComponentArticle(document, createLayoutPlan(document, reading, library), library);

    expect(result.wechatHtml).toContain(">05</span>");
    expect(result.wechatHtml).toMatch(/<h2[^>]*><\/h2>/u);
    expect(result.wechatHtml).not.toContain(">五</h2>");
    expect(result.contentIntegrity.valid).toBe(true);
  });

  it("renders the high-fidelity forest component set from declared source facts", async () => {
    const marked = "成熟的设计往往从删减开始。";
    const emphasized = "成熟的设计";
    const document = validateBlockDocument({
      specVersion: "1.0",
      id: "forest-high-fidelity",
      blocks: [
        { id: "title", type: "article-title", role: "title", content: "高级审美不是装饰，而是一种秩序能力", importance: 1, sourceOrder: 0 },
        {
          id: "marked", type: "paragraph", role: "argument", content: marked, importance: 0.8, sourceOrder: 1, relationToPrevious: "new-section",
          marks: [{ type: "strong", start: marked.indexOf(emphasized), end: marked.indexOf(emphasized) + emphasized.length }],
        },
        { id: "flow-1", type: "paragraph", role: "body", content: "形式应该服从内容。", importance: 0.5, sourceOrder: 2, relationToPrevious: "continuation" },
        { id: "flow-2", type: "paragraph", role: "body", content: "强调的价值来自稀缺。", importance: 0.5, sourceOrder: 3, relationToPrevious: "continuation" },
        {
          id: "list", type: "list", role: "steps", content: "1. 理解内容\n2. 强化定位\n3. 改善体验", importance: 0.7, sourceOrder: 4, relationToPrevious: "new-argument",
          structure: { ordered: true, items: [{ ordinal: 1, content: "理解内容" }, { ordinal: 2, content: "强化定位" }, { ordinal: 3, content: "改善体验" }] },
        },
        { id: "flow-3", type: "paragraph", role: "body", content: "清晰的关系能够建立层次。", importance: 0.5, sourceOrder: 5, relationToPrevious: "continuation" },
        {
          id: "table", type: "table", role: "comparison", content: "堆叠式设计 | 秩序式设计\n用更多元素制造丰富感 | 用清晰关系建立层次\n每个模块争夺注意 | 不同模块承担角色", importance: 0.8, sourceOrder: 6, relationToPrevious: "new-argument",
          structure: { mode: "comparison", headers: ["堆叠式设计", "秩序式设计"], rows: [["用更多元素制造丰富感", "用清晰关系建立层次"], ["每个模块争夺注意", "不同模块承担角色"]] },
        },
        { id: "flow-4", type: "paragraph", role: "body", content: "留白为重要内容保留尊严。", importance: 0.6, sourceOrder: 7, relationToPrevious: "continuation" },
        { id: "flow-5", type: "paragraph", role: "body", content: "克制不是单调，而是精准。", importance: 0.6, sourceOrder: 8, relationToPrevious: "continuation" },
        { id: "flow-6", type: "paragraph", role: "body", content: "审美最终会变成生活方式。", importance: 0.6, sourceOrder: 9, relationToPrevious: "continuation" },
        {
          id: "cta", type: "cta", role: "question", content: "留给你的问题\n认真观察一次：\n有哪些东西依然存在，只是因为你从未决定把它删除？", importance: 0.7, sourceOrder: 10, relationToPrevious: "before-ending",
          structure: { eyebrow: "留给你的问题", prompt: "认真观察一次：", highlight: "有哪些东西依然存在，只是因为你从未决定把它删除？" },
        },
      ],
    });
    const reading = createBaselineReadingPlan(document);
    const library = await loadThemeLibrary("forest-order");
    const layout = createLayoutPlan(document, reading, library);
    const result = renderComponentArticle(document, layout, library);

    expect(layout.items.find((item) => item.sourceBlockIds[0] === "table")).toMatchObject({ componentId: "comparison", variantId: "contrast" });
    expect(layout.items.find((item) => item.sourceBlockIds[0] === "cta")).toMatchObject({ componentId: "cta", variantId: "question" });
    expect(result.contentIntegrity.valid).toBe(true);
    expect(result.wechatHtml).toContain("AESTHETICS　•　ORDER");
    expect(result.wechatHtml).toContain("linear-gradient(transparent 72%, #E3D9C6 72%)");
    expect(result.wechatHtml).toContain(">01.</span>");
    expect(result.wechatHtml).toContain("<table");
    expect(result.wechatHtml).toContain("留给你的问题");
    expect(result.wechatHtml).not.toMatch(/data-|<slot\b/iu);
  });
});

async function fixture(file: string): Promise<BlockDocument> {
  return validateBlockDocument(await readJson(file));
}
