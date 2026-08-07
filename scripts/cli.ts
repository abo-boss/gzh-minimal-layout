import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BlockDocument } from "../src/contracts/block-document.js";
import type { AssetManifest, ImagePlan } from "../src/contracts/media.js";
import {
  THEME_RECOMMENDATION_ARTICLE_TYPES,
  THEME_RECOMMENDATION_STRUCTURE_PATTERNS,
  type AgentLayoutSelection,
  type RhythmDensity,
  type ThemeRecommendationArticleType,
  type ThemeRecommendationStructurePattern,
} from "../src/contracts/presentation.js";
import { createLayoutPlan, assertLayoutPlan } from "../src/presentation/layout-plan.js";
import { renderComponentArticle } from "../src/presentation/component-renderer.js";
import { resolveImagePlan } from "../src/media/image-plan.js";
import { createBaselineReadingPlan, assertReadingPlan } from "../src/reading/reading-plan.js";
import type { SourceFormat } from "../src/source/source-manifest.js";
import { loadThemeLibraries, loadThemeLibrary } from "../src/theme/theme-library.js";
import { recommendThemes } from "../src/theme/theme-recommendation.js";
import {
  validateBlockDocument,
  validateImagePlan,
  validateAssetManifest,
} from "../src/validation/schema-validator.js";

const [command, ...args] = process.argv.slice(2);
const options = parseOptions(args);

