export interface WechatHtmlValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  leafCount: number;
}

const FORBIDDEN: Array<[RegExp, string]> = [
  [/<\/?(?:style|script|link|iframe|object|embed|form|input|button)\b/iu, "forbidden HTML element"],
  [/<\/?div\b/iu, "<div> is not accepted in the WeChat fragment contract"],
  [/\s(?:class|id)\s*=/iu, "class/id attributes are not accepted in the WeChat fragment contract"],
  [/\bposition\s*:\s*(?:absolute|fixed|sticky)\b/iu, "absolute/fixed/sticky positioning is not accepted"],
  [/\bfloat\s*:/iu, "float is not accepted"],
  [/\bdisplay\s*:\s*grid\b/iu, "display:grid is not accepted"],
  [/\bvar\s*\(\s*--/iu, "CSS variables are not accepted"],
  [/<slot\b/iu, "unresolved component slot"],
  [/\sdata-[a-z0-9:_-]+(?:\s|=|>)/iu, "renderer-only data attribute leaked into paste output"],
];

const CJK = /[\u3400-\u9fff]/u;
const HALF_PUNCTUATION = /[\u3400-\u9fff][,;!?]/u;
const ASCII_QUOTE = /["']/u;

/**
 * Validate the final paste fragment, not its preview shell. This complements
 * source-package linting: component lint catches authoring mistakes before a
 * render; this check catches anything that survives assembly and adaptation.
 */
export function validateWechatHtml(html: string): WechatHtmlValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const [pattern, reason] of FORBIDDEN) {
    if (pattern.test(html)) errors.push(reason);
  }

  const leaf = inspectLeafWrapping(html);
  if (leaf.unwrappedCjk.length > 0) {
    errors.push(`CJK text is not wrapped in <span leaf=""> (${leaf.unwrappedCjk.slice(0, 3).join("；")})`);
  }
  if (leafCountFor(html) === 0 && CJK.test(html)) {
    errors.push("paste output contains CJK text but no <span leaf=\"\"> wrapper");
  }
  if (HALF_PUNCTUATION.test(leaf.visibleText)) {
    warnings.push("CJK text contains half-width punctuation; preserve it only when it is intentional source content");
  }
  if (ASCII_QUOTE.test(leaf.visibleText)) {
    warnings.push("visible text contains ASCII quotes; preserve them only when they are intentional source content");
  }
  return { valid: errors.length === 0, errors, warnings, leafCount: leafCountFor(html) };
}

function inspectLeafWrapping(html: string): { unwrappedCjk: string[]; visibleText: string } {
  const stack: Array<{ tag: string; leaf: boolean }> = [];
  let leafDepth = 0;
  const unwrappedCjk: string[] = [];
  const visible: string[] = [];
  const tokens = html.match(/<[^>]*>|[^<]+/gu) ?? [];
  for (const token of tokens) {
    if (!token.startsWith("<")) {
      const text = decodeEntities(token);
      visible.push(text);
      if (CJK.test(text) && leafDepth === 0) unwrappedCjk.push(text.trim().slice(0, 24));
      continue;
    }
    const close = token.match(/^<\/([A-Za-z][A-Za-z0-9-]*)\b[^>]*>/u);
    if (close) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        const current = stack[index]!;
        stack.splice(index, 1);
        if (current.leaf) leafDepth -= 1;
        if (current.tag === close[1]!.toLowerCase()) break;
      }
      continue;
    }
    const open = token.match(/^<([A-Za-z][A-Za-z0-9-]*)\b[^>]*>/u);
    if (!open || /\/\s*>$/u.test(token) || /^(?:br|img)\b/iu.test(open[1]!)) continue;
    const isLeaf = open[1]!.toLowerCase() === "span" && /\sleaf(?:\s|=|>)/iu.test(token);
    stack.push({ tag: open[1]!.toLowerCase(), leaf: isLeaf });
    if (isLeaf) leafDepth += 1;
  }
  return { unwrappedCjk, visibleText: visible.join("") };
}

function leafCountFor(html: string): number {
  return (html.match(/<span\s+[^>]*\bleaf(?:\s|=|>)[^>]*>/giu) ?? []).length;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&amp;/gu, "&");
}
