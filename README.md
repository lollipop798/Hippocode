# Hippocode

Hippocode 是一套受海马体启发的编码代理记忆框架，面向 Claude Code、Codex CLI 以及类似的开发型 Agent 环境。它关注的不是“记住更多”，而是“在合适的时机想起正确的项目知识”。

当前仓库已经按可发布的 TypeScript npm package 形态初始化，并开始进入 Phase 2 MVP，优先落地以下能力：

- 项目级记忆
- 主动记忆与联想召回
- 渐进式记忆暴露
- 执行后反思
- 睡眠式整合

## 当前阶段目标

当前阶段重点是把“可发布的工程骨架”推进为“可调用的最小记忆运行时”，同时继续保持协议和目录结构稳定。

已落地的内容包括：

- TypeScript npm package 基础配置
- `src/core`、`src/adapters`、`src/cli`、`src/utils` 分层
- 核心命令与记忆协议类型
- 文件型 `.memory` store 与 graph 读写入口
- summary-first 的 recall / forecast / reflect / sleep 最小运行时
- `/hippo:project-onboard` 的最小项目画像初始化执行器
- `/hippo:prune` 的最小只读清理分析执行器
- `/hippo:deep-sleep` 的最小长期层晋升执行器
- `/hippo:status` 的最小状态汇总执行器
- 最小 CLI 可执行入口，支持 `init`、`validate`、`recall`、`project-onboard`、`forecast`、`reflect`、`sleep`、`prune`、`status`、`deep-sleep`
- `hippocode init` 可为目标项目初始化 Claude Code / Codex 的 Hippocode 插件骨架
- `scripts/smoke-test.mjs` 对 recall / sleep happy path 的最小回归验证
- `fixtures/recall-regression/.memory` 与 `scripts/regression-recall-exposure.mjs` 的 recall 排序 / 暴露轨迹固定回归
- `fixtures/forecast-regression/.memory`、`fixtures/reflect-regression/.memory`、`fixtures/sleep-regression/.memory` 与 `scripts/regression-runtime-commands.mjs` 的命令级固定回归
- `src/core/schema.ts` 与 `scripts/validate-memory-schema.mjs` 的最小 runtime schema 校验
- `.memory/decisions`、`incidents`、`patterns`、`modules` 的长期层基线样例
- Claude / Codex 的 host adapter descriptor
- `.memory`、`.claude`、`.codex` 的基础目录骨架
- 面向开发者与 Agent 的主文档

本轮未落地的内容包括：

- schema runtime validator
- 真实 hook 自动化
- 完整 graph 自动构建与复杂扩散排序
- CLI 脚手架命令与项目初始化器

## 仓库结构

```text
Hippocode/
├─ package.json
├─ tsconfig.json
├─ tsconfig.build.json
├─ README.md
├─ AGENTS.md
├─ CLAUDE.md
├─ docs/
├─ src/
│  ├─ index.ts
│  ├─ core/
│  ├─ adapters/
│  ├─ cli/
│  └─ utils/
├─ .memory/
├─ .claude/
└─ .codex/
```

### 分层约束

- `src/core`：共享协议、类型、记忆与命令抽象
- `src/adapters`：宿主适配边界，例如 Claude / Codex 集成
- `src/cli`：CLI 与脚手架层的入口约定
- `src/utils`：不携带宿主语义的轻量工具

## 命令体系

Hippocode 的命令统一使用 `/hippo:` 命名空间，避免与宿主原生命令冲突。

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

## 记忆模型原则

- 分层记忆，不使用单一大文件承载全部上下文
- 默认只暴露 `summary`，需要时再升级到 `focused` / `full`
- `reflect` 与 `sleep` 默认写入情景层或候选记忆，不直接写成长期稳定知识
- 联想召回依赖文件型 `associative-graph.json`，不引入图数据库

## 开发方式

默认运行时为 Node.js 20 LTS，模块格式为 ESM，构建工具为 `tsc`。

常用命令：

```bash
npm run typecheck
npm run build
npm run validate:memory-schema
npm run smoke
npm run regression:recall
npm run regression:project-onboard
npm run regression:runtime
npm run regression:cli
npm run regression:cli-usage
npm run regression:all
npm run regression:forecast
npm run regression:reflect
npm run regression:sleep
npm run regression:prune
npm run regression:status
npm run regression:deep-sleep
npm run cli -- help
npm run clean
```

