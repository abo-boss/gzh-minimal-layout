export type SourceFormat = "markdown" | "plain-text";

export type SourceSegmentationMode = "auto" | "blank-lines" | "lines";

export interface SourceSegmentation {
  requested: SourceSegmentationMode;
  resolved: Exclude<SourceSegmentationMode, "auto">;
  reason?: string;
}

export type SourceKindHint =
  | "heading"
  | "paragraph"
  | "list"
  | "quote"
  | "code"
  | "divider"
  | "image"
  | "table";

export interface SourceSegment {
  id: string;
  sourceOrder: number;
  kindHint: SourceKindHint;
  content: string;
  startOffset: number;
  endOffset: number;
  contentHash: string;
}

export interface SourceManifest {
  $schema?: string;
  specVersion: "1.0";
  sourceId: string;
  format: SourceFormat;
  contentHash: string;
  segmentation?: SourceSegmentation;
  segments: SourceSegment[];
}
