# Hippocode 设计文档

## 1. 项目定义

Hippocode 是一套受海马体启发的编码代理记忆框架，面向 Claude Code、Codex CLI 以及类似的开发型 Agent 环境。

它的目标不是做通用知识库，而是建立更接近资深开发者思考方式的项目级记忆系统：

- 先回忆，再行动
- 结合关系联想，而不是只做关键词命中
- 按阶段渐进式暴露记忆
- 在任务后反思
- 通过睡眠式整合沉淀长期知识

## 2. 工程目标

Hippocode 从一开始就按可发布的 TypeScript npm package 组织。

工程目标：

- 未来可发布到 npm
- 可作为 TypeScript / Node.js library 导入
- 可扩展为 CLI、脚手架与宿主适配器
- 所有关键协议先有类型定义

技术约束：

- Node.js 20 LTS
- TypeScript
- ESM
- MVP 阶段优先文件型存储

## 3. 当前 MVP 范围

当前 Phase 2 MVP 已落以下内容：

- package 与 build 骨架
- 核心类型
- 文件型 memory store
- summary-first recall / forecast / reflect / sleep 最小运行时
- `/hippo:project-onboard` 最小项目画像初始化执行器
- `/hippo:deep-sleep` 最小晋升执行器
- `/hippo:status` 最小状态汇总执行器
- smoke test 脚本与已构建产物回归入口
- recall regression fixture 与 exposureTrace / ranking 回归脚本
- 最小 CLI 入口，支持 `validate`、`recall`、`project-onboard`、`forecast`、`reflect`、`sleep`、`status`、`deep-sleep`
- `.memory` 长期层基线样例与 graph 基线关系
- Claude / Codex host adapter descriptor
- 命令协议文档
- 记忆模型文档
- `.memory`、`.claude`、`.codex` 结构

本轮暂不落：

- schema runtime validator
- 完整 graph 自动构建与复杂扩散排序
- 完整 CLI / scaffold 命令集
- 自动化 hooks wiring

## 4. 六层架构

### 4.1 规则层

载体：

- `AGENTS.md`
- `CLAUDE.md`

负责稳定规则、工程约束、宿主映射与协作边界。

### 4.2 指令层

载体：

- `/hippo:*` 命令语义
- `.claude/skills/`
- `.codex/skills/`

负责把认知动作抽象为稳定命令。

### 4.3 触发层

载体：

- `.claude/hooks/`
- `.codex/hooks/`

负责在会话、提示、工具调用、收尾等生命周期触发 recall / reflect / sleep。

### 4.4 记忆存储层

载体：

- `.memory/`

负责保存项目画像、决策、事故、模式、模块知识与情景记忆。

当前仓库已经在长期层目录中补入最小样例条目，既作为 recall baseline，也作为后续 schema 校验与 fixture 测试的输入样本。

### 4.5 联想召回层

载体：

- `associative-graph.json`
- `RecallPipelineConfig`

负责实体抽取、关系扩散、启发式排序与渐进式暴露。

当前 graph 仍保持文件型快照，不做重型扩散执行器；长期层样例条目与核心 runtime 实体之间的基线关系，作为 recall engine 的验证输入存在。

### 4.6 睡眠整合层

负责把短期执行痕迹压缩、抽象、去重并沉淀为长期知识候选。

## 5. Recall Engine 流程

Recall engine 在当前阶段已实现最小运行时，仍保持轻量启发式与 summary-first 原则。统一流程如下：

1. 输入解析
   从用户任务或宿主生命周期事件中提取意图、约束、focus path。
2. 实体抽取
   扫描 `.memory` 文件摘要，识别模块、决策、事故、模式与任务线索。
3. 初始召回
   优先读取 `summary` 层，避免全量展开。
4. 图扩散
   从候选节点沿 `associative-graph.json` 的边做有限扩散。
5. 启发式排序
   结合节点权重、边权重、recency、confidence、任务意图做排序。
6. 摘要压缩
   输出高信号摘要、引用与下一步建议。
7. 统一包装
   返回 `status`、`payload`、`telemetry`。

当前仓库已经用 `scripts/smoke-test.mjs` 固化了 recall 与 sleep 的最小 happy path，作为 Phase 2 的低成本稳定性护栏。
同时，`fixtures/recall-regression/.memory` 与 `scripts/regression-recall-exposure.mjs` 负责稳定验证 recall 的排序方向与 `exposureTrace` 语义，避免后续启发式调整悄悄破坏默认行为。
进一步地，`fixtures/forecast-regression/.memory`、`fixtures/reflect-regression/.memory`、`fixtures/sleep-regression/.memory` 与 `scripts/regression-runtime-commands.mjs` 提供命令级固定回归，分别覆盖：

- `forecast` 的计划步骤、推荐焦点、follow-up 命令与 telemetry 依赖收敛
- `project-onboard` 的项目画像、当前焦点与基础 graph 初始化
- `reflect` 的偏差识别、candidate layers 判定与 `episodic` 写入
- `sleep` 的候选层判断、晋升建议与 `deep-sleep` 提示
- `deep-sleep` 的长期层写入、graph 同步与 follow-up telemetry
- `status` 的记忆层统计、graph 健康度与候选积压汇总

为了避免文件型 `.memory` 在运行时静默漂移，当前又补入了 `src/core/schema.ts` 与 `scripts/validate-memory-schema.mjs`：

- `schema.ts` 负责校验 memory entry、writeEntry 输入与 associative graph 快照
- `validate:memory-schema` 负责遍历仓库根 `.memory` 与全部 fixtures
- `regression:all` 把 `typecheck -> build -> schema -> smoke -> recall -> runtime` 串成统一验收入口

## 6. 渐进式暴露

Hippocode 的默认暴露策略固定为三层：

- `summary`
- `focused`
- `full`

约束：

- 默认只能返回 `summary`
- 只有在焦点明确或命令显式要求时才升级到 `focused`
- `full` 仅用于少数需要深挖的场景

这套策略的目的不是省略信息，而是控制上下文污染，让 Agent 在更像资深开发者的节奏下工作。

## 7. 命令与记忆的关系

- `/hippo:recall`
  读摘要层，不默认写长期层
- `/hippo:forecast`
  读 recall 与规则层，给出执行路径预测
- `/hippo:reflect`
  写入情景层与经验候选
- `/hippo:sleep`
  将任务执行压缩为候选知识
- `/hippo:deep-sleep`
  后续用于把候选晋升为长期知识

## 8. Package-first 结构

当前工程结构明确区分：

- `src/core`
- `src/adapters`
- `src/cli`
- `src/utils`

发布策略为：

- 根入口导出共享 API
- `./core` 导出共享协议
- `./adapters` 导出宿主边界
- `./cli` 导出 CLI 入口与子命令描述

当前 `bin` 入口为 `hippocode`，最小支持：

- `hippocode validate`
- `hippocode recall`
- `hippocode project-onboard`
- `hippocode forecast`
- `hippocode reflect`
- `hippocode sleep`
- `hippocode status`
- `hippocode deep-sleep`

## 9. 非目标

当前阶段仍不追求：

- 复杂自动化编排
- 图数据库
- 全量上下文注入
- 全自动因果推理系统
- 一次性实现所有记忆行为
