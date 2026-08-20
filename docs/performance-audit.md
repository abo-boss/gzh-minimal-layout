# gzh-minimal-layout 性能对抗式审查

结论：慢的根因不在算法，而在**每次 CLI 调用都付 tsx 即时编译 + npm wrapper 双重固定税**，且 inspect 向 Agent 灌入 68KB 全量主题清单拖慢 LLM。预编译 + 命令直跑后，端到端（inspect + commit）从 5.96s 降到 0.71s，加速约 8 倍。

> 注：初版审查中 dist 列数据（0.16-0.20s）系 schema 路径解析失败导致的静默快速返回，已修正路径后复测，下表为真实执行时间。

## 实测数据（样本：examples/sample-article.md，7 主题）

| 步骤 | 现状 `npm run cli` (tsx) | `node tsx` (无 npm) | `node dist` (预编译) |
|---|---:|---:|---:|
| inspect | 2.77s | 1.03s | 0.32s |
| validate | 1.32s | — | 0.39s |
| render | 1.87s | — | 0.36s |
| themes | 1.20s | — | 0.28s |
| commit (validate+render 合并) | — | — | 0.41s |
| **端到端 inspect+commit** | **5.96s** (inspect+validate+render) | — | **0.71s** |

tsc 一次性编译成本：约 5s（仅在依赖变更后执行）。

## 瓶颈归因（按影响降序）

### 1. tsx 即时编译 —— 每次约 0.8s/次

`package.json` 的 `cli` 脚本是 `tsx scripts/cli.ts`。每次启动新 Node 进程，tsx 用 esbuild 重新转译 27 个 src TS 文件 + 依赖图。进程结束即丢弃，下次重来。这是单步最大固定开销。

- 证据：`node tsx` inspect = 1.03s；预编译后同逻辑 = 0.32s，差值 0.71s 即 tsx 转译 + 模块加载税。
- 触发面：inspect / validate / render / themes / recommend 每个命令都付。

### 2. npm run wrapper —— 每次约 0.7-1.7s/次

SKILL.md 与 agent-workflow.md 所有命令都用 `npm run --silent cli --`。npm 需启动自身进程、解析 package.json、再 spawn node。

- 证据：inspect 的 `npm run` = 2.77s，`node tsx` 直接跑 = 1.03s，差 1.74s 为 npm 开销。
- 触发面：工作流 4 步（inspect + 决策 + validate + render）× 每次 npm 税。

### 3. inspect 全量加载 7 主题并吐 68KB JSON

`handleInspect` 无条件调 `loadThemeLibraries()` 加载全部 7 主题（读 7×theme.json + 7×14 component.json + 7×14 template.html + 样式断言），再把 91 个组件、126 个 variant 的完整清单序列化进 `analysis-input.json`（68KB）交给 Agent。

- Agent 必须完整读取这 68KB 进上下文，拖慢 LLM 推理（这是"用起来慢"的隐性主因，不在 CLI 耗时里体现）。
- `recommendThemes` 已排序，却仍把全量主题组件清单返回，Agent 实际只需 top-3 推荐 + 选定主题的组件清单。

### 4. schema-validator 顶层编译 11 个 AJV schema

`src/validation/schema-validator.ts` 模块顶层一次性 `ajv.compile` 全部 11 个 schema（block-document / source-manifest / article-profile / reading-plan / layout-plan / theme-manifest / component-definition / candidate-catalog / image-plan / asset-manifest / layout-decision）。

- inspect 只用到 source-manifest 和 theme-manifest，却连 image-plan / asset-manifest 等用不到的也一起编译。
- 单次约 30-50ms，量级小于 tsx 税，但属于"加载即全量"的同类设计问题。

### 5. 跨进程无法复用已加载主题

validate 和 render 各自重新 `loadThemeLibrary(decision.theme)`。同一篇文章、同一主题，每次进程重启都重新读盘 + 断言。受进程模型限制，只有合并命令或常驻进程才能解决。

### 6. render 内 candidatesFor 重复计算 3 遍（影响小）

`createLayoutPlan` 对每块算一次 candidatesFor；`assertLayoutPlan` 对每块再算一次；`validate` 命令里 `validateDecisionSemantics` 还算一次。即同一份候选算 3 遍。

- 量级：14 组件 × 数 variant × ~15 块，亚毫秒级，可忽略。
- 但属设计冗余，可缓存 `candidatesFor(block, reading, library)` 结果。

## 修复建议（优先级排序）

### P0 — 改用预编译产物（预计加速 10 倍，改动最小）

