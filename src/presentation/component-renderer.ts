import type { Block, BlockDocument, BlockMark } from "../contracts/block-document.js";
import type { AssetManifest, ImagePlan } from "../contracts/media.js";
import { displayMarkdownText } from "../agent/inline-markdown.js";
import { ctaStructure, formatOrdinal, headingStructure, imageStructure, listStructure, quoteStructure, tableStructure } from "../layout/block-structure.js";
import type { ComponentSlot, LayoutPlan, LoadedComponent, StyleMap, ThemeLibrary } from "../contracts/presentation.js";
import { adaptToWechatFragment } from "../adapters/wechat-adapter.js";
import { compileInlineStyle } from "../theme/template-safety.js";
import { validateContentIntegrity, type RenderedContentTrace } from "../validation/content-integrity-validator.js";
import { resolveImagePlan, type ResolvedImagePlanItem, assertSafeAssetUrl } from "../media/image-plan.js";

export interface ComponentRenderResult {
  canonicalHtml: string;
  wechatHtml: string;
  previewHtml: string;
  cleanPreviewHtml: string;
  contentIntegrity: ReturnType<typeof validateContentIntegrity>;
}

export interface ComponentRenderOptions {
  imagePlan?: ImagePlan;
  assetManifest?: AssetManifest;
  expectedSourceHash?: string;
}

export function renderComponentArticle(
  document: BlockDocument,
  layout: LayoutPlan,
  library: ThemeLibrary,
  options: ComponentRenderOptions = {},
): ComponentRenderResult {
  const componentById = new Map(library.components.map((component) => [component.id, component]));
  const trace: RenderedContentTrace = { coveredBlockIds: [], contributions: [] };
  const visualAssets = resolveRenderMedia(document, options);
  const visualsBefore = groupVisualAssets(visualAssets, "before");
  const visualsAfter = groupVisualAssets(visualAssets, "after");
  const fragments = document.blocks.map((block, index) => {
    const item = layout.items[index];
    if (!item || item.sourceBlockIds[0] !== block.id) throw new Error(`Layout item ${index} does not cover ${block.id}`);
    const component = componentById.get(item.componentId);
    if (!component) throw new Error(`Unknown component ${item.componentId}`);
    const variant = component.variants.find((entry) => entry.id === item.variantId);
    if (!variant) throw new Error(`Unknown variant ${item.componentId}:${item.variantId}`);

    const styles = mergeStyleMaps(component.baseStyles, variant.styles);
    let compiled = bindComponentSlots(component, block, styles, library.manifest.tokens);
    compiled = applyStyleRoles(compiled, styles, library.manifest.tokens);
    compiled = normalizeComponentRootSpacing(compiled, component.id, block.type);
    compiled = compiled.replace(
      "data-component-root",
      `data-component-root data-component-id="${escapeAttribute(component.id)}" data-variant-id="${escapeAttribute(variant.id)}"`,
    );
    if (/<slot\b/iu.test(compiled)) throw new Error(`Component ${component.id} contains an unresolved slot`);
    trace.coveredBlockIds.push(block.id);
    if (block.type === "image") {
      assertRenderedImage(compiled, block);
      trace.contributions.push({ blockId: block.id, text: block.content, layoutItemId: item.id, slotPath: "image" });
    } else {
      trace.contributions.push({ blockId: block.id, text: textFromRenderedHtml(compiled), layoutItemId: item.id, slotPath: "content" });
    }
    const debug = debugLabel(block, item.readingGesture, item.componentId, item.variantId, item.rhythmToken, item.gapBefore, item.reason);
    const blockFragment = `<section data-layout-item data-layout-id="${escapeAttribute(item.id)}" data-source-block-ids="${escapeAttribute(block.id)}" style="margin:0;padding:${item.gapBefore}px 0 0">${debug}${compiled.trim()}</section>`;
    return `${renderVisualAssets(visualsBefore.get(block.id) ?? [], "before")}${blockFragment}${renderVisualAssets(visualsAfter.get(block.id) ?? [], "after")}`;
  });

  const displayDocument: BlockDocument = {
    ...document,
    blocks: document.blocks.map((block) => ({ ...block, content: displayContent(block) })),
  };
  const contentIntegrity = validateContentIntegrity(displayDocument, trace);
  if (!contentIntegrity.valid) {
    const changed = contentIntegrity.changedBlocks.map((entry) => entry.blockId).join(", ");
    throw new Error(`Content integrity validation failed after component rendering${changed ? `: ${changed}` : ""}`);
  }
  const canonicalHtml = renderThemeCanvas(fragments.join("\n"), library.manifest.tokens);
  const wechatHtml = adaptToWechatFragment(canonicalHtml);
  return {
    canonicalHtml,
    wechatHtml,
    previewHtml: renderDebugPreview(document, canonicalHtml),
    cleanPreviewHtml: renderCleanPreview(document, wechatHtml),
    contentIntegrity,
  };
}

