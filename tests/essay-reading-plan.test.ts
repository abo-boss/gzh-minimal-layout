import { describe, expect, it } from "vitest";

import { analyzeArticle } from "../src/agent/analyze-article.js";
import { createLayoutPlan } from "../src/presentation/layout-plan.js";
import { renderComponentArticle } from "../src/presentation/component-renderer.js";
import { createEssayReadingPlan } from "../src/reading/essay-reading-plan.js";
import { loadThemeLibraries } from "../src/theme/theme-library.js";

const source = `# 雪山之上，草原之间

文 / 旷野手记

## 一

有些地方，你去过一次，就再也回不去了。

我第一次看见贡嘎山，是在一个阴天的清晨。云层很低，像是压在山腰上睡着了。后来云层突然裂开一条缝，金光打在冰川上。

就那么几秒钟。然后云又合上了。

草原把时间铺到地平线，牧民和候鸟在风里往复，草枯了又绿，雪压了又融。

## 二

雪线以上，没有树木。
风把所有多余的东西都带走了，
只留下岩石，留下冰，
留下云的影子在雪上移动。

我曾经以为，空旷是一种缺失。后来才知道，空旷是一种密度。

然后你会知道：有些地方，你并没有真正离开。

它们只是换了一种方式，住在你身体里某个安静的角落。

写于某次从高原归来的夜里，脑子里还是雪和草。`;

describe("essay reading plan", () => {
  it("uses reading gestures for rhythm without decorating every paragraph", async () => {
    const document = analyzeArticle(source, { sourceId: "snow-mountain", format: "markdown" }).blockDocument;
    const reading = createEssayReadingPlan(document);
    const gestures = new Set(reading.items.map((item) => item.gesture));

    for (const gesture of ["flow", "pause", "pivot", "release"] as const) {
      expect(gestures.has(gesture)).toBe(true);
    }

    for (const library of await loadThemeLibraries()) {
      const layout = createLayoutPlan(document, reading, library);
      const rendered = renderComponentArticle(document, layout, library);

      expect(rendered.contentIntegrity.valid).toBe(true);
      expect(layout.items.filter((item, index) => document.blocks[index]?.type === "paragraph").every((item) => item.componentId === "prose" && item.variantId === "source")).toBe(true);
      const rhythmTokens = new Set(layout.items.map((item) => item.rhythmToken));
      for (const token of ["flow", "break", "turn", "section", "release"] as const) {
        expect(rhythmTokens.has(token)).toBe(true);
      }
    }

  });
});
