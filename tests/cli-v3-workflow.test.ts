import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { sha256 } from "../src/source/inspect-source.js";

const execFileAsync = promisify(execFile);

describe("portable Host-Agent workflow v3", () => {
  it("validates source fidelity and renders a sparse LayoutDecision", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "gzh-v3-cli-"));
    const decisionPath = path.join(directory, "layout-decision.json");
    const outputPath = path.join(directory, "article.wechat.html");
    const previewPath = path.join(directory, "article.preview.html");
    const sourceContent = [
      "# 走路的人",
      "",
      "走路是最安静的交通方式。",
      "",
      "每个人都可以走路，但很少有人真正注意到脚下的路。",
      "",
      "于是他继续走着。",
    ].join("\n");
    const decision = {
      specVersion: "3.0",
      sourceHash: sha256(sourceContent),
      articleType: "literary-prose",
      tone: ["quiet", "reflective"],
      structurePattern: "narrative-reflection",
      theme: "tuo-whitespace-narrative",
      themeReason: "安静反思的短篇叙事适合石墨留白和克制节奏",
      recipe: "literary-narrative",
      density: "airy",
      blocks: [
        { id: "title-1", type: "article-title", role: "title", content: "# 走路的人", phase: "entry", gesture: "anchor", emphasis: "strong" },
        { id: "lead-1", type: "lead", role: "lead", content: "走路是最安静的交通方式。", phase: "entry", gesture: "flow", emphasis: "medium" },
        { id: "p-1", type: "paragraph", role: "body", content: "每个人都可以走路，但很少有人真正注意到脚下的路。", phase: "body", gesture: "flow", emphasis: "quiet" },
        { id: "end-1", type: "ending", role: "conclusion", content: "于是他继续走着。", phase: "exit", gesture: "release", emphasis: "medium" },
      ],
    };
    const sourcePath = path.join(directory, "source.md");

    try {
      await Promise.all([
        writeFile(decisionPath, JSON.stringify(decision), "utf8"),
        writeFile(sourcePath, sourceContent, "utf8"),
      ]);
      const { stdout } = await runCli([
        "render", "--input", sourcePath, "--decision", decisionPath,
        "--output", outputPath, "--preview", previewPath,
      ]);
      const result = JSON.parse(stdout) as { success: boolean; sourceIntegrity: { valid: boolean }; contentIntegrity: { valid: boolean } };
      expect(result.success).toBe(true);
      expect(result.sourceIntegrity.valid).toBe(true);
      expect(result.contentIntegrity.valid).toBe(true);

      const html = await readFile(outputPath, "utf8");
      expect(html).toContain("走路的人");
      expect(html).not.toMatch(/data-component-id|data-variant-id|<slot\b/iu);
      expect(html).toContain("padding:0 20px 96px");
      const preview = await readFile(previewPath, "utf8");
      expect(preview).toContain("width:375px");
      expect(preview).toContain("一键复制到公众号");
      expect(preview).toContain('id="wechat-copy-source"');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it("writes a copy-ready preview beside the WeChat fragment when --preview is omitted", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "gzh-v3-default-preview-"));
    const source = "# 标题\n\n正文。";
    const sourcePath = path.join(directory, "source.md");
    const decisionPath = path.join(directory, "decision.json");
    const outputPath = path.join(directory, "article.wechat.html");
    const decision = {
      specVersion: "3.0", sourceHash: sha256(source), articleType: "literary-prose", tone: ["quiet"],
      structurePattern: "narrative-reflection", theme: "tuo-whitespace-narrative", themeReason: "安静短文适合留白阅读节奏", recipe: "literary-narrative", density: "airy",
      blocks: [
        { id: "title", type: "article-title", role: "title", content: "# 标题", phase: "entry", gesture: "anchor", emphasis: "strong" },
        { id: "body", type: "paragraph", role: "body", content: "正文。", phase: "body", gesture: "flow", emphasis: "quiet" },
      ],
    };
    try {
      await Promise.all([writeFile(sourcePath, source), writeFile(decisionPath, JSON.stringify(decision))]);
      const { stdout } = await runCli(["render", "--input", sourcePath, "--decision", decisionPath, "--output", outputPath]);
      const result = JSON.parse(stdout) as { preview: string };
      expect(result.preview).toBe(path.join(directory, "article.wechat.preview.html"));
      expect(await readFile(result.preview, "utf8")).toContain("一键复制到公众号");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it("rejects omitted source text and illegal component choices", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "gzh-v3-invalid-"));
    const source = "# 标题\n\n第一段。\n\n第二段。";
    const sourcePath = path.join(directory, "source.md");
    const decisionPath = path.join(directory, "decision.json");
    const decision = {
      specVersion: "3.0",
      sourceHash: sha256(source),
      articleType: "opinion-knowledge",
      structurePattern: "argument-evidence-conclusion",
      theme: "tuo-insight-logic",
      themeReason: "理性观点文章采用冷峻结构以强化论证层级",
      recipe: "opinion-analysis",
      density: "balanced",
      blocks: [
        { id: "title", type: "article-title", role: "title", content: "# 标题", phase: "entry", gesture: "anchor", emphasis: "strong" },
        { id: "p1", type: "paragraph", role: "argument", content: "第一段。", phase: "body", gesture: "flow", emphasis: "quiet", component: "focus", variant: "missing", reason: "核心判断" },
      ],
    };
    try {
      await Promise.all([writeFile(sourcePath, source), writeFile(decisionPath, JSON.stringify(decision))]);
      const result = await runCli(["validate", "--input", sourcePath, "--decision", decisionPath]).catch((error) => error as { stdout: string });
      const payload = JSON.parse(result.stdout) as { success: boolean; errors: string[] };
      expect(payload.success).toBe(false);
      expect(payload.errors.join("\n")).toMatch(/Source integrity validation failed|illegal selection/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 10_000);

  it("exposes source facts, recipes, themes, and advisory baseline through inspect", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "gzh-v3-inspect-"));
    const sourcePath = path.join(directory, "source.md");
    try {
      await writeFile(sourcePath, "# 标题\n\n正文。", "utf8");
      const { stdout } = await runCli(["inspect", "--input", sourcePath]);
      const payload = JSON.parse(stdout) as { success: boolean; data: { source: { hash: string }; recipes: unknown[]; themes: unknown[]; baseline: { advisoryOnly: boolean } } };
      expect(payload.success).toBe(true);
      expect(payload.data.source.hash).toMatch(/^sha256:/);
      expect(payload.data.recipes.length).toBeGreaterThan(1);
      expect(payload.data.themes).toHaveLength(7);
      expect(payload.data.baseline.advisoryOnly).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 10_000);
});

function runCli(args: string[]) {
  return execFileAsync(path.resolve("node_modules/.bin/tsx"), ["scripts/cli.ts", ...args], { cwd: process.cwd() });
}
