---
name: gzh-minimal-layout
description: 由 Agent 分析公众号文章的结构、语义和阅读节奏，自主选择匹配主题与合法组件，生成可验证、可直接粘贴到微信公众号后台的内联样式 HTML、375px 预览和分析轨迹。适用于用户提供文章或要求公众号排版；严格保持原文，不用于通用网页设计。
---

# 公众号智能排版

## 核心边界

- 保留全部原文、Block ID、来源位置和顺序；不得改写、补写、遗漏或重复正文。
- Agent 负责 `ArticleProfile`、`BlockDocument`、`ReadingPlan`、主题选择和候选取舍。
- Theme 负责组件能力、视觉 Token、节奏值和强调预算。
- Agent 只能选择主题返回的组件候选，并为非默认选择写明理由；不得提交 HTML、CSS、任意像素值或正文副本。
- Renderer 与 WeChat Adapter 只做确定性执行，最终必须通过来源覆盖与内容完整性校验。

## 用户交付

用户给出文件时直接读取；用户粘贴文章时，先将原文原样保存为任务目录中的 `source.md`。中间产物默认写入 `/tmp/gzh-minimal-layout/<slug>/`，除非用户指定保存位置。

用户必须拿到的文件只有一个：

- `<slug>.wechat.html`：可粘贴进微信公众号编辑器的纯内联 HTML 片段。

以下都是内部或按需产物，不属于必交文件：

- `<slug>.preview.html`：需要视觉确认时提供的无调试 375px 预览。
- `<slug>.debug.html`：仅供 Agent/开发者检查语义角色、组件、节奏和选择理由。
- `artifacts/`：来源清单、分析合同、候选、布局计划和 `analysis-trace.json`，仅供追溯。
- `baseline.wechat.html`：baseline 调试结果，不得作为最终交付。

## 必须执行的流程

```text
Source → SourceManifest → Agent ArticleProfile + BlockDocument
→ Agent ReadingPlan → theme candidates → Agent selections
→ LayoutPlan → Component Renderer → WeChat HTML + previews
```

1. 在本 Skill 根目录工作。仅首次使用或 `node_modules` 不存在时运行 `npm install`；依赖已就绪时不要重复安装。
2. 如需来源骨架，显式以 `--mode baseline` 对原文运行一次 baseline。baseline 只用于发现，不代表 Agent 已理解文章，也不是默认交付模式。
3. 阅读原文和 baseline 产物，亲自完成三份规范输入：
   - `ArticleProfile`：文章类型、语气、密度、结构模式与复杂度。
   - `BlockDocument`：语义块、角色、章节/组合、关系、重要度、结构字段和行内标记。
   - `ReadingPlan`：组合组、进入/正文/退出阶段、阅读动作、强调功能与逐块理由。
4. 验证三份合同。每个 Source Segment 必须有一个 `keep` 或 `split` 决策；`sourceRefs` 与 `sourceSpans` 必须覆盖原文。
5. 根据文章画像和阅读计划选择主题，不照抄示例命令：
   - `quiet-editorial`：通用长文、知识解释、安静开放的编辑排版。
   - `forest-order`：判断鲜明、结构丰富、需要章节仪式感的正式长文。
   - `whitespace-journal`：随笔、叙事、文学感或需要克制留白的文章。
6. 用 Agent 的 Blocks 与 ReadingPlan 生成 `candidates.json`。只在返回的候选中选择；需要偏离默认候选时写 `selections.json`。
7. 用三份 `--agent-*` 输入重跑完整工作流。结果必须报告 `analysisMode: "agent"` 和 `contentIntegrity.valid: true`。
8. 检查 375px 预览中的层级、长段阅读、强调预算、章节节奏和结尾；若不成立，调整语义判断、主题或合法候选选择后重跑。

## 可选的 AI 配图

- AI 配图必须通过独立的 `ImagePlan` 声明，不得把 Prompt 写进正文或改写原始 `source.md`。
- 每个图片计划必须绑定现有 `Block ID`、用途、前后位置、画幅、alt 文本、Prompt、资产 ID 和选择理由。
- 宿主 Agent 或外部 Provider 生成图片后，必须写入 `AssetManifest`；只有 `status: "ready"` 且 URL 安全的资产才允许渲染。
- `workflow run` 或 `wechat render` 只有在同时收到 `--image-plan` 与 `--asset-manifest` 时才插入图片；缺少任一文件时不生成、不猜测、不上传。
- 详细合同和命令见 [docs/IMAGE_PLAN.md](docs/IMAGE_PLAN.md)。

详细命令与合同一致性规则见 [references/agent-workflow.md](references/agent-workflow.md)。

## 最终运行

```bash
npm run --silent cli -- workflow run \
  --input /tmp/gzh-minimal-layout/<slug>/source.md \
  --agent-profile /tmp/gzh-minimal-layout/<slug>/agent/article-profile.json \
  --agent-blocks /tmp/gzh-minimal-layout/<slug>/agent/block-document.json \
  --agent-reading /tmp/gzh-minimal-layout/<slug>/agent/reading-plan.json \
  --theme <chosen-theme> \
  --selections /tmp/gzh-minimal-layout/<slug>/selections.json \
  --output /tmp/gzh-minimal-layout/<slug>/<slug>.wechat.html \
  --preview /tmp/gzh-minimal-layout/<slug>/<slug>.debug.html \
  --clean-preview /tmp/gzh-minimal-layout/<slug>/<slug>.preview.html \
  --artifacts-dir /tmp/gzh-minimal-layout/<slug>/artifacts
```

没有非默认选择时省略 `--selections`。`workflow run` 默认是 Agent 模式，三份 `--agent-*` 参数必须一起出现；baseline 只能显式传入 `--mode baseline`。任何合同漂移、来源错误或非法组件选择都必须失败，不能静默回退到 baseline。

## 输出验收

- `.wechat.html` 必须是无文档外壳的 HTML 片段，只含内联样式；不得含外部样式表、脚本、class、ID、调试属性或未解析插槽。
- `analysis-trace.json` 的 `mode` 必须是 `agent`，并记录原文哈希、合同哈希和输入路径。
- `LayoutPlan` 只保存 Block ID、组件/变体、阅读动作、主题节奏及理由，不保存文章正文。
- 结构组件只能读取 `BlockDocument` 已声明的字段；没有来源图片 URL 时不得制造图片。
- 调试预览用于判断设计，微信片段用于交付；不要把调试预览粘贴进公众号后台。

组件扩展约束见 [docs/COMPONENT_LIBRARY.md](docs/COMPONENT_LIBRARY.md)。
