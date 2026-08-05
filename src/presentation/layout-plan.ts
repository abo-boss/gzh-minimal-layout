import type { Block, BlockDocument } from "../contracts/block-document.js";
import type {
  AgentLayoutSelection,
  ComponentCandidate,
  LayoutPlan,
  ReadingPlan,
  RhythmDensity,
  RhythmToken,
  ThemeLibrary,
} from "../contracts/presentation.js";
import { assertReadingPlan } from "../reading/reading-plan.js";
import { candidatesFor } from "../theme/theme-library.js";

export function createLayoutPlan(
  document: BlockDocument,
  readingPlan: ReadingPlan,
  library: ThemeLibrary,
  options: {
    density?: RhythmDensity;
    selections?: AgentLayoutSelection[];
  } = {},
): LayoutPlan {
  assertReadingPlan(document, readingPlan);
  const density = options.density ?? library.manifest.defaultDensity;
  const requested = new Map((options.selections ?? []).map((selection) => [selection.blockId, selection]));
  if (requested.size !== (options.selections ?? []).length) throw new Error("Agent selections contain duplicate block ids");
  for (const blockId of requested.keys()) {
    if (!document.blocks.some((block) => block.id === blockId)) throw new Error(`Agent selection references unknown block ${blockId}`);
  }

  const items = document.blocks.map((block, index) => {
    const reading = readingPlan.items[index]!;
    const candidates = candidatesFor(block, reading, library);
    if (candidates.length === 0) throw new Error(`Theme ${library.manifest.id} has no legal candidate for ${block.id}`);
    const selection = requested.get(block.id);
    const chosen = selection
      ? candidates.find((candidate) => candidate.componentId === selection.componentId && candidate.variantId === selection.variantId)
      : candidates[0];
    if (!chosen) throw new Error(`Agent selected an illegal component candidate for ${block.id}`);
    const rhythmToken = resolveRhythmToken(block, index, library);
    return {
      id: `layout-${String(index + 1).padStart(3, "0")}`,
      sourceBlockIds: [block.id] as [string],
      componentId: chosen.componentId,
      variantId: chosen.variantId,
      readingGesture: reading.gesture,
      rhythmToken,
      gapBefore: index === 0 ? 0 : library.manifest.rhythm.modes[density][rhythmToken],
      reason: selection?.reason ?? `baseline-candidate:${chosen.id}`,
    };
  });

  const plan: LayoutPlan = {
    specVersion: "1.0",
    id: `${document.id}-${library.manifest.id}-${density}`,
    documentId: document.id,
    themeId: library.manifest.id,
    density,
    items,
  };
  assertLayoutPlan(document, readingPlan, plan, library);
  return plan;
}

export function assertLayoutPlan(
  document: BlockDocument,
  readingPlan: ReadingPlan,
  plan: LayoutPlan,
  library: ThemeLibrary,
): void {
  if (plan.documentId !== document.id || plan.themeId !== library.manifest.id) {
    throw new Error("LayoutPlan document or theme identity does not match the render inputs");
  }
  if (plan.items.length !== document.blocks.length) throw new Error("LayoutPlan must cover every block exactly once");

  let adjacentStrong = false;
  const strongBySection = new Map<string, number>();
  let panelCount = 0;
  for (const [index, block] of document.blocks.entries()) {
    const item = plan.items[index]!;
    const reading = readingPlan.items[index]!;
    if (item.sourceBlockIds.length !== 1 || item.sourceBlockIds[0] !== block.id) {
      throw new Error(`LayoutPlan item ${index} must reference ${block.id} exactly once`);
    }
    const candidate = candidatesFor(block, reading, library).find(
      (entry) => entry.componentId === item.componentId && entry.variantId === item.variantId,
    );
    if (!candidate) throw new Error(`LayoutPlan uses an illegal component candidate for ${block.id}`);
    if (item.readingGesture !== reading.gesture) {
      throw new Error(`LayoutPlan reading gesture for ${block.id} does not match ReadingPlan`);
    }
    const expectedToken = resolveRhythmToken(block, index, library);
    const expectedGap = index === 0 ? 0 : library.manifest.rhythm.modes[plan.density][expectedToken];
    if (item.rhythmToken !== expectedToken || item.gapBefore !== expectedGap) {
      throw new Error(`LayoutPlan rhythm for ${block.id} must be resolved by the selected theme`);
    }
    if (candidate.surface === "panel") panelCount += 1;
    const isStrong = candidate.visualWeight === "strong";
    if (isStrong && adjacentStrong && library.manifest.budgets.noAdjacentStrong) {
      throw new Error(`Adjacent strong components are not allowed at ${block.id}`);
    }
    adjacentStrong = isStrong;
    if (isStrong) {
      const section = block.sectionId ?? "document";
      strongBySection.set(section, (strongBySection.get(section) ?? 0) + 1);
    }
  }

  for (const [section, count] of strongBySection) {
    if (count > library.manifest.budgets.maxStrongPerSection) {
      throw new Error(`Section ${section} exceeds the strong-component budget`);
    }
  }
  if (document.blocks.length > 0 && panelCount / document.blocks.length > library.manifest.budgets.maxSurfaceRatio) {
    throw new Error("LayoutPlan exceeds the theme surface budget");
  }
}

function resolveRhythmToken(block: Block, index: number, library: ThemeLibrary): RhythmToken {
  if (index === 0) return "close";
  return library.manifest.rhythm.relationMap[block.relationToPrevious ?? "default"] ?? "flow";
}

export function candidateSummary(candidate: ComponentCandidate): string {
  return `${candidate.componentId}:${candidate.variantId}`;
}