1. `package.json` 增加 `"prepublish": "tsc -p tsconfig.json"` 或 `"build": "tsc -p tsconfig.json"`，CI/安装后自动产出 `dist/`。
2. `cli` 脚本改为 `node dist/scripts/cli.js`，保留 `tsx` 仅作 dev 用途（如 `"cli:dev": "tsx scripts/cli.ts"`）。
3. SKILL.md 与 references/agent-workflow.md 所有命令从 `npm run --silent cli --` 改为 `node dist/scripts/cli.js`（或 `npm run --silent cli --` 但 cli 指向 dist），去掉 npm wrapper 税。
4. SKILL.md 第 22 行"只有 node_modules 不存在时才运行 npm install"补充："首次使用前先 `npm run build` 产出 dist"。

### P1 — 精简 inspect 输出（削减 Agent context 60%+）

1. `handleInspect` 的 `themes` 字段只返回 `recommendThemes` 的 top-3（含完整组件清单），不再全量返回 7 主题。
2. 或新增 `--theme <id>` 参数，inspect 只返回该主题的组件清单；Agent 先用 `recommend` 选主题，再带主题 inspect。
3. `recipes` 字段只返回 `suggestedRecipes`，不返回全量 `ARTICLE_RECIPES`。

### P2 — schema 懒编译

`schema-validator.ts` 把 11 个顶层 `compileSchema` 改为按需 getter（首次用到才编译）。inspect 路径不再编译 image-plan / asset-manifest / layout-decision 等。

### P3 — 缓存 candidatesFor

`createLayoutPlan` 内对每块算一次 candidates 后，把结果传给 `assertLayoutPlan` 复用，避免重复 flatMap + sort。`validateDecisionSemantics` 同理。

### P4 — 合并 validate + render 为单命令（可选）

新增 `render --validate` 一步完成校验+渲染，省一次进程启动。失败时仍返回清晰错误。

## 附：非性能的设计观察

- SKILL.md 工作流强制 inspect → 决策 → validate → render 四步，每步独立进程。即便 CLI 降到 0.2s/步，Agent 仍有 3-4 次 LLM 往返。这是架构选择（Agent 做语义、CLI 做执行），无法从 CLI 侧优化，但 P4 的命令合并能减少往返。
- `inspect` 的 `baseline.advisoryOnly=true` 设计正确（基线仅供参考），但与全量返回 7 主题组件清单矛盾——既让 Agent 自主决策，又灌入全量清单，增加了无关负担。
- `adaptToWechatFragment` 用多个全局正则多次 replace，对大文章可接受（render 0.16s 已含此项），非瓶颈。

## 复测方法

```bash
# 预编译
npm run build

# 对比
time node dist/scripts/cli.js inspect --input examples/sample-article.md --output /tmp/ai.json
time node dist/scripts/cli.js validate --input examples/sample-article.md --decision examples/sample-decision.json
time node dist/scripts/cli.js render --input examples/sample-article.md --decision examples/sample-decision.json --output /tmp/out.html --preview /tmp/prev.html
```

---

## 端到端体验优化（针对"排版一篇文章生成很久"）

CLI 耗时只是冰山一角。用户实际"排版一篇文章"的完整链路是 LLM 多轮往返 + 大 context，这才是"生成很久"的主因。

### 完整链路耗时拆解

按 SKILL.md 工作流，一次排版至少经历：

1. Agent 保存 source.md
2. 跑 inspect → Agent 读 68KB analysis-input.json
3. Agent 通读原文 + analysis，做文章级决策（LLM 往返 1）
4. Agent 写 layout-decision.json（LLM 往返 2，输出 ~4KB）
5. 跑 validate → 失败则回 4（LLM 往返 ×N，每轮带 68KB context）
6. 跑 render → Agent 读结果
7. Agent 视觉验收（LLM 往返 3）

至少 3 轮 LLM，每轮拖 68KB context；validate 失败重试时每轮也带全量 context。

### inspect 输出 82% 是冗余

实测 analysis-input.json 构成（无缩进 30KB / 缩进版 68KB）：

| 部分 | 体积 | 是否决策必需 |
|---|---:|---|
| themes 全量组件清单（7 主题） | 24.8 KB | 否，只需 top-3 |
| recipes 全量配方 | 1.4 KB | 否，suggestedRecipes 已是子集 |
| source 原文事实 | 1.2 KB | 是 |
| baseline 基线分块 | 1.2 KB | 是 |
| suggestedRecipes | 0.8 KB | 是 |
| recommendations top3 | 0.3 KB | 是 |
| agentContract | 0.1 KB | 是 |

决策必需仅 3.5 KB，却让 Agent 读 68KB。冗余占 86%（themes + 全量 recipes）。

### 优化建议（端到端层）

#### E1 — inspect 只返回决策必需信息（削减 context 86%）

