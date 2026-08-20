# 自定义主题工作流

这里借鉴桌面版“先形成一整套主题资产，再投入文章使用”的原则，但不复制它的“AI 直接生成一页 HTML 后人工转换”实现。当前项目要求主题从一开始就是可执行、可校验的组件包。

## 阶段 1：主题简报与视觉确认

先确定主题的结构模型，而不是从现有主题复制并换色：阅读类型（叙事、观点、教程、清单）、信息密度、标题语法、媒体语法、强重点和结尾语法。若用户提供参考图，只提取颜色、留白、层级、圆角、边框、材质和信息密度；不复刻文字、Logo 或完整构图。

在真正登记前，先以同一篇样文产出预览并整体确认。每次组件改动后可运行：

```bash
npm run preview:themes
```

主题必须在完整文章、375px 预览中确认，不以孤立卡片截图为准。

## 阶段 2：创建可执行主题包

创建 `.themes/<theme-id>/`，而不是写一份只供阅读的主题 Markdown：

```text
.themes/<theme-id>/
├── theme.json                         结构模型、tokens、配方、默认映射
└── components/<component-id>/
    ├── component.json                 Slot、适用语义、fallback、变体和样式
    └── template.html                  无正文的受控模板
```

`theme.json` 必须包含：

1. 设计 tokens、节奏和阅读预算；
2. `composition.structureModel`；
3. `composition.recipes`：文章类型、核心组件、点缀组件、点缀种类上限与使用原则；
4. `composition.mappings`：语义块和标题层级到默认组件的映射；
5. 真实的 `componentPaths`。

模板只能通过 Slot 接收正文，不能硬编码文章内容。新主题的布局骨架、组件种类和节奏必须来自简报，不得把现有主题当作只换色的母版。

## 阶段 3：登记与验证

主题目录会由 `loadThemeLibraries()` 自动发现，不存在单独的中心注册表。要成为可用主题必须连续通过：

```bash
npm run lint:themes
npm run docs:themes
npm run build
npm test
npm run preview:themes
```

`docs:themes` 会把执行包生成到 `references/themes/<theme-id>.md`，便于人读；它不是源代码。完成后检查该说明与内部主题目录，确认主题、配方、组件和映射已公开给宿主 Agent。
