import { describe, expect, it } from "vitest";

import { loadThemeLibraries } from "../src/theme/theme-library.js";
import { recommendThemes } from "../src/theme/theme-recommendation.js";

describe("theme recommendation", () => {
  it("loads a recommendation profile for every registered theme", async () => {
    const libraries = await loadThemeLibraries();

    expect(libraries).toHaveLength(11);
    expect(libraries.every((library) => library.manifest.recommendation.articleTypes.length > 0)).toBe(true);
    expect(libraries.every((library) => library.manifest.recommendation.tones.length > 0)).toBe(true);
    expect(libraries.every((library) => library.manifest.recommendation.structurePatterns.length > 0)).toBe(true);
  });

  it("ranks a cool, reflective fragmented prose piece toward cobalt-essay", async () => {
    const recommendations = recommendThemes(await loadThemeLibraries(), {
      articleType: "literary-prose",
      tones: ["cool", "reflective", "minimal"],
      structurePattern: "fragmented-prose",
    });

    expect(recommendations.map((recommendation) => recommendation.themeId)).toEqual([
      "cobalt-essay",
      "minimal-magazine",
      "moss-staircase",
    ]);
    expect(recommendations[0]?.reasons).toContain("匹配文章类型：文学散文");
    expect(recommendations[0]?.reasons).toContain("匹配文章结构：片段散文");
  });

  it("separates warm narrative prose from literary handmade prose", async () => {
    const libraries = await loadThemeLibraries();
    const warmNarrative = recommendThemes(libraries, {
      articleType: "literary-prose",
      tones: ["warm", "reflective", "narrative"],
      structurePattern: "narrative-reflection",
    });
    const handmadeLiterary = recommendThemes(libraries, {
      articleType: "literary-prose",
      tones: ["literary", "handmade", "narrative"],
      structurePattern: "narrative-reflection",
    });

    expect(warmNarrative[0]?.themeId).toBe("whitespace-journal");
    expect(handmadeLiterary[0]?.themeId).toBe("brick-literary");
    expect(new Set(warmNarrative.map((recommendation) => recommendation.themeId)).size).toBe(3);
  });
});
