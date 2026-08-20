import type { BlockMark, BlockType } from "./block-document.js";
import type { ArticleRecipeId } from "./layout-decision.js";

export const READING_PHASES = ["entry", "body", "exit"] as const;
export const READING_GESTURES = ["flow", "pause", "pivot", "anchor", "release"] as const;
export const EMPHASIS_FUNCTIONS = ["none", "structural", "cognitive", "affective", "utility"] as const;
export const EMPHASIS_STRENGTHS = ["quiet", "medium", "strong"] as const;
export const RHYTHM_DENSITIES = ["dense", "balanced", "airy"] as const;
export const RHYTHM_TOKENS = ["close", "flow", "break", "turn", "section", "release"] as const;

export type ReadingPhase = (typeof READING_PHASES)[number];
export type ReadingGesture = (typeof READING_GESTURES)[number];
export type EmphasisFunction = (typeof EMPHASIS_FUNCTIONS)[number];
export type EmphasisStrength = (typeof EMPHASIS_STRENGTHS)[number];
export type RhythmDensity = (typeof RHYTHM_DENSITIES)[number];
export type RhythmToken = (typeof RHYTHM_TOKENS)[number];
export const THEME_RECOMMENDATION_ARTICLE_TYPES = [
  "personal-essay",
  "opinion-knowledge",
  "literary-prose",
  "tutorial",
  "list-driven",
  "other",
] as const;
export const THEME_RECOMMENDATION_STRUCTURE_PATTERNS = [
  "experience-reflection-conclusion",
  "argument-evidence-conclusion",
  "narrative-reflection",
  "fragmented-prose",
  "list-driven",
  "other",
] as const;
export type ThemeRecommendationArticleType = (typeof THEME_RECOMMENDATION_ARTICLE_TYPES)[number];
export type ThemeRecommendationStructurePattern = (typeof THEME_RECOMMENDATION_STRUCTURE_PATTERNS)[number];

export interface ReadingPlanItem {
  blockId: string;
  compositionGroupId: string;
  phase: ReadingPhase;
  gesture: ReadingGesture;
  emphasisFunction: EmphasisFunction;
  strength: EmphasisStrength;
  reason: string;
}

export interface ReadingPlan {
  specVersion: "1.0";
  id: string;
  documentId: string;
  items: ReadingPlanItem[];
}

export interface StyleMap {
  [role: string]: Record<string, string>;
}

/** Theme-owned treatment for author-provided inline semantic marks. */
export type InlineMarkStyles = Partial<Record<BlockMark["type"], Record<string, string>>>;

export interface CandidateRule {
  blockTypes?: BlockType[];
  roles?: string[];
  gestures?: ReadingGesture[];
  levels?: number[];
}

export interface ComponentVariant {
  id: string;
  label: string;
  priority: number;
  visualWeight: EmphasisStrength;
  surface: "open" | "panel";
  emphasisCost: number;
  accepts?: CandidateRule;
  styles: StyleMap;
}

export type ComponentKind = "masthead" | "heading" | "prose" | "ending" | "list" | "quote" | "table" | "cta" | "image";
export type ComponentSlotSource =
  | "content"
  | "content-initial"
  | "content-remainder"
  | "heading-title"
  | "heading-marker"
  | "list-items"
  | "quote-content"
  | "quote-attribution"
  | "image-src"
  | "image-alt"
  | "image-caption"
  | "table-headers"
  | "table-rows"
  | "cta-eyebrow"
  | "cta-prompt"
  | "cta-highlight";

export interface ComponentSlot {
  name: "content" | "initial" | "remainder" | "marker" | "items" | "attribution" | "src" | "alt" | "caption" | "headers" | "rows" | "eyebrow" | "prompt" | "highlight";
  source: ComponentSlotSource;
  required: boolean;
  format?: "source" | "arabic" | "two-digit-arabic" | "chinese";
}

export interface ComponentDefinition {
  specVersion: "1.0";
  id: string;
  kind: ComponentKind;
  accepts: CandidateRule & { blockTypes: BlockType[] };
  slots: ComponentSlot[];
  fallbackVariant: string;
  template: string;
  baseStyles: StyleMap;
  variants: ComponentVariant[];
}

export interface EssayRhythmVariant {
  label: string;
  visualWeight: EmphasisStrength;
  surface: "open" | "panel";
  emphasisCost: number;
  styles: StyleMap;
}

