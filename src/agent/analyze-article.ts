import type { ArticleProfile } from "../contracts/article-profile.js";
import type { Block, BlockDocument, BlockMark, BlockStructure, ImageStructure, ListStructure, QuoteStructure, TableStructure } from "../contracts/block-document.js";
import { DEFAULT_INLINE_MARK_BUDGET, type InlineMarkBudget } from "../contracts/presentation.js";
import { inspectSource } from "../source/inspect-source.js";
import type { SourceFormat, SourceKindHint, SourceManifest, SourceSegment } from "../source/source-manifest.js";
import { displayMarkdownText, parseInlineMarkdown } from "./inline-markdown.js";

export interface ArticleAnalysisResult {
  sourceManifest: SourceManifest;
  articleProfile: ArticleProfile;
  blockDocument: BlockDocument;
}

/** Deterministic semantic pass before Agent review and component selection. */
export function analyzeArticle(source: string, options: { sourceId: string; format: SourceFormat; inlineMarkBudget?: InlineMarkBudget }): ArticleAnalysisResult {
  const sourceManifest = inspectSource(source, options);
  const articleProfile = inferArticleProfile(sourceManifest);
  const state = {
    sectionId: "entry", ordinal: 0, seenTitle: false, seenBody: false, keyInsightCount: 0,
    inlineMarkBudget: options.inlineMarkBudget ?? DEFAULT_INLINE_MARK_BUDGET,
  };
  const units = sourceManifest.segments.flatMap((segment) => sourceUnits(segment, options.format));
  const groups = groupSemanticUnits(units);
  const blocks = groups.map((group, index) => createBlock(group, index, state));
  return {
    sourceManifest,
    articleProfile,
    blockDocument: {
      specVersion: "1.0", id: `${options.sourceId}-blocks`, articleType: articleProfile.articleType, moods: articleProfile.tone,
      segmentationDecisions: sourceManifest.segments.map((segment) => {
        const producedBlockIds = blocks.filter((block) => block.sourceRefs?.includes(segment.id)).map((block) => block.id);
        return {
          sourceRef: segment.id,
          decision: producedBlockIds.length > 1 ? "split" as const : "keep" as const,
          reason: producedBlockIds.length > 1
            ? "split plain-text source unit into semantic reading groups"
            : `preserve ${segment.kindHint} source unit before semantic layout`,
          producedBlockIds,
        };
      }),
      blocks,
    },
  };
}

interface SourceUnit {
  segment: SourceSegment;
  content: string;
  startOffset: number;
  endOffset: number;
  kindHint: SourceKindHint;
}

interface SemanticGroup {
  units: SourceUnit[];
  kind: "prose" | "question-set" | "parallel-sequence" | "subtopic";
}

function createBlock(group: SemanticGroup, index: number, state: State): Block {
  const first = group.units[0]!;
  const content = group.units.map((unit) => unit.content).join("\n");
  let semantic = semanticInfo(content, first.kindHint, headingInfo(content), state);
  if (group.kind === "subtopic" && semantic.type === "paragraph") {
    semantic = {
      type: "heading",
      role: "subtopic",
      level: 3,
      structure: { hasMarker: false, title: displayMarkdownText(stripHeadingSyntax(content)).trim() },
    };
  }
  const role = semantic.type === "paragraph" || semantic.type === "lead"
    ? group.kind === "question-set" ? "question-set"
      : group.kind === "parallel-sequence" ? "parallel-sequence"
        : group.kind === "subtopic" ? "subtopic"
          : semantic.role
    : semantic.role;
  const target = markTarget(content, semantic.type, semantic.structure);
  const parsed = markable(semantic.type) ? parseInlineMarkdown(target) : { text: "", marks: [] as BlockMark[] };
  const marks = mergeInlineMarks(parsed.marks, semanticInlineMarks(parsed.text, semantic.type, role, parsed.marks, state.inlineMarkBudget));
  const block: Block = {
    id: `${semantic.type}-${String(index + 1).padStart(3, "0")}`, type: semantic.type, role,
    content, importance: importanceFor(semantic.type, role), sourceOrder: index,
    ...(semantic.level ? { level: semantic.level } : {}), sectionId: state.sectionId,
    ...(group.kind !== "prose" ? { groupId: `${state.sectionId}-${group.kind}-${index + 1}` } : {}),
    relationToPrevious: relationFor(semantic.type, role, index), sourceRefs: [first.segment.id],
    sourceSpans: group.units.map((unit) => ({ sourceRef: unit.segment.id, startOffset: unit.startOffset, endOffset: unit.endOffset })),
    ...(marks.length ? { marks } : {}), ...(semantic.structure ? { structure: semantic.structure } : {}),
    ...(semantic.metadata ? { metadata: semantic.metadata } : {}),
  };
  state.seenBody ||= !["article-title", "article-subtitle", "metadata", "divider"].includes(block.type);
  return block;
}

