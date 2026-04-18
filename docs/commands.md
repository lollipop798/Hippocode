# Hippocode 命令协议

## 1. 命令设计原则

所有命令统一使用 `/hippo:` 命名空间，避免与宿主内置命令冲突。

当前仓库已经为 `/hippo:recall`、`/hippo:project-onboard`、`/hippo:forecast`、`/hippo:reflect`、`/hippo:sleep`、`/hippo:deep-sleep`、`/hippo:status` 提供可调用的最小 library runtime；其余扩展命令目前只保留协议语义与宿主映射边界，执行器留待后续阶段实现。

统一输出结构：

```ts
{
  status: "ok" | "partial" | "error",
  payload: {
    humanReadable: string,
    structured: unknown
  },
  telemetry: {
    confidence: number,
    exposureLevel: "summary" | "focused" | "full",
    dependencies: string[],
    exposureTrace: ("summary" | "focused" | "full")[],
    nextCommandHint?: string
  }
}
```

统一约束：

- 默认先读 `summary`
- 默认不把完整长期记忆塞进上下文
- 写操作优先落到 episodic / candidate 层
- `humanReadable` 供开发者或 Agent 阅读
- `structured` 供程序消费
- `scripts/smoke-test.mjs` 当前以 `/hippo:recall` 与 `/hippo:sleep` 的最小输入输出合同为基准做回归验证
- `scripts/regression-recall-exposure.mjs` 当前以固定 fixture 验证 `/hippo:recall` 的排序方向与 `exposureTrace`
- `scripts/regression-runtime-commands.mjs` 当前以固定 fixture 验证 `/hippo:project-onboard`、`/hippo:forecast`、`/hippo:reflect`、`/hippo:sleep`、`/hippo:status`、`/hippo:deep-sleep` 的结构化输出、写入边界与 telemetry

## CLI 初始化命令：`hippocode init`

`hippocode init` 是 **CLI 层项目初始化命令**，用于在目标项目下创建 Hippocode 的宿主插件最小目录说明文件；它不是 `/hippo:` 命名空间下的 slash 命令，不参与 runtime 的命令语义执行链。

参数约定：

- `--target <path>`：目标项目路径，默认当前工作目录
- `--host claude|codex|both`：初始化宿主范围，默认 `both`
- `--force`：覆盖已存在的 README 说明文件
- `--json`：输出结构化结果，包含 `created` / `skipped` / `target` / `host`

当前阶段（Phase 2 MVP）仅初始化以下轻量文件，不接入真实 hooks 自动化：

- `.claude/skills/hippo/README.md`
- `.claude/hooks/README.md`
- `.codex/skills/hippo/README.md`
- `.codex/hooks/README.md`

## 2. `/hippo:recall`

### 目标

为当前请求召回最相关的项目记忆，并保持渐进式暴露。

### 输入草案

```ts
{
  prompt: string;
  intent?: string;
  scope: "task" | "module" | "project";
  focusPath?: string;
  filters?: string[];
  exposureLevel?: "summary" | "focused" | "full";
  limit?: number;
}
```

### 默认读取边界

- `.memory/project-profile.md`
- `.memory/current-focus.md`
- `.memory/associative-graph.json`
- 各类记忆条目的摘要信息

### 默认写入边界

- 不写长期记忆
- 最多记录一次 recall telemetry 或会话级临时结果

### 输出重点

- 高相关记忆摘要
- 关联模块、决策、事故和模式
- 当前约束与风险
- 建议的下一步 focus path

### 示例输出

