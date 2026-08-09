import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { generateThemeGallery } from "../scripts/generate-theme-gallery.js";

describe("theme gallery", () => {
  it("renders one real clean preview for every registered theme", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "gzh-theme-gallery-"));

    try {
      const result = await generateThemeGallery(directory);
      const gallery = await readFile(result.galleryPath, "utf8");
      const previews = await Promise.all(result.previewPaths.map((previewPath) => readFile(previewPath, "utf8")));

      expect(result.previewPaths).toHaveLength(7);
      expect(gallery).toContain("7 套主题，");
      expect((gallery.match(/class="theme-card"/gu) ?? [])).toHaveLength(7);
      expect(previews.every((preview) => preview.includes("一篇文章如何慢下来"))).toBe(true);
      expect(previews.every((preview) => !preview.includes("data-debug-only"))).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
