---
name: gzh-minimal-layout
description: 分析公众号文章结构与语义，一步生成可直接粘贴到微信公众号后台的内联样式 HTML。适用于用户提供文章或要求公众号排版。
---

# 公众号智能排版

## 核心原则

- 保留全部原文，不得改写、补写、遗漏或重复。
- Agent 负责一次性决策：文章类型 + 分块 + 组件选择 + 阅读节奏。
- 渲染器负责确定性执行和内容完整性校验。

## 用户交付

唯一必交文件：`<slug>.wechat.html`（可粘贴进微信编辑器的内联 HTML 片段）。

可选文件（按需提供）：
- `<slug>.preview.html`：375px 预览页
- `layout-decision.json`：Agent 决策记录

## 意图路由

根据文章复杂度选择模式：

| 模式 | 适用场景 | 步骤数 |
|------|---------|--------|
| 快速 | 短文(<1500字)、结构简单 | 3步 |
| 标准 | 长文、复杂结构、多章节 | 4步 |

## 工作流（标准模式）

```text
Source → Agent 读主题参考 → Agent 输出 LayoutDecision → CLI render → WeChat HTML
```

### Step 1: 准备

在本 Skill 根目录工作。仅 `node_modules` 不存在时运行 `npm install`。

用户给出文件时直接读取；粘贴文章时保存为 `/tmp/gzh-layout/<slug>/source.md`。

### Step 2: 推荐后再决策

先通读原文，判断 `articleType`、1–3 个英文 `tone` 标签和 `structure`。必须运行主题推荐命令，再从返回的 Top 3 中选择主题；不得因示例、主题索引的排列顺序或“通用”标签直接固定选择某个主题。

```bash
npm run --silent cli -- recommend \
  --article-type literary-prose \
  --tone cool,reflective,minimal \
  --structure fragmented-prose
```

散文必须先区分气质：冷调极简优先比较 `cobalt-essay`，温暖叙事优先比较 `whitespace-journal`，文艺手工感优先比较 `brick-literary`，实验/自然意象优先比较 `moss-staircase`。Top 1 不是强制选择；若候选得分接近，按文章的真实视觉气质选择，并写明 `themeReason`。

读取 [references/theme-index.md](references/theme-index.md) 和 [references/component-mapping.md](references/component-mapping.md)，然后为文章写出一份 `layout-decision.json`：

```json
{
  "specVersion": "2.0",
  "articleType": "literary-prose",
  "tone": ["cool", "reflective", "minimal"],
  "theme": "<theme-id-from-recommend>",
  "themeReason": "<why this candidate fits the source better than the other two>",
  "density": "balanced",
  "blocks": [
    {
      "id": "title-1",
      "type": "article-title",
      "content": "标题原文",
      "component": "masthead",
      "variant": "editorial",
      "phase": "entry",
      "gesture": "anchor",
      "emphasis": "strong"
    },
    {
      "id": "p-1",
      "type": "paragraph",
      "content": "段落原文...",
      "component": "prose",
      "variant": "body",
      "phase": "body",
      "gesture": "flow",
      "emphasis": "quiet"
    }
  ]
}
```

决策要求：
- `content` 必须是原文原样，不改写
- `theme` 必须来自本次 `recommend` 的 Top 3；`themeReason` 要说明文章气质或结构为何匹配该候选
- `component` 和 `variant` 必须是所选主题的合法组件（参考 component-mapping.md）
- 每个 section 最多 1 个 emphasis=strong
- strong 块不能相邻

### Step 3: 渲染

```bash
npm run --silent cli -- render \
  --input /tmp/gzh-layout/<slug>/source.md \
  --decision /tmp/gzh-layout/<slug>/layout-decision.json \
  --output /tmp/gzh-layout/<slug>/<slug>.wechat.html \
  --preview /tmp/gzh-layout/<slug>/<slug>.preview.html
```

结果必须报告 `contentIntegrity.valid: true`。

### Step 4: 验收

检查预览中的层级、节奏和结尾。若不满意，调整 `layout-decision.json` 中的组件/变体选择后重跑 Step 3。

## 快速模式

短文或结构简单时，可以跳过详细分块分析，但仍必须运行一次 `recommend`；不得直接按某个默认主题生成：

```bash
npm run --silent cli -- render \
  --input source.md \
  --decision layout-decision.json \
  --output output.wechat.html
```

## CLI 命令参考

| 命令 | 用途 |
|------|------|
| `npm run cli -- render --input <md> --decision <json> --output <html>` | 渲染 |
| `npm run cli -- themes` | 列出所有可用主题 |
| `npm run cli -- validate --decision <json>` | 校验决策合法性 |

## 输出规范

- `.wechat.html`：无 DOCTYPE/html/head/body，只含内联样式的 HTML 片段
- 不含外部样式表、脚本、class、ID 或调试属性
- 所有样式内联，可直接粘贴到微信编辑器

## AI 配图（可选）

需要配图时，在 render 命令中追加 `--image-plan` 和 `--asset-manifest`。
详见 [docs/IMAGE_PLAN.md](docs/IMAGE_PLAN.md)。
