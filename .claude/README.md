# Claude Host Template

`.claude/` 用于放置 Hippocode 在 Claude Code 宿主中的轻量模板骨架。

当前阶段目标只有两件事：

- 说明 Claude host 下建议如何组织 `/hippo:` 命令与生命周期触发点
- 为后续人工接线预留稳定目录结构

当前阶段明确不做：

- 不实现真实 hook 自动化 wiring
- 不假设 Claude Code 已自动识别本目录
- 不在本目录内固化任何会直接写入长期记忆的自动流程

## 目录职责

- `.claude/hooks/`
  - 保存生命周期 hook 的说明文档、占位模板与人工接线约定
  - 重点描述何时适合触发 `recall / forecast / reflect / sleep`
- `.claude/skills/`
  - 保存 Claude 侧技能目录骨架
  - 重点描述如何把 `/hippo:` 命令映射成可读、可维护的技能入口
- `.claude/skills/hippo/`
  - 保存 Hippocode 命令族的宿主侧说明
  - 聚焦命令语义、推荐触发方式、人工执行边界

## 推荐的 `/hippo:` 命令映射

以下映射强调“命令语义保持共享，宿主包装保持轻量”：

| 命令 | 建议用途 | Claude 侧建议入口 |
| --- | --- | --- |
| `/hippo:recall` | 读取当前任务最相关的项目记忆摘要 | 会话开始、切换任务前手动触发 |
| `/hippo:forecast` | 基于 recall 结果预测风险、依赖与下一步 | 进入复杂改动前手动触发 |
| `/hippo:reflect` | 记录偏差、判断依据与可复用经验 | 任务收尾或关键分叉后手动触发 |
| `/hippo:sleep` | 将本轮高信号结论写入候选层/情景层 | 会话结束前手动触发 |
| `/hippo:associate` | 扩展关联召回，补充相邻模块线索 | recall 信息不足时手动触发 |
| `/hippo:active-recall` | 以问题驱动方式验证记忆缺口 | 实施前自检时手动触发 |
| `/hippo:deep-sleep` | 审核候选层并尝试晋升长期层 | 仅在有 validation 证据时手动触发 |
| `/hippo:prune` | 只读分析哪些记忆适合清理或降权 | 周期性维护时手动触发 |
| `/hippo:project-onboard` | 为新仓库生成初始记忆骨架建议 | 新项目接入时手动触发 |
| `/hippo:status` | 查看记忆层状态、覆盖面与下一步建议 | 日常排查或接线验证时手动触发 |

## 推荐接线原则

- 共享语义来自 `src/core` 与 `docs/`，不要在 `.claude/` 重新定义命令含义
- Claude host 侧只负责“何时提醒触发、如何包装输出、人工在哪里补最后一跳”
- 任何会改写长期层的能力都必须保留人工确认，不应伪装成全自动
- 若宿主能力不足，只保留 README 与占位模板，不制造“已经接通”的假象

## 建议的最小落地方式

1. 先把 `.claude/hooks/README.md` 作为生命周期接线说明书
2. 再把 `.claude/skills/hippo/README.md` 作为 `/hippo:` 命令族说明书
3. 真正接入 Claude Code 时，由人工把 README 中的建议触发点翻译成宿主可执行配置
4. 接线完成前，本目录默认是“文档模板”，不是“可运行插件”

## 人工接线清单

- 确认 Claude Code 当前版本支持哪些 hook 生命周期
- 确认技能目录的发现规则、命名规则与元数据格式
- 把 `/hippo:` 命令实际连接到 CLI 或宿主脚本
- 为 `sleep / deep-sleep` 增加人工确认步骤
- 用一个最小示例仓库验证：
  - 会话开始能看到 recall 建议
  - 工具执行前后能拿到 forecast / reflect 建议
  - 会话结束前只提示 sleep，不自动落库
