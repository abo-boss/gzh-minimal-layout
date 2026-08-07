import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { BLOCK_RELATIONS, type Block, type BlockDocument } from "../contracts/block-document.js";
import { ctaStructure, imageStructure, listStructure, quoteStructure, tableStructure } from "../layout/block-structure.js";
import type {
  CandidateCatalog,
  ComponentCandidate,
  ComponentDefinition,
  CandidateRule,
  LoadedComponent,
  ReadingPlanItem,
  ReadingPlan,
  ThemeLibrary,
} from "../contracts/presentation.js";
import { RHYTHM_DENSITIES, RHYTHM_TOKENS } from "../contracts/presentation.js";
import {
  validateComponentDefinition,
  validateThemeManifest,
} from "../validation/schema-validator.js";
import { assertSafeTemplate, compileInlineStyle } from "./template-safety.js";

export async function loadThemeLibrary(
  themeId: string,
  repositoryRoot = process.cwd(),
): Promise<ThemeLibrary> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(themeId)) throw new Error(`Invalid theme id ${themeId}`);
  const themeRoot = path.resolve(repositoryRoot, "themes", themeId);
  const manifest = validateThemeManifest(await readJson(path.join(themeRoot, "theme.json")));
  if (manifest.id !== themeId) throw new Error(`Theme id mismatch: expected ${themeId}, got ${manifest.id}`);
  assertThemeManifest(manifest);

  const components: LoadedComponent[] = [];
  for (const componentPath of manifest.componentPaths) {
    const definitionPath = safeChildPath(themeRoot, componentPath);
    const definition = validateComponentDefinition(await readJson(definitionPath));
    assertComponentDefinition(definition);
    const templatePath = safeChildPath(path.dirname(definitionPath), definition.template);
    const templateHtml = await readFile(templatePath, "utf8");
    assertSafeTemplate(templateHtml, definition.slots);
    assertComponentStyles(definition, templateHtml, manifest.tokens);
    components.push({ ...definition, templateHtml });
  }

  if (new Set(components.map((component) => component.id)).size !== components.length) {
    throw new Error(`Theme ${themeId} contains duplicate component ids`);
  }
  return { manifest, components };
}

export async function loadThemeLibraries(repositoryRoot = process.cwd()): Promise<ThemeLibrary[]> {
  const themesRoot = path.resolve(repositoryRoot, "themes");
  const entries = await readdir(themesRoot, { withFileTypes: true });
  const themeIds = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  return Promise.all(themeIds.map((themeId) => loadThemeLibrary(themeId, repositoryRoot)));
}

function assertThemeManifest(manifest: ThemeLibrary["manifest"]): void {
  for (const density of RHYTHM_DENSITIES) {
    const scale = manifest.rhythm.modes[density];
    for (let index = 1; index < RHYTHM_TOKENS.length; index += 1) {
      const previous = RHYTHM_TOKENS[index - 1]!;
      const current = RHYTHM_TOKENS[index]!;
      if (scale[previous] >= scale[current]) {
        throw new Error(`Theme rhythm ${density} must keep ${previous} < ${current}`);
      }
    }
  }
  for (const token of RHYTHM_TOKENS) {
    const dense = manifest.rhythm.modes.dense[token];
    const balanced = manifest.rhythm.modes.balanced[token];
    const airy = manifest.rhythm.modes.airy[token];
    if (!(dense < balanced && balanced < airy)) {
      throw new Error(`Theme rhythm token ${token} must keep dense < balanced < airy`);
    }
  }
  for (const relation of BLOCK_RELATIONS) {
    if (!manifest.rhythm.relationMap[relation]) throw new Error(`Theme rhythm is missing relation ${relation}`);
  }
}

