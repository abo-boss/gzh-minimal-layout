import type { LayoutDecision } from "../contracts/layout-decision.js";
import { sha256 } from "../source/inspect-source.js";

export interface DecisionSourceIntegrity {
  valid: boolean;
  hashMatches: boolean;
  contentMatches: boolean;
  sourceHash: string;
  decisionHash: string;
  firstMismatch?: { offset: number; source: string; decision: string };
}

export function validateDecisionSource(
  decision: LayoutDecision,
  source: string,
): DecisionSourceIntegrity {
  const sourceHash = sha256(source);
  const sourceText = canonicalSource(source);
  const decisionText = canonicalSource(decision.blocks.map((block) => block.content).join("\n"));
  const mismatchOffset = firstMismatchOffset(sourceText, decisionText);
  const hashMatches = decision.sourceHash === sourceHash;
  const contentMatches = mismatchOffset === -1;
  return {
    valid: hashMatches && contentMatches,
    hashMatches,
    contentMatches,
    sourceHash,
    decisionHash: decision.sourceHash,
    ...(contentMatches ? {} : {
      firstMismatch: {
        offset: mismatchOffset,
        source: sourceText.slice(Math.max(0, mismatchOffset - 16), mismatchOffset + 32),
        decision: decisionText.slice(Math.max(0, mismatchOffset - 16), mismatchOffset + 32),
      },
    }),
  };
}

function canonicalSource(value: string): string {
  return value.replace(/^\uFEFF/u, "").replace(/\s+/gu, "");
}

function firstMismatchOffset(left: string, right: string): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return -1;
}
