import type { ArticleProfile } from "../contracts/article-profile.js";
import type { BlockDocument } from "../contracts/block-document.js";
import type { ReadingPlan } from "../contracts/presentation.js";
import type { SourceManifest } from "../source/source-manifest.js";
import { assertReadingPlan } from "../reading/reading-plan.js";
import { ContractValidationError, type ValidationIssue } from "../validation/validation-error.js";

export interface AgentAnalysisBundle {
  sourceManifest: SourceManifest;
  articleProfile: ArticleProfile;
  blockDocument: BlockDocument;
  readingPlan: ReadingPlan;
}

export function assertAgentAnalysisBundle(bundle: AgentAnalysisBundle): void {
  const { sourceManifest, articleProfile, blockDocument, readingPlan } = bundle;
  const issues: ValidationIssue[] = [];

  if (blockDocument.articleType !== articleProfile.articleType) {
    issues.push({
      code: "AGENT_ANALYSIS_ARTICLE_TYPE_MISMATCH",
      path: "/blockDocument/articleType",
      message: "BlockDocument articleType must match ArticleProfile articleType.",
    });
  }
  if (!sameArray(blockDocument.moods ?? [], articleProfile.tone)) {
    issues.push({
      code: "AGENT_ANALYSIS_TONE_MISMATCH",
      path: "/blockDocument/moods",
      message: "BlockDocument moods must exactly match ArticleProfile tone.",
    });
  }

  const segments = new Set(sourceManifest.segments.map((segment) => segment.id));
  const decisions = blockDocument.segmentationDecisions ?? [];
  const decisionRefs = new Set<string>();
  for (const [index, decision] of decisions.entries()) {
    if (decisionRefs.has(decision.sourceRef)) {
      issues.push({
        code: "AGENT_ANALYSIS_SEGMENTATION_DUPLICATE",
        path: `/blockDocument/segmentationDecisions/${index}/sourceRef`,
        message: `Source segment ${decision.sourceRef} has more than one segmentation decision.`,
      });
    }
    if (!segments.has(decision.sourceRef)) {
      issues.push({
        code: "AGENT_ANALYSIS_SEGMENTATION_UNKNOWN",
        path: `/blockDocument/segmentationDecisions/${index}/sourceRef`,
        message: `Source segment ${decision.sourceRef} does not exist in SourceManifest.`,
      });
    }
    decisionRefs.add(decision.sourceRef);
  }
  for (const segment of sourceManifest.segments) {
    if (!decisionRefs.has(segment.id)) {
      issues.push({
        code: "AGENT_ANALYSIS_SEGMENTATION_INCOMPLETE",
        path: "/blockDocument/segmentationDecisions",
        message: `Source segment ${segment.id} is missing an explicit keep or split decision.`,
      });
    }
  }

  try {
    assertReadingPlan(blockDocument, readingPlan);
  } catch (error) {
    issues.push({
      code: "AGENT_ANALYSIS_READING_MISMATCH",
      path: "/readingPlan",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (issues.length > 0) {
    throw new ContractValidationError("Agent analysis bundle validation failed", issues);
  }
}

function sameArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
