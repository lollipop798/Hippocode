# Hippocode

Hippocode 是一套受海马体启发的编码代理记忆框架，面向 Claude Code、Codex CLI 以及类似的开发型 Agent 环境。它关注的不是“记住更多”，而是“在合适的时机想起正确的项目知识”。

当前仓库已经按可发布的 TypeScript npm package 形态初始化，MVP 阶段优先落地以下能力：

- 项目级记忆
- 主动记忆与联想召回
- 渐进式记忆暴露
- 执行后反思
- 睡眠式整合

## 当前阶段目标

本轮是第一阶段初始化，不实现完整运行时。重点是把工程骨架、协议类型、文档和目录约束稳定下来，方便后续并行开发。

已落地的内容包括：

- TypeScript npm package 基础配置
- `src/core`、`src/adapters`、`src/cli`、`src/utils` 分层
- 核心命令与记忆协议类型
- `.memory`、`.claude`、`.codex` 的基础目录骨架
- 面向开发者与 Agent 的主文档

本轮未落地的内容包括：

- recall pipeline 真正实现
- graph 扩散与排序实现
- sleep / deep-sleep 执行器
- 真实 hook 自动化
- CLI 命令运行时
- GitHub 私有仓库创建与推送

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
npm run clean
```

## npm 发布方向

本项目以 package-first 为前提设计，当前导出入口为：

- `hippocode`
- `hippocode/core`
- `hippocode/adapters`
- `hippocode/cli`

未来会在不打破核心协议的前提下逐步补齐：

- schema 校验
- 文件型存储读写实现
- recall engine
- host hooks
- CLI/scaffold

## 关键文档

- `AGENTS.md`：仓库主规范与协作规则
- `CLAUDE.md`：Claude Code 宿主映射
- `docs/design.md`：总体设计与 MVP 边界
- `docs/commands.md`：命令协议
- `docs/memory-model.md`：记忆模型与目录协议
- `docs/roadmap.md`：阶段路线图
