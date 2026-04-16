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
- `/hippo:deep-sleep` 的最小长期层晋升执行器
- 最小 CLI 可执行入口，支持 `validate`、`recall`、`forecast`、`reflect`、`sleep`、`deep-sleep`
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
npm run regression:runtime
npm run regression:cli
npm run regression:all
npm run regression:forecast
npm run regression:reflect
npm run regression:sleep
npm run regression:deep-sleep
npm run cli -- help
npm run clean
```

`npm run smoke` 会基于已构建的 `dist/` 产物执行最小回归，验证 `recall` 与 `sleep` 的 happy path，以及 fresh `.memory` 初始化后的 `episodic` 写入链路。
`npm run validate:memory-schema` 会遍历仓库根 `.memory` 与 `fixtures/*/.memory`，验证 graph 快照与 memory entry 是否满足最小 runtime schema。
`npm run regression:recall` 会基于 `fixtures/recall-regression/.memory` 里的固定 fixture，验证 recall 的 `summary` / `focused` / `full` 暴露轨迹，并检查 incident 相对 module 的排序优先性。
`npm run regression:runtime` 会统一执行 `forecast`、`reflect`、`sleep`、`deep-sleep` 的固定回归；对应的单命令入口会读取各自的 `fixtures/*-regression/.memory`，验证计划输出、`episodic` 写入、候选层判断、长期层晋升与 `nextCommandHint`/`exposureTrace` 合同。
`npm run regression:deep-sleep` 会先通过 `sleep` 生成候选，再验证 `deep-sleep` 是否把候选晋升到 `decision`、`incident`、`pattern`、`module` 长期层，并同步更新 `associative-graph.json`。
`npm run regression:deep-sleep-partial` 会验证 `deep-sleep` 的拒绝路径：当 validation 缺失或 `signalStrength = low` 时，命令必须返回 `partial`、保留 `skippedReasons`、不写入长期层且不更新 graph。
`npm run regression:cli` 会基于 `dist/cli/bin.js` 对当前最小 CLI 做固定回归，覆盖 `validate`、`recall`、`forecast`、`reflect`、`sleep` 与 `deep-sleep` 六个子命令的 JSON 输出合同。
`npm run regression:all` 会串联 `typecheck`、`build`、`validate:memory-schema`、`smoke`、`regression:recall`、`regression:runtime` 与 `regression:cli`，作为当前 Phase 2 的一键验收入口。
`npm run cli -- help` 会运行当前最小 CLI，可直接调用 `validate`、`recall`、`forecast`、`reflect`、`sleep`、`deep-sleep` 六个子命令。

CLI 示例：

```bash
npm run cli -- validate --memory-root .memory
npm run cli -- recall --prompt "stabilize runtime regression" --scope task --json
npm run cli -- forecast --task "stabilize runtime regression" --constraint summary-first --constraint package-first --json
npm run cli -- reflect --session-event "validation pass" --session-event "runtime signal fail" --outcome "回归脚本已修正，但仍有覆盖缺口" --json
npm run cli -- sleep --summary "compress runtime regression knowledge" --touched-file src/core/runtime.ts --validation build-pass --signal-strength high --json
npm run cli -- deep-sleep --summary "promote tested runtime knowledge" --candidate-layer decision --candidate-layer pattern --validation build-pass --signal-strength high
```

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
