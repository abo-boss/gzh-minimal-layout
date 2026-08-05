import type {
  Block,
  HeadingStructure,
  ImageStructure,
  ListStructure,
  QuoteStructure,
  TableStructure,
  CtaStructure,
} from "../contracts/block-document.js";

export const STRUCTURAL_FEATURES = [
  "marker",
  "ordinal",
  "title",
  "ordered",
  "items",
  "attribution",
  "src",
  "alt",
  "caption",
  "headers",
  "rows",
  "prompt",
  "highlight",
] as const;

export type StructuralFeature = (typeof STRUCTURAL_FEATURES)[number];
export type MarkerFormat = "source" | "arabic" | "two-digit-arabic" | "chinese";

export function structuralFeatures(block: Block): StructuralFeature[] {
  const structure = block.structure;
  if (!structure) return [];
  if (block.type === "heading") {
    const heading = structure as HeadingStructure;
    return [
      ...(heading.hasMarker ? ["marker" as const] : []),
      ...(heading.ordinal !== undefined ? ["ordinal" as const] : []),
      ...(heading.title ? ["title" as const] : []),
    ];
  }
  if (block.type === "list") {
    const list = structure as ListStructure;
    return [
      ...(list.ordered ? ["ordered" as const] : []),
      ...(list.items.length > 0 ? ["items" as const] : []),
    ];
  }
  if (block.type === "quote") {
    const quote = structure as QuoteStructure;
    return quote.hasAttribution ? ["attribution"] : [];
  }
  if (block.type === "image") {
    const image = structure as ImageStructure;
    return [
      "src",
      ...(image.alt.length > 0 ? ["alt" as const] : []),
      ...(image.hasCaption ? ["caption" as const] : []),
    ];
  }
  if (block.type === "table") {
    const table = structure as TableStructure;
    return [
      ...(table.headers.length > 0 ? ["headers" as const] : []),
      ...(table.rows.length > 0 ? ["rows" as const] : []),
    ];
  }
  if (block.type === "cta") {
    const cta = structure as CtaStructure;
    return ["prompt", ...(cta.highlight ? ["highlight" as const] : [])];
  }
  return [];
}

export function headingStructure(block: Block): HeadingStructure | undefined {
  return block.type === "heading" && block.structure
    ? block.structure as HeadingStructure
    : undefined;
}

export function listStructure(block: Block): ListStructure | undefined {
  return block.type === "list" && block.structure
    ? block.structure as ListStructure
    : undefined;
}

export function quoteStructure(block: Block): QuoteStructure | undefined {
  return block.type === "quote" && block.structure
    ? block.structure as QuoteStructure
    : undefined;
}

export function imageStructure(block: Block): ImageStructure | undefined {
  return block.type === "image" && block.structure
    ? block.structure as ImageStructure
    : undefined;
}

export function tableStructure(block: Block): TableStructure | undefined {
  return block.type === "table" && block.structure
    ? block.structure as TableStructure
    : undefined;
}

export function ctaStructure(block: Block): CtaStructure | undefined {
  return block.type === "cta" && block.structure
    ? block.structure as CtaStructure
    : undefined;
}

export function formatOrdinal(value: number, format: MarkerFormat): string {
  if (format === "source" || format === "arabic") return String(value);
  if (format === "two-digit-arabic") return String(value).padStart(2, "0");
  return toChineseNumeral(value);
}

function toChineseNumeral(value: number): string {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value < 10) return digits[value]!;
  if (value < 20) return value === 10 ? "十" : `十${digits[value - 10]}`;
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const units = value % 10;
    return `${digits[tens]}十${units === 0 ? "" : digits[units]}`;
  }
  return String(value);
}
