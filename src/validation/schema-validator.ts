import { readFileSync } from "node:fs";
import path from "node:path";

import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsImport from "ajv-formats";

import type { BlockDocument } from "../contracts/block-document.js";
import type { LayoutDecision } from "../contracts/layout-decision.js";
import type { ArticleProfile } from "../contracts/article-profile.js";
import type {
  CandidateCatalog,
  ComponentDefinition,
  LayoutPlan,
  ReadingPlan,
  ThemeManifest,
} from "../contracts/presentation.js";
import type { AssetManifest, ImagePlan } from "../contracts/media.js";
import { sha256 } from "../source/inspect-source.js";
import type { SourceManifest } from "../source/source-manifest.js";
import { ContractValidationError, type ValidationIssue } from "./validation-error.js";
import { validateSourceSpans } from "./source-span-validator.js";
import {
  headingStructure,
  imageStructure,
  listStructure,
  quoteStructure,
  tableStructure,
  ctaStructure,
} from "../layout/block-structure.js";

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
  allowUnionTypes: true,
});
const addFormats = addFormatsImport as unknown as (instance: Ajv2020) => void;
addFormats(ajv);

const schemaCache = new Map<string, ValidateFunction>();
function loadSchema(relativePath: string): ValidateFunction {
  let cached = schemaCache.get(relativePath);
  if (!cached) {
    const schemaPath = path.resolve(process.cwd(), relativePath.replace(/^(?:\.\.\/)+/u, ""));
    cached = ajv.compile(JSON.parse(readFileSync(schemaPath, "utf8")) as object);
    schemaCache.set(relativePath, cached);
  }
  return cached;
}

function lazySchema(relativePath: string): ValidateFunction {
  let compiled: ValidateFunction | undefined;
  const invoke = ((data: unknown) => {
    if (!compiled) compiled = loadSchema(relativePath);
    return compiled(data);
  }) as ValidateFunction;
  Object.defineProperty(invoke, "errors", {
    get: () => (compiled ?? loadSchema(relativePath)).errors,
  });
  return invoke;
}

const blockDocumentValidator = lazySchema("../../schemas/block-document.schema.json");
const sourceManifestValidator = lazySchema("../../schemas/source-manifest.schema.json");
const articleProfileValidator = lazySchema("../../schemas/article-profile.schema.json");
const readingPlanValidator = lazySchema("../../schemas/reading-plan.schema.json");
const layoutPlanValidator = lazySchema("../../schemas/layout-plan.schema.json");
const themeManifestValidator = lazySchema("../../schemas/theme-manifest.schema.json");
const componentDefinitionValidator = lazySchema("../../schemas/component-definition.schema.json");
const candidateCatalogValidator = lazySchema("../../schemas/candidate-catalog.schema.json");
const imagePlanValidator = lazySchema("../../schemas/image-plan.schema.json");
const assetManifestValidator = lazySchema("../../schemas/asset-manifest.schema.json");
const layoutDecisionValidator = lazySchema("../../schemas/layout-decision.schema.json");

function schemaIssues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((error) => ({
    code: `schema.${error.keyword}`,
    path: error.instancePath || "/",
    message: error.message ?? "schema validation failed",
  }));
}

