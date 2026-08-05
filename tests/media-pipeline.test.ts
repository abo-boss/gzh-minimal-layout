import { describe, expect, it } from "vitest";

import { createLayoutPlan } from "../src/presentation/layout-plan.js";
import { renderComponentArticle } from "../src/presentation/component-renderer.js";
import { createBaselineReadingPlan } from "../src/reading/reading-plan.js";
import { loadThemeLibrary } from "../src/theme/theme-library.js";
import type { AssetManifest, ImagePlan } from "../src/contracts/media.js";
import { resolveImagePlan } from "../src/media/image-plan.js";
import { validateAssetManifest, validateBlockDocument, validateImagePlan, validateReadingPlan } from "../src/validation/schema-validator.js";
import { readJson } from "./helpers.js";

describe("AI image plan pipeline", () => {
  it("renders ready visual assets around an anchored block without changing content integrity", async () => {
    const document = validateBlockDocument(await readJson("fixtures/agent-workflow/literary-prose/block-document.json"));
    const reading = validateReadingPlan(createBaselineReadingPlan(document));
    const library = await loadThemeLibrary("quiet-editorial");
    const layout = createLayoutPlan(document, reading, library);
    const imagePlan = validateImagePlan({
      specVersion: "1.0",
      id: "literary-image-plan",
      documentId: document.id,
      items: [{
        id: "visual-001",
        anchorBlockId: "block-003",
        placement: "after",
        purpose: "inline",
        prompt: "A quiet editorial illustration of curtains moving in afternoon light",
        alt: "午后光线中的窗帘",
        aspectRatio: "3:4",
        assetId: "asset-001",
        reason: "给叙事转折增加一次视觉停顿",
      }],
    });
    const assetManifest = validateAssetManifest({
      specVersion: "1.0",
      id: "literary-assets",
      documentId: document.id,
      assets: [{
        id: "asset-001",
        kind: "generated",
        status: "ready",
        url: "https://cdn.example.test/literary-visual.png",
        localPath: "/tmp/literary-visual.png",
        mimeType: "image/png",
        width: 1024,
        height: 1365,
      }],
    });

    expect(resolveImagePlan(document, imagePlan, assetManifest)).toHaveLength(1);
    const result = renderComponentArticle(document, layout, library, { imagePlan, assetManifest });

    expect(result.wechatHtml).toContain("https://cdn.example.test/literary-visual.png");
    expect(result.wechatHtml).toContain('alt="午后光线中的窗帘"');
    expect(result.wechatHtml).not.toMatch(/data-visual-asset/iu);
    expect(result.contentIntegrity.valid).toBe(true);
  });

  it("fails closed when an image plan references an unknown block or unsafe asset URL", async () => {
    const document = validateBlockDocument(await readJson("fixtures/agent-workflow/literary-prose/block-document.json"));
    const imagePlan: ImagePlan = {
      specVersion: "1.0",
      id: "invalid-image-plan",
      documentId: document.id,
      items: [{
        id: "visual-001",
        anchorBlockId: "missing-block",
        placement: "before",
        purpose: "lead",
        prompt: "A lead image",
        alt: "lead image",
        aspectRatio: "16:9",
        assetId: "asset-001",
        reason: "test",
      }],
    };
    const assetManifest: AssetManifest = {
      specVersion: "1.0",
      id: "invalid-assets",
      documentId: document.id,
      assets: [{ id: "asset-001", kind: "generated", status: "ready", url: "javascript:alert(1)" }],
    };

    expect(() => resolveImagePlan(document, imagePlan, assetManifest)).toThrow(/unsafe URI|unknown block/iu);
  });
});