function assertComponentStyles(
  definition: ComponentDefinition,
  template: string,
  tokens: Record<string, unknown>,
): void {
  const roles = [...template.matchAll(/data-style-role="([A-Za-z0-9._-]+)"/gu)].map((match) => match[1]!);
  if (definition.slots.some((slot) => slot.source === "list-items")) {
    roles.push("item");
    if (definition.baseStyles.itemMarker) roles.push("itemMarker", "itemContent");
  }
  if (definition.slots.some((slot) => slot.source === "table-headers")) roles.push("row", "headerCell", "headerCellFirst", "headerCellLast");
  if (definition.slots.some((slot) => slot.source === "table-rows")) roles.push("cell", "cellFirst", "cellLast");
  for (const role of roles) {
    for (const variant of definition.variants) {
      const styles = { ...(definition.baseStyles[role] ?? {}), ...(variant.styles[role] ?? {}) };
      if (Object.keys(styles).length === 0) throw new Error(`Component ${definition.id}:${variant.id} has no styles for role ${role}`);
      compileInlineStyle(styles, tokens);
    }
  }
}

export function candidatesFor(
  block: Block,
  reading: ReadingPlanItem,
  library: ThemeLibrary,
): ComponentCandidate[] {
  return library.components.flatMap((component) => {
    if (!ruleMatches(component.accepts, block, reading) || !componentCanBind(component, block)) return [];
    return component.variants
      .filter((variant) => !variant.accepts || ruleMatches(variant.accepts, block, reading))
      .map((variant) => ({
        id: `${component.id}:${variant.id}`,
        componentId: component.id,
        variantId: variant.id,
        priority: variant.priority,
        visualWeight: variant.visualWeight,
        surface: variant.surface,
        emphasisCost: variant.emphasisCost,
      }));
  }).sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
}

export function createCandidateCatalog(
  document: BlockDocument,
  readingPlan: ReadingPlan,
  library: ThemeLibrary,
): CandidateCatalog {
  if (document.id !== readingPlan.documentId || document.blocks.length !== readingPlan.items.length) {
    throw new Error("Candidate catalog inputs do not cover the same document");
  }
  return {
    specVersion: "1.0",
    documentId: document.id,
    themeId: library.manifest.id,
    blocks: document.blocks.map((block, index) => {
      const reading = readingPlan.items[index]!;
      if (reading.blockId !== block.id) throw new Error(`Candidate catalog reading item ${index} must reference ${block.id}`);
      return {
        blockId: block.id,
        type: block.type,
        role: block.role,
        gesture: reading.gesture,
        candidates: candidatesFor(block, reading, library),
      };
    }),
  };
}

function ruleMatches(
  rule: CandidateRule,
  block: Block,
  reading: ReadingPlanItem,
): boolean {
  return (!rule.blockTypes || rule.blockTypes.includes(block.type))
    && (!rule.roles || rule.roles.includes(block.role))
    && (!rule.gestures || rule.gestures.includes(reading.gesture))
    && (!rule.levels || (block.level !== undefined && rule.levels.includes(block.level)));
}

function assertComponentDefinition(definition: ComponentDefinition): void {
  const ids = new Set(definition.variants.map((variant) => variant.id));
  if (ids.size !== definition.variants.length) throw new Error(`Component ${definition.id} has duplicate variant ids`);
  if (!ids.has(definition.fallbackVariant)) throw new Error(`Component ${definition.id} fallback variant does not exist`);
  if (new Set(definition.slots.map((slot) => slot.name)).size !== definition.slots.length) {
    throw new Error(`Component ${definition.id} has duplicate slot names`);
  }
}

function componentCanBind(component: ComponentDefinition, block: Block): boolean {
  return component.slots.every((slot) => {
    if (!slot.required) return true;
    if (slot.source === "list-items") return listStructure(block) !== undefined;
    if (slot.source === "quote-content") return quoteStructure(block) !== undefined;
    if (slot.source === "image-src" || slot.source === "image-alt") return imageStructure(block) !== undefined;
    if (slot.source === "table-headers" || slot.source === "table-rows") return tableStructure(block) !== undefined;
    if (slot.source === "cta-prompt") return ctaStructure(block) !== undefined;
    return true;
  });
}

function safeChildPath(parent: string, relativePath: string): string {
  const resolved = path.resolve(parent, relativePath);
  const prefix = `${path.resolve(parent)}${path.sep}`;
  if (!resolved.startsWith(prefix)) throw new Error(`Asset path escapes its theme directory: ${relativePath}`);
  return resolved;
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}