function normalizeComponentRootSpacing(html: string, componentId: string, blockType: Block["type"]): string {
  const proseRail = componentId === "prose" && blockType === "paragraph"
    ? ";padding-left:0;padding-right:0"
    : "";
  return html.replace(
    /^(\s*<[a-z][a-z0-9-]*\b[^>]*\sstyle=")([^"]*)(")/iu,
    (_match, start: string, style: string, end: string) => `${start}${style};margin-top:0;margin-bottom:0${proseRail}${end}`,
  );
}

function resolveRenderMedia(
  document: BlockDocument,
  options: ComponentRenderOptions,
): ResolvedImagePlanItem[] {
  if (!options.imagePlan && !options.assetManifest) return [];
  if (!options.imagePlan || !options.assetManifest) {
    throw new Error("ImagePlan and AssetManifest must be provided together");
  }
  return resolveImagePlan(document, options.imagePlan, options.assetManifest, options.expectedSourceHash);
}

function groupVisualAssets(
  assets: ResolvedImagePlanItem[],
  placement: "before" | "after",
): Map<string, ResolvedImagePlanItem[]> {
  const grouped = new Map<string, ResolvedImagePlanItem[]>();
  for (const asset of assets) {
    if (asset.plan.placement !== placement) continue;
    const entries = grouped.get(asset.plan.anchorBlockId) ?? [];
    entries.push(asset);
    grouped.set(asset.plan.anchorBlockId, entries);
  }
  return grouped;
}

function renderVisualAssets(
  assets: ResolvedImagePlanItem[],
  placement: "before" | "after",
): string {
  return assets.map((asset) => renderVisualAsset(asset, placement)).join("\n");
}

function renderVisualAsset(
  resolved: ResolvedImagePlanItem,
  placement: "before" | "after",
): string {
  assertSafeAssetUrl(resolved.asset.url);
  const figureStyle = compileInlineStyle({
    display: "block",
    "box-sizing": "border-box",
    margin: placement === "before" ? "0 0 20px" : "20px 0 0",
  }, {});
  const imageStyle = compileInlineStyle({
    display: "block",
    width: "100%",
    "max-width": "100%",
    height: "auto",
  }, {});
  return `<figure data-visual-asset data-visual-asset-id="${escapeAttribute(resolved.plan.id)}" style="${escapeAttribute(figureStyle)}"><img data-visual-asset-image src="${escapeAttribute(resolved.asset.url)}" alt="${escapeAttribute(resolved.plan.alt)}" style="${escapeAttribute(imageStyle)}"></figure>`;
}

function renderThemeCanvas(content: string, tokens: Record<string, unknown>): string {
  const canvas = tokens.canvas && typeof tokens.canvas === "object"
    ? tokens.canvas as Record<string, unknown>
    : {};
  const color = tokens.color && typeof tokens.color === "object"
    ? tokens.color as Record<string, unknown>
    : {};
  const background = typeof canvas.background === "string"
    ? canvas.background
    : typeof color.paper === "string" ? color.paper : "#FFFFFF";
  const padding = forceCanvasHorizontalPadding(
    typeof canvas.padding === "string" ? canvas.padding : "0 20px 64px",
    "20px",
  );
  const style = compileInlineStyle({ "background-color": background, "box-sizing": "border-box", "min-height": "100%", "padding": padding }, tokens);
  return `<section data-theme-canvas style="${escapeAttribute(style)}">${content}</section>`;
}

function forceCanvasHorizontalPadding(value: string, horizontal: string): string {
  const parts = value.trim().split(/\s+/u);
  if (parts.length === 1) return `${parts[0]} ${horizontal}`;
  if (parts.length === 2) return `${parts[0]} ${horizontal}`;
  if (parts.length === 3) return `${parts[0]} ${horizontal} ${parts[2]}`;
  return `${parts[0]} ${horizontal} ${parts[2]} ${horizontal}`;
}

