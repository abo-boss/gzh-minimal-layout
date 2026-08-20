# 主题组件工作流

本项目的主题不是一组可以随意替换颜色的 HTML 片段。每个 `.themes/<theme-id>/` 都是一套可渲染、可审计、可预览的主题资产；`theme.json` 是该资产的单一事实来源，组件 JSON 和模板文件是唯一可执行实现。

## 文件链路

```text
主题结构模型 / 文章配方 / 语义块映射（theme.json: composition）
  → 组件定义（components/*/component.json）
  → 受控模板（components/*/template.html）
  → lint:themes：源头兼容性与引用完整性
  → 主题说明：向排版 Agent 公开可选主题、配方、映射
  → 内部渲染计划：记录主题与文章配方
  → createLayoutPlan：按主题映射确定普通块基线
  → 内部校验与渲染：源文、配方、映射与产物完整性校验
  → .wechat.html + .preview.html + 可重建主题图册
```

不要让 Agent 手写 HTML/CSS，也不要把某篇文章的内容写进组件。Agent 只选择文章级 `recipe`，普通块由主题映射决定；只有例外重点可以稀疏地选择已公开的合法组件。选择会写入内部渲染计划，不要求使用者了解其 JSON 形态。

输入归一化与“直接排”的自动基线路径见 `references/input-workflow.md`；自定义主题从视觉简报到可执行主题包的路径见 `references/custom-theme-workflow.md`。

## 每个主题的五项资产

1. **结构模型**：这套主题怎样组织阅读层级、留白、强重点和信息密度。
2. **组件族**：刊头、标题、正文、列表、引用、图片、重点、结尾、CTA 等实际可渲染组件。
3. **完整骨架**：`composition.mappings` 从语义块到默认组件的可执行映射，代替渲染器内的主题 ID 分支。
4. **行内标记**：`theme.json:inlineMarks` 定义作者已有的 strong、emphasis、highlight、underline、strike 与 inline code 如何在本主题中呈现；渲染器不自作主张新增重点。
4. **文章类型配方**：`composition.recipes` 将文章类型与核心/点缀组件、点缀上限、使用原则绑定。内部渲染计划只能选择该主题确实定义的配方。
5. **Markdown/结构映射**：Markdown 先被解析为 `BlockDocument`，再用 `composition.mappings` 绑定。标题层级、列表、引用、图片等结构不能靠正则改写后丢失。

运行 `npm run docs:themes` 会从上述执行资产重建 `references/themes/*.md`。生成文档包含变量、完整组件源码、文章骨架、配方表和映射表，供人工审阅；不要直接编辑生成文档。

## 新建或重构主题

1. 先写结构模型：是叙事、编辑、方法论、清单还是数据阅读？确定留白、容器、标题、媒体和结尾的不同语法，不能只换配色。
2. 定义组件 JSON 与模板。模板不写文章正文；正文只来自 `<slot>`。一个主题只复用本主题组件，通用语义靠相同的 slot 合约而非跨主题复制样式。
3. 在 `theme.json` 填写 `composition`：覆盖可出现的默认语义块，并写至少一个与推荐文章类型相容的配方。
4. 运行 `npm run lint:themes && npm run docs:themes && npm run build && npm test`。
5. 运行 `npm run preview:themes`，在同一篇样文上比较所有主题。真实文章的视觉问题先修语义决策；只有多个正确决策都暴露同一缺陷时才修改主题组件。

## 微信兼容边界

渲染产物只使用内联样式和基础标签。主题源头禁止 `class`、`id`、脚本、样式表、`position:absolute/fixed/sticky`、`float`、`display:grid` 与 `white-space:pre`。`npm run lint:themes` 管主题源头；内部渲染提交同时管源文完整性和渲染内容完整性。预览按钮仅存在于 preview 外壳，不会被复制进公众号。