`npm run smoke` 会基于已构建的 `dist/` 产物执行最小回归，验证 `recall` 与 `sleep` 的 happy path，以及 fresh `.memory` 初始化后的 `episodic` 写入链路。
`npm run validate:memory-schema` 会遍历仓库根 `.memory` 与 `fixtures/*/.memory`，验证 graph 快照与 memory entry 是否满足最小 runtime schema。
`npm run regression:recall` 会基于 `fixtures/recall-regression/.memory` 里的固定 fixture，验证 recall 的 `summary` / `focused` / `full` 暴露轨迹，并检查 incident 相对 module 的排序优先性。
`npm run regression:project-onboard` 会在隔离的 `.memory` 上验证项目画像初始化，检查 `project-profile`、`current-focus` 和基础 graph 节点是否被正确刷新。
`npm run regression:runtime` 会统一执行 `project-onboard`、`forecast`、`reflect`、`sleep`、`prune`、`status`、`deep-sleep` 的固定回归；对应的单命令入口会读取各自的 `fixtures/*-regression/.memory`，验证项目画像初始化、计划输出、`episodic` 写入、候选层判断、只读清理建议、状态汇总、长期层晋升与 `nextCommandHint`/`exposureTrace` 合同。
`npm run regression:prune` 是 `scripts/regression-runtime-commands.mjs prune` 的单命令入口，便于单独验证 `/hippo:prune`；其覆盖已经包含在 `npm run regression:runtime` 中。
`npm run regression:deep-sleep` 会先通过 `sleep` 生成候选，再验证 `deep-sleep` 是否把候选晋升到 `decision`、`incident`、`pattern`、`module` 长期层，并同步更新 `associative-graph.json`。
`npm run regression:deep-sleep-partial` 会验证 `deep-sleep` 的拒绝路径：当 validation 缺失或 `signalStrength = low` 时，命令必须返回 `partial`、保留 `skippedReasons`、不写入长期层且不更新 graph。
`npm run regression:cli` 会基于 `dist/cli/bin.js` 对当前最小 CLI 做固定回归，覆盖 `init`、`validate`、`recall`、`project-onboard`、`forecast`、`reflect`、`sleep`、`prune`、`status` 与 `deep-sleep` 十个子命令的 JSON 输出合同。
`npm run regression:cli-usage` 会验证 CLI usage/error 路径，包括未知子命令、缺失必填参数、非法枚举和非法正整数。
`npm run regression:all` 会串联 `typecheck`、`build`、`validate:memory-schema`、`smoke`、`regression:recall`、`regression:runtime`、`regression:cli` 与 `regression:cli-usage`，作为当前 Phase 2 的一键验收入口。
`npm run cli -- help` 会运行当前最小 CLI，可直接调用 `init`、`validate`、`recall`、`project-onboard`、`forecast`、`reflect`、`sleep`、`prune`、`status`、`deep-sleep` 十个子命令。

CLI 示例：

```bash
npm run cli -- validate --memory-root .memory
npm run cli -- init --target ../target-project --host both --json
npm run cli -- recall --prompt "stabilize runtime regression" --scope task --json
npm run cli -- project-onboard --project-name Hippocode --project-summary "项目级记忆框架" --current-phase "Phase 2 MVP" --focus "稳定最小运行时" --constraint package-first --json
npm run cli -- forecast --task "stabilize runtime regression" --constraint summary-first --constraint package-first --json
npm run cli -- reflect --session-event "validation pass" --session-event "runtime signal fail" --outcome "回归脚本已修正，但仍有覆盖缺口" --json
npm run cli -- sleep --summary "compress runtime regression knowledge" --touched-file src/core/runtime.ts --validation build-pass --signal-strength high --json
npm run cli -- prune --include-archived --min-confidence 0.9 --stale-days 30 --json
npm run cli -- status --recent-limit 3 --json
npm run cli -- deep-sleep --summary "promote tested runtime knowledge" --candidate-layer decision --candidate-layer pattern --validation build-pass --signal-strength high
```

`hippocode prune` 当前定位为最小只读命令：它只读取 `.memory` 与 `associative-graph.json` 来生成重复、过时或低价值记忆的清理建议，不直接删除、改写或晋升任何记忆条目。

## npm 发布方向

本项目以 package-first 为前提设计，当前导出入口为：

- `hippocode`
- `hippocode/core`
- `hippocode/adapters`
- `hippocode/cli`

未来会在不打破核心协议的前提下逐步补齐：

- schema 校验
- host hooks wiring
- CLI/scaffold 的更多子命令
- graph 自动生成与 pruning

## 关键文档

- `AGENTS.md`：仓库主规范与协作规则
- `CLAUDE.md`：Claude Code 宿主映射
- `docs/design.md`：总体设计与 MVP 边界
- `docs/commands.md`：命令协议
- `docs/memory-model.md`：记忆模型与目录协议
- `docs/roadmap.md`：阶段路线图
