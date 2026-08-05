import { describe, expect, it } from "vitest";

import { assertAgentAnalysisBundle } from "../src/agent/agent-analysis-bundle.js";
import { analyzeArticle } from "../src/agent/analyze-article.js";
import { createBaselineReadingPlan } from "../src/reading/reading-plan.js";

const source = "标题\n\n导语。\n\n一、章节\n\n正文。";

function createBundle() {
  const analysis = analyzeArticle(source, { sourceId: "agent-bundle", format: "plain-text" });
  return {
    sourceManifest: analysis.sourceManifest,
    articleProfile: analysis.articleProfile,
    blockDocument: analysis.blockDocument,
    readingPlan: createBaselineReadingPlan(analysis.blockDocument),
  };
}

describe("Agent analysis bundle", () => {
  it("accepts aligned canonical analysis contracts", () => {
    expect(() => assertAgentAnalysisBundle(createBundle())).not.toThrow();
  });

  it("rejects profile and BlockDocument semantic drift", () => {
    const bundle = createBundle();
    bundle.blockDocument.articleType = "personal-essay";
    expect(() => assertAgentAnalysisBundle(bundle)).toThrow(/AGENT_ANALYSIS_ARTICLE_TYPE_MISMATCH/);
  });

  it("requires an explicit segmentation decision for every source segment", () => {
    const bundle = createBundle();
    bundle.blockDocument.segmentationDecisions = (bundle.blockDocument.segmentationDecisions ?? []).slice(1);
    expect(() => assertAgentAnalysisBundle(bundle)).toThrow(/AGENT_ANALYSIS_SEGMENTATION_INCOMPLETE/);
  });

  it("rejects ReadingPlan items that do not match Block order", () => {
    const bundle = createBundle();
    bundle.readingPlan.items = [...bundle.readingPlan.items].reverse();
    expect(() => assertAgentAnalysisBundle(bundle)).toThrow(/AGENT_ANALYSIS_READING_MISMATCH/);
  });
});
