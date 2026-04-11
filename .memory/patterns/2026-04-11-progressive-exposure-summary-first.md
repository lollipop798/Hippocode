# P-2026-04-11-001 Progressive Exposure Summary-First

- id: P-2026-04-11-001
- layer: pattern
- title: 渐进式暴露三层策略（summary -> focused -> full）
- summary: 命令输出统一走 `CommandEnvelope`，默认 `summary`，结合 intent 和 focus path 决定是否升级到 `focused` 或 `full`。
- keywords: pattern, recall, progressive-exposure, command-envelope, telemetry
- scope: command-runtime, recall-pipeline, response-shaping
- exposure: summary
- confidence: 0.84
- references: src/core/types.ts, src/core/runtime.ts, docs/commands.md
- createdAt: 2026-04-11T16:20:00.000Z
- updatedAt: 2026-04-11T16:20:00.000Z

## When To Use

需要在可读性、上下文成本和可追踪性之间平衡时，优先采用此模式。

## Anti-Pattern

未经意图判断直接返回 full context，会引入高噪声和不稳定输出。
