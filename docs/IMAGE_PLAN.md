# AI 图片计划

本项目的 AI 配图采用“计划与执行分离”的方式：Agent 只负责决定图片用途、锚点、画幅和 Prompt；宿主 Agent 或外部图片 Provider 负责生成图片；Renderer 只消费已经解析好的资产 URL。

## 合同

`ImagePlan` 是独立 JSON，不修改原始 Markdown，也不把 Prompt 当作正文。每个条目需要声明：

- `anchorBlockId`：图片位于哪个 Block 前或后。
- `purpose`：`lead`、`inline` 或 `infographic`。
- `prompt`、`alt`、`aspectRatio`：生成意图和无障碍文本。
- `assetId`：生成完成后绑定到 `AssetManifest` 的资产。
- `reason`：为什么此处需要图片。

`AssetManifest` 保存已解析资产的 URL。`localPath` 可以记录生成文件的本地位置，但 Renderer 使用的是 `url`；这样本地生成、资产托管和微信公众号上传可以分别替换。

## 校验

```bash
npm run --silent cli -- validate --input $WORK/source.md --decision $WORK/layout-decision.json
```

## 渲染

```bash
npm run --silent cli -- render \
  --input article.md \
  --decision layout-decision.json \
  --image-plan agent/image-plan.json \
  --asset-manifest agent/asset-manifest.json \
  --output /tmp/article.wechat.html
```

没有同时提供计划和资产清单时，工作流不会生成或猜测图片。计划引用未知 Block、未知资产、未解析资产或危险 URL 时会直接失败。
