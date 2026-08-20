import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Block, BlockDocument } from "../src/contracts/block-document.js";
import type { LayoutDecision, LayoutDecisionBlock } from "../src/contracts/layout-decision.js";
import type { AssetManifest, ImagePlan } from "../src/contracts/media.js";
import {
  THEME_RECOMMENDATION_ARTICLE_TYPES,
  THEME_RECOMMENDATION_STRUCTURE_PATTERNS,
  type AgentLayoutSelection,
  type LayoutPlan,
  type RhythmDensity,
  type ThemeLibrary,
  type ThemeRecommendationArticleType,
  type ThemeRecommendationStructurePattern,
} from "../src/contracts/presentation.js";
import { createLayoutPlan, assertLayoutPlan } from "../src/presentation/layout-plan.js";
import { renderComponentArticle } from "../src/presentation/component-renderer.js";
import { resolveImagePlan } from "../src/media/image-plan.js";
import { analyzeArticle, type ArticleAnalysisResult } from "../src/agent/analyze-article.js";
import { displayMarkdownText } from "../src/agent/inline-markdown.js";
import { ARTICLE_RECIPES, recipesForArticleType } from "../src/reading/article-recipes.js";
import { createBaselineReadingPlan, assertReadingPlan } from "../src/reading/reading-plan.js";
import type { SourceFormat } from "../src/source/source-manifest.js";
import { sha256 } from "../src/source/inspect-source.js";
import { normalizeInput, type NormalizableFormat } from "../src/source/normalize-input.js";
import { loadThemeLibraries, loadThemeLibrary } from "../src/theme/theme-library.js";
import { recommendThemes, type ThemeRecommendation } from "../src/theme/theme-recommendation.js";
import {
  validateBlockDocument,
  validateLayoutDecision,
  validateImagePlan,
  validateAssetManifest,
} from "../src/validation/schema-validator.js";
import { validateDecisionSource } from "../src/validation/layout-decision-source.js";
import { validateDecisionSemantics } from "../src/validation/layout-decision-validator.js";
import { validateWechatHtml } from "../src/validation/wechat-html-validator.js";

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
  } else if (command === "commit") {
    await handleCommit();
  } else if (command === "compose") {
    await handleCompose();
  } else if (command === "verify-output") {
    await handleVerifyOutput();
  } else if (command === "normalize") {
    await handleNormalize();
  } else {
    throw new Error(`Unknown command: ${command}\n${usage()}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

// === normalize: rich input -> reviewable Markdown draft, before inspect ===
async function handleNormalize(): Promise<void> {
  const input = required("input");
  const requested = options.format ?? "auto";
  if (!["auto", "markdown", "plain-text", "html", "docx", "pdf"].includes(requested)) {
    throw new Error(`Unsupported --format '${requested}' for normalize`);
  }
  const normalized = await normalizeInput(input, requested as NormalizableFormat | "auto");
  const output = await writeOutput(required("output"), normalized.markdown);
  process.stdout.write(JSON.stringify({
    success: true,
    output,
    input: path.resolve(input),
    format: normalized.format,
    inputHash: normalized.inputHash,
    normalizedHash: normalized.normalizedHash,
    warnings: normalized.warnings,
    next: "Review this Markdown draft, then run inspect on it. Commit validates the normalized draft, never the original rich file.",
  }, null, 2) + "\n");
}

// === render: 读取 LayoutDecision + 源文 → 一步输出 WeChat HTML ===
async function handleRender(): Promise<void> {
  const input = required("input");
  const decisionPath = required("decision");
  const source = await readFile(path.resolve(input), "utf8");
  const decision = validateLayoutDecision(await readJson(decisionPath));

  const format = resolveSourceFormat(input, source);
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
    recipe: decision.recipe,
    ...(selections.length > 0 ? { selections } : {}),
  });
  assertLayoutPlan(validated, readingPlan, layout, library);

  const media = await readMediaInputs(options, validated);
  const result = renderComponentArticle(validated, layout, library, media ? {
    imagePlan: media.imagePlan,
    assetManifest: media.assetManifest,
  } : undefined);
  const wechatValidation = validateWechatHtml(result.wechatHtml);
  if (!wechatValidation.valid) throw new Error(`WeChat output validation failed\n${wechatValidation.errors.map((error) => `- ${error}`).join("\n")}`);

  const output = await writeOutput(required("output"), result.wechatHtml);
  const preview = await writeOutput(options.preview ?? defaultPreviewPath(output), result.cleanPreviewHtml);

  process.stdout.write(JSON.stringify({
    success: true,
    output,
    preview,
    theme: decision.theme,
    density: decision.density,
    blockCount: decision.blocks.length,
    sourceIntegrity,
    contentIntegrity: result.contentIntegrity,
    derivedChrome: result.derivedChrome,
    wechatValidation,
  }, null, 2) + "\n");
}

// === inspect: 为 Host Agent 提供源文事实、基线结构与合法选择 ===
async function handleInspect(): Promise<void> {
  const input = required("input");
  const source = await readFile(path.resolve(input), "utf8");
  const format = resolveSourceFormat(input, source);
  const sourceId = options["source-id"] ?? safeId(path.basename(input, path.extname(input)));
  const analysis = analyzeArticle(source, { sourceId, format });
  const libraries = await loadThemeLibraries();
  const recommendations = recommendThemes(libraries, {
    articleType: analysis.articleProfile.articleType,
    tones: analysis.articleProfile.tone,
    structurePattern: analysis.articleProfile.structurePattern,
  });
  const full = options.full === "true";
  const themes = full
    ? libraries.map(themeDiscovery)
    : recommendations.map((rec) => {
      const library = libraries.find((entry) => entry.manifest.id === rec.themeId);
      return library ? themeDiscovery(library) : null;
    }).filter((value): value is NonNullable<typeof value> => value !== null);

  const suggestedRecipes = recipesForArticleType(analysis.articleProfile.articleType);
  const payload: Record<string, unknown> = {
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
    suggestedRecipes,
    recommendations,
    themes,
    decisionTemplate: buildDecisionTemplate(analysis, source, recommendations, libraries),
  };
  if (full) payload.recipes = ARTICLE_RECIPES;
  if (options.output) {
    const output = await writeOutput(options.output, JSON.stringify(payload, null, 2) + "\n");
    process.stdout.write(JSON.stringify({ success: true, output, sourceHash: (payload.source as { hash: string }).hash, themeCount: themes.length }, null, 2) + "\n");
    return;
  }
  process.stdout.write(JSON.stringify({ success: true, data: payload }, null, 2) + "\n");
}

// 基于基线分析生成 LayoutDecision 模板，Agent 只需调整而非从零写
function buildDecisionTemplate(
  analysis: ArticleAnalysisResult,
  source: string,
  recommendations: ThemeRecommendation[],
  libraries: ThemeLibrary[],
): Record<string, unknown> {
  const profile = analysis.articleProfile;
  const selected = selectThemeRecipe(profile.articleType, libraries, recommendations);
  const blocks = analysis.blockDocument.blocks.map((block) => ({
    id: block.id,
    type: block.type,
    role: block.role,
    content: block.content,
    phase: phaseFromSection(block.sectionId, block.type),
    gesture: gestureFor(block.type, block.relationToPrevious),
    emphasis: emphasisFor(block.type, block.importance),
    ...(block.level ? { level: block.level } : {}),
    ...(block.structure ? { structure: block.structure } : {}),
    ...(block.marks?.length ? { marks: block.marks } : {}),
  }));
  return {
    specVersion: "3.0",
    sourceHash: sha256(source),
    articleType: profile.articleType,
    tone: profile.tone,
    structurePattern: profile.structurePattern,
    theme: selected.library.manifest.id,
    themeReason: `基线推荐：${selected.library.manifest.description}`,
    recipe: selected.recipe.id,
    density: selected.library.manifest.defaultDensity,
    blocks,
  };
}

// === compose: 生成可审阅的自动基线决策，不取代 Agent 的全文判断 ===
async function handleCompose(): Promise<void> {
  const input = required("input");
  const source = await readFile(path.resolve(input), "utf8");
  const format = resolveSourceFormat(input, source);
  const sourceId = options["source-id"] ?? safeId(path.basename(input, path.extname(input)));
  const libraries = await loadThemeLibraries();
  // Theme selection needs only the profile. Re-run the deterministic analysis
  // with the selected theme's inline-mark budget before serializing the
  // baseline decision, so the manifest is the executable source of truth.
  const profileAnalysis = analyzeArticle(source, { sourceId, format });
  const recommendations = recommendThemes(libraries, {
    articleType: profileAnalysis.articleProfile.articleType,
    tones: profileAnalysis.articleProfile.tone,
    structurePattern: profileAnalysis.articleProfile.structurePattern,
  });
  const requestedTheme = options.theme;
  const selected = selectThemeRecipe(profileAnalysis.articleProfile.articleType, libraries, recommendations, requestedTheme);
  const analysis = analyzeArticle(source, {
    sourceId,
    format,
    inlineMarkBudget: selected.library.manifest.composition.inlineMarkBudget,
  });
  const decision = validateLayoutDecision(buildDecisionTemplate(analysis, source, recommendations, libraries));
  const withSelectedTheme: LayoutDecision = {
    ...decision,
    theme: selected.library.manifest.id,
    recipe: selected.recipe.id,
    density: selected.library.manifest.defaultDensity,
    themeReason: `自动基线：${selected.library.manifest.description}`,
  };
  const output = await writeOutput(required("output"), JSON.stringify(withSelectedTheme, null, 2) + "\n");
  process.stdout.write(JSON.stringify({
    success: true,
    output,
    mode: "automatic-baseline",
    advisory: "Review the semantic blocks and theme before commit; the command never rewrites source text.",
    theme: withSelectedTheme.theme,
    recipe: withSelectedTheme.recipe,
    sourceHash: withSelectedTheme.sourceHash,
  }, null, 2) + "\n");
}

function selectThemeRecipe(
  articleType: ThemeRecommendationArticleType,
  libraries: ThemeLibrary[],
  recommendations: ThemeRecommendation[],
  requestedTheme?: string,
): { library: ThemeLibrary; recipe: ThemeLibrary["manifest"]["composition"]["recipes"][number] } {
  if (requestedTheme && !libraries.some((library) => library.manifest.id === requestedTheme)) {
    throw new Error(`theme '${requestedTheme}' not found`);
  }
  const ranked = requestedTheme
    ? libraries.filter((library) => library.manifest.id === requestedTheme)
    : recommendations.map((recommendation) => libraries.find((library) => library.manifest.id === recommendation.themeId)).filter((library): library is ThemeLibrary => Boolean(library));
  const candidates = ranked.length > 0 ? ranked : libraries;
  for (const library of candidates) {
    const recipe = library.manifest.composition.recipes.find((entry) => entry.articleTypes.includes(articleType));
    if (recipe) return { library, recipe };
  }
  throw new Error(`No registered theme defines a composition recipe for '${articleType}'${requestedTheme ? ` in '${requestedTheme}'` : ""}`);
}

function phaseFromSection(sectionId: string | undefined, type: Block["type"]): "entry" | "body" | "exit" {
  if (type === "ending" || type === "cta") return "exit";
  if (sectionId === "entry") return "entry";
  if (sectionId === "conclusion" || sectionId === "action") return "exit";
  return "body";
}

function gestureFor(type: Block["type"], relation: Block["relationToPrevious"] | undefined): string {
  if (type === "article-title" || type === "heading") return "anchor";
  if (type === "ending") return "release";
  if (type === "quote") return "pause";
  if (relation === "turning-point") return "pivot";
  return "flow";
}

function emphasisFor(type: Block["type"], importance: number): "strong" | "medium" | "quiet" {
  if (type === "article-title") return "strong";
  if (type === "heading" || type === "ending") return "medium";
  if (importance >= 0.8) return "medium";
  return "quiet";
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

// 共享校验核心：validate 与 commit 复用，返回错误与中间产物
interface ValidationResult {
  errors: string[];
  decision?: LayoutDecision;
  sourceIntegrity?: ReturnType<typeof validateDecisionSource>;
  document?: BlockDocument;
  readingPlan?: ReturnType<typeof decisionToReadingPlan>;
  library?: ThemeLibrary;
  layout?: LayoutPlan;
}

async function runValidation(source: string, decisionPath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  let decision: LayoutDecision | undefined;
  try {
    decision = validateLayoutDecision(await readJson(decisionPath));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { errors };
  }
  const sourceIntegrity = validateDecisionSource(decision, source);
  if (!sourceIntegrity.valid) errors.push(formatSourceIntegrityError(sourceIntegrity));
  const library = await loadThemeLibrary(decision.theme).catch(() => null);
  if (!library) {
    errors.push(`theme '${decision.theme}' not found`);
    return { errors, decision, sourceIntegrity };
  }
  let document: BlockDocument | undefined;
  let readingPlan: ReturnType<typeof decisionToReadingPlan> | undefined;
  let layout: LayoutPlan | undefined;
  try {
    document = validateBlockDocument(decisionToBlockDocument(decision));
    readingPlan = decisionToReadingPlan(decision);
    assertReadingPlan(document, readingPlan);
    errors.push(...validateDecisionSemantics(decision, document, readingPlan, library));
    if (errors.length === 0) {
      const selections = selectionsFromDecision(decision);
      layout = createLayoutPlan(document, readingPlan, library, {
        density: decision.density,
        recipe: decision.recipe,
        ...(selections.length > 0 ? { selections } : {}),
      });
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return {
    errors,
    decision,
    sourceIntegrity,
    ...(document ? { document } : {}),
    ...(readingPlan ? { readingPlan } : {}),
    ...(library ? { library } : {}),
    ...(layout ? { layout } : {}),
  };
}

// === validate: 校验 LayoutDecision 合法性 ===
async function handleValidate(): Promise<void> {
  const input = required("input");
  const decisionPath = required("decision");
  const source = await readFile(path.resolve(input), "utf8");
  const result = await runValidation(source, decisionPath);
  finishValidation(result.errors, result.sourceIntegrity);
}

// === commit: 一步完成校验 + 渲染，失败返回结构化错误 ===
async function handleCommit(): Promise<void> {
  const input = required("input");
  const decisionPath = required("decision");
  const source = await readFile(path.resolve(input), "utf8");
  const result = await runValidation(source, decisionPath);
  const ready = result.errors.length === 0 && result.decision && result.document && result.readingPlan && result.library && result.layout;
  if (!ready) {
    process.stdout.write(JSON.stringify({
      success: false,
      errors: result.errors.length > 0 ? result.errors : ["validation produced no usable layout"],
      ...(result.sourceIntegrity ? { sourceIntegrity: result.sourceIntegrity } : {}),
    }, null, 2) + "\n");
    process.exitCode = 1;
    return;
  }
  const document = result.document!;
  const library = result.library!;
  const layout = result.layout!;
  const media = await readMediaInputs(options, document);
  const rendered = renderComponentArticle(document, layout, library, media ? {
    imagePlan: media.imagePlan,
    assetManifest: media.assetManifest,
  } : undefined);
  const wechatValidation = validateWechatHtml(rendered.wechatHtml);
  if (!wechatValidation.valid) {
    process.stdout.write(JSON.stringify({ success: false, errors: wechatValidation.errors, wechatValidation }, null, 2) + "\n");
    process.exitCode = 1;
    return;
  }
  const output = await writeOutput(required("output"), rendered.wechatHtml);
  const preview = await writeOutput(options.preview ?? defaultPreviewPath(output), rendered.cleanPreviewHtml);
  process.stdout.write(JSON.stringify({
    success: true,
    output,
    preview,
    theme: result.decision!.theme,
    density: result.decision!.density,
    blockCount: result.decision!.blocks.length,
    sourceIntegrity: result.sourceIntegrity,
    contentIntegrity: rendered.contentIntegrity,
    derivedChrome: rendered.derivedChrome,
    wechatValidation,
  }, null, 2) + "\n");
}

// === verify-output: 单独检查任意已有的公众号粘贴片段 ===
async function handleVerifyOutput(): Promise<void> {
  const input = required("input");
  const validation = validateWechatHtml(await readFile(path.resolve(input), "utf8"));
  process.stdout.write(JSON.stringify({ success: validation.valid, ...validation }, null, 2) + "\n");
  if (!validation.valid) process.exitCode = 1;
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
    composition: library.manifest.composition,
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

function resolveSourceFormat(input: string, source?: string): SourceFormat {
  const explicit = options.format;
  const markdownByExtension = input.toLowerCase().endsWith(".md");
  // `normalize` intentionally emits a reviewable .md draft for every input.
  // A draft with no Markdown grammar is still line-oriented plain text; keep
  // those authored line breaks available to the semantic grouping pass.
  const hasMarkdownGrammar = source
    ? /(?:^#{1,6}\s|^>\s?|^\s*(?:[-+*]|\d+[.)、])\s+|^```|^!\[[^\]]*\]\(|^\|.*\|\s*$)/mu.test(source)
    : true;
  const format = explicit ?? (markdownByExtension && hasMarkdownGrammar ? "markdown" : "plain-text");
  if (format !== "markdown" && format !== "plain-text") {
    throw new Error(`Unsupported --format '${format}'. Convert rich documents to Markdown before this deterministic pipeline.`);
  }
  return format;
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
    "  normalize --input <article.docx|article.html|article.txt> --output <draft.md> [--format <auto|markdown|plain-text|html|docx|pdf>]  Create a reviewable Markdown draft",
    "  inspect   --input <article.md> [--output <analysis-input.json>]  Emit source facts for the Host Agent",
    "  render    --input <article.md> --decision <layout-decision.json> --output <html> [--preview <html>]  Also writes a copy-ready preview by default",
    "  commit    --input <article.md> --decision <layout-decision.json> --output <html> [--preview <html>]  Validate + render in one step",
    "  compose   --input <article.md|article.txt> --output <layout-decision.json> [--theme <id>]  Create a reviewable automatic baseline",
    "  verify-output --input <article.wechat.html>  Validate an existing paste fragment",
    "  themes    List all available themes with components and recommendation profiles",
    "  recommend --article-type <type> [--tone <a,b>] [--structure <pattern>]  Rank the top 3 themes",
    "  validate  --input <article.md> --decision <layout-decision.json>  Validate schema, source fidelity, recipe budgets, and theme legality",
  ].join("\n");
}

function defaultPreviewPath(output: string): string {
  const parsed = path.parse(output);
  return path.join(parsed.dir, `${parsed.name}.preview${parsed.ext || ".html"}`);
}