function applyStyleRoles(
  template: string,
  styles: StyleMap,
  tokens: Record<string, unknown>,
): string {
  return template.replace(
    /(<[a-z][a-z0-9-]*\b[^>]*?)\sdata-style-role="([A-Za-z0-9._-]+)"([^>]*>)/giu,
    (_match, start: string, role: string, end: string) => {
      const roleStyles = styles[role];
      if (!roleStyles) throw new Error(`Template style role ${role} has no style definition`);
      return `${start} data-style-role="${role}" style="${escapeAttribute(compileInlineStyle(roleStyles, tokens))}"${end}`;
    },
  );
}

function mergeStyleMaps(base: StyleMap, variant: StyleMap): StyleMap {
  const roles = new Set([...Object.keys(base), ...Object.keys(variant)]);
  return Object.fromEntries([...roles].map((role) => [role, { ...(base[role] ?? {}), ...(variant[role] ?? {}) }]));
}

function bindComponentSlots(
  component: LoadedComponent,
  block: Block,
  styles: StyleMap,
  tokens: Record<string, unknown>,
): string {
  let template = selectListContainer(component.templateHtml, block);
  const quoteAttributionHasOwnSlot = component.slots.some((entry) => entry.source === "quote-attribution");
  for (const slot of component.slots) {
    const rawValue = rawSlotValue(slot, block);
    template = bindAttributeSlot(template, slot.name, rawValue);
    const value = slotHtml(slot, block, styles, tokens, quoteAttributionHasOwnSlot);
    if (value === undefined && slot.required) {
      throw new Error(`Component ${component.id} requires unavailable slot ${slot.name} for ${block.id}`);
    }
    if (value === undefined) template = removeOptionalSlotWrapper(template, slot.name);
    template = template.replace(new RegExp(`<slot name="${slot.name}"><\\/slot>`, "gu"), value ?? "");
  }
  template = template.replace(
    /<([a-z][a-z0-9-]*)\b([^>]*\sdata-slot-optional="[a-z-]+"[^>]*)>\s*<\/\1>/giu,
    "",
  );
  if (/data-attribute-slot-(?:src|alt)=/u.test(template)) {
    throw new Error(`Component ${component.id} contains an unresolved attribute slot`);
  }
  return template;
}

function bindAttributeSlot(
  template: string,
  slotName: ComponentSlot["name"],
  rawValue: string | undefined,
): string {
  const escapedName = slotName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`\\sdata-attribute-slot-(src|alt)="${escapedName}"`, "gu");
  if (!pattern.test(template)) return template;
  pattern.lastIndex = 0;
  if (rawValue === undefined) return template;
  return template.replace(pattern, (_match, attribute: string) => ` ${attribute}="${escapeAttribute(rawValue)}"`);
}

function removeOptionalSlotWrapper(template: string, slotName: string): string {
  const escaped = slotName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return template.replace(
    new RegExp(`<([a-z][a-z0-9-]*)\\b([^>]*\\sdata-slot-optional="${escaped}"[^>]*)>[\\s\\S]*?<\\/\\1>`, "giu"),
    "",
  );
}

function selectListContainer(template: string, block: Block): string {
  const list = listStructure(block);
  if (!list) return template;
  const removeTag = list.ordered ? "ul" : "ol";
  const removeKind = list.ordered ? "unordered" : "ordered";
  let selected = template.replace(
    new RegExp(`<${removeTag}\\b[^>]*\\sdata-list-kind="${removeKind}"[^>]*>[\\s\\S]*?<\\/${removeTag}>`, "giu"),
    "",
  );
  const start = list.items[0]?.ordinal;
  if (list.ordered && start !== undefined && start !== 1) {
    selected = selected.replace(
      /<ol\b([^>]*\sdata-list-kind="ordered"[^>]*)>/iu,
      `<ol$1 start="${start}">`,
    );
  }
  return selected;
}

