import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BlockDocument } from "../src/contracts/block-document.js";
import type { AssetManifest, ImagePlan } from "../src/contracts/media.js";
import type { AgentLayoutSelection, RhythmDensity } from "../src/contracts/presentation.js";
import { createLayoutPlan, assertLayoutPlan } from "../src/presentation/layout-plan.js";
import { renderComponentArticle } from "../src/presentation/component-renderer.js";
import { resolveImagePlan } from "../src/media/image-plan.js";
import { createBaselineReadingPlan, assertReadingPlan } from "../src/reading/reading-plan.js";
import { inspectSource, sha256 } from "../src/source/inspect-source.js";
import type { SourceFormat, SourceSegmentationMode } from "../src/source/source-manifest.js";
import { analyzeArticle } from "../src/agent/analyze-article.js";
import { assertAgentAnalysisBundle } from "../src/agent/agent-analysis-bundle.js";
import { createCandidateCatalog, loadThemeLibrary } from "../src/theme/theme-library.js";
import {
  validateArticleProfile,
  validateAssetManifest,
  validateBlockDocument,
  validateCandidateCatalog,
  validateImagePlan,
  validateLayoutPlan,
  validateReadingPlan,
  validateSourceManifest,
} from "../src/validation/schema-validator.js";

const [domain, action, ...args] = process.argv.slice(2);
const options = parseOptions(args);

