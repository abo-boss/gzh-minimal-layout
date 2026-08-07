# 主题索引

Agent 根据文章类型和气质选择主题。每个主题是一套完整的视觉系统，定义颜色、字体、节奏和组件。

## 选择流程

不要把文章类型直接映射为单一主题。先判断 `articleType`、1–3 个语气标签和结构，再运行 `npm run --silent cli -- recommend` 获取 Top 3。候选第一名代表规则匹配度最高，不替代对原文意象、视觉气质和用户偏好的判断。

| 文章方向 | 候选池 | 区分信号 |
|---------|--------|----------|
| 文学散文/随笔 | cobalt-essay, whitespace-journal, brick-literary, moss-staircase, minimal-magazine | 冷调极简 / 温暖叙事 / 文艺手工 / 实验自然 / 视觉现代 |
| 观点/知识长文 | quiet-editorial, forest-order, prussian-judgment, champagne-editorial, warm-card-magazine | 清晰克制 / 正式判断 / 冷峻论证 / 优雅品牌 / 模块化信息 |
| 教程/清单 | efficiency-system, warm-card-magazine, quiet-editorial | 步骤效率 / 卡片模块 / 开放编辑 |

### 散文分流

| 原文气质或结构 | 优先候选 | 推荐标签示例 |
|---------------|----------|--------------|
| 冷调、抽离、极简、片段式 | cobalt-essay | `cool,reflective,minimal` + `fragmented-prose` |
| 温暖、日常、缓慢叙事 | whitespace-journal | `warm,reflective,narrative` + `narrative-reflection` |
| 文艺、手工感、章节仪式 | brick-literary | `literary,handmade,narrative` + `narrative-reflection` |
| 自然意象、多层次、实验性 | moss-staircase | `experimental,poetic,nature` + `fragmented-prose` |
| 视觉现代、设计评论、杂志感 | minimal-magazine | `visual,minimal,modern` + `fragmented-prose` |

## 主题详情

### quiet-editorial — 静读编辑部
- 风格：开放式排版，用层级、细线和节奏区分块，不装卡片
- 配色：暖纸白 #fffefb / 墨 #26231f / 棕色调 #9a6742 / 细线 #d9d0c5
- 组件：masthead, heading, prose, list, quote, ending
- 适合：知识解读、观点长文、通用编辑

### whitespace-journal — 留白志
- 风格：温暖纸张，克制杂志排版，五条对齐轨道
- 组件：masthead, heading, subheading, lead, lead-image, prose, list, quote, ending, cta
- 适合：随笔、叙事、文学感、需要克制留白

### forest-order — 森序
- 风格：深森林绿 + 香槟金，杂志式留白，强调判断和章节仪式
- 组件：masthead, heading, subheading, prose, list, quote, comparison, ending, cta
- 适合：判断鲜明、结构丰富、正式长文

### efficiency-system — 效率系统
- 风格：现代效率，430px卡片画布，圆角模块
- 组件：masthead, heading, subheading, lead, lead-image, prose, list, quote, ending, cta
- 适合：教程、步骤、效率型内容

### cobalt-essay — 冷蓝散文
- 风格：冷白纸张极简随笔，640px阅读宽度，2.3行高
- 组件：masthead, heading, subheading, lead, lead-image, prose, list, quote, ending, cta
- 适合：散文、冷调思考、极简

### minimal-magazine — 极简杂志
- 风格：纯白杂志纸张，极宽字距，640px容器
- 组件：masthead, heading, subheading, lead, lead-image, prose, list, quote, ending, cta
- 适合：杂志感文章、视觉型内容

### brick-literary — 砖红纸页
- 风格：砖红纸张，章节仪式，375px画布，16/9头图
- 组件：masthead, heading, subheading, lead, lead-image, prose, list, quote, ending, cta
- 适合：文艺、手工感、仪式感叙事

### moss-staircase — 苔绿阶梯
- 风格：苔绿宣纸，非对称阶梯轨道，600px宽度
- 组件：masthead, heading, subheading, lead, lead-image, prose, list, quote, ending, cta
- 适合：实验性排版、多层次结构

### warm-card-magazine — 暖灰卡片
- 风格：暖灰杂志背景，卡片章节，576px内容宽度
- 组件：masthead, heading, subheading, lead, lead-image, prose, list, quote, ending, cta
- 适合：模块化内容、信息密集型

### champagne-editorial — 香槟编辑
- 风格：香槟金编辑式留白，居中题头，375px画布
- 组件：masthead, heading, subheading, lead, lead-image, prose, list, quote, ending, cta
- 适合：优雅、高端感、品牌文

### prussian-judgment — 冷墨蓝判断
- 风格：冷墨蓝封面，窄幅章节，375px画布，4/5头图
- 组件：masthead, heading, subheading, lead, lead-image, prose, list, quote, ending, cta
- 适合：冷峻判断、学术调、严肃内容