function slotHtml(
  slot: ComponentSlot,
  block: Block,
  styles: StyleMap,
  tokens: Record<string, unknown>,
  quoteAttributionHasOwnSlot: boolean,
): string | undefined {
  const raw = rawSlotValue(slot, block);
  if (raw !== undefined) return escapedText(raw);
  if (slot.source === "content") {
    const content = displayContent(block);
    return block.marks?.length
      ? markedText(content, block.marks, styles, tokens)
      : escapedText(content);
  }
  if (slot.source === "heading-title") {
    const heading = headingStructure(block);
    return escapedText(headingTitle(block) ?? "");
  }
  if (slot.source === "heading-marker") {
    const heading = headingStructure(block);
    if (!heading?.hasMarker) return undefined;
    if (heading.ordinal !== undefined) return escapedText(formatOrdinal(heading.ordinal, slot.format ?? "source"));
    return heading.marker ? escapedText(heading.marker) : undefined;
  }
  if (slot.source === "list-items") {
    const list = listStructure(block);
    if (!list) return undefined;
    if (!styles.itemMarker || !styles.itemContent) {
      return list.items.map((item) => `<li data-style-role="item">${escapedText(displayMarkdownText(item.content))}</li>`).join("");
    }
    return list.items.map((item) => {
      const marker = list.ordered
        ? `${formatOrdinal(item.ordinal!, slot.format ?? "source")}.`
        : "•";
      return `<li data-style-role="item"><span data-decorative data-style-role="itemMarker">${escapedText(marker)}</span><span data-style-role="itemContent">${escapedText(displayMarkdownText(item.content))}</span></li>`;
    }).join("");
  }
  const quote = quoteStructure(block);
  if (slot.source === "quote-content") {
    if (!quote) return undefined;
    const content = displayMarkdownText(quote.content);
    const value = quote.hasAttribution && !quoteAttributionHasOwnSlot
      ? `${content}\n${displayMarkdownText(quote.attribution!)}`
      : content;
    return escapedText(value);
  }
  if (slot.source === "quote-attribution") return quote?.hasAttribution ? escapedText(displayMarkdownText(quote.attribution!)) : undefined;
  const table = tableStructure(block);
  if (slot.source === "table-headers" && table) {
    return table.headers.map((header, index) => {
      const role = index === 0 ? "headerCellFirst" : index === table.headers.length - 1 ? "headerCellLast" : "headerCell";
      return `<th data-style-role="${role}">${escapedText(header)}</th>`;
    }).join("");
  }
  if (slot.source === "table-rows" && table) {
    return table.rows.map((row) => `<tr data-style-role="row">${row.map((cell, index) => {
      const role = index === 0 ? "cellFirst" : index === row.length - 1 ? "cellLast" : "cell";
      return `<td data-style-role="${role}">${escapedText(cell)}</td>`;
    }).join("")}</tr>`).join("");
  }
  const cta = ctaStructure(block);
  if (slot.source === "cta-eyebrow") return cta?.eyebrow ? escapedText(displayMarkdownText(cta.eyebrow)) : undefined;
  if (slot.source === "cta-prompt") return cta ? escapedText(displayMarkdownText(cta.prompt)) : undefined;
  if (slot.source === "cta-highlight") return cta?.highlight ? escapedText(displayMarkdownText(cta.highlight)) : undefined;
  return undefined;
}

function rawSlotValue(slot: ComponentSlot, block: Block): string | undefined {
  if (slot.source === "content-initial" || slot.source === "content-remainder") {
    const characters = Array.from(displayContent(block));
    return slot.source === "content-initial" ? characters[0] ?? "" : characters.slice(1).join("");
  }
  const image = imageStructure(block);
  if (slot.source === "image-src") return image ? safeImageSource(image.src) : undefined;
  if (slot.source === "image-alt") return image?.alt;
  if (slot.source === "image-caption") return image?.hasCaption ? image.caption : undefined;
  return undefined;
}

function safeImageSource(value: string): string {
  if (/[\u0000-\u001f\u007f]/u.test(value) || /^\s*(?:data|javascript|vbscript):/iu.test(value)) {
    throw new Error("Image source uses an unsafe URI scheme");
  }
  return value;
}

function assertRenderedImage(html: string, block: Block): void {
  const image = imageStructure(block);
  if (!image) throw new Error(`Image block ${block.id} has no image structure`);
  const imageTag = html.match(/<img\b[^>]*>/iu)?.[0];
  if (!imageTag) throw new Error(`Image component for ${block.id} did not render an img element`);
  if (!imageTag.includes(`src="${escapeAttribute(image.src)}"`)) throw new Error(`Image component for ${block.id} did not preserve src`);
  if (!imageTag.includes(`alt="${escapeAttribute(image.alt)}"`)) throw new Error(`Image component for ${block.id} did not preserve alt`);
  if (image.hasCaption && !textFromRenderedHtml(html).includes(image.caption!)) {
    throw new Error(`Image component for ${block.id} did not preserve caption`);
  }
}

