import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { sha256 } from "./inspect-source.js";

const execFileAsync = promisify(execFile);

export type NormalizableFormat = "markdown" | "plain-text" | "html" | "docx" | "pdf";

export interface NormalizedInput {
  format: NormalizableFormat;
  markdown: string;
  inputHash: string;
  normalizedHash: string;
  warnings: string[];
}

/**
 * Make a Markdown *draft* for the deterministic layout pipeline. The draft
 * never silently replaces the original input: callers receive both hashes and
 * must review the result before inspect/compose/commit. PDF intentionally
 * remains a host-extraction boundary because reliable page reading needs a
 * PDF-capable tool, not a lossy regex fallback.
 */
export async function normalizeInput(
  input: string,
  requested: NormalizableFormat | "auto" = "auto",
): Promise<NormalizedInput> {
  const format = resolveNormalizableFormat(input, requested);
  if (format === "pdf") {
    throw new Error("PDF normalization needs a PDF-capable host extraction step. Export reviewed Markdown first, then run normalize/inspect on that file.");
  }
  if (format === "docx") return normalizeDocx(input);
  const source = await readFile(path.resolve(input), "utf8");
  const markdown = format === "html" ? htmlToMarkdown(source) : source;
  return {
    format,
    markdown: ensureTrailingNewline(markdown),
    inputHash: sha256(source),
    normalizedHash: sha256(ensureTrailingNewline(markdown)),
    warnings: format === "plain-text"
      ? ["Plain text is preserved as a Markdown draft; review inferred headings, lists and quotes in inspect before committing."]
      : format === "html"
        ? ["HTML presentation styles were intentionally removed; review the Markdown draft before committing."]
        : [],
  };
}

export function resolveNormalizableFormat(input: string, requested: NormalizableFormat | "auto" = "auto"): NormalizableFormat {
  if (requested !== "auto") return requested;
  const extension = path.extname(input).toLowerCase();
  if (extension === ".md" || extension === ".markdown") return "markdown";
  if (extension === ".docx") return "docx";
  if (extension === ".pdf") return "pdf";
  if (extension === ".html" || extension === ".htm") return "html";
  return "plain-text";
}

async function normalizeDocx(input: string): Promise<NormalizedInput> {
  const inputPath = path.resolve(input);
  const outputPath = path.join(path.dirname(inputPath), `.${path.basename(inputPath, path.extname(inputPath))}.normalized.md`);
  const script = path.resolve(process.cwd(), "scripts", "extract-docx.py");
  try {
    await execFileAsync("python3", [script, inputPath, "--output", outputPath]);
    const [original, markdown] = await Promise.all([readFile(inputPath), readFile(outputPath, "utf8")]);
    return {
      format: "docx",
      markdown: ensureTrailingNewline(markdown),
      inputHash: sha256(original),
      normalizedHash: sha256(ensureTrailingNewline(markdown)),
      warnings: ["DOCX was converted to a Markdown draft. Verify headings, lists, tables and extracted media before committing."],
    };
  } finally {
    // The CLI caller receives its explicitly requested output; this temporary
    // helper file never becomes an implicit input artifact.
    const { unlink } = await import("node:fs/promises");
    await unlink(outputPath).catch(() => undefined);
  }
}

function htmlToMarkdown(html: string): string {
  let value = html
    .replace(/<(?:script|style|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript)>/giu, "")
    .replace(/<pre\b[^>]*><code\b[^>]*>([\s\S]*?)<\/code><\/pre>/giu, (_m, content: string) => `\n\n\`\`\`\n${htmlText(content)}\n\`\`\`\n\n`)
    .replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/giu, (_m, content: string) => `**${htmlText(content)}**`)
    .replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/giu, (_m, content: string) => `*${htmlText(content)}*`)
    .replace(/<u\b[^>]*>([\s\S]*?)<\/u>/giu, (_m, content: string) => `<u>${htmlText(content)}</u>`)
    .replace(/<(?:del|s)\b[^>]*>([\s\S]*?)<\/(?:del|s)>/giu, (_m, content: string) => `~~${htmlText(content)}~~`)
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/giu, (_m, content: string) => `\`${htmlText(content)}\``)
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/giu, (_m, level: string, content: string) => `\n\n${"#".repeat(Number(level))} ${htmlText(content)}\n\n`)
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/giu, (_m, content: string) => `\n\n${htmlText(content).split(/\n+/u).filter(Boolean).map((line) => `> ${line}`).join("\n")}\n\n`)
    .replace(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/giu, (_m, src: string) => `\n\n![](${src})\n\n`)
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/giu, (_m, content: string) => `\n- ${htmlText(content)}`)
    .replace(/<\/?(?:ul|ol)\b[^>]*>/giu, "\n")
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/<\/(?:p|section|article|div|figure|figcaption|tr)>/giu, "\n\n")
    .replace(/<[^>]+>/gu, "");
  value = decodeEntities(value).replace(/\n{3,}/gu, "\n\n").trim();
  return value;
}

function htmlText(value: string): string {
  return decodeEntities(value.replace(/<br\s*\/?\s*>/giu, "\n").replace(/<[^>]+>/gu, "")).replace(/\s*\n\s*/gu, " ").trim();
}

function decodeEntities(value: string): string {
  return value.replace(/&nbsp;/giu, " ").replace(/&lt;/giu, "<").replace(/&gt;/giu, ">").replace(/&quot;/giu, '"').replace(/&#39;/giu, "'").replace(/&amp;/giu, "&");
}
function ensureTrailingNewline(value: string): string { return value.endsWith("\n") ? value : `${value}\n`; }
