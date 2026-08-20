# 输入与自动基线工作流

这是面向排版 Agent 的输入边界。使用 Skill 的人只需提供文章；Agent 负责准备一份可审阅源文，并把归一化与自动基线作为内部工具，不将命令或 JSON 交给用户操作。本项目保留“原文不可变”的决定：它不把 Word 或 PDF 二进制解析、内容改写和公众号排版混在一个命令里。和桌面版相比，这是一条有意收窄、但更可审计的输入边界。

## 支持的输入

| 输入 | Agent 的内部处理 | 行为 |
| --- | --- | --- |
| Markdown | 直接建立源文事实与语义结构 | 保留 Markdown 原文、语义结构和哈希。 |
| 纯文本 / `.txt` | 使用 plain-text 模式建立草稿 | 自动在空行或逐行之间选择分段；不改写字符。中文序号标题可被解析为章节。 |
| `.docx` | 归一化为 `source.md` 草稿 | 提取标题、粗体、下划线、列表、表格与嵌入媒体为 Markdown 草稿；须审阅。 |
| HTML / 网页富文本 | 归一化为 `source.md` 草稿 | 保留语义标签，主动剥离样式与脚本；须审阅。 |
| PDF | 由具备 PDF 读取能力的宿主先提取 | 内部工具不以正则或二进制猜测页面内容；图文顺序必须经人工确认。 |

归一化输出是新的**候选源文**，不是对原富文件“无损读取”的宣称。它返回输入 hash、草稿 hash 和 warning；先完整阅读草稿，确认标题、图片、表格和段落顺序，再建立内部源文事实。纯文本的单次换行会保留为候选阅读节拍，随后由语义分组器决定合并为 2–3 句正文、紧凑反问组或因果链；它不会把连续短句自动当成列表。`01｜…` 与独立的“最后/结语/写在最后”会被识别为章节，最终语义块仍需人工/Agent 审阅。

```bash
node dist/scripts/cli.js normalize \
  --input "$WORK/article.docx" \
  --output "$WORK/source.md"
node dist/scripts/cli.js inspect --input "$WORK/source.md" --output "$WORK/analysis-input.json"
```

## Markdown 语义事实

内部解析生成的 SourceManifest 和 BlockDocument 会先记录以下事实，再交给 Agent 做文章级判断；任何主题均不得重新用正则猜测原文：

| 源文写法 | 语义事实 | 默认处理 |
| --- | --- | --- |
| `#`—`######` | 标题层级；首个 H1 为文章标题 | 映射刊头或标题组件 |
| `一、`、`01 |`、`1.` | 章节编号与可读标题 | 保留编号，进入 heading 结构 |
| `**`、`*`、`==`、`<u>`/`++`、`~~`、反引号 | `strong`、`emphasis`、`highlight`、`underline`、`strike`、`code` mark | 仅按主题样式渲染，不新增或改写 mark |
| `>` 与末行 `— 署名` | quote 内容与 attribution | 同一个 quote 结构 |
| 连续 `-` / `*` / `1.` | list 及 ordered/items | 一个列表容器 |
| 围栏 `` ``` `` | code 块 | 保留代码字符、去除围栏显示 |
| `![alt](url "caption")` | image 的 src/alt/caption | 图像组件 |
| Markdown 表格 | headers/rows | table 结构；无专用组件时正文 fallback |
| `---` / `***` / `___` | divider | 保持语义间隔，不显示源码符号 |

每个语义块仍持有原始 `content`、`sourceRefs` 和精确 `sourceSpans`。渲染时允许去掉 Markdown 控制字符，却必须通过 source integrity 与 content integrity 两道验证。

## 不迁移的桌面版默认行为

桌面版会自动全角化标点、在每段增加关键词下划线、生成目录与作者签名。本项目不把这些作为自动行为：它们会改变用户输入或凭空添加正文。Agent 可以在用户明确授权的内容编辑任务中另行做这些操作；当前排版链路只忠实呈现已有语义，并把未确认的增强留在内部渲染计划中等待审阅。

## 自动基线（仅限内部加速）

当用户明确要求“直接排”或“不用问”时，可以使用：

```bash
node dist/scripts/cli.js compose \
  --input "$WORK/source.md" \
  --output "$WORK/layout-decision.json"
```

它会从文章画像中选择一个已注册主题与该主题支持的配方，生成可验证的内部 `LayoutDecision`。它绝不改写原文、不会制造签名/目录/CTA，也不会逐段套用装饰组件。Agent 仍须通读并修正基线，随后运行：

```bash
node dist/scripts/cli.js commit \
  --input "$WORK/source.md" \
  --decision "$WORK/layout-decision.json" \
  --output "$WORK/article.wechat.html"
```

若要固定主题，在 `compose` 上加 `--theme tuo-quiet-lifestyle`。主题没有与文章类型兼容的配方时命令应失败，而不是悄悄套用不合适的风格。

## 最终产物关

每个 `render` / `commit` 都会检查最终粘贴片段；任意已有片段可单独检查：

```bash
node dist/scripts/cli.js verify-output --input "$WORK/article.wechat.html"
```

这层检查禁用标签、class/id、绝对定位、浮动、grid、CSS 变量、遗留数据属性、未解析 Slot 和未被 `<span leaf="">` 包裹的中文正文。它会报告半角标点或直引号为 warning，但不会为了“修格式”而修改用户的原文。