function markedText(
  content: string,
  marks: BlockMark[],
  styles: StyleMap,
  tokens: Record<string, unknown>,
): string {
  const ordered = [...marks].sort((left, right) => left.start - right.start || left.end - right.end);
  let cursor = 0;
  const fragments: string[] = [];
  for (const mark of ordered) {
    fragments.push(escapedText(content.slice(cursor, mark.start)));
    const role = mark.type === "strong" ? "markStrong"
      : mark.type === "keyword" ? "markKeyword"
        : mark.type === "quote" ? "markQuote"
          : "markEmphasis";
    const roleStyles = styles[role];
    const tag = mark.type === "emphasis" || mark.type === "quote" ? "em" : "strong";
    const style = roleStyles ? ` style="${escapeAttribute(compileInlineStyle(roleStyles, tokens))}"` : "";
    fragments.push(`<${tag} data-inline-mark="${mark.type}"${style}>${escapedText(content.slice(mark.start, mark.end))}</${tag}>`);
    cursor = mark.end;
  }
  fragments.push(escapedText(content.slice(cursor)));
  return fragments.join("");
}

function escapedText(value: string): string {
  return escapeHtml(value).replace(/\r?\n/gu, "<br>");
}

function debugLabel(
  block: Block,
  readingGesture: string,
  componentId: string,
  variantId: string,
  rhythmToken: string,
  gap: number,
  reason: string,
): string {
  const label = `${block.role} · ${readingGesture} · ${componentId}:${variantId} · ${rhythmToken}/${gap}px · ${reason}`;
  return `<small data-debug-only style="display:block;margin:0 0 6px;padding:3px 6px;background-color:#f3eee5;color:#7a6854;font-family:monospace;font-size:10px;line-height:1.4">${escapeHtml(label)}</small>`;
}

function renderDebugPreview(document: BlockDocument, canonicalHtml: string): string {
  const titleBlock = document.blocks.find((block) => block.type === "article-title");
  const title = titleBlock ? displayContent(titleBlock) : document.id;
  return `<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${escapeHtml(title)} · 375px debug preview</title>\n  <style>body{margin:0;background:#e9e5dd;color:#222;font-family:system-ui,-apple-system,"PingFang SC",sans-serif}.viewport{box-sizing:border-box;width:375px;min-height:100vh;margin:0 auto;background:#fff;box-shadow:0 0 32px rgba(38,31,22,.12)}</style>\n</head>\n<body>\n  <main class="viewport">${canonicalHtml}</main>\n</body>\n</html>\n`;
}