```json
{
  "status": "ok",
  "payload": {
    "humanReadable": "召回到 3 条高相关项目记忆，建议先查看 auth 模块约束与登录事故复盘。",
    "structured": {
      "intent": "investigate-auth-change",
      "matches": [
        {
          "entry": {
            "id": "module-auth",
            "layer": "module",
            "path": "modules/auth.md",
            "title": "Auth Module",
            "summary": "认证模块边界、约束与近期风险摘要。",
            "keywords": ["auth", "login", "token"]
          },
          "score": 0.92,
          "reasons": ["keyword match", "recently validated", "linked incident"],
          "linkedNodeIds": ["incident-login-regression"]
        }
      ],
      "suggestedFocusPaths": ["src/auth", ".memory/incidents"]
    }
  },
  "telemetry": {
    "confidence": 0.87,
    "exposureLevel": "summary",
    "dependencies": ["auth-module", "login-incident"],
    "exposureTrace": ["summary"],
    "nextCommandHint": "/hippo:forecast"
  }
}
```

## 3. `/hippo:forecast`

### 目标

在执行前给出最小执行路径、验证点与风险预测。

### 输入草案

```ts
{
  taskDescription: string;
  constraints: string[];
  recallSnapshot?: RecallResult;
  riskProfile?: "low" | "medium" | "high";
  dependencies?: string[];
  targetExposure?: "summary" | "focused" | "full";
}
```

### 默认读取边界

- recall 摘要结果
- 规则层约束
- 已知 incidents / decisions 摘要

### 默认写入边界

- 不写长期层
- 可写入会话级预测结果，供 reflect 对比

### 输出重点

- 建议步骤
- 每一步的验证方式
- 风险等级
- 是否需要先做额外 recall

### 当前回归断言

- `fixtures/forecast-regression/.memory` 提供固定 recall 背景
- `regression:forecast` 验证 steps 数量、`recommendedFocusPath`、`followUpCommands`
- telemetry 必须保持 `nextCommandHint = /hippo:reflect`
- 当 `targetExposure = focused` 时，当前 runtime 合同记录 `exposureTrace = ["focused"]`

## 4. `/hippo:reflect`

### 目标

回放执行路径，识别偏差、有效判断和误导信号。

### 输入草案

```ts
{
  sessionEvents: string[];
  outcome: string;
  anomalies?: string[];
  lessons?: string[];
  timeRange?: string;
  priorForecast?: ForecastPlan;
}
```

### 默认读取边界

- forecast 结果
- 会话事件
- 相关 episodic 记录

### 默认写入边界

- `.memory/episodic/`
- 长期知识候选摘要

### 输出重点

- 原计划与实际偏差
- 正确判断依据
- 误导线索
- 可复用经验

### 当前回归断言

- `fixtures/reflect-regression/.memory` 只提供稳定的读取背景
- `regression:reflect` 验证 `deviations`、`confirmedSignals`、`misleadingSignals`
- reflect 默认只新增 `.memory/episodic/` 条目，不直接写长期层
- telemetry 必须保持 `nextCommandHint = /hippo:sleep` 且 `exposureTrace = ["summary"]`

## 5. `/hippo:sleep`

### 目标

将当前任务压缩成更高信号的记忆候选，为后续 deep-sleep 做准备。

### 输入草案

```ts
{
  summary: string;
  touchedFiles: string[];
  validation: string[];
  tags?: string[];
  exposureLevel?: "summary" | "focused" | "full";
  signalStrength?: "low" | "medium" | "high";
}
```

### 默认读取边界

- reflect 结果
- 当前任务的 episodic 记录
- 项目规则层与相关 memory 摘要

### 默认写入边界

- `.memory/episodic/`
- 候选 decision / pattern / incident 摘要

### 输出重点

- 是否值得晋升为长期知识
- 候选层归属
- 需要在后续 `deep-sleep` 中确认的内容

### 当前回归断言

- `fixtures/sleep-regression/.memory` 提供候选层语义背景
- `regression:sleep` 验证 `candidateLayers` 是否覆盖 `episodic`、`incident`、`decision`、`module`、`pattern`
- 当 `signalStrength = high` 且存在 validation 时，当前 runtime 合同要求 `promoteToLongTerm = true`
- telemetry 必须保持 `nextCommandHint = /hippo:deep-sleep`

