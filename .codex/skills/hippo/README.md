# Codex Hippo 技能模板

本目录用于承载 Hippocode 在 Codex 宿主中的技能说明模板。

这里的“技能”含义是：

- 告诉 Codex 何时应该考虑调用 `/hippo:*`
- 约束命令返回的结构化输出
- 明确哪些语义来自 Hippocode 核心协议
- 明确哪些内容只是 Codex 宿主侧的表达偏好

这里**不是**：

- 真正可执行的命令注册器
- 已接入 Codex 生命周期的自动化实现
- 对核心协议的替代定义

## 推荐技能职责

Codex 侧 `hippo` 技能建议承担以下职责：

- 在处理新任务前提醒“先回忆，再行动”
- 把用户任务压缩成适合 recall / forecast 的输入摘要
- 根据场景推荐下一条 `/hippo:*` 命令
- 统一输出中的 `status` / `payload` / `telemetry`
- 在写入型命令上保留人工确认意识

## 推荐命令选择

可以把 `hippo` 技能理解为一个路由层：

- 需要最小上下文包时：优先 `/hippo:recall`
- 需要判断下一步风险和影响面时：优先 `/hippo:forecast`
- 需要跨模块联想线索时：优先 `/hippo:associate`
- 需要强制检查关键前提时：优先 `/hippo:active-recall`
- 需要沉淀复盘时：优先 `/hippo:reflect`
- 需要阶段性下沉候选记忆时：优先 `/hippo:sleep`
- 需要查看记忆整体状态时：优先 `/hippo:status`
- 需要整理或晋升长期层时：优先 `/hippo:prune` / `/hippo:deep-sleep`

## Codex 侧输出偏好

推荐所有技能响应都优先满足统一包裹结构：

```json
{
  "status": "success",
  "payload": {
    "humanReadable": "本次召回命中 3 条高信号模式，建议先检查 FileMemoryStore 与 schema guard。",
    "structured": {
      "command": "/hippo:recall",
      "summaryLevel": "summary-first",
      "hits": [
        {
          "kind": "pattern",
          "id": "file-memory-store-layout"
        }
      ]
    }
  },
  "telemetry": {
    "confidence": 0.86,
    "exposureLevel": "summary",
    "dependencies": ["patterns", "modules"],
    "exposureTrace": ["patterns/file-memory-store-layout"],
    "nextCommandHint": "/hippo:forecast"
  }
}
```

建议遵循以下偏好：

- 默认 `summary-first`，避免一次性展开全部记忆
- 先给 `humanReadable` 摘要，再给 `structured` 明细
- `nextCommandHint` 尽量具体到某条 `/hippo:*`
- 对写入型动作明确标出 `validation` 是否满足

## 建议的技能提示重点

如果后续维护者要为 Codex 写真正的技能说明或 prompt，可优先覆盖这些点：

- 当前任务目标是什么
- 当前任务涉及哪些模块、决策、模式或事故
- 是否需要只读召回，还是涉及写入长期层
- 是否存在用户限制，例如“只能改某个目录”
- 如果命令失败，应该返回什么 `status` 与 `skippedReasons`

## 人工接线点

本目录仍依赖人工完成以下工作：

- 把 `hippo` 技能加入团队实际使用的 Codex 提示或工作流
- 决定技能是直接调用 CLI，还是调用外层适配器
- 决定技能结果只展示给用户，还是进入外层自动化链路
- 决定何时允许从只读命令升级到写入型命令

## 最小落地建议

若只做一版轻量模板，建议：

1. 先让 Codex 在新任务开始时优先考虑 `/hippo:recall`
2. 在需要扩展上下文时再显式调用 `/hippo:forecast` 或 `/hippo:associate`
3. 在任务收尾时用 `/hippo:reflect` 产出复盘
4. 把 `/hippo:sleep` 与 `/hippo:deep-sleep` 继续保留为人工确认后触发

这样可以保持 Codex host 模板“可用但不过度承诺”，符合当前阶段只提供骨架与说明、不实现真实 wiring 的约束。
