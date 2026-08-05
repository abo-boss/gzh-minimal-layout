# Agent workflow reference

所有命令在 Skill 根目录运行。以下用 `$WORK` 表示任务目录；实际执行时请替换为绝对路径，不要依赖未设置的环境变量。

## 1. 生成 baseline 骨架

```bash
npm run --silent cli -- workflow run \
  --input /tmp/gzh-minimal-layout/article/source.md \
  --mode baseline \
  --theme quiet-editorial \
  --output /tmp/gzh-minimal-layout/article/baseline.wechat.html \
  --artifacts-dir /tmp/gzh-minimal-layout/article/baseline-artifacts
```

读取原文、`source-manifest.json`、`article-profile.json`、`block-document.json` 和 `reading-plan.json`。baseline 是来源可追溯的起点，不是最终语义判断。

## 2. 编写 Agent 合同

以 `schemas/` 和 `src/contracts/` 为准，在 `agent/` 下生成：

- `article-profile.json`
- `block-document.json`
- `reading-plan.json`

必须满足：

- `ArticleProfile.articleType` 等于 `BlockDocument.articleType`。
- `ArticleProfile.tone` 等于 `BlockDocument.moods`。
- `ReadingPlan` 的 Block 顺序与 `BlockDocument` 完全一致。
- 每个 Source Segment 恰好有一个 `keep` 或 `split` 决策。
- 所有 `sourceRefs`、`sourceSpans` 和块文本均可回溯到原文，字符不能被改写或重排。

可单独执行验证：

```bash
npm run --silent cli -- profile validate --input /tmp/gzh-minimal-layout/article/agent/article-profile.json
npm run --silent cli -- blocks validate \
  --input /tmp/gzh-minimal-layout/article/agent/block-document.json \
  --source-manifest /tmp/gzh-minimal-layout/article/baseline-artifacts/source-manifest.json

npm run --silent cli -- reading validate \
  --input /tmp/gzh-minimal-layout/article/agent/reading-plan.json \
  --blocks /tmp/gzh-minimal-layout/article/agent/block-document.json
```

## 3. 检查主题能力和候选

```bash
npm run --silent cli -- theme inspect --theme whitespace-journal

npm run --silent cli -- layout candidates \
  --blocks /tmp/gzh-minimal-layout/article/agent/block-document.json \
  --reading /tmp/gzh-minimal-layout/article/agent/reading-plan.json \
  --theme whitespace-journal \
  --output /tmp/gzh-minimal-layout/article/candidates.json
```

`selections.json` 只能引用 `candidates.json` 中同一 Block 的组件和变体：

```json
[
  {
    "blockId": "block-001",
    "componentId": "masthead",
    "variantId": "minimal",
    "reason": "文章语气克制，降低题头装饰"
  }
]
```

## 4. 最终运行与硬门槛

使用 `SKILL.md` 中的最终命令。成功结果必须同时满足：

- CLI 报告 `analysisMode: "agent"`。
- CLI 报告 `contentIntegrity.valid: true`。
- `analysis-trace.json` 存在且合同哈希与本次输入一致。
- `.wechat.html` 是无 shell、无脚本、无 class/ID、无调试属性的内联片段。
- 375px 预览中没有连续强强调、伪造结构、长段失控或结尾节奏断裂。

缺少任一 `--agent-*` 输入、分段审计不完整、合同不一致、来源跨度错误或候选非法时必须停止，不得改用 baseline 交付。