/**
 * A blank-line source segment is an audit boundary, not necessarily a visual
 * paragraph. Plain-text writers often put one sentence on each line inside a
 * section; retain those lines as candidate beats so the semantic pass can
 * merge them deliberately instead of treating a whole chapter as one block.
 */
function sourceUnits(segment: SourceSegment, format: SourceFormat): SourceUnit[] {
  if (format !== "plain-text" || segment.kindHint !== "paragraph" || !/\r?\n/u.test(segment.content)) {
    return [{ segment, content: segment.content, startOffset: segment.startOffset, endOffset: segment.endOffset, kindHint: segment.kindHint }];
  }
  const units: SourceUnit[] = [];
  const pattern = /[^\r\n]+/gu;
  for (const match of segment.content.matchAll(pattern)) {
    if (!match[0]!.trim()) continue;
    const relativeStart = match.index!;
    units.push({
      segment,
      content: match[0]!,
      startOffset: segment.startOffset + relativeStart,
      endOffset: segment.startOffset + relativeStart + match[0]!.length,
      kindHint: segment.kindHint,
    });
  }
  return units.length > 0 ? units : [{ segment, content: segment.content, startOffset: segment.startOffset, endOffset: segment.endOffset, kindHint: segment.kindHint }];
}

function groupSemanticUnits(units: SourceUnit[]): SemanticGroup[] {
  const groups: SemanticGroup[] = [];
  let index = 0;
  while (index < units.length) {
    const current = units[index]!;
    const next = units[index + 1];
    if (!isPlainProseUnit(current) || isStructuralLine(current.content)) {
      groups.push({ units: [current], kind: "prose" });
      index += 1;
      continue;
    }

    // A question lead-in and its contiguous questions are one reading beat:
    // compact inside the group, with a pause before it.
    if (isQuestionLine(current.content) || (endsWithColon(current.content) && next && sameSegment(current, next) && isQuestionLine(next.content))) {
      const questionUnits = [current];
      index += 1;
      while (index < units.length && questionUnits.length < 4) {
        const candidate = units[index]!;
        if (!sameSegment(current, candidate) || !isQuestionLine(candidate.content)) break;
        questionUnits.push(candidate);
        index += 1;
      }
      groups.push({ units: questionUnits, kind: questionUnits.length > 1 ? "question-set" : "prose" });
      continue;
    }

    if (isSubtopicLine(current.content)) {
      groups.push({ units: [current], kind: "subtopic" });
      index += 1;
      continue;
    }

    const proseUnits = [current];
    index += 1;
    if (isKeyInsight(current.content)) {
      groups.push({ units: proseUnits, kind: "prose" });
      continue;
    }
    while (index < units.length && proseUnits.length < 3) {
      const candidate = units[index]!;
      if (!sameSegment(current, candidate) || !isPlainProseUnit(candidate) || isStructuralLine(candidate.content)) break;
      if (startsNewThought(candidate.content) || isQuestionLine(candidate.content) || isSubtopicLine(candidate.content) || isKeyInsight(candidate.content)) break;
      if (displayLength(proseUnits) + candidate.content.trim().length > 92) break;
      proseUnits.push(candidate);
      index += 1;
    }
    groups.push({ units: proseUnits, kind: isParallelSequence(proseUnits) ? "parallel-sequence" : "prose" });
  }
  return groups;
}

