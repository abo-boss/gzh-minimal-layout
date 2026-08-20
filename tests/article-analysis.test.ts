import { describe, expect, it } from "vitest";

import { analyzeArticle } from "../src/agent/analyze-article.js";
import { DEFAULT_INLINE_MARK_BUDGET } from "../src/contracts/presentation.js";
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
  it("recognizes Markdown-only ordinal lines as section headings", () => {
    const result = analyzeArticle(
      "# 雪山之上，草原之间\n\n## 一\n\n雪线以上，没有树木。",
      { sourceId: "ordinal-markdown-heading", format: "markdown" },
    );

    expect(result.blockDocument.blocks.map((block) => [block.type, block.role])).toEqual([
      ["article-title", "title"],
      ["heading", "section-heading"],
      ["paragraph", "body"],
    ]);
    expect(result.blockDocument.blocks[1]?.structure).toMatchObject({
      hasMarker: true,
      marker: "一",
      ordinal: 1,
      title: "一",
    });
  });

  it("preserves source segments while deriving semantic Blocks for a theme workflow", async () => {
    const result = analyzeArticle(source, { sourceId: "whitespace-real", format: "plain-text" });
    expect(validateSourceManifest(result.sourceManifest, source)).toEqual(result.sourceManifest);
    expect(validateArticleProfile(result.articleProfile)).toEqual(result.articleProfile);
    expect(validateBlockDocument(result.blockDocument, result.sourceManifest)).toEqual(result.blockDocument);

    expect(result.blockDocument.blocks.map((block) => [block.type, block.role])).toEqual([
      ["article-title", "title"],
      ["lead", "lead"],
      ["heading", "section-heading"],
      ["paragraph", "body"],
      ["paragraph", "body"],
      ["quote", "key-insight"],
    ]);
    expect(result.blockDocument.blocks[4]?.content).toBe("小间距，用于标题与副标题；\n中间距，用于普通段落；\n大间距，用于章节切换。");

    const library = await loadThemeLibrary("tuo-whitespace-narrative");
    const reading = createBaselineReadingPlan(result.blockDocument);
    const layout = createLayoutPlan(result.blockDocument, reading, library);
    const rendered = renderComponentArticle(result.blockDocument, layout, library);
    expect(rendered.contentIntegrity.valid).toBe(true);
    expect(rendered.wechatHtml).toContain("真正高级的留白");
    expect(rendered.wechatHtml).not.toContain("**真正高级");
  });

  it("splits raw line-based prose into reading groups without inventing lists or losing the final heading", () => {
    const infpSource = [
      "INFP想持续成长，先建立自己的系统",
      "",
      "刚开始都很有动力。",
      "早起、运动、读书、写作，恨不得一次把整个时间都安排得明明白白。",
      "可时间一长，这些振兴计划开始慢慢停了。",
      "收藏的内容越来越多，真正做完的事情却没有增加。",
      "最难受的是，我们明明花了很多时间想要成长，生活却很少发生变化。",
      "于是又开始怀疑自己：",
      "难道是我还不够自律？",
      "难道是执行力太差？拖延症又犯了。",
      "三分热度又来了？",
      "",
      "01｜为什么我们学了很多，依然没有改变",
      "",
      "我早期做自媒体时，试过很多方法。",
      "蹭热点、剪视频、模仿爆款、追数据，甚至还买过粉。",
      "看到什么火，就赶紧学什么。",
      "别人用什么方法，我也想试一下。",
      "",
      "最后",
      "",
      "我现在依然有很多兴趣，也依然会冒出新的想法。",
      "它能不能变成一个作品？",
      "能不能带来真实反馈？",
      "能不能让过去学过的东西继续生长？",
    ].join("\n");
    const result = analyzeArticle(infpSource, { sourceId: "infp-reading-groups", format: "plain-text" });

    expect(validateBlockDocument(result.blockDocument, result.sourceManifest)).toEqual(result.blockDocument);
    expect(result.blockDocument.blocks.some((block) => block.type === "list")).toBe(false);
    expect(result.blockDocument.blocks.find((block) => block.content === "最后")).toMatchObject({
      type: "heading",
      role: "section-heading",
      sectionId: "conclusion",
    });
    expect(result.blockDocument.blocks.find((block) => block.role === "question-set")?.content).toBe([
      "于是又开始怀疑自己：",
      "难道是我还不够自律？",
      "难道是执行力太差？拖延症又犯了。",
      "三分热度又来了？",
    ].join("\n"));
    expect(result.blockDocument.blocks.find((block) => block.role === "lead")?.content).toBe([
      "刚开始都很有动力。",
      "早起、运动、读书、写作，恨不得一次把整个时间都安排得明明白白。",
    ].join("\n"));
  });

  it("projects plain-text subtopics to H3 and keeps a sparse semantic focus", async () => {
    const result = analyzeArticle([
      "建立个人系统",
      "",
      "01｜先建立回路",
      "",
      "持续成长，需要一套能够积累、反馈和修正的个人系统。",
      "第一，确定自己到底想积累什么。",
      "围绕一个目标行动，才会留下积累。",
    ].join("\n"), { sourceId: "semantic-subtopic-focus", format: "plain-text" });
    const h3 = result.blockDocument.blocks.find((block) => block.level === 3);
    const focus = result.blockDocument.blocks.find((block) => block.role === "key-insight");

    expect(h3).toMatchObject({ type: "heading", role: "subtopic", content: "第一，确定自己到底想积累什么。" });
    expect(focus).toMatchObject({ type: "paragraph", role: "key-insight", content: "持续成长，需要一套能够积累、反馈和修正的个人系统。" });

    const library = await loadThemeLibrary("tuo-whitespace-narrative");
    const layout = createLayoutPlan(result.blockDocument, createBaselineReadingPlan(result.blockDocument), library, { recipe: "essay-reflection" });
    expect(layout.items.find((item) => item.sourceBlockIds[0] === h3!.id)).toMatchObject({ componentId: "subheading" });
    expect(layout.items.find((item) => item.sourceBlockIds[0] === focus!.id)).toMatchObject({ componentId: "focus" });
  });

  it("uses a paragraph-local inline-mark budget for defensible data and concepts", () => {
    const result = analyzeArticle([
      "把想法做成作品",
      "",
      "01｜开始行动",
      "",
      "这一次，我直接把网站上线设成了目标结果。",
      "不会的地方就学，卡住的地方就用AI协助解决。",
      "我用了7天业余时间，把网站真正做了出来。",
    ].join("\n"), { sourceId: "inline-mark-budget", format: "plain-text" });
    const body = result.blockDocument.blocks.find((block) => block.role === "body")!;

    expect(body.content).toContain("我用了7天业余时间");
    expect(body.marks).toEqual([
      { type: "strong", start: body.content.indexOf("目标结果"), end: body.content.indexOf("目标结果") + 4 },
      { type: "strong", start: body.content.indexOf("AI协助解决"), end: body.content.indexOf("AI协助解决") + 6 },
      { type: "highlight", start: body.content.indexOf("7天"), end: body.content.indexOf("7天") + 2 },
      { type: "strong", start: body.content.indexOf("网站真正做了出来"), end: body.content.indexOf("网站真正做了出来") + 8 },
    ]);
    expect(new Set(body.marks?.map((mark) => mark.type)).size).toBeLessThanOrEqual(2);
    expect(body.marks).toHaveLength(4);
    expect(body.marks?.filter((mark) => mark.type === "strong").every((mark) => Array.from(body.content.slice(mark.start, mark.end)).length >= 3)).toBe(true);
  });

  it("uses the selected theme's inline-mark budget instead of a hidden global quota", () => {
    const source = [
      "把想法做成作品",
      "",
      "01｜开始行动",
      "",
      "我用了7天业余时间，把网站真正做了出来。",
    ].join("\n");
    const result = analyzeArticle(source, {
      sourceId: "theme-inline-budget",
      format: "plain-text",
      inlineMarkBudget: { ...DEFAULT_INLINE_MARK_BUDGET, maxPerParagraph: 1 },
    });
    const body = result.blockDocument.blocks.find((block) => block.role === "body")!;

    expect(body.marks).toEqual([
      { type: "highlight", start: body.content.indexOf("7天"), end: body.content.indexOf("7天") + 2 },
    ]);
  });
});
