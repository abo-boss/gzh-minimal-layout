const FORBIDDEN_ELEMENTS = /<\/?(?:html|head|body|script|style|link|iframe|object|embed|form|input|button)\b/iu;

export function adaptToWechatFragment(canonicalHtml: string): string {
  if (FORBIDDEN_ELEMENTS.test(canonicalHtml)) {
    throw new Error("Canonical component HTML contains an element that is unsafe for WeChat paste output");
  }
  let html = canonicalHtml
    .replace(/<([a-z][a-z0-9-]*)\b[^>]*\sdata-debug-only(?:="[^"]*")?[^>]*>[\s\S]*?<\/\1>/giu, "")
    .replace(/\sdata-[a-z0-9:_-]+(?:="[^"]*")?/giu, "")
    .replace(/\s(?:class|id)="[^"]*"/giu, "")
    .replace(/\n{2,}/gu, "\n")
    .trim();
  if (/<slot\b/iu.test(html)) throw new Error("WeChat output contains an unresolved component slot");
  if (FORBIDDEN_ELEMENTS.test(html)) throw new Error("WeChat output failed platform safety validation");
  return `${html}\n`;
}