try {
  if (domain === "source" && action === "inspect") {
    const input = required("input");
    const source = await readFile(path.resolve(input), "utf8");
    const format = (options.format ?? (input.endsWith(".md") ? "markdown" : "plain-text")) as SourceFormat;
    const segmentation = (options.segmentation ?? "auto") as SourceSegmentationMode;
    await outputJson(validateSourceManifest(inspectSource(source, {
      sourceId: options["source-id"] ?? safeId(path.basename(input, path.extname(input))),
      format,
      segmentation,
    }), source));
  } else if (domain === "profile" && action === "validate") {
    await outputJson(validateArticleProfile(await readJson(required("input"))));
  } else if (domain === "blocks" && action === "validate") {
    const manifest = options["source-manifest"]
      ? validateSourceManifest(await readJson(options["source-manifest"]))
      : undefined;
    await outputJson(validateBlockDocument(await readJson(required("input")), manifest));
  } else if (domain === "workflow" && action === "run") {
    const input = required("input");
    const source = await readFile(path.resolve(input), "utf8");
    const format = (options.format ?? (input.endsWith(".md") ? "markdown" : "plain-text")) as SourceFormat;
    const sourceId = options["source-id"] ?? safeId(path.basename(input, path.extname(input)));
    const mode = parseWorkflowMode(options.mode);
    const agentAnalysis = parseAgentAnalysisOptions(options);
    if (mode === "agent" && !agentAnalysis) {
      throw new Error("Agent mode is the default. Provide --agent-profile, --agent-blocks and --agent-reading, or use --mode baseline for discovery only.");
    }
    if (mode === "baseline" && agentAnalysis) {
      throw new Error("Baseline mode cannot accept --agent-profile, --agent-blocks or --agent-reading");
    }
    const baseline = mode === "baseline" ? analyzeArticle(source, { sourceId, format }) : undefined;
    const sourceManifest = validateSourceManifest(
      baseline?.sourceManifest ?? inspectSource(source, { sourceId, format }),
      source,
    );
    const articleProfile = validateArticleProfile(
      agentAnalysis ? await readJson(agentAnalysis.profile) : baseline!.articleProfile,
    );
    const document = validateBlockDocument(
      agentAnalysis ? await readJson(agentAnalysis.blocks) : baseline!.blockDocument,
      sourceManifest,
    );
    const media = await readMediaInputs(options, document, sourceManifest.contentHash);
    const reading = agentAnalysis
      ? validateReadingPlan(await readJson(agentAnalysis.reading))
      : createBaselineReadingPlan(document);
    if (agentAnalysis) {
      assertAgentAnalysisBundle({ sourceManifest, articleProfile, blockDocument: document, readingPlan: reading });
    } else {
      assertReadingPlan(document, reading);
    }
    const analysisTrace = {
      specVersion: "1.0",
      mode,
      sourceId,
      sourceHash: sourceManifest.contentHash,
      blockCount: document.blocks.length,
      segmentationDecisionCount: document.segmentationDecisions?.length ?? 0,
      contractHashes: {
        articleProfile: sha256(JSON.stringify(articleProfile)),
        blockDocument: sha256(JSON.stringify(document)),
        readingPlan: sha256(JSON.stringify(reading)),
      },
      ...(media
        ? {
            mediaHashes: {
              imagePlan: sha256(JSON.stringify(media.imagePlan)),
              assetManifest: sha256(JSON.stringify(media.assetManifest)),
            },
          }
        : {}),
      ...(agentAnalysis
        ? {
            inputs: {
              articleProfile: path.resolve(agentAnalysis.profile),
              blockDocument: path.resolve(agentAnalysis.blocks),
              readingPlan: path.resolve(agentAnalysis.reading),
            },
          }
        : {}),
    };
    const library = await loadThemeLibrary(options.theme ?? "quiet-editorial");
    const candidates = validateCandidateCatalog(createCandidateCatalog(document, reading, library));
    const selections = options.selections ? parseSelections(await readJson(options.selections)) : undefined;
    const layout = createLayoutPlan(document, reading, library, {
      ...(options.density ? { density: parseDensity(options.density) } : {}),
      ...(selections ? { selections } : {}),
    });
    assertLayoutPlan(document, reading, layout, library);
    const result = renderComponentArticle(document, layout, library, media ? {
      imagePlan: media.imagePlan,
      assetManifest: media.assetManifest,
      expectedSourceHash: sourceManifest.contentHash,
    } : undefined);
    const output = await writeOutput(required("output"), result.wechatHtml);
    const preview = options.preview ? await writeOutput(options.preview, result.previewHtml) : undefined;
    const cleanPreview = options["clean-preview"] ? await writeOutput(options["clean-preview"], result.cleanPreviewHtml) : undefined;
    const artifacts = options["artifacts-dir"]
      ? await writeWorkflowArtifacts(options["artifacts-dir"], {
        sourceManifest,
        articleProfile,
        blockDocument: document,
        readingPlan: reading,
        analysisTrace,
        candidates,
        layoutPlan: layout,
        ...(media ? { imagePlan: media.imagePlan, assetManifest: media.assetManifest } : {}),
      })
      : undefined;
    process.stdout.write(JSON.stringify({
      output,
      ...(preview ? { preview } : {}),
      ...(cleanPreview ? { cleanPreview } : {}),
      ...(artifacts ? { artifacts } : {}),
      sourceId,
      analysisMode: analysisTrace.mode,
      theme: library.manifest.id,
      density: layout.density,
      visualAssetCount: media?.imagePlan.items.length ?? 0,
      contentIntegrity: result.contentIntegrity,
    }, null, 2) + "\n");
  } else if (domain === "reading" && action === "validate") {
    const document = validateBlockDocument(await readJson(required("blocks")));
    const reading = validateReadingPlan(await readJson(required("input")));
    assertReadingPlan(document, reading);
    await outputJson(reading);
  } else if (domain === "reading" && action === "plan") {
    const document = validateBlockDocument(await readJson(required("blocks")));
    await outputJson(createBaselineReadingPlan(document));
  } else if (domain === "media" && action === "validate") {
    const document = validateBlockDocument(await readJson(required("blocks")));
    const imagePlan = validateImagePlan(await readJson(required("plan")));
    const assetManifest = validateAssetManifest(await readJson(required("asset-manifest")));
    resolveImagePlan(document, imagePlan, assetManifest);
    await outputJson({ imagePlan, assetManifest });
  } else if (domain === "theme" && action === "inspect") {
    const library = await loadThemeLibrary(options.theme ?? "quiet-editorial");
    await outputJson({
      manifest: library.manifest,
      components: library.components.map((component) => ({
        id: component.id,
        kind: component.kind,
        accepts: component.accepts,
        variants: component.variants.map(({ id, label, priority, visualWeight, surface, accepts }) => ({
          id,
          label,
          priority,
          visualWeight,
          surface,
          ...(accepts ? { accepts } : {}),
        })),
      })),
    });
  } else if (domain === "layout" && action === "candidates") {
    const document = validateBlockDocument(await readJson(required("blocks")));
    const reading = options.reading
      ? validateReadingPlan(await readJson(options.reading))
      : createBaselineReadingPlan(document);
    assertReadingPlan(document, reading);
    const library = await loadThemeLibrary(options.theme ?? "quiet-editorial");
    await outputJson(validateCandidateCatalog(createCandidateCatalog(document, reading, library)));
  } else if (domain === "layout" && action === "plan") {
    const document = validateBlockDocument(await readJson(required("blocks")));
    const reading = options.reading
      ? validateReadingPlan(await readJson(options.reading))
      : createBaselineReadingPlan(document);
    assertReadingPlan(document, reading);
    const library = await loadThemeLibrary(options.theme ?? "quiet-editorial");
    const selections = options.selections ? parseSelections(await readJson(options.selections)) : undefined;
    await outputJson(createLayoutPlan(document, reading, library, {
      ...(options.density ? { density: parseDensity(options.density) } : {}),
      ...(selections ? { selections } : {}),
    }));
  } else if (domain === "wechat" && action === "render") {
    const document = validateBlockDocument(await readJson(required("blocks")));
    const media = await readMediaInputs(options, document);
    const reading = options.reading
      ? validateReadingPlan(await readJson(options.reading))
      : createBaselineReadingPlan(document);
    assertReadingPlan(document, reading);
    const library = await loadThemeLibrary(options.theme ?? "quiet-editorial");
    const selections = options.selections ? parseSelections(await readJson(options.selections)) : undefined;
    const layout = options.layout
      ? validateLayoutPlan(await readJson(options.layout))
      : createLayoutPlan(document, reading, library, {
        ...(options.density ? { density: parseDensity(options.density) } : {}),
        ...(selections ? { selections } : {}),
      });
    assertLayoutPlan(document, reading, layout, library);
    const result = renderComponentArticle(document, layout, library, media ? {
      imagePlan: media.imagePlan,
      assetManifest: media.assetManifest,
    } : undefined);
    const output = await writeOutput(required("output"), result.wechatHtml);
    const cleanPreview = options["clean-preview"] ? await writeOutput(options["clean-preview"], result.cleanPreviewHtml) : undefined;
    const preview = options.preview ? await writeOutput(options.preview, result.previewHtml) : undefined;
    process.stdout.write(JSON.stringify({
      output,
      ...(preview ? { preview } : {}),
      ...(cleanPreview ? { cleanPreview } : {}),
      theme: library.manifest.id,
      density: layout.density,
      visualAssetCount: media?.imagePlan.items.length ?? 0,
      contentIntegrity: result.contentIntegrity,
    }, null, 2) + "\n");
  } else {
    throw new Error(`Unknown command: ${[domain, action].filter(Boolean).join(" ")}\n${usage()}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseOptions(values: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    result[key] = !next || next.startsWith("--") ? "true" : next;
    if (next && !next.startsWith("--")) index += 1;
  }
  return result;
}

function required(name: string): string {
  const value = options[name];
  if (!value) throw new Error(`Missing required option --${name}`);
  return value;
}

function parseDensity(value: string): RhythmDensity {
  if (value !== "dense" && value !== "balanced" && value !== "airy") {
    throw new Error(`Unknown density ${value}`);
  }
  return value;
}

function parseSelections(input: unknown): AgentLayoutSelection[] {
  if (!Array.isArray(input)) throw new Error("Agent selections must be a JSON array");
  return input.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`Agent selection ${index} must be an object`);
    const record = entry as Record<string, unknown>;
    for (const key of ["blockId", "componentId", "variantId", "reason"] as const) {
      if (typeof record[key] !== "string" || record[key].length === 0) {
        throw new Error(`Agent selection ${index}.${key} must be a non-empty string`);
      }
    }
    return {
      blockId: record.blockId as string,
      componentId: record.componentId as string,
      variantId: record.variantId as string,
      reason: record.reason as string,
    };
  });
}

function parseAgentAnalysisOptions(input: Record<string, string>): {
  profile: string;
  blocks: string;
  reading: string;
} | undefined {
  const profile = input["agent-profile"];
  const blocks = input["agent-blocks"];
  const reading = input["agent-reading"];
  const present = [profile, blocks, reading].filter(Boolean).length;
  if (present === 0) return undefined;
  if (present !== 3) {
    throw new Error("Agent analysis requires --agent-profile, --agent-blocks and --agent-reading together");
  }
  return { profile: profile!, blocks: blocks!, reading: reading! };
}

function parseWorkflowMode(value: string | undefined): "agent" | "baseline" {
  if (value === undefined || value === "agent") return "agent";
  if (value === "baseline") return "baseline";
  throw new Error(`Unknown workflow mode ${value}; expected agent or baseline`);
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve(file), "utf8")) as unknown;
}

async function readMediaInputs(
  input: Record<string, string>,
  document: BlockDocument,
  sourceHash?: string,
): Promise<{ imagePlan: ImagePlan; assetManifest: AssetManifest } | undefined> {
  const planPath = input["image-plan"];
  const assetPath = input["asset-manifest"];
  if (!planPath && !assetPath) return undefined;
  if (!planPath || !assetPath) {
    throw new Error("AI image rendering requires --image-plan and --asset-manifest together");
  }
  const imagePlan = validateImagePlan(await readJson(planPath));
  const assetManifest = validateAssetManifest(await readJson(assetPath));
  resolveImagePlan(document, imagePlan, assetManifest, sourceHash);
  return { imagePlan, assetManifest };
}

async function outputJson(value: unknown): Promise<void> {
  const text = JSON.stringify(value, null, 2) + "\n";
  if (!options.output) return void process.stdout.write(text);
  await writeOutput(options.output, text);
}

async function writeOutput(file: string, content: string): Promise<string> {
  const output = path.resolve(file);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, content, "utf8");
  return output;
}

async function writeWorkflowArtifacts(
  directory: string,
  artifacts: Record<string, unknown>,
): Promise<Record<string, string>> {
  const root = path.resolve(directory);
  return Object.fromEntries(await Promise.all(Object.entries(artifacts).map(async ([name, value]) => [
    name,
    await writeOutput(path.join(root, `${toKebabCase(name)}.json`), JSON.stringify(value, null, 2) + "\n"),
  ])));
}

function toKebabCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/gu, "$1-$2").toLowerCase();
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "source";
}

function usage(): string {
  return [
    "source inspect --input <file> [--format markdown|plain-text] [--output <json>]",
    "profile validate --input <json> [--output <json>]",
    "blocks validate --input <json> [--source-manifest <json>] [--output <json>]",
    "workflow run --input <article.md|txt> [--mode agent|baseline] [--format markdown|plain-text] [--agent-profile <json> --agent-blocks <json> --agent-reading <json>] [--image-plan <json> --asset-manifest <json>] [--theme quiet-editorial] [--density dense|balanced|airy] [--selections <json>] --output <html> [--preview <html>] [--clean-preview <html>] [--artifacts-dir <dir>]",
    "reading validate --input <json> --blocks <json> [--output <json>]",
    "reading plan --blocks <json> [--output <json>]",
    "media validate --blocks <json> --plan <json> --asset-manifest <json> [--output <json>]",
    "theme inspect [--theme quiet-editorial] [--output <json>]",
    "layout candidates --blocks <json> [--reading <json>] [--theme quiet-editorial] [--output <json>]",
    "layout plan --blocks <json> [--reading <json>] [--theme quiet-editorial] [--density dense|balanced|airy] [--selections <json>] [--output <json>]",
    "wechat render --blocks <json> [--reading <json>] [--layout <json>] [--image-plan <json> --asset-manifest <json>] [--theme quiet-editorial] [--density dense|balanced|airy] [--selections <json>] --output <html> [--preview <html>] [--clean-preview <html>]",
  ].join("\n");
}
