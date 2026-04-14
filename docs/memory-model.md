# Hippocode 记忆模型

## 1. 设计目标

Hippocode 的记忆模型不是单一 memory 文件，而是一套按职责分层的项目级记忆空间。

这套模型需要同时支持：

- 项目画像
- 主动记忆
- 联想召回
- 渐进式暴露
- 反思
- 睡眠式整合

MVP 阶段只使用文件型存储，不引入图数据库。

## 2. `.memory/` 目录协议

```text
.memory/
├─ project-profile.md
├─ current-focus.md
├─ decisions/
├─ incidents/
├─ patterns/
├─ modules/
├─ episodic/
├─ archives/
└─ associative-graph.json
```

### `project-profile.md`

记录项目身份、架构摘要、长期约束、重要模块与风险地图。

### `current-focus.md`

记录当前阶段目标、近期关注点、未决问题与需要主动 recall 的方向。

### `decisions/`

保存会长期影响未来工作的设计决策。

### `incidents/`

保存已确认的事故、异常模式、根因与防再发建议。

### `patterns/`

保存已经被验证可复用的实现模式。

### `modules/`

保存模块职责、边界、依赖关系和典型风险。

### `episodic/`

保存任务级临时经验、执行痕迹、反思结果与睡眠候选。

### `archives/`

保存归档内容或已降级的历史记忆。

### `associative-graph.json`

保存联想召回图谱的轻量文件型快照。

当前仓库已经补入 `decisions`、`incidents`、`patterns`、`modules` 的最小样例条目，并在 graph 快照里建立与 runtime / recall 相关的基线节点和关系，供 recall pipeline 与 smoke test 使用。

## 3. 最小字段模型

本阶段的 schema 仍以 TypeScript 类型为主，但已经补入最小 runtime schema guard，用于约束 `.memory` 与 fixtures 的基础合法性。

长期与候选记忆条目至少需要：

- `id`
- `layer`
- `title`
- `summary`
- `keywords`
- `scope`
- `exposure`
- `createdAt`

可选字段：

- `updatedAt`
- `confidence`
- `tags`
- `references`
- `metadata`

当前 runtime schema guard 至少检查：

- `id`、`layer`、`title`、`summary`、`keywords`、`scope`、`exposure`、`createdAt`
- `updatedAt`、`confidence`、`tags`、`references`、`metadata` 的基础类型
- `layer` 与 `exposure` 是否属于共享协议枚举
- 日期字段是否可被解析为合法 ISO 时间

## 4. 记忆分层语义

### 项目层

项目画像、长期规则、架构与全局约束。

### 决策层

已确认、会影响未来实现与协作方式的设计决策。

### 事故层

高信号问题、已知失效模式、根因与防护策略。

### 模式层

可重复复用的实现方式、测试方式或协作方式。

### 模块层

模块职责、边界、依赖与局部风险。

### 情景层

一次任务中的观察、验证、偏差、经验候选。

### 归档层

保留历史上下文，但默认不参与普通 recall。

## 5. 联想图 schema

`associative-graph.json` 的最小结构如下：

```json
{
  "version": "1",
  "updatedAt": "2026-04-11T00:00:00.000Z",
  "nodes": [],
  "edges": []
}
```

### Node 最小字段

- `id`
- `type`
- `title`
- `summary`
- `keywords`
- `layer`
- `weight`

可选：

- `confidence`
- `lastValidated`
- `metadata`

### Edge 最小字段

- `from`
- `to`
- `type`
- `weight`
- `reason`

当前 runtime schema guard 会校验：

- `nodes` 与 `edges` 是否为数组
- node 的 `type/layer/weight/keywords`
- edge 的 `from/to/type/weight/reason`
- graph 顶层的 `version/updatedAt`

## 6. Recall 与 graph 的关系

Recall engine 默认遵循以下顺序：

1. 从 prompt 或生命周期事件中识别意图
2. 从 `project-profile.md` 与 `current-focus.md` 获取摘要背景
3. 从各记忆目录中拉取候选摘要
4. 从 `associative-graph.json` 做有限扩散
5. 按启发式规则排序
6. 压缩成 `summary` 输出

排序可综合以下信号：

- 节点权重
- 边权重
- 最近验证时间
- confidence
- 与当前 intent 的贴近程度

## 7. 渐进式暴露

默认暴露策略固定为：

- `summary`
- `focused`
- `full`

规则：

- 默认只返回 `summary`
- 只有在 focus path 或显式请求出现时才升级到 `focused`
- `full` 只对少量高价值对象开放
- 每次输出都应记录 `exposureTrace`

## 8. 反思与睡眠整合

`reflect` 和 `sleep` 的职责不同：

- `reflect`
  面向当前任务，识别偏差、有效判断、误导线索
- `sleep`
  面向记忆整合，把执行痕迹压缩成可复用候选

默认策略：

- 先写入 `episodic`
- 候选条目需要进一步验证
- 只有通过 `deep-sleep` 或等价流程，才晋升到长期层
- 当前最小 `deep-sleep` 会把通过验证的候选写入 `decision`、`incident`、`pattern`、`module` 层，并同步更新 `associative-graph.json`

## 9. 模板建议

尽管模板渲染器仍留待后续阶段，本阶段已经落地文件型目录协议、graph 快照与 recall pipeline，因此目录内文件现在就可以先按以下字段草案组织：

- 标题
- 摘要
- 关键词
- 作用域
- 证据或引用
- 创建时间
- 最近验证时间

当前长期层样例条目已按这套字段草案组织，可直接作为后续 schema validator、fixture test 与 host adapter 演示的初始样本。
仓库当前还提供 `npm run validate:memory-schema`，用于遍历仓库根 `.memory` 与 `fixtures/*/.memory` 并验证这些最小字段模型。

## 10. 当前阶段边界

当前已经确定并落地：

- 目录协议
- 类型边界
- graph 最小 schema
- recall / reflect / sleep 的读写边界
- 文件型 memory store 的读写入口
- episodic 写入与 graph 文件 IO
- deep-sleep 的最小长期层晋升与 graph upsert

本轮尚未实现：

- schema runtime validator
- graph 自动生成器
- 复杂 graph 扩散与排序策略