export function validateSourceManifest(
  input: unknown,
  sourceText?: string,
): SourceManifest {
  if (!sourceManifestValidator(input)) {
    throw new ContractValidationError(
      "SourceManifest validation failed",
      schemaIssues(sourceManifestValidator.errors),
    );
  }
  const manifest = input as SourceManifest;
  const issues: ValidationIssue[] = [];
  let previousEnd = -1;
  for (const [index, segment] of manifest.segments.entries()) {
    if (segment.sourceOrder !== index) {
      issues.push({
        code: "source.out-of-order",
        path: `/segments/${index}/sourceOrder`,
        message: `expected sourceOrder ${index}`,
      });
    }
    if (segment.startOffset < previousEnd || segment.endOffset <= segment.startOffset) {
      issues.push({
        code: "source.invalid-offset",
        path: `/segments/${index}`,
        message: "segment offsets must be positive, ordered, and non-overlapping",
      });
    }
    if (sha256(segment.content) !== segment.contentHash) {
      issues.push({
        code: "source.hash-mismatch",
        path: `/segments/${index}/contentHash`,
        message: "segment contentHash does not match content",
      });
    }
    if (
      sourceText !== undefined &&
      sourceText.slice(segment.startOffset, segment.endOffset) !== segment.content
    ) {
      issues.push({
        code: "source.offset-content-mismatch",
        path: `/segments/${index}`,
        message: "segment content does not match the source text at its offsets",
      });
    }
    previousEnd = segment.endOffset;
  }
  if (sourceText !== undefined && sha256(sourceText) !== manifest.contentHash) {
    issues.push({
      code: "source.document-hash-mismatch",
      path: "/contentHash",
      message: "manifest contentHash does not match the source text",
    });
  }
  if (issues.length > 0) {
    throw new ContractValidationError("SourceManifest validation failed", issues);
  }
  return manifest;
}

export function validateArticleProfile(input: unknown): ArticleProfile {
  if (!articleProfileValidator(input)) {
    throw new ContractValidationError(
      "ArticleProfile validation failed",
      schemaIssues(articleProfileValidator.errors),
    );
  }
  return input as ArticleProfile;
}

export function validateReadingPlan(input: unknown): ReadingPlan {
  return validatePresentationContract(input, readingPlanValidator, "ReadingPlan") as ReadingPlan;
}

export function validateLayoutPlan(input: unknown): LayoutPlan {
  return validatePresentationContract(input, layoutPlanValidator, "LayoutPlan") as LayoutPlan;
}

export function validateThemeManifest(input: unknown): ThemeManifest {
  return validatePresentationContract(input, themeManifestValidator, "ThemeManifest") as ThemeManifest;
}

export function validateComponentDefinition(input: unknown): ComponentDefinition {
  return validatePresentationContract(input, componentDefinitionValidator, "ComponentDefinition") as ComponentDefinition;
}

export function validateCandidateCatalog(input: unknown): CandidateCatalog {
  return validatePresentationContract(input, candidateCatalogValidator, "CandidateCatalog") as CandidateCatalog;
}

export function validateImagePlan(input: unknown): ImagePlan {
  return validatePresentationContract(input, imagePlanValidator, "ImagePlan") as ImagePlan;
}

export function validateAssetManifest(input: unknown): AssetManifest {
  return validatePresentationContract(input, assetManifestValidator, "AssetManifest") as AssetManifest;
}

export function validateLayoutDecision(input: unknown): LayoutDecision {
  return validatePresentationContract(input, layoutDecisionValidator, "LayoutDecision") as LayoutDecision;
}

function validatePresentationContract(
  input: unknown,
  validator: ValidateFunction,
  name: string,
): unknown {
  if (!validator(input)) {
    throw new ContractValidationError(`${name} validation failed`, schemaIssues(validator.errors));
  }
  return input;
}

