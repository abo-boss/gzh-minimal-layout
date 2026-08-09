# Agent 工作流参考（v3）

本文件定义任意宿主 Agent 都能执行的排版协议。所有命令在 Skill 根目录运行；`$WORK` 建议使用 `/tmp/gzh-layout/<slug>/`。

## 职责边界

宿主 Agent 负责理解文章：通读全文、判断文章类型、选择文章配方、决定段落合并/拆分、标注语义角色、推荐主题，并在确有必要时选择少量重点组件。

CLI 负责事实和执行：读取原文、计算哈希、公开合法主题与组件、校验决策、确定普通组件、生成内联 HTML、验证渲染内容完整性。

禁止两种越界：Agent 手写 HTML/CSS；脚本用规则结果冒充已经完成的 Agent 排版决策。

## 完整流程

### 1. 检查原文和能力目录

```bash
mkdir -p "$WORK"
npm run --silent cli -- inspect \
  --input "$WORK/source.md" \
  --output "$WORK/analysis-input.json"
```

必须读取整个 `source.md` 和 `analysis-input.json`。后者的 `source`、`recipes`、`themes` 是机器事实；`baseline.advisoryOnly=true` 的分析只是参考，不能覆盖 Agent 对全文的判断。

### 2. 先做文章级决策

按顺序回答：

1. 文章主要属于哪一种类型，整体结构是什么？
2. 读者的阅读路径是经历、观点、教程、清单还是叙事？
3. 哪一个 recipe 能约束全文，而不是只适配某一段？
4. 哪个主题的结构语言适配全文？另外两个候选为什么不如它？
5. 全文真正需要几个视觉重点？通常 0–3 个。

可先调用推荐器缩小主题范围：

```bash
npm run --silent cli -- recommend \
  --article-type personal-essay \
  --tone warm,reflective,narrative \
  --structure experience-reflection-conclusion
```

### 3. 生成语义块

- 标题、章节标题、连续正文、结构化列表、引用、结尾和 CTA 分工明确。
- 连续表达同一观点的短段可以合并；转折、跨章节和语义角色变化处不能合并。
- 连续编号或项目符号必须合并成一个 `list`，在 `structure.items` 中保留每项。
- “1. 某观点”后跟多段展开时，它是小标题，不是列表项目。
- 引用与署名放在同一个 `quote` 结构中。
- 结论和行动引导分开，避免把 CTA 伪装成正文。
- 所有 `blocks[].content` 按源顺序拼接后，除空白外必须与原文完全相同。

### 4. 生成 LayoutDecision v3

Schema：`schemas/layout-decision.schema.json`。

顶层必填字段：

| 字段 | 说明 |
| --- | --- |
| `specVersion` | 固定为 `3.0` |
| `sourceHash` | 直接复制 `analysis-input.json` 的 `source.hash` |
| `articleType` | 文章主类型 |
| `structurePattern` | 全文结构模式 |
| `theme` / `themeReason` | 主题及全文级取舍理由 |
| `recipe` | 文章配方 |
| `density` | `dense` / `balanced` / `airy` |
| `blocks` | 按原文顺序排列的语义块 |

每个块必填 `id`、`type`、`role`、`content`、`phase`、`gesture`、`emphasis`。标题块还要填 `level`；列表、图片、表格和 CTA 必须填 `structure`。

普通块省略 `component`、`variant` 和 `reason`。只有某个合法候选确实优于主题默认组件时才同时填写这三个字段；CLI 会拒绝非法、冗余或超预算的显式选择。

示例：

```json
{
  "specVersion": "3.0",
  "sourceHash": "sha256:<from inspect>",
  "articleType": "personal-essay",
  "tone": ["reflective", "warm"],
  "structurePattern": "experience-reflection-conclusion",
  "theme": "tuo-quiet-lifestyle",
  "themeReason": "个人经历与温和反思需要舒缓、连续而不喧宾夺主的阅读节奏",
  "recipe": "essay-reflection",
  "density": "balanced",
  "blocks": [
    {
      "id": "title-1",
      "type": "article-title",
      "role": "title",
      "content": "原文标题",
      "phase": "entry",
      "gesture": "anchor",
      "emphasis": "strong"
    },
    {
      "id": "body-1",
      "type": "paragraph",
      "role": "experience",
      "content": "原文中的连续正文。",
      "phase": "body",
      "gesture": "flow",
      "emphasis": "quiet"
    }
  ]
}
```

### 5. 在真实原文上校验

```bash
npm run --silent cli -- validate \
  --input "$WORK/source.md" \
  --decision "$WORK/layout-decision.json"
```

必须修复全部错误后再渲染。尤其不能忽略 source hash 不匹配、漏字/重字/乱序、配方不兼容、阶段倒退、强重点相邻、组件选择非法或冗余。

### 6. 渲染

```bash
npm run --silent cli -- render \
  --input "$WORK/source.md" \
  --decision "$WORK/layout-decision.json" \
  --output "$WORK/article.wechat.html" \
  --preview "$WORK/article.preview.html"
```

成功结果中 `sourceIntegrity.valid` 和 `contentIntegrity.valid` 都必须为 `true`。

### 7. 视觉检查

在 375px 预览中至少检查：

- 外层左右内容轨是否各为 20px；
- 标题、引言、章节、正文、列表、引用、结尾是否形成清楚层级；
- 连续正文是否仍是连续阅读，而不是每段一张卡；
- 列表是否被错误拆散，或小标题是否被错误合成列表；
- 重点块是否过多或相邻；
- 长句、英文、数字和标点是否溢出；
- 原文是否全部可见，引用署名与列表序号是否保留。

发现视觉问题时先修语义分块、角色、手势或稀疏选择。只有多个正确决策都暴露同一个主题缺陷时，才修改主题组件。

## 配方预算

| recipe | 适合文章 | 显式组件上限 | strong 上限 |
| --- | --- | ---: | ---: |
| `essay-reflection` | 个人经历与反思 | 3 | 2 |
| `opinion-analysis` | 观点与论证 | 4 | 2 |
| `literary-narrative` | 叙事与散文 | 2 | 1 |
| `tutorial-steps` | 教程与步骤 | 5 | 3 |
| `list-guide` | 分类、清单与行动 | 4 | 2 |
| `universal` | 暂时无法稳定归类 | 3 | 2 |

配额是上限，不是目标。能用 0 个显式组件完成时，不要为了“用满能力”而添加装饰。
