import type { BlockType } from "./block-document.js";

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
  componentPaths: string[];
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