export function validateBlockDocument(
  input: unknown,
  sourceManifest?: SourceManifest,
): BlockDocument {
  if (!blockDocumentValidator(input)) {
    throw new ContractValidationError(
      "BlockDocument validation failed",
      schemaIssues(blockDocumentValidator.errors),
    );
  }

  const document = input as BlockDocument;
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  const orders = new Set<number>();
  const sourceById = new Map((sourceManifest?.segments ?? []).map((segment) => [segment.id, segment]));
  let previousOrder = -1;

  for (const [index, block] of document.blocks.entries()) {
    if (ids.has(block.id)) {
      issues.push({
        code: "block.duplicate-id",
        path: `/blocks/${index}/id`,
        message: `duplicate block id ${block.id}`,
      });
    }
    if (orders.has(block.sourceOrder)) {
      issues.push({
        code: "block.duplicate-source-order",
        path: `/blocks/${index}/sourceOrder`,
        message: `duplicate sourceOrder ${block.sourceOrder}`,
      });
    }
    if (block.sourceOrder <= previousOrder) {
      issues.push({
        code: "block.out-of-order",
        path: `/blocks/${index}/sourceOrder`,
        message: "blocks must be stored in strictly increasing sourceOrder",
      });
    }
    ids.add(block.id);
    orders.add(block.sourceOrder);
    previousOrder = block.sourceOrder;

    const orderedMarks = [...(block.marks ?? [])].sort((left, right) => left.start - right.start || left.end - right.end);
    for (const [markIndex, mark] of orderedMarks.entries()) {
      if (mark.start >= mark.end || mark.end > block.content.length) {
        issues.push({
          code: "block.invalid-mark-range",
          path: `/blocks/${index}/marks/${markIndex}`,
          message: `range ${mark.start}-${mark.end} is outside block content`,
        });
      }
      if (markIndex > 0 && orderedMarks[markIndex - 1]!.end > mark.start) {
        issues.push({
          code: "block.overlapping-mark-range",
          path: `/blocks/${index}/marks/${markIndex}`,
          message: "inline mark ranges must not overlap",
        });
      }
    }

    validateDeclaredStructure(block, index, issues);

    if (sourceManifest && !block.sourceSpans) {
      const referenced = (block.sourceRefs ?? []).map((sourceRef, sourceIndex) => {
        const segment = sourceById.get(sourceRef);
        if (!segment) issues.push({ code: "block.unknown-source-ref", path: `/blocks/${index}/sourceRefs/${sourceIndex}`, message: `source segment ${sourceRef} does not exist` });
        return segment;
      }).filter((segment): segment is NonNullable<typeof segment> => segment !== undefined);
      for (let sourceIndex = 1; sourceIndex < referenced.length; sourceIndex += 1) {
        if (referenced[sourceIndex]!.sourceOrder !== referenced[sourceIndex - 1]!.sourceOrder + 1) {
          issues.push({ code: "block.non-adjacent-source-refs", path: `/blocks/${index}/sourceRefs/${sourceIndex}`, message: "merged source segments must be adjacent and ordered" });
        }
      }
      if (referenced.length === (block.sourceRefs ?? []).length && referenced.map((segment) => segment.content).join("\n\n") !== block.content) {
        issues.push({ code: "block.source-content-mismatch", path: `/blocks/${index}/content`, message: "block content must exactly match its referenced source segments" });
      }
    }

  }

  if (sourceManifest) issues.push(...validateSourceSpans(document, sourceManifest).issues);

  const blockIds = new Set(document.blocks.map((block) => block.id));
  for (const [index, decision] of (document.segmentationDecisions ?? []).entries()) {
    if (decision.decision === "split" && decision.producedBlockIds.length < 2) {
      issues.push({ code: "AGENT_SEGMENTATION_SPLIT_INVALID", path: `/segmentationDecisions/${index}/producedBlockIds`, message: "split decisions must produce at least two Blocks" });
    }
    for (const [blockIndex, blockId] of decision.producedBlockIds.entries()) {
      if (!blockIds.has(blockId)) issues.push({ code: "AGENT_SEGMENTATION_BLOCK_UNKNOWN", path: `/segmentationDecisions/${index}/producedBlockIds/${blockIndex}`, message: `Block ${blockId} does not exist` });
      const block = document.blocks.find((entry) => entry.id === blockId);
      if (block && !block.sourceRefs?.includes(decision.sourceRef)) issues.push({ code: "AGENT_SEGMENTATION_SOURCE_MISMATCH", path: `/segmentationDecisions/${index}/producedBlockIds/${blockIndex}`, message: `Block ${blockId} does not consume ${decision.sourceRef}` });
    }
    const actualBlockIds = document.blocks.filter((block) => block.sourceRefs?.includes(decision.sourceRef)).map((block) => block.id);
    if (actualBlockIds.length !== decision.producedBlockIds.length || actualBlockIds.some((blockId) => !decision.producedBlockIds.includes(blockId))) {
      issues.push({ code: "AGENT_SEGMENTATION_OUTPUT_INCOMPLETE", path: `/segmentationDecisions/${index}/producedBlockIds`, message: `producedBlockIds must list every Block consuming ${decision.sourceRef}` });
    }
  }

  if (issues.length > 0) {
    throw new ContractValidationError("BlockDocument validation failed", issues);
  }
  return document;
}

