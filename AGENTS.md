# Hippocode AGENTS 指南

本文件是 Hippocode 仓库的唯一主规范，面向所有在本仓库内协作的 Agent 与开发者。

## 1. 项目定位

Hippocode 是一套受海马体启发的编码代理记忆框架，目标不是构建通用知识库，而是构建更接近资深开发者思考方式的项目级记忆系统。

核心关注点：

- 项目级记忆
- 主动记忆
- 联想记忆
- 渐进式暴露
- 反思能力
- 睡眠式整合

## 2. 工程约束

Hippocode 未来需要发布到 npm，因此仓库从第一天开始就必须按 TypeScript npm package 组织，而不是零散脚本集合。

必须遵循以下约束：

- 统一使用 TypeScript
- 默认运行时为 Node.js 20 LTS
- 默认模块格式为 ESM
- MVP 阶段优先采用文件型存储
- 核心协议必须先有 TypeScript 类型定义
- 共享抽象与宿主特定实现必须分离

## 3. 仓库分层

本仓库必须显式区分以下层次：

- `src/core`
  共享协议、命令与记忆模型的类型边界
- `src/adapters`
  Claude Code、Codex CLI 等宿主集成接口
- `src/cli`
  CLI 与脚手架层入口
- `src/utils`
  无宿主语义的工具层
- `docs`
  面向开发者与 Agent 的设计协议
- `.memory`
  项目级文件型记忆空间
- `.claude`
  Claude Code 的技能与 hook 布局
- `.codex`
  Codex 侧的技能与 hook 布局

## 4. Subagent 协作规则

复杂任务默认遵循“先规划、再拆分、再并行、再汇总”的流程。

必须遵守以下规则：

- 同时启用的 subagent 最多为 4 个
- 先统一方案，再拆分任务
- 多个 subagent 不得同时改动同一共享结构
- subagent 产出优先保持小、清晰、可审阅
- 若发现职责重叠，应先收敛边界再继续并行

## 5. 命令命名空间

不要引入可能与宿主内置命令冲突的自定义 slash command。

Hippocode 的命令统一使用 `/hippo:` 命名空间。

核心命令：

- `/hippo:recall`
- `/hippo:forecast`
- `/hippo:reflect`
- `/hippo:sleep`

扩展命令：

- `/hippo:associate`
- `/hippo:active-recall`
- `/hippo:deep-sleep`
- `/hippo:project-onboard`
- `/hippo:prune`
- `/hippo:status`

## 6. 共享抽象与宿主边界

以下内容属于共享抽象：

- 命令语义
- 记忆目录协议
- TypeScript 协议类型
- 输出包裹结构
- 渐进式暴露规则

以下内容属于宿主特定实现：

- Claude Code 的 hook 生命周期与模板
- Codex 的 skills / hooks 布局
- 宿主输出格式差异
- 宿主特定自动化触发方式

共享抽象放在：

- `src/core`
- `docs/`
- `AGENTS.md`

宿主特定实现放在：

- `CLAUDE.md`
- `.claude/`
- `.codex/`

## 7. 当前阶段允许与禁止

Phase 1 的仓库初始化已经完成，当前进入 Phase 2 MVP。

当前阶段允许：

- 继续扩展 package-first 结构与导出入口
- 实现文件型 memory store
- 实现 summary-first 的 recall / forecast / reflect / sleep 最小运行时
- 维护 `scripts/smoke-test.mjs` 作为最小回归验证入口
- 维护 `fixtures/recall-regression/.memory` 与 `scripts/regression-recall-exposure.mjs`，作为 recall ranking / exposureTrace 的固定回归基线
- 维护 `fixtures/forecast-regression/.memory`、`fixtures/reflect-regression/.memory`、`fixtures/sleep-regression/.memory` 与 `scripts/regression-runtime-commands.mjs`，作为 forecast / reflect / sleep 的固定回归基线
- 实现 Claude / Codex 的 host adapter descriptor
- 继续完善 `.memory`、`.claude`、`.codex` 的协议与说明
- 为 `decisions`、`incidents`、`patterns`、`modules` 维护高信号示例条目，作为 recall 基线样本

当前阶段暂不实现：

- deep-sleep 晋升执行器
- schema runtime validator
- 真实 hook 自动化 wiring
- 完整 graph 自动构建与复杂扩散排序
- 独立 CLI 可执行程序与脚手架命令

## 8. 记忆写入规则

长期记忆不是日志仓库。只有满足以下条件的内容才值得晋升到长期层：

- 新的长期项目约束
- 已验证的设计决策
- 高信号事故复盘
- 可重复复用的模式
- 对未来工作有指导价值的模块知识

默认情况下：

- `recall` 只读摘要层
- `forecast` 用 recall 结果做路径预测
- `reflect` 记录偏差、判断依据与可复用经验
- `sleep` 先写候选与情景层，不直接固化为长期知识

## 9. 输出协议约束

所有命令最终都应收敛到统一包裹结构：

- `status`
- `payload`
- `telemetry`

其中：

- `payload.humanReadable` 面向开发者或 Agent 阅读
- `payload.structured` 面向程序消费
- `telemetry` 至少包含 `confidence`、`exposureLevel`、`dependencies`、`exposureTrace`、`nextCommandHint`

## 10. 设计原则

- 先回忆，再行动
- 关系召回优先于纯关键词搜索
- 渐进式暴露，避免上下文一次性注入
- 只沉淀高价值、长期有效的知识
- 先稳定协议，再扩展实现
