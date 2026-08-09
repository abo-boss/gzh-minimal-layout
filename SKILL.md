---
name: gzh-minimal-layout
description: 分析 Markdown 或纯文本公众号文章的结构、语义与阅读节奏，选择已注册主题，并生成可直接粘贴到微信公众号编辑器的内联 HTML。用户提出公众号排版、微信文章排版、文章主题预览、文章结构拆分合并或 375px 微信排版时使用。
---

# 公众号智能排版

把宿主 Agent 当作语义规划器，把本 Skill 的 CLI 当作唯一渲染器。不要让 Agent 手写 HTML/CSS，也不要让脚本假装完成 Agent 的内容判断。

## 不可破坏的边界

- 原始文章只读。不得改写、补写、删减、重复或重排正文。
- Agent 只决定文章画像、相邻内容的拆分/合并、语义角色、文章级配方、主题和少量重点组件。
- 普通标题、正文、列表、引用和结尾由主题配方确定性映射；不要逐段选择组件。
- CLI 必须同时校验 `sourceHash` 和全部块内容覆盖；决策文件不能自证原文完整。
- 阅读手势只控制间距。`pause`、`pivot`、`release` 不得自动给每个段落加竖线、底色或卡片。
- 所有 375px 输出的外层左右内容轨固定为 20px。组件内部可有语义需要的局部收窄，但普通正文不得额外整体缩进。
- 不上传、不发布、不创建草稿，除非用户另行明确要求且当前项目提供相应能力。

## 可移植执行约定

`SKILL_ROOT` 表示本文件所在目录。所有 CLI 命令在该目录运行；文章和中间文件写入 `/tmp/gzh-layout/<slug>/`，不要写回用户原文。只有 `node_modules` 不存在时才运行 `npm install`。

宿主可以是 Codex、Claude Code、OpenCode 或其它能读取 Skill 并执行本地命令的 Agent。本项目不内置特定模型或 Provider；当前正在执行本 Skill 的宿主 Agent 就是排版 Agent。

## 标准工作流

### 1. 读取事实

把粘贴文章原样保存为 `$WORK/source.md`，然后运行：

```bash
npm run --silent cli -- inspect \
  --input "$WORK/source.md" \
  --output "$WORK/analysis-input.json"
```

完整读取原文和 `analysis-input.json`。其中 source hash、源段和主题目录是事实；`baseline.advisoryOnly=true` 表示基线分析仅供参考，Agent 必须根据全文修正错误的文章类型和分块。

### 2. 做文章级决策

从 `analysis-input.json` 选择：

- 一个主导 `articleType`、最多 3 个英文 `tone` 和一个 `structurePattern`；
- 一个与文章类型相容的 `recipe`；
- 一个已发现主题，并用 `themeReason` 说明它为何比其它候选更适合全文气质；
- `density`：教程/清单可 `dense`，通常用 `balanced`，随笔/散文可 `airy`。

先定全文配方，再处理块。不要逐段随机挑组件。

### 3. 生成语义块

写 `$WORK/layout-decision.json`，Schema 为 [schemas/layout-decision.schema.json](schemas/layout-decision.schema.json)。详细示例与分块规则见 [references/agent-workflow.md](references/agent-workflow.md)。

分块时遵守：

- 块内容必须逐字取自原文；允许改变块边界和块之间的空白，不允许改变任何非空白字符。
- 只合并相邻内容；不得跨标题章节合并。
- 同一连续编号/项目列表合并成一个 `list`，不要把每项排成独立正文块。
- 标题、列表、引用、图片保持结构容器，不与普通正文混合。
- 正文块以一个完整信息单元为准：观点文通常是“论点 + 紧随解释”，随笔通常是 1–3 个语义连续句子。
- 开场、转折、收束和 CTA 可以短；普通正文不要留下大量孤立单句。
- `phase` 只能按 `entry → body → exit` 前进；`strong` 不相邻，并服从配方预算。

普通块不要填写 `component`/`variant`。只有确实需要区别于主题基线的极少数块才填写，并提供 `reason`。不确定时省略。

### 4. 强制校验

```bash
npm run --silent cli -- validate \
  --input "$WORK/source.md" \
  --decision "$WORK/layout-decision.json"
```

必须修到 `success: true`。校验覆盖：Schema、源文 hash、全文完整顺序、文章配方预算、阶段顺序、强重点间距、主题组件合法性和冗余显式选择。

### 5. 确定性渲染

```bash
npm run --silent cli -- render \
  --input "$WORK/source.md" \
  --decision "$WORK/layout-decision.json" \
  --output "$WORK/<slug>.wechat.html" \
  --preview "$WORK/<slug>.preview.html"
```

只接受同时满足以下条件的结果：

- `sourceIntegrity.valid: true`
- `contentIntegrity.valid: true`
- 预览宽 375px，外层左右轨各 20px
- 普通正文没有被批量变成竖线、卡片或引用
- 标题、列表、核心判断和结尾的层级符合所选配方

### 6. 视觉验收

打开 preview 检查全文，不只看首屏：

- 是否把连续编号原因合并成列表；
- 是否存在大量单句孤块或错误跨章合并；
- 强组件是否稀疏且真正对应关键判断；
- 章节前后留白是否形成清晰节奏；
- 结尾 CTA 是否与正文收束分开；
- 普通正文左边界是否落在 20px 内容轨。

若失败，优先修 `layout-decision.json` 的分块、角色或少量增强选择；不要修改主题 HTML 来掩盖错误的语义决策。

## 交付

必交 `<slug>.wechat.html`。建议同时交 `<slug>.preview.html`；用户要求可审计时再交 `layout-decision.json`。说明所选主题、文章配方、做了哪些合并/拆分，以及两项完整性校验结果。