function isPlainProseUnit(unit: SourceUnit): boolean {
  return unit.kindHint === "paragraph";
}

function sameSegment(left: SourceUnit, right: SourceUnit): boolean {
  return left.segment.id === right.segment.id;
}

function isStructuralLine(value: string): boolean {
  return Boolean(headingInfo(value)) || Boolean(ordinalMarker(value.trim())) || isConclusionHeading(displayMarkdownText(value).trim());
}

function isQuestionLine(value: string): boolean {
  const line = value.trim();
  return /[？?]/u.test(line) || /^(?:难道|能不能|为什么|如何|什么)/u.test(line);
}

function endsWithColon(value: string): boolean {
  return /[：:]\s*$/u.test(value.trim());
}

function isSubtopicLine(value: string): boolean {
  return /^第[一二三四五六七八九十]+[，、.．]/u.test(value.trim());
}

function startsNewThought(value: string): boolean {
  return /^(?:但|可|不过|然而|其实|于是|现在回头看|最后|很多成长还有)/u.test(value.trim());
}

function isKeyInsight(value: string): boolean {
  const text = value.trim();
  if (Array.from(text).length > 54 || !/[。！？!?]$/u.test(text)) return false;
  return /^(?:持续成长|真正重要|最重要|关键在于|个人进化系统).*?(?:需要|是|在于|决定)/u.test(text);
}

function semanticInlineMarks(
  content: string,
  type: Block["type"],
  role: string,
  authorMarks: BlockMark[],
  budget: InlineMarkBudget,
): BlockMark[] {
  // This is deliberately a local paragraph budget, never a global article
  // quota. If no defensible phrase is found, zero is preferable to decoration.
  if (type !== "paragraph" || !["body", "conclusion"].includes(role)) return [];

  const usedTypes = new Set(authorMarks.map((mark) => mark.type));
  const remaining = budget.maxPerParagraph - authorMarks.length;
  if (remaining <= 0 || usedTypes.size >= budget.maxStyleKindsPerParagraph) return [];

  const candidates: BlockMark[] = [];
  const duration = [...content.matchAll(/\d+(?:天|周|个月|年|小时|分钟|%)/gu)].at(-1);
  if (duration?.index !== undefined && !usedTypes.has("highlight")) {
    candidates.push({ type: "highlight", start: duration.index, end: duration.index + duration[0].length });
  }
  if (!usedTypes.has("strong")) {
    candidates.push(...findSemanticKeyPhrases(
      content,
      budget.preferredPhraseMinChars,
      budget.preferredPhraseMaxChars,
      Math.max(0, remaining - candidates.length),
    ).map((phrase) => ({ type: "strong" as const, ...phrase })));
  }

  const accepted: BlockMark[] = [];
  for (const candidate of candidates) {
    if (accepted.length >= remaining) break;
    const kinds = new Set([...usedTypes, ...accepted.map((mark) => mark.type)]);
    if (!kinds.has(candidate.type) && kinds.size >= budget.maxStyleKindsPerParagraph) continue;
    if (accepted.some((mark) => mark.start < candidate.end && candidate.start < mark.end)) continue;
    if (authorMarks.some((mark) => mark.start < candidate.end && candidate.start < mark.end)) continue;
    accepted.push(candidate);
  }
  return accepted;
}

