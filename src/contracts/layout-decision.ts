import type { BlockMark, BlockStructure, BlockType } from "./block-document.js";
import type {
  ReadingGesture,
  ReadingPhase,
  RhythmDensity,
  ThemeRecommendationArticleType,
  ThemeRecommendationStructurePattern,
} from "./presentation.js";

export const ARTICLE_RECIPE_IDS = [
  "essay-reflection",
  "opinion-analysis",
  "literary-narrative",
  "tutorial-steps",
  "list-guide",
  "universal",
] as const;

export type ArticleRecipeId = (typeof ARTICLE_RECIPE_IDS)[number];

export interface LayoutDecisionBlock {
  id: string;
  type: BlockType;
  role: string;
  content: string;
  phase: ReadingPhase;
  gesture: ReadingGesture;
  emphasis: "quiet" | "medium" | "strong";
  level?: number;
  structure?: BlockStructure;
  marks?: BlockMark[];
  component?: string;
  variant?: string;
  reason?: string;
}

export interface LayoutDecision {
  specVersion: "3.0";
  sourceHash: string;
  articleType: ThemeRecommendationArticleType;
  tone?: string[];
  structurePattern: ThemeRecommendationStructurePattern;
  theme: string;
  themeReason: string;
  recipe: ArticleRecipeId;
  density: RhythmDensity;
  blocks: LayoutDecisionBlock[];
}
