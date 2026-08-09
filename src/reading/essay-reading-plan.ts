import { displayMarkdownText } from "../agent/inline-markdown.js";
import type { BlockDocument } from "../contracts/block-document.js";
import type { ReadingPlan } from "../contracts/presentation.js";
import { createBaselineReadingPlan } from "./reading-plan.js";

const TURNING_PHRASE = /(?:后来|突然|忽然|才知道|我突然|然后你会|我没有说再见)/u;

export function createEssayReadingPlan(document: BlockDocument): ReadingPlan {
  const baseline = createBaselineReadingPlan(document);
  const paragraphIndexes = document.blocks
    .map((block, index) => block.type === "paragraph" ? index : -1)
    .filter((index) => index >= 0);
  const releaseStart = paragraphIndexes.at(-3) ?? Number.POSITIVE_INFINITY;

  return {
    ...baseline,
    id: `${document.id}-essay-reading`,
    items: baseline.items.map((item, index) => {
      const block = document.blocks[index]!;
      if (block.type !== "paragraph") return item;

      const content = displayMarkdownText(block.content).trim();
      const lineCount = content.split(/\r?\n/gu).filter(Boolean).length;
      if (index >= releaseStart || /^写于/u.test(content)) {
        return { ...item, phase: "exit", gesture: "release", emphasisFunction: "affective", strength: "medium", reason: "essay-closing-release" };
      }
      if (lineCount >= 3) {
        return { ...item, gesture: "pause", emphasisFunction: "cognitive", strength: "medium", reason: "essay-verse-pause" };
      }
      if (TURNING_PHRASE.test(content)) {
        return { ...item, gesture: "pivot", emphasisFunction: "cognitive", strength: "medium", reason: "essay-narrative-turn" };
      }
      return item;
    }),
  };
}
