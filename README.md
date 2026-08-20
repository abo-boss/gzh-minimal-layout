# gzh-minimal-layout

可安装到 Codex、Claude Code、OpenCode 等宿主 Agent 的微信公众号排版 Skill。宿主 Agent 阅读全文、完成语义分块和文章级设计判断；本项目的主题包与内部渲染内核把这些判断稳定地落实为可直接粘贴到公众号编辑器的内联 HTML。

![gzh-minimal-layout editorial layout system](assets/promo/gzh-minimal-layout-hero.png)

## 它如何工作

```text
原文（只读）
  → 排版 Agent：通读全文、识别标记与结构、选择主题和阅读节奏
  → 主题配方：按语义映射普通标题、正文、列表、引用、代码与结尾
  → 内部渲染与校验：绑定源文、检查完整性与微信兼容性
  → WeChat HTML + 375px 预览
```

关键边界：Agent 不写 HTML/CSS，渲染内核不冒充理解文章；普通段落不逐段选组件，默认落到所选主题的安静正文组件。主题还可按已经识别的 lead/标题派生引言、目录、英文章节标签、END、作者占位和 CTA；这层外壳与原文 source span 分离，绝不改写正文。

## 作为 Skill 使用

让宿主 Agent 读取 [SKILL.md](SKILL.md)，并提供文章文件或正文。Skill 会指导 Agent 在临时工作目录中完成全部步骤，不修改原文，也不会自动发布公众号草稿。用户不需要知道或操作 `LayoutDecision`、`inspect`、`commit` 等内部执行接口。

所有 375px 预览与主题画布的外层左右内容轨固定为 20px。

## 维护者：内部执行接口

CLI 保留为 Agent/维护者的确定性执行层：用于归一化、生成内部渲染计划、校验、渲染和排错；它不是使用这个 Skill 的前置条件。正常使用请从 [SKILL.md](SKILL.md) 的文章工作流开始。

```bash
npm install && npm run build

npm run --silent cli -- inspect \
  --input examples/sample-article.md \
  --output /tmp/gzh-sample/analysis-input.json

npm run --silent cli -- validate \
  --input examples/sample-article.md \
  --decision examples/sample-decision.json

npm run --silent cli -- render \
  --input examples/sample-article.md \
  --decision examples/sample-decision.json \
  --output /tmp/gzh-sample/article.wechat.html \
  --preview /tmp/gzh-sample/article.preview.html
```

渲染会同时生成可直接粘贴的 `.wechat.html`，以及带“一键复制到公众号”按钮的预览页。未传 `--preview` 时，会在输出文件旁自动生成 `<输出名>.preview.html`；复制操作只选取文章富文本，不会把预览控件带入公众号。

`layout-decision.json` 使用 v3 合约，核心是原文哈希、文章配方和语义块。`component` / `variant` 为可选字段，只允许用于少量需要偏离主题基线的重点块：

```json
{
  "specVersion": "3.0",
  "sourceHash": "sha256:<64 hex>",
  "articleType": "personal-essay",
  "structurePattern": "experience-reflection-conclusion",
  "theme": "tuo-quiet-lifestyle",
  "themeReason": "个人经历与温和反思适合舒缓的生活叙事节奏",
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
    }
  ]
}
```

内部协议见 [内部渲染与验证契约](references/agent-workflow.md)，主题定位见 [主题索引](references/theme-index.md)，稀疏组件规则见 [组件映射](references/component-mapping.md)。主题资产的文件链路、生成文档和验收闭环见 [主题工作流](references/theme-workflow.md)；Markdown/纯文本与自动基线见 [输入工作流](references/input-workflow.md)。

## 7 个主题

| 主题 | 视觉方向 | 适合内容 |
| --- | --- | --- |
| `tuo-quiet-lifestyle` | 燕麦糙绿、生活观察 | 温暖叙事、个人随笔 |
| `tuo-forest-order` | 深森林绿、正式编辑 | 判断鲜明的观点长文 |
| `tuo-whitespace-narrative` | 石墨留白、展签细节 | 安静叙事、反思随笔 |
| `tuo-digital-efficiency` | 松石阶梯、方法论 | 教程、步骤与效率内容 |
| `tuo-insight-logic` | 冷峻蓝冰、理性编号 | 分析、决策与观点文章 |
| `tuo-magazine-cards` | 乳白章节卡片 | 模块化信息与清单 |
| `tuo-content-method` | 暖纸白、哑光金 | 内容方法论与结构化教程 |

生成同一篇样文的 7 套真实预览：

```bash
npm run preview:themes
```

打开 `previews/theme-gallery/index.html` 横向比较。该目录可随时重建，不进入 Git。

## 内部命令速查

| 命令 | 用途 |
| --- | --- |
| `npm run cli -- inspect` | 输出源文事实、配方、主题和完整合法候选 |
| `npm run cli -- recommend` | 根据 Agent 判断的文章画像返回最多 3 个主题候选 |
| `npm run cli -- validate` | 对照真实原文校验 LayoutDecision |
| `npm run cli -- render` | 渲染 WeChat HTML 与可选 375px 预览 |
| `npm run cli -- compose` | 为 Markdown/纯文本生成可审阅的自动基线决策 |
| `npm run cli -- normalize` | 将 DOCX、HTML 或纯文本转换为需审阅的 Markdown 草稿 |
| `npm run cli -- verify-output` | 校验已有公众号粘贴片段的兼容性与 leaf 包裹 |
| `npm run cli -- themes` | 列出 7 个主题及其组件 |
| `npm run lint:themes` | 校验主题源头、配方引用、映射与微信兼容边界 |
| `npm run docs:themes` | 从真实主题包生成完整组件库说明 |

## 项目结构

```text
SKILL.md                   面向文章的宿主 Agent 工作流
agents/openai.yaml         Codex/OpenAI Skill 展示配置
references/                文章规则、主题规则与内部执行契约
references/themes/         从主题包生成的完整组件、骨架、配方和映射说明
schemas/                   LayoutDecision v3 等 JSON Schema
scripts/cli.ts             inspect/compose/recommend/validate/render/verify-output/themes
src/                       语义投影、合法映射、渲染和完整性校验
.themes/                   7 个隐藏的 TUO 复刻主题包
examples/                  可执行的原文与决策示例
```

## 设计原则

- 原文是不可变数据，允许调整的只有空白与分块边界。
- Agent 负责文章级理解：结构、语义角色、阅读阶段、主题和稀疏重点。
- Renderer 负责确定性执行：普通组件、节奏、内联样式、微信适配。
- 同一种主题语言贯穿全文，重点组件有预算，不能逐段卡片化。
- 校验同时覆盖源文完整性和渲染后内容完整性。

## 验证

```bash
npm run typecheck
npm test
```

## 许可

见 [LICENSE](LICENSE)。
