import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("workflow CLI v2", () => {
  it("renders WeChat HTML from a LayoutDecision", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "gzh-v2-cli-"));
    const decisionPath = path.join(directory, "layout-decision.json");
    const outputPath = path.join(directory, "article.wechat.html");
    const previewPath = path.join(directory, "article.preview.html");

    try {
      const decision = {
        specVersion: "2.0",
        articleType: "literary-prose",
        tone: ["calm", "reflective"],
        theme: "quiet-editorial",
        density: "balanced",
        blocks: [
          {
            id: "title-1",
            type: "article-title",
            content: "走路的人",
            component: "masthead",
            variant: "minimal",
            phase: "entry",
            gesture: "anchor",
            emphasis: "strong",
          },
          {
            id: "p-1",
            type: "lead",
            content: "走路是最安静的交通方式。",
            component: "prose",
            variant: "lead",
            phase: "entry",
            gesture: "flow",
            emphasis: "medium",
          },
          {
            id: "p-2",
            type: "paragraph",
            content: "每个人都可以走路，但很少有人真正注意到脚下的路。",
            component: "prose",
            variant: "body",
            phase: "body",
            gesture: "flow",
            emphasis: "quiet",
          },
          {
            id: "end-1",
            type: "ending",
            content: "于是他继续走着。",
            component: "ending",
            variant: "release",
            phase: "exit",
            gesture: "release",
            emphasis: "medium",
          },
        ],
      };

      const sourceContent = [
        "# 走路的人",
        "",
        "走路是最安静的交通方式。",
        "",
        "每个人都可以走路，但很少有人真正注意到脚下的路。",
        "",
        "于是他继续走着。",
      ].join("\n");

      const sourcePath = path.join(directory, "source.md");
      await Promise.all([
        writeFile(decisionPath, JSON.stringify(decision), "utf8"),
        writeFile(sourcePath, sourceContent, "utf8"),
      ]);

      const { stdout } = await execFileAsync(
        path.resolve("node_modules/.bin/tsx"),
        [
          "scripts/cli.ts",
          "render",
          "--input", sourcePath,
          "--decision", decisionPath,
          "--output", outputPath,
          "--preview", previewPath,
        ],
        { cwd: process.cwd() },
      );

      const result = JSON.parse(stdout) as {
        success: boolean;
        theme: string;
        blockCount: number;
        contentIntegrity: { valid: boolean };
      };

      expect(result.success).toBe(true);
      expect(result.theme).toBe("quiet-editorial");
      expect(result.blockCount).toBe(4);
      expect(result.contentIntegrity.valid).toBe(true);

      const html = await readFile(outputPath, "utf8");
      expect(html).not.toMatch(/data-component-id|data-variant-id|<slot\b/iu);
      expect(html).toContain("走路的人");
      expect(html).toContain("走路是最安静的交通方式");
      expect(html).toContain("于是他继续走着");

      const preview = await readFile(previewPath, "utf8");
      expect(preview).toContain("走路的人");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it("validates LayoutDecision component legality", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "gzh-v2-validate-"));
    const decisionPath = path.join(directory, "decision.json");

    try {
      const invalidDecision = {
        specVersion: "2.0",
        articleType: "opinion-knowledge",
        theme: "quiet-editorial",
        density: "balanced",
        blocks: [
          {
            id: "t-1",
            type: "article-title",
            content: "测试",
            component: "masthead",
            variant: "nonexistent-variant",
          },
        ],
      };

      await writeFile(decisionPath, JSON.stringify(invalidDecision), "utf8");

      const { stdout } = await execFileAsync(
        path.resolve("node_modules/.bin/tsx"),
        ["scripts/cli.ts", "validate", "--decision", decisionPath],
        { cwd: process.cwd() },
      ).catch((err) => err);

      const result = JSON.parse(stdout) as { success: boolean; errors: string[] };
      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain("nonexistent-variant");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 10_000);

  it("lists available themes", async () => {
    const { stdout } = await execFileAsync(
      path.resolve("node_modules/.bin/tsx"),
      ["scripts/cli.ts", "themes"],
      { cwd: process.cwd() },
    );

    const result = JSON.parse(stdout) as {
      success: boolean;
      themes: Array<{ id: string; recommendation: { articleTypes: string[] } }>;
    };
    expect(result.success).toBe(true);
    expect(result.themes.length).toBeGreaterThanOrEqual(11);
    expect(result.themes.map((t) => t.id)).toContain("quiet-editorial");
    expect(result.themes.find((theme) => theme.id === "cobalt-essay")?.recommendation.articleTypes).toContain("literary-prose");
  }, 10_000);

  it("ranks explainable theme candidates instead of returning a single default", async () => {
    const { stdout } = await execFileAsync(
      path.resolve("node_modules/.bin/tsx"),
      [
        "scripts/cli.ts",
        "recommend",
        "--article-type", "literary-prose",
        "--tone", "cool,reflective,minimal",
        "--structure", "fragmented-prose",
      ],
      { cwd: process.cwd() },
    );

    const result = JSON.parse(stdout) as {
      success: boolean;
      recommendations: Array<{ themeId: string; score: number; reasons: string[] }>;
    };
    expect(result.success).toBe(true);
    expect(result.recommendations).toHaveLength(3);
    expect(result.recommendations[0]).toMatchObject({ themeId: "cobalt-essay" });
    expect(result.recommendations[0]?.reasons).toContain("匹配语气：cool");
    expect(result.recommendations[0]!.score).toBeGreaterThan(result.recommendations[1]!.score);
  }, 10_000);
});