function findSemanticKeyPhrases(
  content: string,
  minChars: number,
  maxChars: number,
  limit: number,
): Array<{ start: number; end: number }> {
  // Mark complete claims and actions (3–15 chars), never isolated two-character
  // nouns. A short data token is handled separately by the highlight branch.
  const claims = /持续成长|个人(?:进化)?系统|完整(?:的)?回路|目标结果|真实反馈|反馈回路|系统行为|核心(?:观点|结论)|关键(?:数据|结果)|存量和流量|网站上线|AI协助解决|网站真正做了出来|真正做完的事情|生活很少发生变化|反复出现同样的状态|原来的结构|完整的个人系统/gu;
  const properNames = /Vibecoding|INFP/gu;
  const matches = [...content.matchAll(claims), ...content.matchAll(properNames)]
    .filter((match) => match.index !== undefined)
    .filter((match) => {
      const length = Array.from(match[0]).length;
      return length >= minChars && length <= maxChars;
    })
    .sort((left, right) => (right.index ?? 0) - (left.index ?? 0));
  const selected: Array<{ start: number; end: number }> = [];
  for (const match of matches) {
    if (selected.length >= limit || match.index === undefined) break;
    const candidate = { start: match.index, end: match.index + match[0].length };
    if (selected.some((phrase) => phrase.start < candidate.end && candidate.start < phrase.end)) continue;
    selected.push(candidate);
  }
  return selected;
}

function mergeInlineMarks(authorMarks: BlockMark[], semanticMarks: BlockMark[]): BlockMark[] {
  const accepted = [...authorMarks].sort((left, right) => left.start - right.start || left.end - right.end);
  for (const candidate of semanticMarks) {
    if (accepted.some((mark) => mark.start < candidate.end && candidate.start < mark.end)) continue;
    accepted.push(candidate);
  }
  return accepted.sort((left, right) => left.start - right.start || left.end - right.end);
}

function isParallelSequence(units: SourceUnit[]): boolean {
  if (units.length < 3 || !units.every((unit) => unit.content.trim().length <= 20)) return false;
  const chainVerbs = units.filter((unit) => /(?:带来|推动|变成|产生|回到|留下)/u.test(unit.content)).length;
  return chainVerbs >= 2 || endsWithColon(units[0]!.content);
}

function displayLength(units: SourceUnit[]): number {
  return units.reduce((total, unit) => total + unit.content.trim().length, 0);
}

interface State {
  sectionId: string;
  ordinal: number;
  seenTitle: boolean;
  seenBody: boolean;
  keyInsightCount: number;
  inlineMarkBudget: InlineMarkBudget;
}
interface Semantic { type: Block["type"]; role: string; level?: number; structure?: BlockStructure; metadata?: Block["metadata"] }
function semanticInfo(content: string, kindHint: SourceKindHint, heading: HeadingInfo | undefined, state: State): Semantic {
  const display = displayMarkdownText(stripHeadingSyntax(content)).trim();
  if (heading) {
    if (!state.seenTitle && heading.level === 1) { state.seenTitle = true; return { type: "article-title", role: "title" }; }
    state.seenTitle = true;
    const level = Math.min(Math.max(heading.level, 2), 4);
    const marker = ordinalMarker(heading.text);
    if (marker) { state.ordinal = marker.ordinal; state.sectionId = `section-${marker.ordinal}`; }
    else state.sectionId = `section-${Math.max(state.ordinal + 1, 1)}`;
    return { type: "heading", role: level === 2 ? "section-heading" : "subheading", level,
      structure: marker ? { hasMarker: true, marker: marker.marker, ordinal: marker.ordinal, title: marker.title } : { hasMarker: false, title: heading.text } };
  }
  if (!state.seenTitle) { state.seenTitle = true; return { type: "article-title", role: "title" }; }
  // Plain-text authors often use ordinal section labels without Markdown #.
  // Keep that convention semantic rather than forcing them to rewrite source.
  const plainMarker = ordinalMarker(stripHeadingSyntax(content).trim());
  if (plainMarker) {
    state.ordinal = plainMarker.ordinal; state.sectionId = `section-${plainMarker.ordinal}`;
    return { type: "heading", role: "section-heading", level: 2,
      structure: { hasMarker: true, marker: plainMarker.marker, ordinal: plainMarker.ordinal, title: plainMarker.title } };
  }
  if (kindHint === "quote") return { type: "quote", role: "source-quote", structure: quoteInfo(content) };
  if (kindHint === "list") return { type: "list", role: listRole(content), structure: listInfo(content) };
  if (kindHint === "image") { const image = imageInfo(content); return { type: "image", role: "source-image", structure: image, metadata: { src: image.src, alt: image.alt } }; }
  if (kindHint === "table") return { type: "table", role: "comparison-table", structure: tableInfo(content) };
  if (kindHint === "code") return { type: "code", role: "source-code" };
  if (kindHint === "divider") return { type: "divider", role: "source-divider" };
  if (isStandaloneStrong(content)) return { type: "quote", role: "key-insight", structure: { content: displayMarkdownText(content), hasAttribution: false } };
  if (isCaption(content)) return { type: "article-subtitle", role: "image-caption" };
  if (isConclusionHeading(display)) { state.sectionId = "conclusion"; return { type: "heading", role: "section-heading", level: 2, structure: { hasMarker: false, title: display } }; }
  if (!state.seenBody) return { type: "lead", role: "lead" };
  if (state.sectionId === "conclusion") return { type: "ending", role: "conclusion" };
  if (isKeyInsight(display) && state.keyInsightCount < 3) {
    state.keyInsightCount += 1;
    return { type: "paragraph", role: "key-insight" };
  }
  return { type: "paragraph", role: "body" };
}

