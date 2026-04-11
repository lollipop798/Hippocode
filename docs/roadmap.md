# Hippocode 路线图

## Phase 1：仓库初始化与协议稳定

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

目标：

- 读取 `.memory` 摘要层
- 建立最小 recall pipeline
- 产出可排序的 recall 结果

建议 issue：

1. 实现 `.memory` 读取器
2. 实现 memory entry 序列化与反序列化
3. 实现 recall entity extraction
4. 实现 recall ranking MVP
5. 实现 recall summary 压缩器

## Phase 3：reflect / sleep / deep-sleep

目标：

- 建立 episodic 写入流程
- 让 reflect 与 forecast 形成闭环
- 让 sleep 生成候选长期记忆

建议 issue：

6. 实现 reflect record builder
7. 实现 sleep candidate writer
8. 实现 deep-sleep promotion policy

## Phase 4：host adapters

目标：

- 梳理 Claude Code 的技能与 hooks 映射
- 梳理 Codex 的技能与 hooks 映射
- 保证共享协议不漂移

建议 issue：

9. 定义 Claude host adapter 接口
10. 定义 Codex host adapter 接口

## Phase 5：CLI / scaffold

目标：

- 提供最小 CLI 入口
- 提供项目初始化与模板灌入能力
- 让 `/hippo:project-onboard` 有明确载体

后续建议：

- 构建 `hippocode init`
- 构建 `hippocode validate`
- 构建本地模板同步器

## 下一轮优先级

下一轮最值得继续并行开发的方向：

- `.memory` 文件读写与 schema 对齐
- recall pipeline 与排序
- sleep / deep-sleep 候选晋升规则
- Claude / Codex host adapter 具体化
- CLI 初始化器
