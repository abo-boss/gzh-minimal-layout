import type {
  ThemeLibrary,
  ThemeRecommendationArticleType,
  ThemeRecommendationStructurePattern,
} from "../contracts/presentation.js";

export interface ThemeRecommendationInput {
  articleType: ThemeRecommendationArticleType;
  tones?: readonly string[];
  structurePattern?: ThemeRecommendationStructurePattern;
}

export interface ThemeRecommendation {
  themeId: string;
  name: string;
  score: number;
  reasons: string[];
}

const ARTICLE_TYPE_LABELS: Record<ThemeRecommendationArticleType, string> = {
  "personal-essay": "个人随笔",
  "opinion-knowledge": "观点/知识长文",
  "literary-prose": "文学散文",
  tutorial: "教程",
  "list-driven": "清单/步骤型内容",
  other: "其他文章",
};

const STRUCTURE_LABELS: Record<ThemeRecommendationStructurePattern, string> = {
  "experience-reflection-conclusion": "经历—反思—收束",
  "argument-evidence-conclusion": "论点—论据—结论",
  "narrative-reflection": "叙事—感悟",
  "fragmented-prose": "片段散文",
  "list-driven": "清单/步骤",
  other: "自由结构",
};

export function recommendThemes(
  libraries: readonly ThemeLibrary[],
  input: ThemeRecommendationInput,
  limit = 3,
): ThemeRecommendation[] {
  if (limit < 1) return [];
  const tones = uniqueNormalized(input.tones ?? []);

  return libraries
    .filter((library) => library.manifest.recommendation.articleTypes.includes(input.articleType))
    .map((library) => scoreTheme(library, input, tones))
    .sort((left, right) => right.score - left.score || left.themeId.localeCompare(right.themeId))
    .slice(0, limit);
}

function scoreTheme(
  library: ThemeLibrary,
  input: ThemeRecommendationInput,
  tones: string[],
): ThemeRecommendation {
  const profile = library.manifest.recommendation;
  const matchedTones = tones.filter((tone) => profile.tones.includes(tone));
  const supportsArticleType = profile.articleTypes.includes(input.articleType);
  const supportsStructure = input.structurePattern
    ? profile.structurePatterns.includes(input.structurePattern)
    : false;

  let score = 0;
  if (supportsArticleType) score += 60;
  score += matchedTones.length * 12;
  if (supportsStructure) score += 20;

  const reasons = [
    `主题方向：${profile.summary}`,
    ...(supportsArticleType ? [`匹配文章类型：${ARTICLE_TYPE_LABELS[input.articleType]}`] : []),
    ...matchedTones.map((tone) => `匹配语气：${tone}`),
    ...(supportsStructure && input.structurePattern
      ? [`匹配文章结构：${STRUCTURE_LABELS[input.structurePattern]}`]
      : []),
  ];

  return {
    themeId: library.manifest.id,
    name: library.manifest.name,
    score,
    reasons,
  };
}

function uniqueNormalized(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}
