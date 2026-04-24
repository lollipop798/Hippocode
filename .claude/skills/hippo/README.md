# Hippocode Claude Skills Template

本目录用于承载 Claude Code 下的 Hippocode 命令族说明与技能模板。

它的职责不是实现真实命令执行器，而是帮助后续接线者回答三件事：

- `/hippo:` 命令在 Claude host 中应该如何被理解
- 它们适合在什么上下文下被提示或调用
- 哪些步骤仍需要人工把技能描述连接到真实 CLI / 脚本

## 建议职责边界

- 技能层负责：
  - 向 Claude 描述命令语义
  - 约束输入上下文
  - 统一输出包裹结构的阅读方式
  - 提示下一条最合理的 `/hippo:` 命令
- 技能层不负责：
  - 直接实现长期记忆写入
  - 假设宿主已经有可执行 hook
  - 伪造自动化成功状态

## 推荐的命令分组

### 1. 启动与召回

- `/hippo:recall`
  - 默认入口
  - 读取摘要层，优先回答“现在最值得知道什么”
- `/hippo:associate`
  - 当 recall 结果过窄时补充关系召回
- `/hippo:active-recall`
  - 当准备实施改动时，用问题驱动方式检查记忆缺口

适合场景：

- 刚进入仓库
- 切换模块
- 对当前目录很陌生

### 2. 预判与状态

- `/hippo:forecast`
  - 在行动前预测依赖、风险与下一步
- `/hippo:status`
  - 查看当前记忆状态、覆盖情况与推荐操作
- `/hippo:project-onboard`
  - 为新项目建立初始骨架和观察视角

适合场景：

- 开始复杂任务前
- 准备调用高影响工具前
- 接入新仓库或新宿主前

### 3. 反思与沉淀

- `/hippo:reflect`
  - 记录偏差、依据与经验
- `/hippo:sleep`
  - 把高信号结论写入候选层或情景层
- `/hippo:deep-sleep`
  - 在满足 validation 条件时尝试晋升长期层
- `/hippo:prune`
  - 分析哪些记忆值得清理、合并或降权

适合场景：

- 任务收尾
- 出现预期外问题后
- 周期性维护记忆空间时

## Claude host 下的推荐映射

| Claude 场景 | 推荐命令 | 说明 |
| --- | --- | --- |
| 刚开始一个 session | `/hippo:recall` | 先建立当前任务所需的最小记忆面 |
| 即将做复杂修改 | `/hippo:forecast` | 先看风险、依赖和下一步 |
| 记忆不够用 | `/hippo:associate` | 扩展关联模块与历史线索 |
| 准备动手前自检 | `/hippo:active-recall` | 检查是否遗漏关键约束 |
| 工具执行后总结 | `/hippo:reflect` | 捕捉偏差、有效判断和经验 |
| 会话结束前 | `/hippo:sleep` | 只进入候选沉淀，不默认长期化 |
| 有验证证据时 | `/hippo:deep-sleep` | 人工审核后再考虑晋升 |

## 推荐的技能模板写法

后续如果要把这里扩成真正技能，建议每个命令模板至少包含：

1. 命令目的
2. 允许读取的输入上下文
3. 输出包裹结构说明：
   - `status`
   - `payload.humanReadable`
   - `payload.structured`
   - `telemetry`
4. `telemetry` 最少应关注：
   - `confidence`
   - `exposureLevel`
   - `dependencies`
   - `exposureTrace`
   - `nextCommandHint`
5. 人工确认要求

## 人工接线点

以下内容本目录不会自动完成，必须由接线者补齐：

- 把 README 中的命令说明翻译成 Claude Code 能识别的技能元数据
- 把 `/hippo:*` 实际连接到 `src/cli` 或外部脚本入口
- 统一错误输出与退出码
- 为 `sleep / deep-sleep` 增加人工确认与 validation 检查
- 确认 Claude 输出格式与共享协议包裹结构一致

## 最小验收标准

即使未来只做轻量接线，也建议至少满足以下标准：

- Claude 能清楚区分 recall、forecast、reflect、sleep 的职责
- README 已明确 sessionStart / preTool / postTool / sessionEnd 的建议映射
- 接线者知道哪些步骤是建议自动触发，哪些必须人工确认
- 未实现的自动化能力被明确标记为“待人工接线”，而不是默认可用
