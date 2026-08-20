import type { ComponentSlot } from "../contracts/presentation.js";

const ALLOWED_TAGS = new Set(["section", "p", "h1", "h2", "h3", "h4", "span", "strong", "em", "br", "blockquote", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "figure", "figcaption", "img", "slot"]);
const ATTRIBUTE_SLOT_SOURCES = { src: "image-src", alt: "image-alt" } as const;
const ALLOWED_STYLE_PROPERTIES = new Set([
  "align-items",
  "aspect-ratio",
  "background-color",
  "background-image",
  "border",
  "border-bottom",
  "border-left",
  "border-right",
  "border-top",
  "border-radius",
  "border-collapse",
  "border-spacing",
  "bottom",
  "box-sizing",
  "color",
  "display",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "float",
  "gap",
  "height",
  "left",
  "justify-content",
  "letter-spacing",
  "list-style",
  "line-height",
  "margin",
  "margin-bottom",
  "margin-top",
  "max-width",
  "min-height",
  "opacity",
  "object-fit",
  "overflow",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "position",
  "right",
  "table-layout",
  "text-align",
  "text-align-last",
  "text-decoration",
  "top",
  "vertical-align",
  "white-space",
  "width",
  "z-index",
]);

export function assertSafeTemplate(template: string, slots: ComponentSlot[]): void {
  if (/<\/?(?:script|style|link|iframe|object|embed)\b/iu.test(template)) {
    throw new Error("Component template contains a forbidden element");
  }
  if (/\son[a-z]+\s*=/iu.test(template) || /\s(?:class|id|style)\s*=/iu.test(template)) {
    throw new Error("Component templates may only use controlled data attributes");
  }
  if (/<img\b[^>]*\s(?:src|alt)\s*=/iu.test(template)) {
    throw new Error("Image templates must bind source-owned src and alt attribute slots");
  }
  const tags = [...template.matchAll(/<\/?([a-z][a-z0-9-]*)\b/giu)].map((match) => match[1]!.toLowerCase());
  const unknown = tags.find((tag) => !ALLOWED_TAGS.has(tag));
  if (unknown) throw new Error(`Component template uses unsupported <${unknown}>`);
  if ((template.match(/data-component-root/gu) ?? []).length !== 1) {
    throw new Error("Component template must declare exactly one data-component-root");
  }
  const declaredSlots = new Set(slots.map((slot) => slot.name));
  if (declaredSlots.size !== slots.length) {
    throw new Error("Component definition must not declare the same slot twice");
  }
  const textSlots = [...template.matchAll(/<slot name="([a-z-]+)"><\/slot>/gu)].map((match) => match[1]!);
  const attributeSlots = [...template.matchAll(/data-attribute-slot-(src|alt)="([a-z-]+)"/gu)].map((match) => ({
    attribute: match[1]! as keyof typeof ATTRIBUTE_SLOT_SOURCES,
    name: match[2]!,
  }));
  const templateSlots = [...textSlots, ...attributeSlots.map((entry) => entry.name)];
  if (templateSlots.length === 0 || templateSlots.some((name) => !declaredSlots.has(name as ComponentSlot["name"]))) {
    throw new Error("Component template references an undeclared automatic slot");
  }
  for (const entry of attributeSlots) {
    const slot = slots.find((candidate) => candidate.name === entry.name);
    if (!slot || slot.source !== ATTRIBUTE_SLOT_SOURCES[entry.attribute]) {
      throw new Error(`Component attribute slot ${entry.name} cannot bind ${entry.attribute}`);
    }
  }
  for (const slot of slots) {
    if (!templateSlots.includes(slot.name)) {
      throw new Error(`Component template does not render declared slot ${slot.name}`);
    }
  }
  const withoutDecorations = template.replace(
    /<([a-z][a-z0-9-]*)\b[^>]*\sdata-decorative(?:="[^"]*")?[^>]*>[\s\S]*?<\/\1>/giu,
    "",
  );
  const authoredText = withoutDecorations.replace(/<[^>]+>/gu, "").trim();
  if (authoredText.length > 0) {
    throw new Error("Component templates may not author visible text outside automatic slots");
  }
}

export function compileInlineStyle(
  styles: Record<string, string>,
  tokens: Record<string, unknown>,
): string {
  return Object.entries(styles).map(([property, rawValue]) => {
    if (!ALLOWED_STYLE_PROPERTIES.has(property)) throw new Error(`Unsupported style property ${property}`);
    const value = resolveTokenValue(rawValue, tokens);
    if (/[;<>]/u.test(value) || /(?:url|expression|javascript)\s*\(/iu.test(value)) {
      throw new Error(`Unsafe style value for ${property}`);
    }
    if (
      (property === "position" && /^(?:absolute|fixed|sticky)$/iu.test(value.trim()))
      || property === "float"
      || (property === "display" && /^grid$/iu.test(value.trim()))
      || (property === "white-space" && /^pre$/iu.test(value.trim()))
    ) {
      throw new Error(`Unsupported WeChat style ${property}:${value}`);
    }
    return `${property}:${value}`;
  }).join(";");
}

function resolveTokenValue(value: string, tokens: Record<string, unknown>): string {
  return value.replace(/\{([A-Za-z0-9._-]+)\}/gu, (_match, tokenPath: string) => {
    let current: unknown = tokens;
    for (const part of tokenPath.split(".")) {
      if (!current || typeof current !== "object" || !(part in current)) {
        throw new Error(`Unknown theme token ${tokenPath}`);
      }
      current = (current as Record<string, unknown>)[part];
    }
    if (typeof current !== "string" && typeof current !== "number") {
      throw new Error(`Theme token ${tokenPath} must resolve to a string or number`);
    }
    return String(current);
  });
}
