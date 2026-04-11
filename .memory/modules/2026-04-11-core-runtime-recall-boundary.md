# M-2026-04-11-001 Core Runtime Recall Boundary

- id: M-2026-04-11-001
- layer: module
- title: `hippo-runtime` 与 `recall-engine` 的职责边界
- summary: `hippo-runtime` 负责命令编排和统一 envelope；`recall-engine` 负责候选抽取、图扩散和排序压缩；二者通过类型协议解耦。
- keywords: module, runtime, recall-engine, boundary, adapters
- scope: src/core/runtime.ts, src/core/recall-engine.ts
- exposure: summary
- confidence: 0.85
- references: src/core/runtime.ts, src/core/recall-engine.ts, src/core/types.ts
- createdAt: 2026-04-11T16:20:00.000Z
- updatedAt: 2026-04-11T16:20:00.000Z

## Responsibilities

- runtime: command routing, envelope shaping, telemetry aggregation
- recall-engine: intent hinting, memory candidate ranking, exposure-aware compression

## Risks

如果 runtime 混入 ranking 细节，会导致测试边界不清并增加回归风险。
