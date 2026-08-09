# 组件映射参考

组件映射是渲染器的职责，不是 Agent 的逐段设计清单。

## 默认映射

未填写 `component` / `variant` 时，渲染器按语义块选取所选主题的 fallback 变体：

| `block.type` | 默认组件 |
| --- | --- |
| `article-title` | `masthead` |
| `heading`（level 1–2） | `heading` |
| `heading`（level 3–6） | `subheading`，不可用时退回 `heading` |
| `lead` / `paragraph` | `prose` |
| `quote` | `quote` |
| `list` | `list` |
| `callout` | `callout`，不可用时退回 `prose` |
| `image` | `image` |
| `ending` | `ending` |
| `cta` | `cta` |

阅读手势 `flow / pause / pivot / anchor / release` 默认只控制块间节奏，不会自动把普通段落变成左线、卡片或强调框。

## 显式选择

只有以下条件全部满足时，Agent 才填写 `component`、`variant` 和 `reason`：

1. `inspect` 输出证明该组合是此主题、此块和此结构的合法候选；
2. 它表达全文中的真实重点，而不是为了让页面显得“丰富”；
3. 它不同于主题默认映射；
4. 全文未超过 recipe 预算，且强重点不相邻。

不允许自行发明组件或变体 ID，也不允许逐段套用 `flow-*`、`pause-*`、`pivot-*` 等装饰变体。

列表、引用、图片、表格和 CTA 的内容来自 `structure`，由渲染器绑定到组件槽位。组件没有独立引用署名槽时，渲染器会把署名并入引用正文，仍保证原文完整。

外部垂直间距由 LayoutPlan 单独管理，组件根节点的外边距会归零，避免主题原始 margin 与文章节奏重复叠加。
