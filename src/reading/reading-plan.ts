import type { Block, BlockDocument } from "../contracts/block-document.js";
import type {
  EmphasisFunction,
  EmphasisStrength,
  ReadingGesture,
  ReadingPhase,
  ReadingPlan,
} from "../contracts/presentation.js";

export function createBaselineReadingPlan(document: BlockDocument): ReadingPlan {
  return {
    specVersion: "1.0",
    id: `${document.id}-reading`,
    documentId: document.id,
    items: document.blocks.map((block) => ({
      blockId: block.id,
      compositionGroupId: block.groupId ?? block.sectionId ?? `group-${block.sourceOrder + 1}`,
      phase: resolvePhase(block),
      gesture: resolveGesture(block),
      emphasisFunction: resolveEmphasisFunction(block),
      strength: resolveStrength(block),
      reason: reasonFor(block),
    })),
  };
}

export function assertReadingPlan(document: BlockDocument, plan: ReadingPlan): void {
  if (plan.documentId !== document.id) {
    throw new Error(`ReadingPlan documentId ${plan.documentId} does not match ${document.id}`);
  }
  if (plan.items.length !== document.blocks.length) {
    throw new Error("ReadingPlan must cover every block exactly once");
  }
  for (const [index, block] of document.blocks.entries()) {
    if (plan.items[index]?.blockId !== block.id) {
      throw new Error(`ReadingPlan item ${index} must reference ${block.id}`);
    }
  }
}

function resolvePhase(block: Block): ReadingPhase {
  if (["article-title", "article-subtitle", "metadata", "lead"].includes(block.type)) return "entry";
  if (["ending", "cta"].includes(block.type) || block.relationToPrevious === "before-ending") return "exit";
  return "body";
}

function resolveGesture(block: Block): ReadingGesture {
  if (block.type === "article-title" || block.type === "heading") return "anchor";
  if (block.type === "ending" || block.type === "cta" || block.relationToPrevious === "before-ending") return "release";
  if (block.relationToPrevious === "turning-point" || block.relationToPrevious === "new-section") return "pivot";
  if (["quote", "callout", "divider"].includes(block.type)) return "pause";
  return "flow";
}

function resolveEmphasisFunction(block: Block): EmphasisFunction {
  if (["article-title", "heading"].includes(block.type)) return "structural";
  if (["quote", "callout", "step"].includes(block.type) || block.relationToPrevious === "turning-point") return "cognitive";
  if (block.type === "ending") return "affective";
  if (block.type === "cta") return "utility";
  return "none";
}

function resolveStrength(block: Block): EmphasisStrength {
  if (block.type === "article-title") return "strong";
  if (["heading", "quote", "callout", "ending", "cta"].includes(block.type)) return "medium";
  if (block.relationToPrevious === "turning-point") return "medium";
  return "quiet";
}

function reasonFor(block: Block): string {
  if (block.type === "article-title") return "document-entry-anchor";
  if (block.type === "heading") return "structural-reading-anchor";
  if (block.type === "ending" || block.type === "cta" || block.relationToPrevious === "before-ending") return "reading-release";
  if (block.relationToPrevious && block.relationToPrevious !== "default") return `relation-${block.relationToPrevious}`;
  return `type-${block.type}`;
}
