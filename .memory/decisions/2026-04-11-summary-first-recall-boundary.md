# D-2026-04-11-001 Summary-First Recall Boundary

- id: D-2026-04-11-001
- layer: decision
- title: Recall 默认坚持 summary-first，按需升级暴露层级
- summary: 在 Phase 2 MVP，`/hippo:recall` 默认只返回摘要层，只有显式请求或命中 focus path 才升级到 `focused`，`full` 仅用于少量高价值对象。
- keywords: recall, runtime, exposure, summary, focused, full
- scope: core-runtime, recall-engine, command-protocol
- exposure: summary
- confidence: 0.86
- references: src/core/runtime.ts, src/core/recall-engine.ts, docs/commands.md, docs/memory-model.md
- createdAt: 2026-04-11T16:20:00.000Z
- updatedAt: 2026-04-11T16:20:00.000Z

## Why

避免一次性注入全部记忆，降低上下文噪声与 token 成本，并让命令输出保持可预测。

## Consequence

后续 recall 排序优化应优先提升 summary 质量，而不是扩大默认注入范围。
