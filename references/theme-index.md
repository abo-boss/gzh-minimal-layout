# 主题索引

这套项目当前只注册了 7 个 TUO 导出主题。先判断文章类型、语气与结构，再运行 `npm run --silent cli -- recommend`，从最多 3 个候选中选择并记录 `themeReason`。

| 主题 | 风格与适用内容 |
| --- | --- |
| `tuo-quiet-lifestyle` | 燕麦糙绿、宋体章节牌；温暖生活观察与舒缓叙事 |
| `tuo-forest-order` | 深森林绿、香槟金；正式、判断鲜明的观点长文 |
| `tuo-whitespace-narrative` | 石墨文字、展签式细节；安静反思与片段叙事 |
| `tuo-digital-efficiency` | 松石阶梯、清晰编号；教程、步骤和效率方法论 |
| `tuo-insight-logic` | 普鲁士墨蓝、理性编号；分析、决策和观点文章 |
| `tuo-magazine-cards` | 乳白阅读卡片；模块化信息、教程和清单 |
| `tuo-content-method` | 暖纸白、哑光金；内容方法论与结构化教程 |

每个主题均提供 `masthead`、`heading`、`subheading`、`prose`、`list`、`quote`、`ending` 与 `cta` 组件；具体合法候选由 CLI 根据所选主题返回。