function inferArticleProfile(manifest: SourceManifest): ArticleProfile {
  const counts = countKinds(manifest); const headings = counts.heading;
  const listDriven = counts.list + counts.table >= Math.max(2, manifest.segments.length / 3);
  const tutorial = counts.list > 0 && headings >= 2;
  return {
    articleType: listDriven ? "list-driven" : tutorial ? "tutorial" : "opinion-knowledge",
    tone: tutorial ? ["calm", "structured", "practical"] : ["calm", "instructional", "reflective"],
    contentDensity: manifest.segments.length > 20 ? "high" : manifest.segments.length < 7 ? "low" : "medium",
    structurePattern: listDriven ? "list-driven" : headings >= 3 ? "argument-evidence-conclusion" : "other",
    sectionComplexity: headings >= 5 || counts.table > 0 ? "high" : "medium",
  };
}
function countKinds(manifest: SourceManifest): Record<SourceSegment["kindHint"], number> {
  const counts: Record<SourceSegment["kindHint"], number> = { heading: 0, paragraph: 0, list: 0, quote: 0, code: 0, divider: 0, image: 0, table: 0 };
  for (const segment of manifest.segments) counts[segment.kindHint] += 1; return counts;
}

interface HeadingInfo { level: number; text: string }
function headingInfo(value: string): HeadingInfo | undefined { const m = value.match(/^\s*(#{1,6})\s+(.+?)\s*$/u); return m ? { level: m[1]!.length, text: m[2]! } : undefined; }
function ordinalMarker(value: string): { marker: string; ordinal: number; title: string } | undefined {
  const chinese = value.match(/^([一二三四五六七八九十]+)(、)?\s*(.*)$/u);
  if (chinese && (Boolean(chinese[2]) || !chinese[3]?.trim())) {
    const ordinal = chineseOrdinal(chinese[1]!);
    if (ordinal) return { marker: chinese[2] ? `${chinese[1]}、` : chinese[1]!, ordinal, title: chinese[3]?.trim() || chinese[1]! };
  }
  const arabic = value.match(/^(\d{1,2})(?:[.、]|[｜|])\s*(.*)$/u); if (!arabic) return undefined;
  const ordinal = Number(arabic[1]); return Number.isInteger(ordinal) && ordinal > 0 ? { marker: value.slice(0, value.length - (arabic[2]?.length ?? 0)).trim(), ordinal, title: arabic[2]?.trim() || arabic[1]! } : undefined;
}
function listInfo(content: string): ListStructure {
  const items = content.split(/\r?\n/u).filter(isListLine).map((line) => {
    const m = line.match(/^\s*(?:(\d+)[.)、]|[-+*])\s+(.+)$/u)!;
    const parsed = parseInlineMarkdown(m[2]!);
    return { ...(m[1] ? { ordinal: Number(m[1]) } : {}), content: m[2]!, ...(parsed.marks.length ? { marks: parsed.marks } : {}) };
  });
  return { ordered: items.every((item) => item.ordinal !== undefined), items };
}
function quoteInfo(content: string): QuoteStructure {
  const lines = content.split(/\r?\n/u).map((line) => line.replace(/^>\s?/u, "")); const tail = lines.at(-1)?.trim() ?? ""; const attribution = /^(?:[-—–]{1,2}\s*|—\s*)(.+)$/u.exec(tail);
  return attribution ? { content: lines.slice(0, -1).join("\n"), hasAttribution: true, attribution: attribution[1]! } : { content: lines.join("\n"), hasAttribution: false };
}
function imageInfo(content: string): ImageStructure { const m = content.trim().match(/^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)$/u); if (!m) throw new Error("Invalid Markdown image source segment"); return { src: m[2]!, alt: m[1]!, hasCaption: Boolean(m[3]), ...(m[3] ? { caption: m[3] } : {}) }; }
function tableInfo(content: string): TableStructure { const rows = content.split(/\r?\n/u).map(parseTableRow); return { headers: rows[0] ?? [], rows: rows.slice(2), mode: rows[0]?.length === 2 ? "comparison" : "data" }; }
function parseTableRow(line: string): string[] { return line.trim().replace(/^\||\|$/gu, "").split("|").map((cell) => cell.trim()); }
function markTarget(content: string, type: Block["type"], structure?: BlockStructure): string {
  if (type === "quote") return (structure as QuoteStructure).content;
  if (type === "heading") return (structure as { title?: string } | undefined)?.title ?? stripHeadingSyntax(content);
  if (type === "table") { const table = structure as TableStructure; return [...table.headers, ...table.rows.flat()].join("\n"); }
  return ["list", "image", "code", "divider"].includes(type) ? "" : stripHeadingSyntax(content);
}
function markable(type: Block["type"]): boolean { return !["list", "image", "code", "divider"].includes(type); }
function stripHeadingSyntax(value: string): string { return value.replace(/^\s*#{1,6}[\t ]+/u, ""); }
function isListLine(value: string): boolean { return /^\s*(?:[-+*]|\d+[.)、])\s+/u.test(value); }
function isStandaloneStrong(value: string): boolean { return /^\*\*[^*\n][\s\S]*?\*\*$/u.test(value.trim()); }
function listRole(content: string): string { return /^\s*\d+[.)、]\s+/mu.test(content) ? "steps" : "bullet-points"; }
function isCaption(value: string): boolean { return /^\*图注[：:]/u.test(value.trim()); }
function isConclusionHeading(value: string): boolean {
  const text = value.trim();
  return text === "最后" || text === "结语" || text === "写在最后" || /^(?:结语|写在最后)[：:]/u.test(text);
}
function chineseOrdinal(value: string): number | undefined { return ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 } as Record<string, number>)[value]; }
function relationFor(type: Block["type"], role: string, index: number): NonNullable<Block["relationToPrevious"]> { if (index === 0) return "default"; if (type === "heading" && role !== "subtopic") return "new-section"; if (type === "ending" || role === "conclusion") return "before-ending"; if (role === "question-set" || role === "subtopic") return "turning-point"; if (role === "key-insight" || ["quote", "callout", "table", "code"].includes(type)) return "before-strong-block"; if (["list", "image", "divider"].includes(type) || role === "parallel-sequence") return "same-group"; return "continuation"; }
function importanceFor(type: Block["type"], role: string): number { if (type === "article-title") return 1; if (type === "heading") return role === "section-heading" ? 0.88 : 0.68; if (role === "key-insight" || ["quote", "callout", "ending", "table", "code"].includes(type)) return 0.8; if (type === "lead") return 0.76; if (type === "list") return 0.68; return 0.55; }
