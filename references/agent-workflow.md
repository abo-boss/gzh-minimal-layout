# Agent 工作流参考（v2）

所有命令在 Skill 根目录运行。以下用 `$WORK` 表示 `/tmp/gzh-layout/<slug>/`。

## 新版工作流

### 1. 查看可用主题与推荐画像

```bash
npm run --silent cli -- themes
```

输出 JSON 包含所有主题的 id、名称、描述、组件列表，以及机器可读的推荐画像。

### 2. 排序主题候选

先从原文判断文章类型、语气标签和结构，再运行：

```bash
npm run --silent cli -- recommend \
  --article-type literary-prose \
  --tone warm,reflective,narrative \
  --structure narrative-reflection
```

命令固定返回 3 个候选及每个候选的分数、匹配语气与结构理由。Top 1 只是首选，不是强制选择；最终主题必须取自 Top 3，并在 `themeReason` 记录取舍。

### 3. 校验决策文件

```bash
npm run --silent cli -- validate --decision $WORK/layout-decision.json
```

确认所有 component/variant 选择在目标主题中合法。

### 4. 渲染

```bash
npm run --silent cli -- render \
  --input $WORK/source.md \
  --decision $WORK/layout-decision.json \
  --output $WORK/article.wechat.html \
  --preview $WORK/article.preview.html
```

成功输出：
```json
{
  "success": true,
  "output": "/tmp/gzh-layout/slug/article.wechat.html",
  "preview": "/tmp/gzh-layout/slug/article.preview.html",
  "theme": "quiet-editorial",
  "density": "balanced",
  "blockCount": 15,
  "contentIntegrity": { "valid": true }
}
```

### 5. 带配图渲染

```bash
npm run --silent cli -- render \
  --input $WORK/source.md \
  --decision $WORK/layout-decision.json \
  --image-plan $WORK/image-plan.json \
  --asset-manifest $WORK/asset-manifest.json \
  --output $WORK/article.wechat.html
```

## LayoutDecision 合约规范

Schema: `schemas/layout-decision.schema.json`

### 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| specVersion | "2.0" | 固定值 |
| articleType | enum | personal-essay, opinion-knowledge, literary-prose, tutorial, list-driven, other |
| theme | string | 主题 ID（来自 themes 命令） |
| themeReason | 否 | 最终主题为何比本次另外两个候选更适合原文 |
| density | enum | dense, balanced, airy |
| blocks | array | 语义块数组 |

### Block 字段

| 字段 | 必填 | 说明 |
|------|------|------|
| id | 是 | 唯一标识，如 title-1, p-1, h-1 |
| type | 是 | 块类型（article-title, paragraph, heading, quote, list 等） |
| content | 是 | 原文内容，不可改写 |
| component | 是 | 组件 ID（必须在目标主题中存在） |
| variant | 是 | 变体 ID（必须在组件中存在） |
| phase | 否 | entry / body / exit（阅读阶段） |
| gesture | 否 | flow / pause / pivot / anchor / release（阅读手势） |
| emphasis | 否 | quiet / medium / strong（强调级别） |
| level | 否 | 标题层级 1-6 |
| structure | 否 | 结构数据（list items, quote attribution 等） |
| marks | 否 | 行内标记（强调、关键词） |
| reason | 否 | 选择理由 |

### 强调预算

- 每个 section（从一个 heading 到下一个 heading）最多 1 个 emphasis=strong
- emphasis=strong 的块不能相邻
- strong 类变体（focus, pull, golden, drop-cap, cover, ritual）总占比不超过 20%
