# Claude Hooks Template

本目录用于描述 Claude Code 生命周期 hook 的建议触发点。

这里提供的是“推荐映射”，不是已经接通的自动化配置。

## 目标

- 让 Claude host 能在合适时机提醒使用 Hippocode 命令
- 保持 hook 只做轻量触发，不替代共享语义层
- 明确哪些步骤必须人工接线、人工确认

## 推荐生命周期映射

### `sessionStart`

建议用途：

- 在新会话开始时提醒先回忆，再行动
- 优先触发 `/hippo:recall`
- 若任务复杂、跨模块或存在历史依赖，再补 `/hippo:forecast`

推荐触发点：

- 打开仓库后的第一轮工作
- 用户明确切换到新任务或新子系统
- 长时间中断后恢复工作

建议输出：

- 当前任务相关摘要
- 关联模块/决策/事故线索
- 下一条建议命令，例如 `/hippo:forecast`

人工接线要求：

- 需要人工把“会话启动事件”映射到实际 Claude hook 配置
- 需要人工决定 recall 的输入上下文从哪里取值

### `preTool`

建议用途：

- 在执行高影响工具前做风险预测
- 推荐触发 `/hippo:forecast`
- 当上下文不完整时，可补 `/hippo:associate` 或 `/hippo:active-recall`

推荐触发点：

- 批量修改文件前
- 执行删除、迁移、重构、发布相关命令前
- 首次触达陌生目录或陌生模块前

建议输出：

- 受影响模块
- 潜在依赖
- 风险提示
- 建议先补的上下文缺口

人工接线要求：

- 需要人工决定哪些工具属于“高影响工具”
- 需要人工设置阈值，避免每次小工具调用都重复触发

### `postTool`

建议用途：

- 在关键工具执行后做偏差记录与经验沉淀
- 推荐触发 `/hippo:reflect`
- 若产出了稳定结论，可提示准备 `/hippo:sleep`

推荐触发点：

- 测试完成后
- 大块文档或代码变更完成后
- 关键诊断命令返回异常或与预期不一致后

建议输出：

- 计划与实际偏差
- 新发现的约束
- 可复用模式
- 是否值得进入 sleep 候选层

人工接线要求：

- 需要人工决定哪些工具结果才值得 reflect
- 需要人工把 tool 输出裁剪成适合总结的输入

### `sessionEnd`

建议用途：

- 在会话结束时做本轮总结与候选沉淀
- 推荐先 `/hippo:reflect`，再视情况 `/hippo:sleep`
- 仅在满足 validation 条件时，人工决定是否进一步 `/hippo:deep-sleep`

推荐触发点：

- 用户明确结束本轮工作
- 交付总结前
- 切换到完全不同任务前

建议输出：

- 本轮可复用结论
- 候选写入建议
- 未完成事项
- 下次会话建议起始命令

人工接线要求：

- `sleep` 必须保留人工确认
- `deep-sleep` 不能默认触发，必须人工判断 validation 与信号等级

## 一条推荐执行链

可按以下顺序理解，而非强制全自动：

1. `sessionStart` → `/hippo:recall`
2. 复杂任务开始前 → `/hippo:forecast`
3. 缺上下文时 → `/hippo:associate` 或 `/hippo:active-recall`
4. 关键工具执行后 → `/hippo:reflect`
5. `sessionEnd` 前 → `/hippo:sleep`
6. 有充分验证证据时，再人工执行 `/hippo:deep-sleep`

## 不应在 hook 中做的事

- 不应直接把所有对话都写入长期记忆
- 不应跳过人工确认自动执行 `sleep / deep-sleep`
- 不应在 hook 层重写命令语义或篡改共享 telemetry 结构
- 不应把 Claude 私有生命周期细节泄漏到共享协议层
