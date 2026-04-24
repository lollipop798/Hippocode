# Codex Hooks 模板

本目录用于描述 Hippocode 在 Codex 宿主中的 hook 接线建议。

当前只提供：

- 推荐的生命周期映射
- 每类 hook 应读写的上下文提示
- 结构化输出约束
- 人工接线提醒

当前**不提供**：

- 可执行 hook 脚本
- 自动注册配置
- 对 Codex 内部生命周期的硬绑定实现

## 推荐事件映射

下面是建议的“轻接线”思路，供人工接入时参考：

| 场景 | 推荐命令 | 目的 |
| --- | --- | --- |
| 开始处理新任务前 | `/hippo:recall` | 先取最小摘要上下文 |
| 已明确目标、准备实施前 | `/hippo:forecast` | 预判相关模块、风险与依赖 |
| 遇到分支判断或遗忘上下文时 | `/hippo:associate` / `/hippo:active-recall` | 拉起联想与关键检查项 |
| 阶段性完成后 | `/hippo:reflect` | 记录偏差、经验和可复用结论 |
| 会话结束或阶段收尾时 | `/hippo:sleep` | 下沉候选层与情景层 |
| 维护周期性整理时 | `/hippo:prune` / `/hippo:deep-sleep` | 做只读清理分析或长期层晋升 |

## 每类 hook 建议携带的输入

人工接线时，建议尽量统一输入字段，避免每个命令各自拼装：

```json
{
  "project": "Hippocode",
  "cwd": "/abs/path/to/repo",
  "task": "实现 Codex host 模板说明",
  "changedFiles": [".codex/README.md"],
  "userConstraints": [
    "只允许修改 .codex/**",
    "不能实现真实自动化 wiring"
  ],
  "host": {
    "name": "codex",
    "surface": "cli-or-desktop"
  }
}
```

推荐最少包含：

- 当前任务摘要
- 当前工作目录
- 用户限定边界
- 已修改文件列表
- 宿主名称与运行表面

## 输出要求

无论由哪个 hook 触发，建议统一回收为以下包裹结构：

```json
{
  "status": "success",
  "payload": {
    "humanReadable": "简明说明",
    "structured": {}
  },
  "telemetry": {
    "confidence": 0.9,
    "exposureLevel": "summary",
    "dependencies": [],
    "exposureTrace": [],
    "nextCommandHint": "/hippo:reflect"
  }
}
```

Codex 侧特别建议：

- 面向界面的信息放进 `humanReadable`
- 面向外层脚本的信息放进 `structured`
- 不要只返回自然语言段落
- 不确定时宁可降级为 `partial`，也不要伪造高置信结果

## 人工接线清单

接入本目录时，维护者通常仍需手工完成以下动作：

- 选择 Codex 哪些节点需要主动触发 Hippocode
- 决定触发命令是调用 CLI、Node API 还是外层包装脚本
- 决定输出写回聊天界面、日志文件还是项目 `.memory` 辅助文件
- 决定失败时是否允许静默跳过，还是必须提醒人工确认
- 确认写入型命令是否需要额外 validation gate

## 建议的最小策略

如果团队只想先落地最轻版本，建议按下面顺序手工接线：

1. 任务开始前手动触发 `/hippo:recall`
2. 实施前按需触发 `/hippo:forecast`
3. 收尾时手动触发 `/hippo:reflect`
4. 会话结束时按需触发 `/hippo:sleep`

这样可以先验证命令语义和输出结构是否稳定，再决定是否值得继续做更深的宿主自动化。
