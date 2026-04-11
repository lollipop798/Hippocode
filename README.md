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
- `scripts/smoke-test.mjs` 对 recall / sleep happy path 的最小回归验证
- `.memory/decisions`、`incidents`、`patterns`、`modules` 的长期层基线样例
- Claude / Codex 的 host adapter descriptor
- `.memory`、`.claude`、`.codex` 的基础目录骨架
- 面向开发者与 Agent 的主文档

本轮未落地的内容包括：

- deep-sleep 晋升执行器
- schema runtime validator
- 真实 hook 自动化
- 完整 graph 自动构建与复杂扩散排序
- 独立 CLI 可执行程序

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
npm run smoke
npm run clean
```

`npm run smoke` 会基于已构建的 `dist/` 产物执行最小回归，验证 `recall` 与 `sleep` 的 happy path，以及 fresh `.memory` 初始化后的 `episodic` 写入链路。

## npm 发布方向

本项目以 package-first 为前提设计，当前导出入口为：

- `hippocode`
- `hippocode/core`
- `hippocode/adapters`
- `hippocode/cli`

未来会在不打破核心协议的前提下逐步补齐：

- schema 校验
- deep-sleep 与候选晋升
- host hooks wiring
- CLI/scaffold
- graph 自动生成与 pruning

## 关键文档

- `AGENTS.md`：仓库主规范与协作规则
- `CLAUDE.md`：Claude Code 宿主映射
- `docs/design.md`：总体设计与 MVP 边界
- `docs/commands.md`：命令协议
- `docs/memory-model.md`：记忆模型与目录协议
- `docs/roadmap.md`：阶段路线图
