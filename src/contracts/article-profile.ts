export const ARTICLE_TYPES = [
  "personal-essay",
  "opinion-knowledge",
  "literary-prose",
  "tutorial",
  "list-driven",
  "other",
] as const;

export const CONTENT_DENSITIES = ["low", "medium", "high"] as const;
export const SECTION_COMPLEXITIES = ["low", "medium", "high"] as const;
export const STRUCTURE_PATTERNS = [
  "experience-reflection-conclusion",
  "argument-evidence-conclusion",
  "narrative-reflection",
  "fragmented-prose",
  "list-driven",
  "other",
] as const;

export interface ArticleProfile {
  $schema?: string;
  articleType: (typeof ARTICLE_TYPES)[number];
  tone: string[];
  contentDensity: (typeof CONTENT_DENSITIES)[number];
  structurePattern: (typeof STRUCTURE_PATTERNS)[number];
  sectionComplexity: (typeof SECTION_COMPLEXITIES)[number];
}
