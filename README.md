# gzh-minimal-layout

微信公众号智能排版 Skill。分析文章结构与语义，生成可直接粘贴到公众号编辑器的内联样式 HTML。

采用极简主义美学理念，让设计回归阅读本身。通过克制装饰、强化信息层级，将 Markdown 或纯文本转化为具有杂志感的公众号文章。

![gzh-minimal-layout editorial layout system](assets/promo/gzh-minimal-layout-hero.png)

## 快速开始

```bash
npm install
npm run --silent cli -- render \
  --input examples/sample-article.md \
  --decision examples/sample-decision.json \
  --output /tmp/output.wechat.html \
  --preview /tmp/output.preview.html
```

## 工作流

```text
Source → Agent 读主题参考 → Agent 输出 LayoutDecision → CLI render → WeChat HTML
```

Agent 只需做一次决策（选主题 + 分块 + 选组件），CLI 一步完成渲染和校验。

### 1. 查看可用主题

```bash
npm run --silent cli -- themes
```

### 2. 编写 LayoutDecision

参考 `references/theme-index.md` 和 `references/component-mapping.md`，为文章生成一份 `layout-decision.json`：

```json
{
  "specVersion": "2.0",
  "articleType": "opinion-knowledge",
  "theme": "quiet-editorial",
  "density": "balanced",
  "blocks": [
    {
      "id": "title-1",
      "type": "article-title",
      "content": "原文标题",
      "component": "masthead",
      "variant": "editorial"
    }
  ]
}
```

### 3. 渲染

```bash
npm run --silent gzh -- render \
  --input article.md \
  --decision layout-decision.json \
  --output article.wechat.html
```

### 4. 校验（可选）

```bash
npm run --silent gzh -- validate --decision layout-decision.json
```

## 主题

| 主题 | 视觉方向 | 适合内容 |
| --- | --- | --- |
| `quiet-editorial` | 开放、安静、编辑式 | 通用长文、知识解释 |
| `whitespace-journal` | 暖纸、克制留白 | 随笔、叙事、文学 |
| `forest-order` | 森林绿、章节仪式感 | 结构丰富、正式长文 |
| `efficiency-system` | 现代冷灰、圆角模块 | 教程、效率型内容 |
| `cobalt-essay` | 冷白、极简 | 散文、冷调思考 |
| `minimal-magazine` | 纯白杂志 | 品牌文章 |
| `brick-literary` | 砖红纸页 | 文艺叙事 |
| `moss-staircase` | 苔绿宣纸 | 实验性排版 |
| `warm-card-magazine` | 暖灰卡片 | 信息密集型 |
| `champagne-editorial` | 香槟金 | 优雅品牌文 |
| `prussian-judgment` | 冷墨蓝 | 严肃判断 |

## CLI 命令

| 命令 | 用途 |
|------|------|
| `npm run cli -- render` | 渲染 WeChat HTML |
| `npm run cli -- themes` | 列出所有主题 |
| `npm run cli -- validate` | 校验 LayoutDecision |

## 项目结构

```text
SKILL.md                   Agent Skill 入口
references/                主题索引 + 组件映射参考
schemas/                   JSON Schema（含 layout-decision）
scripts/cli.ts             CLI（3命令：render/themes/validate）
src/                       渲染引擎
themes/                    11 个主题
examples/                  示例文章 + 决策文件
```

## 设计理念

- **Agent 负责理解**：分析文章类型、选择主题、为每个段落选择组件
- **CLI 负责执行**：验证决策合法性、渲染 HTML、校验内容完整性
- **一次决策、一步渲染**：不需要多轮交互，减少 60-70% 执行时间
- **原文零改写**：所有内容必须来自原文，渲染后自动校验

## 验证

```bash
npm run typecheck
npm test
```

## 许可

见 [LICENSE](LICENSE)。