function renderCleanPreview(document: BlockDocument, wechatHtml: string): string {
  const titleBlock = document.blocks.find((block) => block.type === "article-title");
  const title = titleBlock ? displayContent(titleBlock) : document.id;
  return `<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${escapeHtml(title)} · 375px preview</title>\n  <style>body{margin:0;background:#f4f3ee;color:#222;font-family:system-ui,-apple-system,"PingFang SC",sans-serif}.preview-shell{width:375px;margin:0 auto}.copy-bar{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;box-sizing:border-box;min-height:56px;padding:10px 12px;background:rgba(244,243,238,.94);backdrop-filter:blur(12px)}.copy-hint{font-size:12px;color:#716e68}.copy-button{appearance:none;border:0;border-radius:999px;padding:9px 14px;background:#1f1f1d;color:#fff;font:600 13px/1 system-ui,-apple-system,"PingFang SC",sans-serif;cursor:pointer}.copy-button:focus-visible{outline:3px solid #8aa8e8;outline-offset:2px}.copy-button[disabled]{opacity:.65;cursor:wait}.viewport{box-sizing:border-box;width:375px;min-height:100vh;background:#fff;box-shadow:0 0 32px rgba(38,31,22,.12)}</style>\n</head>\n<body>\n  <div class="preview-shell">\n    <div class="copy-bar">\n      <span class="copy-hint" id="copy-status" aria-live="polite">确认样式后，复制到公众号编辑器</span>\n      <button class="copy-button" id="copy-wechat" type="button">一键复制到公众号</button>\n    </div>\n    <main class="viewport" id="wechat-copy-source">${wechatHtml}</main>\n  </div>\n  <script>\n    const button = document.getElementById("copy-wechat");\n    const source = document.getElementById("wechat-copy-source");\n    const status = document.getElementById("copy-status");\n    function fallbackCopy() {\n      const range = document.createRange();\n      range.selectNodeContents(source);\n      const selection = window.getSelection();\n      selection.removeAllRanges();\n      selection.addRange(range);\n      const copied = document.execCommand("copy");\n      selection.removeAllRanges();\n      return copied;\n    }\n    button.addEventListener("click", async () => {\n      button.disabled = true;\n      try {\n        const html = source.innerHTML;\n        const text = source.innerText;\n        if (navigator.clipboard && window.ClipboardItem) {\n          await navigator.clipboard.write([new ClipboardItem({"text/html": new Blob([html], {type: "text/html"}), "text/plain": new Blob([text], {type: "text/plain"})})]);\n        } else if (!fallbackCopy()) {\n          throw new Error("copy failed");\n        }\n        status.textContent = "已复制，请直接粘贴到公众号编辑器";\n        button.textContent = "已复制";\n      } catch {\n        status.textContent = "复制未成功，请使用浏览器授权后重试";\n        button.textContent = "重新复制";\n      } finally {\n        button.disabled = false;\n      }\n    });\n  </script>\n</body>\n</html>\n`;
}

function displayContent(block: Block): string {
  let content = block.content;
  if (block.type === "article-title" || block.type === "heading") {
    content = content.replace(/^#{1,6}[\t ]+/u, "");
    if (block.type === "heading") {
      const heading = headingStructure(block);
      const title = headingTitle(block);
      if (heading?.ordinal !== undefined) {
        return title
          ? `${formatOrdinal(heading.ordinal, "two-digit-arabic")} ${title}`
          : formatOrdinal(heading.ordinal, "two-digit-arabic");
      }
      return title ?? "";
    }
  }
  const list = listStructure(block);
  if (list) return list.items.map((item) => displayMarkdownText(item.content)).join("\n");
  const quote = quoteStructure(block);
  if (quote) {
    return `${displayMarkdownText(quote.content)}${quote.hasAttribution ? `\n${displayMarkdownText(quote.attribution!)}` : ""}`;
  }
  const table = tableStructure(block);
  if (table) return [...table.headers, ...table.rows.flat()].join("\n");
  const cta = ctaStructure(block);
  if (cta) return [cta.eyebrow, cta.prompt, cta.highlight]
    .filter((value): value is string => Boolean(value))
    .map(displayMarkdownText)
    .join("\n");
  if (block.type === "quote") {
    content = content.split(/\r?\n/u).map((line) => line.replace(/^>[\t ]?/u, "")).join("\n");
  }
  return displayMarkdownText(content);
}

function headingTitle(block: Block): string | undefined {
  const heading = headingStructure(block);
  if (!heading?.title) return undefined;
  const title = displayMarkdownText(heading.title).trim();
  if (heading.ordinal !== undefined && isOrdinalOnlyTitle(title, heading.marker, heading.ordinal)) {
    return undefined;
  }
  return displayMarkdownText(heading.title);
}

function isOrdinalOnlyTitle(title: string, marker: string | undefined, ordinal: number): boolean {
  const markerText = marker ? displayMarkdownText(marker).trim() : "";
  return title === markerText
    || title === formatOrdinal(ordinal, "source")
    || title === formatOrdinal(ordinal, "two-digit-arabic")
    || title === formatOrdinal(ordinal, "chinese");
}

function textFromRenderedHtml(html: string): string {
  const text = html
    .replace(/<([a-z][a-z0-9-]*)\b[^>]*\sdata-decorative(?:="[^"]*")?[^>]*>[\s\S]*?<\/\1>/giu, "")
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/<\/(?:p|h1|h2|h3|h4|blockquote|li|section|ul|ol|th|td|tr|thead|tbody|table|figure|figcaption)>/giu, "\n")
    .replace(/<[^>]+>/gu, "");
  return text
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&amp;/gu, "&");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function escapeAttribute(value: string): string { return escapeHtml(value); }
