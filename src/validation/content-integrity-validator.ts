import type { BlockDocument } from "../contracts/block-document.js";

export interface ContentContribution {
  blockId: string;
  text: string;
  layoutItemId: string;
  slotPath: string;
}

export interface RenderedContentTrace {
  coveredBlockIds: string[];
  contributions: ContentContribution[];
}

export interface ContentChange {
  blockId: string;
  expected: string;
  actual: string;
}

export interface ContentIntegrityResult {
  valid: boolean;
  missingBlockIds: string[];
  duplicatedBlockIds: string[];
  unexpectedBlockIds: string[];
  reorderedBlockIds: string[];
  changedBlocks: ContentChange[];
}

export function validateContentIntegrity(
  document: BlockDocument,
  trace: RenderedContentTrace,
): ContentIntegrityResult {
  const expectedIds = document.blocks.map((block) => block.id);
  const expectedSet = new Set(expectedIds);
  const occurrenceCount = new Map<string, number>();

  for (const blockId of trace.coveredBlockIds) {
    occurrenceCount.set(blockId, (occurrenceCount.get(blockId) ?? 0) + 1);
  }

  const missingBlockIds = expectedIds.filter(
    (blockId) => !occurrenceCount.has(blockId),
  );
  const duplicatedBlockIds = expectedIds.filter(
    (blockId) => (occurrenceCount.get(blockId) ?? 0) > 1,
  );
  const unexpectedBlockIds = [
    ...new Set(
      trace.coveredBlockIds
        .concat(trace.contributions.map((entry) => entry.blockId))
        .filter((blockId) => !expectedSet.has(blockId)),
    ),
  ];

  const actualKnownOrder = trace.coveredBlockIds.filter((id) => expectedSet.has(id));
  const expectedCoveredOrder = expectedIds.filter((id) => actualKnownOrder.includes(id));
  const reorderedBlockIds = actualKnownOrder.filter(
    (id, index) => id !== expectedCoveredOrder[index],
  );

  const contributionsByBlock = new Map<string, string[]>();
  for (const contribution of trace.contributions) {
    const entries = contributionsByBlock.get(contribution.blockId) ?? [];
    entries.push(contribution.text);
    contributionsByBlock.set(contribution.blockId, entries);
  }

  const changedBlocks: ContentChange[] = [];
  for (const block of document.blocks) {
    const actual = (contributionsByBlock.get(block.id) ?? []).join("\n");
    if (normalizeForIntegrity(actual) !== normalizeForIntegrity(block.content)) {
      changedBlocks.push({ blockId: block.id, expected: block.content, actual });
    }
  }

  return {
    valid:
      missingBlockIds.length === 0 &&
      duplicatedBlockIds.length === 0 &&
      unexpectedBlockIds.length === 0 &&
      reorderedBlockIds.length === 0 &&
      changedBlocks.length === 0,
    missingBlockIds,
    duplicatedBlockIds,
    unexpectedBlockIds,
    reorderedBlockIds,
    changedBlocks,
  };
}

function normalizeForIntegrity(value: string): string {
  return value.replace(/\r\n?/g, "\n").split(/\s+/u).filter(Boolean).join(" ");
}
