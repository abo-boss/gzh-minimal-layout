import type { ArticleProfile } from "../contracts/article-profile.js";
import type { Block, BlockDocument, BlockStructure } from "../contracts/block-document.js";
import { inspectSource } from "../source/inspect-source.js";
import type { SourceFormat, SourceManifest } from "../source/source-manifest.js";
import { displayMarkdownText, parseInlineMarkdown } from "./inline-markdown.js";

export interface ArticleAnalysisResult {
  sourceManifest: SourceManifest;
  articleProfile: ArticleProfile;
  blockDocument: BlockDocument;
}

export function analyzeArticle(
  source: string,
  options: { sourceId: string; format: SourceFormat },
): ArticleAnalysisResult {
  const sourceManifest = inspectSource(source, options);
  const articleProfile = inferArticleProfile(sourceManifest);
  const sectionState = { current: "entry", ordinal: 0, inConclusion: false };
  const blocks: Block[] = [];

  for (let index = 0; index < sourceManifest.segments.length;) {
    const segment = sourceManifest.segments[index]!;
    const display = displayMarkdownText(stripHeadingSyntax(segment.content));
    if (isActionHeading(display)) {
      const grouped = sourceManifest.segments.slice(index);
      blocks.push(createGroupedBlock(grouped, "cta", "action", sectionState.current = "action"));
      break;
    }
    const block = createBlock(segment.content, {
      index,
      sourceOrder: segment.sourceOrder,
      sectionState,
      isFirst: index === 0,
      isLead: index === 1,
    });
    blocks.push({
      ...block,
      id: `${block.type}-${String(index + 1).padStart(3, "0")}`,
      sourceRefs: [segment.id],
      sourceSpans: [{ sourceRef: segment.id, startOffset: segment.startOffset, endOffset: segment.endOffset }],
    });
    if (isConclusionHeading(display)) {
      const conclusionStart = index + 1;
      let conclusionEnd = conclusionStart;
      while (conclusionEnd < sourceManifest.segments.length && !isActionHeading(displayMarkdownText(stripHeadingSyntax(sourceManifest.segments[conclusionEnd]!.content)))) {
        conclusionEnd += 1;
      }
      if (conclusionEnd > conclusionStart) {
        blocks.push(createGroupedBlock(
          sourceManifest.segments.slice(conclusionStart, conclusionEnd),
          "ending",
          "conclusion",
          sectionState.current,
        ));
      }
      index = conclusionEnd;
      continue;
    }
    index += 1;
  }

  return {
    sourceManifest,
    articleProfile,
    blockDocument: {
      specVersion: "1.0",
      id: `${options.sourceId}-blocks`,
      articleType: articleProfile.articleType,
      moods: articleProfile.tone,
      segmentationDecisions: sourceManifest.segments.map((segment) => ({
        sourceRef: segment.id,
        decision: "keep" as const,
        reason: "preserve source text while assigning it to one semantic Block",
        producedBlockIds: blocks.filter((block) => block.sourceRefs?.includes(segment.id)).map((block) => block.id),
      })),
      blocks,
    },
  };
}

function createGroupedBlock(
  segments: SourceManifest["segments"],
  type: Extract<Block["type"], "ending" | "cta">,
  role: string,
  sectionId: string,
): Block {
  const content = segments.map((segment) => segment.content).join("\n\n");
  const displayParts = segments.map((segment) => displayMarkdownText(stripHeadingSyntax(segment.content)));
  const structure = type === "cta"
    ? {
        eyebrow: displayParts[0]!,
        prompt: displayParts.slice(1, -1).join("\n\n") || displayParts[0]!,
        ...(displayParts.length > 1 ? { highlight: displayParts.at(-1)! } : {}),
      }
    : undefined;
  const marks = parseInlineMarkdown(content).marks;
  return {
    id: `${type}-${String(segments[0]!.sourceOrder + 1).padStart(3, "0")}`,
    type,
    role,
    content,
    importance: type === "ending" ? 0.82 : 0.68,
    sourceOrder: segments[0]!.sourceOrder,
    sectionId,
    relationToPrevious: "before-ending",
    sourceRefs: segments.map((segment) => segment.id),
    ...(marks.length ? { marks } : {}),
    ...(structure ? { structure } : {}),
  };
}

function inferArticleProfile(manifest: SourceManifest): ArticleProfile {
  const headingCount = manifest.segments.filter((segment) => isSectionHeading(segment.content)).length;
  return {
    articleType: "opinion-knowledge",
    tone: ["calm", "instructional", "reflective"],
    contentDensity: manifest.segments.length > 20 ? "high" : "medium",
    structurePattern: headingCount >= 3 ? "argument-evidence-conclusion" : "other",
    sectionComplexity: headingCount >= 5 ? "high" : "medium",
  };
}

function createBlock(
  content: string,
  context: {
    index: number;
    sourceOrder: number;
    sectionState: { current: string; ordinal: number; inConclusion: boolean };
    isFirst: boolean;
    isLead: boolean;
  },
): Omit<Block, "id" | "sourceRefs" | "sourceSpans"> {
  const display = displayMarkdownText(stripHeadingSyntax(content));
  const heading = sectionHeading(content);
  const typeAndRole = resolveType(content, display, heading, context);
  const relationToPrevious = resolveRelation(typeAndRole.type, typeAndRole.role, context.index);
  const structure = resolveStructure(content, display, heading, typeAndRole.type, typeAndRole.role);
  const marks = typeAndRole.type === "paragraph" || typeAndRole.type === "lead"
    ? parseInlineMarkdown(stripHeadingSyntax(content)).marks
    : [];

  return {
    type: typeAndRole.type,
    role: typeAndRole.role,
    content,
    importance: importanceFor(typeAndRole.type, typeAndRole.role),
    sourceOrder: context.sourceOrder,
    ...(typeAndRole.level ? { level: typeAndRole.level } : {}),
    sectionId: context.sectionState.current,
    relationToPrevious,
    ...(marks.length ? { marks } : {}),
    ...(structure ? { structure } : {}),
  };
}

