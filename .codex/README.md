# Hippocode Codex 模板

`.codex/` 用于放置 Hippocode 在 Codex 宿主侧的轻量模板与接线说明。

当前阶段目标是：

- 给 Codex 使用者一个可复制、可阅读、可手工接入的目录骨架
- 明确 `/hippo:*` 命令在 Codex 里的推荐映射方式
- 统一 Codex 侧偏好的结构化输出格式
- 明确哪些部分只提供模板，不实现真实自动化 wiring

当前阶段**不负责**：

- 自动注册 Codex hooks
- 自动发现并安装技能
- 自动把 `/hippo:*` 命令接入 Codex slash command 系统
- 自动把 recall / forecast / reflect / sleep 串成宿主生命周期

## 目录职责

### `.codex/hooks/`

放置 Codex 侧 hook 设计说明、推荐事件映射和人工接线提示。

这里描述的是：

- 适合在哪些 Codex 生命周期节点触发 Hippocode 命令
- 每类 hook 建议读取什么上下文
- 输出需要满足什么结构
- 哪些地方必须由仓库维护者手动配置

这里**不是**可直接执行的自动化实现目录。

### `.codex/skills/`

放置 Codex 侧技能模板。

当前只保留 `hippo/`，用于说明如何在 Codex 中承载 Hippocode 的命令语义、提示词骨架和输出约束。后续如果拆分为多个技能，也应继续保持：

- 共享语义来自 `src/core` / `docs`
- Codex 特定表达只放在 `.codex/`
- 不在这里复制宿主无关的核心协议

## 推荐命令映射

Codex 侧建议把 Hippocode 命令理解为“命令语义 + 手工触发入口”，而不是已经接好线的内建 slash command。

推荐映射如下：

- `/hippo:recall`：读取摘要层与高信号长期记忆，生成当前任务的最小上下文包
- `/hippo:forecast`：基于 recall 结果预测接下来可能涉及的模块、风险和依赖
- `/hippo:reflect`：沉淀本次偏差、判断依据与可复用经验
- `/hippo:sleep`：把会话结果写入候选层或情景层，等待后续整合
- `/hippo:associate`：围绕当前主题做只读联想召回
- `/hippo:active-recall`：围绕当前任务主动列出应被检查的关键记忆点
- `/hippo:deep-sleep`：在满足 validation 条件时尝试晋升长期记忆
- `/hippo:project-onboard`：为仓库初始化最小 `.memory` / 宿主模板说明
- `/hippo:prune`：做只读清理分析，指出低价值或可归并条目
- `/hippo:status`：汇总当前记忆层、候选项和宿主接线状态

推荐做法是：

1. 由人工在 Codex 的提示模板、工作流说明或外层脚本中暴露这些入口
2. 命令本身仍回到 Hippocode CLI 或宿主适配层执行
3. Codex 只负责读取上下文、组织输出与呈现结果

## Codex 输出偏好

Codex 侧建议优先返回**结构化包裹结果**，并保持可读摘要与程序可消费数据同时存在。

推荐输出骨架：

```json
{
  "status": "success",
  "payload": {
    "humanReadable": "面向开发者或 Agent 的简明摘要",
    "structured": {
      "command": "/hippo:recall",
      "focus": ["workflow editor", "tts preview"],
      "memoryHits": []
    }
  },
  "telemetry": {
    "confidence": 0.82,
    "exposureLevel": "summary",
    "dependencies": ["patterns", "decisions"],
    "exposureTrace": [],
    "nextCommandHint": "/hippo:forecast"
  }
}
```

Codex 侧建议特别注意：

- `payload.humanReadable` 保持短摘要，适合直接展示给用户
- `payload.structured` 保持字段稳定，便于后续脚本或外层工具消费
- `telemetry` 不省略，尤其要保留 `confidence`、`exposureTrace`、`nextCommandHint`
- 当不能安全写入长期层时，返回 `partial` 并明确 `skippedReasons`

## 人工接线边界

当前 `.codex/` 模板只负责“告诉维护者该怎么接”，不负责“替维护者接好”。

仍需人工完成的事项包括：

- 把 `/hippo:*` 暴露给具体的 Codex 使用入口
- 决定在哪些会话节点手动触发 recall / forecast / reflect / sleep
- 把仓库上下文、任务元数据、工作目录等信息映射进命令输入
- 决定结构化输出是直接显示、写文件还是传给外层脚本
- 为团队约定失败兜底、权限边界和人工确认点

如果未来要实现真实 wiring，应在宿主侧新增明确实现层，而不是让 README 隐式承担自动化职责。
