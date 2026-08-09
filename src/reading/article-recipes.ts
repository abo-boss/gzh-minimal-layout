import type { ThemeRecommendationArticleType } from "../contracts/presentation.js";
import type { ArticleRecipeId } from "../contracts/layout-decision.js";

export interface ArticleRecipe {
  id: ArticleRecipeId;
  label: string;
  description: string;
  articleTypes: ThemeRecommendationArticleType[];
  maxExplicitSelections: number;
  maxStrongBlocks: number;
  guidance: string[];
}

export const ARTICLE_RECIPES: ArticleRecipe[] = [
  {
    id: "essay-reflection",
    label: "经历—反思—收束",
    description: "个人经历与方法论反思并行，普通段落保持连续阅读，只突出转折、核心判断和结尾。",
    articleTypes: ["personal-essay", "opinion-knowledge"],
    maxExplicitSelections: 3,
    maxStrongBlocks: 2,
    guidance: ["保留叙事呼吸", "编号原因合并为列表", "最多一个核心判断块", "结尾与 CTA 分开"],
  },
  {
    id: "opinion-analysis",
    label: "观点—论证—结论",
    description: "以论点和证据组织章节，普通论证使用正文组件，少量判断使用重点组件。",
    articleTypes: ["opinion-knowledge"],
    maxExplicitSelections: 4,
    maxStrongBlocks: 2,
    guidance: ["论点与解释可合并", "不同论点不可跨章合并", "每章最多一个强重点", "避免逐段卡片化"],
  },
  {
    id: "literary-narrative",
    label: "叙事—停顿—余韵",
    description: "以连续正文和章节留白为主，引用与结尾承担少量视觉停顿。",
    articleTypes: ["literary-prose", "personal-essay"],
    maxExplicitSelections: 2,
    maxStrongBlocks: 1,
    guidance: ["正文默认开放表面", "短句不自动变卡片", "只保留一个视觉焦点", "结尾留白大于正文"],
  },
  {
    id: "tutorial-steps",
    label: "问题—步骤—结果",
    description: "步骤、条件和结果保持结构完整，提示与结论按需使用。",
    articleTypes: ["tutorial"],
    maxExplicitSelections: 5,
    maxStrongBlocks: 3,
    guidance: ["连续步骤合并为列表", "代码与提示独立", "一个步骤组只用一种视觉语言", "结论不重复步骤"],
  },
  {
    id: "list-guide",
    label: "分类—清单—行动",
    description: "并列项目形成结构化列表，说明文字保持普通正文，避免每项单独卡片。",
    articleTypes: ["list-driven"],
    maxExplicitSelections: 4,
    maxStrongBlocks: 2,
    guidance: ["连续同类条目合并", "项目说明不拆成孤段", "只突出总判断", "行动区最多一个"],
  },
  {
    id: "universal",
    label: "通用长文",
    description: "无法稳定归类时采用克制的标题、正文、列表和结尾骨架。",
    articleTypes: ["other", "personal-essay", "opinion-knowledge", "literary-prose", "tutorial", "list-driven"],
    maxExplicitSelections: 3,
    maxStrongBlocks: 2,
    guidance: ["普通正文不做显式组件选择", "结构组件优先于装饰组件", "不确定时保持原结构", "强组件宁缺毋滥"],
  },
];

export function recipeById(id: ArticleRecipeId): ArticleRecipe {
  const recipe = ARTICLE_RECIPES.find((entry) => entry.id === id);
  if (!recipe) throw new Error(`Unknown article recipe ${id}`);
  return recipe;
}

export function recipesForArticleType(articleType: ThemeRecommendationArticleType): ArticleRecipe[] {
  return ARTICLE_RECIPES.filter((recipe) => recipe.articleTypes.includes(articleType));
}
