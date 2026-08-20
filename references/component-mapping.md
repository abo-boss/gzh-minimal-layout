# 组件映射参考

组件映射是渲染器的职责，不是 Agent 的逐段设计清单。主题包的 `theme.json → composition.mappings` 是唯一可执行来源；本文件只说明如何使用它。

## 默认映射

未填写 `component` / `variant` 时，渲染器先确认内部渲染计划所选 `recipe` 由该主题定义，再从该主题的 `composition.mappings` 为语义块选择组件的 fallback 变体。每套主题的实际映射见 [主题组件库](themes/) 中对应的生成说明。

| `block.type` | 默认组件 |
| --- | --- |
| `article-title` | 主题声明的 `masthead` |
| `heading`（level 2 / 3 / 4） | 主题声明的 `heading` / `subheading` / `minor` |
| `lead` | 主题声明的 `lead` |
| `paragraph` / `article-subtitle` | 主题声明的 `prose` |
| `quote` | `quote` |
| `list` | `list` |
| `callout` | `callout`，不可用时退回 `prose` |
| `image` | `image` |
| `ending` | `ending` |
| `cta` | `cta` |

阅读手势 `flow / pause / pivot / anchor / release` 默认只控制块间节奏，不会自动把普通段落变成左线、卡片或强调框。主题的文章配方规定核心组件、点缀组件与点缀上限；它们是可审计的运行数据，不是只写给人看的建议。

纯文本中以“第一、第二、第三……”开头的行动小主题会成为 level 3 heading；它不会获得 H2 的章节英文标签。`key-insight` 则是严格限额的段落级语义角色：只有主题将 `focus` 映射到该角色时才会使用强调组件，且不改写句内文本。普通正文的句内标记则由 `inlineMarkBudget` 单独约束：每个连续正文组最多 4 个，以 3–15 字的主题色加粗概念短语为主，数据/时长最多 1 个浅底高亮，段内最多两种标记样式；没有明确语义就不生成。

## 显式选择

只有以下条件全部满足时，Agent 才填写 `component`、`variant` 和 `reason`：

1. 主题组件库或内部能力目录证明该组合是此主题、此块和此结构的合法候选；
2. 它表达全文中的真实重点，而不是为了让页面显得“丰富”；
3. 它不同于主题默认映射；
4. 全文未超过 recipe 预算，且强重点不相邻。

不允许自行发明组件或变体 ID，也不允许逐段套用 `flow-*`、`pause-*`、`pivot-*` 等装饰变体。

列表、引用、图片、表格和 CTA 的内容来自 `structure`，由渲染器绑定到组件槽位。组件没有独立引用署名槽时，渲染器会把署名并入引用正文，仍保证原文完整。

## 派生版式外壳

`theme.json → composition.chrome` 是与正文组件并列的主题资产：它允许在不修改 source block 的前提下，按已识别语义生成首句引言、前 2–4 个章节目录、`01 · CHAPTER` 标签、`END`、作者占位和 CTA。它不是 Agent 新写的正文，也不进入 `LayoutDecision.blocks`；渲染结果通过 `derivedChrome` 明示实际输出，原文 hash 与 content trace 仍只验证作者原文。

外部垂直间距由 LayoutPlan 单独管理，组件根节点的外边距会归零，避免主题原始 margin 与文章节奏重复叠加。
