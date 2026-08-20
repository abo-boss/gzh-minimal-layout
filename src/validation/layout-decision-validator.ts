import type { BlockDocument } from "../contracts/block-document.js";
import type { LayoutDecision } from "../contracts/layout-decision.js";
import type { ReadingPlan, ThemeLibrary } from "../contracts/presentation.js";
import { defaultCandidateForBlock } from "../presentation/layout-plan.js";
import { recipeById } from "../reading/article-recipes.js";
import { candidatesFor } from "../theme/theme-library.js";

export function validateDecisionSemantics(
  decision: LayoutDecision,
  document: BlockDocument,
  readingPlan: ReadingPlan,
  library: ThemeLibrary,
): string[] {
  const errors: string[] = [];
  const recipe = recipeById(decision.recipe);
  if (!recipe.articleTypes.includes(decision.articleType)) {
    errors.push(`recipe '${decision.recipe}' is not compatible with articleType '${decision.articleType}'`);
  }
  const themeRecipe = library.manifest.composition.recipes.find((entry) => entry.id === decision.recipe);
  if (!themeRecipe) {
    errors.push(`theme '${library.manifest.id}' does not define a composition recipe for '${decision.recipe}'`);
  } else if (!themeRecipe.articleTypes.includes(decision.articleType)) {
    errors.push(`theme '${library.manifest.id}' recipe '${decision.recipe}' is not compatible with articleType '${decision.articleType}'`);
  }

  const ids = new Set<string>();
  let explicitSelections = 0;
  let strongBlocks = 0;
  let previousStrong = false;
  let previousPhase = 0;
  const phaseOrder = { entry: 0, body: 1, exit: 2 } as const;

  for (const [index, block] of decision.blocks.entries()) {
    if (ids.has(block.id)) errors.push(`block ${block.id}: duplicate id`);
    ids.add(block.id);
    const phase = phaseOrder[block.phase];
    if (phase < previousPhase) errors.push(`block ${block.id}: phase cannot move backwards from ${decision.blocks[index - 1]?.phase} to ${block.phase}`);
    previousPhase = phase;

    const isStrong = block.emphasis === "strong";
    if (isStrong) strongBlocks += 1;
    if (isStrong && previousStrong) errors.push(`block ${block.id}: strong blocks cannot be adjacent`);
    previousStrong = isStrong;

    if (!block.component && !block.variant) continue;
    explicitSelections += 1;
    const semanticBlock = document.blocks[index];
    const reading = readingPlan.items[index];
    if (!semanticBlock || !reading) {
      errors.push(`block ${block.id}: missing deterministic semantic projection`);
      continue;
    }
    const candidates = candidatesFor(semanticBlock, reading, library);
    const selected = candidates.find((candidate) => candidate.componentId === block.component && candidate.variantId === block.variant);
    if (!selected) {
      errors.push(`block ${block.id}: illegal selection '${block.component}:${block.variant}' for ${block.type}`);
      continue;
    }
    const baseline = defaultCandidateForBlock(semanticBlock, candidates, library, decision.recipe);
    if (selected.id === baseline.id) {
      errors.push(`block ${block.id}: explicit selection '${selected.id}' is redundant; omit component and variant to use the theme recipe baseline`);
    }
  }

  if (explicitSelections > recipe.maxExplicitSelections) {
    errors.push(`recipe '${recipe.id}' allows at most ${recipe.maxExplicitSelections} explicit component selections, got ${explicitSelections}`);
  }
  if (strongBlocks > recipe.maxStrongBlocks) {
    errors.push(`recipe '${recipe.id}' allows at most ${recipe.maxStrongBlocks} strong blocks, got ${strongBlocks}`);
  }
  return errors;
}
