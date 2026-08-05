import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("workflow CLI", () => {
  it("applies Agent analysis and presentation selections through workflow run", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "gzh-workflow-cli-"));
    const selectionsPath = path.join(directory, "selections.json");
    const outputPath = path.join(directory, "article.wechat.html");
    const baselineArtifactsPath = path.join(directory, "baseline-artifacts");
    const artifactsPath = path.join(directory, "artifacts");
    const agentProfilePath = path.join(directory, "agent-profile.json");
    const agentBlocksPath = path.join(directory, "agent-blocks.json");
    const agentReadingPath = path.join(directory, "agent-reading.json");

    try {
      await execFileAsync(
        path.resolve("node_modules/.bin/tsx"),
        [
          "scripts/cli.ts",
          "workflow", "run",
          "--input", "fixtures/agent-workflow/literary-prose/source.md",
          "--mode", "baseline",
          "--theme", "quiet-editorial",
          "--output", outputPath,
          "--artifacts-dir", baselineArtifactsPath,
        ],
        { cwd: process.cwd() },
      );

      const profile = JSON.parse(await readFile(path.join(baselineArtifactsPath, "article-profile.json"), "utf8")) as {
        tone: string[];
      };
      const document = JSON.parse(await readFile(path.join(baselineArtifactsPath, "block-document.json"), "utf8")) as {
        moods: string[];
        blocks: Array<{ id: string; type: string; role: string; importance: number; relationToPrevious?: string }>;
      };
      const reading = JSON.parse(await readFile(path.join(baselineArtifactsPath, "reading-plan.json"), "utf8")) as {
        items: Array<{ blockId: string; gesture: string; emphasisFunction: string; strength: string; reason: string }>;
      };
      profile.tone = ["calm", "reflective"];
      document.moods = [...profile.tone];
      const semanticBlock = document.blocks.find((block) => block.type === "paragraph");
      if (!semanticBlock) throw new Error("fixture must contain a paragraph Block");
      semanticBlock.type = "callout";
      semanticBlock.role = "explanation";
      semanticBlock.importance = 0.8;
      semanticBlock.relationToPrevious = "before-strong-block";
      const readingItem = reading.items.find((item) => item.blockId === semanticBlock.id);
      if (!readingItem) throw new Error("fixture must contain a matching ReadingPlan item");
      readingItem.gesture = "pause";
      readingItem.emphasisFunction = "cognitive";
      readingItem.strength = "medium";
      readingItem.reason = "Agent identified a standalone explanatory principle";
      await Promise.all([
        writeFile(agentProfilePath, JSON.stringify(profile), "utf8"),
        writeFile(agentBlocksPath, JSON.stringify(document), "utf8"),
        writeFile(agentReadingPath, JSON.stringify(reading), "utf8"),
      ]);

      const { stdout: validatedReading } = await execFileAsync(
        path.resolve("node_modules/.bin/tsx"),
        [
          "scripts/cli.ts",
          "reading", "validate",
          "--input", agentReadingPath,
          "--blocks", agentBlocksPath,
        ],
        { cwd: process.cwd() },
      );
      expect(JSON.parse(validatedReading)).toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({ blockId: semanticBlock.id }),
        ]),
      });

      await writeFile(selectionsPath, JSON.stringify([
        {
          blockId: "article-title-001",
          componentId: "masthead",
          variantId: "minimal",
          reason: "CLI regression: use the legal restrained title variant",
        },
      ]), "utf8");

      const { stdout } = await execFileAsync(
        path.resolve("node_modules/.bin/tsx"),
        [
          "scripts/cli.ts",
          "workflow", "run",
          "--input", "fixtures/agent-workflow/literary-prose/source.md",
          "--agent-profile", agentProfilePath,
          "--agent-blocks", agentBlocksPath,
          "--agent-reading", agentReadingPath,
          "--theme", "quiet-editorial",
          "--selections", selectionsPath,
          "--output", outputPath,
          "--artifacts-dir", artifactsPath,
        ],
        { cwd: process.cwd() },
      );

      const summary = JSON.parse(stdout) as { analysisMode: string; contentIntegrity: { valid: boolean } };
      const agentDocument = JSON.parse(await readFile(path.join(artifactsPath, "block-document.json"), "utf8")) as {
        blocks: Array<{ id: string; type: string; role: string }>;
      };
      const agentReading = JSON.parse(await readFile(path.join(artifactsPath, "reading-plan.json"), "utf8")) as {
        items: Array<{ blockId: string; reason: string }>;
      };
      const trace = JSON.parse(await readFile(path.join(artifactsPath, "analysis-trace.json"), "utf8")) as {
        mode: string;
        inputs: Record<string, string>;
      };
      const layout = JSON.parse(await readFile(path.join(artifactsPath, "layout-plan.json"), "utf8")) as {
        items: Array<{ componentId: string; variantId: string; reason: string }>;
      };
      expect(summary.analysisMode).toBe("agent");
      expect(summary.contentIntegrity.valid).toBe(true);
      expect(agentDocument.blocks.find((block) => block.id === semanticBlock.id)).toMatchObject({
        type: "callout",
        role: "explanation",
      });
      expect(agentReading.items.find((item) => item.blockId === semanticBlock.id)?.reason).toBe(
        "Agent identified a standalone explanatory principle",
      );
      expect(trace).toMatchObject({
        mode: "agent",
        inputs: {
          articleProfile: agentProfilePath,
          blockDocument: agentBlocksPath,
          readingPlan: agentReadingPath,
        },
      });
      expect(layout.items[0]).toMatchObject({
        componentId: "masthead",
        variantId: "minimal",
        reason: "CLI regression: use the legal restrained title variant",
      });
      expect(await readFile(outputPath, "utf8")).not.toMatch(/data-|<slot\b/iu);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);
});
