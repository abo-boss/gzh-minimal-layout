import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeArticle } from "../src/agent/analyze-article.js";
import { createLayoutPlan } from "../src/presentation/layout-plan.js";
import { renderComponentArticle } from "../src/presentation/component-renderer.js";
import { createEssayReadingPlan } from "../src/reading/essay-reading-plan.js";
import { loadThemeLibraries } from "../src/theme/theme-library.js";

const GALLERY_SOURCE = `# 一篇文章如何慢下来

真正能被读完的文章，不依赖更多装饰，而依赖清晰的节奏。

## 给文字留出呼吸

当段落不再拥挤，观点才有时间抵达读者。留白不是空洞，而是为理解预留的停顿。

## 三个阅读原则

1. 先让标题说明方向
2. 再让正文展开细节
3. 最后把重点留给读者回想

> 好的排版不是替文字说话，而是让文字被更安静地听见。 — 编辑手记

## 回到内容本身

选择主题不是套用装饰，而是为文章选择合适的阅读速度、层级与情绪温度。

排版的最高境界，是让读者只记得内容。`;

const ARTICLE_TYPE_LABELS: Record<string, string> = {
  "personal-essay": "个人随笔",
  "opinion-knowledge": "观点/知识",
  "literary-prose": "文学散文",
  tutorial: "教程",
  "list-driven": "清单/步骤",
  other: "其他",
};

export interface ThemeGalleryResult {
  directory: string;
  galleryPath: string;
  previewPaths: string[];
}

export async function generateThemeGallery(
  outputDirectory = path.resolve("previews/theme-gallery"),
  repositoryRoot = process.cwd(),
  source = GALLERY_SOURCE,
): Promise<ThemeGalleryResult> {
  const document = analyzeArticle(source, {
    sourceId: "theme-gallery-sample",
    format: "markdown",
  }).blockDocument;
  const readingPlan = createEssayReadingPlan(document);
  const libraries = await loadThemeLibraries(repositoryRoot);
  const previewsDirectory = path.join(outputDirectory, "themes");
  await mkdir(previewsDirectory, { recursive: true });

  const cards: string[] = [];
  const previewPaths: string[] = [];
  for (const library of libraries) {
    // The gallery is a deterministic theme baseline, not an Agent simulation.
    // Host Agents add only sparse, content-justified enhancements in real work.
    const layout = createLayoutPlan(document, readingPlan, library);
    const rendered = renderComponentArticle(document, layout, library);
    const previewFile = `${library.manifest.id}.html`;
    const previewPath = path.join(previewsDirectory, previewFile);
    await writeFile(previewPath, rendered.cleanPreviewHtml, "utf8");
    previewPaths.push(previewPath);

    const profile = library.manifest.recommendation;
    cards.push(`<article class="theme-card" data-types="${escapeAttribute(profile.articleTypes.join(" "))}">
  <header class="card-header">
    <div>
      <p class="eyebrow">${escapeHtml(library.manifest.id)}</p>
      <h2>${escapeHtml(library.manifest.name)}</h2>
    </div>
    <a href="themes/${escapeAttribute(previewFile)}" target="_blank" rel="noreferrer">独立查看 ↗</a>
  </header>
  <p class="summary">${escapeHtml(profile.summary)}</p>
  <div class="tags">${profile.articleTypes.map((type) => `<span>${escapeHtml(ARTICLE_TYPE_LABELS[type] ?? type)}</span>`).join("")}</div>
  <div class="preview-shell"><iframe title="${escapeAttribute(library.manifest.name)}主题预览" src="themes/${escapeAttribute(previewFile)}" loading="lazy"></iframe></div>
</article>`);
  }

  const galleryPath = path.join(outputDirectory, "index.html");
  await writeFile(galleryPath, renderGallery(cards.join("\n")), "utf8");
  return { directory: outputDirectory, galleryPath, previewPaths };
}