## 6. 扩展命令

以下命令中，只有未单列输入输出合同的命令仍处于协议阶段：

### `/hippo:associate`

在 recall 结果基础上做关系扩散，寻找关联决策、事故与模式。

### `/hippo:active-recall`

在大范围修改、迁移或设计前，强制执行一次更主动的 recall。

### `/hippo:deep-sleep`

把已验证的候选知识沉淀到长期层，并同步更新 graph。

#### 输入草案

```ts
{
  summary: string;
  touchedFiles: string[];
  validation: string[];
  candidateLayers: MemoryLayer[];
  sourceEpisodicId?: string;
  tags?: string[];
  exposureLevel?: "summary" | "focused" | "full";
  signalStrength?: "low" | "medium" | "high";
}
```

#### 当前最小运行时边界

- 只接受 `decision`、`incident`、`pattern`、`module` 作为长期层晋升目标
- `validation` 不能为空
- `signalStrength = low` 时默认不晋升
- 如提供 `sourceEpisodicId`，会把源 episodic 候选与晋升结果写入 graph 关系

#### 当前回归断言

- `regression:deep-sleep` 先执行 `sleep` 生成候选，再执行 `deep-sleep`
- 必须新增长期层条目，并返回 `promotedLayers`、`promotedEntryIds`
- 必须返回 `graphUpdated = true`
- telemetry 必须保持 `nextCommandHint = /hippo:status`
- `regression:deep-sleep-partial` 会验证拒绝路径：当 `validation` 为空或 `signalStrength = low` 时，必须返回 `status = "partial"`、保留 `skippedReasons`、返回 `graphUpdated = false`，且不得写入长期层或 graph

### `/hippo:project-onboard`

建立或刷新项目画像、当前焦点与模块地图。

### 当前最小实现

- 写入 `.memory/project-profile.md`
- 写入 `.memory/current-focus.md`
- upsert `project-profile` / `current-focus` 基础 graph 节点与关联边
- 不扫描代码库，不自动生成模块地图
- telemetry 默认返回 `nextCommandHint = /hippo:recall`

### `/hippo:prune`

清理重复、过时、低价值记忆。

### `/hippo:status`

查看当前记忆系统的健康状态、覆盖度和待处理候选。

### 当前最小实现

- 只读 `.memory` 与 `associative-graph.json`
- 汇总各层条目数量、graph 节点/边数量、候选积压与最近 episodic id
- 不写入任何长期层或 episodic
- 当前 runtime 默认在存在候选积压时返回 `nextCommandHint = /hippo:deep-sleep`，否则返回 `/hippo:recall`

## 7. 技能映射约定

命令协议是共享抽象，宿主可通过 skills / hooks 映射这些命令。

映射约束：

- Claude 侧从 `.claude/skills/hippo/` 与 `.claude/hooks/` 承接
- Codex 侧从 `.codex/skills/hippo/` 与 `.codex/hooks/` 承接
- 不允许在宿主侧重新定义新的命令语义

## 8. 渐进式暴露规则

- `summary`：默认层，仅暴露摘要、关键词和高信号引用
- `focused`：当焦点路径明确时展开相关模块和附近关系
- `full`：仅在需要深挖特定记忆时使用

每次命令都应在 `telemetry` 中记录：

- 当前暴露层
- 暴露轨迹
- 依赖项
- 建议的下一条命令

当前 smoke test 仅覆盖 `summary` 暴露层下的 recall / sleep happy path；`focused`、`full` 的暴露轨迹与 incident 优先排序由 `regression:recall` 基于固定 fixture 继续验证。`project-onboard`、`forecast`、`reflect`、`sleep`、`status`、`deep-sleep` 的结构化输出、写入边界、状态汇总、长期层晋升与 follow-up telemetry 由 `regression:runtime` 及其单命令入口继续验证；其余扩展命令仍保留到后续阶段。