function resolveType(
  content: string,
  display: string,
  heading: ReturnType<typeof sectionHeading>,
  context: Parameters<typeof createBlock>[1],
): { type: Block["type"]; role: string; level?: number } {
  if (context.isFirst) return { type: "article-title", role: "title" };
  if (heading) {
    context.sectionState.ordinal = heading.ordinal;
    context.sectionState.current = `section-${heading.ordinal}`;
    return { type: "heading", role: "section-heading", level: 2 };
  }
  if (isConclusionHeading(display)) {
    context.sectionState.current = "conclusion";
    context.sectionState.inConclusion = true;
    return { type: "heading", role: "section-heading", level: 2 };
  }
  if (isActionHeading(display)) {
    context.sectionState.current = "action";
    context.sectionState.inConclusion = false;
    return { type: "heading", role: "section-heading", level: 2 };
  }
  if (context.isLead) return { type: "lead", role: "lead" };
  if (isList(content)) return { type: "list", role: "steps" };
  if (isStandaloneEmphasis(content)) return { type: "quote", role: "key-insight" };
  if (isCaption(content)) return { type: "article-subtitle", role: "image-caption" };
  if (isSubheading(display)) return { type: "heading", role: "subheading", level: 3 };
  if (context.sectionState.inConclusion) return { type: "ending", role: "conclusion" };
  if (looksLikePrinciple(display)) return { type: "callout", role: "explanation" };
  return { type: "paragraph", role: "body" };
}

function resolveRelation(
  type: Block["type"],
  role: string,
  index: number,
): NonNullable<Block["relationToPrevious"]> {
  if (index === 0) return "default";
  if (type === "heading") return "new-section";
  if (type === "ending" || role === "conclusion") return "before-ending";
  if (type === "quote" || type === "callout") return "before-strong-block";
  if (type === "list" || type === "article-subtitle") return "same-group";
  return "continuation";
}

function resolveStructure(
  content: string,
  display: string,
  heading: ReturnType<typeof sectionHeading>,
  type: Block["type"],
  role: string,
): BlockStructure | undefined {
  if (type === "heading") {
    if (heading) return { hasMarker: true, marker: heading.marker, ordinal: heading.ordinal, title: heading.title };
    return { hasMarker: false, title: display };
  }
  if (type === "list") {
    const lines = content.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    const ordered = lines.every((line) => /^\d+[.)、]\s*/u.test(line));
    return {
      ordered,
      items: lines.map((line, index) => ({
        ...(ordered ? { ordinal: Number(line.match(/^(\d+)/u)?.[1] ?? index + 1) } : {}),
        content: line.replace(/^(?:\d+[.)、]|[-+*])\s*/u, ""),
      })),
    };
  }
  if (type === "quote") return { content: displayMarkdownText(content), hasAttribution: false };
  return undefined;
}

function sectionHeading(content: string): { marker: string; ordinal: number; title: string } | undefined {
  const value = stripHeadingSyntax(content).trim();
  const chinese = value.match(/^([一二三四五六七八九十]+)(?:、\s*(.*))?$/u);
  if (chinese) {
    const ordinal = chineseOrdinal(chinese[1]!);
    if (!ordinal) return undefined;
    const title = chinese[2]?.trim() || chinese[1]!;
    return {
      marker: chinese[2] === undefined ? chinese[1]! : `${chinese[1]}、`,
      ordinal,
      title,
    };
  }
  const arabic = value.match(/^(\d{1,2})([｜|])\s*(.+)$/u);
  if (!arabic) return undefined;
  const ordinal = Number(arabic[1]);
  if (!Number.isInteger(ordinal) || ordinal < 1) return undefined;
  return {
    marker: `${arabic[1]}${arabic[2]}`,
    ordinal,
    title: arabic[3]!.trim(),
  };
}

function isSectionHeading(content: string): boolean { return sectionHeading(content) !== undefined; }

function chineseOrdinal(value: string): number | undefined {
  const values: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  return values[value];
}

function stripHeadingSyntax(value: string): string { return value.replace(/^#{1,6}[\t ]+/mu, ""); }

function isList(content: string): boolean {
  const lines = content.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  return lines.length >= 2 && lines.every((line) => /(?:；|;|[。！？!?])$/u.test(line) || /^(?:\d+[.)、]|[-+*])\s*/u.test(line));
}

function isStandaloneEmphasis(content: string): boolean { return /^\*\*[\s\S]+\*\*$/u.test(content.trim()); }
function isCaption(content: string): boolean { return /^\*图注[：:]/u.test(content.trim()); }
function isConclusionHeading(value: string): boolean { return /^结语[：:]/u.test(value); }
function isActionHeading(value: string): boolean { return /^(现在开始调整|行动|开始练习)/u.test(value); }
function isSubheading(value: string): boolean {
  return value.length <= 22
    && !/[。！？!?；;]$/u.test(value)
    && /^(一个|金句|重点检查|图注|如何|为什么|什么|不要|正确|让)/u.test(value);
}
function looksLikePrinciple(value: string): boolean { return /^也就是说|^这里最重要|^通常选择|^真正自然|^关系越/u.test(value); }

function importanceFor(type: Block["type"], role: string): number {
  if (type === "article-title") return 1;
  if (type === "heading") return role === "section-heading" ? 0.88 : 0.65;
  if (["quote", "callout", "ending"].includes(type)) return 0.8;
  if (type === "lead") return 0.76;
  if (type === "list") return 0.68;
  return 0.55;
}
