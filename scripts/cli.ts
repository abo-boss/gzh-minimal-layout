import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BlockDocument } from "../src/contracts/block-document.js";
import type { LayoutDecision, LayoutDecisionBlock } from "../src/contracts/layout-decision.js";
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
import { analyzeArticle } from "../src/agent/analyze-article.js";
import { displayMarkdownText } from "../src/agent/inline-markdown.js";
import { ARTICLE_RECIPES, recipesForArticleType } from "../src/reading/article-recipes.js";
import { createBaselineReadingPlan, assertReadingPlan } from "../src/reading/reading-plan.js";
import type { SourceFormat } from "../src/source/source-manifest.js";
import { sha256 } from "../src/source/inspect-source.js";
import { loadThemeLibraries, loadThemeLibrary } from "../src/theme/theme-library.js";
import { recommendThemes } from "../src/theme/theme-recommendation.js";
import {
  validateBlockDocument,
  validateLayoutDecision,
  validateImagePlan,
  validateAssetManifest,
} from "../src/validation/schema-validator.js";
import { validateDecisionSource } from "../src/validation/layout-decision-source.js";
import { validateDecisionSemantics } from "../src/validation/layout-decision-validator.js";

const [command, ...args] = process.argv.slice(2);
const options = parseOptions(args);

try {
  if (command === "render") {
    await handleRender();
  } else if (command === "inspect") {
    await handleInspect();
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
  const decision = validateLayoutDecision(await readJson(decisionPath));

  const format = (options.format ?? (input.endsWith(".md") ? "markdown" : "plain-text")) as SourceFormat;
  const sourceIntegrity = validateDecisionSource(decision, source);
  if (!sourceIntegrity.valid) throw new Error(formatSourceIntegrityError(sourceIntegrity));

  const blockDocument = decisionToBlockDocument(decision);
  const validated = validateBlockDocument(blockDocument);

  const readingPlan = decisionToReadingPlan(decision);
  assertReadingPlan(validated, readingPlan);

  const library = await loadThemeLibrary(decision.theme);
  const decisionErrors = validateDecisionSemantics(decision, validated, readingPlan, library);
  if (decisionErrors.length > 0) throw new Error(`LayoutDecision semantic validation failed\n${decisionErrors.map((error) => `- ${error}`).join("\n")}`);

  const selections = selectionsFromDecision(decision);

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
    sourceIntegrity,
    contentIntegrity: result.contentIntegrity,
  }, null, 2) + "\n");
}

// === inspect: 为 Host Agent 提供源文事实、基线结构与合法选择 ===
async function handleInspect(): Promise<void> {
  const input = required("input");
  const source = await readFile(path.resolve(input), "utf8");
  const format = (options.format ?? (input.endsWith(".md") ? "markdown" : "plain-text")) as SourceFormat;
  const sourceId = options["source-id"] ?? safeId(path.basename(input, path.extname(input)));
  const analysis = analyzeArticle(source, { sourceId, format });
  const libraries = await loadThemeLibraries();
  const recommendations = recommendThemes(libraries, {
    articleType: analysis.articleProfile.articleType,
    tones: analysis.articleProfile.tone,
    structurePattern: analysis.articleProfile.structurePattern,
  });
  const payload = {
    specVersion: "1.0",
    source: {
      id: sourceId,
      hash: sha256(source),
      format,
      segmentation: analysis.sourceManifest.segmentation,
      segments: analysis.sourceManifest.segments.map((segment) => ({
        id: segment.id,
        order: segment.sourceOrder,
        kindHint: segment.kindHint,
        content: segment.content,
      })),
    },
    agentContract: {
      sourceIsReadOnly: true,
      preserveEveryCharacterExceptWhitespace: true,
      ordinaryBlocksUseThemeBaseline: true,
      explicitComponentSelectionsAreSparse: true,
    },
    baseline: {
      advisoryOnly: true,
      articleProfile: analysis.articleProfile,
      blocks: analysis.blockDocument.blocks.map((block) => ({
        id: block.id,
        type: block.type,
        role: block.role,
        content: block.content,
      })),
    },
    recipes: ARTICLE_RECIPES,
    suggestedRecipes: recipesForArticleType(analysis.articleProfile.articleType),
    recommendations,
    themes: libraries.map(themeDiscovery),
  };
  if (options.output) {
    const output = await writeOutput(options.output, JSON.stringify(payload, null, 2) + "\n");
    process.stdout.write(JSON.stringify({ success: true, output, sourceHash: payload.source.hash }, null, 2) + "\n");
    return;
  }
  process.stdout.write(JSON.stringify({ success: true, data: payload }, null, 2) + "\n");
}