export interface ThemeManifest {
  specVersion: "1.0";
  id: string;
  version: string;
  name: string;
  description: string;
  recommendation: {
    summary: string;
    articleTypes: ThemeRecommendationArticleType[];
    tones: string[];
    structurePatterns: ThemeRecommendationStructurePattern[];
  };
  defaultDensity: RhythmDensity;
  tokens: Record<string, unknown>;
  rhythm: {
    modes: Record<RhythmDensity, Record<RhythmToken, number>>;
    relationMap: Record<string, RhythmToken>;
  };
  budgets: {
    maxStrongPerSection: number;
    maxSurfaceRatio: number;
    noAdjacentStrong: boolean;
  };
  inlineMarks: InlineMarkStyles;
  essay?: {
    flow: EssayRhythmVariant;
    pause: EssayRhythmVariant;
    pivot: EssayRhythmVariant;
    release: EssayRhythmVariant;
  };
  /**
   * The author-facing half of a theme package.  This is deliberately data,
   * rather than prose hidden in a README: the renderer can use its baseline
   * mapping and the same data can drive a theme gallery and authoring guide.
   */
  composition: ThemeComposition;
  componentPaths: string[];
}

export interface ThemeCompositionRecipe {
  id: ArticleRecipeId;
  label: string;
  articleTypes: ThemeRecommendationArticleType[];
  coreComponents: string[];
  accentComponents: string[];
  maxAccentKinds: number;
  guidance: string[];
}

export interface ThemeComponentMapping {
  blockTypes: BlockType[];
  componentId: string;
  levels?: number[];
}

/**
 * Theme-owned treatment for layout chrome derived from the document structure.
 * These fragments are intentionally outside the source trace: they may repeat
 * a source sentence (the intro) or add fixed editorial UI (END/signature), but
 * never replace, reorder, or alter an authored block.
 */
export interface ThemeChrome {
  intro: { enabled: boolean; styles: StyleMap };
  directory: { enabled: boolean; maxItems: number; styles: StyleMap };
  chapter: { enabled: boolean; label: string; styles: StyleMap };
  end: { enabled: boolean; label: string; styles: StyleMap };
  signature: {
    enabled: boolean;
    authorTemplate: string;
    ctaTemplate: string;
    styles: StyleMap;
  };
}

/**
 * Guardrails for semantic inline emphasis. Author-provided Markdown marks are
 * preserved verbatim; this budget constrains only marks inferred by the
 * typesetting pass.
 */
export interface InlineMarkBudget {
  minPerParagraph: number;
  maxPerParagraph: number;
  maxHighlightPerParagraph: number;
  maxStyleKindsPerParagraph: number;
  preferredPhraseMinChars: number;
  preferredPhraseMaxChars: number;
  maxStrongAnchorsPerArticle: number;
}

/** Shared baseline declared by every bundled theme. */
export const DEFAULT_INLINE_MARK_BUDGET: InlineMarkBudget = {
  minPerParagraph: 0,
  maxPerParagraph: 4,
  maxHighlightPerParagraph: 1,
  maxStyleKindsPerParagraph: 2,
  preferredPhraseMinChars: 3,
  preferredPhraseMaxChars: 15,
  maxStrongAnchorsPerArticle: 5,
};

export interface ThemeComposition {
  structureModel: string;
  inlineMarkBudget: InlineMarkBudget;
  recipes: ThemeCompositionRecipe[];
  mappings: ThemeComponentMapping[];
  chrome: ThemeChrome;
}

export interface LoadedComponent extends ComponentDefinition {
  templateHtml: string;
}

export interface ThemeLibrary {
  manifest: ThemeManifest;
  components: LoadedComponent[];
}

export interface ComponentCandidate {
  id: string;
  componentId: string;
  variantId: string;
  priority: number;
  visualWeight: EmphasisStrength;
  surface: "open" | "panel";
  emphasisCost: number;
}

export interface CandidateCatalog {
  specVersion: "1.0";
  documentId: string;
  themeId: string;
  blocks: Array<{
    blockId: string;
    type: BlockType;
    role: string;
    gesture: ReadingGesture;
    candidates: ComponentCandidate[];
  }>;
}

export interface AgentLayoutSelection {
  blockId: string;
  componentId: string;
  variantId: string;
  reason: string;
}

export interface LayoutPlanItem {
  id: string;
  sourceBlockIds: [string];
  componentId: string;
  variantId: string;
  readingGesture: ReadingGesture;
  rhythmToken: RhythmToken;
  gapBefore: number;
  reason: string;
}

export interface LayoutPlan {
  specVersion: "1.0";
  id: string;
  documentId: string;
  themeId: string;
  density: RhythmDensity;
  items: LayoutPlanItem[];
}
