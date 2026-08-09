import { describe, expect, it } from "vitest";

import { loadThemeLibraries } from "../src/theme/theme-library.js";
import { recommendThemes } from "../src/theme/theme-recommendation.js";

describe("theme recommendation", () => {
  it("loads a recommendation profile for all seven registered themes", async () => {
    const libraries = await loadThemeLibraries();
    expect(libraries).toHaveLength(7);
    expect(libraries.every((library) => library.manifest.recommendation.articleTypes.length > 0)).toBe(true);
    expect(libraries.every((library) => library.manifest.recommendation.tones.length > 0)).toBe(true);
    expect(libraries.every((library) => library.manifest.recommendation.structurePatterns.length > 0)).toBe(true);
  });

  it("returns diverse explainable candidates instead of one hard-coded theme", async () => {
    const recommendations = recommendThemes(await loadThemeLibraries(), {
      articleType: "personal-essay",
      tones: ["warm", "reflective", "narrative"],
      structurePattern: "narrative-reflection",
    });
    expect(recommendations).toHaveLength(3);
    expect(new Set(recommendations.map((entry) => entry.themeId)).size).toBe(3);
    expect(recommendations[0]?.reasons).toContain("匹配文章类型：个人随笔");
    expect(recommendations.some((entry) => entry.reasons.some((reason) => reason.includes("匹配文章结构")))).toBe(true);
  });

  it("separates reflective whitespace from structured analysis", async () => {
    const libraries = await loadThemeLibraries();
    const reflective = recommendThemes(libraries, {
      articleType: "personal-essay",
      tones: ["quiet", "reflective", "minimal"],
      structurePattern: "fragmented-prose",
    });
    const analytical = recommendThemes(libraries, {
      articleType: "opinion-knowledge",
      tones: ["analytical", "clear", "structured"],
      structurePattern: "argument-evidence-conclusion",
    });
    expect(reflective[0]?.themeId).toBe("tuo-whitespace-narrative");
    expect(analytical[0]?.themeId).toBe("tuo-insight-logic");
  });
});