// === themes: 列出所有可用主题 ===
async function handleThemes(): Promise<void> {
  const themes = (await loadThemeLibraries()).map(themeDiscovery);
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
  const input = required("input");
  const decisionPath = required("decision");
  const source = await readFile(path.resolve(input), "utf8");
  const errors: string[] = [];
  let decision: LayoutDecision | undefined;
  try {
    decision = validateLayoutDecision(await readJson(decisionPath));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  if (!decision) return finishValidation(errors);

  const sourceIntegrity = validateDecisionSource(decision, source);
  if (!sourceIntegrity.valid) errors.push(formatSourceIntegrityError(sourceIntegrity));

  const library = await loadThemeLibrary(decision.theme).catch(() => null);
  if (!library) {
    errors.push(`theme '${decision.theme}' not found`);
  } else {
    try {
      const document = validateBlockDocument(decisionToBlockDocument(decision));
      const readingPlan = decisionToReadingPlan(decision);
      assertReadingPlan(document, readingPlan);
      errors.push(...validateDecisionSemantics(decision, document, readingPlan, library));
      if (errors.length === 0) {
        const selections = selectionsFromDecision(decision);
        createLayoutPlan(document, readingPlan, library, {
          density: decision.density,
          ...(selections.length > 0 ? { selections } : {}),
        });
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  finishValidation(errors, sourceIntegrity);
}

function decisionToBlockDocument(decision: LayoutDecision): BlockDocument {
  let sectionId = "entry";
  return {
    specVersion: "1.0",
    id: "agent-decision",
    articleType: decision.articleType,
    ...(decision.tone ? { moods: decision.tone } : {}),
    blocks: decision.blocks.map((block, index) => {
      if (block.type === "heading") sectionId = block.id;
      return {
        id: block.id,
        type: block.type,
        role: block.role,
        content: block.content,
        importance: block.emphasis === "strong" ? 0.9 : block.emphasis === "medium" ? 0.6 : 0.3,
        sourceOrder: index,
        sectionId,
        relationToPrevious: relationForDecisionBlock(block, index),
        ...(block.level ? { level: block.level } : {}),
        ...(decisionStructure(block) ? { structure: decisionStructure(block)! } : {}),
        ...(block.marks ? { marks: block.marks } : {}),
      };
    }),
  };
}

function decisionToReadingPlan(decision: LayoutDecision) {
  return {
    specVersion: "1.0",
    id: "agent-reading",
    documentId: "agent-decision",
    items: decision.blocks.map((b) => ({
      blockId: b.id,
      compositionGroupId: b.phase === "entry" ? "opening" : b.phase === "exit" ? "closing" : "main",
      phase: b.phase,
      gesture: b.gesture,
      emphasisFunction: b.emphasis === "strong" ? "cognitive" : b.emphasis === "medium" ? "structural" : "none",
      strength: b.emphasis,
      reason: b.reason ?? "agent decision",
    })),
  } as any;
}

function selectionsFromDecision(decision: LayoutDecision): AgentLayoutSelection[] {
  return decision.blocks.flatMap((block) => block.component && block.variant ? [{
    blockId: block.id,
    componentId: block.component,
    variantId: block.variant,
    reason: block.reason ?? "host-agent sparse enhancement",
  }] : []);
}

function decisionStructure(block: LayoutDecisionBlock) {
  if (block.structure) return block.structure;
  if (block.type === "heading") {
    const title = displayMarkdownText(block.content.replace(/^#{1,6}[\t ]+/u, "")).trim();
    return { hasMarker: false, title };
  }
  if (block.type === "quote") {
    const content = block.content.split(/\r?\n/u).map((line) => line.replace(/^>[\t ]?/u, "")).join("\n");
    return { content, hasAttribution: false };
  }
  return undefined;
}

function relationForDecisionBlock(
  block: LayoutDecisionBlock,
  index: number,
): NonNullable<BlockDocument["blocks"][number]["relationToPrevious"]> {
  if (index === 0) return "default";
  if (block.type === "heading") return "new-section";
  if (block.phase === "exit" || block.gesture === "release") return "before-ending";
  if (block.gesture === "pivot") return "turning-point";
  if (block.gesture === "pause" || block.emphasis === "strong") return "before-strong-block";
  if (block.type === "list" || block.type === "quote") return "same-group";
  return "continuation";
}

function themeDiscovery(library: Awaited<ReturnType<typeof loadThemeLibraries>>[number]) {
  return {
    id: library.manifest.id,
    name: library.manifest.name,
    description: library.manifest.description,
    recommendation: library.manifest.recommendation,
    defaultDensity: library.manifest.defaultDensity,
    budgets: library.manifest.budgets,
    components: library.components.map((component) => ({
      id: component.id,
      kind: component.kind,
      accepts: component.accepts,
      fallbackVariant: component.fallbackVariant,
      variants: component.variants.map((variant) => ({
        id: variant.id,
        label: variant.label,
        visualWeight: variant.visualWeight,
        surface: variant.surface,
        accepts: variant.accepts,
      })),
    })),
  };
}

function formatSourceIntegrityError(integrity: ReturnType<typeof validateDecisionSource>): string {
  const reasons = [
    ...(!integrity.hashMatches ? [`sourceHash mismatch: expected ${integrity.sourceHash}, got ${integrity.decisionHash}`] : []),
    ...(!integrity.contentMatches ? [`decision blocks do not preserve the complete source in order near offset ${integrity.firstMismatch?.offset}: source='${integrity.firstMismatch?.source}' decision='${integrity.firstMismatch?.decision}'`] : []),
  ];
  return `Source integrity validation failed\n${reasons.map((reason) => `- ${reason}`).join("\n")}`;
}

function finishValidation(
  errors: string[],
  sourceIntegrity?: ReturnType<typeof validateDecisionSource>,
): void {
  if (errors.length > 0) {
    process.stdout.write(JSON.stringify({ success: false, errors, ...(sourceIntegrity ? { sourceIntegrity } : {}) }, null, 2) + "\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write(JSON.stringify({
    success: true,
    message: "LayoutDecision is valid",
    ...(sourceIntegrity ? { sourceIntegrity } : {}),
  }, null, 2) + "\n");
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
    "  inspect   --input <article.md> [--output <analysis-input.json>]  Emit source facts for the Host Agent",
    "  render    --input <article.md> --decision <layout-decision.json> --output <html> [--preview <html>]",
    "  themes    List all available themes with components and recommendation profiles",
    "  recommend --article-type <type> [--tone <a,b>] [--structure <pattern>]  Rank the top 3 themes",
    "  validate  --input <article.md> --decision <layout-decision.json>  Validate schema, source fidelity, recipe budgets, and theme legality",
  ].join("\n");
}