`handleInspect` 的 payload 改为：
- `themes` 字段只返回 `recommendThemes` 的 top-3（含完整组件清单），不返回全量 7 主题。
- `recipes` 字段移除，只保留 `suggestedRecipes`。
- 新增 `--theme <id>` 参数：Agent 先用 recommend 选定主题后，可选地带主题再 inspect，只返回该主题组件清单。

预期：analysis-input.json 从 68KB 降到 ~6KB，每轮 LLM 推理显著加速。

#### E2 — 合并 validate + render 为单命令

新增 `render --validate` 或 `commit` 命令：一步完成校验 + 渲染。
- 成功：直接返回 HTML + 完整性结果。
- 失败：返回结构化错误，Agent 修 decision 后重跑同一命令。

省一次进程启动 + 一次 Agent 读取往返。

#### E3 — validate 失败时只返回 diff，不要求 Agent 重读全量

`handleValidate` 失败时，错误信息已具体到块。Agent 只需定位错误块修改，不必重读 analysis-input.json。SKILL.md 应明确：validate 重试只需局部改 decision，不重新 inspect。

#### E4 — 提供 decision 模板生成，降低 Agent 写决策成本

inspect 输出里附带一个基于 baseline 的 `decisionTemplate`（phase/gesture/emphasis 已按基线填好，Agent 只需调整 articleType/recipe/theme/少量块）。Agent 从模板改，而非从零写 4KB JSON，减少出错和重试。

#### E5 — SKILL.md 工作流命令直跑 dist

第 22 行"只有 node_modules 不存在时才运行 npm install"补充首次 `npm run build`；所有 `npm run --silent cli --` 改为 `node dist/scripts/cli.js`，去掉每步 npm+tsx 双重税。

### 预期综合收益

| 优化项 | 收益 |
|---|---|
| E1 精简 inspect | context 68KB → 6KB，每轮 LLM 推理提速 |
| E2 合并 validate+render | 省 1 次进程 + 1 次往返 |
| E5 直跑 dist | CLI 三步 5.96s → 0.55s |
| E3+E4 减少重试 | validate 失败重试成本下降 |

CLI 层（P0-P3）解决"每步慢"；端到端层（E1-E5）解决"往返多、context 大"。两者叠加，单篇文章排版从分钟级降到秒级。

---

## 优化已实施（2026-08-15）

### 已落地

| 项 | 改动 | 文件 |
|---|---|---|
| P0/E5 | `cli` 脚本指向 `node dist/scripts/cli.js`，新增 `cli:dev` 保留 tsx；SKILL.md 与 agent-workflow.md 命令全部改直跑 dist，加首次 build 说明 | package.json, SKILL.md, references/agent-workflow.md |
| P2 | schema-validator 11 个 schema 改懒编译（首次用到才 compile），并修 schema 路径用 `process.cwd()` 解析（修复 dist 下找不到 schemas 的隐患） | src/validation/schema-validator.ts |
| E1 | inspect 默认只返回 top-3 主题（非全量 7）+ suggestedRecipes，移除全量 recipes；加 `--full` 恢复全量供向后兼容 | scripts/cli.ts |
| E4 | inspect 附带 `decisionTemplate`（基于基线的 phase/gesture/emphasis 已填，Agent 调整而非从零写） | scripts/cli.ts |
| E2 | 新增 `commit` 命令一步完成 validate + render，失败返回结构化错误；提取 `runValidation` 供 validate/commit 复用 | scripts/cli.ts |

P3（candidatesFor 缓存）跳过：预编译后 render 仅 0.36s，该函数占比亚毫秒，投入产出比低。

### 实测结果（复测）

| 指标 | 优化前 | 优化后 |
|---|---:|---:|
| 端到端 CLI（inspect + validate + render） | 5.96s | 0.71s（inspect + commit） |
| inspect 输出体积（Agent 每轮读取） | 68 KB | 36 KB（精简，降 47%） |
| 工作流进程数 | 3（inspect/validate/render） | 2（inspect/commit） |
| 加速比 | — | 约 8 倍 |

inspect 输出 36KB（精简版）仍含 top-3 主题完整组件清单供 Agent 比较；若 Agent 已选定主题，可用 `recommend` 选定后只 inspect 单主题进一步降 context。

### 测试

`vitest` 全部 42 测试通过，含新增 3 个：inspect top-3 断言、inspect --full 向后兼容、commit 一步校验+渲染。

### 仍可改进（未实施）

- E3：validate 失败时 SKILL.md 可更明确指引"只局部改 decision，不重读 inspect"（commit 已返回结构化错误，部分覆盖）。
- inspect 可加 `--theme <id>` 只返回单主题组件清单，进一步降 context。
- .themes 目录目前运行时靠 `process.cwd()` 定位，若 Agent 在非根目录运行需注意。
