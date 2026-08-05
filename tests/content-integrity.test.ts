import { describe, expect, it } from "vitest";

import type { BlockDocument } from "../src/contracts/block-document.js";
import {
  validateContentIntegrity,
  type RenderedContentTrace,
} from "../src/validation/content-integrity-validator.js";

const document: BlockDocument = {
  specVersion: "1.0",
  id: "integrity-fixture",
  blocks: [
    { id: "a", type: "paragraph", role: "narrative", content: "第一段。", importance: 0.5, sourceOrder: 1 },
    { id: "b", type: "paragraph", role: "narrative", content: "第二段。", importance: 0.5, sourceOrder: 2 },
  ],
};

function trace(overrides: Partial<RenderedContentTrace> = {}): RenderedContentTrace {
  return {
    coveredBlockIds: ["a", "b"],
    contributions: [
      { blockId: "a", text: "第一段。", layoutItemId: "one", slotPath: "content" },
      { blockId: "b", text: "第二段。", layoutItemId: "two", slotPath: "content" },
    ],
    ...overrides,
  };
}

describe("content integrity", () => {
  it("accepts an unchanged, complete, ordered trace", () => {
    expect(validateContentIntegrity(document, trace()).valid).toBe(true);
  });

  it("reports deletion, duplication, mutation, and reordering", () => {
    expect(
      validateContentIntegrity(document, trace({ coveredBlockIds: ["b", "a", "a"] })),
    ).toMatchObject({ valid: false, duplicatedBlockIds: ["a"] });

    expect(
      validateContentIntegrity(
        document,
        trace({
          contributions: [
            { blockId: "a", text: "被改写。", layoutItemId: "one", slotPath: "content" },
          ],
        }),
      ),
    ).toMatchObject({
      valid: false,
      changedBlocks: expect.arrayContaining([
        expect.objectContaining({ blockId: "a" }),
        expect.objectContaining({ blockId: "b" }),
      ]),
    });
  });
});
