# 组件映射参考

Agent 为每个 block 选择组件和变体时，必须遵循此文件的映射规则。

## 映射规则

每个 block 根据 `type` 字段匹配到一个组件，再根据语义角色选择变体。

### 通用映射表（适用于大部分主题）

| block.type | 组件 | 变体选择逻辑 |
|-----------|------|-------------|
| article-title | masthead | editorial=正式/品牌感, minimal/quiet=克制简洁 |
| heading | heading | numbered/marker=有编号/标记章节, plain/subtle=无编号 |
| heading (h3+) | subheading | inset/side-line=缩进小标题 |
| lead | lead 或 prose/lead | drop-cap=首字下沉, 无lead组件时用prose/lead |
| paragraph | prose | body=正文流, focus/golden=金句停顿, inset=细节强调, muted=轻信息 |
| quote | quote | pull/inset=侧线引用, quiet=轻引用 |
| list | list | editorial/rail=编辑列表, compact=紧凑列表 |
| image | lead-image | gallery=头图/插图 |
| ending | ending | release/ritual/conclusion=收束, quiet=轻收尾 |
| cta | cta 或 ending | action/question=行动提示, quiet=轻互动 |
| article-subtitle | prose | muted=轻信息 |
| metadata | prose | muted=轻信息 |
| divider | prose | muted=轻信息 |
| callout | prose | inset=缩进解释 |
| table | comparison(仅forest-order) 或 prose | contrast/balanced=对比表, body=正文内嵌表 |

## 变体选择指南

### emphasis=quiet 时
优先选择：body, plain, quiet, compact, muted

### emphasis=medium 时
优先选择：lead, inset, editorial, numbered, marker

### emphasis=strong 时
优先选择：focus, golden, pull, drop-cap, ritual, cover, editorial(masthead)

## 各主题特殊能力

### quiet-editorial（6组件，最精简）
- 无 subheading、lead、lead-image、cta 独立组件
- h3+ 标题用 heading/plain
- lead 内容用 prose/lead
- cta 内容用 ending

### forest-order（独有 comparison 组件）
- table 块可选 comparison/contrast 或 comparison/balanced
- masthead 有 cover 变体（深色封面）
- prose 有 golden 变体（留白金句）
- ending 有 ritual 变体（仪式收束）

### 其他主题（标准10组件）
- 都有 lead/drop-cap、lead-image/gallery、subheading/inset
- prose 有 focus 变体（窄幅居中金句）
- quote 有 pull 变体（中轴停顿金句）

## 强调预算规则

- 每个 section 最多 1 个 strong 强调
- strong 类变体（focus, pull, golden, drop-cap, cover, ritual）不能相邻
- surface 含色面的变体总占比不超过 20%
