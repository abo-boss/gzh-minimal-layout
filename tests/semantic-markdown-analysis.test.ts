import { describe, expect, it } from "vitest";

import { analyzeArticle } from "../src/agent/analyze-article.js";
import { createLayoutPlan } from "../src/presentation/layout-plan.js";
import { renderComponentArticle } from "../src/presentation/component-renderer.js";
import { createBaselineReadingPlan } from "../src/reading/reading-plan.js";
import { loadThemeLibrary } from "../src/theme/theme-library.js";
import { validateBlockDocument } from "../src/validation/schema-validator.js";
import { validateWechatHtml } from "../src/validation/wechat-html-validator.js";

const source = [
  "# 语义完整的排版链路",
  "",
  "导语里有 **重点**、*强调*、==高亮==、++下划线++、~~删除线~~ 和 `代码`。",
  "",
  "## 一、==引用==与证据",
  "",
  "> 一条带有 ==重点== 的引用。",
  "> — 作者",
  "",
  "- 无序==项目==一",
  "- 无序项目二",
  "",
  "```ts",
  "const preserved = true;",
  "```",
  "",
  "![示意图](https://example.com/image.png \"图注\")",
  "",
  "| ==维度== | 结论 |",
  "| --- | --- |",
  "| 解析 | 可审计 |",
  "",
  "---",
].join("\n");

describe("semantic Markdown analysis", () => {
  it("keeps author syntax as typed semantic blocks and source spans", async () => {
    const analysis = analyzeArticle(source, { sourceId: "semantic-markdown", format: "markdown" });
    expect(analysis.sourceManifest.segments.map((segment) => segment.kindHint)).toEqual([
      "heading", "paragraph", "heading", "quote", "list", "code", "image", "table", "divider",
    ]);
    expect(analysis.blockDocument.blocks.map((block) => block.type)).toEqual([
      "article-title", "lead", "heading", "quote", "list", "code", "image", "table", "divider",
    ]);
    expect(analysis.blockDocument.blocks[1]?.marks?.map((mark) => mark.type)).toEqual([
      "strong", "emphasis", "highlight", "underline", "strike", "code",
    ]);
    expect(analysis.blockDocument.blocks[3]?.structure).toMatchObject({
      content: "一条带有 ==重点== 的引用。", hasAttribution: true, attribution: "作者",
    });
    expect(analysis.blockDocument.blocks[6]?.structure).toMatchObject({
      src: "https://example.com/image.png", alt: "示意图", caption: "图注",
    });
    expect(analysis.blockDocument.blocks[7]?.structure).toMatchObject({
      headers: ["==维度==", "结论"], rows: [["解析", "可审计"]],
    });
    expect(validateBlockDocument(analysis.blockDocument, analysis.sourceManifest)).toEqual(analysis.blockDocument);

    const library = await loadThemeLibrary("tuo-digital-efficiency");
    const reading = createBaselineReadingPlan(analysis.blockDocument);
    const layout = createLayoutPlan(analysis.blockDocument, reading, library);
    const rendered = renderComponentArticle(analysis.blockDocument, layout, library);
    expect(rendered.contentIntegrity.valid).toBe(true);
    expect(rendered.wechatHtml).not.toContain("==高亮==");
    expect(rendered.wechatHtml).not.toContain("==维度==");
    expect(rendered.canonicalHtml).toContain("data-inline-mark=\"highlight\"");
    expect(rendered.canonicalHtml).toContain('data-inline-mark="highlight" style="background-color:#ebe8df;color:#333333;font-weight:700"');
    expect(rendered.canonicalHtml).toContain('data-inline-mark="underline" style="border-bottom:2px solid #2c4c3b;padding-bottom:1px;text-decoration:underline"');
    expect(rendered.canonicalHtml).toContain('data-inline-mark="code" style="background-color:#ebe8df;color:#333333;font-family:monospace;border-radius:2px;padding:0 3px"');
    expect(rendered.canonicalHtml.match(/data-inline-mark="highlight"/gu)).toHaveLength(5);
    expect(validateWechatHtml(rendered.wechatHtml)).toMatchObject({ valid: true });
  });
});
