# I-2026-04-11-001 Memory Store Init Recursion

- id: I-2026-04-11-001
- layer: incident
- title: fresh `.memory` 初始化时出现 ensure/writeGraph 递归阻塞
- summary: `FileMemoryStore.ensureBaseLayout()` 在图文件不存在时调用 `writeGraph()`，而 `writeGraph()` 又回调 `ensureBaseLayout()`，导致 fresh root 初始化链路递归。
- keywords: memory-store, runtime, recursion, initialization, sleep
- scope: core-memory-store, sleep-path, file-io
- exposure: focused
- confidence: 0.9
- references: src/core/memory-store.ts
- createdAt: 2026-04-11T16:20:00.000Z
- updatedAt: 2026-04-11T16:20:00.000Z

## Impact

会阻断新目录下的 `sleep` 与 `writeEntry` 首次写入，影响 MVP 的可用性。

## Mitigation

在 `ensureBaseLayout()` 中直接写入初始 graph JSON，避免通过 `writeGraph()` 回环。