function validateDeclaredStructure(
  block: BlockDocument["blocks"][number],
  index: number,
  issues: ValidationIssue[],
): void {
  const path = `/blocks/${index}/structure`;
  const heading = headingStructure(block);
  if (heading) {
    if (heading.hasMarker && !block.content.replace(/^\s*#{1,6}\s+/u, "").startsWith(heading.marker!)) {
      issues.push({ code: "block.structure-marker-mismatch", path, message: "heading marker must be present at the start of the original content" });
    }
    if (heading.title && !block.content.includes(heading.title)) {
      issues.push({ code: "block.structure-title-mismatch", path, message: "heading title must be present in the original content" });
    }
    return;
  }

  const list = listStructure(block);
  if (list) {
    for (const [itemIndex, item] of list.items.entries()) {
      if (!block.content.includes(item.content)) {
        issues.push({ code: "block.structure-list-item-mismatch", path: `${path}/items/${itemIndex}/content`, message: "list item content must be present in the original Block content" });
      }
      if (list.ordered && item.ordinal === undefined) {
        issues.push({ code: "block.structure-list-ordinal-missing", path: `${path}/items/${itemIndex}/ordinal`, message: "ordered list items must declare their original ordinal" });
      }
      if (!list.ordered && item.ordinal !== undefined) {
        issues.push({ code: "block.structure-list-ordinal-forbidden", path: `${path}/items/${itemIndex}/ordinal`, message: "unordered list items cannot declare an ordinal" });
      }
    }
    return;
  }

  const quote = quoteStructure(block);
  if (quote) {
    if (!block.content.includes(quote.content)) {
      issues.push({ code: "block.structure-quote-content-mismatch", path: `${path}/content`, message: "quote content must be present in the original Block content" });
    }
    if (quote.hasAttribution && !block.content.includes(quote.attribution!)) {
      issues.push({ code: "block.structure-quote-attribution-mismatch", path: `${path}/attribution`, message: "quote attribution must be present in the original Block content" });
    }
    return;
  }

  const image = imageStructure(block);
  if (image) {
    if (typeof block.metadata?.src === "string" && block.metadata.src !== image.src) {
      issues.push({ code: "block.structure-image-src-mismatch", path: `${path}/src`, message: "image src must agree with the original image metadata" });
    }
    if (image.hasCaption && !block.content.includes(image.caption!)) {
      issues.push({ code: "block.structure-image-caption-mismatch", path: `${path}/caption`, message: "image caption must be present in the original Block content" });
    }
    return;
  }

  const table = tableStructure(block);
  if (table) {
    for (const [rowIndex, row] of table.rows.entries()) {
      if (row.length !== table.headers.length) {
        issues.push({ code: "block.structure-table-width-mismatch", path: `${path}/rows/${rowIndex}`, message: "table rows must contain the same number of cells as headers" });
      }
    }
    for (const [cellIndex, cell] of [...table.headers, ...table.rows.flat()].entries()) {
      if (!block.content.includes(cell)) {
        issues.push({ code: "block.structure-table-cell-mismatch", path: `${path}/cells/${cellIndex}`, message: "table cell content must be present in the original Block content" });
      }
    }
    return;
  }

  const cta = ctaStructure(block);
  if (cta) {
    for (const [field, value] of Object.entries(cta)) {
      if (field !== "mode" && value && !block.content.includes(value)) {
        issues.push({ code: "block.structure-cta-content-mismatch", path: `${path}/${field}`, message: "CTA structure must be present in the original Block content" });
      }
    }
  }
}
