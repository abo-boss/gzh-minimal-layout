# 主题工作流验收用例

每次新增或调整主题，按下面闭环验收；任一关失败都不能登记为可用主题。

1. `npm run lint:themes`：所有主题能加载；组件模板和样式不依赖公众号会过滤的能力；所有配方与映射指向真实组件。
2. `npm run docs:themes`：从真实主题包生成 7 份可阅读的组件库说明；确认每份包含设计变量、组件源码、完整骨架、文章配方和映射表。
3. `npm run build && npm test`：Schema、语义校验和渲染回归均通过。
4. 检查生成的主题说明包含 `composition`；用内部校验检查渲染计划的 recipe 确实由所选主题定义。
5. 用内部渲染提交生成 `.wechat.html` 与 `.preview.html`，要求 `sourceIntegrity.valid`、`contentIntegrity.valid` 均为 `true`。
6. `npm run preview:themes` 后检查 375px：正文维持 20px 内容轨；连续正文不批量卡片化；列表/引用/标题保留真实结构；重点不相邻；预览复制不会把按钮带进正文。
