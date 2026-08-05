export const BLOCK_TYPES = [
  "article-title",
  "article-subtitle",
  "metadata",
  "lead",
  "heading",
  "paragraph",
  "quote",
  "list",
  "image",
  "divider",
  "callout",
  "step",
  "table",
  "code",
  "ending",
  "cta",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const BLOCK_RELATIONS = [
  "default",
  "same-group",
  "continuation",
  "new-argument",
  "turning-point",
  "before-strong-block",
  "after-strong-block",
  "new-section",
  "before-ending",
] as const;

export const BLOCK_MARK_TYPES = ["emphasis", "strong", "quote", "keyword"] as const;

export interface BlockMark {
  type: (typeof BLOCK_MARK_TYPES)[number];
  start: number;
  end: number;
}

export interface SourceSpan {
  sourceRef: string;
  startOffset: number;
  endOffset: number;
}

export interface SegmentationDecision {
  sourceRef: string;
  decision: "split" | "keep";
  reason: string;
  producedBlockIds: string[];
}

export interface HeadingStructure {
  hasMarker: boolean;
  marker?: string;
  ordinal?: number;
  title?: string;
}

export interface ListItemStructure {
  ordinal?: number;
  content: string;
}

export interface ListStructure {
  ordered: boolean;
  items: ListItemStructure[];
}

export interface QuoteStructure {
  content: string;
  hasAttribution: boolean;
  attribution?: string;
}

export interface ImageStructure {
  src: string;
  alt: string;
  hasCaption: boolean;
  caption?: string;
}

export interface TableStructure {
  headers: string[];
  rows: string[][];
  mode?: "comparison" | "data";
}

export interface CtaStructure {
  prompt: string;
  eyebrow?: string;
  highlight?: string;
}

export type BlockStructure =
  | HeadingStructure
  | ListStructure
  | QuoteStructure
  | ImageStructure
  | TableStructure
  | CtaStructure;

export interface Block {
  id: string;
  type: BlockType;
  role: string;
  content: string;
  importance: number;
  sourceOrder: number;
  level?: number;
  sectionId?: string;
  groupId?: string;
  relationToPrevious?: (typeof BLOCK_RELATIONS)[number];
  sourceRefs?: string[];
  sourceSpans?: SourceSpan[];
  marks?: BlockMark[];
  structure?: BlockStructure;
  metadata?: Record<string, JsonValue>;
}

export interface BlockDocument {
  $schema?: string;
  specVersion: "1.0";
  id: string;
  articleType?: string;
  moods?: string[];
  segmentationDecisions?: SegmentationDecision[];
  blocks: Block[];
}
