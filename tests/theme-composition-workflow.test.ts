import { describe, expect, it } from "vitest";

import { analyzeArticle } from "../src/agent/analyze-article.js";
import { defaultCandidateForBlock } from "../src/presentation/layout-plan.js";
import { createBaselineReadingPlan } from "../src/reading/reading-plan.js";
import { loadThemeLibraries, candidatesFor } from "../src/theme/theme-library.js";

describe("theme composition workflow", () => {
  it("makes every registered theme declare executable recipes and semantic mappings", async () => {
    const themes = await loadThemeLibraries();
    expect(themes).toHaveLength(7);
    for (const theme of themes) {
      expect(theme.manifest.composition.structureModel.length).toBeGreaterThan(12);
      expect(theme.manifest.composition.recipes.length).toBeGreaterThan(0);
      expect(theme.manifest.composition.mappings.length).toBeGreaterThan(8);
      for (const mapping of theme.manifest.composition.mappings) {
        expect(theme.components.some((component) => component.id === mapping.componentId)).toBe(true);
      }
    }
  });

  it("uses a theme-owned mapping rather than a renderer-owned theme-id branch", async () => {
    const source = "# 标题\n\n开场。\n\n一、章节\n\n正文。";
    const document = analyzeArticle(source, { sourceId: "composition-test", format: "markdown" }).blockDocument;
    const plan = createBaselineReadingPlan(document);
    const theme = (await loadThemeLibraries()).find((entry) => entry.manifest.id === "tuo-quiet-lifestyle");
    if (!theme) throw new Error("expected quiet lifestyle theme");
    const headingIndex = document.blocks.findIndex((block) => block.type === "heading");
    const block = document.blocks[headingIndex]!;
    const candidates = candidatesFor(block, plan.items[headingIndex]!, theme);
    const selected = defaultCandidateForBlock(block, candidates, theme, "essay-reflection");
    expect(selected.componentId).toBe("heading");
    expect(theme.manifest.composition.mappings.some((mapping) => mapping.componentId === selected.componentId && mapping.blockTypes.includes(block.type))).toBe(true);
  });
});