try {
  if (command === "render") {
    await handleRender();
  } else if (command === "themes") {
    await handleThemes();
  } else if (command === "recommend") {
    await handleRecommend();
  } else if (command === "validate") {
    await handleValidate();
  } else {
    throw new Error(`Unknown command: ${command}\n${usage()}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

// === render: 读取 LayoutDecision + 源文 → 一步输出 WeChat HTML ===
async function handleRender(): Promise<void> {
  const input = required("input");
  const decisionPath = required("decision");
  const source = await readFile(path.resolve(input), "utf8");
  const decision = await readJson(decisionPath) as LayoutDecision;

  const format = (options.format ?? (input.endsWith(".md") ? "markdown" : "plain-text")) as SourceFormat;
  const sourceId = options["source-id"] ?? safeId(path.basename(input, path.extname(input)));

  const blockDocument = decisionToBlockDocument(decision);
  // v2 模式不传 sourceManifest：跳过 sourceRefs/sourceSpans 验证
  // 内容正确性由渲染后的 contentIntegrity 校验保证
  const validated = validateBlockDocument(blockDocument);

  const readingPlan = decisionToReadingPlan(decision);
  assertReadingPlan(validated, readingPlan);

  const library = await loadThemeLibrary(decision.theme);

  const selections: AgentLayoutSelection[] = decision.blocks
    .filter((b) => b.component && b.variant)
    .map((b) => ({
      blockId: b.id,
      componentId: b.component,
      variantId: b.variant,
      reason: b.reason ?? "agent decision",
    }));

  const layout = createLayoutPlan(validated, readingPlan, library, {
    density: decision.density as RhythmDensity,
    ...(selections.length > 0 ? { selections } : {}),
  });
  assertLayoutPlan(validated, readingPlan, layout, library);

  const media = await readMediaInputs(options, validated);
  const result = renderComponentArticle(validated, layout, library, media ? {
    imagePlan: media.imagePlan,
    assetManifest: media.assetManifest,
  } : undefined);

  const output = await writeOutput(required("output"), result.wechatHtml);
  const preview = options.preview ? await writeOutput(options.preview, result.cleanPreviewHtml) : undefined;

  process.stdout.write(JSON.stringify({
    success: true,
    output,
    ...(preview ? { preview } : {}),
    theme: decision.theme,
    density: decision.density,
    blockCount: decision.blocks.length,
    contentIntegrity: result.contentIntegrity,
  }, null, 2) + "\n");
}

// === themes: 列出所有可用主题 ===
async function handleThemes(): Promise<void> {
  const themes = (await loadThemeLibraries()).map((library) => ({
    id: library.manifest.id,
    name: library.manifest.name,
    description: library.manifest.description,
    recommendation: library.manifest.recommendation,
    components: library.components.map((component) => component.id),
  }));
  process.stdout.write(JSON.stringify({ success: true, themes }, null, 2) + "\n");
}

// === recommend: 根据文章画像排序主题候选 ===
async function handleRecommend(): Promise<void> {
  const articleType = requiredRecommendationValue(
    "article-type",
    THEME_RECOMMENDATION_ARTICLE_TYPES,
  );
  const structure = optionalRecommendationValue(
    "structure",
    THEME_RECOMMENDATION_STRUCTURE_PATTERNS,
  );
  const tones = (options.tone ?? "")
    .split(",")
    .map((tone) => tone.trim().toLowerCase())
    .filter(Boolean);
  const libraries = await loadThemeLibraries();
  const recommendations = recommendThemes(libraries, {
    articleType,
    ...(tones.length > 0 ? { tones } : {}),
    ...(structure ? { structurePattern: structure } : {}),
  });

  process.stdout.write(JSON.stringify({
    success: true,
    input: {
      articleType,
      ...(tones.length > 0 ? { tones } : {}),
      ...(structure ? { structurePattern: structure } : {}),
    },
    recommendations,
  }, null, 2) + "\n");
}

// === validate: 校验 LayoutDecision 合法性 ===
async function handleValidate(): Promise<void> {
  const decisionPath = required("decision");
  const decision = await readJson(decisionPath) as LayoutDecision;
  const errors: string[] = [];

  if (!decision.specVersion || decision.specVersion !== "2.0") {
    errors.push("specVersion must be '2.0'");
  }
  if (!decision.theme) {
    errors.push("theme is required");
  }
  if (!decision.blocks || decision.blocks.length === 0) {
    errors.push("blocks array must not be empty");
  }

  const library = await loadThemeLibrary(decision.theme).catch(() => null);
  if (!library) {
    errors.push(`theme '${decision.theme}' not found`);
  } else {
    const componentIds = new Set(library.components.map((c) => c.id));
    for (const block of decision.blocks) {
      if (!componentIds.has(block.component)) {
        errors.push(`block ${block.id}: component '${block.component}' not found in theme '${decision.theme}'`);
        continue;
      }
      const comp = library.components.find((c) => c.id === block.component)!;
      const variantIds = new Set(comp.variants.map((v) => v.id));
      if (!variantIds.has(block.variant)) {
        errors.push(`block ${block.id}: variant '${block.variant}' not found in component '${block.component}'`);
      }
    }
  }

  if (errors.length > 0) {
    process.stdout.write(JSON.stringify({ success: false, errors }, null, 2) + "\n");
    process.exitCode = 1;
  } else {
    process.stdout.write(JSON.stringify({ success: true, message: "LayoutDecision is valid" }, null, 2) + "\n");
  }
}

// === LayoutDecision 转换为旧格式（内部桥接） ===
interface LayoutDecision {
  specVersion: string;
  articleType: string;
  themeReason?: string;
  tone?: string[];
  theme: string;
  density: string;
  blocks: LayoutDecisionBlock[];
}

interface LayoutDecisionBlock {
  id: string;
  type: string;
  content: string;
  component: string;
  variant: string;
  level?: number;
  phase?: string;
  gesture?: string;
  emphasis?: string;
  structure?: Record<string, unknown>;
  marks?: Array<{ type: string; start: number; end: number }>;
  reason?: string;
}

function decisionToBlockDocument(decision: LayoutDecision): BlockDocument {
  return {
    specVersion: "1.0",
    id: "agent-decision",
    articleType: decision.articleType,
    moods: decision.tone,
    blocks: decision.blocks.map((b, i) => ({
      id: b.id,
      type: b.type as any,
      role: b.type,
      content: b.content,
      importance: b.emphasis === "strong" ? 0.9 : b.emphasis === "medium" ? 0.6 : 0.3,
      sourceOrder: i,
      ...(b.level ? { level: b.level } : {}),
      ...(b.structure ? { structure: b.structure as any } : {}),
      ...(b.marks ? { marks: b.marks as any } : {}),
    })),
  } as any;
}

function decisionToReadingPlan(decision: LayoutDecision) {
  return {
    specVersion: "1.0",
    id: "agent-reading",
    documentId: "agent-decision",
    items: decision.blocks.map((b) => ({
      blockId: b.id,
      compositionGroupId: b.phase === "entry" ? "opening" : b.phase === "exit" ? "closing" : "main",
      phase: b.phase ?? "body",
      gesture: b.gesture ?? "flow",
      emphasisFunction: b.emphasis === "strong" ? "cognitive" : b.emphasis === "medium" ? "structural" : "none",
      strength: b.emphasis ?? "quiet",
      reason: b.reason ?? "agent decision",
    })),
  } as any;
}

// === 工具函数 ===
function parseOptions(values: string[]): Record<string, string> & { _rest?: string } {
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

function requiredRecommendationValue<T extends readonly string[]>(
  name: string,
  allowed: T,
): T[number] {
  const value = required(name);
  if (!allowed.includes(value)) {
    throw new Error(`Invalid --${name} '${value}'. Expected one of: ${allowed.join(", ")}`);
  }
  return value as T[number];
}

function optionalRecommendationValue<T extends readonly string[]>(
  name: string,
  allowed: T,
): T[number] | undefined {
  const value = options[name];
  if (!value) return undefined;
  if (!allowed.includes(value)) {
    throw new Error(`Invalid --${name} '${value}'. Expected one of: ${allowed.join(", ")}`);
  }
  return value as T[number];
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "source";
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

async function writeOutput(file: string, content: string): Promise<string> {
  const output = path.resolve(file);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, content, "utf8");
  return output;
}

function usage(): string {
  return [
    "gzh-minimal-layout CLI",
    "",
    "Commands:",
    "  render    --input <article.md> --decision <layout-decision.json> --output <html> [--preview <html>]",
    "  themes    List all available themes with components and recommendation profiles",
    "  recommend --article-type <type> [--tone <a,b>] [--structure <pattern>]  Rank the top 3 themes",
    "  validate  --decision <layout-decision.json>  Validate a LayoutDecision",
  ].join("\n");
}
