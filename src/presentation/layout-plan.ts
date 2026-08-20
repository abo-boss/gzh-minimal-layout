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
import type { ArticleRecipeId } from "../contracts/layout-decision.js";
import { assertReadingPlan } from "../reading/reading-plan.js";
import { candidatesFor } from "../theme/theme-library.js";

export function createLayoutPlan(
  document: BlockDocument,
  readingPlan: ReadingPlan,
  library: ThemeLibrary,
  options: {
    density?: RhythmDensity;
    selections?: AgentLayoutSelection[];
    recipe?: ArticleRecipeId;
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
      : defaultCandidateForBlock(block, candidates, library, options.recipe);
    if (!chosen) throw new Error(`Agent selected an illegal component candidate for ${block.id}`);
    const rhythmToken = resolveRhythmToken(document, block, reading, index, library);
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

/**
 * Resolve the theme's quiet baseline. Reading gestures own spacing, not visual
 * decoration; an Agent must explicitly opt a block into a stronger treatment.
 */
export function defaultCandidateForBlock(
  block: Block,
  candidates: ComponentCandidate[],
  library: ThemeLibrary,
  recipeId?: ArticleRecipeId,
): ComponentCandidate {
  const selectedRecipe = recipeId
    ? library.manifest.composition.recipes.find((recipe) => recipe.id === recipeId)
    : undefined;
  const preferredComponents = library.manifest.composition.mappings
    .filter((mapping) => mapping.blockTypes.includes(block.type))
    .filter((mapping) => !mapping.levels || (block.level !== undefined && mapping.levels.includes(block.level)))
    .map((mapping) => mapping.componentId)
    // A mapping can intentionally promote a sparse semantic role (for example
    // key-insight → focus). Theme recipes may list that component as an accent,
    // so do not discard an otherwise legal explicit mapping here.
    .filter((componentId) => !selectedRecipe || selectedRecipe.coreComponents.includes(componentId) || selectedRecipe.accentComponents.includes(componentId))
    .concat(selectedRecipe?.coreComponents ?? []);

  for (const componentId of preferredComponents) {
    const component = library.components.find((entry) => entry.id === componentId);
    if (!component) continue;
    const fallback = candidates.find((candidate) => candidate.componentId === componentId && candidate.variantId === component.fallbackVariant);
    if (fallback) return fallback;
    const first = candidates.find((candidate) => candidate.componentId === componentId);
    if (first) return first;
  }
  return candidates[0]!;
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
    const expectedToken = resolveRhythmToken(document, block, reading, index, library);
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

function resolveRhythmToken(
  document: BlockDocument,
  block: Block,
  reading: ReadingPlan["items"][number],
  index: number,
  library: ThemeLibrary,
): RhythmToken {
  if (index === 0) return "close";
  const previous = document.blocks[index - 1];
  if (block.type === "heading" && block.level === 2) return library.manifest.rhythm.relationMap["new-section"] ?? "section";
  if (block.type === "heading") return library.manifest.rhythm.relationMap[block.relationToPrevious ?? "turning-point"] ?? "turn";
  // A conclusion heading already owns the section break. Consecutive ending
  // groups must read as one closing passage, not as four independent endings.
  if (block.type === "ending" && (previous?.type === "heading" || previous?.type === "ending")) {
    return library.manifest.rhythm.relationMap.continuation ?? "flow";
  }
  if (reading.gesture === "pause") return library.manifest.rhythm.relationMap["new-argument"] ?? "break";
  if (reading.gesture === "pivot") return library.manifest.rhythm.relationMap["turning-point"] ?? "turn";
  if (reading.gesture === "release") return library.manifest.rhythm.relationMap["before-ending"] ?? "release";
  return library.manifest.rhythm.relationMap[block.relationToPrevious ?? "default"] ?? "flow";
}

export function candidateSummary(candidate: ComponentCandidate): string {
  return `${candidate.componentId}:${candidate.variantId}`;
}