function renderGallery(cards: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>主题预览档案 · gzh-minimal-layout</title>
  <style>
    :root { color: #24231f; background: #e9e5dc; font-family: "PingFang SC", "Hiragino Sans GB", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background-color: #e9e5dc; background-image: linear-gradient(90deg, rgba(36,35,31,.035) 1px, transparent 1px), linear-gradient(rgba(36,35,31,.025) 1px, transparent 1px); background-size: 28px 28px; }
    .masthead { max-width: 1440px; margin: 0 auto; padding: 72px 40px 34px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 32px; align-items: end; }
    .kicker, .eyebrow { margin: 0; color: #746d61; font-size: 11px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
    h1, h2 { font-family: "Songti SC", STSong, SimSun, serif; }
    h1 { max-width: 760px; margin: 10px 0 0; font-size: clamp(36px, 5vw, 68px); font-weight: 500; letter-spacing: -.055em; line-height: 1.04; }
    .intro { max-width: 480px; margin: 18px 0 0; color: #5d584f; font-size: 15px; line-height: 1.85; }
    .count { margin: 0 0 6px; color: #746d61; font-size: 12px; letter-spacing: .08em; white-space: nowrap; }
    .filters { max-width: 1440px; margin: 0 auto; padding: 0 40px 32px; display: flex; flex-wrap: wrap; gap: 8px; }
    .filter { cursor: pointer; border: 1px solid #bdb4a6; border-radius: 999px; background: rgba(250,248,241,.7); color: #504b42; padding: 9px 14px; font: inherit; font-size: 12px; transition: background-color .18s ease, color .18s ease, border-color .18s ease; }
    .filter[aria-pressed="true"], .filter:hover { border-color: #292823; background: #292823; color: #f8f4e9; }
    main { max-width: 1440px; margin: 0 auto; padding: 0 40px 72px; }
    .theme-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(390px, 1fr)); gap: 22px; }
    .theme-card { overflow: hidden; border: 1px solid #c9c0b2; border-radius: 4px; background: rgba(248,245,237,.88); animation: rise .45s both; }
    .theme-card[hidden] { display: none; }
    .card-header { display: flex; justify-content: space-between; gap: 16px; padding: 22px 22px 0; }
    .card-header h2 { margin: 5px 0 0; font-size: 27px; font-weight: 500; letter-spacing: -.035em; }
    .card-header a { align-self: center; color: #4f493f; font-size: 12px; text-decoration: none; border-bottom: 1px solid currentColor; }
    .summary { min-height: 44px; margin: 15px 22px 12px; color: #625c52; font-size: 13px; line-height: 1.65; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 22px 18px; }
    .tags span { border: 1px solid #d6cec2; border-radius: 999px; color: #746d61; padding: 4px 8px; font-size: 11px; }
    .preview-shell { height: 610px; overflow: hidden; border-top: 1px solid #d9d1c5; background: #d9d4ca; }
    iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
    @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @media (max-width: 680px) { .masthead { padding: 44px 18px 24px; display: block; } .count { margin-top: 18px; } .filters, main { padding-left: 18px; padding-right: 18px; } .theme-grid { grid-template-columns: 1fr; } .preview-shell { height: 570px; } }
  </style>
</head>
<body>
  <header class="masthead">
    <div>
      <p class="kicker">gzh-minimal-layout / real render archive</p>
      <h1>7 套主题，<br>同一篇文章。</h1>
      <p class="intro">每一张预览都由同一份样文经真实组件、节奏与内联微信渲染生成。请直接对比标题、正文、章节、列表、引用和结尾的阅读感受。</p>
    </div>
    <p class="count">7 THEMES · 375PX PREVIEW</p>
  </header>
  <nav class="filters" aria-label="按推荐类型筛选">
    <button class="filter" type="button" data-filter="all" aria-pressed="true">全部 7 套</button>
    <button class="filter" type="button" data-filter="literary-prose">文学散文</button>
    <button class="filter" type="button" data-filter="personal-essay">个人随笔</button>
    <button class="filter" type="button" data-filter="opinion-knowledge">观点/知识</button>
    <button class="filter" type="button" data-filter="tutorial">教程</button>
    <button class="filter" type="button" data-filter="list-driven">清单/步骤</button>
  </nav>
  <main><section class="theme-grid">${cards}</section></main>
  <script>
    const buttons = [...document.querySelectorAll('.filter')];
    const cards = [...document.querySelectorAll('.theme-card')];
    buttons.forEach((button) => button.addEventListener('click', () => {
      const filter = button.dataset.filter;
      buttons.forEach((entry) => entry.setAttribute('aria-pressed', String(entry === button)));
      cards.forEach((card) => { card.hidden = filter !== 'all' && !card.dataset.types.split(' ').includes(filter); });
    }));
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  const outputDirectory = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve("previews/theme-gallery");
  const sourcePath = process.argv[3] ? path.resolve(process.argv[3]) : undefined;
  const source = sourcePath ? await readFile(sourcePath, "utf8") : undefined;
  const result = await generateThemeGallery(outputDirectory, process.cwd(), source);
  process.stdout.write(JSON.stringify({ success: true, ...result }, null, 2) + "\n");
}
