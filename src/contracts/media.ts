export const IMAGE_PURPOSES = ["lead", "inline", "infographic"] as const;
export type ImagePurpose = (typeof IMAGE_PURPOSES)[number];

export const IMAGE_PLACEMENTS = ["before", "after"] as const;
export type ImagePlacement = (typeof IMAGE_PLACEMENTS)[number];

export interface ImagePlanItem {
  id: string;
  anchorBlockId: string;
  placement: ImagePlacement;
  purpose: ImagePurpose;
  prompt: string;
  alt: string;
  aspectRatio: string;
  assetId: string;
  reason: string;
}

export interface ImagePlan {
  $schema?: string;
  specVersion: "1.0";
  id: string;
  documentId: string;
  sourceHash?: string;
  items: ImagePlanItem[];
}

export const ASSET_KINDS = ["generated", "local", "remote"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_STATUSES = ["ready"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export interface AssetManifestItem {
  id: string;
  kind: AssetKind;
  status: AssetStatus;
  url: string;
  localPath?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface AssetManifest {
  $schema?: string;
  specVersion: "1.0";
  id: string;
  documentId: string;
  assets: AssetManifestItem[];
}
