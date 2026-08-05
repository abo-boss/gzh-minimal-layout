import { describe, expect, it } from "vitest";

import { analyzeArticle } from "../src/agent/analyze-article.js";
import { validateArticleProfile, validateBlockDocument, validateSourceManifest } from "../src/validation/schema-validator.js";
import { createBaselineReadingPlan } from "../src/reading/reading-plan.js";
import { createLayoutPlan } from "../src/presentation/layout-plan.js";
import { renderComponentArticle } from "../src/presentation/component-renderer.js";
import { loadThemeLibrary } from "../src/theme/theme-library.js";

const source = [
  "如何用留白，让一篇文章更耐读",
  "",
  "留白不是空出来的地方，而是内容之间用来呼吸、停顿和建立关系的空间。",
  "",
  "一、先判断内容之间是什么关系",
  "",
  "关系越紧密，距离越小；关系越疏远，距离越大。",
  "",
  "小间距，用于标题与副标题；\n中间距，用于普通段落；\n大间距，用于章节切换。",
  "",
  "**真正高级的留白，不是让页面显得空，而是让读者知道在哪里停下来。**",
].join("\n");

describe("raw article analysis", () => {
  it("preserves source segments while deriving semantic Blocks for a theme workflow", async () => {
    const result = analyzeArticle(source, { sourceId: "whitespace-real", format: "plain-text" });
    expect(validateSourceManifest(result.sourceManifest, source)).toEqual(result.sourceManifest);
    expect(validateArticleProfile(result.articleProfile)).toEqual(result.articleProfile);
    expect(validateBlockDocument(result.blockDocument, result.sourceManifest)).toEqual(result.blockDocument);

    expect(result.blockDocument.blocks.map((block) => [block.type, block.role])).toEqual([
      ["article-title", "title"],
      ["lead", "lead"],
      ["heading", "section-heading"],
      ["callout", "explanation"],
      ["list", "steps"],
      ["quote", "key-insight"],
    ]);
    expect(result.blockDocument.blocks[4]?.structure).toMatchObject({ ordered: false });
    expect((result.blockDocument.blocks[4]?.structure as { items: Array<{ content: string }> }).items[0]).toEqual({ content: "小间距，用于标题与副标题；" });

    const library = await loadThemeLibrary("whitespace-journal");
    const reading = createBaselineReadingPlan(result.blockDocument);
    const layout = createLayoutPlan(result.blockDocument, reading, library);
    const rendered = renderComponentArticle(result.blockDocument, layout, library);
    expect(rendered.contentIntegrity.valid).toBe(true);
    expect(rendered.wechatHtml).toContain("真正高级的留白");
    expect(rendered.wechatHtml).not.toContain("**真正高级");
  });
});
