import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { normalizeInput, resolveNormalizableFormat } from "../src/source/normalize-input.js";

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe("input normalization", () => {
  it("turns semantic HTML into a reviewable Markdown draft without preserving presentation styles", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "gzh-normalize-")); directories.push(directory);
    const input = path.join(directory, "article.html");
    await writeFile(input, '<h1 style="color:red">标题</h1><p>正文 <strong>重点</strong></p><blockquote>引用</blockquote><ul><li>项目</li></ul>', "utf8");
    const result = await normalizeInput(input);
    expect(result.format).toBe("html");
    expect(result.markdown).toContain("# 标题");
    expect(result.markdown).toContain("正文 **重点**");
    expect(result.markdown).toContain("> 引用");
    expect(result.markdown).toContain("- 项目");
    expect(result.warnings).toHaveLength(1);
  });

  it("keeps plain text byte-for-byte except for a final newline and routes PDFs to a capable host", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "gzh-normalize-")); directories.push(directory);
    const input = path.join(directory, "article.txt");
    await writeFile(input, "标题\n\n正文", "utf8");
    const result = await normalizeInput(input);
    expect(result.markdown).toBe("标题\n\n正文\n");
    expect(resolveNormalizableFormat("report.pdf")).toBe("pdf");
    await expect(normalizeInput(path.join(directory, "report.pdf"))).rejects.toThrow(/PDF-capable host extraction/);
  });
});
