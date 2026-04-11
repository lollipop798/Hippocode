# Hippocode x Claude Code

本文件只描述 Hippocode 在 Claude Code 宿主中的映射方式，不重复共享规范。共享规则以 `AGENTS.md` 和 `docs/` 为准。

## 1. 宿主职责

Claude Code 侧主要负责以下内容：

- 在会话边界触发 recall / forecast / reflect / sleep
- 以 Markdown 友好的形式展示 `payload.humanReadable`
- 将结构化结果映射到工具流或后续命令
- 在合适时机把情景层结果推进到 `.memory`

## 2. 建议的生命周期映射

### 会话启动

目标：

- 读取 `.memory/project-profile.md`
- 读取 `.memory/current-focus.md`
- 提供项目画像级别的 summary

建议触发：

- 预热 `summary` 层记忆
- 不自动展开 `focused` / `full`

### 用户输入到达

目标：

- 对新请求先执行 `/hippo:recall`
- 对高风险或多步骤任务追加 `/hippo:forecast`

建议触发：

- 识别任务意图与候选实体
- 返回 `status/payload/telemetry`

### 工具调用前

目标：

- 提醒当前约束、历史事故和相关决策
- 避免在无 recall 的情况下直接做大范围修改

建议触发：

- 用 `telemetry.dependencies` 附带风险点
- 如果风险较高，提示优先执行 `/hippo:forecast`

### 工具调用后

目标：

- 捕获结果、偏差和新信号
- 为 `/hippo:reflect` 和 `/hippo:sleep` 提供输入

建议触发：

- 记录涉及模块、验证结果、异常与反证
- 默认写入 episodic 或候选层，而不是长期层

### 会话结束或阶段性收尾

目标：

- 触发 `/hippo:sleep`
- 在高价值场景下准备 `/hippo:deep-sleep` 的输入

建议触发：

- 压缩执行过程
- 更新候选模式、决策或事故摘要

## 3. 输出风格约束

Claude Code 宿主优先消费以下字段：

- `payload.humanReadable`
- `payload.structured`
- `telemetry.exposureLevel`
- `telemetry.nextCommandHint`

约束：

- 默认先输出摘要，再扩展细节
- 只有明确需要时才从 `summary` 升级到 `focused` 或 `full`
- 不把完整历史记忆一次性塞入上下文

## 4. 建议的技能与 hooks 布局

Claude 相关骨架位于：

- `.claude/skills/hippo/`
- `.claude/hooks/`

当前阶段这些目录已经承载：

- 宿主命令映射与输入输出说明
- hook 生命周期约定
- 与共享 runtime 对齐的适配说明骨架

当前阶段仍不承诺：

- 这些文件已经完成 Claude Code 侧的真实自动触发
- 已完成自动化 wiring 与宿主级执行器封装

## 5. 与共享抽象的接口

Claude 宿主应直接复用以下共享内容：

- `src/core/types.ts` 中的命令与记忆协议类型
- `docs/commands.md` 中的命令输入输出定义
- `docs/memory-model.md` 中的目录协议与 graph schema

不应在 Claude 侧重新定义新的命令语义或新的记忆目录格式。
