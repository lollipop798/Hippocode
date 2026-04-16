# Hippocode 路线图

## Phase 1：仓库初始化与协议稳定

状态：已完成

目标：

- 建立 TypeScript npm package 骨架
- 稳定核心类型与导出入口
- 固化命令协议与记忆目录协议
- 建立 `.memory`、`.claude`、`.codex` 基础结构

交付：

- `package.json`
- `tsconfig.json`
- `src/core/types.ts`
- `docs/design.md`
- `docs/commands.md`
- `docs/memory-model.md`
- `AGENTS.md`
- `CLAUDE.md`

## Phase 2：文件型记忆读写与 recall MVP

状态：进行中

目标：

- 读取 `.memory` 摘要层
- 建立最小 recall pipeline
- 产出可排序的 recall 结果

当前已落地：

- `.memory` 文件型 store
- graph 读写入口
- recall / forecast / reflect / sleep 最小运行时
- `deep-sleep` 最小晋升执行器
- Claude / Codex host adapter descriptor
- `scripts/smoke-test.mjs` 最小回归脚本
- `src/core/schema.ts` 与 `scripts/validate-memory-schema.mjs`
- `fixtures/recall-regression/.memory` 与 `scripts/regression-recall-exposure.mjs`
- `fixtures/forecast-regression/.memory`、`fixtures/reflect-regression/.memory`、`fixtures/sleep-regression/.memory`
- `scripts/regression-runtime-commands.mjs` 与 `regression:forecast|reflect|sleep|runtime|all`
- `regression:status` 与记忆层/graph/候选积压的固定回归
- `regression:deep-sleep` 与长期层晋升 / graph 同步回归
- 最小 CLI 入口，支持 `validate`、`recall`、`forecast`、`reflect`、`sleep`、`status`、`deep-sleep`
- `scripts/regression-cli.mjs` 与 `regression:cli`，覆盖最小 CLI 的固定回归
- `.memory` 长期层基线样例与 graph 基线关系

建议 issue：

1. 扩展 `.memory` store 的 runtime schema 校验与错误报告
2. 为 recall 增加更稳定的 intent 解析与 focused/full 升级策略
3. 为 graph 增加自动 upsert 与 pruning
4. 为 schema validator 增加更细的错误分类与报告
5. 为 recall 增加 fixture 测试与评分基准
6. 扩展 CLI / host 接口适配，并为 CLI 增加更多子命令、错误路径覆盖与回归

## Phase 3：reflect / sleep / deep-sleep

目标：

- 建立 episodic 写入流程
- 让 reflect 与 forecast 形成闭环
- 让 sleep 生成候选长期记忆

建议 issue：

7. 扩展 reflect 记录结构与候选层判定
8. 实现 sleep candidate writer
9. 扩展 deep-sleep promotion policy，增加更细粒度晋升门槛与冲突处理

## Phase 4：host adapters

目标：

- 梳理 Claude Code 的技能与 hooks 映射
- 梳理 Codex 的技能与 hooks 映射
- 保证共享协议不漂移

建议 issue：

10. 定义 Claude host adapter 接口
11. 定义 Codex host adapter 接口

## Phase 5：CLI / scaffold

目标：

- 扩展最小 CLI 入口
- 提供项目初始化与模板灌入能力
- 让 `/hippo:project-onboard` 有明确载体

后续建议：

- 扩展 `hippocode init`
- 扩展 `hippocode recall` / `hippocode deep-sleep` 的输入模式
- 构建本地模板同步器

## 下一轮优先级

下一轮最值得继续并行开发的方向：

- `.memory` 文件读写与 schema 对齐
- recall pipeline 与排序
- recall / forecast / reflect / sleep 的 fixture 与回归脚本扩展
- sleep / deep-sleep 候选晋升规则
- Claude / Codex host adapter 具体化
- CLI 初始化器
