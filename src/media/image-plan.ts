import type { BlockDocument } from "../contracts/block-document.js";
import type {
  AssetManifest,
  AssetManifestItem,
  ImagePlan,
  ImagePlanItem,
} from "../contracts/media.js";

export interface ResolvedImagePlanItem {
  plan: ImagePlanItem;
  asset: AssetManifestItem;
}

export function resolveImagePlan(
  document: BlockDocument,
  plan: ImagePlan,
  manifest: AssetManifest,
  expectedSourceHash?: string,
): ResolvedImagePlanItem[] {
  if (plan.documentId !== document.id) {
    throw new Error(`ImagePlan document ${plan.documentId} does not match ${document.id}`);
  }
  if (manifest.documentId !== document.id) {
    throw new Error(`AssetManifest document ${manifest.documentId} does not match ${document.id}`);
  }
  if (plan.sourceHash && expectedSourceHash && plan.sourceHash !== expectedSourceHash) {
    throw new Error("ImagePlan sourceHash does not match the current source");
  }

  const blockIds = new Set(document.blocks.map((block) => block.id));
  const assetsById = new Map<string, AssetManifestItem>();
  for (const asset of manifest.assets) {
    if (assetsById.has(asset.id)) throw new Error(`AssetManifest contains duplicate asset id ${asset.id}`);
    assertSafeAssetUrl(asset.url);
    if (asset.status !== "ready") throw new Error(`Image asset ${asset.id} is not ready`);
    assetsById.set(asset.id, asset);
  }

  const planIds = new Set<string>();
  const resolved: ResolvedImagePlanItem[] = [];
  for (const item of plan.items) {
    if (planIds.has(item.id)) throw new Error(`ImagePlan contains duplicate item id ${item.id}`);
    planIds.add(item.id);
    if (!blockIds.has(item.anchorBlockId)) {
      throw new Error(`ImagePlan item ${item.id} references unknown block ${item.anchorBlockId}`);
    }
    const asset = assetsById.get(item.assetId);
    if (!asset) throw new Error(`ImagePlan item ${item.id} references unknown asset ${item.assetId}`);
    resolved.push({ plan: item, asset });
  }
  return resolved;
}

export function assertSafeAssetUrl(value: string): void {
  if (/[\u0000-\u001f\u007f]/u.test(value) || /^\s*(?:data|javascript|vbscript):/iu.test(value)) {
    throw new Error("Image asset URL uses an unsafe URI scheme");
  }
}
